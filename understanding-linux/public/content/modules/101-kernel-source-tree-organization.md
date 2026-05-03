---
id: 101
title: "Kernel source tree organization"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

When you modify the kernel — fixing a bug, adding a driver, tuning scheduler behavior — you need to know where to look. The source tree is partitioned by *concern*, and those partitions are enforced both by convention and by the Kbuild system that governs what gets compiled into a given image. A file in `mm/` can call an abstraction declared in `include/linux/` and trust that the architecture-specific implementation lives in `arch/<target>/mm/`. Break that partitioning and you either introduce unportable code into a shared path or duplicate logic that already exists. The directory layout is not cosmetic — it is the kernel's first layer of modularity.

---

## Core Concepts

### `arch/` — The Architecture Boundary

`arch/` contains code that *cannot* be written in portable C: it depends on specific processor instructions, hardware initialization sequences, or ABI constraints imposed by the CPU. Each supported architecture gets its own subdirectory — `arch/x86/`, `arch/arm64/`, `arch/riscv/` — and within each you find:

- `mm/` — page table manipulation, TLB flushes, physical memory map initialization
- `kernel/` — context switch implementation, interrupt/exception entry and exit, CPU bringup
- `include/asm/` — register layouts, calling convention types, per-arch constants like `PAGE_SIZE`

The tradeoff is explicit: code in `arch/` can be maximally optimal; code outside `arch/` must compile and run correctly on every target. Linux enforces portability for policy (scheduling decisions, memory allocation strategy) and delegates mechanism (writing a page table entry, flushing a cache line) to `arch/`. This is why improving the OOM killer in `mm/oom_kill.c` benefits ARM and x86 simultaneously — it calls `arch/` hooks but contains none itself.

### `mm/` — Memory Management

Contains the architecture-independent core of virtual memory: the buddy allocator (`mm/page_alloc.c`), the slab/slub allocator (`mm/slab.c`, `mm/slub.c`), the OOM killer (`mm/oom_kill.c`), memory-mapped file logic (`mm/filemap.c`), and swap (`mm/swap.c`, `mm/swapfile.c`). Architecture-specific hooks — writing PTEs, flushing TLBs — are declared as weak symbols or function pointers and implemented in `arch/<target>/mm/`.

The buddy allocator manages memory in power-of-two page blocks. A block at order $k$ contains $2^k$ contiguous pages. With base page size $P = 2^{12} = 4096$ bytes and maximum order $K = 11$ (as defined by `MAX_ORDER` on most configurations), the largest single allocation the buddy allocator can satisfy is:

$$2^{K-1} \cdot P = 2^{10} \cdot 4096 = 4{,}194{,}304 \text{ bytes} = 4 \text{ MiB}$$

When a request for order $k$ arrives and no free block exists, the allocator splits an order-$(k+1)$ block into two *buddies*. The buddy of a block at physical page frame number $n$ at order $k$ is at frame:

$$n \oplus 2^k$$

This XOR relationship is why merging is $O(1)$: you know the buddy's address without searching.

### `fs/` — Virtual Filesystem and Concrete Filesystems

The VFS lives in `fs/` and provides the abstract objects — `struct super_block`, `struct inode`, `struct dentry`, `struct file` — that all syscalls operate on. Concrete filesystems implement the operation tables those objects point to. For example, `struct file_operations` in `include/linux/fs.h`:

```c
struct file_operations {
    ssize_t (*read)  (struct file *, char __user *, size_t, loff_t *);
    ssize_t (*write) (struct file *, const char __user *, size_t, loff_t *);
    int     (*mmap)  (struct file *, struct vm_area_struct *);
    int     (*open)  (struct inode *, struct file *);
    /* ... */
};
```

When `read(2)` enters the kernel, it resolves the file descriptor to a `struct file`, then calls `file->f_op->read()`. Whether that dispatch lands in `fs/ext4/file.c` or `fs/proc/inode.c` is invisible to the caller. Each concrete filesystem registers its own `file_operations` at mount time. `fs/proc/`, `fs/sysfs/`, and `fs/debugfs/` are not filesystems in the storage sense — they are interfaces to kernel state that happen to use the VFS abstraction.

### `net/` — Networking Stack

Organized by protocol family. `net/ipv4/` contains TCP (`net/ipv4/tcp.c`, `net/ipv4/tcp_input.c`, `net/ipv4/tcp_output.c`), UDP, ICMP, and IP routing. `net/core/` contains the socket abstraction layer (`net/core/sock.c`) and the network device API (`net/core/dev.c`) — the boundary between protocol logic and hardware drivers. `net/` contains no hardware-specific code; hardware drivers live in `drivers/net/` and register themselves through `struct net_device_ops` defined in `include/linux/netdevice.h`.

The layering is strict: a TCP segment travels from `net/ipv4/tcp_output.c` → `net/ipv4/ip_output.c` → `net/core/dev.c` → `drivers/net/ethernet/<vendor>/`. Breaking this path (e.g., calling driver functions directly from TCP) would prevent any non-Ethernet transport from working with TCP.

### `drivers/` — Hardware Drivers

The largest directory by file count, organized by device class: `drivers/block/`, `drivers/net/`, `drivers/usb/`, `drivers/gpu/drm/`, `drivers/char/`, `drivers/pci/`. Drivers are *consumers* of every other subsystem: they allocate memory via `mm/`, log via `kernel/printk.c`, expose themselves via the device model in `drivers/base/`, and implement subsystem-specific operation structs.

A network driver in `drivers/net/ethernet/intel/igc/` implements `struct net_device_ops`, allocates DMA-coherent memory via `dma_alloc_coherent()`, and calls `netif_rx()` to hand received frames up to `net/core/`. It knows nothing about TCP.

### `kernel/` — Core Kernel Mechanisms

The scheduler (`kernel/sched/`), signal delivery (`kernel/signal.c`), timers (`kernel/time/`), RCU (`kernel/rcu/`), locking primitives (`kernel/locking/`), and `printk` (`kernel/printk/`) all live here. This directory contains code that governs process and system lifecycle — what runs, when it preempts, and how it receives asynchronous events. It is not a catch-all; `kernel/` code is specifically what mediates between hardware events and process state.

### `lib/` — Kernel-Internal Library Code

Because the kernel cannot link against libc, common utilities are reimplemented here: string operations (`lib/string.c`), sorting (`lib/sort.c`), red-black trees (`lib/rbtree.c`), CRC variants (`lib/crc32.c`), and bitmap manipulation (`lib/bitmap.c`). These are pure utilities: no hardware dependency, no policy, callable from anywhere in the kernel. When you see `rb_insert_color()` used in the memory management code to track VMAs, the implementation is in `lib/rbtree.c`.

### `include/` — Shared Headers

`include/linux/` holds headers shared across all architectures. `include/uapi/linux/` holds headers that cross the kernel/user boundary — syscall numbers, `ioctl` command definitions, structures like `struct stat` that userspace programs use directly. Architecture-specific headers live in `arch/<target>/include/asm/` and are accessed via `#include <asm/foo.h>`, which the build system resolves by adding `-I arch/<target>/include` to the compiler invocation. The indirection is what lets `mm/slab.c` include `<asm/page.h>` and compile unmodified on both ARM64 and x86-64.

---

## How It Works

### The Kbuild Makefile Hierarchy

The kernel uses a recursive Kbuild system. Each directory contains a `Makefile` (sometimes named `Kbuild`) that declares which object files belong to the build. The top-level `make` walks this tree; whether a subdirectory is compiled at all depends on `CONFIG_*` variables set by `Kconfig`. For example:

```makefile
# drivers/net/ethernet/intel/Makefile
obj-$(CONFIG_IGC)    += igc/
obj-$(CONFIG_E1000E) += e1000e/
obj-$(CONFIG_E1000)  += e1000/
```

When `CONFIG_IGC=m`, the igc driver compiles as a loadable module (`.ko`). When `CONFIG_IGC=y`, it links directly into `vmlinux`. When unset, none of those files are compiled. This is how a single source tree produces a 3 MiB embedded kernel and a 10 MiB server kernel from identical sources — configuration selects the subgraph of the Makefile tree that participates in the build.

To see what configuration option governs a specific file:

```bash
# From the kernel source root — find what CONFIG symbol enables a driver
grep -r "igc" drivers/net/ethernet/intel/Makefile

# Inspect the full Kconfig entry for that symbol
grep -A 10 'config IGC' drivers/net/ethernet/intel/igc/Kconfig
```

### Header Inclusion and Architecture Resolution

When kernel code writes:

```c
#include <linux/slab.h>   /* slab allocator API — architecture-independent */
#include <asm/page.h>     /* PAGE_SIZE, pte_t — architecture-specific */
```

The compiler resolves `linux/slab.h` to `include/linux/slab.h` unconditionally. It resolves `
