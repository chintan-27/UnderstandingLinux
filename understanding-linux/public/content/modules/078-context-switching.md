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

## Core Concepts
### Process Execution Context
A **process** is an executing instance of a program with its own virtual address space, file descriptor table, and kernel resources. The CPU’s execution context for a process consists of:
- **Architectural registers** (PC, SP, BP, general‑purpose registers, SIMD/mmx, control registers such as `cr3` on x86‑64).  
- **Memory‑management state**: the page‑directory base held in `cr3` (or `satp` on RISC‑V) which tells the MMU which page tables to use.  
- **Kernel‑mode stack pointer** (saved in `task_struct->thread.sp0`).  

When the scheduler decides to run another process, the kernel must **save** the current context and **restore** the target’s context. If any piece is omitted or corrupted, the resumed process will see incorrect register values or translate virtual addresses with the wrong page tables, leading to immediate faults or silent data corruption.

### Why Saving/Restoring Registers Is Necessary
Registers are the only storage the CPU can read/write in a single cycle. Unlike memory, they are not preserved across a change of control flow unless explicitly saved. The ISA defines which registers are *caller‑saved* and *callee‑saved*; a context switch behaves like a function call where the *entire* register set is callee‑saved because the kernel cannot assume any convention across arbitrary processes.

### MMU Context Switch
The MMU translates virtual addresses to physical addresses using a hierarchy of page tables pointed to by a root register (`cr3` on x86‑64, `satp` on RISC‑V). Switching address spaces requires:
1. Loading the new root pointer into the MMU register.  
2. Invalidating any cached translations that may belong to the old address space (TLB flush).  

If the TLB is not flushed, stale entries could map a virtual page to a physical frame that now belongs to another process, violating isolation and potentially allowing unauthorized memory access.

### Kernel Entry and Exit Overhead
A context switch always occurs while the CPU is in kernel mode (triggered by a trap, syscall, or interrupt). The cost consists of:
- **Entry**: saving user registers onto the kernel stack, switching to the kernel stack pointer, and executing the scheduler.  
- **Exit**: restoring the target’s user registers and returning via `iret`/`sysret`.  

These steps involve multiple memory accesses (push/pop) and pipeline flushes, which dominate the total switch time on modern superscalar cores.

### Quantitative Model
Let  
- \(N_r\) = number of architectural registers saved/restored (e.g., 16 integer + 16 SIMD on x86‑64).  
- \(C_{store}\) = average cost to store a register to memory (≈3 cycles, accounting for L1 latency and store buffer).  
- \(C_{load}\) = average cost to load a register from memory (≈3 cycles).  
- \(C_{tlb}\) = cost to flush the relevant TLB entries (≈80‑150 cycles depending on CPU and flush scope).  
- \(C_{entry}\) and \(C_{exit}\) = kernel entry/exit overhead (≈150‑300 cycles each on a typical Xeon).  

Then the total switch time is  
\[
T_{\text{switch}} = 2N_r(C_{store}+C_{load}) + C_{tlb} + C_{entry} + C_{exit}.
\]  
For \(N_r=32\), \(C_{store}=C_{load}=3\), \(C_{tlb}=120\), \(C_{entry}=C_{exit}=200\):  
\[
T_{\text{switch}} = 2·32·6 + 120 + 200 + 200 = 384 + 520 = 904\text{ cycles} \approx 0.3 \mu s\text{ at 3 GHz}.
\]  
This back‑of‑the‑envelope calculation shows why optimizations focus on reducing \(N_r\) (lazy FPU save), minimizing TLB flushes (PCID, INVPCID), and cutting entry/exit costs (paravirtualization, vmlinux vs. vDSO).

---

## How It Works
### Step‑by‑step Mechanism
1. **Trigger** – A timer interrupt, syscall, or explicit `schedule()` call forces a trap into kernel mode.  
2. **Save current state** – The assembly entry code (e.g., `entry_SYSCALL_64` or `entry_INT80_32`) pushes `rax, rcx, rdx, rsi, rdi, r8‑r15, rbp, rip, rflags, cs, ss, rsp` onto the kernel stack.  
3. **Switch kernel stack** – Save the current `rsp` into `current->thread.sp0`; load `next->thread.sp0` into `rsp`.  
4. **Save registers** – The `__switch_to` routine (arch/x86/kernel/process_64.c) saves `rbp, rbx, r12‑r15` (callee‑saved) and the floating‑point state (`fxsave`/`xsave`) if used.  
5. **MMU switch** – Load `next->mm->pgd` into `cr3`. If the kernel is built with `CONFIG_PCI`, also issue `invpcid` to flush only the current PCID‑tagged entries, avoiding a full TLB flush.  
6. **Restore registers** – Pop the callee‑saved registers, restore FP/SIMD state with `fxrstor`/`xrstor`.  
7. **Return to user** – Execute `swapgs; mov %rsp, %rax; ... ; iretq` to restore user `rip, cs, rflags, rsp, ss` and resume execution in the new process.

### Why Each Step Is Required
- Saving *all* registers guarantees the new process sees a clean slate; relying on caller‑saved conventions would leave unknown values in registers the kernel might have clobbered.  
- Switching the kernel stack prevents the new process from corrupting the old process’s kernel stack (which holds return addresses, saved registers, and lock state).  
- Loading the new `pgd` ensures the MMU uses the correct page tables; skipping this would cause the process to interpret virtual addresses using the wrong mappings, instantly triggering a page fault.  
- Flushing the TLB (or using PCID) removes stale translations that could otherwise permit unauthorized access to physical frames owned by the outgoing process.  
- The `iretq`/`sysret` pair restores the exact user‑mode state saved at entry; any deviation would change the architectural state visible to the process.

---

## Worked Examples
### Example 1: Timing a Context Switch on Intel Xeon E5‑2670 (2.6 GHz, Skylake‑EP)
Assume:
- \(N_r = 24\) (16 integer + 8 SSE) after lazy FPU save.  
- \(C_{store}=C_{load}=2.5\) cycles (L1 hit, store buffer).  
- \(C_{tlb}=70\) cycles (single‑core INVPCID flush).  
- \(C_{entry}=C_{exit}=120\) cycles (optimized entry via `paravirt` and `vDSO`).  

Compute:  
\[
T_{\text{switch}} = 2·24·5 + 70 + 120 + 120 = 240 + 310 = 550\text{ cycles}.
\]  
At 2.6 GHz, one cycle ≈ 0.384 ns → \(T_{\text{switch}} ≈ 0.21 \mu s\).  

**Verification with `perf`:**  
```bash
# Record context-switch events over a 1‑second workload
perf stat -e context-switches,cpu-migrations,task-clock \
          -a sleep 1
```
Typical output on an idle system:  
```
      1,200 context-switches          # 1.2 kHz → 0.83 ms between switches
          0 cpu-migrations
      1.001234 task-clock (msec)      # ~1 s wall time
```
Dividing wall time by number of switches gives ≈ 0.83 ms, which includes scheduler latency and run‑queue overhead; the pure switch cost measured via tracepoints (`trace/sched/sched_switch`) is closer to the sub‑microsecond estimate.

### Example 2: Switching Due to a Page Fault
A process accesses a virtual address whose PTE is not present. The hardware raises a page‑fault vector → kernel entry.

1. **Entry** – push registers, switch to kernel stack (`entry_SYSCALL_64` → `do_page_fault`).  
2. **Fault handler** – allocates a physical page, fills the PTE, possibly performs copy‑on‑write.  
3. **If the fault requires waking another process** (e.g., waiting for I/O), the scheduler runs:  
   - Save current context (`switch_to(prev, next)`).  
   - Load next process’s `cr3` (may be the same if faulting process stays).  
   - Restore next’s registers and `iretq`.  
4. **Return** – kernel exit restores the faulting instruction; the retry succeeds.

The extra cost of the fault handler (≈ 1‑2 µs) dwarfs the pure switch cost, illustrating why minimizing fault rates (via large pages, prefetch, or `madvise`) improves overall throughput.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Breaks |
|---|---|---|
| **Omitting `fsbase/gsbase` save/restore** | On x86‑64, the kernel uses `fsbase` for per‑CPU data and `gsbase` for thread‑local storage. Forgetting to save/restore these MSRs causes the new process to see the wrong TLS or kernel to corrupt its own per‑CPU variables. | Leads to sporadic crashes in glibc (`__thread` variables) or kernel oopses when accessing `this_cpu_ptr`. |
| **Flushing the entire TLB instead of using PCID/INVPCID** | A full `invltlb` flushes all entries, harming performance of unrelated processes sharing the same PCID. | Increases miss rate for all processes, raising average memory‑access latency by 10‑30 % on workloads with many short-lived threads. |
| **Not disabling preemption around the critical section** | If a scheduler tick occurs while the kernel is midway through `switch_to`, two CPUs could attempt to load the same `cr3` or corrupt the kernel stack. | Results in double‑faults, stack smashing, or silent data corruption; observable via `kernel BUG at …` in `dmesg`. |
| **Using the wrong `mm_struct` pointer** | Swapping `prev->mm` with `next->active_mm` instead of `next->mm` leaves the kernel using the outgoing process’s page tables while executing the incoming process’s code. | Immediate page fault on the first memory access after switch; the fault address will be within the outgoing process’s VMA range, confusing debugging. |
| **Neglecting memory barriers after updating `cr3`** | On weakly ordered architectures (ARM, RISC‑V), the write to `satp` may not be globally visible before subsequent loads/store. | The CPU may speculatively use stale translations, causing transient execution leaks or incorrect memory accesses. Fix: issue a `dsb sy` (ARM) or `sfence.vma` (RISC‑V) after the CSR write. |

---

## Exercises
### Easy
1. **User‑level context switch** – Write a C program that uses `getcontext`, `makecontext`, and `setjmp`/`longjmp` (or `ucontext_t`) to alternate execution between two functions that print a counter. Measure the elapsed time with `clock_gettime(CLOCK_MONOTONIC, …)` and report the average switch duration.  
2. **Observing voluntary switches** – Run:  
   ```bash
   # Count voluntary context switches of a shell over 5 s
   pid=$$; 
   before=$(grep voluntary_ctxt_switches /proc/$pid/status | awk '{print $2}')
   sleep 5
   after=$(grep voluntary_ctxt_switches /proc/$pid/status | awk '{print $2}')
   echo "$((after-before)) switches in 5 s"
   ```  
   Explain why the number is non‑zero even though the shell appears idle.

### Medium
3. **Kernel tracepoint analysis** – Enable the `sched:sched_switch` tracepoint and collect 100 000 events:  
   ```bash
   sudo echo 1 > /sys/kernel/debug/tracing/events/sched/sched_switch/enable
   sudo cat /sys/kernel/debug/tracing/trace_pipe > switch.log &
   # Generate load
   stress-ng --cpu 4 --timeout 10
   sudo echo 0 > /sys/kernel/debug/tracing/events/sched/sched_switch/enable
   fg   # kill cat
   ```  
   From `switch.log`, compute the average time delta between consecutive `prev_tid → next_tid` entries (use the timestamp field). Compare with the theoretical model from Section 1.  
4. **Lazy FPU save** – Modify a simple kernel module to set `thread->status & TS_USEDFPU` manually before a switch and verify, via `perf record -e fp_retired:instructions`, that the kernel avoids `fxsave/fxrstor` when the bit is clear.

### Hard
5. **Implement a minimal cooperative scheduler** – In userspace, use `setjmp`/`longjmp` to create two lightweight “threads” that yield via a global `jmp_buf`. Ensure each thread has its own simulated registers (array of 64‑bit values) that are saved/restored on yield. Prove correctness by having each thread increment a distinct counter and verify that the sum matches the expected total after N yields.  
6. **Measure the cost of a full TLB flush** – Write a kernel module that, on each context switch, toggles between `invpcid` (single‑address) and `invltlb` (full flush) based on a module parameter. Use `perf stat -e cpu-cycles,context-switches` to compare the total CPU time spent in switch handling for a workload that creates many short‑lived processes (e.g., `fork/exec` loop). Discuss the trade‑off observed.

---

## Linux Connection
### Core Data Structures
- **`struct task_struct`** (`include/linux/sched.h`) – the process descriptor.  
  - `thread.sp0` – kernel stack pointer saved during switch.  
  - `thread.fsbase`, `thread.gsbase` – MSR bases for FS/GS.  
  - `ptr_regs` – pointer to saved user registers on the kernel stack.  
  - `mm` – pointer to `struct mm_struct` (may be `NULL` for kernel threads).  
- **`struct mm_struct`** – owns the page tables.  
  - `pgd` – physical address of the top‑level page directory (loaded into `cr3`).  
  - `cpu_vm_mask` – CPUs where this mm is loaded (used with PCID).  

### The Switch Routine
On x86‑64 the function `__switch_to(prev, next, prev_task)` resides in `arch/x86/kernel/process_64.c`. Key excerpts (annotated):
```c
static __always_inline struct task_struct *
__switch_to(struct task_struct *prev, struct task_struct *next, struct task_struct *last)
{
    struct fpu *fpu = &next->thread.fpu;

    /* Save previous FS/GS bases */
    savesegment(fs, prev->thread.fsindex);
    savesegment(gs, prev->thread.gsindex);
    /* Load next FS/GS bases */
    loadsegment(fs, next->thread.fsindex);
    loadsegment(gs, next->thread.gsindex);

    /* Switch kernel stack */
    load_sp0(next->thread.sp0);

    /* Save/restore callee‑saved registers */
    __asm__ __volatile__(
        "pushf\n\t"
        "push   %rbp\n\t"
        "mov    %rsp, %rbp\n\t"
        /* ... save rbx, r12‑r15 ... */
        :
        : "r"(prev), "r"(next)
        : "memory", "cc"
    );

    /* Load MMU context – PCID aware */
    if (next->mm) {
        load_cr3(next->mm->pgd);
        if (static_key_false(&pcid_enabled))
            __write_msr(MSR_IA32_PCI_PCR,
                (next->thread.cpu << 12) | next->mm->context.id);
    }

    /* Restore FP state if used */
    if (test_tsk_thread_flag(next, TIF_USEDFPU))
        __restore_fpu(fpu);

    return last;
}
```
*Why each line matters* is explained in the **How It Works** section.

### Observing Context Switches in Practice
```bash
# 1. Show voluntary and involuntary switches for a PID
pid=$(pidof sshd)
grep -E 'voluntary_ctxt_switches|nonvoluntary_ctxt_switches' /proc/$pid/status

# 2. Live view of switches with perf
sudo perf trace -e sched:sched_switch -- sleep 5

# 3. Examine the page‑table base (cr3) of a process
#    (requires root because /proc/pid/pagetypeinfo is privileged)
sudo cat /proc/$$/pagetypeinfo | head -5   # shows CMA, normal, movable zones
#    Direct cr3 read via /proc/pid/statm (not exact) – better:
sudo cat /proc/$$/status | grep ^VmPeak   # indirect memory usage

# 4. Measure switch latency with a microbenchmark (requires kernbench)
git clone https://github.com/torvalds/linux.git
cd linux/tools/perf/
make
sudo ./perf record -e sched:sched_switch -a -- \
        ./microbench_ctxswitch   # a tiny program that ping‑pongs two threads via futex
sudo perf report
```
The `perf trace` output displays lines like:
```
   sshd-1234  [001] 5.672123: sched_switch: prev_comm=sshd prev_pid=1234 prev_prio=120 prev_state=R => next_comm=swapper/0 next_pid=0 next_prio=120 next_state=R
```
The timestamp field allows calculation of the delta between successive switches, giving an empirical measurement of `T_switch`.

---

## Why This Matters
Context switching is the linchpin that lets a single CPU multiplex hardware among dozens or thousands of threads while preserving isolation and correctness. Every nanosecond spent in the switch routine is *pure overhead*—it does not advance any useful work. Consequently, the design of the scheduler, the layout of `task_struct`, the choice of TLB‑flush strategy (PCID vs. full invltlb), and even the decision to defer FPU state saves directly impact system throughput, latency, and energy efficiency.

Understanding the mechanistic details—why each register must be saved, why the MMU root pointer must be reloaded with a memory barrier, why kernel entry and exit dominate the cost—enables you to:

- **Diagnose performance anomalies** (e.g., a sudden rise in voluntary context spikes indicating a lock‑holder yielding too often).  
- **Tune workloads** (adjust `vm.swappiness`, use `madvise(MADV_HUGEPAGE)` to reduce page‑table walks, or bind threads to cores to avoid unnecessary migrations).  
- **Contribute to the kernel** (e.g., propose a new lazy‑AVX‑512 save mechanism, or improve the `invpcid` scope to reduce flush overhead).  
- **Design user‑space abstractions** (like Go’s goroutine scheduler or userspace‑level RCU) that mimic the kernel’s principles while avoiding the costly kernel‑mode transition.

In short, mastering context switching gives you the mental model needed to reason about any modern multitasking system—from embedded RTOS kernels to hyperscale cloud schedulers—making you capable of building software that respects the underlying hardware’s constraints while extracting maximal performance.
