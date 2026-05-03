---
id: 57
title: "Interrupts and exceptions"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Why This Matters

Without interrupts, a CPU would burn cycles polling every device status register continuously. On a modern machine with hundreds of potential event sources—NICs, storage controllers, USB hubs, timers—polling doesn't merely waste cycles; it creates an $O(n)$ latency floor where $n$ is the number of devices checked before reaching the one that needs service. Interrupts collapse that to $O(1)$: the device asserts a signal, the CPU finishes its current instruction, and control transfers within nanoseconds.

Exceptions solve the orthogonal problem of controlled privilege escalation. A process cannot be permitted to jump arbitrarily into kernel memory—it could skip authentication checks, corrupt kernel state, or escalate privilege. The exception mechanism enforces that user code can *trigger* a kernel entry only at fixed, kernel-defined vectors. The user chooses *when* to call the kernel, never *where* control lands inside it.

These two mechanisms together are the foundation for everything interesting the kernel does: preemptive scheduling (timer interrupt), virtual memory (page fault), system calls (trap), and device I/O (hardware interrupt).

---

## Core Concepts

### Polling vs. Interrupts

Polling is appropriate when the device completion time is tightly bounded and short relative to the cost of a context switch. A context switch on x86-64 costs roughly 1,000–3,000 ns depending on cache state; if a NVMe device consistently responds in 50 µs, spinning for 50 µs in the kernel may be cheaper than taking an interrupt, saving context, scheduling a handler, and returning. This is exactly why Linux's block layer uses **interrupt coalescing** and why `io_uring` can operate in a polling mode for latency-sensitive workloads.

When device latency is unpredictable or large (a keyboard may not produce input for seconds), polling burns CPU proportional to wait time with zero useful work done. Interrupts eliminate that waste entirely.

### The Four-Way Classification

"Exception" is the umbrella term for any transfer of control caused by something other than a normal branch. Interrupts are one subtype.

| Type | Cause | Synchronous? | Resumes at |
|---|---|---|---|
| **Interrupt** | External hardware signal | No | Next instruction (unrelated to cause) |
| **Fault** | Instruction-caused, hardware-recoverable | Yes | *Same* instruction (re-executed after fix) |
| **Trap** | Intentional instruction (syscall, breakpoint) | Yes | *Next* instruction |
| **Abort** | Unrecoverable hardware error | Yes | Does not resume |

**Synchronous** means the exception is reproducible: execute the same instruction stream again and the same exception fires at the same point. An interrupt is asynchronous because it arrives from outside the instruction stream—it could fire between any two instructions.

The fault/trap distinction has a concrete consequence for the saved program counter. For a **fault**, the hardware saves the address of the faulting instruction itself, because the OS will fix the cause (e.g., map a page) and then re-execute that instruction. For a **trap**, the hardware saves `PC + 4` (or the address of the next instruction on x86), because the trap instruction was intentional and should not repeat. Getting this wrong in a kernel port means either infinite re-execution loops or silently skipping instructions.

### The Exception Entry Sequence

When an exception fires, the CPU must atomically commit several state changes before the handler's first instruction executes:

```
1. EPC  ← PC of faulting/trapping instruction
2. Cause ← exception code + pending interrupt bits
3. Status.EXL ← 1   (mask further exceptions)
4. Status.KSU ← 00  (enter kernel mode)
5. PC   ← 0x80000180  (jump to fixed handler vector)
```

Steps 3 and 4 are inseparable from step 1 in hardware. If exceptions were not disabled before EPC is saved, a second exception arriving one cycle later would overwrite EPC and the return address to user space would be unrecoverable. The `EXL` bit is the hardware's mutual exclusion primitive for exception entry.

On x86-64, there is no single fixed vector. The CPU uses the **Interrupt Descriptor Table (IDT)**, an array of 256 gate descriptors, each holding a handler address and privilege requirements. The CPU multiplies the exception number by 16 (the size of an IDT entry) and adds the IDT base address to find the handler:

$$\text{handler\_addr} = \text{IDTR.base} + (\text{vector} \times 16)$$

This indirection lets different exception types dispatch to completely different handler functions without a software switch statement in a shared entry point.

### Status and Cause Registers

These are coprocessor 0 (CP0) registers on MIPS. x86-64 uses `RFLAGS` and model-specific registers (MSRs) for equivalent functionality.

**Status register** (CP0 register 12):

| Bits | Field | Meaning |
|---|---|---|
| 0 | IE | Global interrupt enable; if 0, no interrupts fire |
| 1 | EXL | Exception level; set by hardware on entry, cleared by `eret` |
| 4–3 | KSU | Mode: `00`=kernel, `01`=supervisor, `10`=user |
| 15–8 | IM | Interrupt mask; bit $i$ enables interrupt line $i$ |

**Cause register** (CP0 register 13):

| Bits | Field | Meaning |
|---|---|---|
| 6–2 | ExcCode | Which exception occurred (5-bit code) |
| 15–8 | IP | Interrupt pending; bit $i$ set means line $i$ is asserting |
| 31 | BD | Exception occurred in a branch delay slot |

Selected exception codes:

| Code | Mnemonic | Cause |
|---|---|---|
| 0 | Int | Hardware interrupt (check IP bits for source) |
| 4 | AdEL | Address error, load or instruction fetch |
| 5 | AdES | Address error, store |
| 8 | Sys | `syscall` instruction |
| 9 | Bp | `break` instruction |
| 12 | Ov | Integer overflow |

### Interrupt Priority and the Interrupt Mask

Each running context has an effective interrupt priority level (IPL). The kernel raises IPL to protect critical sections from specific interrupt sources without disabling all interrupts globally—a timer interrupt can still fire while disk interrupts are masked, so the scheduler remains live even when the disk driver holds a lock.

The interrupt mask is an 8-bit field (IM[7:0]) in the Status register. To allow only interrupt lines at priority $p$ and above (where higher index = higher priority):

$$\text{mask} = \sum_{i=p}^{7} 2^i = 2^8 - 2^p$$

To raise from IPL $p_0$ to IPL $p_1 > p_0$, the OS ANDs out the lower bits:

$$\text{Status.IM} \leftarrow \text{Status.IM} \;\&\; \sim(2^{p_1} - 2^{p_0})$$

The inverse operation (clearing the mask bits) lowers IPL and re-enables those lines.

On x86-64, the equivalent mechanism is the **TPR (Task Priority Register)**, `CR8` in 64-bit mode. Writing a value $p$ to `CR8` masks all APIC interrupts with priority $\leq p \times 16$:

```c
/* Raise task priority to mask vectors 0x20–0x4F */
__asm__ volatile("mov %0, %%cr8" :: "r"(4UL));
```

### Context Save and Restore

The exception handler needs CPU registers to operate, but those registers contain the interrupted program's live values. The OS must snapshot every register the handler might touch before touching them. This snapshot is the **trap frame** (Linux calls it `struct pt_regs`).

The trap frame lives on the **kernel stack** of the interrupted process—not on the user stack, which the kernel cannot trust. Every process in Linux has a fixed-size kernel stack (typically 16 KiB on x86-64, configurable via `CONFIG_THREAD_SIZE_ORDER`).

The save/restore sequence:

```
1. Hardware: PC → EPC, mode → kernel, EXL ← 1, PC ← vector
2. Handler prologue: push all GPRs + CP0 registers → kernel stack
3. (Optional) re-enable interrupts: clear EXL, set IE — now preemptible
4. Dispatch: call C handler based on ExcCode
5. Handler epilogue: pop all registers from kernel stack
6. `eret` (MIPS) / `iret` (x86): atomically restore PC from EPC, clear EXL
```

`eret` and `iret` are atomic in the sense that no exception can be taken between the restoration of the program counter and the restoration of the privilege level. Without this atomicity, a window would exist in which the CPU is at user-privilege but executing kernel addresses.

---

## How It Works

### Exception Handler Entry: Annotated MIPS Assembly

```asm
# MIPS exception entry point — must be at exactly 0x80000180
# On entry: EXL=1, kernel mode, $k0/$k1 reserved for kernel use,
# all other registers still contain the interrupted program's values.

.section .text.exception
.org 0x80000180
.globl exception_entry
exception_entry:
    # $k1 ← kernel stack pointer (per-CPU variable)
    # $k0 is scratch; $k1 holds kernel SP across the window before we
    # have a stack. These two registers are never used by user code
    # precisely so the exception handler has a safe foothold.
    la    $k1, current_kernel_sp
    lw    $k1, 0($k1)

    # Allocate trap frame on kernel stack: 37 words (32 GPR + EPC,
    # Cause, Status, HI, LO)
    subu  $k1, $k1, 148
    sw    $at,   4($k1)
    sw    $v0,   8($k1)
    sw    $v1,  12
