---
id: 52
title: "Microarchitecture"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Core Concepts
### Introduction to Microarchitecture
Microarchitecture is the concrete realization of an Instruction Set Architecture (ISA) in logic gates, storage elements, and interconnects. It determines how instructions are fetched, decoded, executed, and how results are written back, directly influencing **clock‑frequency (f)**, **cycles‑per‑instruction (CPI)**, and **energy per operation**.

* **Instruction Set Architecture (ISA)** – the contractual interface visible to software: opcode encoding, register file size, memory addressing modes, and exception model. Changing the ISA (e.g., from x86‑64 to AArch64) requires a new binary interface but does not dictate internal implementation.
* **Implementation** – the gate‑level netlist that obeys the ISA contract. Two implementations of the same ISA can differ in pipeline depth, execution‑unit count, cache hierarchy, and power‑gating strategy.
* **Pipelining** – a technique that overlaps the execution of multiple instructions by partitioning the datapath into stages separated by pipeline registers. If an instruction requires *k* stages and the clock period is *T*, the ideal throughput is one instruction per *T* (CPI = 1) after the pipeline fills, whereas a non‑pipelined design would need *k·T* per instruction (CPI = *k*).

Key quantitative relationships (derived from first principles):
- **Clock period**: \( T = \frac{1}{f} \)  (seconds)
- **Ideal CPI for a *k*-stage pipeline**: \( \text{CPI}_{ideal} = 1 \)
- **Actual CPI**: \( \text{CPI} = 1 + \frac{\text{Stall cycles}}{\text{Instruction count}} \)
- **Throughput (instructions / second)**: \( \theta = \frac{f}{\text{CPI}} \)
- **Speedup vs. single‑cycle** (single‑cycle CPI = *k*):  
  \[
  S = \frac{k}{\text{CPI}} = \frac{k}{1 + \text{Stall\%}}
  \]

These formulas make clear why increasing pipeline depth (*k*) only helps if the added stall cycles (from hazards, memory latency, branch misprediction) remain low.

### How It Works
A classic five‑stage RISC pipeline partitions the datapath as follows:

| Stage | Function | Typical hardware |
|-------|----------|------------------|
| IF    | Instruction Fetch | PC → Instruction Memory → IR |
| ID    | Instruction Decode / Register Read | Register File, Immediate Generator |
| EX    | Execute / Address Calculation | ALU, Shifter |
| MEM   | Memory Access | Data Memory (load/store) |
| WB    | Write Back | Register File write port |

Each stage is separated by a **pipeline register** that holds the intermediate results (PC+4, IR, A, B, ALU‑Out, MEM‑Out, etc.). The registers prevent **write‑after‑read (WAR)** and **read‑after‑write (RAW)** hazards by ensuring that a stage only sees the state of the previous stage at the clock edge.

#### Hazard Mechanisms
1. **Structural Hazards** – arise when two instructions need the same hardware resource in the same clock cycle (e.g., a single memory port for IF and MEM). Solution: duplicate the resource or stall the later instruction.
2. **Data Hazards (RAW)** – occur when an instruction needs a result that has not yet been written back. The pipeline can **forward** (bypass) the ALU‑Out or MEM‑Out directly to the EX stage inputs, eliminating the stall if the producing instruction is in EX or MEM. If the producer is still in MEM and the consumer needs the value for address calculation, a one‑cycle stall is unavoidable.
3. **Control Hazards** – branch instructions change the PC before the target is known. Predict‑not‑taken, static prediction, or a Branch Target Buffer (BTB) with a 2‑bit saturating counter reduce misprediction penalty. Penalty = pipeline depth until the branch resolves (typically 3 cycles for a 5‑stage pipeline).

#### Timing Derivation
Assume each stage has a maximum combinational delay *d* and pipeline‑register overhead *t_r*. The clock period must satisfy:
\[
T \ge d + t_r
\]
If we split the datapath into *k* equal stages, *d* ≈ \( \frac{D}{k} \) where *D* is the delay of the original single‑cycle datapath. Hence:
\[
T(k) \approx \frac{D}{k} + t_r
\]
The **maximum frequency** is \( f_{max}(k) = \frac{1}{T(k)} \). Increasing *k* reduces the first term but adds register overhead; beyond a point, *t_r* dominates and frequency saturates.

### Worked Examples
We use a 5‑stage pipeline with clock period *T* = 1 ns (f = 1 GHz). Register‑file read/write and ALU each take 0.2 ns; memory access (cache hit) takes 0.6 ns; pipeline‑register overhead *t_r* = 0.05 ns.

#### Example 1: Single‑Cycle Processor – `ADD R1,R2,R3`
- **Critical path**: IF (0.2 ns) + ID (0.2 ns) + EX (0.2 ns) + MEM (0.2 ns, no memory) + WB (0.2 ns) = 1.0 ns → *T* = 1 ns, CPI = 1.
- **Execution time** for one instruction = 1 ns.

#### Example 2: Multi‑Cycle Processor – `LOAD R1,0x100`
Assume a three‑phase FSM: IF → ID → MEM → WB.
- IF: fetch instruction (0.2 ns + memory latency 50 ns for DRAM miss) = 50.2 ns  
- ID: decode (0.2 ns)  
- MEM: address calc (0.2 ns) + data‑cache hit (0.6 ns) = 0.8 ns  
- WB: write register (0.2 ns)  
Total ≈ 51.4 ns → CPI ≈ 51.4 (since each instruction occupies the datapath exclusively).

#### Example 3: Pipelined Processor – `ADD R1,R2,R3` followed by `SUB R4,R5,R6`
We show cycle‑by‑cycle state (✓ = stage active, – = stall).

| Cycle | IF | ID | EX | MEM | WB |
|-------|----|----|----|-----|----|
| 1 | ADD | – | – | – | – |
| 2 | SUB | ADD | – | – | – |
| 3 | – | SUB | ADD | – | – |
| 4 | – | – | SUB | ADD | – |
| 5 | – | – | – | SUB | ADD |
| 6 | – | – | – | – | SUB |

No data hazard because SUB reads R5,R6, not R1. Each instruction finishes after 5 cycles, but the **pipeline completes one instruction per cycle after the initial latency**.  
Total time for two instructions = 6 ns → **Effective CPI = 6 ns / (2 instr × 1 ns) = 3**? Wait, we must compute correctly: each instruction takes 5 ns latency, but throughput is 1 instr per ns after fill. Over a long sequence, CPI → 1. For just two instructions, average CPI = (total cycles) / (instr count) = 6 / 2 = 3. This illustrates the **pipeline fill penalty**.

Now add a data hazard: `ADD R1,R2,R3` followed by `ADD R4,R1,R5`. The second ADD needs R1 produced by the first ADD, which is available at the end of EX (cycle 3) via forwarding to EX of the second instruction (cycle 4). Pipeline:

| Cycle | IF | ID | EX | MEM | WB |
|-------|----|----|----|-----|----|
| 1 | ADD1 | – | – | – | – |
| 2 | ADD2 | ADD1 | – | – | – |
| 3 | – | ADD2 | ADD1 (fwd) | – | – |
| 4 | – | – | ADD2 | ADD1 | – |
| 5 | – | – | – | ADD2 | ADD1 |
| 6 | – | – | – | – | ADD2 |

No stall needed; CPI remains 1 after fill. If the dependency were on a load (`LOAD R1,mem` then `ADD R4,R1,R5`), the load’s data is only available after MEM, causing a one‑cycle stall:

| Cycle | IF | ID | EX | MEM | WB |
|-------|----|----|----|-----|----|
| 1 | LD | – | – | – | – |
| 2 | ADD | LD | – | – | – |
| 3 | – | ADD | LD (stall) | – | – |
| 4 | – | – | ADD (fwd from MEM) | LD | – |
| 5 | – | – | – | ADD | LD |
| 6 | – | – | – | – | ADD |

Here the stall occurs in cycle 3 (ID of ADD cannot proceed because EX needs the load result). The effective CPI for this pair = (6 cycles) / 2 instr = 3, showing how memory latency propagates into pipeline stalls.

### Common Mistakes
| Mistake | Why It’s Wrong | Correct Understanding |
|---------|----------------|-----------------------|
| **Pipelining always yields linear speedup with depth** | Ignores stalls from hazards and the fact that clock period may not shrink proportionally due to register overhead. | Speedup = \( \frac{k}{1+ \text{stall\%}} \); beyond a certain *k*, added stages increase stall% or *t_r* and reduce frequency. |
| **More pipeline stages = lower latency per instruction** | Latency (time from fetch to write‑back) actually grows with number of stages because each stage adds register latency. | Latency ≈ *k·T*; throughput improves, not latency. |
| **Forwarding eliminates all data hazards** | Forwarding cannot resolve hazards where the consumer needs the result before it is produced (e.g., a load‑use hazard). | Load‑use requires at least one stall; forwarding only helps for ALU‑ALU dependencies. |
| **Branch prediction removes branch penalties** | Mispredictions still incur a flush penalty equal to the pipeline depth between fetch and branch resolution. | Effective CPI = 1 + (misprediction rate × penalty). |
| **CPI < 1 only possible with superscalar execution** | While true for in‑order pipelines, out‑of‑order issue can also achieve CPI < 1 by executing multiple independent instructions per cycle. | CPI < 1 indicates issue width > 1 or out‑of‑order parallelism. |
| **Pipeline registers are free** | They consume area, power, and add setup/hold timing constraints that affect the achievable clock frequency. | Register overhead *t_r* appears in the clock‑period inequality; excessive pipelining can degrade f_max. |

### Exercises
1. **Single‑Cycle Datapath Timing**  
   Given a 32‑bit ripple‑carry adder with propagation delay 120 ps per bit, a register‑file read/write delay of 80 ps, and a memory‑access delay of 300 ps (cache hit), compute the minimum clock period for a single‑cycle processor that implements `ADD`, `SUB`, `LOAD`, `STORE`. Show the critical path for each instruction and the resulting maximum frequency.

2. **Multi‑Cycle FSM Design**  
   Draw the state diagram (states: IF, ID, EX, MEM, WB) for a processor that implements `LOAD` and `STORE` with separate memory‑access phases (address calc, data read/write). Derive the control signals (MemRead, MemWrite, RegWrite, ALUSrc) for each state as Boolean functions of the opcode bits.

3. **Pipelined Hazard Detection**  
   Write a SystemVerilog module for a 5‑stage pipeline hazard unit that takes as inputs the EX‑stage destination register, MEM‑stage destination register, and the ID‑stage source registers, and outputs:  
   - `stall` (assert when a load‑use hazard is detected)  
   - `forwardA` and `forwardB` (2‑bit selectors: 00 = register file, 01 = EX‑ALU result, 10 = MEM‑ALU result, 11 = WB‑write‑back).  
   Include comments explaining the logic.

4. **CPI Calculation from Instruction Mix**  
   A benchmark consists of 40 % ALU ops, 20 % loads, 20 % stores, 10 % branches, 10 % jumps. Assume:  
   - ALU ops: no stalls.  
   - Loads: 2‑cycle stall on a cache miss (miss rate 5 %).  
   - Stores: no stall (write‑through buffer).  
   - Branches: 2‑cycle penalty on misprediction (misprediction rate 2 %).  
   Compute the overall CPI.

5. **Linux perf Experiment**  
   Write a tiny C program that executes a tight loop of `ADD` instructions (using inline asm). Compile with `-O0` and `-O3`. Run `perf stat -e cycles,instructions,cache-references,cache-misses ./prog` for each binary and report the IPC (instructions per cycle). Explain the observed differences in terms of pipeline utilization and branch prediction.

6. **Kernel‑Level Pipeline Observation**  
   Using `/sys/devices/system/cpu/cpu0/cpufreq/`, show how to read the current frequency and enable the `intel_pstate` governor. Then run `turbostat --show Interval,Core,Avg_MHz,Busy%,Bzy_MHz,IRQ` while executing the loop from Exercise 5 to see how the core’s active frequency correlates with IPC.

### Linux Connection
Linux exposes the microarchitectural state of each core through virtual filesystems and performance‑monitoring interfaces.

* **CPU topology and capabilities**  
  ```bash
  # Show vendor, model, cache sizes, and flags (including avx2, sse4_2, etc.)
  lscpu
  # Equivalent detailed view
  cat /proc/cpuinfo
  ```

* **Frequency scaling and idle states**  
  ```bash
  # Current governor and available frequencies for cpu0
  cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
  cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_frequencies
  # Switch to performance governor (root)
  echo performance | tee /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
  ```

* **Performance counters via perf**  
  ```bash
  # Measure cycles, instructions, and cache misses for a program
  perf stat -e cycles,instructions,cache-references,cache-misses ./myprog
  # Sample branch mispredictions
  perf record -e branch-misses ./myprog
  perf report
  ```

* **Reading Model‑Specific Registers (MSRs)** – requires `msr` root module  
  ```bash
  sudo modprobe msr
  # Read the IA32_PERF_GLOBAL_STATUS MSR (0x38E) to see overflow flags
  sudo rdmsr 0x38E
  ```

* **Cache hierarchy inspection**  
  ```bash
  # Level‑1 data cache size and line size for cpu0
  cat /sys/devices/system/cpu/cpu0/cache/index0/size
  cat /sys/devices/system/cpu/cpu0/cache/index0/coherence_line_size
  # Walk through all caches
  for d in /sys/devices/system/cpu/cpu0/cache/index*; do
      echo "$(basename $d): $(cat $d/size) $(cat $d/coherence_line_size)"
  done
  ```

* **Monitoring pipeline stalls indirectly** – the `stalled-cycles-frontend` and `stalled-cycles-backend` events count cycles where the fetch or execution units are idle due to hazards.  
  ```bash
  perf stat -e stalled-cycles-frontend,stalled-cycles-backend ./myprog
  ```

These tools let a developer correlate source‑level changes (e.g., loop unrolling, prefetch intrinsics) with microarchitectural metrics observed in the Linux kernel.

### Why This Matters
Understanding microarchitecture bridges the gap between abstract ISA specifications and the tangible performance numbers that appear in profiling tools.  

* **Compiler optimizations** (instruction scheduling, loop unrolling, software pipelining) are justified only when the target’s pipeline depth, latency, and hazard characteristics are known.  
* **Operating‑system decisions**—such as choosing a timer tick rate, deciding when to context‑switch, or allocating huge pages—depend on the cost of pipeline flushes and cache misses revealed by counters like `stalled-cycles-backend` and `cache-misses`.  
* **Security mitigations** (e.g., retpoline, IBRS) exist precisely because microarchitectural features like speculative execution and branch prediction can leak data across privilege boundaries; knowing the pipeline lets you evaluate the performance impact of these mitigations.  
* **Power management** relies on the fact that each pipeline stage consumes dynamic power proportional to its switching activity; reducing stalls saves energy by keeping the pipeline busy with useful work rather than toggling idle logic.  
* **Heterogeneous systems** (CPU + GPU + FPGA) require a common language for describing throughput and latency; the pipeline model provides that language, enabling schedulers to assign work to the unit whose microarchitectural characteristics best match the workload’s instruction mix and memory behavior.

By mastering the quantitative relationships—clock period versus stage count, CPI versus stall sources, and how Linux exposes these metrics—you gain the ability to reason rigorously about performance, to diagnose bottlenecks correctly, and to design software and system‑software that fully exploit the underlying hardware. This is the payoff: moving from “my program is slow” to “my program stalls 30 % of cycles on load‑use hazards, which I can eliminate by inserting a software prefetch or rearranging the loop.”
