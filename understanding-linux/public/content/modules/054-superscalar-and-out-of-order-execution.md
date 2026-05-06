---
id: 54
title: "Superscalar and out-of-order execution"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Core Concepts
### Instruction‑Level Parallelism and Pipeline Limits
Modern CPUs execute instructions in a pipeline (fetch → decode → rename → dispatch → issue → execute → write‑back → commit). In an **in‑order** pipeline an instruction can only leave a stage when its predecessor has done so, which creates stalls whenever:
* **Data hazards** – a later instruction needs a result that is still being produced (RAW) or must wait for a previous write (WAR/WAW).  
* **Control hazards** – a branch direction is unknown until the branch executes.  
* **Structural hazards** – two instructions need the same functional unit in the same cycle.

If the pipeline stalls for *S* cycles on average, the achieved instructions‑per‑cycle (IPC) is  
\[
\text{IPC} = \frac{\text{issue width}}{1 + S/\text{latency}} .
\]
Superscalar and out‑of‑order execution attack the stall term *S* by allowing independent instructions to bypass stalled ones.

### Superscalar Issue
A superscalar processor can **decode and dispatch more than one instruction per clock** (issue width *W* > 1). The front‑end therefore supplies a *bundle* of *W* instructions to the back‑end each cycle. Without out‑of‑order capabilities the back‑end would still have to execute them in program order, so the benefit of *W* is lost whenever a stall occurs in the first instruction of the bundle.

### Out‑of‑Order Execution (Dynamic Scheduling)
Out‑of‑order execution decouples **dispatch** (placing an instruction in a buffer) from **issue** (sending it to an execution unit when its operands are ready). The key mechanisms are:

| Mechanism | Purpose | How it solves a hazard |
|-----------|---------|------------------------|
| **Register renaming** | Eliminates false WAR/WAW dependencies by mapping each architectural register to a *physical* register that holds the most recent value. | A later write gets a new physical register; earlier reads still see the old physical register, so instructions can execute regardless of program order. |
| **Reservation stations / Issue queues** | Hold dispatched instructions until all source operands are available (either from registers or from preceding results via forwarding). | An instruction issues as soon as its data dependencies are satisfied, irrespective of its position in the instruction stream. |
| **Reorder buffer (ROB)** | Buffers results of executed instructions until they can be safely committed in original program order, guaranteeing precise exceptions and correct architectural state. | The ROB retires instructions from the head; if an exception occurs, younger instructions can be squashed because their results are still speculative. |

When an instruction is dispatched:
1. **Rename** its destination register to a free physical register; store the mapping in the rename table.  
2. Allocate an entry in the ROB (holds the destination physical register, PC, and exception info).  
3. Allocate a reservation station entry; wait for source operands.  
4. When both sources are ready, **issue** to the appropriate execution unit.  
5. Upon completion, write the result into the reservation station’s CDB (common data bus) and broadcast it to dependent stations and the ROB.  
6. When the instruction reaches the head of the ROB and no exception is pending, **commit**: copy the physical register’s value to the architectural register (if needed) and free the ROB entry.

This flow guarantees that the architectural state updates exactly as if instructions had executed in program order, while allowing the hardware to execute them whenever data is ready.

### Speculation
Control hazards are handled by **branch prediction**. The predictor supplies a likely target; the fetch unit speculatively pulls instructions down that path. Those instructions travel through the rename/dispatch/issue/execute pipeline just like any other, but their results are marked **speculative** in the ROB. If the predictor was wrong, the ROB is flushed (all entries after the mis‑predicted branch are discarded) and fetching restarts at the correct path. The penalty is the number of pipeline stages flushed, typically 10‑20 cycles in modern cores.

Speculation can also apply to memory dependence prediction (speculatively allowing a load to execute before a preceding store’s address is known).

---

## How It Works
### Detailed Pipeline with Out‑of‑Order Support
Consider a 4‑wide superscalar core with the following latencies:
* Integer ALU: 1 cycle  
* Load (L1 hit): 4 cycles  
* Integer multiply: 3 cycles  

The pipeline stages are:

| Stage | Function |
|-------|----------|
| IF | Fetch up to 4 instructions |
| DEC | Decode & micro‑op generation |
| REN | Register allocation & renaming (read rename table, write new mapping) |
| DISP | Allocate ROB entry & reservation station |
| ISS | Wait in reservation station until src tags match values on CDB or are ready from register file |
| EX | Execute (functional unit) |
| WB | Write result on CDB (broadcast to all waiting stations & ROB) |
| COMMIT | Head‑of‑ROB retires; architectural state updated if non‑speculative |

**Key equations** for performance analysis:

*Average issue rate*  
\[
\lambda = W \cdot (1 - p_{\text{stall}})
\]
where \(p_{\text{stall}}\) is the probability that **all** *W* dispatched instructions are blocked by unresolved dependencies.

*Expected CPI* (cycles per instruction) for a mix of instruction types with fractions \(f_i\) and latencies \(L_i\):
\[
\text{CPI} = \frac{\sum_i f_i L_i}{ \text{effective issue width} } + \text{stall penalty from mispredictions}.
\]

The out‑of‑order engine reduces \(p_{\text{stall}}\) by keeping the reservation stations full of ready instructions, effectively decoupling the issue width from the latency of long‑running operations.

### Example Timeline (illustrating the mechanics)
Assume issue width *W* = 2, and the following instruction stream (micro‑ops shown):

```
1: LD  R1, [addr]      ; load, latency 4
2: ADD R2, R1, #1      ; depends on LD
3: MUL R3, R2, #2      ; depends on ADD
4: ADD R5, R6, #7      ; independent of 1‑3
5: ADD R8, R9, #10     ; independent of 1‑4
```

Cycle‑by‑cycle (simplified):

| Cycle | IF/DEC/REN/DISP (issued) | ISS (executed) | WB (result) | Notes |
|-------|--------------------------|----------------|-------------|-------|
| 0     | 1,2                      | –              | –           | Dispatch load & first ADD |
| 1     | 3,4                      | –              | –           | Dispatch MUL & independent ADD |
| 2     | 5, –                     | –              | –           | Dispatch second independent ADD |
| 3     | –                        | **1** (LD) starts | – | Load enters EX (4‑cycle latency) |
| 4‑6   | –                        | **1** continues | – | Load still in EX |
| 7     | –                        | **1** finishes WB | R1 produced | Load result broadcast |
| 7     | –                        | **2** (ADD) can issue (src R1 ready) | – | ADD executes (1‑cycle) |
| 8     | –                        | **2** WB (R2 ready) | – | – |
| 8     | –                        | **3** (MUL) issues (src R2 ready) | – | MUL starts (3‑cycle) |
| 9‑10  | –                        | **3** continues | – | – |
| 11    | –                        | **3** WB (R3 ready) | – | – |
| 7‑8   | –                        | **4** (independent ADD) issues & WB (single cycle) | – | Executes while load pending |
| 9‑10  | –                        | **5** (independent ADD) issues & WB | – | Executes while MUL pending |

*Result*: Despite the load’s 4‑cycle latency, the core retired **5 instructions** in **12 cycles**, giving an effective IPC ≈ 0.42. An in‑order 2‑issue core would have stalled after the load, executing only the load and its dependent chain before moving on, yielding far lower IPC (≈ 0.25). The gain comes from the independent instructions (4 & 5) executing out‑of‑order while the load waits.

---

## Worked Examples
### Example 1: Out‑of‑Order Execution with Latency Hiding
**Code**
```c
/* Assume x, y, z, a, b are in registers */
x = load [ptr];          // LD r1, [ptr]   (latency 4)
y = x + 1;               // ADD r2, r1, #1
z = y * 2;               // MUL r3, r2, #2
a = b + 7;               // ADD r4, r5, #7   (independent)
c = d + 10;              // ADD r6, r7, #10  (independent)
```
Assume a 2‑issue core, latencies as above, and perfect branch prediction (no control stalls).

**Solution – step‑by‑step schedule**

| Cycle | Dispatched (IF/DEC/REN/DISP) | Issued to EX (when ready) | WB result |
|-------|------------------------------|---------------------------|-----------|
| 0     | LD r1, [ptr] ; ADD r2,r1,#1  | –                         | – |
| 1     | MUL r3,r2,#2 ; ADD r4,r5,#7  | –                         | – |
| 2     | ADD r6,r7,#10 ; –            | –                         | – |
| 3     | –                            | LD starts (4‑cyc)         | – |
| 4‑6   | –                            | LD continues              | – |
| 7     | –                            | LD WB → r1                | r1 ready |
| 7     | –                            | ADD r2,r1,#1 issues       | – |
| 8     | –                            | ADD WB → r2               | r2 ready |
| 8     | –                            | MUL r3,r2,#2 issues       | – |
| 9‑10  | –                            | MUL continues             | – |
| 11    | –                            | MUL WB → r3               | r3 ready |
| 7‑8   | –                            | ADD r4,r5,#7 issues & WB  | r4 ready |
| 9‑10  | –                            | ADD r6,r7,#10 issues & WB | r6 ready |

**Timing summary**
* Total cycles to retire all 5 µops = 12  
* IPC = 5 µops / 12 cycles ≈ 0.417  
* Ideal IPC (issue width 2, no stalls) = 2 → **speedup** ≈ 0.417/0.25 = **1.67×** over a naïve in‑order 2‑issue core that would stall after the load.

### Example 2: Speculation and Recovery on a Branch Misprediction
**Code**
```c
if (x > 5) {          // BR r1, >5 → target T1
    y = x + 3;        // T1: ADD r2, r1, #3
} else {
    y = x - 3;        // T2: SUB r2, r1, #3
}
z = y * 2;            // MUL r3, r2, #2
```
Assume:
* Branch predictor accuracy = 90% (10% mispredict).  
* Branch resolution occurs in the EX stage (2 cycles after IF).  
* Mis‑prediction penalty = pipeline flush of 4 stages (IF, DEC, REN, DISP) = 4 cycles.

**Solution – correct prediction path**
1. Cycle 0: IF fetches branch and following instructions from predicted path (say *taken* → T1).  
2. Cycle 1: DEC/REN/DISP of branch and first instruction of T1.  
3. Cycle 2: Branch EX evaluates condition; prediction correct → no flush.  
4. Cycle 2‑3: T1’s ADD issues (operand x ready from rename table), executes in 1 cycle, WB produces y.  
5. Cycle 4: MUL issues using y, executes (3‑cycle latency), WB produces z.  
6. Commit proceeds in order; no wasted work.

**Solution – misprediction (predicted *taken*, actual *not taken*)**
1. Cycles 0‑2: Same as above, fetching and decoding instructions from T1 (speculative).  
2. Cycle 2: Branch EX resolves; detects misprediction.  
3. Cycle 3: **Flush** ROB entries for all instructions after the branch (the two ADD from T1 and any further fetched instructions).  
4. Cycle 3: Restart IF at the correct fall‑through path (T2).  
5. Cycle 4‑5: FETCH/DEC/REN/DISP of SUB from T2.  
6. Cycle 6: SUB issues (x ready), executes, WB produces y.  
7. Cycle 7‑9: MUL issues, executes, WB produces z.  

**Penalty calculation**
* Useful work before misprediction: branch + 1 speculative ADD = 2 µops.  
* Wasted work: the flushed ADD (1 µop) plus the refetch/decode overhead (≈ 2 cycles).  
* Effective CPI increase due to misprediction = (mispred rate) × (penalty cycles) = 0.10 × 4 = 0.4 cycles per branch.  
* If branches constitute 20 % of instructions, overall CPI penalty ≈ 0.08, illustrating why high‑accuracy predictors are essential.

---

## Common Mistakes
| # | Misconception | Why it’s Wrong |
|---|---------------|----------------|
| 1 | “Out‑of‑order execution changes the program’s final state.” | The ROB commits results strictly in program order; speculative state is discarded on mispredict or exception. Architectural state is identical to an in‑order execution. |
| 2 | “Doubling the issue width always doubles performance.” | Performance is limited by data dependencies, memory latency, and branch mispredictions. If the dependency chain length exceeds the issue width, extra issue slots stay idle (see the *pₛₜₐₗₗ* term). |
| 3 | “Register renaming eliminates all hazards, so memory ordering is irrelevant.” | Renaming only handles register WAR/WAW. Memory dependencies (store‑load ordering) still require dependence prediction or memory disambiguation; wrong predictions cause pipeline flushes or correctness violations if not handled. |
| 4 | “Speculation only helps with branches.” | Modern CPUs also speculate on memory dependence (allowing a load to bypass a preceding store whose address is unknown) and on value prediction; mis‑speculation in these domains can be equally costly. |

---

## Exercises
1. **Easy – Timing analysis**  
   Given a 3‑issue core with latencies: ALU = 1, Load = 4, Multiply = 3, and the instruction mix: 40 % ALU, 30 % Load, 20 % Multiply, 10 % Branch (perfectly predicted). Compute the theoretical maximum IPC assuming no stalls other than the inherent latencies (i.e., each instruction occupies its functional unit for its latency). Show your work.

2. **Medium – Measuring OoO benefit on Linux**  
   Write a C program that contains two independent chains of integer operations (each chain 100 ops long) separated by a long‑latency operation (e.g., `volatile` load from a memory‑mapped region with `CLFLUSH`). Compile with `-O3 -march=native`. Use `perf stat -e cycles,instructions,cache-references,cache-misses ./a.out` to obtain IPC. Then replace the independent chains with a single dependent chain (each op uses the result of the previous). Compare the IPC values and explain the difference in terms of out‑of‑order execution.

3. **Hard – Simple out‑of‑order simulator**  
   Implement in Python (or C) a cycle‑accurate simulator of a 2‑issue, out‑of‑order core with:
   * 2 integer ALUs (1‑cycle latency)  
   * 1 load unit (4‑cycle latency)  
   * 4‑entry reservation stations per unit  
   * 8‑entry ROB  
   * Perfect register renaming (ignore physical register allocation).  
   Feed it the instruction stream from Exercise 1 and report the number of cycles to retire all instructions. Verify that the simulated IPC matches your analytical prediction.

---

## Linux Connection
The Linux kernel exposes the hardware’s out‑of‑order capabilities through performance‑monitoring interfaces and allows binding workloads to specific cores to observe effects.

* **CPU feature detection** – check for out‑of‑order support:  
  ```bash
  $ grep -i out_of_order /proc/cpuinfo | uniq
  flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc aperfmperf eagerfpu pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch epb invpcid_single pti ssbd ibrs ibpb stibp tpr_shadow vnmi flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 avx2 smep bmi2 erms invpcid mpx rdseed adx smap clflushopt intel_pt xsaveopt xsavec xsaaves xsavearot xsaves dtherm ida arat pln pts hwp hwp_notify hwp_act_window hwp_epp md_clear flush_l1d
  ```
  The presence of `outs` (actually `out_of_order` is not a flag; superscalar/out‑of‑order is implied by modern x86‑64 CPUs; the `constant_tsc`, `nonstop_tsc`, `aperfmperf`, etc., indicate a sophisticated core.)

* **Performance counters** – Linux’s `perf` tool reads the hardware performance monitoring unit (PMU) to count cycles, instructions retired, branch misses, etc.:  
  ```bash
  $ perf stat -e cycles,instructions,branch-misses,cache-references,cache-misses ./a.out
  ```
  The ratio `instructions/cycles` is the empirical IPC; a value significantly below the issue width indicates stalls that out‑of‑order execution is trying to hide.

* **Binding a process to a specific core** – using `sched_setaffinity` (or the command‑line tool `taskset`) lets you isolate the effects of OoO on a single core, eliminating migration noise:  
  ```bash
  $ taskset -c 3 ./a.out   # run on core 3 only
  ```
  Inside a program the same call is:
  ```c
  #define _GNU_SOURCE
  #include <sched.h>
  #include <stdio.h>
  #include <unistd.h>

  int main(void) {
      cpu_set_t set;
      CPU_ZERO(&set);
      CPU_SET(3, &set);                 /* bind to core 3 */
      if (sched_setaffinity(0, sizeof(set), &set) == -1) {
          perror("sched_setaffinity");
          return 1;
      }
      /* workload … */
      return 0;
  }
  ```

* **Kernel use of speculation** – The kernel itself runs speculatively on modern CPUs (e.g., lazy FPU state restore, user‑space access via `access_ok` followed by speculative loads). Mitigations such as **IBRS** (Indirect Branch Restriction Speculation) and **STIBP** (Single Thread Indirect Branch Predictors) are exposed via `/sys/devices/system/cpu/vulnerabilities/`:
  ```bash
  $ cat /sys/devices/system/cpu/vulnerabilities/spec_store_bypass
  Mitigation: Speculative Store Bypass disabled via prctl and seccomp
  ```

These interfaces let you observe, measure, and even control the effects of out‑of‑order execution and speculation from user space.

---

## Why This Matters
Understanding superscalar and out‑of‑order execution is not academic trivia; it directly shapes the performance envelope of every program that runs on Linux. The concepts explain why:

* **Instruction scheduling** matters: compilers reorder independent instructions to keep reservation stations full, turning latent stalls into useful work.  
* **Data‑oriented layout** (SoA vs. AoS) influences how many load instructions can be satisfied from the L1 cache before a long‑latency memory dependency stalls the pipeline.  
* **Branch‑heavy code** (parsers, state machines) suffers when speculation fails; profile‑guided optimization or explicit `__builtin_expect` reduces misprediction penalties.  
* **System‑call overhead** is amplified by speculation mitigations (e.g., retpoline, IBRS) that add pipeline flushes; knowing the underlying mechanism helps you decide when to batch syscalls or use `io_uring` to amortize cost.  
* **Performance tooling** (`perf`, `Intel VTune`, `AMD uProf`) relies on the same PMU events that the hardware uses to track OoO behavior; interpreting those numbers requires a grasp of rename, ROB, and issue‑queue dynamics.

By internalizing the causal chain—*fetch → decode → rename → dispatch → issue → execute → write‑back → commit*—you can predict how changes in code, compiler flags, or kernel configuration will affect IPC, latency, and energy consumption. This empowers you to write code that *works with* the hardware rather than *against* it, yielding measurable speedups in everything from high‑frequency trading loops to container‑image builds and kernel networking paths. Mastery of these principles is therefore a prerequisite for any serious Linux systems or performance engineer.
