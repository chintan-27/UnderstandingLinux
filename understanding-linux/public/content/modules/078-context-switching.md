---
id: 78
title: "Context switching"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Why This Matters

Every time your shell runs a program, plays music in the background, or responds to a network packet while compiling code, the CPU is being shared between processes that each believe they own it entirely. This illusion requires the OS to periodically freeze one process mid-execution — saving every bit of its computational state — and restore another. If any register is forgotten, the resumed process produces wrong results or crashes. If the memory mappings aren't swapped correctly, process A reads process B's memory. If the cost is too high, thousands of context switches per second become a measurable performance tax.

---

## Core Concepts

### Register State: The Complete Computational Identity of a Process

A running process is not just its code and data in memory — it is the current values of every CPU register: the instruction pointer (where execution continues), the stack pointer (top of the current call frame), general-purpose registers (live computation in flight), and the flags register (condition codes from the most recent ALU operation). The OS cannot leave any of these unsaved, because the next process will overwrite them in the same physical silicon within nanoseconds.

The critical property that makes this work: a context switch must be **transparent to the resumed process**. From process B's perspective, it ran, then it ran again — the intervening time is unobservable, provided every register is restored exactly, no memory is corrupted, and the saved instruction pointer aims at the exact instruction that was about to execute.

### The Kernel-Mode Stack and the Two-Phase Save

Each process has two stacks: a user-mode stack for its own function calls, and a **kernel-mode stack** used exclusively when that process runs inside the kernel. These are separate because the kernel cannot trust the user-mode stack pointer — a process can set `%rsp` to any value, including NULL.

The save happens in two phases:

1. **Hardware phase**: When an interrupt fires, the CPU automatically pushes `SS`, `RSP`, `RFLAGS`, `CS`, and `RIP` onto the *kernel* stack before jumping to the interrupt handler. This is unconditional and requires no kernel code. The CPU also switches `%rsp` to the kernel stack address stored in the TSS (Task State Segment).

2. **Software phase**: The interrupt handler immediately pushes the remaining general-purpose registers (`RAX`, `RBX`, `RCX`, ...) onto that same kernel stack, completing the `pt_regs` structure. These two halves together form the full user-mode snapshot.

The kernel-mode registers (those the kernel itself uses while running the switch) are saved separately into the process descriptor — not the kernel stack — by the `switch_to` assembly routine.

### The Timer Interrupt: Unconditional CPU Reclamation

A cooperative scheduler could simply wait for processes to yield — and be permanently stalled by any infinite loop. The hardware solution is a **programmable interval timer** (on x86, the APIC timer or legacy PIT), configured at boot to deliver an interrupt every scheduler tick. In Linux, `CONFIG_HZ` sets this frequency (typically 250 Hz, so one tick every 4 ms).

On each tick:
1. The CPU halts the current instruction, switches to ring 0, and saves `RIP`/`RSP`/`RFLAGS` to the kernel stack.
2. The kernel's timer interrupt handler runs, increments `jiffies`, and calls the scheduler's `scheduler_tick()`.
3. `scheduler_tick()` decrements the current process's time slice. If it expires, the process is marked `TIF_NEED_RESCHED`.
4. On the return path from the interrupt, before restoring user-mode registers, the kernel checks `TIF_NEED_RESCHED` and calls `schedule()` if set.

The interrupt is what makes the OS a **preemptive** scheduler — it doesn't ask permission to reclaim the CPU.

### The MMU Context: Why CR3 Must Change

Every process has its own virtual address space backed by its own page tables. If the OS switched general-purpose registers but left the page tables unchanged, process B would execute with process A's memory mappings — its own virtual addresses would resolve to A's physical pages. Code would produce nonsense; data writes would silently corrupt another process.

On x86-64, the page table root is stored in `CR3`. Loading a new `CR3` value:
- Is a privileged instruction (ring 0 only).
- Instantly redirects all subsequent virtual address translations.
- **Flushes the entire TLB**, discarding all cached virtual-to-physical mappings.

Linux tracks each address space in a `struct mm_struct`. The physical address of the top-level page table (`pgd`) is loaded into `CR3` on every switch between processes with different `mm_struct` pointers. Kernel threads share the previous process's `mm_struct` (they have no user-mode mappings), so their switches avoid the `CR3` reload.

---

## How It Works

### The Full Context Switch Sequence

When the timer fires and the scheduler selects process B to replace process A:

```
Timer interrupt fires mid-instruction in A's user space
│
├─ CPU (hardware):
│    push SS, RSP, RFLAGS, CS, RIP → A's kernel stack
│    load RSP from TSS (A's kernel stack pointer)
│    jump to interrupt handler (via IDT entry)
│
├─ entry_64.S (arch/x86/entry/entry_64.S):
│    push all GPRs onto A's kernel stack → struct pt_regs
│    call do_IRQ() / handle_irq()
│
├─ scheduler_tick() marks A with TIF_NEED_RESCHED
│
├─ On interrupt return path:
│    schedule() is called
│    picks process B
│    calls context_switch(rq, A, B)
│
├─ context_switch():
│    switch_mm_irqs_off(A->mm, B->mm, B)  ← loads CR3 if mm differs
│    switch_to(A, B, last)                ← saves A's, restores B's kernel regs
│
├─ switch_to (arch/x86/include/asm/switch_to.h):
│    saves A's: RBX, RBP, R12–R15, RSP, RIP (return address) → task_struct
│    loads  B's: RBX, RBP, R12–R15, RSP, RIP ← task_struct
│    (CPU is now on B's kernel stack, executing B's saved kernel context)
│
└─ unwind through B's interrupt return path:
     restore B's pt_regs (GPRs, RFLAGS) from B's kernel stack
     IRET / SYSRET → restore CS:RIP, SS:RSP to B's user-mode values
     B resumes in user space at the instruction it was interrupted at
```

The double-save structure is deliberate. The user-mode snapshot (in `pt_regs` on the kernel stack) travels with the process as part of its kernel stack — it's already there when needed for signal delivery, ptrace, and the return-from-interrupt path. The kernel-mode snapshot (in `task_struct`) is the minimal set of registers needed to resume execution *inside* the kernel at the point `switch_to` was called.

### The xv6 `swtch` Function

xv6's `swtch` is a stripped-down, readable version of what `switch_to` does in Linux. It saves the current process's kernel registers and restores the next process's — at this point, both processes are in kernel mode.

```asm
# void swtch(struct context **old, struct context *new)
# Save current register context, load new context.
swtch:
    movl 4(%esp), %eax      # eax = &old (pointer to A's context pointer)
    movl 8(%esp), %edx      # edx = new  (pointer to B's context struct)

    # Save A's kernel context
    popl 0(%eax)            # save A's return address (caller's EIP)
    movl %esp, 4(%eax)      # save A's kernel stack pointer
    movl %ebx, 8(%eax)
    movl %ecx, 12(%eax)
    movl %edx, 16(%eax)
    movl %esi, 20(%eax)
    movl %edi, 24(%eax)
    movl %ebp, 28(%eax)

    # Load B's kernel context
    movl 28(%edx), %ebp
    movl 24(%edx), %edi
    movl 20(%edx), %esi
    movl 16(%edx), %edx     # note: edx is overwritten last
    movl 12(%edx), %ecx
    movl 8(%edx), %ebx
    movl 4(%edx), %esp      # ← stack pointer now points into B's kernel stack
    pushl 0(%edx)           # push B's saved return address
    ret                     # pop and jump → resumes B in its kernel context
```

After `movl 4(%edx), %esp`, every subsequent instruction executes on B's kernel stack. The `ret` pops B's saved instruction pointer — wherever B was when it previously called `swtch` — and jumps there. From B's frame of reference, `swtch` returned normally. It unwinds its call chain back through `schedule()` and the interrupt return path, and eventually executes `IRET` to restore B's user-mode state.

### Linux `switch_to`: The Real Implementation

In Linux, the equivalent lives in `arch/x86/include/asm/switch_to.h`. The 64-bit version uses `__switch_to_asm` (in `arch/x86/entry/entry_64.S`):

```asm
/* arch/x86/entry/entry_64.S (simplified) */
SYM_FUNC_START(__switch_to_asm)
    /* Save callee-saved registers of prev task */
    pushq   %rbp
    pushq   %rbx
    pushq   %r12
    pushq   %r13
    pushq   %r14
    pushq   %r15

    /* Switch kernel stacks */
    movq    %rsp, TASK_threadsp(%rdi)   /* prev->thread.sp = rsp */
    movq    TASK_threadsp(%r
