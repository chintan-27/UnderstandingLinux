---
id: 45
title: "Asynchronous design basics"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Why This Matters

Every digital system that moves data between components operating at different speeds or different clock domains must solve one fundamental problem: how does the receiver know the data is valid, and how does the sender know the receiver is ready? Without explicit protocols, a processor pipeline reads a register before the previous instruction has written it, a CPU reads a byte from a peripheral mid-update, or a value sampled across clock domains lands in a metastable state that resolves to an arbitrary 0 or 1. These are not edge cases — they are the *default behavior* of combinational logic when time-dependent correctness is not explicitly enforced. Hazards, metastability, and handshake protocols are the same underlying problem at different scales.

---

## Core Concepts

### Hazards

A hazard is any situation where the correct value of a signal is not available at the moment it is consumed. In a pipelined processor, this arises structurally: pipeline stages overlap, and a later instruction may consume a result that an earlier instruction has not yet produced.

The three canonical types:

- **RAW (Read After Write):** A later instruction reads a register before an earlier instruction writes it. The most common pipeline hazard. Arises because the writer is still in a later stage while the reader is already in an earlier stage.
- **WAR (Write After Read):** A later instruction writes a register before an earlier instruction reads it. Impossible in a strictly in-order, single-issue pipeline — dangerous in out-of-order execution where instructions can complete non-sequentially.
- **WAW (Write After Write):** Two instructions write the same register, but the earlier write completes last. Irrelevant in simple in-order pipelines; critical in out-of-order and superscalar designs where register renaming is the standard mitigation.

The RAW hazard has a precise structural cause: in a canonical 5-stage pipeline (Fetch, Decode, Execute, Memory, Writeback), the result of an instruction is not written to the register file until Writeback — four stages after Fetch. Any instruction that enters the pipeline within those four stages and reads the same register will read a stale value. The gap is exactly $\text{pipeline\_depth} - 1 = 4$ cycles between when an instruction is fetched and when its result is committed.

### Forwarding (Bypassing)

Forwarding resolves RAW hazards by routing data directly from a downstream pipeline stage back to an upstream one, bypassing the register file. The key insight: the data *exists* in a pipeline register — it simply has not yet been committed. Forwarding shortens the data path, not the pipeline.

Specifically, the Execute stage's ALU inputs are driven by multiplexers. Normally they read from the register file (via the Decode/Execute pipeline register). With forwarding enabled, those muxes can instead select the output of the Execute/Memory pipeline register (one-cycle-old result) or the Memory/Writeback pipeline register (two-cycle-old result). The hazard unit compares destination register addresses from downstream stages against source register addresses in the Execute stage and asserts the appropriate mux select signals.

This eliminates RAW hazards for ALU-to-ALU dependencies at zero cycle cost.

### Stalls

Forwarding cannot resolve every RAW hazard. A `lw` instruction does not produce its result until *after* the Memory stage — the data must be read from memory before it exists anywhere in the pipeline. If the immediately following instruction needs that value, it enters Execute before the load has completed Memory. There is no pipeline register holding the correct data in time.

The only solution is a **load-use stall**: freeze the Fetch and Decode stages (holding their pipeline registers constant), flush the Execute stage (inserting a NOP bubble), and allow the load to complete Memory. This shifts the dependent instruction one cycle later, so the Memory stage result is available for forwarding into Execute. Cost: exactly one cycle, unconditionally.

The timing constraint that forces this stall is:

$$t_{\text{data\_available}} = t_{\text{issue}} + 2 \cdot T_{\text{clk}}$$
$$t_{\text{data\_needed}} = t_{\text{issue}} + 1 \cdot T_{\text{clk}}$$

The data is available one full cycle after it is needed. Forwarding can close a gap of zero cycles (same-cycle availability) but cannot go backward in time.

### Control Hazards

A branch instruction does not resolve its target address until it evaluates the branch condition. In a standard 5-stage pipeline with branch resolution in the Memory stage, three instructions have already been fetched speculatively by the time the branch outcome is known. If the branch is taken, all three must be flushed — their pipeline registers cleared to NOP — at a cost of three cycles per taken branch.

The flush penalty in cycles equals the number of pipeline stages between Fetch and the stage where the branch resolves:

$$\text{flush\_penalty} = \text{stage}(\text{branch\_resolve}) - \text{stage}(\text{Fetch})$$

Moving branch resolution to Decode (by adding a comparator and adder there instead of using the ALU in Execute) reduces the penalty to one cycle, because only one instruction has been fetched after the branch. The tradeoff is additional hardware in the Decode stage and a potential increase in the Decode stage's critical path delay.

### Synchronization and Metastability

When a signal crosses between two clock domains — or from asynchronous logic into a synchronous system — the destination flip-flop's setup and hold time requirements may be violated. The flip-flop enters a **metastable state**: its output is neither a valid logic 0 nor a valid logic 1. It will eventually resolve, but after an unpredictable delay that can extend beyond the clock period.

The probability that metastability persists beyond time $t$ after the clock edge decays exponentially:

$$P(\text{unresolved after } t) = e^{-t/\tau}$$

where $\tau$ is a technology-dependent time constant, typically in the range of hundreds of picoseconds for modern CMOS. The mean time between failures (MTBF) for a synchronizer input switching at rate $f_{\text{data}}$ with clock frequency $f_{\text{clk}}$ and resolution window $T_{\text{resolve}}$ is:

$$\text{MTBF} = \frac{e^{T_{\text{resolve}}/\tau}}{f_{\text{clk}} \cdot f_{\text{data}} \cdot T_W}$$

where $T_W$ is the metastability window (the input skew range that causes a violation, typically picoseconds). You cannot eliminate metastability — you can only reduce the probability that it persists long enough to propagate. A **synchronizer** does this by inserting two flip-flops in series (clocked by the destination domain), giving the first flip-flop's output a full clock period to resolve before the second samples it.

Two flip-flops gives one period of resolution time. Three flip-flops gives two periods. The MTBF improves exponentially with each additional stage, which is why high-reliability designs use three-stage synchronizers at the cost of three cycles of crossing latency.

### Handshakes

A handshake protocol allows two components to communicate without any assumption about relative timing. It requires no shared clock and is immune to arbitrary speed differences, making it the correct solution for truly asynchronous communication (as opposed to synchronizers, which solve the clocked-domain-crossing problem).

The canonical four-phase (return-to-zero) handshake:

1. Sender places data on the bus and asserts **REQ**.
2. Receiver detects REQ, samples data, asserts **ACK**.
3. Sender detects ACK, deasserts REQ.
4. Receiver detects REQ deasserted, deasserts ACK. Bus is idle.

Each transition is conditioned on observing the other side's transition. Neither side can race ahead. The protocol is **deadlock-free by construction** as long as both sides follow it — if either side halts, the other halts too rather than corrupting data. This is not a performance protocol; each transfer requires four signal transitions. Two-phase (non-return-to-zero) handshakes halve this to two transitions per transfer by using edge-sensitive detection, at the cost of more complex logic.

---

## How It Works

### RAW Hazard: Cycle-by-Cycle

```asm
add  $s0, $t0, $t1   # writes $s0; result available end of cycle 3 (Execute)
and  $t2, $s0, $t3   # reads $s0 in Decode at cycle 3 — stale (not yet written)
or   $t4, $s0, $t5   # reads $s0 in Decode at cycle 4 — stale
sub  $t6, $s0, $t7   # reads $s0 in Decode at cycle 5 — correct (Writeback at cycle 5)
```

Cycle timeline (F=Fetch, D=Decode, E=Execute, M=Memory, W=Writeback):

| Instruction | C1 | C2 | C3     | C4     | C5     |
|-------------|----|----|--------|--------|--------|
| `add`       | F  | D  | E      | M      | **W**  |
| `and`       |    | F  | **D**  | E      | M      |
| `or`        |    |    | F      | **D**  | E      |
| `sub`       |    |    |        | F      | **D**  |

`and` reads `$s0` at Decode in cycle 3. `add` writes `$s0` at Writeback in cycle 5. The consumer is two cycles *ahead* of the producer. Without forwarding, `and` and `or` both read the register file value that predates the `add` instruction entirely.

With forwarding:
- `and`: `$s0` is forwarded from the Execute/Memory pipeline register (end of cycle 3) into `and`'s Execute stage (cycle 4). Zero stall cycles.
- `or`: `$s0` is forwarded from the Memory/Writeback pipeline register into `or`'s Execute stage (cycle 5). Zero stall cycles.
- `sub`: reads correct value from register file. No forwarding needed.

### Forwarding Logic

The hazard unit runs combinationally every cycle, comparing the destination register of instructions in the Memory and Writeback stages against the source registers of the instruction in Execute:

```c
// Forwarding mux
