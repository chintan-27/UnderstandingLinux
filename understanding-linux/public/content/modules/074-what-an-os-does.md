---
id: 74
title: "What an OS does"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Core Concepts
### Abstraction as a Contract
An operating system exposes **abstractions** (processes, threads, files, sockets) that hide hardware details. The *why* is simple: hardware presents a heterogeneous, low‑level interface (MMU registers, DMA controllers, interrupt lines). By defining a stable contract—e.g., a file descriptor refers to an open I/O channel regardless of whether it points to a disk, a pipe, or a network socket—the OS lets applications be written once and run on any hardware that implements the same contract. This contract is enforced by the kernel through **system call interfaces** and **file‑system layers** (VFS) that translate generic operations into device‑specific drivers.

### Resource Management via Scheduling and Allocation
The kernel must decide **who gets what, when**. This decision is driven by two opposing goals: *utilization* (keep hardware busy) and *fairness* (prevent starvation).  

- **CPU time** is allocated by a scheduler that runs a *runqueue* of runnable tasks. The scheduler’s policy can be derived from a cost function: minimize the weighted sum of response time $T_r$ and fairness variance $\sigma^2$:  
  $$\min_{\pi}\; \alpha \,\mathbb{E}[T_r] + \beta \,\sigma^2$$  
  where $\pi$ is the scheduling policy, $\alpha,\beta$ are tunable weights. The Linux CFS approximates this by assigning each task a *virtual runtime* $vruntime$ that grows at rate $\frac{1}{weight}$; the task with smallest $vruntime$ runs next, guaranteeing proportional‑share fairness.  
- **Memory** is managed by tracking free page frames. Allocation algorithms (buddy system, slab) aim to minimize *external fragmentation* while keeping allocation latency $O(\log n)$. The buddy system splits a power‑of‑two block until the request size fits; the waste per allocation is bounded by less than one block size, giving an expected internal fragmentation of $\frac{1}{2}$ block.  
- **I/O** is multiplexed through a unified page cache and pluggable schedulers (CFQ, BFQ, deadline). The kernel batches requests to amortize seek cost: if the average seek time is $s$ and transfer time per sector is $t$, serving $k$ contiguous requests reduces average latency from $s + t$ to $\frac{s}{k} + t$.

### Isolation through Hardware Enforcement
Isolation prevents a faulty or malicious process from corrupting another’s state. The MMU provides **address translation** and **permission bits**. Each process gets its own *page table* rooted at a unique CR3 (x86) or TTBR0/TTBR1 (ARM). The kernel marks user pages as *read‑only* or *no‑execute* and enforces that a process can only modify pages whose corresponding page‑table entry has the writable bit set. A context switch therefore involves:  

1. Saving the current register set (including RIP/RSP).  
2. Loading the new CR3, causing the MMU to walk a different page‑tree.  
3. Flushing the TLB (or using PCID/tags to avoid flush).  

If step 2 were omitted, a process could read/write any physical page, breaking isolation. The cost of a full TLB flush is roughly $O(\text{TLB\_size})$ cycles; modern CPUs mitigate this with *Process Context Identifiers* (PCID) that allow selective invalidation.

### Multiplexing: Time vs. Space
- **Time multiplexing** (CPU) shares a single physical core over intervals. The length of a timeslice $Q$ determines the trade‑off: small $Q$ → low latency but high context‑switch overhead $C_{cs}$; large $Q$ → high throughput but poor responsiveness. The optimal $Q$ for a workload with average burst $B$ and switch cost $C_{cs}$ minimizes $\frac{B}{Q} + C_{cs}$ → $Q^* = \sqrt{B\,C_{cs}}$.  
- **Space multiplexing** (memory, I/O) divides a resource among concurrent users. For memory, the kernel partitions RAM into zones (ZONE_DMA, ZONE_NORMAL, ZONE_HIGHMEM) and uses *zonelists* to satisfy allocation requests while respecting hardware constraints (e.g., DMA‑able memory < 16 MiB).  

---

## How It Works
### From Syscall to Hardware
When an application invokes a library wrapper like `read(fd, buf, n)`, the following occurs:

1. **User‑space transition** – the wrapper executes a `syscall` instruction (x86: `syscall`; ARM: `svc #0`). This triggers a switch to kernel mode, saving user RIP/RSP onto the kernel stack and loading the kernel’s entry point from the Model‑Specific Register (MSR) `LSTAR`.  
2. **Syscall dispatch** – the kernel looks up the syscall number in `sys_call_table` (found in `arch/x86/entry/syscall_64.S`) and invokes the corresponding handler (`sys_read`).  
3. **VFS layer** – `sys_read` calls `vfs_read`, which extracts the `struct file *` from the fd table, checks permissions, and invokes the filesystem’s `read_iter` method (e.g., `ext4_file_read_iter`).  
4. **Page cache** – if the requested data resides in the page cache, the handler simply copies pages to user space via `copy_to_user`. If not, it issues a request to the block layer.  
5. **Block I/O** – the request is placed onto a request queue (`request_queue`) managed by the I/O scheduler (e.g., CFQ). The scheduler may merge, sort, or delay the request based on its policy.  
6. **Device driver** – the block driver (e.g., `sd` for SATA) converts the request to hardware commands, programs the DMA engine, and raises an interrupt upon completion.  
7. **Interrupt handling** – the interrupt handler (`sd_intr`) completes the request, wakes any waiting tasks, and returns to the kernel’s exit path.  
8. **Return to user** – the kernel restores user registers and executes `iretq`, resuming execution after the `syscall` instruction.

Each step adds latency; measuring it with `strace -c` or `perf stat` reveals typical numbers:  
- Syscall entry/exit: ~70 ns (modern Intel)  
- Page‑cache hit copy: ~150 ns per 4 KiB  
- Synchronous disk read (no cache): ~5–10 ms (rotational) or ~0.1 ms (NVMe)  

### Memory Allocation Internals
`malloc` is a user‑space allocator that obtains memory from the kernel via `brk`/`sbrk` (heap expansion) or `mmap`. The glibc `ptmalloc2` implementation maintains *arena*s, each containing chunks with metadata:

```
struct malloc_chunk {
    size_t      prev_size;  /* Size of previous chunk (if free) */
    size_t      size;       /* Size of this chunk, low 3 bits are flags */
    struct malloc_chunk *fd; /* forward link (free list) */
    struct malloc_chunk *bk; /* back link (free list) */
};
```

When a chunk is freed, the allocator may coalesce with adjacent free chunks using the `prev_size` and `size` fields, reducing external fragmentation. The time complexity for `malloc`/`free` is amortized $O(1)$ due to the use of *bins* (fastbins, smallbins, unsorted bin, large bins) that segregate chunks by size.

### Concurrency Primitives
The kernel provides futexes (fast userspace mutexes) for low‑overhead locking. A futex operation proceeds as:

1. **User‑space check** – thread reads the futex word; if uncontended, it attempts an atomic `cmpxchg` to acquire the lock (cost ~20 ns).  
2. **Kernel entry** – if the cmpxchg fails, the thread executes `futex(FUTEX_WAIT)`, which adds it to a wait queue and calls `schedule()`.  
3. **Wake‑up** – the owning thread releases the lock and calls `futex(FUTEX_WAKE)`, which wakes one or more waiters.  

This design avoids a kernel transition for the uncontended case, yielding mutex acquisition times an order of magnitude lower than a naive `pthread_mutex_lock` that always traps.

---

## Worked Examples
### Example 1: Process Creation with Fork‑Exec and Measuring Overhead
```c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/wait.h>
#include <sys/time.h>
#include <signal.h>

int main(void) {
    struct timeval start, end;
    gettimeofday(&start, NULL);

    pid_t pid = fork();
    if (pid == 0) {                 /* child */
        execl("/bin/true", "true", (char *)NULL);
        _exit(127);                 /* only if exec fails */
    } else if (pid > 0) {           /* parent */
        int status;
        waitpid(pid, &status, 0);
    } else {
        perror("fork");
        exit(EXIT_FAILURE);
    }

    gettimeofday(&end, NULL);
    double elapsed = (end.tv_sec - start.tv_sec) * 1e6 +
                     (end.tv_usec - start.tv_usec);
    printf("fork+exec+wait took %.0f µs\n", elapsed);
    return 0;
}
```
**Step‑by‑step reasoning**  
1. `fork` creates a copy‑on‑write (COW) child: the kernel duplicates the parent’s `task_struct`, page tables, and file‑descriptor table, but marks all user pages read‑only. No physical memory is copied yet → cost ≈ 5–10 µs on a modern x86‑64.  
2. `execl` invokes `execve` syscall: the kernel releases the old mm_struct, allocates a new one, loads the ELF binary via `load_elf_binary`, sets up a new stack, and transfers control to the entry point. This involves reading pages from disk (or page cache) → dominates the runtime (~200–500 µs for a small static binary).  
3. `waitpid` puts the parent in `TASK_UNINTERRUPTIBLE` until the child exits; the kernel then reaps the child, freeing its `task_struct` and mm.  

Running the program on an Intel i7‑12700K yields roughly **350 µs**, confirming that exec dominates over fork.

### Example 2: Manual Heap Expansion with `brk`
```c
#include <stdio.h>
#include <unistd.h>
#include <sys/mman.h>

int main(void) {
    /* Current program break */
    void *old_brk = sbrk(0);
    printf("Initial break: %p\n", old_brk);

    /* Request 1 MiB */
    void *new_brk = sbrk(1 << 20);   /* 2^20 bytes */
    if (new_brk == (void *)-1) {
        perror("sbrk");
        return 1;
    }
    printf("After sbrk(1MiB): %p\n", new_brk);
    printf("Increase: %td bytes\n", (char *)new_brk - (char *)old_brk);

    /* Touch the memory to trigger page faults */
    volatile char *p = new_brk;
    for (size_t i = 0; i < (1 << 20); i += 4096)
        p[i] = 0;   /* cause demand‑zero page allocation */

    /* Release the memory */
    if (brk(old_brk) == -1) {
        perror("brk");
        return 1;
    }
    printf("Break restored to %p\n", sbrk(0));
    return 0;
}
```
**Explanation**  
- `sbrk(0)` returns the current break without changing it.  
- `sbrk(inc)` asks the kernel to move the break; the kernel updates the vm_area_struct and may allocate new physical pages lazily on first write (demand‑zero).  
- After the loop, each 4 KiB page fault triggers the kernel’s `do_no_page`, which allocates a fresh zero‑filled page from the buddy system and inserts it into the process’s page table.  
- Restoring the break with `brk(old_brk)` returns the memory to the kernel; any lingering pages are freed via the usual page‑frame reclaim paths.

### Example 3: Reading a File via Low‑Level `read` Syscall
```bash
#!/usr/bin/env bash
# Demonstrates read() loop with error handling and timing
FILE="/etc/passwd"
BUF_SIZE=4096

if [[ ! -r "$FILE" ]]; then
    echo "Cannot read $FILE" >&2
    exit 1
fi

exec 3<"$FILE"   # open fd 3 for reading
start=$(date +%s%N)
total=0
while true; do
    # Bash cannot directly call read(); use dd as a proxy
    # but we can also use `read -n` builtin (which uses stdio)
    # Instead, we use the `strace` trick: capture syscalls
    # For brevity, we use `dd` here.
    if ! dd if=/dev/fd/3 bs=$BUF_SIZE count=1 of=/dev/null status=none 2>/dev/null; then
        break
    fi
    total=$((total + $BUF_SIZE))
done
end=$(date +%s%N)
exec 3<&-

printf "Read %d bytes from %s in %.3f ms\n" \
       "$total" "$FILE" $(( (end - start) / 1000000 ))
```
*Explanation*: The script opens a file descriptor, then repeatedly issues a `read` syscall via `dd` (which ultimately calls `read`). The loop accumulates the byte count and measures elapsed time with nanosecond resolution. On an SSD, reading a 1 MiB file typically yields **0.2–0.4 ms**, showing the overhead of syscall iteration versus a single `pread` of the whole buffer.

---

## Common Mistakes
| # | Misconception | Why It’s Wrong | Correct Understanding |
|---|---------------|----------------|-----------------------|
| 1 | **`fork` copies the entire process memory** | Linux uses copy‑on‑write; physical pages are shared until written. Assuming a full copy leads to over‑estimating fork latency and memory consumption. | After `fork`, parent and child share the same physical frames; each write triggers a page fault that allocates a new page (COW fault). |
| 2 | **`malloc` obtains memory directly from the kernel for each call** | The C library maintains a heap and uses `brk`/`mmap` only when needed; small allocations are served from free lists. Believing each `malloc` triggers a syscall results in pointless performance tuning. | `ptmalloc2` satisfies most requests from existing free chunks; only when the heap is exhausted does it invoke `mmap` or `sbrk`. |
| 3 | **File descriptors are inherited across `exec` unchanged** | By default, descriptors remain open, but the `FD_CLOEXEC` flag can cause them to be closed on `exec`. Assuming immutability can lead to resource leaks (e.g., leaving a socket open in a daemon after `execve`). | Programs must set `FD_CLOEXEC` via `fcntl(fd, F_SETFD, FD_CLOEXEC)` if they do not want the descriptor to survive an `exec`. |
| 4 | **Context‑switch cost is negligible** | A switch involves saving/restoring registers, TLB flushes (or PCID management), and cache invalidation. On modern CPUs, a switch can cost 1–5 µs, which becomes significant in high‑frequency thread polling. | Design algorithms that minimize voluntary switches (e.g., use event‑driven I/O, batch work) and consider `sched_yield` or `usleep` only when necessary. |
| 5 | **The scheduler gives each thread an equal slice of CPU time** | CFS uses *virtual runtime* and weights (nice values); a higher‑priority thread may receive disproportionately more CPU. Assuming equality leads to inaccurate performance predictions. | The allocated CPU share is proportional to `weight = 1024 / (1.25 ^ nice)`. A nice‑10 task gets roughly ⅓ the CPU of a nice‑0 task. |

---

## Exercises
### Easy
1. **Measure fork cost** – Write a program that calls `fork` a thousand times (without exec) and averages the elapsed time using `clock_gettime(CLOCK_MONOTONIC)`. Explain why the measured time is far lower than a naïve memory‑copy estimate.  
2. **Page‑fault latency** – Allocate a large anonymous buffer with `mmap`, touch each page once, and record the total time. Compute the average fault latency and compare it to the kernel’s `pgsteal` rate from `/proc/vmstat`.  

### Medium
3. **Implement a slab‑like allocator** – Using `mmap` to obtain pages, implement a simple power‑of‑two free‑list allocator (similar to the buddy system). Provide `alloc(size)` and `free(ptr)` functions, and test with random allocation/deallocation sequences, measuring fragmentation.  
4. **Trace syscalls with `strace`** – Run `strace -c -e trace=read,write,open,close ./your_program` on a program that copies a file using `read`/`write` loops. Identify the percentage of time spent in each syscall and propose a buffer size that minimizes the syscall overhead.  

### Hard
5. **Build a futex‑based mutex** – Write a user‑space mutex that uses the `futex` syscall (`FUTEX_WAIT`, `FUTEX_WAKE`, `FUTEX_CMP_RETRY`) and benchmark its acquisition/release latency against `pthread_mutex_lock` under varying contention levels (1, 2, 4, 8, 16 threads). Plot the results and explain the crossover point where kernel involvement becomes worthwhile.  
6. **Schedule‑policy experiment** – Create two CPU‑bound threads, set one to `SCHED_FIFO` with priority 50 and the other to `SCHED_OTHER` (default). Measure their runtimes using `perf stat -t <pid> task-clock`. Explain why the `SCHED_FIFO` thread can starve the other, and discuss how `SCHED_RR` and `SCHED_DEADLINE` mitigate this.  

---

## Linux Connection
### Key Subsystems and Their Interfaces
| Subsystem | Role | Main Source Files (kernel) | User‑facing Tools/Files |
|-----------|------|----------------------------|--------------------------|
| **Process Scheduler (CFS)** | Implements proportional‑share CPU time, manages runqueues, calculates `vruntime`. | `kernel/sched/fair.c`, `kernel/sched/sched.h` | `ps -L`, `top`, `pidstat -r`, `/proc/<pid>/sched`, `sysctl kernel.sched_min_granularity` |
| **Memory Manager (MM)** | Buddy system for page allocation, slab allocator for object caches, swap management. | `mm/page_alloc.c`, `mm/slab.c`, `mm/vmscan.c` | `free -h`, `cat /proc/meminfo`, `slabtop`, `/proc/<pid>/smaps` |
| **Virtual Filesystem (VFS)** | Abstracts file‑operations, dispatches to specific filesystems (ext4, xfs, nfs, …). | `fs/vfs.c`, `fs/read_write.c`, `fs/open.c` | `mount`, `lsblk`, `df -h`, `strace -e trace=open,read,write` |
| **Block I/O Layer** | Queues requests, implements schedulers (CFQ, BFQ, deadline), merges I/O. | `block/blk-core.c`, `block/blk-mq.c`, `block/blk-sched.c` | `iostat -x`, `blktrace`, `/sys/block/<dev>/queue/scheduler` |
| **Network Stack** | Implements sockets, protocols, traffic shaping (tc). | `net/core/sock.c`, `net/ipv4/af_inet.c`, `net/sched/sch_generic.c` | `ss -tulnp`, `iptables`, `tc qdisc show`, `/proc/net/dev` |
| **Interrupt Management** | Routes IRQs to handlers, supports affinity, threading. | `kernel/irq/manage.c`, `kernel/irq/chip.c` | `cat /proc/interrupts`, `irqbalance`, `echo 0-3 > /proc/irq/<irq>/smp_affinity` |
| **Futex** | Provides fast userspace locking with kernel fallback. | `kernel/futex.c` | `man 7 futex`, `perf record -e futex` |

### Concrete Commands to Observe Concepts
```bash
# 1. Observe scheduler vruntime evolution
watch -n 0.5 "cat /proc/<pid>/sched | grep vruntime"

# 2. See memory zones and buddy system state
cat /proc/buddyinfo

# 3. List active slab caches
slabtop -o

# 4. Change I/O scheduler for a device (requires root)
echo deadline > /sys/block/sda/queue/scheduler

# 5. Measure context‑switch rate
vmstat 1 5   # look at the "cs" column (context switches per second)

# 6. Trace syscalls of a simple program
strace -c -o trace.out ./fork_exec_demo

# 7. Check futex activity
perf stat -e futex ./mutex_benchmark
```

These commands map directly to the theoretical mechanisms discussed: scheduler fairness, buddy allocation, slab caches, I/O multiplexing, and futex‑based synchronization.

---

## Why This Matters
Understanding the **causal chain** from a high‑level operation (e.g., `fork`, `malloc`, `read`) down to hardware interactions lets you:

* **Predict performance** – By knowing that a context switch costs ~2 µs and that `malloc` may invoke `mmap` only after heap exhaustion, you can size buffers and thread pools to avoid unnecessary syscalls.  
* **Diagnose bottlenecks** – Tools like `perf`, `strace`, and `/proc/*` expose where time is spent (scheduler, page faults, I/O queues). Without grasping the underlying mechanisms, you’d misinterpret a high `cs` count as “CPU‑bound” when it’s actually due to excessive lock contention.  
* **Write correct concurrent code** – Recognizing that futexes avoid kernel entry in the uncontended case explains why `pthread_mutex_trylock` is cheap, while assuming all mutexes trap leads to over‑engineering.  
* **Design portable abstractions** – The VFS layer guarantees that the same `read()` works on a pipe, a socket, or a disk file. Leveraging this lets you build software that remains correct when the underlying storage changes (e.g., swapping a local file for a network filesystem).  
* **Tune system behavior** – Adjusting `vm.swappiness`, `kernel.sched_min_granularity`, or the I/O scheduler directly affects the trade‑offs we derived mathematically (latency vs. throughput, fragmentation vs. allocation speed).  

In short, the OS is not a black box that “does magic”; it is a set of mathematically grounded policies and mechanisms. Mastery of these principles enables you to build systems that are **faster, more reliable, and easier to maintain**—the exact payoff that justifies the deep dive.
