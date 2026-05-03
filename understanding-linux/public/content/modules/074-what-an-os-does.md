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

## Why This Matters

Without an OS, every program would need to know the exact physical memory addresses of every other program, negotiate CPU time explicitly, drive hardware registers directly, and trust that nothing else would overwrite its data. That model works when one program runs at a time. The instant you want a browser, compiler, and music player running concurrently on one CPU with one physical memory, you have a coordination problem that no individual program can solve from the inside — because solving it requires authority over *all* programs, which no single program has.

The OS exists to hold that authority. The four mechanisms it uses — abstraction, resource management, isolation, and multiplexing — are not convenience features. They are the preconditions for multi-process computing.

---

## Core Concepts

### Abstraction

Hardware interfaces are the wrong level of granularity for application code. A disk exposes sectors numbered by LBA. RAM is a flat array of bytes at physical addresses. A CPU is a state machine with registers and an instruction pointer. Writing an application against those interfaces directly means every application must re-implement geometry translation, physical memory allocation, and device quirks — and must do so correctly even as hardware changes.

The OS interposes once. A *file* replaces the sector-addressed disk: the kernel handles block allocation, indirection tables, and device differences, and presents a named byte stream. A *process* replaces the raw CPU: the kernel tracks register state, manages the instruction pointer, and gives the program the illusion of dedicated execution. The abstraction pays for itself because the translation happens in one place (the kernel) rather than in every application.

The cost is real, though. Every abstraction crossing — a system call — requires saving the full register file, switching the CPU from ring 3 to ring 0, validating arguments, executing kernel code, and returning. On x86-64, a minimal `getpid()` syscall costs roughly 100–300 ns on a modern CPU, which is 200–600 cycles at 2 GHz. Abstractions are worth that cost in almost every case, but you should know it exists.

### Resource Management

Physical resources are *rivalrous*: a 4 KiB page of RAM assigned to process A cannot simultaneously be assigned to process B. The OS is the sole allocator for rivalrous resources because distributed allocation produces conflicts — two programs cannot independently decide who owns physical page 0x1a3000.

The OS tracks every page, every CPU cycle quantum, and every file descriptor, and reclaims them when a process exits (or is killed). Without that reclamation, a process that leaks memory and then crashes would leave those pages permanently unusable until reboot. The OS's `do_exit()` path in the Linux kernel (`kernel/exit.c`) walks all resource tables and releases them unconditionally.

### Isolation

Isolation is a reliability property before it is a security property. If two processes share physical memory with no enforcement, a stray pointer write in one corrupts the other. A crashing process becomes a crashing system.

The mechanism is hardware-enforced virtual address spaces: the CPU's MMU translates every memory access through a page table. The OS installs a *different* page table root (the CR3 register on x86) for each process. Physical page 0x1a3000 might appear at virtual address `0x400000` in process A's page table and not appear at all in process B's. When B tries to access `0x400000`, the MMU finds no valid mapping, raises a page fault, the kernel catches it, and sends SIGSEGV to B. A's memory is untouched.

The same principle applies vertically: user code runs at privilege ring 3, which disables certain instructions (like `hlt`, `in`/`out`, CR3 writes). Kernel code runs at ring 0. A user process cannot write its own page table — it would need to write to CR3, which is privileged. The hardware enforces the boundary on every instruction fetch.

### Multiplexing

One physical resource, many consumers, two strategies:

- **Time sharing**: the resource is given to consumers in rotation. The CPU is the canonical case — each process gets a time slice, then the next runs. At 250 Hz scheduling, each slice is $\frac{1}{250} = 4\text{ ms}$.
- **Space sharing**: the resource is partitioned and each partition assigned to one consumer. RAM is the canonical case — physical pages are divided among processes. Disk is similar.

Some resources use both: RAM is space-shared at the page level, but the *page cache* also multiplexes I/O bandwidth across processes over time.

---

## How It Works

### CPU Multiplexing: The Timer Interrupt and Context Switch

The OS programs the Local APIC (or legacy PIT) to fire a hardware interrupt at a fixed rate — typically 250 Hz on Linux (`CONFIG_HZ=250`). When the interrupt fires:

1. The CPU saves the current instruction pointer, flags, and stack pointer into the process's kernel stack automatically (via the IDT entry).
2. The kernel's interrupt handler saves the remaining general-purpose registers.
3. The scheduler picks the next process (lowest `vruntime` in CFS).
4. The kernel restores that process's saved registers and switches page tables (writes the new process's PGD physical address into CR3).
5. `iret` (or `sysretq`) returns to user mode at the new process's instruction pointer.

The structure the kernel fills per process is `struct task_struct` (defined in `include/linux/sched.h`), which embeds `struct thread_struct` for the architecture-specific register state.

For proportional CPU allocation, stride scheduling assigns CPU shares exactly. Let $T_i$ be the ticket count of process $i$ and $S = 10000$:

$$\text{stride}_i = \frac{S}{T_i}$$

Each time process $i$ runs, its pass value advances:

$$\text{pass}_i \mathrel{+}= \text{stride}_i$$

The scheduler always runs the process with the minimum pass value. With $T_A = 250$, $T_B = 100$, $T_C = 50$:

$$\text{stride}_A = 40, \quad \text{stride}_B = 100, \quad \text{stride}_C = 200$$

Over any window of 400 scheduler ticks, A runs 10 times, B runs 4 times, C runs 2 times — exactly the 5:2:1 ratio of their ticket counts.

Linux's Completely Fair Scheduler (CFS) tracks *virtual runtime* (`vruntime`) instead of a pass value, but the invariant is the same: the process with the minimum `vruntime` runs next. CFS weights `vruntime` accumulation by priority (nice value), so a process with nice $-5$ accumulates `vruntime` more slowly than one with nice $+5$, receiving proportionally more CPU time.

### Memory Multiplexing: Address Translation

A virtual address on x86-64 is a 48-bit quantity (on current hardware) split into five fields used to walk a four-level page table:

$$\underbrace{[47:39]}_{\text{PML4}} \underbrace{[38:30]}_{\text{PDPT}} \underbrace{[29:21]}_{\text{PD}} \underbrace{[20:12]}_{\text{PT}} \underbrace{[11:0]}_{\text{offset}}$$

Each 9-bit index selects one of 512 entries in that level's table. The final page table entry holds the physical page frame number. The physical address is:

$$\text{phys} = (\text{PTE} \mathbin{\&} \sim\texttt{0xFFF}) \mathbin{|} (\text{vaddr} \mathbin{\&} \texttt{0xFFF})$$

The MMU performs this walk in hardware (the TLB caches recent translations). The OS builds and modifies page tables; the hardware enforces them.

A typical 64-bit process virtual address space layout:

```
High addresses (0xFFFFFFFF_FFFFFFFF)
┌─────────────────────────────────┐
│         Kernel space            │  not accessible from ring 3
├─────────────────────────────────┤ ← 0xFFFF800000000000
│     (non-canonical hole)        │
├─────────────────────────────────┤ ← 0x00007FFFFFFFFFFF
│         Stack                   │  grows ↓; initial size ~8 MiB (ulimit -s)
│           ↓                     │
│       (unmapped)                │
│           ↑                     │
│         Heap                    │  grows ↑ via brk()/mmap()
├─────────────────────────────────┤
│      BSS / Data                 │  zero-initialized and initialized globals
├─────────────────────────────────┤
│         Text                    │  r-x; executable code
└─────────────────────────────────┘
Low addresses (0x400000 typical ELF load address)
```

Three processes can each believe they own address `0x400000`. The OS and MMU translate each through a separate page table to three different physical frames. A write by process A to its `0x400000` modifies physical frame $F_A$; process B's `0x400000` maps to $F_B$. The hardware makes this check on every single memory access, not just on allocation.

### The Cost of Filesystem Abstraction

`open("hello.txt", O_CREAT | O_WRONLY, 0644)` hides a sequence of metadata operations on ext4 (or any journaling filesystem). For a file that doesn't yet exist:

1. Walk the directory tree: read the directory's inode, read its data block(s) to search for the name.
2. Read the inode bitmap block to find a free inode number.
3. Write the inode bitmap block to mark that inode allocated.
4. Write the new inode block to initialize metadata (size=0, timestamps, mode).
5. Write the directory data block to add the `name → inode` mapping.
6. Write the directory's inode to update `mtime` and `nlink`.

That's at minimum 5–6 block I/O operations to create an empty file, before `write()` touches content. On spinning disk at 100 random IOPS, that sequence takes $\frac{6}{100} = 60\text{ ms}$. A journaling filesystem adds journal writes on top. This is why `fs
