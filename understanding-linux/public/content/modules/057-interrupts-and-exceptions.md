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

## Core Concepts
### Interrupts vs. Exceptions
An **interrupt** is an asynchronous signal asserted by hardware (e.g., a timer, network card, or keyboard) that can occur at any instruction boundary. An **exception** is a synchronous event caused by the execution of a specific instruction (e.g., division by zero, invalid memory access, or a system‑call instruction). Both cause the processor to transfer control to a privileged handler, but they differ in origin, timing, and the information available at entry.

### Why the Processor Must Save State
When control transfers, the processor cannot know where the interrupted instruction stream will resume. To guarantee correct resumption, it must preserve:
* **Program Counter (PC)** – address of the next instruction.
* **Processor status flags** (e.g., EFLAGS.RF, IF, TF) – affect instruction execution and interrupt enabled state.
* **Segment selectors** (CS, SS, DS, …) – define privilege level and memory layout.
* **General‑purpose registers** – unless the architecture automatically saves a subset (x86 saves only PC, CS, EFLAGS, error code on exception; others require software saves).

If any of these were clobbered, the resumed program would see corrupted control flow or data, leading to silent misbehavior or crashes.

### Vectored Dispatch
Modern CPUs use an **interrupt controller** (PIC, APIC, or GIC) that prioritizes concurrent requests and presents a **vector number** to the core. The vector indexes into an **Interrupt Descriptor Table (IDT)** (x86) or **exception table** (ARM) where each entry holds the address of the handler and its required privilege level. This indirection lets the kernel install handlers dynamically without modifying hardware.

### Privilege Transition and Stack Switch
Handlers run in kernel mode (CPL 0) to access protected resources. The processor therefore:
1. Switches to a **kernel stack** (often per‑CPU) to avoid using the user stack, which may be in an inconsistent state.
2. Pushes a minimal hardware frame (PC, CS, EFLAGS, optional error code) onto that stack.
3. Transfers execution to the handler address from the IDT.

The handler must save any additional registers it uses, then later restore the hardware frame before executing a special return instruction (`iret` on x86, `eret` on ARM/MIPS) that reverses the privilege switch and resumes user execution.

### Timing and Latency
Let:
* \(L_{sync}\) – time for the interrupt controller to synchronize the request to the core clock (typically 1–2 cycles).
* \(L_{vec}\) – cycles to fetch the vector from the controller (APIC: ~10–30 cycles).
* \(L_{save}\) – cycles to push the hardware frame (depends on bus width; on x86‑64 ~5 cycles for the 4‑word frame).
* \(L_{dispatch}\) – cycles to jump to the handler address (pipeline refill).

Total entry latency:  
\[
L_{entry}=L_{sync}+L_{vec}+L_{save}+L_{dispatch}
\]  
Typical values on a modern Intel core give \(L_{entry}\approx 70\)–\(120\) ns. Exit latency mirrors entry plus any extra software‑saved state.

## How It Works
### Step‑by‑Step Flow (x86‑64 example)

1. **Assertion** – Device raises its IRQ line; the local APIC latches the request.
2. **Prioritization** – APIC compares the request’s priority with the current task priority register (TPR); if higher, it proceeds.
3. **Vector Fetch** – APIC sends a message to the core containing the vector number (e.g., 0x20 for the timer).
4. **Hardware Frame Push** – Core pushes:
   * `RIP` (next instruction address)
   * `CS` (code segment selector)
   * `RFLAGS`
   * Optional error code (for exceptions only)
   onto the current **kernel stack** (selected via `IST` if configured, else the default per‑CPU stack).
5. **Privilege Switch** – CPL changes to 0; `SS` and `RSP` are loaded from the TSS (Task State Segment) for ring 0.
6. **Control Transfer** – Core loads `RIP` from IDT[vector].handler and begins execution.
7. **Software Prologue** – Handler saves callee‑saved registers (`RBX`, `RBP`, `R12‑R15`) and any additional state needed.
8. **Handler Body** – Performs device‑specific work (e.g., reads a register, acknowledges the interrupt).
9. **Epilogue** – Restores saved registers, executes `iret` to pop the hardware frame, restoring user `RIP`, `CS`, `RFLAGS`, and stack pointer.
10. **Resume** – User program continues at the instruction after the point of interruption.

### Exception‑Specific Details
* **Page Fault** (`#PF`, vector 0xE): Hardware pushes an **error code** whose bits indicate:
  * `P` (0 = not present, 1 = protection violation)
  * `W` (0 = read, 1 = write)
  * `U` (0 = kernel, 1 = user)
  * `RSVD` (reserved‑bit violation)
  * `I` (instruction fetch)
* **Divide Error** (`#DE`, vector 0): No error code; the faulting instruction is the DIV/IDIV that triggered it.
* **System Call** (`int 0x80` or `syscall`): Vector 0x80 (legacy) or IA32_LSTAR/MSR (syscall). The kernel checks the syscall number in `RAX` against `sys_call_table`.

### MIPS Example Derivation
MIPS has a **branch delay slot**; the instruction after a jump executes before the jump takes effect. When an exception occurs, the **Exception Program Counter (EPC)** holds the address of the instruction that caused the exception *or* the address of the branch/jump if the exception is in the delay slot. For most synchronous exceptions (no delay‑slot involvement):
\[
\text{EPC} = \text{PC}_{\text{fault}} + 4
\]  
where PC is the address of the faulting instruction (4‑byte instruction size). If the exception occurs in a delay slot, the kernel must subtract 4 to get the real branch address.

## Worked Examples
### Example 1: Page Fault Handling (x86‑64)
**Scenario:** User process at virtual address `0x7fffdc000000` touches a page not present in RAM. Page size = 4096 bytes.

1. **Fault Detection** – MMU walks page tables, finds PTE with `Present = 0`. Sets PF error code = `0b00000100` (user‑mode read, not present).
2. **Hardware Frame Push** – CPU pushes `RIP = 0x555555554010` (next instruction), `CS = 0x2B`, `RFLAGS = 0x00000202`, error code onto kernel stack.
3. **Kernel Entry** – Vector 0xE invokes `do_page_fault(struct pt_regs *regs, unsigned long error_code, unsigned long address)`.
4. **Software Steps**:
   * `address = __builtin_return_address(0)` (or `regs->cr2` on x86) → `0x7fffdc000000`.
   * Locate VMA covering the address (`find_vma(current->mm, address)`).
   * Check permissions; if valid, allocate a free page (`alloc_page(GFP_KERNEL)`).
   * If backed by file, read page from filesystem (`read_mapping_page`); else zero‑fill.
   * Insert new PTE: `pte = pte_mkwrite(pte_mkdirty(pte_mkpage(page, PAGE_KERNEL))); set_pte_at(mm, address, pteptr, pte);`
   * Invalidate TLB: `flush_tlb_page(vma, address)`.
5. **Return** – `iret` restores user state; execution resumes at the faulting instruction, which now succeeds.

**Numbers:**  
* Page allocation latency ≈ 2 µs (if free page available).  
* Disk read (SSD) ≈ 100 µs.  
* Total fault service ≈ 102 µs + overhead ≈ 150 µs.

### Example 2: System Call `write(fd, buf, len)`
**Scenario:** Process invokes `write(1, "hello\n", 6)`.

1. **User Setup** – `mov $1, %rax` (syscall number for `write`), `mov $1, %rdi` (fd), `lea %rsi, buf`, `mov $6, %rdx`.
2. **Syscall Instruction** – `syscall` triggers vector 0x80 (legacy) or uses MSR IA32_LSTAR (fast syscall). CPU pushes:
   * `RIP` (next user instruction)
   * `CS`
   * `RFLAGS`
   * `RSP` and `SS` are switched to kernel stack via the MSR IA32_FSTAR/MSR IA32_KERNEL_GS_BASE mechanism.
3. **Kernel Entry** – `entry_SYSCALL_64` saves user registers (`pt_regs`), clears `RF`, loads kernel stack pointer from `per_cpu(cpu_tss_rw, sp0)`.
4. **Dispatch** – `syscall_call` indexes `sys_call_table[rax]` → `sys_write`.
5. **Handler**:
   * Verify fd (lookup `struct file *` from `current->files->fd[fd]`).
   * Validate user buffer (`access_ok(VERIFY_READ, buf, len)`).
   * Call `vfs_write(file, buf, len, &ppos)`.
   * On success, return byte count in `rax`; on error, return `-errno`.
6. **Exit** – `syscall_return_slowpath` restores user registers via `pt_regs`, executes `sysretq` (or `iretq` if needed) to resume at saved `RIP`.

**Timing:**  
* Syscall entry/exit ≈ 150 ns on modern Intel (measured with `rdtsc` around `getpid`).  
* Actual `write` to pipe/page cache adds data‑copy cost (~0.5 ns/byte).

### Example 3: Arithmetic Exception – Divide by Zero
**Scenario:** `int x = 5 / 0;`

1. **Fault Generation** – ALU detects divisor = 0, raises `#DE` (vector 0).
2. **Hardware Frame** – Pushes `RIP` (address of the `div` instruction), `CS`, `RFLAGS`. No error code.
3. **Kernel Entry** – Vector 0 → `do_divide_error(struct pt_regs *regs, unsigned long error_code)` (error_code unused).
4. **Software**:
   * Kernel sends `SIGFPE` to the current thread: `force_sig_fault(SIGFPE, ILL_DIVZERO, (void __user *)regs->ip)`.
   * If the process has a signal handler for `SIGFPE`, control transfers to it; otherwise the process is terminated with core dump.
5. **User‑Space Handler** (if installed):
   ```c
   void fpe_handler(int sig, siginfo_t *si, void *uc) {
       if (si->si_code == FPE_INTDIV)
           puts("Integer divide by zero caught");
   }
   ```
6. **Return** – After handler, kernel restores user context via `sigreturn`.

**Why Not Fix In‑Kernel?**  
The kernel cannot safely correct the divisor without breaking program semantics; delivering a signal lets the process decide.

## Common Mistakes
| Mistake | What’s Wrong | Why It Matters |
|---|---|---|
| **Assuming the hardware saves all registers** | x86 only saves `RIP`, `CS`, `RFLAGS` (and error code). Other registers (e.g., `RBX`, `RBP`) must be saved manually by the handler. | Forgetting to save them corrupts the user program’s state, causing subtle bugs that appear only after the handler returns. |
| **Leaving interrupts disabled after handler** | If the handler omits `sti` (or fails to re‑enable via `iret`), the CPU stays with `IF=0`. | Subsequent interrupts are lost, leading to device timeouts, stalled I/O, and watchdog resets. |
| **Using the user stack for interrupt processing** | Some CPUs allow configuring an IST (Interrupt Stack Table); if not set, the processor uses the current `RSP`. If that points to user memory, the kernel writes over user data. | Corruption of user memory can silently corrupt data structures or elevate privileges if the overwritten region holds security‑critical data. |
| **Enabling nested interrupts without checking stack depth** | A handler that re‑enables interrupts (`sti`) before saving enough stack space can overflow the kernel stack on a storm of interrupts. | Kernel oops (“stack overflow”) brings down the whole system. |
| **Assuming exception handlers may sleep** | Handlers run in atomic context (preempt disabled, may hold spinlocks). Calling `sleep()`, `msleep()`, or allocating with `GFP_KERNEL` can deadlock. | System hangs or triggers `BUG: sleeping function called from invalid context`. |
| **Ignoring the PF error‑code bits** | Treating every page fault as “page not present” misses protection violations (`P=1, W=1`). | May incorrectly map a read‑only page as writable, breaking COW or allowing privilege escalation. |
| **Using `iret` instead of `sysret` for syscalls** | `iret` does a full privilege switch and expects an error code on the stack; syscalls use `sysret`. | Mismatch leads to general‑protection fault (`#GP`) on return, crashing the process. |
| **Believing traps and interrupts are interchangeable** | Traps (exceptions) are synchronous; interrupts are asynchronous. Confusing them leads to wrong assumptions about restartability (e.g., assuming an interrupt can be restarted like a trap). | Incorrect handler design can cause livelock or lost work. |

## Exercises
### Easy
1. **Kernel Module – Timer Interrupt Counter**  
   Write a module that registers a handler for the local APIC timer (`request_irq(0, …)` on x86) and increments a per‑CPU counter each tick. Export the counter via `/proc/my_timer_counts`.  
   *Hint:* Use `mk_irq_src` to get the timer vector (`LOCAL_TIMER_VECTOR`).  

2. **User‑Space Signal Handler for SIGSEGV**  
   Create a program that intentionally dereferences a null pointer, installs a `sigaction` for `SIGSEGV` that prints `si_addr` from `siginfo_t`, then exits. Verify the address matches the faulting instruction’s target.

### Medium
3. **Measure Interrupt Latency with `cyclictest`**  
   Install and run `cyclictest -t1 -p 80 -i 200 -l 100000 -h 400 -q`. Explain the output (min, avg, max, overflows) and relate the numbers to the latency formula derived in *How It Works*.  

4. **Inject a Page Fault via `mmap` and `mprotect`**  
   Map a page with `PROT_NONE`, then touch it. Use `ptrace` or a signal handler to log the fault address and error code. Show how changing the protection to `PROT_READ|PROT_WRITE` eliminates the fault.

### Hard
5. **Custom Notifier Chain for Divide‑Error**  
   Write a kernel module that registers a notifier with `die_notifier` (`notifier_block`) to catch `#DE`. Inside the notifier, increment a global counter and return `NOTIFY_STOP` to prevent the default `SIGFPE`. Create a user program that triggers divide‑by-zero and verify it survives (prints a message from the module).  

6. **Kprobe‑Based Page‑Fault Latency Tracer**  
   Place a kprobe on `do_page_fault` and a kretprobe on its return. Use `bpftool perf` or `tracecmd` to record timestamps, compute average service time, and correlate with swap‑in activity (`vmstat -s`).  

## Linux Connection
### Interfaces for Observing and Controlling Interrupts
* **`/proc/interrupts`** – per‑IRQ counters; shows which CPUs have handled each interrupt.  
  ```bash
  cat /proc/interrupts | grep -i timer
  # Example output:
  #  0:        123   0   0   0   IO-APIC-edge      timer
  ```
* **`/sys/devices/system/cpu`** – per‑CPU interrupt statistics (`cpu*/interrupts`).  
* **`/proc/kallsyms`** – locate kernel symbols like `do_page_fault`, `handle_irq`.  
* **`perf`** – measure interrupt latency:  
  ```bash
  perf record -e irq_handler_entry,irq_handler_exit -a sleep 5
  perf report
  ```
* **`tracecmd` / `ftrace`** – trace specific tracepoints:  
  ```bash
  tracecmd record -e irq_handler_entry,irq_handler_exit -e do_page_fault
  tracecmd report
  ```
* **`irqbalance`** – daemon that redistributes IRQs across CPUs for better load balancing. View its config: `/etc/irqbalance/irqbalance.conf`.  

### System Call Interface
* **`syscall(2)`** – invoke a syscall directly from C:  
  ```c
  #include <unistd.h>
  #include <sys/syscall.h>
  long ret = syscall(SYS_write, 1, "hello\n", 6);
  ```
* **`strace`** – observe syscalls:  
  ```bash
  strace -e write ./myprog
  ```

### Exception Handling in the Kernel
* **`/mm/memory.c`** – `do_page_fault` implementation.  
* **`/arch/x86/kernel/traps.c`** – generic trap handlers (`divide_error`, `invalid_op`, `gp_fault`, etc.).  
* **`include/linux/notifier.h`** – notifier chain API used for die notifications.  

### Example: Registering a Custom Page‑Fault Notifier (Kernel Module)
```c
/* pf_notifier.c */
#include <linux/module.h>
#include <linux/mm.h>
#include <linux/notifier.h>

static int pf_notifier(struct notifier_block *nb, unsigned long action, void *data)
{
    struct page_fault_info *pf = data;
    pr_info("PF at %lx, error_code=%x\n", pf->address, pf->error_code);
    return NOTIFY_OK;
}

static struct notifier_block pf_nb = {
    .notifier_call = pf_notifier,
};

static int __init pf_init(void)
{
    register_page_fault_notifier(&pf_nb);
    return 0;
}
static void __exit pf_exit(void)
{
    unregister_page_fault_notifier(&pf_nb);
}
module_init(pf_init);
module_exit(pf_exit);
MODULE_LICENSE("GPL");
```
Compile with `make -C /lib/modules/$(uname -r)/build M=$PWD modules` and load via `insmod pf_notifier.ko`. Observe output in `dmesg`.

## Why This Matters
Interrupts and exceptions are the **mechanisms by which the CPU interacts with the outside world and with its own instruction stream**. Mastery of them lets you:

* **Diagnose latency spikes** – by correlating `/proc/interrupts` with `perf` you can pinpoint whether a slowdown stems from excess interrupt load, long handler execution, or deferred work (`softirq`, `tasklet`).
* **Write reliable low‑level code** – device drivers, real‑time loops, and hypervisors all hinge on correct interrupt disabling, saving/restoring state, and avoiding priority inversion.
* **Build secure systems** – many privilege‑escalation exploits abuse mishandled exception frames (e.g., stack swapping, returning to user space with altered `RIP`). Understanding the exact hardware frame layout prevents such bugs.
* **Optimize performance** – knowing that a page fault costs ≈150 µs lets you decide whether to pre‑populate caches, use `mlock`, or employ huge pages to eliminate translation overhead.
* **Leverage kernel abstractions** – the Linux kernel provides high‑level interfaces (`request_irq`, `fd_install`, `do_page_fault`, notifier chains) that hide the gritty details; using them correctly yields portable, maintainable code.

In short, interrupts and exceptions form the **foundation of event‑driven execution** in modern operating systems. By grasping their hardware roots, software conventions, and Linux‑specific manifestations, you move from writing programs that merely *run* to crafting systems that *respond*—efficiently, safely, and predictably.
