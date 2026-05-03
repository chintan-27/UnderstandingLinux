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

## Why This Matters

Every instruction your CPU executes passes through a fixed sequence of hardware stages. How those stages are *arranged in time* is not an implementation detail — it is the reason a 3 GHz CPU can retire on the order of $3 \times 10^9$ instructions per second, and why a single poorly-placed load instruction can silently stall your hot loop for an extra cycle. Without this model, `perf stat` output is uninterpretable noise, branch misprediction penalties are magic numbers, and cache-friendly code is cargo-cult programming.

---

## Core Concepts

### The Five Canonical Stages

RISC processors (we use MIPS as the canonical teaching model because its ISA maps cleanly onto hardware) decompose every instruction into five stages:

1. **IF** — Instruction Fetch: drive the PC onto the address bus, read 32 bits from instruction memory, increment PC to $PC + 4$.
2. **ID** — Instruction Decode / Register Read: extract opcode, `rs`, `rt`, `rd` fields; read the two source registers from the register file simultaneously with decoding (the fields are in fixed positions, so this is safe).
3. **EX** — Execute: the ALU operates on its inputs. For R-type instructions this is the computation itself; for memory instructions this is address calculation: $\text{addr} = \text{reg}_{base} + \text{sign\_extend}(\text{imm}_{16})$.
4. **MEM** — Memory Access: for `lw`, drive the computed address onto the data memory bus and read; for `sw`, write. For non-memory instructions this stage passes the ALU result through unmodified.
5. **WB** — Write Back: mux between the memory read data and the ALU result, then write the selected value into the destination register.

The instruction encoding is designed so that register-file reads (ID) and the ALU computation (EX) are separable, and so that the destination register field can always be extracted and forwarded through the pipeline even before the value is known. These are not accidents — they are ISA design constraints imposed specifically to make pipelining tractable.

### Single-Cycle Design

Every instruction completes in exactly one clock cycle, meaning the clock period must accommodate the longest possible combinational path — the *critical path*. From measured stage delays:

| Instruction | Path | Total |
|-------------|------|-------|
| `lw` | IF + ID + EX + MEM + WB | 800 ps |
| `sw` | IF + ID + EX + MEM | 700 ps |
| R-format | IF + ID + EX + WB | 600 ps |
| `beq` | IF + ID + EX | 500 ps |

The clock period is pinned at **800 ps** regardless of which instruction is executing. A `beq` wastes $800 - 500 = 300\text{ ps}$ every cycle. The hardware that computes memory addresses sits dark during a `beq`; the memory port sits dark during an R-type. This is not a tunable parameter — it is a structural consequence of sharing one clock across heterogeneous instruction latencies.

### Multi-Cycle Design

Multi-cycle breaks execution into approximately equal-duration steps and allows different instructions to use different numbers of cycles. A `beq` finishes in 3 cycles; a `lw` takes 5. Hardware units can be *reused* across cycles within one instruction — the same ALU computes the memory address in cycle 3 and increments the PC in cycle 2 — which reduces chip area. The cost is a non-trivial finite-state machine to track execution state and generate the right control signals each cycle. Multi-cycle is now largely a historical design point; pipelining supersedes it for throughput while requiring similar stage decomposition.

### Pipelined Design

Pipelining retains the stage structure of multi-cycle but instantiates *separate hardware* for each stage and runs all five simultaneously on different instructions. While instruction $i$ executes in EX, instruction $i+1$ is being decoded in ID, and instruction $i+2$ is being fetched in IF.

The critical insight: **pipelining reduces time-per-instruction for the *pipeline*, not for any individual instruction**. Instruction $i$ still takes 5 cycles from IF to WB. But the pipeline sustains one instruction completion per cycle at steady state. Throughput and latency are different metrics, and pipelining trades latency neutrality for throughput improvement.

The clock period is now set by the slowest *stage*, not the slowest *instruction*:

$$T_{pipeline} = \max(t_{IF},\, t_{ID},\, t_{EX},\, t_{MEM},\, t_{WB})$$

### Hazards

Three categories of conditions break the assumption that each stage can proceed every cycle:

- **Structural hazard**: two instructions need the same physical hardware unit in the same cycle. The classic example: a unified memory that cannot simultaneously serve IF (instruction fetch) and MEM (data access). The fix is either separate instruction and data caches (the standard solution) or stalling IF when MEM is active.
- **Data hazard**: instruction $i+1$ needs a value that instruction $i$ has not yet written to the register file. Because WB occurs in cycle 5 but EX needs inputs in cycle 3, there is a 2-cycle window where the register file contains stale data.
- **Control hazard**: a taken branch changes the PC, but the pipeline has already fetched 1–3 instructions beyond the branch using the wrong PC. Those instructions must be flushed (turned into NOPs), wasting cycles proportional to the branch penalty.

---

## How It Works

### Single-Cycle Critical Path Arithmetic

Each stage has a propagation delay. For a `lw` instruction:

$$T_{clock} = t_{IF} + t_{ID} + t_{EX} + t_{MEM} + t_{WB} = 200 + 100 + 200 + 200 + 100 = 800 \text{ ps}$$

$$f_{single} = \frac{1}{800 \times 10^{-12}} \approx 1.25 \text{ GHz}$$

For a program where 25% of instructions are `lw`, 10% are `sw`, 45% are R-type, and 20% are `beq`, the average instruction time is still **800 ps** — the clock cannot adapt per-instruction.

### Pipelined Clock and Ideal Speedup

With balanced stages of 200 ps each:

$$T_{pipeline} = 200 \text{ ps}, \qquad f_{pipeline} = 5 \text{ GHz}$$

Ideal speedup over single-cycle:

$$\text{Speedup}_{ideal} = \frac{T_{single}}{T_{pipeline}} = \frac{800}{200} = 4\times$$

Note this is not $5\times$ (the number of stages) because the stages are not perfectly balanced — ID and WB are only 100 ps, so they must be padded to match the 200 ps cycle, wasting $100\text{ ps}$ per cycle in those stages.

For $k$ instructions through an $n$-stage pipeline with stage time $T_s$:

$$T_{total} = (n + k - 1) \cdot T_s$$

The time per instruction is:

$$\text{CPI}_{effective} = \frac{n + k - 1}{k} = 1 + \frac{n-1}{k}$$

As $k \to \infty$, $\text{CPI} \to 1$. For small $k$ — say a tight loop that executes only 8 iterations — the $(n-1)$ startup overhead is significant:

$$\text{CPI}_{k=8,\, n=5} = 1 + \frac{4}{8} = 1.5$$

This is why loop unrolling matters: it increases effective $k$ relative to $n$.

### Pipeline Registers

Between each stage, a bank of **D flip-flops** (the pipeline register) captures all signals produced by the upstream stage on the rising clock edge, holding them stable for the downstream stage during the next cycle. Without these registers, a fast stage would drive new signal values onto shared wires before a slow stage had finished reading them.

```
       IF/ID       ID/EX      EX/MEM     MEM/WB
         |           |           |          |
  [IF] --+--> [ID] --+--> [EX] --+--> [MEM]-+--> [WB]
```

Each register carries forward everything the downstream stages will need, because once a stage completes its work is gone — only the register contents persist:

| Register | Contents |
|----------|----------|
| IF/ID | Instruction word, $PC+4$ |
| ID/EX | `ReadData1`, `ReadData2`, sign-extended immediate, `Rs`, `Rt`, `Rd`, control signals for EX/MEM/WB |
| EX/MEM | ALU result, zero flag, `WriteData`, destination register, control signals for MEM/WB |
| MEM/WB | Memory read data, ALU result (passthrough), destination register, control signals for WB |

Control signals are decoded once in ID and then **carried through the pipeline registers** to the stage that needs them. A `RegWrite` signal decoded in cycle 2 must not act until WB in cycle 5 — it rides through ID/EX, EX/MEM, and MEM/WB, gating the register-file write at exactly the right moment.

### Data Hazard: Forwarding (Bypassing)

```asm
add  $t0, $t1, $t2   # WB writes $t0 at end of cycle 5
sub  $t3, $t0, $t4   # EX needs $t0 at start of cycle 4
```

By the time `sub` reaches EX in cycle 4, `add` is in MEM — its ALU result is sitting in the EX/MEM register, correct and stable. Forwarding routes that value directly to the ALU input of `sub`, bypassing the register file:

```
add  EX stage:  ALU result ──> EX/MEM.ALUresult
                                        │
                                        │ forward path
                                        ▼
sub  EX stage:  ALU input A ◄───────────┘
