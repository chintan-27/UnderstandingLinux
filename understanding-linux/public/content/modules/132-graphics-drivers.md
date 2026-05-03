---
id: 132
title: "Graphics drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A GPU continuously reads video memory and drives electrical signals to your monitor at a rate dictated by the display's timing requirements — typically every 16.67 ms at 60 Hz. The kernel must arbitrate which process writes to that memory, ensure display-hardware register writes are sequenced correctly, and synchronize buffer swaps with the hardware scanning interval. Without that arbitration, two rendering clients corrupt each other's output; without sequencing, a half-applied mode-switch drives undefined signals to the panel; without VBlank synchronization, the display controller reads a buffer mid-write and tears the image.

`fbdev` exposed a memory-mapped window into video RAM and nothing else. It had no locking model, no hardware compositing, no notion of the vertical blanking interval, and mode changes were userspace's problem — the X server wrote hardware registers directly. That approach broke virtual consoles, made GPU sharing impossible, and prevented safe mode-switching during early boot. DRM and KMS were the kernel's answer: one subsystem owns the hardware and everyone else asks it nicely.

---

## Core Concepts

### The Framebuffer: Memory as Pixels

The display controller's job is a DMA loop: it reads a region of GPU-accessible memory at the pixel clock rate and serializes it to the output signal. For a display of width $W$, height $H$, and $B$ bytes per pixel, the minimum buffer size is:

$$\text{size} = W \times H \times B$$

For 1920×1080 at 32 bits per pixel:

$$\text{size} = 1920 \times 1080 \times 4 = 8{,}294{,}400 \text{ bytes} \approx 7.9 \text{ MiB}$$

GPU memory controllers require rows to be aligned to a hardware-specific boundary $A$ (commonly 64–256 bytes) because the memory subsystem fetches data in fixed-width bursts. A row that straddles a burst boundary would require two fetches where one would suffice. The aligned row stride (pitch) is:

$$\text{pitch} = \left\lceil \frac{W \times B}{A} \right\rceil \times A$$

For 1920 × 4 = 7680 bytes with $A = 256$:

$$\text{pitch} = \left\lceil \frac{7680}{256} \right\rceil \times 256 = 30 \times 256 = 7680 \text{ bytes}$$

This happens to divide evenly; for $W = 1366$ (a common laptop resolution), $1366 \times 4 = 5464$, so $\lceil 5464/256 \rceil \times 256 = 22 \times 256 = 5632$ bytes — 168 bytes of padding per row. The pixel at column $x$, row $y$ is therefore at byte offset:

$$\text{offset}(x, y) = y \times \text{pitch} + x \times B$$

`fbdev` exposes exactly this model through `/dev/fb0`. The limitation is not the memory layout — it is that `fbdev` has no model for *who* owns the buffer, when it is safe to swap, or what hardware is compositing multiple sources before the final scan-out.

### DRM: Kernel Arbitration of the GPU

DRM applies the same principle as a filesystem: the kernel owns the hardware, userspace submits requests through a controlled interface. The two device nodes have deliberately different privilege levels:

- `/dev/dri/card0` — requires `CAP_SYS_ADMIN` or group membership in `video`; used for mode-setting and display control.
- `/dev/dri/renderD128` — unprivileged; used for GPU compute and rendering without display access.

The split exists because rendering (submitting GPU commands, allocating VRAM) is a resource-consumption problem that can be sandboxed, while mode-setting (reconfiguring hardware that drives all outputs) is a system-wide operation. One process holds the DRM *master* lease on `card0` at a time — typically the Wayland compositor or X server — and is the only one that may reconfigure the display pipeline.

### KMS: Modeling the Display Pipeline

Before KMS, userspace (the X server) wrote display-controller registers directly. This was viable when X was the only graphics consumer, but broke virtual consoles, made early-boot graphics impossible, and created races when switching between X and a VT. KMS moves all register writes into the kernel and models the display hardware as a directed graph of typed objects:

| KMS Object | Hardware reality |
|---|---|
| `drm_framebuffer` | A GEM buffer registered for scan-out, with format and pitch metadata |
| `drm_plane` | A hardware layer (overlay) that reads a framebuffer and composites it into the CRTC's input |
| `drm_crtc` | The timing generator — produces the pixel clock, horizontal sync, and vertical sync signals |
| `drm_encoder` | Serializes the CRTC's parallel pixel stream into a protocol (HDMI TMDS, DisplayPort, LVDS) |
| `drm_connector` | The physical port; carries EDID negotiation and hot-plug detection |

The data flow is strictly one direction:

```
drm_framebuffer → drm_plane → drm_crtc → drm_encoder → drm_connector → Monitor
```

A real GPU might expose 4 CRTCs, 3 planes per CRTC (primary, cursor, overlay), and 6 connectors. KMS exposes the exact topology and lets userspace query which objects can connect to which — not all encoders can drive all connectors, and not all planes can read all pixel formats.

### Atomic Modesetting

The legacy KMS API set properties one ioctl at a time. Changing framebuffer, then CRTC mode, then enabling the encoder meant that a driver bug or incompatible combination would leave the hardware halfway reconfigured — sometimes producing no output, sometimes garbage.

Atomic modesetting treats the entire pipeline state as a transaction. Userspace describes a desired state across all objects; the kernel's `drm_atomic_check()` validates the full chain — format compatibility, bandwidth constraints, CRTC clock limits — before touching any hardware. If any check fails, the call returns an error and *nothing changes*. If it succeeds, `drm_atomic_commit()` applies the state synchronized to the next VBlank. This is enforced by the kernel's `drm_atomic_state` machinery, not by driver convention.

---

## How It Works

### The Vertical Blanking Interval and Page Flipping

A 60 Hz display completes one full scan per frame:

$$T_{\text{frame}} = \frac{1}{60} \approx 16.67 \text{ ms}$$

The display controller does not scan continuously — after the last visible line it enters the vertical blanking interval (VBI) before restarting at line 0. During VBI the controller is not reading pixel data, so atomically updating the scan-out pointer is safe. If the pointer is updated while the controller is actively scanning line $L$, the top $L$ rows of the display show the old buffer and the remaining rows show the new one — a horizontal tear artifact.

The VBI duration at 60 Hz with a 1080-line active region and a typical 45-line blanking interval is:

$$T_{\text{VBI}} = \frac{45}{1125} \times 16.67 \approx 0.67 \text{ ms}$$

The DRM VBlank infrastructure registers a hardware interrupt (via `drm_crtc_handle_vblank()`) that fires at the start of VBI. Userspace queues a page flip:

```c
drmModePageFlip(fd, crtc_id, new_fb_id, DRM_MODE_PAGE_FLIP_EVENT, user_data);
```

The kernel defers the actual register write until the next VBlank interrupt, then sends a completion event back to userspace via the DRM file descriptor. Userspace polls or `epoll`s that fd, receives the event, and knows the old buffer is no longer being scanned — safe to reuse. The round-trip looks like:

```
userspace          kernel               hardware
    |                 |                    |
    |-- PageFlip ---->|                    |
    |                 |-- queue flip ----->|
    |                 |          [VBlank IRQ fires]
    |                 |<-- drm_crtc_handle_vblank()
    |<-- DRM event ---|-- write CRTC base register
    |                 |                    |
```

### Allocating and Registering a Scanout Buffer

GEM (Graphics Execution Manager) is the kernel's GPU memory allocator. The `DRM_IOCTL_MODE_CREATE_DUMB` ioctl allocates a dumb (CPU-writable, no GPU acceleration) buffer:

```c
struct drm_mode_create_dumb create = {
    .width  = 1920,
    .height = 1080,
    .bpp    = 32,
};
ioctl(fd, DRM_IOCTL_MODE_CREATE_DUMB, &create);
// create.handle — opaque GEM handle (process-local)
// create.pitch  — driver-aligned bytes per row
// create.size   — total allocation size in bytes
```

The handle is then mapped into userspace address space:

```c
struct drm_mode_map_dumb map = { .handle = create.handle };
ioctl(fd, DRM_IOCTL_MODE_MAP_DUMB, &map);
// map.offset is a fake offset for mmap, not a physical address
void *fb_mem = mmap(NULL, create.size, PROT_READ | PROT_WRITE,
                    MAP_SHARED, fd, map.offset);
```

The `map.offset` is not a real file offset — it is a token the kernel uses to look up the GEM object when `mmap` calls back into the DRM driver's `.mmap` handler. Once mapped, CPU writes go directly to GPU-accessible memory.

To use this buffer as a KMS scan-out source, register it as a framebuffer:

```c
struct drm_mode_fb_cmd2 fb = {
    .width        = 1920,
    .height       =
