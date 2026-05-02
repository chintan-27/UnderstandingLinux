---
id: 44
title: "Synchronous design"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Why This Matters

Digital systems are built on a lie: we pretend signals are either 0 or 1, and that transitions happen instantaneously. Reality is messier — signals take finite time to propagate through gates, and at the moment of a transition they occupy a forbidden analog middle ground. Without a disciplined framework for when signals are allowed to change relative to a clock edge, a single flip-flop receiving a signal at the wrong moment can enter a state that is neither 0 nor 1, remain stuck there for an unbounded time, and corrupt every downstream calculation that depends on it. This is metastability, and it has caused spacecraft failures, network packet corruption, and kernel panics.

The rules of synchronous design — setup time, hold time, clock domain discipline, and reset strategy — exist to prevent this class of failure entirely, and to ensure that when it cannot be prevented (signals truly crossing clock domains), the probability of disaster is calculable and manageable. Linux kernel developers reason about these constraints explicitly when writing drivers that touch hardware across clock domain boundaries, when designing memory-mapped register access sequences, and when choosing between GPIO interrupt strategies.

---

## Core Concepts

### The Aperture: Setup and Hold Time

A flip-flop captures its D input on a clock edge and propagates it to Q. The flip-flop is built from cross-coupled NAND or NOR gates — a bistable circuit with two stable states and one unstable equilibrium. For the flip-flop to resolve cleanly into one of those stable states, the input must be constant long enough for the internal feedback to commit. That resolution window has two components:

- **Setup time ($t_{su}$):** D must be stable at least this long *before* the active clock edge. Violating this means the flip-flop's master latch is still in transition when the clock arrives.
- **Hold time ($t_h$):** D must remain stable at least this long *after* the active clock edge. Violating this means the slave latch is disturbed while the master is trying to commit.

Together they define the **forbidden aperture** around the clock edge. Any data transition inside this window is a timing violation.

The timing constraint for a register-to-register path is:

$$t_{pcq} + t_{pd} \leq T_c - t_{su}$$

where $t_{pcq}$ is the clock-to-Q propagation delay (worst-case), $t_{pd}$ is the maximum combinational delay along the path, and $T_c$ is the clock period. Rearranging for the **minimum achievable clock period**:

$$T_c \geq t_{pcq} + t_{pd} + t_{su}$$

The hold constraint governs the *minimum* delay along a path. The contamination delay — the earliest time a new value can appear at the next flip-flop's input after the clock edge — must exceed the hold time:

$$t_{ccq} + t_{cd} \geq t_h$$

where $t_{ccq}$ is the clock-to-Q contamination (minimum) delay and $t_{cd}$ is the minimum combinational delay through the path. Hold violations cannot be fixed by slowing the clock because they are independent of $T_c$ — they are a property of the path delay and the flip-flop's hold requirement. The only fix is adding delay (buffer insertion) to the short path, which synthesis tools do automatically only if hold analysis is enabled and the path is visible to the tool.

### Metastability

When the aperture constraint is violated, the flip-flop's internal nodes settle to a voltage near the metastable equilibrium point — neither a valid logic 0 nor a valid logic 1. The bistable circuit will eventually resolve, because thermal noise perturbs it off the unstable equilibrium, but the time to resolution is not bounded by any fixed deadline.

The resolution process is an exponential decay away from the equilibrium point. The probability that a flip-flop remains metastable longer than time $t$ after the clock edge is:

$$P(\text{unresolved after } t) \propto e^{-t/\tau}$$

where $\tau$ is a technology-dependent time constant, typically 20–200 ps for modern CMOS processes. A smaller $\tau$ means the flip-flop resolves faster — it is a key figure of merit for synchronizer design. Because the decay is exponential, every additional nanosecond of resolution time reduces failure probability by a factor of $e^{1\text{ ns}/\tau}$, which at $\tau = 50\text{ ps}$ is a factor of roughly $e^{20} \approx 5 \times 10^8$.

### Clock Domains

A **clock domain** is a set of flip-flops all driven by the same clock signal (or signals with a fixed, known phase relationship). Within one domain, if timing constraints are met, signal transitions are synchronous and correct by construction.

When a signal generated in domain A (frequency $f_A$) is sampled by domain B (frequency $f_B$), the two clocks are in general asynchronous. The arriving data edge can land anywhere in domain B's clock cycle, including inside the aperture. Metastability is not a rare pathological case here — it is a routine event whose rate is determined by how often the data and clock edges align.

The standard mitigation is a **two-flop synchronizer**: two flip-flops in series in the destination domain, with no combinational logic between them. The first flip-flop may go metastable, but it is given a full destination clock cycle to resolve before the second flip-flop samples it. The mean time between failures (MTBF) is:

$$\text{MTBF} = \frac{e^{t_{resolve}/\tau}}{T_0 \cdot f_{data} \cdot f_d}$$

where $t_{resolve}$ is the time available for resolution (approximately one destination clock period minus $t_{su}$ of the second flop), $f_{data}$ is the rate at which the source signal can change, $f_d$ is the destination clock frequency, and $T_0$ is a technology constant with units of seconds. A three-flop synchronizer gives $t_{resolve} \approx 2T_d - t_{su}$, roughly doubling the exponent and squaring the MTBF.

**Handshake synchronizers** (request/acknowledge pairs) are used when entire buses must cross clock domains — you cannot synchronize each bit independently, because different bits may resolve to different values on different cycles.

### Reset Strategies

**Asynchronous reset** asserts immediately when the reset signal goes active, bypassing the clocked data path through a dedicated clear input on the flip-flop cell. The flip-flop's output is forced low (or high) within nanoseconds of reset assertion, with no requirement for a clock edge.

The failure mode is on *deassertion*: if reset releases within the aperture of a clock edge, the flip-flop sees reset going away and data arriving simultaneously and may go metastable. The reset signal itself becomes a signal crossing into the clock domain on release. The standard fix is **reset synchronization**: pass the reset deassertion through a two-flop synchronizer before distributing it to the design, ensuring clean synchronous release while preserving the fast asynchronous assertion.

**Synchronous reset** feeds reset as a data input through a mux before the flip-flop's D input. The flip-flop has no dedicated clear path; reset only takes effect at the next rising clock edge after assertion. This eliminates deassertion metastability entirely — reset release is just a data transition that will be captured on the next cycle — but it requires the clock to be running and glitch-free before reset can take effect, which is a constraint during power-on sequencing.

---

## How It Works

### Timing Analysis Example

For a register-to-register path with $t_{pcq} = 80\text{ ps}$, three cascaded gate stages with $t_{pd} = 40\text{ ps}$ each, and $t_{su} = 50\text{ ps}$:

$$T_c \geq 80 + (3 \times 40) + 50 = 250\text{ ps}$$

$$f_{max} = \frac{1}{250 \times 10^{-12}} = 4\text{ GHz}$$

For the hold check on a short path with $t_{ccq} = 30\text{ ps}$, $t_{cd} = 25\text{ ps}$ (one buffer), and $t_h = 20\text{ ps}$:

$$t_{ccq} + t_{cd} = 30 + 25 = 55\text{ ps} \geq 20\text{ ps} \checkmark$$

The margin is 35 ps. Now introduce clock skew $\delta$ — the difference in clock arrival time between the source and destination flip-flops. Skew tightens the hold constraint directly:

$$t_{ccq} + t_{cd} \geq t_h + \delta$$

If $\delta = 40\text{ ps}$, the required margin rises to 40 ps and the 35 ps margin is gone — a hold violation exists regardless of clock frequency. Real clock trees are designed to minimize $\delta$; post-layout STA (static timing analysis) re-checks all paths with extracted skew values.

### HDL: Synchronous vs. Asynchronous Reset

The behavioral difference maps to different synthesized cells:

```systemverilog
// Asynchronous reset: responds to the reset edge itself, not just clock edges.
// Synthesizes to a flip-flop cell with a dedicated CLR pin.
module flopr_async #(parameter WIDTH = 4) (
    input  logic             clk, reset,
    input  logic [WIDTH-1:0] d,
    output logic [WIDTH-1:0] q
);
    always_ff @(posedge clk or posedge reset)
        if (reset) q <= '0;
        else       q <= d;
endmodule

// Synchronous reset: reset is just data. No CLR pin used.
// Synthesizes to a flip-flop with a mux on its D input.
// Costs one LUT (FPGA) or extra area (ASIC) relative to async.
module flopr_sync #(parameter WIDTH = 4) (
    input  logic             clk, reset,
    input  logic [WIDTH-1:0] d,
    output logic [WIDTH-1:0] q
);
    always_ff @(posedge clk)        // reset absent from sensitivity list
        if (reset) q
