---
id: 53
title: "Pipelining"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Core Concepts
Pipelining partitions the instruction execution process into **n** sequential stages, each completed in one clock cycle. The **clock period** \(T_{clk}\) is set by the slowest stage plus latch overhead:
\[
T_{clk}= \max\{t_{IF},t_{ID},t_{EX},t_{MEM},t_{WB}\}+t_{setup}+t_{clk\!-\!q}
\]
If every stage can accept a new operation each cycle, the **ideal throughput** is one instruction per cycle (IPC = 1). The **ideal speedup** over a single‑cycle datapath of latency \(L = n \cdot T_{clk}\) is:
\[
S_{ideal}= \frac{L}{T_{clk}} = n
\]
Real pipelines suffer stalls that increase the **average CPI** (cycles per instruction):
\[
\text{CPI}=1+\frac{\text{stall cycles}}{\text{inst}}
\]
Stalls arise from three hazard classes, each rooted in a resource or dependence conflict:

* **Structural hazard** – two instructions require the same hardware resource in the same cycle (e.g., a single‑ported memory array needed simultaneously for IF and MEM). The conflict forces one instruction to wait until the resource becomes free.
* **Data hazard** – an instruction needs a result that has not yet been written to the architectured register file. In a classic 5‑stage RISC pipeline the result becomes available after the **EX** stage for ALU ops, after **MEM** for loads, and after **WB** for the write‑back stage. If the consumer reads the register in **ID** before the producer has written it, a **RAW** (read‑after‑write) hazard occurs. Anti‑dependences (WAR) and output dependences (WAW) are avoided by register renaming in out‑of‑order cores but still matter for in‑order pipelines.
* **Control hazard** – the fetch stage cannot determine the next PC until the branch condition is resolved. In the 5‑stage model the branch outcome is known at the end of **EX**, so the fetch of the next instruction must be delayed or speculated. A misprediction forces the pipeline to flush all instructions fetched after the branch, incurring a penalty equal to the number of stages between fetch and resolution.

Understanding these mechanisms from first principles lets us quantify performance loss:
\[
\text{Stall cycles per instruction}= f_{struct}\cdot p_{struct}+f_{data}\cdot p_{data}+f_{ctrl}\cdot p_{ctrl}
\]
where \(f\) is the frequency of the hazard‑causing pattern and \(p\) the average penalty when it occurs.

## How It Works
### Five‑Stage RISC Pipeline
| Stage | Function | Typical hardware | Output latch |
|-------|----------|------------------|--------------|
| IF    | Fetch instruction from I‑cache | Instruction cache, PC adder | IF/ID |
| ID    | Decode, register read, immediate generation | Register file, decoder | ID/EX |
| EX    | ALU operation or address calculation | ALU, shifter | EX/MEM |
| MEM   | Data memory access (load/store) | D‑cache, byte lane logic | MEM/WB |
| WB    | Write result back to register file | Register file write port | — |

Each latch holds the control signals and data needed by the downstream stage; the latch delay contributes to \(t_{setup}+t_{clk\!-\!q}\) in the clock period formula above.

### Forwarding (Data Hazard Resolution)
When a producer writes its result in **EX** (ALU) or **MEM** (load), the value can be forwarded directly to the **EX** stage of a consumer that needs it in the same cycle. The forwarding paths are:
* **EX → EX** (ALU‑to‑ALU): from the EX/MEM latch to the ALU input mux.
* **MEM → EX** (load‑to‑ALU): from the MEM/WB latch to the ALU input mux.
* **MEM → MEM** (store‑data forwarding): from EX/MEM to the store data path (less common).

A load-use hazard remains because the data is only available at the end of **MEM**; if the dependent instruction needs it in **EX**, a one‑cycle stall is unavoidable unless the pipeline implements a load‑forward path (some architectures do, but it adds complexity and may increase \(t_{clk}\)).

### Branch Prediction and Control Hazard Mitigation
The branch decision (comparison of two registers) is performed in **EX**. Without prediction, the pipeline would stall for two cycles (the IF and ID stages following the branch). Prediction allows the fetch unit to speculatively fetch the predicted target. A **2‑bit saturating counter** per branch address (stored in a Branch Target Buffer, BTB) updates as follows:
```
if taken   -> state = min(state+1, 3)
if not taken -> state = max(state-1, 0)
```
Predicted taken when state ∈ {2,3}. The **misprediction penalty** equals the number of stages after fetch that must be flushed:
\[
\text{Penalty}= \text{stage of resolution} - \text{fetch stage}= EX - IF = 2 \text{ cycles}
\]
More aggressive predictors (e.g., tournament, perceptron) reduce the misprediction rate \(m\) but increase area and access time, potentially raising \(t_{clk}\).

### Structural Hazard Avoidance
A common structural conflict is the single‑ported data cache used by both IF (instruction fetch) and MEM (load/store). Solutions:
* **Split caches** (Harvard architecture) – separate I‑cache and D‑cache eliminate the conflict.
* **Stall** – if conflict occurs, stall the IF stage for one cycle; this adds to CPI proportionally to the conflict probability.
* **Banked caches** – multiple banks allow parallel accesses if addresses map to different banks.

## Worked Examples
Assume each stage takes exactly one clock cycle, branch resolved in **EX**, and a perfect predictor unless stated otherwise.

### Example 1: No Hazards
```asm
ADD $t0, $t1, $t2
SUB $t3, $t4, $t5
MUL $t6, $t7, $t8
```
Timeline (stage per cycle):
```
Cycle: 1 2 3 4 5 6 7
IF:    ADD SUB MUL -  -  -  -
ID:    - ADD SUB MUL -  -  -
EX:    - - ADD SUB MUL -  -
MEM:   - - - ADD SUB MUL -
WB:    - - - - ADD SUB MUL
```
Total cycles = \(n + k -1 = 3 + 5 -1 = 7\).  
CPI = \(7/3 ≈ 2.33\) **if** we count only the first three instructions; however, the steady‑state IPC after filling the pipeline is 1. The **average CPI** for a long stream of independent instructions tends to 1.

### Example 2: Data Hazard with Forwarding
```asm
ADD $t0, $t1, $t2   # t0 = t1 + t2
SUB $t3, $t0, $t4   # t3 = t0 - t4
MUL $t5, $t3, $t6   # t5 = t3 * t6
```
*Without forwarding*: SUB would need the result of ADD, which is only written back in WB (cycle 5), causing a 2‑cycle stall. MUL would similarly stall for SUB.

*With forwarding*:
* After ADD finishes EX (cycle 3), its result is available in the EX/MEM latch and can be forwarded to SUB’s EX input in cycle 4.
* After SUB finishes EX (cycle 4), its result is forwarded to MUL’s EX input in cycle 5.

Timeline:
```
Cycle: 1 2 3 4 5 6 7
IF:    ADD SUB MUL -  -  -  -
ID:    - ADD SUB MUL -  -  -
EX:    - - ADD SUB MUL -  -
MEM:   - - - ADD SUB MUL -
WB:    - - - - ADD SUB MUL
```
No stalls; CPI = 1. Note that if the second instruction were a **LW** followed by an **ALU** that uses the loaded value, a load‑use hazard would still require a one‑cycle stall because the data is only ready after MEM.

### Example 3: Control Hazard – Branch Misprediction
```asm
BEQ $t0, $t1, Label   # branch if t0 == t1
ADD $t2, $t3, $t4     # fall‑through path
Label: MUL $t5, $t6, $t7
```
Assume $t0 ≠ $t1 (branch not taken) but the predictor **predicts taken** (state initially weak taken). The predictor will fetch from Label in the next cycle.

Pipeline evolution (stall cycles shown as bubbles):
```
Cycle: 1    2    3    4    5    6    7    8
IF:    BEQ  Label ADD  -    -    MUL  -    -
ID:    -    BEQ  Label ADD  -    -    MUL  -
EX:    -    -    BEQ  Label ADD  -    -    MUL
MEM:   -    -    -    BEQ  Label ADD  -    -
WB:    -    -    -    -    BEQ  Label ADD  -
```
At cycle 3 the BEQ resolves in EX as **not taken**, but the pipeline has already fetched `Label` (MUL) and `ADD`. Those two instructions are flushed; the correct fall‑through `ADD` must be refetched.

*Penalty*: 2 cycles (the IF and ID slots after the branch are wasted).  
If the predictor had correctly predicted **not taken**, the pipeline would have suffered no stall:
```
Cycle: 1 2 3 4 5 6
IF:    BEQ ADD MUL - - -
ID:    - BEQ ADD MUL - -
EX:    - - BEQ ADD MUL -
MEM:   - - - BEQ ADD MUL
WB:    - - - - BEQ ADD MUL
```
Thus the average stall contribution from this branch is:
\[
\text{Stall} = m \times 2
\]
where \(m\) is the misprediction probability.

## Common Mistakes
| Mistake | Why it’s Wrong | Correct Understanding |
|---------|----------------|-----------------------|
| **Assuming forwarding eliminates all data hazards** | Forwarding only works when the producer’s result is ready **before** the consumer needs it. Load‑use hazards (producer is a load, consumer needs the value in the next EX stage) still require a stall because data appears only after MEM. | Recognize the latency of each functional unit; insert a stall or schedule independent instructions between a load and its use. |
| **Believing a deeper pipeline always yields higher performance** | Increasing pipeline depth raises clock frequency but also raises branch misprediction penalty and latch overhead; beyond a point, the CPI increase outweighs the frequency gain. | Optimize depth for the target workload: balance \(T_{clk}\) reduction against increased penalty \(p_{ctrl}\cdot m\) and structural conflict probability. |
| **Ignoring structural hazards caused by shared functional units** | A single ALU cannot service both an EX operation and an address calculation for a load/store in the same cycle, leading to stalls that are often mistakenly attributed to “bad code”. | Duplicate critical units (e.g., separate ALU for address generation) or schedule memory‑independent ALU ops away from load/store cycles. |
| **Thinking branch prediction is only about hardware** | Predictor warm‑up time, working set size, and branch correlation affect accuracy; a perfect static predictor still suffers on unpredictable branches (e.g., data‑dependent loops). | Use profile‑guided optimization (`gcc -fprofile-generate`) to expose hot branches, and consider compiler hints (`__builtin_expect`) or likely/unlikely macros. |
| **Assuming CPI = 1 is attainable in real code** | Real instruction mixes contain loads, stores, branches, and dependencies that inevitably generate stalls; memory hierarchy misses add additional latency beyond pipeline stalls. | Measure actual CPI with performance counters (`perf stat -e cycles,instructions`) and target reductions in stall sources (e.g., improve locality to reduce cache miss‑related stalls). |

## Exercises
### 1. Easy – CPI Calculation
Given a workload with the following instruction mix and hazard rates:
* 50% ALU ops (no hazard)
* 25% Loads, of which 20% are followed by an instruction that uses the loaded value (load-use hazard, penalty = 1 cycle)
* 25% Branches, misprediction rate = 10%, penalty = 2 cycles

Compute the average CPI. Show your work.

**Solution Sketch**:  
\[
\text{CPI}=1 + (0.25\times0.20\times1) + (0.25\times0.10\times2) = 1 + 0.05 + 0.05 = 1.10
\]

### 2. Medium – Design a Forwarding Unit
Draw the datapath for a 5‑stage pipeline showing the two forwarding muxes (EX/MEM → ALU input, MEM/WB → ALU input). Write a small **SystemVerilog** module that takes the control signals `ForwardA` and `ForwardB` (2‑bit each) and selects the correct operand for the ALU. Include comments explaining why each path is needed.

### 3. Hard – Branch Prediction Trade‑off
Consider a tight loop:
```c
for (int i=0; i<N; ++i) {
    if (data[i] > threshold)   // branch B1
        sum += data[i];
}
```
Assume the branch is taken with probability \(p=0.7\). A 2‑bit predictor starts weakly not taken (state=0).  
*Derive* the steady‑state misprediction rate for this pattern.  
Then, assuming a misprediction penalty of 3 cycles (due to a deeper pipeline where branch resolves in MEM), compute the effective CPI contribution of the branch.  
Finally, discuss how increasing the predictor to a **2‑level adaptive** predictor would change the misprediction rate, and what hardware cost (in bits per branch) this entails.

*Hint*: Model the predictor as a Markov chain on its 2‑bit state.

### 4. Optional – Linux‑Based Measurement
Write a bash script that:
1. Compiles a simple C program with `-O0` and `-O3`.
2. Runs each binary under `perf stat -e cycles,instructions,branch-misses,cache-references,cache-misses`.
3. Parses the output to report IPC and branch‑miss rate for each optimization level.
Explain how the observed differences relate to pipelining concepts discussed.

## Linux Connection
Linux exposes the micro‑architectural state of CPUs through **virtual filesystems** and **perf** interfaces, letting you observe the effects of pipelining directly.

* **CPU topology** – list cores, threads, and cache layout:
  ```bash
  lscpu --extended
  cat /sys/devices/system/cpu/cpu0/topology/thread_siblings_list
  ```
* **Performance counters** – `perf` reads the PMU (Performance Monitoring Unit) which counts pipeline events:
  ```bash
  # Measure CPI of a program
  perf stat -e cycles,instructions ./myprog
  # IPC = instructions / cycles
  ```
  To see pipeline stalls caused by load‑use hazards:
  ```bash
  perf stat -e ld_blocks.store_forward,mem_load_retired.l1_miss ./myprog
  ```
* **Branch prediction stats**:
  ```bash
  perf stat -e branch-misses,branches ./myprog
  ```
  The ratio `branch-misses / branches` is the misprediction probability \(m\).
* **Controlling hyper‑threading** (which can exacerbate structural hazards on shared execution units):
  ```bash
  # Disable SMT (hyper‑threading) system‑wide
  echo off > /sys/devices/system/cpu/smt/control
  # Re‑enable
  echo on > /sys/devices/system/cpu/smt/control
  ```
* **Setting affinity** to reduce cross‑core interference (helps keep a thread’s pipeline hot):
  ```bash
  taskset -c 0-3 ./myprog   # bind to cores 0‑3
  ```
* **Prefetch control** – some CPUs allow disabling hardware prefetchers to expose latent memory‑level stalls:
  ```bash
  echo 0 > /sys/devices/system/cpu/cpu0/CPUFreq/prefetch_disable   # varies by vendor
  ```
* **Reading MSR (Model‑Specific Registers)** for detailed pipeline stats (requires root):
  ```bash
  # Example: Intel X86 – count uops dispatched per cycle
  rdmsr -p 0 0x000001B0   # IA32_PERF_CTR0 after configuring IA32_PERF_EVTSEL0
  ```

These tools let you verify hypotheses: e.g., if you see a high `branch-misses` count, you know the control hazard is limiting IPC; a high `ld_blocks.store_forward` indicates load‑use stalls that forwarding cannot eliminate.

## Why This Matters
Understanding pipelining transforms performance tuning from guesswork into a systematic engineering process:

* **Instruction scheduling** – compilers (e.g., `gcc -O2 -fschedule-insins`) reorder instructions to keep the pipeline fed; knowing which stalls are avoidable informs whether to rely on the compiler or hand‑optimize assembly.
* **Data‑layout decisions** – struct padding, array alignment, and cache‑friendly traversal reduce structural hazards caused by memory bank conflicts and load‑use latency.
* **Branch‑friendly code** – using `likely/unlikely` macros, branch‑less tricks (conditional moves), or loop‑tiling lowers the misprediction probability \(m\), directly cutting the stall term in the CPI formula.
* **Resource provisioning** – when designing kernels or RTL, you decide whether to duplicate functional units, add extra read/write ports to the register file, or split caches based on the quantified cost of structural hazards.
* **Performance measurement** – tools like `perf` and `htop` give you the raw counters (cycles, instructions, branch‑misses) needed to compute real CPI and validate that your optimizations actually moved the pipeline closer to its ideal throughput.

In short, pipelining is the bridge between ISA semantics and silicon speed. Mastering its mechanisms lets you write code, configure the kernel, and even propose hardware changes that sustain the highest possible instructions‑per‑cycle on modern Linux systems.
