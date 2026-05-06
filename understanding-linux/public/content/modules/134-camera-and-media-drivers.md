---
id: 134
title: "Camera and media drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### V4L2 as a Character‑Device API
V4L2 (Video for Linux 2) exposes each video endpoint as a **character device** (`/dev/video*`). Unlike block devices, a character device is accessed as a byte stream; the kernel does not impose a fixed block size, which matches the nature of video frames that arrive as variable‑length, time‑ordered buffers. The V4L2 core (`drivers/media/v4l2-core/videodev2.c`) registers these devices with the VFS using the `file_operations` struct that implements `open`, `release`, `ioctl`, `read`, `write`, and `mmap`.  
**Why a char device?** Video data is consumed sequentially (capture → process → display) and often needs low‑latency delivery; random‑access semantics of a block device would add unnecessary overhead and complexity.

### Buffers, Memory Types, and the Streaming Model
A V4L2 buffer (`struct v4l2_buffer`) describes a memory region that holds one video frame. The driver does **not** allocate the memory itself; the application chooses a memory type and tells the driver where to place the data:

| Memory type | Kernel macro          | Typical use                                            |
|-------------|-----------------------|--------------------------------------------------------|
| `V4L2_MEMORY_MMAP`   | `VIDIOC_REQBUFS` + `mmap` | Driver allocates contiguous kernel pages; user space maps them via `mmap`. Zero‑copy, low latency. |
| `V4L2_MEMORY_USERPTR`| `VIDIOC_REQBUFS` + user pointer | Application provides pre‑allocated pages (must be page‑aligned and locked with `mlock`). Useful when the app already owns buffers (e.g., GPU‑mapped memory). |
| `V4L2_MEMORY_DMABUF` | `VIDIOC_REQBUFS` + DMA‑buf fd | Enables sharing buffers with other subsystems (GPU, VPU, codec) without copying. Required for zero‑copy pipelines (e.g., V4L2 → DRM/KMS). |

The driver negotiates the **format** (`struct v4l2_pix_format`) first: width, height, pixel format (`V4L2_PIX_FMT_YUYV`, `V4L2_PIX_FMT_RGB24`, etc.), and bytes per line. Only after the format is fixed may the application request buffers (`VIDIOC_REQBUFS`).  
**Why negotiate format first?** The driver needs to know the exact frame size to allocate or validate buffers; requesting buffers before format negotiation would lead to `EINVAL` or silently incorrect sizes.

### Pipelines and the Media Controller
V4L2 does not work in isolation; it is a node in the **media controller graph** (`media-ctl`). Each video node (sensor, ISP, encoder, output) is represented as an *entity* with *pads* linked via *links*. The application configures the graph (format, frame rate, crop/compose) using `VIDIOC_SUBDEV_*` ioctls on subdevice nodes (`/dev/v4l-subdev*`).  
**Why a graph?** Modern SoCs split video processing across multiple hardware blocks; the media controller lets the kernel enforce compatibility (e.g., a sensor outputting 12‑bit raw must be linked to an ISP that accepts that format) and provides a single point of control for the whole pipeline.

### Essential Ioctl Commands (What They Do and Why)
| Ioctl                     | Purpose                                                                                          | Typical sequence                                                               |
|---------------------------|--------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `VIDIOC_QUERYCAP`         | Ask driver for version, capabilities, and supported I/O modes.                                   | First call after `open` to verify the device is a V4L2 video capture device.   |
| `VIDIOC_ENUM_FMT`         | Enumerate pixel formats the driver can negotiate for a given buffer type.                        | Used to pick a format supported by both hardware and application.              |
| `VIDIOC_G_FMT` / `VIDIOC_S_FMT` | Get / set the current format (`struct v4l2_pix_format`).                                      | Must be set before requesting buffers; changing format may require buffer re‑negotiation. |
| `VIDIOC_REQBUFS`          | Request *n* buffers of a given type and memory type; returns the actual number allocated.       | After format is set; driver may allocate fewer buffers if resources are limited. |
| `VIDIOC_QUERYBUF`         | Retrieve details (physical address, size, offset) for each allocated buffer.                     | Needed to `mmap` each buffer or to fill `struct v4l2_buffer` for `USERPTR`.    |
| `VIDIOC_QBUF`             | Queue an empty buffer to the driver’s incoming queue (for capture) or outgoing queue (for output). | Application fills buffer (for output) or leaves empty (for capture) then queues it. |
| `VIDIOC_DQBUF`            | Dequeue a filled buffer (capture) or an empty buffer (output).                                   | Blocking or non‑blocking; returns when a frame is ready or driver needs a buffer. |
| `VIDIOC_STREAMON` / `VIDIOC_STREAMOFF` | Start or stop streaming on the selected buffer type.                                           | Buffers must be queued before `STREAMON`; otherwise driver returns `EBUSY`.   |
| `VIDIOC_SUBDEV_*`         | Configure sub‑devices (sensor, ISP, etc.) via the media controller.                              | Used to set exposure, gain, cropping, etc., on the sensor before capture.    |

### Data Flow Equation
For a negotiated format with width *W*, height *H*, and bytes per pixel *B* (derived from the pixel format), the **minimum buffer size** required for one frame is:

$$
\text{frame\_size} = W \times H \times B
$$

If the application requests *N* buffers, the **total memory commitment** is:

$$
\text{mem\_total} = N \times \text{frame\_size}
$$

The **sustained data rate** (bytes per second) at a frame rate *F* (frames/sec) is:

$$
R = \text{frame\_size} \times F
$$

These formulas let you size `mlock` limits, check DMA‑buf feasibility, and estimate USB bandwidth (`R` must be < ~480 Mbps for USB 2.0 isochronous, accounting for overhead).

---

## How It Works
### Step‑by‑Step Interaction Model
1. **Device discovery** – Applications scan `/dev/video*` or use `v4l2-ctl --list-devices`.  
2. **Open** – `fd = open("/dev/video0", O_RDWR);` invokes the V4L2 `open` method, which increments the device’s reference count and allocates per‑file private data.  
3. **Capability check** – `ioctl(fd, VIDIOC_QUERYCAP, &cap)` verifies `cap.capabilities & V4L2_CAP_VIDEO_CAPTURE`.  
4. **Format negotiation** –  
   ```c
   struct v4l2_fmtdesc fmt = { .index = 0, .type = V4L2_BUF_TYPE_VIDEO_CAPTURE };
   while (ioctl(fd, VIDIOC_ENUM_FMT, &fmt) == 0) { /* ... */ }
   struct v4l2_format fmt = {
       .type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
       .fmt.pix.width       = 640,
       .fmt.pix.height      = 480,
       .fmt.pix.pixelformat = V4L2_PIX_FMT_YUYV,
       .fmt.pix.field       = V4L2_FIELD_NONE
   };
   ioctl(fd, VIDIOC_S_FMT, &fmt);
   ```
   The driver may adjust values (e.g., rounding width to a multiple of 32) and returns the actual configuration.  
5. **Buffer request** –  
   ```c
   struct v4l2_requestbuffers req = {
       .count  = 4,
       .type   = V4L2_BUF_TYPE_VIDEO_CAPTURE,
       .memory = V4L2_MEMORY_MMAP
   };
   ioctl(fd, VIDIOC_REQBUFS, &req);
   ```
   The driver allocates *req.count* kernel pages (or returns fewer if memory is tight).  
6. **Query each buffer** – For i = 0 … req.count‑1:  
   ```c
   struct v4l2_buffer buf = { .type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
                              .memory = V4L2_MEMORY_MMAP,
                              .index = i };
   ioctl(fd, VIDIOC_QUERYBUF, &buf);
   buffers[i].start = mmap(NULL, buf.length, PROT_READ|PROT_WRITE,
                           MAP_SHARED, fd, buf.m.offset);
   buffers[i].length = buf.length;
   ```
7. **Queue buffers** – Each mmap’d buffer is put into the driver’s incoming queue:  
   ```c
   for (i = 0; i < req.count; ++i) {
       struct v4l2_buffer buf = { .type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
                                  .memory = V4L2_MEMORY_MMAP,
                                  .index = i };
       ioctl(fd, VIDIOC_QBUF, &buf);
   }
   ```
8. **Start streaming** – `ioctl(fd, VIDIOC_STREAMON, &type);` tells the hardware to begin filling buffers and generating interrupts.  
9. **Capture loop** –  
   ```c
   while (running) {
       struct v4l2_buffer buf = { .type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
                                  .memory = V4L2_MEMORY_MMAP };
       if (ioctl(fd, VIDIOC_DQBUF, &buf) == -1) {
           if (errno == EAGAIN) continue; /* non‑blocking */
           break;
       }
       /* buffers[buf.index].start now holds a filled frame */
       process_frame(buffers[buf.index].start, buf.bytesused);
       ioctl(fd, VIDIOC_QBUF, &buf); /* re‑queue */
   }
   ```
10. **Stop and cleanup** – `VIDIOC_STREAMOFF`, `munmap`, `close(fd)`.

**Why each step matters**  
- Skipping format negotiation leads to undefined buffer sizes.  
- Requesting buffers before format set returns `EINVAL` because the driver cannot compute size.  
- Not queuing buffers before `STREAMON` results in no frames being captured; the driver has nowhere to place incoming data.  
- Using the wrong memory type (e.g., passing a user pointer with `V4L2_MEMORY_MMAP`) causes the driver to ignore the pointer or return `EINVAL`.  

### Error Propagation and Non‑Blocking I/O
V4L2 ioctls return `-1` on error, setting `errno`. Common codes:
- `EINVAL` – invalid argument (often format/memory mismatch).  
- `EBUSY` – device already streaming or buffers not queued.  
- `EAGAIN` – non‑blocking `DQBUF` called when no buffer is ready; useful for polling with `select()`/`epoll()` on the file descriptor (the driver signals `POLLIN` when a dequeued buffer is available).  

**Why use non‑blocking?** In a multimedia pipeline (e.g., GStreamer) you may want to service multiple sources or handle UI events without blocking a thread; `select()` lets you wait for either a frame or a shutdown signal.

---

## Worked Examples
### Example 1: Simple Capture → Raw File (MMAP)
**Goal:** Grab a single frame from `/dev/video0` in YUYV format and write it to `frame.yuv`.  
**Explanation:** We negotiate format, request 2 MMAP buffers, queue them, start streaming, dequeue one buffer, and dump its raw bytes.

```c
/* capture_one.c */
#define _GNU_SOURCE
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <sys/mman.h>
#include <linux/videodev2.h>

static int xioctl(int fd, int request, void *arg)
{
    int r;
    do r = ioctl(fd, request, arg);
    while (-1 == r && EINTR == errno);
    return r;
}

int main(void)
{
    const char *dev = "/dev/video0";
    int fd = open(dev, O_RDWR | O_NONBLOCK, 0);
    if (fd < 0) { perror("open"); return 1; }

    /* Query capabilities */
    struct v4l2_capability cap;
    if (xioctl(fd, VIDIOC_QUERYCAP, &cap) < 0) {
        perror("VIDIOC_QUERYCAP"); goto err;
    }
    if (!(cap.capabilities & V4L2_CAP_VIDEO_CAPTURE)) {
        fprintf(stderr, "%s is no video capture device\n", dev);
        goto err;
    }

    /* Set format */
    struct v4l2_format fmt = {0};
    fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    fmt.fmt.pix.width       = 640;
    fmt.fmt.pix.height      = 480;
    fmt.fmt.pix.pixelformat = V4L2_PIX_FMT_YUYV;   /* 2 bytes per pixel */
    fmt.fmt.pix.field       = V4L2_FIELD_NONE;
    if (xioctl(fd, VIDIOC_S_FMT, &fmt) < 0) {
        perror("VIDIOC_S_FMT"); goto err;
    }
    /* Verify driver didn't change it unexpectedly */
    if (fmt.fmt.pix.pixelformat != V4L2_PIX_FMT_YUYV) {
        fprintf(stderr, "Driver changed pixelformat.\n");
        goto err;
    }

    /* Request buffers */
    struct v4l2_requestbuffers req = {0};
    req.count  = 2;
    req.type   = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    req.memory = V4L2_MEMORY_MMAP;
    if (xioctl(fd, VIDIOC_REQBUFS, &req) < 0) {
        perror("VIDIOC_REQBUFS"); goto err;
    }
    if (req.count < 2) {
        fprintf(stderr, "Insufficient buffer memory\n");
        goto err;
    }

    /* Map buffers */
    struct {
        void *start;
        size_t length;
    } buffers[req.count];

    for (unsigned i = 0; i < req.count; ++i) {
        struct v4l2_buffer buf = {0};
        buf.type        = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory      = V4L2_MEMORY_MMAP;
        buf.index       = i;
        if (xioctl(fd, VIDIOC_QUERYBUF, &buf) < 0) {
            perror("VIDIOC_QUERYBUF"); goto err;
        }
        buffers[i].length = buf.length;
        buffers[i].start = mmap(NULL, buf.length,
                                PROT_READ | PROT_WRITE,
                                MAP_SHARED, fd, buf.m.offset);
        if (buffers[i].start == MAP_FAILED) {
            perror("mmap"); goto err;
        }
    }

    /* Queue buffers */
    for (unsigned i = 0; i < req.count; ++i) {
        struct v4l2_buffer buf = {0};
        buf.type        = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory      = V4L2_MEMORY_MMAP;
        buf.index       = i;
        if (xioctl(fd, VIDIOC_QBUF, &buf) < 0) {
            perror("VIDIOC_QBUF"); goto err;
        }
    }

    /* Start streaming */
    enum v4l2_buf_type type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    if (xioctl(fd, VIDIOC_STREAMON, &type) < 0) {
        perror("VIDIOC_STREAMON"); goto err;
    }

    /* Dequeue a single frame */
    struct v4l2_buffer buf = {0};
    buf.type        = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    buf.memory      = V4L2_MEMORY_MMAP;
    if (xioctl(fd, VIDIOC_DQBUF, &buf) < 0) {
        perror("VIDIOC_DQBUF"); goto err;
    }

    /* Write raw data */
    FILE *out = fopen("frame.yuv", "wb");
    if (!out) { perror("fopen"); goto err_streamoff; }
    fwrite(buffers[buf.index].start, 1, buf.bytesused, out);
    fclose(out);
    printf("Wrote %u bytes to frame.yuv\n", buf.bytesused);

    /* Requeue buffer (good practice) */
    xioctl(fd, VIDIOC_QBUF, &buf);

    /* Stop streaming */
    xioctl(fd, VIDIOC_STREAMOFF, &type);
    /* Cleanup mmap */
    for (unsigned i = 0; i < req.count; ++i)
        munmap(buffers[i].start, buffers[i].length);
    close(fd);
    return 0;

err_streamoff:
    xioctl(fd, VIDIOC_STREAMOFF, &type);
err:
    for (unsigned i = 0; i < req.count; ++i)
        if (buffers[i].start) munmap(buffers[i].start, buffers[i].length);
    close(fd);
    return 1;
}
```

**Why this works:**  
- `O_NONBLOCK` lets us break out of the loop if `DQBUF` ever returns `EAGAIN` (not used here but safe).  
- After `VIDIOC_STREAMON`, the hardware begins filling buffers; the first `DQBUF` returns when the first frame is ready.  
- The frame size is `640 * 480 * 2 = 614 400` bytes (YUYV). The program checks `buf.bytesused` which should equal that value.  
- All resources are unmapped and released even on error paths.

### Example 2: Capture → RGB Conversion → PPM File
**Goal:** Capture a frame, convert YUYV → RGB24, and store as a portable PPM (`frame.ppm`).  
**Explanation:** Adds a conversion step to illustrate processing in the pipeline. The conversion uses the standard YUYV layout: each 4‑byte block holds Y0 Cb Y1 Cr; conversion formulas are:

$$
\begin{aligned}
R &= Y + 1.402 \times (Cr - 128)\\
G &= Y - 0.344 \times (Cb - 128) - 0.714 \times (Cr - 128)\\
B &= Y + 1.772 \times (Cb - 128)
\end{aligned}
$$

Clamp each component to `[0,255]`.

```c
/* capture_rgb.c */
#define _GNU_SOURCE
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <errno.h>
#include <sys/mman.h>
#include <linux/videodev2.h>

static int xioctl(int fd, int request, void *arg)
{
    int r;
    do r = ioctl(fd, request, arg);
    while (-1 == r && EINTR == errno);
    return r;
}

/* Clamp helper */
static inline uint8_t clamp(int v)
{
    return (v < 0) ? 0 : (v > 255) ? 255 : (uint8_t)v;
}

/* Convert one YUYV block (4 bytes) to two RGB24 pixels (6 bytes) */
static void yuyv_to_rgb24(const uint8_t *src, uint8_t *dst)
{
    int Y0 = src[0];
    int Cb = src[1];
    int Y1 = src[2];
    int Cr = src[3];

    int R = Y0 + 1.402 * (Cr - 128);
    int G = Y0 - 0.344 * (Cb - 128) - 0.714 * (Cr - 128);
    int B = Y0 + 1.772 * (Cb - 128);
    dst[0] = clamp(R); dst[1] = clamp(G); dst[2] = clamp(B);

    R = Y1 + 1.402 * (Cr - 128);
    G = Y1 - 0.344 * (Cb - 128) - 0.714 * (Cr - 128);
    B = Y1 + 1.772 * (Cb - 128);
    dst[3] = clamp(R); dst[4] = clamp(G); dst[5] = clamp(B);
}

int main(void)
{
    const char *dev = "/dev/video0";
    int fd = open(dev, O_RDWR, 0);
    if (fd < 0) { perror("open"); return 1; }

    struct v4l2_capability cap;
    if (xioctl(fd, VIDIOC_QUERYCAP, &cap) < 0) { perror("VIDIOC_QUERYCAP"); goto err; }
    if (!(cap.capabilities & V4L2_CAP_VIDEO_CAPTURE)) {
        fprintf(stderr, "%s not a capture device\n", dev); goto err;
    }

    /* Set format */
    struct v4l2_format fmt = {0};
    fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    fmt.fmt.pix.width       = 640;
    fmt.fmt.pix.height      = 480;
    fmt.fmt.pix.pixelformat = V4L2_PIX_FMT_YUYV;
    fmt.fmt.pix.field       = V4L2_FIELD_NONE;
    if (xioctl(fd, VIDIOC_S_FMT, &fmt) < 0) { perror("VIDIOC_S_FMT"); goto err; }

    /* Request buffers */
    struct v4l2_requestbuffers req = {0};
    req.count  = 2;
    req.type   = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    req.memory = V4L2_MEMORY_MMAP;
    if (xioctl(fd, VIDIOC_REQBUFS, &req) < 0) { perror("VIDIOC_REQBUFS"); goto err; }

    /* Map buffers */
    struct {
        void *start;
        size_t length;
    } buffers[req.count];
    for (unsigned i = 0; i < req.count; ++i) {
        struct v4l2_buffer buf = {0};
        buf.type        = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory      = V4L2_MEMORY_MMAP;
        buf.index       = i;
        if (
