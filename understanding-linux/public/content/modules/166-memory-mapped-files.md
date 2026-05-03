---
id: 166
title: "Memory-mapped files"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

`read()` crosses a syscall boundary, acquires locks, and copies bytes from the page cache into a userspace buffer. Every call. `mmap()` does the same work once — at fault time — then gets out of the way. After the initial fault, reading byte `p[i]` compiles to a single load instruction; the MMU resolves the virtual-to-physical translation in hardware without entering the kernel. That difference is why SQLite, LMDB, and the JVM class loader all use `mmap` for read-heavy workloads: random access over a large file via `read()` means one syscall per access pattern change, while `mmap` amortizes all kernel involvement to the first touch of each 4 KiB page.

The less obvious consequence: `mmap` makes the page cache directly visible in your address space. When you understand that, you can explain why RSS grows without heap allocation, why two unrelated processes share physical memory without any IPC call, and why a write to a `MAP_SHARED` region immediately appears in another process's mapping with no flush or barrier beyond normal memory ordering.

---

## Core Concepts

### The Page Cache as the Backing Store

The kernel's page cache indexes pages by `(inode, page_index)` where `page_index = file_offset / PAGE_SIZE`. This index is global — not per-process, not per-fd. When any access path (read, write, mmap) brings a file page into memory, it lands in this cache at that key. The critical implication: if two processes call `mmap` on the same file region, the kernel does not allocate two copies of the data. Both processes' page table entries point at the same physical frame in the page cache. The physical memory cost of mapping a 100 MiB file shared by ten processes is still 100 MiB, not 1 GiB.

You can inspect the page cache residency of a specific file with `fincore` (from `util-linux`) or by reading `/proc/self/smaps`:

```bash
# Show which pages of a file are resident in the page cache
fincore /usr/lib/libc.so.6

# Or: map a file and read the Rss/Shared_Clean fields per VMA
cat /proc/self/smaps | grep -A 20 "libc"
```

The kernel exposes aggregate page cache statistics in `/proc/meminfo` under `Cached:` and in `/proc/vmstat` under `pgpgout`, `pgpgin`, `pgfault`, `pgmajfault`.

### Virtual Addresses Are Names, Not Locations

A virtual address is an index into a per-process page table hierarchy. On x86-64, a 48-bit canonical address is decomposed as:

$$\text{vaddr} = [\underbrace{\text{PGD}[9]}_{}|\underbrace{\text{PUD}[9]}_{}|\underbrace{\text{PMD}[9]}_{}|\underbrace{\text{PTE}[9]}_{}|\underbrace{\text{offset}[12]}_{}]$$

The MMU walks this four-level table (PGD → PUD → PMD → PTE) to produce the physical address:

$$\text{phys} = \text{PTE}.\text{pfn} \times 4096 + (\text{vaddr} \mathbin{\&} 0\text{xFFF})$$

`mmap()` allocates a VMA — a kernel data structure (`struct vm_area_struct` in `mm/mmap.c`) that records the virtual range, permissions, and backing file — but writes nothing into the PTE slots. They remain zeroed, meaning "not present." The MMU raises a fault on the first access to any page within the VMA.

### Demand Paging: Minor vs. Major Faults

A not-present PTE causes a hardware exception that transfers control to `do_page_fault()` (x86) or `do_mem_abort()` (ARM64), which dispatches to `handle_mm_fault()` in `mm/memory.c`. For a file-backed VMA, the fault handler calls the file's `vm_ops->fault()` — for ext4, xfs, and most filesystems this eventually calls `filemap_fault()` in `mm/filemap.c`. That function:

1. Looks up the page in the page cache at `(mapping, index)`.
2. **Cache hit (minor fault):** calls `vm_insert_page()` or equivalent to write the PFN into the PTE, marks the page referenced, returns. No I/O.
3. **Cache miss (major fault):** allocates a page cache slot, submits a block I/O request, waits, then installs the PTE.

The distinction matters for profiling. `perf stat` reports `page-faults` (total) and you can separate them:

```bash
# Count minor and major faults for a process
perf stat -e minor-faults,major-faults ./your_binary

# Or observe in real time via /proc
awk '/^MinFlt|^MajFlt/ {print}' /proc/$(pgrep your_binary)/status
```

Major faults are the ones that hurt. If your working set fits in RAM and you're seeing major faults after the first pass, something is evicting your pages — check memory pressure with `vmstat 1` and look at `si`/`so` (swap in/out) and `b` (blocked on I/O).

### File-Backed vs. Anonymous Pages: Reclaim Asymmetry

File-backed pages carry their own backing store: the file. A clean (unmodified) file-backed page can be reclaimed by the kernel at any moment by simply dropping it — no write needed, because the file on disk already holds the authoritative copy. A dirty file-backed page must be written back first (`writeback` subsystem, `mm/page-writeback.c`). Anonymous pages (heap, stack, `MAP_ANONYMOUS`) have no file backing; they go to swap if reclaim pressure is high.

This asymmetry is why `vm.swappiness` exists as a tunable:

```bash
sysctl vm.swappiness          # default 60
sysctl -w vm.swappiness=10    # bias reclaim toward file-backed pages
```

At swappiness 0, the kernel avoids swapping anonymous pages as long as any file-backed pages can be reclaimed instead. At swappiness 100, it treats both equally. For a workload that maps large files and also has a hot heap, low swappiness keeps the heap resident at the cost of more cache misses on cold file regions.

### MAP_SHARED vs. MAP_PRIVATE: What COW Actually Does

`MAP_SHARED` maps PTE entries directly to page cache frames with the requested protection. A write to a shared writable mapping modifies the page cache page in place, marks it dirty, and is immediately visible to every process mapping that region — the kernel's `rmap` (reverse mapping) infrastructure in `mm/rmap.c` tracks all PTEs pointing at a given physical frame.

`MAP_PRIVATE` installs read-only PTEs pointing at the same page cache frames, even if `PROT_WRITE` was requested. The first write triggers a protection fault (not a not-present fault). `do_wp_page()` in `mm/memory.c` handles it:

1. Allocates a new anonymous page.
2. Copies the page cache content into it (`copy_user_highpage`).
3. Replaces the PTE with a writable entry pointing at the new frame.
4. Decrements the refcount on the original page cache frame.

The private copy is now anonymous. It is no longer connected to the file. Subsequent writes to that page are invisible to other processes and will not appear on disk even after `msync()`. The cost is $O(1)$ per page, paid exactly once per written page.

The practical consequence: `MAP_PRIVATE` on a 500 MiB file costs zero extra physical memory until you write to it. Each written page costs one additional 4 KiB frame. If you write to $n$ pages, RSS increases by $n \times 4\,\text{KiB}$ beyond what the shared cache already holds.

---

## How It Works

### The mmap Lifecycle

```
Process                     Kernel (sys_mmap)            Fault Path
  |                            |                            |
  |-- mmap(fd, off, len) ----> |                            |
  |                            | alloc vm_area_struct       |
  |                            | set vma->vm_file = file    |
  |                            | vma->vm_ops = &ext4_ops    |
  |                            | insert into mm->mmap tree  |
  |<-- returns vaddr --------- |                            |
  |                            |                            |
  |-- load [vaddr+N] --------> |                            |
  |   (PTE is zero/not-present)|                            |
  |                            |<--- #PF exception -------- |
  |                            | handle_mm_fault()          |
  |                            |   filemap_fault()          |
  |                            |     page cache lookup      |
  |                            |     hit:  install PTE ─────────> TLB fill
  |                            |     miss: submit bio        |
  |                            |           wait for I/O     |
  |                            |           install PTE ─────────> TLB fill
  |                            | iret / return to userspace |
  |<-- load completes -------- |                            |
```

### Address Space Layout and VMA Inspection

Every VMA is a `struct vm_area_struct`. You can see the kernel's view of all VMAs for any process:

```bash
# Human-readable VMA list
cat /proc/$$/maps

# Extended stats per VMA (RSS, shared/private dirty/clean, swap)
cat /proc/$$/smaps

# Compact hex summary (useful for diffing before/after mmap)
cat /proc/$$/smaps_rollup
```

A line from `/proc/self/maps`:

```
7f3a2c021000-7f3a2c176000 r-xp 00021000 fd:01 1234567  /usr/lib/libc.so.6
```

Fields: `start-end  perms  file_offset  dev:ino  pathname`

The `p` vs
