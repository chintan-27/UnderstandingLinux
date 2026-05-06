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

## Core Concepts
### ALSA Architecture Overview
ALSA (Advanced Linux Sound Architecture) is not a single monolithic driver but a layered subsystem consisting of:
* **Kernel modules** (`sound/core`, `sound/pcm`, `sound/seq`, `sound/mixer`, `sound/soc`, device‑specific drivers such as `snd-hda-intel`).
* **User‑space library** (`alsa-lib`) providing the API (`snd_pcm_*`, `snd_mixer_*`, `snd_ctl_*`, `snd_seq_*`).
* **Configuration utilities** (`alsactl`, `amixer`, `speaker-test`).

The PCM (Pulse‑Code Modulation) subsystem is the core for audio playback/capture. It exposes **streams** (substreams) that are either playback (`SND_PCM_STREAM_PLAYBACK`) or capture (`SND_PCM_STREAM_CAPTURE`). Each stream has:
* **Hardware parameters** (`snd_pcm_hw_params_t`) – immutable after `hw_params` is applied; describe sample format, rate, channel count, buffer/period sizes.
* **Software parameters** (`snd_pcm_sw_params_t`) – mutable at runtime; control start/stop thresholds, silence filling, polling behavior.
* **Access mode** – determines how the application exchanges data with the kernel:
  * `SND_PCM_ACCESS_RW_INTERLEAVED` – traditional `readi/writei`.
  * `SND_PCM_ACCESS_MMAP_INTERLEAVED` – zero‑copy via `mmap` (preferred for low latency).

#### Why This Layering?
* **Deterministic timing** – hardware parameters are set once, allowing the driver to program DMA buffers and interrupt schedules without reconfiguration.
* **Zero‑copy possibility** – MMAP eliminates a memcpy between user and kernel space, crucial for achieving sub‑10 ms latencies.
* **Extensibility** – MIDI, mixer, and control interfaces share the same device node (`/dev/snd/controlC*`) but expose distinct ioctls.

### PCM Fundamentals – From Signal to Bits
A continuous audio signal \(x(t)\) is sampled at period \(T_s = 1/f_s\) where \(f_s\) is the sample rate (Hz). Each sample is quantized to \(b\) bits (typically 16, 24, or 32). For \(c\) channels, the **frame size** in bytes is:

\[
\text{frame\_bytes} = c \times \frac{b}{8}
\]

The **raw data rate** (bytes/s) is:

\[
R = f_s \times \text{frame\_bytes}
\]

Example: 48 kHz, stereo, 16‑bit → \(R = 48000 \times 2 \times 2 = 192{,}000\) B/s ≈ 188 KB/s.

#### Buffer and Period Mechanics
ALSA does not expose a single huge buffer; instead it splits the kernel DMA buffer into **periods** (also called fragments). Let:
* \(P\) = period size in frames,
* \(N\) = number of periods,
* \(B = P \times N\) = total buffer size in frames.

The **worst‑case latency** (time to fill the buffer) is:

\[
L_{\text{max}} = \frac{B}{f_s} = \frac{P \times N}{f_s}
\]

Choosing small \(P\) and \(N\) reduces latency but increases interrupt frequency. Typical low‑latency settings: \(P = 256\) frames, \(N = 2\) → \(L_{\text{max}} = \frac{512}{48000} \approx 10.7\) ms at 48 kHz.

### Mixer and Control Interface
The mixer (`snd_mixer_*`) operates on **controls** (volume, mute, capture source) exposed via the **control** device (`/dev/snd/controlC*`). Each control has:
* **type** (`SND_CTL_ELEM_TYPE_INTEGER`, `BOOLEAN`, `ENUMERATED`, …),
* **access** flags (`READ`, `WRITE`, `VOLATILE`),
* **value range** (min, max, step).

Applications manipulate controls through `snd_mixer_selem_set_playback_volume_range` etc., which ultimately send an `ioctl(SNDRV_CTL_IOCTL_ELEM_*)` to the kernel. This separation allows volume changes without touching the PCM stream – important for per‑application volume (via PulseAudio/PipeWire) or hardware‑muted inputs.

## How It Works
### Kernel‑User Interaction Flow
```text
+-------------------+      ioctl/mmap      +-------------------+
|  Application      | <----------------> |  ALSA lib (alsa-lib)|
| (alsa-lib API)    |                      +-------------------+
+-------------------+                        |
        |                                    |
        |  open/close, hw_params, sw_params |
        v                                    v
+-------------------+      driver ops      +-------------------+
|  PCM Core (sound/ | <----------------> |  HD Audio / USB   |
|  pcm)             |   (snd_pcm_ops)    |  Audio Driver     |
+-------------------+                      +-------------------+
        |                                    |
        |  DMA interrupt (period elapsed)    |
        v                                    v
+-------------------+      IRQ handler    +-------------------+
|  Sound Card HW    | <----------------> |  ALSA PCM Subsystem|
| (DMA buffers)     |   (period complete) | (wake up poll)    |
+-------------------+                      +-------------------+
```

#### Step‑by‑Step Procedure (Playback)
1. **Device selection** – Open a PCM handle with `snd_pcm_open(&pcm, "hw:0,0", SND_PCM_STREAM_PLAYBACK, 0)`.  
   The string `"hw:0,0"` bypasses plugins and talks directly to card 0, device 0.
2. **Hardware parameter setup** – Allocate `hw_params`, initialize with any configuration, then constrain:
   ```c
   snd_pcm_hw_params_set_rate_near(pcm, hw_params, &rate, &dir);
   snd_pcm_hw_params_set_format(pcm, hw_params, SND_PCM_FORMAT_S24_LE);
   snd_pcm_hw_params_set_channels(pcm, hw_params, 2);
   snd_pcm_hw_params_set_period_size_near(pcm, hw_params, &period_frames, &dir);
   snd_pcm_hw_params_set_buffer_size_near(pcm, hw_params, &buffer_frames, &dir);
   snd_pcm_hw_params(pcm, hw_params);   // applies and locks HW params
   ```
   The driver may adjust values to match hardware capabilities; `_near` returns the actual value set.
3. **Software parameter setup** – Define start/stop thresholds and silence filling:
   ```c
   snd_pcm_sw_params_malloc(&sw_params);
   snd_pcm_sw_params_current(pcm, sw_params);
   snd_pcm_sw_params_set_start_threshold(pcm, sw_params, buffer_frames - period_frames);
   snd_pcm_sw_params_set_stop_threshold(pcm, sw_params, buffer_frames);
   snd_pcm_sw_params_set_silence_size(pcm, sw_params, 0);
   snd_pcm_sw_params(pcm, sw_params);
   snd_pcm_sw_params_free(sw_params);
   ```
   The **start threshold** tells ALSA when to begin DMA transmission after `snd_pcm_prepare`; setting it to `buffer‑period` ensures we start as soon as there is enough data to avoid underrun.
4. **Prepare the stream** – `snd_pcm_prepare(pcm)` resets the hardware pointer and applies SW params.
5. **Data transfer** – Two common paths:
   * **Blocking RW** – Loop: `snd_pcm_writei(pcm, buf, frames)` (or `readi` for capture). The call blocks until the requested frames have been copied into the kernel buffer.
   * **MMAP** – After `snd_pcm_mmap_begin(pcm, &area, &offset, &frames)`, the application writes directly into the memory‑mapped area, then calls `snd_pcm_mmap_commit(pcm, offset, frames, 0)`. This eliminates a memcpy and lets the application schedule writes based on `poll()`/`select()` on the file descriptor returned by `snd_pcm_poll_descriptors`.
6. **Drain/Close** – For playback, `snd_pcm_drain(pcm)` waits until the buffer empties; then `snd_pcm_close(pcm)` releases resources.

### Interrupt Timing and XRUN Recovery
When the DMA controller finishes transferring a period, it raises an interrupt. The ALSA PCM core updates the **application pointer** (`appl_ptr`) and **hardware pointer** (`hw_ptr`). If the application fails to consume/produce data fast enough, `hw_ptr` laps `appl_ptr` → an **XRUN** (underrun for playback, overrun for capture). The PCM core returns `-EPIPE` from `readi/writei`. Recovery:
```c
if (snd_pcm_state(pcm) == SND_PCM_STATE_XRUN) {
    snd_pcm_prepare(pcm);   // reset pointers
    // optionally re‑apply sw_params
}
```
Understanding this loop is essential for real‑time audio; deterministic scheduling (e.g., `SCHED_FIFO` priority) reduces the chance of missing the interrupt deadline.

## Worked Examples
### Example 1: Low‑Latency Playback (MMAP, 48 kHz, S24_LE, 2 ch)
```c
/* playback_mmap.c
 * Compile: gcc -lasound -Wall -O2 playback_mmap.c -o playback_mmap
 */
#include <alsa/asoundlib.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>

#define SAMPLE_RATE 48000
#define FORMAT      SND_PCM_FORMAT_S24_LE
#define CHANNELS    2
#define PERIOD_FRAMES 256   // frames per period
#define BUFFER_FRAMES (PERIOD_FRAMES * 2) // double buffering

static void die(const char *msg)
{
    fprintf(stderr, "%s: %s\n", msg, snd_strerror(errno));
    exit(EXIT_FAILURE);
}

int main(void)
{
    snd_pcm_t *pcm;
    snd_pcm_hw_params_t *hw_params;
    snd_pcm_sw_params_t *sw_params;
    snd_pcm_uframes_t period_size = PERIOD_FRAMES;
    snd_pcm_uframes_t buffer_size = BUFFER_FRAMES;
    int dir = 0; // snd_pcm_hw_params_*_near direction ignored here

    /* 1. Open PCM device in mmap mode */
    if (snd_pcm_open(&pcm, "hw:0,0", SND_PCM_STREAM_PLAYBACK, 0) < 0)
        die("snd_pcm_open");

    /* 2. Allocate and init HW params */
    snd_pcm_hw_params_malloc(&hw_params);
    snd_pcm_hw_params_any(pcm, hw_params);

    /* 3. Set HW constraints */
    snd_pcm_hw_params_set_access(pcm, hw_params,
                                 SND_PCM_ACCESS_MMAP_INTERLEAVED);
    snd_pcm_hw_params_set_format(pcm, hw_params, FORMAT);
    snd_pcm_hw_params_set_rate_near(pcm, hw_params, &SAMPLE_RATE, &dir);
    snd_pcm_hw_params_set_channels(pcm, hw_params, CHANNELS);
    snd_pcm_hw_params_set_period_size_near(pcm, hw_params, &period_size, &dir);
    snd_pcm_hw_params_set_buffer_size_near(pcm, hw_params, &buffer_size, &dir);

    if (snd_pcm_hw_params(pcm, hw_params) < 0)
        die("snd_pcm_hw_params");
    snd_pcm_hw_params_free(hw_params);

    /* 4. SW params – start as soon as we have one period of data */
    snd_pcm_sw_params_malloc(&sw_params);
    snd_pcm_sw_params_current(pcm, sw_params);
    snd_pcm_sw_params_set_start_threshold(pcm, sw_params,
                                          buffer_size - period_size);
    snd_pcm_sw_params_set_stop_threshold(pcm, sw_params, buffer_size);
    snd_pcm_sw_params_set_silence_size(pcm, sw_params, 0);
    snd_pcm_sw_params(pcm, sw_params);
    snd_pcm_sw_params_free(sw_params);

    /* 5. Prepare device */
    if (snd_pcm_prepare(pcm) < 0)
        die("snd_pcm_prepare");

    /* 6. MMAP the buffer */
    snd_pcm_channel_area_t *areas;
    snd_pcm_mmap_channels(pcm, &areas);
    if (!areas)
        die("snd_pcm_mmap_channels");

    /* 7. Fill buffer with a simple sine wave (440 Hz) */
    const double freq = 440.0;
    const double twopi = 6.283185307179586;
    double phase = 0.0;
    const double phase_inc = twopi * freq / SAMPLE_RATE;

    for (snd_pcm_uframes_t frame = 0; frame < buffer_size; ++frame) {
        int32_t sample = (int32_t)(0x7FFFFF * sin(phase)); // 24‑bit signed
        phase += phase_inc;
        if (phase > twopi) phase -= twopi;

        for (int ch = 0; ch < CHANNELS; ++ch) {
            /* areas[ch].addr points to the start of channel ch's buffer */
            int8_t *ptr = (int8_t *)areas[ch].addr +
                          areas[ch].first + areas[ch].step * frame;
            /* store 24‑bit little‑endian */
            ptr[0] = sample & 0xFF;
            ptr[1] = (sample >> 8) & 0xFF;
            ptr[2] = (sample >> 16) & 0xFF;
        }
    }

    /* 8. Commit the filled buffer */
    if (snd_pcm_mmap_commit(pcm, 0, areas, buffer_size) < 0)
        die("snd_pcm_mmap_commit");

    /* 9. Start the stream */
    if (snd_pcm_start(pcm) < 0)
        die("snd_pcm_start");

    /* 10. Let it play for 5 seconds, then drain */
    sleep(5);
    if (snd_pcm_drain(pcm) < 0)
        die("snd_pcm_drain");
    snd_pcm_close(pcm);
    return 0;
}
```
**Explanation of numbers**
* Frame size = 2 ch × 24 bit/8 = 6 bytes.
* Buffer size = 512 frames × 6 B = 3072 B.
* Latency = 512 / 48000 ≈ 10.7 ms (worst case).
* The program writes a full buffer upfront, then relies on the hardware to consume it while the application sleeps; the MMAP commit ensures the kernel sees the data immediately.

### Example 2: Capture to WAV File (Blocking RW, 44.1 kHz, S16_LE, mono)
```c
/* capture_wav.c
 * Compile: gcc -lasound -Wall -O2 capture_wav.c -o capture_wav
 */
#include <alsa/asoundlib.h>
#include <stdio.h>
#include <stdint.h>
#include <unistd.h>
#include <fcntl.h>
#include <string.h>

#define SAMPLE_RATE 44100
#define FORMAT      SND_PCM_FORMAT_S16_LE
#define CHANNELS    1
#define PERIOD_SIZE 1024   // frames
#define BUFFER_SIZE (PERIOD_SIZE * 2)
#define DURATION_SEC 10

/* Simple WAV header writer */
static void wav_header(int fd, uint32_t data_len)
{
    uint8_t hdr[44] = {0};
    memcpy(hdr, "RIFF", 4);
    uint32_t chunk_size = 36 + data_len;
    memcpy(hdr+4, &chunk_size, 4);
    memcpy(hdr+8, "WAVE", 4);
    memcpy(hdr+12, "fmt ", 4);
    uint32_t subchunk1 = 16;
    memcpy(hdr+16, &subchunk1, 4);
    uint16_t audio_fmt = 1; // PCM
    memcpy(hdr+20, &audio_fmt, 2);
    memcpy(hdr+22, &CHANNELS, 2);
    memcpy(hdr+24, &SAMPLE_RATE, 4);
    uint32_t byte_rate = SAMPLE_RATE * CHANNELS * 2;
    memcpy(hdr+28, &byte_rate, 4);
    uint16_t block_align = CHANNELS * 2;
    memcpy(hdr+30, &block_align, 2);
    uint16_t bits_per_sample = 16;
    memcpy(hdr+32, &bits_per_sample, 2);
    memcpy(hdr+36, "data", 4);
    memcpy(hdr+40, &data_len, 4);
    pwrite(fd, hdr, sizeof(hdr), 0);
}

int main(void)
{
    snd_pcm_t *pcm;
    snd_pcm_hw_params_t *hw_params;
    snd_pcm_uframes_t period = PERIOD_SIZE;
    snd_pcm_uframes_t buffer = BUFFER_SIZE;
    int dir = 0;
    size_t frame_bytes = CHANNELS * snd_pcm_format_physical_width(FORMAT) / 8;
    size_t bytes_per_period = period * frame_bytes;
    size_t total_bytes = DURATION_SEC * SAMPLE_RATE * frame_bytes;
    int wav_fd = open("capture.wav", O_WRONLY|O_CREAT|O_TRUNC, 0644);
    if (wav_fd < 0) {
        perror("open wav");
        return 1;
    }

    /* Open capture device */
    if (snd_pcm_open(&pcm, "hw:0,0", SND_PCM_STREAM_CAPTURE, 0) < 0) {
        fprintf(stderr, "snd_pcm_open: %s\n", snd_strerror(errno));
        return 1;
    }

    /* HW params */
    snd_pcm_hw_params_malloc(&hw_params);
    snd_pcm_hw_params_any(pcm, hw_params);
    snd_pcm_hw_params_set_access(pcm, hw_params,
                                 SND_PCM_ACCESS_RW_INTERLEAVED);
    snd_pcm_hw_params_set_format(pcm, hw_params, FORMAT);
    snd_pcm_hw_params_set_rate_near(pcm, hw_params, &SAMPLE_RATE, &dir);
    snd_pcm_hw_params_set_channels(pcm, hw_params, CHANNELS);
    snd_pcm_hw_params_set_period_size_near(pcm, hw_params, &period, &dir);
    snd_pcm_hw_params_set_buffer_size_near(pcm, hw_params, &buffer, &dir);
    if (snd_pcm_hw_params(pcm, hw_params) < 0) {
        fprintf(stderr, "snd_pcm_hw_params: %s\n", snd_strerror(errno));
        return 1;
    }
    snd_pcm_hw_params_free(hw_params);

    if (snd_pcm_prepare(pcm) < 0) {
        fprintf(stderr, "snd_pcm_prepare: %s\n", snd_strerror(errno));
        return 1;
    }

    /* Write WAV header placeholder (will be overwritten later) */
    uint8_t dummy[44] = {0};
    write(wav_fd, dummy, sizeof(dummy));

    /* Capture loop */
    size_t captured = 0;
    int8_t *buf = malloc(bytes_per_period);
    while (captured < total_bytes) {
        ssize_t r = snd_pcm_readi(pcm, buf, period);
        if (r == -EPIPE) {   /* underrun */
            fprintf(stderr, "XRUN, recovering...\n");
            snd_pcm_prepare(pcm);
            continue;
        }
        if (r < 0) {
            fprintf(stderr, "read error: %s\n", snd_strerror(-r));
            break;
        }
        if (r > 0) {
            size_t to_write = r * frame_bytes;
            if (write(wav_fd, buf, to_write) != (ssize_t)to_write) {
                perror("write wav");
                break;
            }
            captured += to_write;
        }
    }
    free(buf);
    snd_pcm_drain(pcm);
    snd_pcm_close(pcm);

    /* Fix WAV header with actual data length */
    lseek(wav_fd, 0, SEEK_SET);
    wav_header(wav_fd, captured);
    close(wav_fd);
    printf("Captured %zu bytes (%zu seconds) to capture.wav\n",
           captured, captured / (SAMPLE_RATE * frame_bytes));
    return 0;
}
```
**Key points**
* Uses **blocking RW** (`readi`) for simplicity; each call blocks until a full period is captured.
* Handles **XRUN** (`-EPIPE`) by preparing the stream again.
* Writes a proper **RIFF/WAV** header after capture, demonstrating the relationship between sample rate, byte rate, and data length.

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Setting HW params after SW params** | SW params depend on the buffer size and period size fixed by HW params; changing HW params later invalidates SW params, leading to `EINVAL` or undefined behavior. | Always complete **all** HW param calls (`snd_pcm_hw_params_*`) *before* allocating or setting SW params. |
| 2 | **Using `SND_PCM_ACCESS_RW_INTERLEAVED` with a non‑multiple‑of‑frame‑size buffer** | The ALSA driver expects each `readi/writei` call to transfer an integer number of frames; passing a buffer size not divisible by `frame_bytes` causes `-EINVAL`. | Allocate buffers as `n * frame_bytes` where `n` is the number of frames you intend to transfer. |
| 3 | **Neglecting to call `snd_pcm_drain` before closing a playback stream** | The DMA may still be transmitting data; closing early truncates the audio and can leave the hardware in an undefined state, causing audible clicks. | Call `snd_pcm_drain(pcm)` (or `snd_pcm_drop` if you want to discard) before `snd_pcm_close`. |
| 4 | **Assuming `"default"` always points to a usable hardware device** | `"default"` is resolved via ALSA’s plugin layer (`/usr/share/alsa/alsa.conf`); on minimal systems it may map to a null plugin, resulting in silent failures. | Explicitly query available cards (`aplay -L` or `cat /proc/asound/cards
