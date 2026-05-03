---
id: 133
title: "Audio drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Sound hardware is one of the few kernel subsystems where latency violations are immediately perceptible. A network driver that stalls for 5 ms causes a retransmit; an audio driver that stalls for 5 ms causes a click you can hear. The DMA engine feeding a DAC does not pause — it reads from the ring buffer regardless of whether the CPU has written fresh samples. When it laps the write pointer, you get a *buffer underrun*: the hardware plays stale or zeroed samples, producing an audible artifact that cannot be recovered.

ALSA imposes structure on this problem. Rather than every driver implementing its own ring-buffer management and `/dev/` interface, ALSA defines the contracts: how a driver registers hardware capabilities, how the PCM engine manages the shared DMA buffer, how mixer controls reach userspace. Understanding ALSA means understanding why each layer exists and what failure mode it prevents.

---

## Core Concepts

### The Card Model

ALSA's fundamental abstraction is the *card*: a struct representing a physical or virtual piece of audio hardware. A card owns:

- One or more **PCM devices** (e.g., a primary stereo output and a separate HDMI output)
- **Mixer controls** exposed via `/dev/snd/controlC<N>`
- Optional MIDI and timer interfaces

This hierarchy matters because it defines namespace isolation. PCM device 0 on card 0 is `/dev/snd/pcmC0D0p` (playback) or `/dev/snd/pcmC0D0c` (capture). The `C<N>D<M>` scheme is not cosmetic — it is how ALSA routes `snd_pcm_open()` calls to the correct `snd_pcm_ops` table.

Drivers register with:

```c
snd_card_new(&pci->dev, index, id, THIS_MODULE, sizeof(struct my_chip), &card);
```

The `sizeof(struct my_chip)` argument allocates driver-private data inside the card object itself, retrieved later with `card->private_data`. This avoids a separate allocation and ties the lifetime of the private data to the card's `kref`.

### PCM: The Math Behind the Stream

PCM audio is uniform quantization in time and amplitude. Given sample rate $f_s$, bit depth $b$, and channel count $c$, the raw throughput is:

$$R = f_s \cdot \frac{b}{8} \cdot c \quad \text{(bytes/second)}$$

Common configurations:

| Format | $f_s$ | $b$ | $c$ | $R$ |
|---|---|---|---|---|
| CD | 44,100 Hz | 16 | 2 | 176,400 B/s |
| DVD audio | 96,000 Hz | 24 | 6 | 1,728,000 B/s |
| Studio | 192,000 Hz | 32 | 2 | 1,536,000 B/s |

This throughput must be *sustained*, not bursty. The driver's only job on the fast path is to keep the DMA engine's read pointer behind the write pointer.

A *frame* is one sample per channel — the atomic unit ALSA counts positions in. The byte offset of frame $n$ in a buffer is:

$$\text{offset}(n) = n \cdot \frac{b}{8} \cdot c$$

ALSA's `snd_pcm_uframes_t` type counts frames, not bytes. Confusing the two is a common source of buffer sizing bugs.

### Ring Buffer Geometry and Period Interrupts

The ring buffer is a single contiguous DMA-capable allocation. The hardware DMA engine has a *head pointer* (where it is reading/writing) and wraps automatically. ALSA and the driver track positions in units of frames.

The buffer is divided into *periods*. After completing each period, the DMA engine fires an interrupt. The interrupt handler calls `snd_pcm_period_elapsed()`, which advances ALSA's internal position counter and wakes any thread blocked in `poll()` or `snd_pcm_wait()`.

The fundamental relationships:

$$\text{buffer\_frames} = \text{period\_frames} \times \text{period\_count}$$

$$\text{latency} = \frac{\text{period\_frames}}{f_s} \quad \text{(seconds)}$$

$$\text{interrupt\_rate} = \frac{f_s}{\text{period\_frames}} \quad \text{(Hz)}$$

For a 48 kHz stream with 256-frame periods:

$$\text{latency} = \frac{256}{48000} \approx 5.3\,\text{ms}, \qquad \text{interrupt\_rate} = \frac{48000}{256} = 187.5\,\text{Hz}$$

Halving the period halves latency but doubles interrupt rate — a real CPU cost. Low-latency audio systems (e.g., JACK with 64-frame periods) can generate >700 interrupts/second per stream, which is why RT-preempt and IRQ affinity matter there.

The ring buffer's byte size is important for DMA descriptor programming:

$$\text{buffer\_bytes} = \text{buffer\_frames} \cdot \frac{b}{8} \cdot c$$

If the hardware's DMA engine requires power-of-two buffer sizes, you must enforce this as a constraint in `hw_params` — ALSA will not enforce hardware-specific alignment for you.

### DMA Coherency: Why It Is Not Automatic

DMA bypasses the CPU's cache hierarchy. On a system with a write-back cache:

- **Playback path**: CPU writes samples to a cache line → cache line is *dirty* → DMA engine reads physical memory → reads *stale* data. Fix: flush the cache line to memory before handing off to DMA (`dma_sync_single_for_device`).
- **Capture path**: DMA engine writes samples to physical memory → CPU reads from cache → reads *stale* pre-DMA data. Fix: invalidate the cache line before the CPU reads (`dma_sync_single_for_cpu`).

ALSA's PCM layer solves this by using **coherent DMA allocation** (`dma_alloc_coherent`) for the ring buffer. On x86, coherent means the mapping is marked `PAT_UNCACHED`; on ARM, it maps through the non-cacheable alias. The CPU always reads/writes physical memory directly, so hardware and software always agree — at the cost of slower CPU access per sample (no cache benefit).

```c
/* ALSA pre-allocates this for you via: */
snd_pcm_lib_preallocate_pages_for_all(pcm,
    SNDRV_DMA_TYPE_DEV,
    &pci->dev,
    64 * 1024,    /* default size */
    512 * 1024);  /* maximum size */
```

The `SNDRV_DMA_TYPE_DEV` type selects `dma_alloc_coherent` under the hood. The pre-allocation happens at driver load time to avoid allocation failures later when `hw_params` is called under time pressure.

### Mixer Controls

Mixer controls are independent of the PCM stream — they represent hardware register knobs (volume attenuation, mux routing, gain stages). Each control element has three callbacks:

- `info`: reports the control's type (`INTEGER`, `BOOLEAN`, `ENUMERATED`) and range
- `get`: reads current hardware state into `snd_ctl_elem_value`
- `put`: writes new state to hardware, returns 1 if the value changed (triggers a change notification to userspace)

The `put` callback returning 1 vs 0 is not optional: it gates `SNDRV_CTL_EVENT_MASK_VALUE` notifications to any process that called `ioctl(SNDRV_CTL_IOCTL_SUBSCRIBE_EVENTS)`. If you always return 1, userspace gets spurious notifications on every `amixer set` call even when the value didn't change. If you always return 0, UIs like PulseAudio never learn the value changed.

---

## How It Works

### Registering a PCM Device

```c
#include <sound/core.h>
#include <sound/pcm.h>

static const struct snd_pcm_ops my_pcm_ops = {
    .open       = my_pcm_open,
    .close      = my_pcm_close,
    .ioctl      = snd_pcm_lib_ioctl,   /* handles standard queries */
    .hw_params  = my_hw_params,
    .hw_free    = my_hw_free,
    .prepare    = my_prepare,
    .trigger    = my_trigger,
    .pointer    = my_pointer,
};

static int my_probe(struct pci_dev *pci, const struct pci_device_id *id)
{
    struct snd_card *card;
    struct snd_pcm  *pcm;
    int err;

    err = snd_card_new(&pci->dev, -1, NULL, THIS_MODULE,
                       sizeof(struct my_chip), &card);
    if (err < 0)
        return err;

    err = snd_pcm_new(card, "MyChip PCM", 0,
                      1,    /* playback substreams */
                      1,    /* capture substreams  */
                      &pcm);
    if (err < 0)
        goto free_card;

    snd_pcm_set_ops(pcm, SNDRV_PCM_STREAM_PLAYBACK, &my_pcm_ops);
    snd_pcm_set_ops(pcm, SNDRV_PCM_STREAM_CAPTURE,  &my_pcm_ops);

    snd_pcm_lib_preallocate_pages_for_all(pcm,
        SNDRV_DMA_TYPE_DEV, &pci->dev,
        64 * 1024, 512 * 1024);

    strscpy(card->driver,    "my_driver",     sizeof(card->driver));
    strscpy(card->shortname, "My Audio Card", sizeof(
