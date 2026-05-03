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

## Why This Matters

A webcam, a TV tuner, and an embedded ISP all produce continuous streams of data under a hard constraint: every frame must land in RAM within one frame period or it is lost forever. Without a principled framework, every driver would invent its own ioctl interface, its own buffer scheme, and its own synchronization model. V4L2 exists to prevent that fragmentation. It defines a single contract between hardware, kernel drivers, and userspace: how buffers are negotiated, how formats are declared, and how data flows through multi-stage pipelines. The consequence of getting any part of this wrong is not a clean error — it is corrupted frames, silent data loss, or a kernel crash from a DMA into unmapped memory.

---

## Core Concepts

### V4L2 as a Kernel Subsystem

V4L2 lives under `drivers/media/v4l2-core/` and exposes devices as `/dev/videoN`, `/dev/vbiN`, and `/dev/radioN`. The framework separates two concerns that must never be conflated:

- **Capability negotiation** — what pixel formats, frame sizes, and frame rates the hardware supports (`VIDIOC_ENUM_FMT`, `VIDIOC_S_FMT`, `VIDIOC_S_PARM`)
- **Buffer management** — how pixel data physically moves from hardware into RAM and then into userspace

This separation is deliberate. A driver author implements format negotiation once; the buffer machinery is handled by the `videobuf2` (vb2) layer in `drivers/media/common/videobuf2/`. A driver that registers with vb2 gets queue management, buffer state tracking, and mmap support essentially for free.

The ioctl dispatch path is: userspace `ioctl()` → `v4l2_ioctl()` in `v4l2-ioctl.c` → per-driver `v4l2_ioctl_ops` function pointer. Every driver fills in a `struct v4l2_ioctl_ops`; the framework validates arguments before calling through.

### Buffers and the Streaming I/O Model

`read()` on a video device is legal but useless at scale. Copying a 1080p YUYV frame through the kernel on every call costs:

$$\text{copy cost} = \frac{1920 \times 1080 \times 2 \text{ bytes}}{64 \text{ bytes/cacheline}} = 64{,}800 \text{ cache line writes per frame}$$

At 60 fps that is $\approx 3.9 \times 10^6$ cache line operations per second — on the critical path of every frame. Streaming I/O eliminates this by keeping buffers in place and transferring ownership rather than data.

The three streaming modes differ in who allocates the buffer memory:

| Mode | Allocator | Use case |
|---|---|---|
| `MMAP` | Kernel driver | General capture; application mmaps kernel buffers |
| `USERPTR` | Userspace | Application controls buffer placement, e.g., for GPU-visible memory |
| `DMABUF` | Third party (GPU, DSP) | Zero-copy sharing across subsystems via `dma_buf` fd |

`DMABUF` is the modern choice for any pipeline where a camera feeds a GPU or encoder. The buffer never moves; only the file descriptor is passed between drivers.

### Physical Contiguity and Why It Is Required

A simple bus-mastering DMA controller holds a single base address register and a transfer length. It cannot scatter-gather across non-contiguous physical pages. If your driver programs address $A$ into the DMA base register and the next physical page is not at $A + 4096$, the DMA engine reads garbage or faults the bus.

For a frame buffer of size $S$ bytes spanning $n$ pages:

$$n = \left\lceil \frac{S}{4096} \right\rceil$$

All $n$ pages must be physically adjacent. `kmalloc` guarantees contiguity only up to $2^{order}$ pages (order limited by `MAX_ORDER`, typically $\approx 10$, giving 4 MB on 4 KB pages). For larger buffers, drivers use `dma_alloc_coherent()`, which calls the CMA (Contiguous Memory Allocator) on platforms that configure it.

### Buffer Ownership and Cache Coherence

At any instant, a DMA buffer is owned by exactly one agent — CPU or device. This is not convention; it reflects the behavior of real cache controllers. If the CPU speculatively prefetches a cache line while the DMA engine has not finished writing that line, the CPU reads stale data. The kernel's DMA API makes ownership transfers explicit:

```c
/* Before CPU reads a filled frame: */
dma_sync_single_for_cpu(dev, dma_handle, size, DMA_FROM_DEVICE);

/* Before re-queuing an empty buffer to the device: */
dma_sync_single_for_device(dev, dma_handle, size, DMA_FROM_DEVICE);
```

On x86 with hardware-coherent caches, these are compiled away to nothing. On ARM Cortex-A without hardware coherency (common in SoCs), `dma_sync_single_for_cpu` issues `DC CIVAC` (clean-invalidate by VA to PoC) instructions across the buffer range. The cost is proportional to buffer size:

$$\text{sync cost} \approx \frac{S}{64} \text{ cache maintenance operations}$$

For a 4K frame ($3840 \times 2160 \times 2 = 16{,}588{,}800$ bytes) that is $\approx 259{,}200$ operations — non-trivial on a mobile CPU at 120 fps.

Drivers using `dma_alloc_coherent()` bypass this: coherent memory is marked non-cacheable (or write-combining) in the page tables, so the CPU never caches it and no sync is needed. The tradeoff is slower CPU reads of that memory.

### Media Controller and Pipelines

A raw V4L2 device models a single data source. A real embedded camera is a pipeline:

```
[Sensor] → [CSI-2 Receiver] → [ISP] → [Scaler] → [Memory Interface]
```

Each block has independent configuration: exposure on the sensor, lane count on the CSI-2 receiver, debayering algorithm on the ISP. The **Media Controller** API (`/dev/mediaN`) models this as a directed graph. Nodes are *entities* (each backed by a `struct media_entity`). Entities expose *pads* (input or output ports). *Links* connect pads across entities and can be individually enabled or disabled.

Before streaming, userspace must:
1. Open `/dev/mediaN` and enumerate the graph with `MEDIA_IOC_ENUM_ENTITIES` / `MEDIA_IOC_ENUM_LINKS`
2. Enable the required links with `MEDIA_IOC_SETUP_LINK`
3. Set formats on each subdevice pad via `/dev/v4l-subdevN` using `VIDIOC_SUBDEV_S_FMT`
4. Only then open `/dev/videoN` and begin the V4L2 buffer dance

Skipping step 3 is a common source of `EPIPE` errors when calling `VIDIOC_STREAMON` — the pipeline is topologically incomplete.

---

## How It Works

### Buffer Lifecycle: The MMAP Path

The state machine every capture application follows:

```
VIDIOC_REQBUFS      → allocate N kernel buffers; driver calls vb2_queue_init
VIDIOC_QUERYBUF     → retrieve each buffer's mmap offset and length
mmap()              → install userspace mapping; driver calls remap_pfn_range()
VIDIOC_QBUF         → transfer buffer ownership to device
VIDIOC_STREAMON     → arm DMA; driver programs base address registers
[hardware fills buffers, raises interrupt]
VIDIOC_DQBUF        → transfer ownership to CPU; blocks until a buffer is ready
  [application reads frame data]
VIDIOC_QBUF         → return buffer to device
VIDIOC_STREAMOFF    → halt DMA; driver waits for in-flight transfers to complete
munmap() + close()  → driver calls dma_free_coherent on each buffer
```

The offset returned by `VIDIOC_QUERYBUF` is **not** a file offset. It is an opaque token — typically `buffer_index * PAGE_ALIGN(buffer_size)` — that the driver's `.mmap` file operation decodes to locate the physical buffer. The driver then calls `remap_pfn_range()` to wire the process's virtual pages to the buffer's physical pages:

```c
/* Inside driver .mmap handler, simplified: */
unsigned long pfn = virt_to_phys(buf->cpu_addr) >> PAGE_SHIFT;
return remap_pfn_range(vma, vma->vm_start, pfn,
                       vma->vm_end - vma->vm_start,
                       vma->vm_page_prot);
```

After `remap_pfn_range`, any write by the DMA engine to the physical buffer is immediately visible at the userspace virtual address — no copy, no syscall.

### Kernel-Side Buffer Allocation

```c
#include <linux/dma-mapping.h>

struct my_buffer {
    void        *cpu_addr;   /* kernel virtual address */
    dma_addr_t   dma_handle; /* bus address for device registers */
    size_t       size;
};

static int alloc_frame_buffers(struct device *dev,
                                struct my_buffer *bufs, int n)
{
    for (int i = 0; i < n; i++) {
        bufs[i].size = PAGE_ALIGN(FRAME_SIZE);
        bufs[i].cpu_addr = dma_alloc_coherent(dev,
                                               bufs[i].size,
                                               &bufs[i].dma_handle,
                                               GFP_KERNEL);
        if (!bufs[i].cpu_addr)
            return -ENOMEM;
        /* Program bufs[i].dma_handle into hardware descriptor
