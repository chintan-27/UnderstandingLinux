---
id: 201
title: "Runtime systems"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When a program crashes with a segfault, leaks memory until the OOM killer fires, or corrupts data between function calls, the failure is almost always rooted in how the process's memory is organized and managed at runtime. The operating system hands a process a virtual address space and a set of rules; the runtime system — the C library, the allocator, the language runtime — builds everything the program needs on top of that foundation. Without understanding this layer, you cannot reason about buffer overflows, use-after-free bugs, stack exhaustion, allocator fragmentation, or why a garbage-collected language still causes your system to swap.

---

## Core Concepts

### Virtual Address Space

Every process gets its own private virtual address space. The hardware MMU translates virtual addresses to physical RAM on demand — meaning a page of physical RAM is only assigned when the process first *writes* to it (demand paging). The process believes it owns contiguous memory; the kernel maps those virtual pages to wherever physical RAM is available. Two processes using the same virtual address are using entirely different physical pages.

On x86-64 Linux, user space gets $2^{47}$ bytes (128 TiB) of virtual address space — not because the CPU has 47-bit physical addressing, but because the hardware dedicates 47 bits to user-space virtual addressing (canonical addresses). The kernel occupies the high canonical range from `0xffff800000000000` upward; user space runs from `0x0` to `0x00007fffffffffff`.

You can inspect every mapped region of a live process:

```bash
cat /proc/$$/maps
# or for structured output:
cat /proc/$$/smaps
```

Each line in `/proc/PID/maps` is a VMA (virtual memory area) — the kernel structure `struct vm_area_struct` in `mm/mmap.c` — with its address range, permissions, and backing file if any.

### Segments

The virtual address space is divided into regions with distinct purposes and permissions. These are **not** x86 hardware segments — they are VMAs tracked by the kernel's memory manager (`mm_struct`):

| Region | Contents | Permissions | Grows |
|---|---|---|---|
| Text | Compiled machine instructions | `r-x` | Fixed |
| Data | Initialized globals | `rw-` | Fixed |
| BSS | Zero-initialized globals | `rw-` | Fixed |
| Heap | Dynamic allocations | `rw-` | Upward via `brk` |
| Memory-mapped | Files, shared libs, anonymous | varies | Via `mmap` |
| Stack | Call frames, locals, return addresses | `rw-` | Downward |

BSS exists as a separate segment because zero-initialized globals do not need to occupy space in the binary on disk — the kernel fills those pages with zeros on demand (via the zero page COW mechanism), so a global array `int buf[1048576];` costs nothing in the ELF file. This is why stripping a binary of BSS data does not reduce executable size proportionally to the globals it contains.

Each shared library loaded by the dynamic linker (`ld-linux-x86-64.so.2`) contributes its own text and data VMAs, which is why `cat /proc/$$/maps` shows dozens of entries for a program that links against glibc, libm, and libstdc++.

### The Stack

The stack grows **downward** on x86. The CPU register `rsp` (stack pointer) holds the lowest currently-used address. On a function call, `rsp` decreases by the frame size; on return, `rsp` increases back. The old frame is not zeroed — it is simply abandoned below the new `rsp`. This is precisely why uninitialized local variables contain garbage: they occupy memory that was used by a previous call frame.

Each thread has its own stack. The main thread's stack is placed near the top of user address space and backed by a kernel-managed growable region — the kernel extends it automatically on fault, up to the limit in `/proc/sys/vm/max_map_count` and the `RLIMIT_STACK` resource limit (check with `ulimit -s`, default 8 MiB on most Linux systems). Other threads' stacks are allocated at a fixed size via `mmap` when `pthread_create` is called; they cannot grow automatically.

A guard page — a page with `PROT_NONE` permissions — sits at the bottom of each stack. When `rsp` passes below the valid stack region and touches the guard page, the hardware raises a page fault, the kernel converts it to `SIGSEGV`, and the program terminates. This is the mechanism behind stack overflow crashes.

The stack depth for a call chain of $n$ frames, each consuming $f$ bytes, is:

$$D = \sum_{i=1}^{n} f_i$$

For uniform frame size $f$, $D = n \cdot f$. With the default 8 MiB limit and a frame size of 1 KiB, you get at most $\lfloor 8192 / 1 \rfloor = 8192$ frames before hitting the guard page. Recursive algorithms with large local arrays exhaust this budget quickly.

### The Heap

The heap holds objects whose lifetime outlasts the function that created them, or whose size is not known at compile time. It begins just above the BSS segment. The allocator can extend it in two ways:

- **`brk`/`sbrk`**: moves the *program break* — the upper bound of the contiguous heap region — upward. This keeps a single contiguous arena but cannot return memory to the OS until the break is lowered, which only works if the topmost chunk is free.
- **`mmap(MAP_ANONYMOUS)`**: requests non-contiguous pages anywhere in the address space. These can be returned to the OS immediately via `munmap` when the allocation is freed.

This distinction directly affects memory accounting: a process that frees a large `brk`-allocated block may not return that memory to the OS if smaller live allocations sit above it in the heap. The RSS stays high even though the allocator considers the block free.

### Allocators

User-space allocators (`ptmalloc` inside glibc, `jemalloc`, `tcmalloc`) exist because `mmap` and `brk` operate in page-sized units (4 KiB minimum). Calling the kernel on every `malloc(8)` would serialize every allocation through a syscall — on a modern CPU, a syscall costs roughly $200$–$400$ ns versus $\sim 5$ ns for an L1 cache hit. The allocator amortizes this cost by requesting large chunks (arenas) from the kernel and subdividing them in user space.

For $N$ allocations of size $s$ with per-chunk header overhead $h$ (16 bytes in glibc on x86-64), the minimum heap footprint is:

$$M \geq N \cdot (s + h)$$

Fragmentation — caused by interleaved allocations and frees of varying sizes — makes actual usage exceed this lower bound. Internal fragmentation wastes space within a chunk (padding to alignment); external fragmentation strands free memory between live chunks that cannot be coalesced.

### Garbage Collection and the OS

Garbage-collected runtimes (JVM, Go runtime, CPython's reference counter + cyclic GC) replace explicit `free` with automatic reclamation. The operational consequence is that the GC's notion of "free" and the OS's notion of "free" are decoupled. A Go program that allocates and releases 500 MiB of objects may still show 500 MiB RSS because the runtime holds onto freed pages in its own heap arena rather than calling `munmap` immediately — it expects to reuse them. The runtime only calls `madvise(MADV_FREE)` or `madvise(MADV_DONTNEED)` to release pages back to the OS on its own schedule, or when explicitly triggered (e.g., `runtime.GC()` + `debug.FreeOSMemory()` in Go).

Stop-the-world GC pauses compound this: the GC must halt all application threads, walk the heap to find live pointers, then resume. During the pause, the process is consuming CPU without doing application work, and the OS scheduler sees a burst of threads waking simultaneously afterward.

---

## How It Works

### Stack Frame Layout (x86-64)

Consider a minimal C function:

```c
int add(int a, int b) {
    int result = a + b;
    return result;
}
```

Compiled with `gcc -O0` (no optimization, so the frame is pedagogically clear):

```asm
add:
    push   rbp                        ; save caller's rbp on stack (rsp -= 8)
    mov    rbp, rsp                   ; rbp = frame base for this call
    mov    DWORD PTR [rbp-4],  edi    ; spill arg a (passed in edi per System V ABI)
    mov    DWORD PTR [rbp-8],  esi    ; spill arg b
    mov    eax, DWORD PTR [rbp-4]
    add    eax, DWORD PTR [rbp-8]
    mov    DWORD PTR [rbp-12], eax    ; store result
    mov    eax, DWORD PTR [rbp-12]    ; return value in eax
    pop    rbp                        ; restore caller's rbp (rsp += 8)
    ret                               ; pop return address into rip
```

Arguments `a` and `b` arrive in registers `edi`/`esi` per the System V AMD64 ABI; `-O0` spills them to the stack so the debugger can inspect them. With optimization, they stay in registers and the frame shrinks or disappears entirely.

The stack frame at the point `result` is being computed:

```
  higher addresses
  ┌──────────────────────┐
  │   return address     │  8 bytes — pushed by the call instruction before add: executes
  │   saved rbp          │  8 bytes — push rbp
  │   a        [rbp- 4]  │  4 bytes
  │   b        [rbp- 8]  │  4 bytes
  │   result   [rbp-12]  │  4 bytes
  │   (padding)[rbp-16]  │  4 bytes — compiler aligns rsp to 16 bytes (ABI requirement)
  └──────────────────────┘  ← rsp
  lower
