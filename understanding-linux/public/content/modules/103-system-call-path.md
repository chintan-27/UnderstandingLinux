---
id: 103
title: "System call path"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

User programs cannot directly invoke kernel functions. This is not a software policy — it is a hardware enforcement. The CPU tracks the current privilege level (CPL) in bits 0–1 of the `cs` register and will raise a general protection fault if ring-3 code attempts a privileged instruction. The system call mechanism exists because *something* must bridge ring 3 and ring 0 without letting userspace choose where in the kernel it lands. That bridge is a single, fixed entry point. Every file read, every socket write, every process fork passes through it. When attackers exploit kernel vulnerabilities, they are almost always trying to corrupt or bypass the logic at this boundary — which is why understanding it precisely matters.

---

## Core Concepts

### Privilege Rings

x86 defines rings 0–3. Linux uses only ring 0 (kernel) and ring 3 (userspace). At ring 3, instructions like `hlt`, `cli`, `lgdt`, direct port I/O (`in`/`out`), and writes to control registers (`cr0`, `cr3`) are illegal. The CPL is checked by the CPU on every such instruction — not by any kernel code. Attempting a privileged instruction at CPL 3 raises `#GP(0)`, which the kernel handles as `SIGSEGV` or `SIGILL` delivered to the offending process.

The CPL lives in bits 0–1 of `cs`. When the CPU executes `syscall`, it atomically replaces `cs` with a kernel code segment selector whose RPL field is 0. That is the moment the privilege boundary is crossed.

### The Syscall Number

A system call is an integer, not a pointer. This is intentional. If userspace passed a function pointer, it could redirect execution anywhere in kernel memory. Instead, it passes a number, and the kernel uses that number as an index into `sys_call_table[]` — an array of function pointers maintained exclusively by the kernel. Userspace never holds a kernel address. The worst it can do with a syscall number is invoke a valid syscall it wasn't supposed to, which is a policy problem, not a memory-safety one.

On x86-64, the number goes in `rax`. The number `1` means `write`. The number `60` means `exit`. These are ABI constants defined in `include/uapi/asm/unistd_64.h` and they do not change between kernel versions without breaking every compiled program on the system.

### The `syscall` Instruction and What It Does Atomically

On x86-64, the instruction that crosses the boundary is `syscall`. The CPU performs the following in a single non-interruptible step:

1. Saves `rip` (the return address) into `rcx`
2. Saves `rflags` into `r11`
3. Masks `rflags` with the `SFMASK` MSR (clears IF and other flags)
4. Loads the kernel `rip` from the `LSTAR` MSR
5. Loads kernel `cs` and `ss` selectors from the `STAR` MSR, setting CPL to 0

Note what `syscall` does **not** do: it does not switch the stack. The CPU is now at CPL 0 but still using the user stack pointer (`rsp`). The very first thing the kernel entry code does is switch to a known-safe kernel stack — if it didn't, the kernel would be executing privileged code with a user-controlled stack pointer, which is an immediate exploit vector.

The kernel sets `LSTAR` at boot:

```c
/* arch/x86/kernel/cpu/common.c */
wrmsrl(MSR_LSTAR, (unsigned long)entry_SYSCALL_64);
```

Nothing else sets `LSTAR`. There is exactly one ring-0 entry point for syscalls on a running kernel.

### Entry, Dispatch, and the `pt_regs` Frame

Once at CPL 0, the kernel must preserve the full user register state before doing anything else — both to protect user context and because syscall arguments live in those registers. They are pushed onto the kernel stack in a fixed layout defined by `struct pt_regs`:

```c
/* arch/x86/include/asm/ptrace.h */
struct pt_regs {
    unsigned long r15, r14, r13, r12;
    unsigned long rbp, rbx;
    unsigned long r11, r10, r9, r8;
    unsigned long ax, cx, dx, si, di;
    unsigned long orig_ax;
    unsigned long ip, cs, flags, sp, ss;
};
```

`orig_ax` holds the original syscall number. `ax` will be overwritten with the return value. `ip` is the saved user `rip` (which `syscall` put into `rcx` before the entry stub saved it here). This layout is the ABI between the assembly entry stub and all C-level kernel code. `ptrace`, signal delivery, and seccomp all read and write through this struct.

### Argument Passing

`syscall` clobbers `rcx` (saves `rip` there) and `r11` (saves `rflags` there), so those two registers are unavailable for arguments. The convention substitutes `r10` for `rcx` as the fourth argument:

| Position | User register | `pt_regs` field |
|----------|--------------|-----------------|
| 1st      | `rdi`        | `regs->di`      |
| 2nd      | `rsi`        | `regs->si`      |
| 3rd      | `rdx`        | `regs->dx`      |
| 4th      | `r10`        | `regs->r10`     |
| 5th      | `r8`         | `regs->r8`      |
| 6th      | `r9`         | `regs->r9`      |

Six arguments is an architectural ceiling, not a convention. Syscalls needing more data — `mmap`, `clone` — pass a pointer to a user-space struct and call `copy_from_user()` to pull it in safely.

### Return Path and Preemption

Return is not a `ret`. The kernel executes `sysretq`, which is the inverse of `syscall`: it restores `rip` from `rcx`, restores `rflags` from `r11`, and sets CPL back to 3 by reloading `cs` from `STAR`.

Before `sysretq` executes, the return path checks two things: `need_resched` (set by the timer interrupt if the process has exhausted its timeslice) and pending signals. If `need_resched` is set, the kernel calls `schedule()` before returning. The process that made the syscall may sleep in the scheduler and a different process may run next. This is **user preemption** — it only happens at transitions back to userspace, not at arbitrary points inside kernel code (unless the kernel is preemptible, which is a separate `CONFIG_PREEMPT` concern).

The consequence for latency is direct. Observed syscall latency is not bounded by the syscall's own cost:

$$\text{latency}_{\text{observed}} \geq t_{\text{entry}} + t_{\text{handler}} + t_{\text{exit}} + \sum_{i} t_{\text{slice}_i}$$

where $\sum_{i} t_{\text{slice}_i}$ is the total CPU time consumed by tasks that preempted this process on the return path. For a trivial syscall like `getpid()`, $t_{\text{handler}}$ is on the order of tens of nanoseconds, but $\text{latency}_{\text{observed}}$ can be milliseconds if the system is loaded.

---

## How It Works

### The Entry Stub: `entry_SYSCALL_64`

Located in `arch/x86/entry/entry_64.S`. The annotated critical path:

```asm
SYM_CODE_START(entry_SYSCALL_64)
    /* At this point: CPL=0, but rsp still points to user stack */
    swapgs
    /* GS now points to this CPU's struct pcpu_hot, which contains
       the kernel stack pointer for the current task */

    movq %rsp, PER_CPU_VAR(pcpu_hot + X86_top_of_stack - 8)
    movq PER_CPU_VAR(pcpu_hot + X86_top_of_stack), %rsp
    /* rsp now points to the kernel stack — we are safe */

    /* Construct struct pt_regs on the kernel stack */
    pushq $__USER_DS          /* ss */
    pushq PER_CPU_VAR(pcpu_hot + X86_top_of_stack - 8)  /* saved rsp */
    pushq %r11                /* saved rflags */
    pushq $__USER_CS          /* cs */
    pushq %rcx                /* saved rip */
    pushq %rax                /* orig_ax = syscall number */
    pushq %rdi
    pushq %rsi
    /* ... remaining registers ... */

    movq %rsp, %rdi           /* pt_regs* as first argument */
    movslq %eax, %rsi         /* syscall number as second argument */
    call do_syscall_64
```

`swapgs` is necessary because `GS` at CPL 3 holds a user-space value (used by thread-local storage). The kernel's per-CPU data is accessed via a separate GS base stored in `MSR_KERNEL_GS_BASE`. `swapgs` exchanges them. On return to userspace, `swapgs` is executed again to restore the user value. Forgetting to swap on one of the return paths is a class of kernel bug that has historically enabled privilege escalation.

### `do_syscall_64`

```c
/* arch/x86/entry/common.c */
__visible noinstr void do_syscall_64(struct pt_regs *regs, int nr)
{
    nr = syscall_enter_from_user_mode(regs, nr);
    /* syscall_enter_from_user_mode runs seccomp, ptrace stops,
       and audit hooks before the number is used */

    if (likely((unsigned)nr < NR_syscalls)) {
        regs->ax = sys_call_table[nr](regs);
        /* return value lands in
