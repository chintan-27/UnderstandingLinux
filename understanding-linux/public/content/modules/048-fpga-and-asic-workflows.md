---
id: 48
title: "FPGA and ASIC workflows"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Why This Matters

A logic design that simulates perfectly can still fail in silicon. Synthesis converts RTL into a netlist of real gates; place-and-route maps those gates onto physical resources with real wire delays; timing closure verifies that every signal meets its setup and hold requirements under those physical delays. These are not bureaucratic steps — each one introduces constraints that did not exist at the RTL level. Wire resistance and capacitance at 7 nm add more delay than the gates themselves. A hold violation ships a chip that computes wrong answers at room temperature and fails completely at high temperature, where $t_{hold}$ increases. The flip-flop timing equations governing a single register path (Harris §3.5) must be satisfied simultaneously for every one of the millions of paths in a real design, under every corner of PVT (process, voltage, temperature) variation.

---

## Core Concepts

### Synthesis

Synthesis takes RTL HDL — Verilog or VHDL — and maps it to a technology-specific netlist: a directed graph of gates, flip-flops, and interconnect. A synthesis tool applies three transformations in sequence:

1. **Elaboration** — parses HDL and builds a generic Boolean network (AND/OR/NOT/FF), resolving parameters and generate statements. The result is technology-independent.
2. **Technology mapping** — replaces generic gates with cells from a standard cell library (for ASICs, e.g., TSMC 28nm PDK cells such as `AND2X1`, `DFFX1`) or with LUTs and registers (for FPGAs, e.g., Xilinx 6-input LUT6 and FDRE flip-flops). The mapper minimizes the number of cells used while respecting drive strength requirements.
3. **Optimization** — restructures logic to minimize area, power, or delay. For timing, it may re-time flip-flops (move registers across combinational logic without changing behavior) or duplicate logic to reduce fanout, which reduces capacitive load and therefore $t_{pd}$.

The output is a gate-level netlist in Verilog or a proprietary checkpoint format. At this stage wire delays are estimated using statistical RC models — actual delay is unknown until placement.

### Place and Route

**Placement** assigns each cell to a physical location on the die or FPGA fabric. **Routing** connects those cells with metal wires. Both steps determine timing because wire delay scales with length:

$$t_{wire} = R_{sheet} \cdot \frac{L}{W} \cdot C_{per\_unit} \cdot L = k \cdot L^2$$

For a wire of length $L$, resistance scales as $L$ and capacitance scales as $L$, so RC delay scales as $L^2$. At 28 nm and below, a 1 mm wire on a lower metal layer can add 200–400 ps — more than a logic gate. This is why placement quality directly determines whether timing closure is achievable: if two timing-critical registers are placed 2 mm apart, no amount of logic optimization recovers that delay.

On an FPGA, placement assigns logic to specific CLBs (Configurable Logic Blocks, each containing LUTs and flip-flops) and routing programs a switch matrix of pass transistors and multiplexers. The switch matrix itself has fixed delays that the router must account for.

### Timing Closure

Timing closure is the iterative process of driving all path slacks non-negative. It terminates only when every register-to-register path satisfies both its setup and hold constraints simultaneously. The closure conditions come directly from flip-flop aperture requirements (Harris §3.5):

**Setup constraint** — combinational logic between two registers must settle before the receiving flip-flop samples:

$$T_c \geq t_{pcq} + t_{pd} + t_{setup}$$

**Hold constraint** — the new value must not arrive at the input of the receiving flip-flop before it has safely captured the old value:

$$t_{ccq} + t_{cd} \geq t_{hold}$$

where:
- $t_{pcq}$ = clock-to-Q propagation delay (worst-case, for setup analysis)
- $t_{ccq}$ = clock-to-Q contamination delay (best-case, for hold analysis)
- $t_{pd}$ = combinational propagation delay on the longest (critical) path
- $t_{cd}$ = combinational contamination delay on the shortest path
- $t_{setup}$, $t_{hold}$ = receiver flip-flop aperture requirements

A **setup violation** means $T_c$ is too short — fix by increasing the clock period or reducing $t_{pd}$ via pipelining or logic restructuring.

A **hold violation** means $t_{cd}$ is too small — the signal races through too quickly. **You cannot fix a hold violation by slowing the clock.** Reducing $T_c$ makes setup harder while leaving hold unchanged, because the hold constraint contains no $T_c$ term. The only fix is adding delay to the short path — inserting buffers or routing detours.

### Timing Constraints

The tool sees only a netlist. It does not know your clock frequency, which paths cross clock domains, or which paths are structurally present but never exercised in real operation. You supply this information in **SDC (Synopsys Design Constraints)** format, which all major tools accept:

| Constraint | Purpose |
|---|---|
| `create_clock` | Declares frequency, waveform, and source pin |
| `set_input_delay` / `set_output_delay` | Models delay from off-chip sources/sinks relative to the clock |
| `set_false_path` | Excludes a path from timing analysis entirely |
| `set_multicycle_path` | Relaxes a path to $N \cdot T_c$ instead of $T_c$ |
| `set_clock_groups` | Declares asynchronous relationships between clock domains |

Incorrect constraints are as dangerous as a logic error. Over-constraining wastes area and power as the tool over-optimizes; under-constraining ships a design with undetected violations.

---

## How It Works

### Slack and the Critical Path

For every register-to-register path, the tool computes:

$$\text{setup slack} = T_c - (t_{pcq} + t_{pd} + t_{setup})$$

$$\text{hold slack} = (t_{ccq} + t_{cd}) - t_{hold}$$

Positive slack means the constraint is met; negative slack is a **violation** that must be resolved before tapeout. The path with the most negative setup slack is the **critical path** — it sets the minimum achievable clock period and therefore $f_{max}$.

The tool reports slack not at a single operating point but across multiple **timing corners**: slow-slow (slow process, low voltage, high temperature — worst for setup), fast-fast (fast process, high voltage, low temperature — worst for hold), and typically several intermediate corners. A design is not closed until all corners pass.

### Example: Computing $f_{max}$ from a Critical Path

Three-stage combinational path (Harris §3.5, Figure 3.43): $t_{pcq} = 80\,\text{ps}$, $t_{pd} = 40\,\text{ps}$ per gate (three gates), $t_{setup} = 50\,\text{ps}$:

$$T_c \geq t_{pcq} + 3 \cdot t_{pd} + t_{setup} = 80 + 120 + 50 = 250\,\text{ps}$$

$$f_{max} = \frac{1}{T_c} = \frac{1}{250 \times 10^{-12}} = 4\,\text{GHz}$$

Now suppose the same path after place-and-route has a wire delay of $t_{wire} = 200\,\text{ps}$ on the connection between gate 2 and gate 3:

$$T_c \geq 80 + 40 + 40 + 200 + 40 + 50 = 450\,\text{ps}$$

$$f_{max} = \frac{1}{450 \times 10^{-12}} \approx 2.22\,\text{GHz}$$

The wire delay alone cut $f_{max}$ nearly in half. No logic optimization after placement can recover this — the fix must be at placement: move the two cells closer, or pipeline the path to split $t_{pd}$.

### A Minimal SDC Constraints File

```tcl
# 100 MHz clock on the clk port; period in nanoseconds
create_clock -period 10.0 -name sys_clk [get_ports clk]

# Input data is driven by a flip-flop on the board that launches
# 2 ns after the rising edge; tool sees 2 ns already consumed
set_input_delay -clock sys_clk -max 2.0 [get_ports data_in]

# Receiving register on the board requires data stable 1 ns before
# the next rising edge; tool sees 1 ns already consumed at destination
set_output_delay -clock sys_clk -max 1.0 [get_ports data_out]

# Reset is an asynchronous input written once at power-on.
# It crosses no timing path and must not be analyzed.
set_false_path -from [get_ports rst_n]
```

The `-max` variants of `set_input_delay` and `set_output_delay` apply to setup analysis. You should also set `-min` variants for hold analysis — omitting them leaves hold at the I/O boundary unconstrained.

### FPGA Synthesis and Implementation (Xilinx/AMD Vivado)

Vivado separates synthesis and implementation into distinct phases, each producing a **design checkpoint** (`.dcp`) that captures the netlist, constraints, and physical state. This allows you to iterate on implementation without re-running synthesis.

```bash
# Run synthesis in batch mode using a Tcl script
vivado -mode batch -source synth.tcl 2>&1 | tee synth.log
```

```tcl
# synth.tcl — synthesis script
read_verilog design.v
read_xdc constraints.xdc

# -part specifies the exact device: Artix-7 35T in CPG236 package, speed grade -1
synth_design -top top_module -part xc7a35tcpg236-1

write_checkpoint post_synth
