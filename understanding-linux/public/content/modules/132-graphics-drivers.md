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

## Core Concepts
### Introduction to Graphics Drivers
A graphics driver is the kernel‑mediated interface that translates **user‑space graphics API calls** (OpenGL, Vulkan, Wayland, X11) into **GPU command streams** and manages the shared resources the GPU needs: video memory, command buffers, synchronization primitives, and display engine state.  
Why a dedicated driver? The GPU exposes a register‑level ISA that varies by vendor and generation; without a driver the kernel would have to implement a generic, low‑performance fallback (e.g., software rasterization) for every possible GPU, making real‑time graphics infeasible.

### DRM/KMS Concepts
The **Direct Rendering Manager (DRM)** provides:
* **Authentication & permission checking** via `/dev/dri/cardN` file descriptors.
* **Memory management** through the Graphics Execution Manager (GEM) or Translation Table Maps (TTM) – allocating, mapping, and tracking GPU‑accessible buffers.
* **Command submission** via ioctls (`DRM_IOCTL_I915_GEM_EXECBUFFER2`, `DRM_IOCTL_VIRTIO_GPU_EXECBUFFER`, etc.) that push GPU command buffers into hardware queues and return fences for CPU‑GPU synchronization.

**Kernel Mode Setting (KMS)** handles the display pipeline:
* **Mode setting** – programming the display controller’s timings (pixel clock, horizontal/vertical totals) to match a monitor’s EDID‑described mode.
* **Plane assignment** – linking a GEM buffer (scanout) to a CRTC (display pipe) via a plane (primary, overlay, cursor).
* **Atomic commits** – bundling mode, plane, and property changes into a single transaction that either all succeed or none, preventing tearing.

Causality: DRM supplies the buffer that the GPU renders into; KMS tells the display controller *where* to read that buffer and *when* to latch it (at vblank) so the image appears without tearing.

### Framebuffer History & Modern Layout
Early framebuffers were a **linear array** of bytes: address = y·stride + x·BPP.  
Modern drivers treat the framebuffer as a **GEM object** with explicit parameters:
* **width, height** – logical dimensions.
* **BPP** – bits per pixel (e.g., 32 for XRGB8888).
* **stride (pitch)** – bytes between successive rows, required to be a multiple of the GPU’s tile size (often 256 B) for efficient 2D caching.

Derivation of stride for a tiled layout (simplified):
```
stride = align_up(width * BPP, tile_size)
```
where `align_up(x, a) = ((x + a - 1) / a) * a`.  
If width=1920, BPP=4, tile_size=256 → raw = 7680 B → already a multiple of 256, so stride=7680 B. For width=1921, raw=7684 → stride=7936 B (next multiple of 256).

### Display Pipelines
The pipeline from shader output to photons consists of:
1. **Vertex Processing** – transforms object coordinates → clip space (GPU vertex shader).
2. **Rasterization** – converts triangles → fragments, generates coverage masks.
3. **Fragment Shading** – computes final color/texture per fragment.
4. **Blend & ROP** – combines fragment color with existing buffer contents (source‑over, etc.).
5. **Write‑out to GEM buffer** – stores the final pixel values in the scanout buffer.
6. **Display Controller Readout** – at each vertical blank, the controller reads the buffer according to the programmed mode (pixel clock, H/V totals) and drives TMDS/LVDS/eDP/DP lanes.

Each stage incurs latency; the total **frame latency** ≈ (GPU pipeline depth) + (display controller latency) + (vblank wait). Reducing any stage improves responsiveness, which is why drivers expose **fence fd** and **atomic commit** interfaces to let userspace synchronize precisely with vblank.

## How It Works
### From Syscall to GPU Execution
1. **Open DRM device** – `int fd = open("/dev/dri/card0", O_RDWR | O_CLOEXEC);`  
   The kernel checks DRM master/authentication; only privileged processes or those with `CAP_SYS_ADMIN` can become master.
2. **Allocate a GEM buffer** –  
   ```c
   struct drm_i915_gem_create gem_create = {
       .size = width * height * 4,   // XRGB8888
   };
   ioctl(fd, DRM_IOCTL_I915_GEM_CREATE, &gem_create);
   uint32_t handle = gem_create.handle;
   ```
   The kernel creates a GEM object, reserves VRAM or GTT space, and returns a handle.
3. **Map buffer for CPU access (optional)** – `mmap` via `DRM_IOCTL_I915_GEM_MMAP`; otherwise, the GPU accesses it through its address space.
4. **Submit command batch** –  
   ```c
   struct drm_i915_gem_execbuffer2 execbuf = {
       .buffers_ptr = (uintptr_t)&handle,
       .buffer_count = 1,
       .flags = I915_EXEC_RENDER,   // render ring
   };
   ioctl(fd, DRM_IOCTL_I915_GEM_EXECBUFFER2, &execbuf);
   ```
   The kernel validates the batch, writes it to the GPU’s command ring, and returns a **fence** (`out_fence_ptr`) that can be waited on with `poll()` or `sync_wait()`.
5. **GPU execution** – The GPU’s command parser decodes the batch, executes shaders, reads/writes the GEM buffer via its internal MMU (IOMMU/VT-d), and signals completion by writing the fence value.
6. **KMS mode setting (if needed)** –  
   ```c
   drmModeModeInfo mode = { /* 1920x1080 @ 60Hz from EDID */ };
   drmModeSetCrtc(fd, crtc_id, buffer_handle, 0, 0,
                  &connector_id, 1, &mode);
   ```
   The display controller’s timing registers are programmed; the controller will latch the buffer on the next vblank.
7. **Page flip / atomic commit** – To avoid tearing, a **page flip** swaps the scanout buffer:
   ```c
   drmModeAtomicReq *req = drmModeAtomicAlloc();
   drmModeAtomicAddProperty(req, crtc_id,
                            drmModeGetProperty(fd, crtc_id, "FB_ID"),
                            new_fb_handle);
   drmModeAtomicAddProperty(req, crtc_id,
                            drmModeGetProperty(fd, crtc_id, "CRTC_ACTIVE"),
                            1);
   drmModeAtomicCommit(fd, req,
                       DRM_MODE_ATOMIC_ALLOW_MODESET |
                       DRM_MODE_ATOMIC_TEST_ONLY, NULL);
   /* after TEST_ONLY succeeds, commit for real */
   drmModeAtomicCommit(fd, req, 0, NULL);
   drmModeAtomicFree(req);
   ```
   The controller updates its internal pointer to `new_fb_handle` at the next vblank, guaranteeing a tear‑free transition.

### Memory Layout Mathematics
* **Framebuffer size** (bytes) = `width * height * BPP / 8`.  
  Example: 3840×2160×32 → 3840·2160·4 = 33,177,600 B ≈ 31.6 MiB.
* **Required memory bandwidth** for a steady stream at refresh R:
  ```
  BW = width * height * BPP/8 * R   (bytes/s)
  ```
  For 3840×2160@144Hz, BPP=32 → BW ≈ 33.2 MB * 144 ≈ 4.78 GB/s.
* **Pixel clock** derivation from mode timings:
  ```
  PixelClock = HTotal * VTotal * VRefresh
  ```
  where HTotal = HDisplay + HFrontPorch + HSync + HBackPorch (similarly for VTotal).  
  A 1920×1080@60Hz mode with HTotal=2200, VTotal=1125 → PixelClock = 2200·1125·60 ≈ 148.5 MHz, matching the standard DMT timing.

These formulas let the driver verify that a requested mode fits within the GPU’s available memory bandwidth and that the display controller’s PLL can synthesize the required pixel clock.

## Worked Examples
### Example 1: Rendering a Triangle with GBM + EGL + DRM
**Goal:** Draw a single‑color triangle on a 1280×720 scanout using the open‑source Intel driver (i915) via GBM/EGL (no X11).

**Steps & Numbers**
1. **Open DRM & create GBM device**
   ```c
   int fd = open("/dev/dri/card0", O_RDWR | O_CLOEXEC);
   struct gbm_device *gbm = gbm_create_device(fd);
   ```
2. **Create a scanout buffer** (XRGB8888, scanout + render)
   ```c
   const int w = 1280, h = 720;
   struct gbm_bo *bo = gbm_bo_create(gbm, w, h,
                                     GBM_BO_FORMAT_XRGB8888,
                                     GBM_BO_USE_SCANOUT |
                                     GBM_BO_USE_RENDERING);
   ```
   Buffer size = 1280·720·4 = 3,686,400 B (≈3.5 MiB).  
   `gbm_bo_get_stride(bo)` returns 5120 B (1280·4, already 256‑B aligned).
3. **Create EGL surface & context**
   ```c
   EGLDisplay egl = eglGetDisplay((EGLNativeDisplayType)gbm);
   eglInitialize(egl, NULL, NULL);
   eglBindAPI(EGL_OPENGL_API);
   EGLConfig cfg;
   EGLint num;
   eglChooseConfig(egl, attribs, &cfg, 1, &num);
   EGLSurface surf = eglCreateWindowSurface(egl, cfg,
                                            (EGLNativeWindowType)bo, NULL);
   EGLContext ctx = eglCreateContext(egl, cfg, EGL_NO_CONTEXT, ctx_attribs);
   eglMakeCurrent(egl, surf, surf, ctx);
   ```
4. **Render triangle (GLSL vertex/fragment shaders compiled at runtime)**
   ```c
   glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
   glClear(GL_COLOR_BUFFER_BIT);
   glUseProgram(prog);
   glDrawArrays(GL_TRIANGLES, 0, 3);
   ```
   Vertex data (−0.5,−0.5) (0.5,−0.5) (0.0,0.5) in normalized device coordinates maps to pixel space after the viewport transform (`glViewport(0,0,w,h)`), covering the left‑bottom, right‑bottom, and top‑center of the screen.
5. **Swap buffer (page flip) via EGL**
   ```c
   eglSwapBuffers(egl, surf);   // internally calls drmModePageFlip
   ```
   The EGL implementation extracts the underlying GEM handle from the `gbm_bo`, queues it as the new FB_ID for the CRTC, and waits for the vblank event (via `poll()` on the DRM fd). The previous buffer becomes available for the next frame after the GPU finishes rendering.

**Why each step matters:**  
* GBM guarantees the buffer is usable both as a scanout (display controller can read it) and as a render target (GPU can write to it) – otherwise you’d need an extra copy.  
* EGL abstracts the platform‑specific native window type while still exposing the DRM fd for synchronization.  
* The page flip is synchronized to vblank, eliminating tearing without busy‑waiting.

### Example 2: Setting a Custom Mode via Atomic KMS
**Goal:** Add a 1600×900@60Hz mode to a monitor that only reports 1920×1080 via EDID (e.g., for a custom timing experiment).

**Procedure**
1. **Retrieve resources**
   ```c
   int fd = open("/dev/dri/card0", O_RDWR);
   drmModeRes *res = drmModeGetResources(fd);
   ```
2. **Pick a free connector** (e.g., HDMI‑A‑1) and its preferred mode.
3. **Build a custom modeInfo**
   ```c
   drmModeModeInfo custom = {
       .clock   = 108000,          // pixel clock in kHz (108 MHz)
       .hdisplay= 1600,
       .hsync_start= 1600+48,    // + front porch
       .hsync_end  = 1600+48+32, // + sync width
       .htotal   = 1600+48+32+80,// + back porch
       .vdisplay= 900,
       .vsync_start= 900+3,
       .vsync_end  = 900+3+6,
       .vtotal   = 900+3+6+22,
       .flags    = DRM_MODE_FLAG_POSHSYNC | DRM_MODE_FLAG_POSVSYNC,
       .type     = DRM_MODE_TYPE_USERDEF,
   };
   ```
   Derivation: For 1600×900@60Hz, using GTF timings yields approx. 108 MHz pixel clock; the porch/sync values follow the CVT reduced blanking spec (common for LCDs).
4. **Add the mode to the connector’s mode list**
   ```c
   drmModeConnector *conn = drmModeGetConnector(fd, connector_id);
   drmModeModePtr list = malloc((conn->count_modes+1)*sizeof(drmModeModeInfo));
   memcpy(list, conn->modes, conn->count_modes*sizeof(drmModeModeInfo));
   list[conn->count_modes] = custom;
   drmModeSetConnectorProperty(fd, conn->connector_id,
                               drmModeGetProperty(fd, conn->connector_id, "EDID"),
                               0); // not needed; we just replace the mode array via atomic commit
   ```
   (In practice, you expose the mode via an atomic property `CRTC_MODE` rather than mutating the connector’s list.)
5. **Create an atomic request to set the mode**
   ```c
   drmModeAtomicReq *req = drmModeAtomicAlloc();
   drmModeAtomicAddProperty(req, crtc_id,
                            drmModeGetProperty(fd, crtc_id, "ACTIVE"), 1);
   drmModeAtomicAddProperty(req, crtc_id,
                            drmModeGetProperty(fd, crtc_id, "MODE_ID"),
                            drmModeModeGetId(&custom)); // need to register custom mode first
   // Assign buffer
   drmModeAtomicAddProperty(req, crtc_id,
                            drmModeGetProperty(fd, crtc_id, "FB_ID"), fb_handle);
   // Commit
   int ret = drmModeAtomicCommit(fd, req,
                                 DRM_MODE_ATOMIC_ALLOW_MODESET, NULL);
   if (ret) fprintf(stderr, "Commit failed: %s\n", strerror(errno));
   drmModeAtomicFree(req);
   ```
   The kernel validates the mode against the display controller’s PLL limits; if the pixel clock exceeds the maximum supported by the encoder (e.g., 165 MHz for HDMI 1.4), the commit fails with `-ERANGE`, prompting the user to lower the clock or reduce blanking.

**Why this works:** Atomic commits let you change multiple independent properties (activation, mode, framebuffer) in a single transaction, guaranteeing that the display controller sees a consistent state and avoids intermediate glitches.

## Common Mistakes
| # | Mistake | Why It’s Wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | **Assuming `stride == width * BPP/8`** | Modern GPUs often require row alignment to a cache line or tile boundary (e.g., 64 B or 256 B). Using a tight stride can cause misaligned accesses, leading to corrupted rows or performance penalties due to extra micro‑tiles. | Visual artifacts (vertical stripes) or GPU hangs when the display controller reads misaligned memory. |
| 2 | **Calling `drmModeSetCrtc` without a pending vblank** | The display controller latches the new buffer only at the next vertical blank. If you change the FB_ID mid‑scanline, you get tearing; if you change it during vertical blank but before the latch, you may see a partial update. | Visible tearing or transient ghosting, especially noticeable in high‑motion content. |
| 3 | **Using CPU `memcpy` to fill a GEM buffer instead of GPU rendering** | The CPU must first pin the buffer (`mmap`) and then copy data; this bypasses the GPU’s command scheduler and memory arbitration, causing unnecessary cache coherency traffic and stalling the GPU’s memory controller. | Severe bandwidth waste; frame rates drop dramatically, and power consumption rises. |
| 4 | **Ignoring the return value/fence of `DRM_IOCTL_GEM_EXECBUFFER2`** | The ioctl returns a fence that signals when the GPU has finished executing the batch. Submitting a new batch that depends on the previous one without waiting creates a race condition, causing the GPU to read stale data. | Garbled rendering, crashes, or silent corruption that is hard to reproduce. |
| 5 | **Assuming KMS atomic commit always succeeds** | The kernel may reject a commit due to insufficient bandwidth, invalid plane configuration, or encoder limits (e.g., pixel clock > TMDS max). Not checking the error leads to assuming the mode is active when it isn’t. | The display stays blank or retains the previous mode; debugging becomes confusing because the application thinks it succeeded. |

## Exercises
### Easy
1. **Query DRM resources** – Write a C program that opens `/dev/dri/card0`, calls `drmModeGetResources`, and prints all connectors, their status, and the list of available modes (including pixel clock and flags).  
   *Goal:* Familiarize with libdrm structures and error handling.

2. **Check GEM buffer alignment** – Allocate a 2560×1440×32 buffer via `DRM_IOCTL_I915_GEM_CREATE`, mmap it, and verify that the reported stride is a multiple of 256 bytes. Print both raw stride and aligned stride.

### Medium
3. **Atomic mode set** – Using the code from Worked Example 2, implement a tool that accepts `<width> <height> <refresh>` on the command line, computes a CVT reduced blanking mode, checks the encoder’s pixel clock limit (`/sys/class/drm/card0/device/hdmi_capable` or `drmModeGetEncoder`), and attempts an atomic commit. Report success or the specific rejection reason (`-ERANGE`, `-EINVAL`, etc.).  
   *Goal:* Understand mode validation, PLL limits, and error propagation.

4. **Simple page‑flip loop** – Create an EGL/GBM program that clears the screen to a rotating hue (using `glClearColor` with a time‑based hue) and performs `eglSwapBuffers` in a loop timed by `drmHandleEvent` waiting for vblank events. Measure and print the average frame interval over 100 frames.  
   *Goal:* Experience synchronization with vblank and measure jitter.

### Hard
5. **Mini driver rendering a color bar** – Write a standalone Linux kernel module (character device) that:
   * Allocates a contiguous DMA buffer (via `dma_alloc_coherent`) large enough for a full‑screen framebuffer.
   * Sets up a basic DRM driver stub (using DRM/KMS helpers) that exposes a single CRTC/connector.
   * In the driver’s `flush` callback (called after each vblank), fills the buffer with a vertical color‑bar pattern using CPU writes (since we lack a real GPU, this demonstrates the display path).
   * Registers a DRM primary plane pointing at that buffer.
   * Userspace can `open /dev/my_mini_drm` and run a test pattern.  
   *Goal:* See the full stack from kernel memory allocation → KMS plane assignment → display controller readout without relying on a real GPU’s command processor.

## Linux Connection
### Subsystems & Files
| Subsystem | Kernel module | Sysfs path | Device node | Purpose |
|-----------|---------------|------------|-------------|---------|
| DRM core | `drm.ko` | `/sys/module/drm/` | `/dev/dri/card[0-9]` | Generic GPU resource management, GEM, command submission |
| KMS helpers | `drm_kms_helper.ko` | `/sys/module/drm_kms_helper/` | (uses same `/dev/dri/card*`) | Mode setting, plane/CRTC abstraction, atomic API |
| Driver‑specific | e.g. `i915.ko`, `amdgpu.ko`, `nouveau.ko` | `/sys/module/<driver>/` | same `/dev/dri/card*` | Hardware‑specific command submission, memory managers (GEM/TTM), encoder/bridge handling |
| Framebuffer legacy (optional) | `fbdev.ko` | `/sys/module/fbdev/` | `/dev/fb[0-9]` | Deprecated; emulated via DRM fbdev helper |

### Key Directories & Files
* **Card info** – `/sys/class/drm/card0/` contains subdirectories `card0-<connector>` (e.g., `card0-HDMI-A-1`) with files: `status`, `edid`, `modes`.
* **Current mode** – `/sys/class/drm/card0/card0-HDMI-A-1/mode` shows active mode as `<width>x<height>@<refresh>`.
* **Pixel clock limit** – `/sys/class/drm/card0/device/hdmi_capable` (Intel) or `/sys/class/drm/card0/device/pp_od_clk_voltage` (AMD) expose max TMDS/pixel clock.
* **Event handling** – `poll()` on the DRM fd returns `POLLIN` when a vblank or page‑flip completion event is queued; read via `drmHandleEvent(fd, &ev, &user_data)`.
* **Debugfs** – `/sys/kernel/debug/dri/0/` (if `CONFIG_DEBUG_FS=y`) provides `i915_gem_objects`, `amdgpu_vm`, etc., useful for leak detection.

### Runnable Shell Commands
```bash
#
