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

A circuit that works in simulation can fail catastrophically in silicon. The gap between a correct logical design and a working physical chip is bridged by synthesis, place-and-route, and timing closure — and if any step fails silently, you get hardware that corrupts data at speed, locks up under temperature, or simply never boots. The failure mode is not a crash with a stack trace; it is a register sampling a transitioning signal, producing a metastable output that resolves to an arbitrary value. Every CPU, SoC, and FPGA that runs Linux passed through these workflows before a single instruction executed.

## Core Concepts

### Synthesis: From HDL to Gates

Synthesis takes Verilog or VHDL and maps it to a library of real, characterized cells — AND2, DFF, MUX2, full adder — from a target technology. For FPGAs the target is LUT-based fabric; for ASICs it is a foundry-specific standard cell library at a process node (e.g., TSMC 28 nm). The tool performs two distinct optimizations:

- **Logic optimization**: eliminates redundant terms using Boolean algebra and technology-independent restructuring, minimizing cone depth to reduce propagation delay
- **Technology mapping**: selects which cells from the library implement each function, trading area (cell count) against speed (fewer logic levels)

The output is a **netlist**: a directed graph of gate instances and their connections, with no physical coordinates assigned. Critically, synthesis uses *estimated* wire delays — actual delays depend on physical placement, which has not happened yet.

### Place-and-Route: Assigning Physical Reality

Placement assigns each gate instance to a physical location. In an FPGA, that means assigning logic to specific LUT-FF slices; in an ASIC, to rows of standard cells. Routing then finds wire paths through the available metal layers.

Wire delay is not negligible. Resistance $R$ and capacitance $C$ of a wire segment combine to produce an RC delay:

$$t_{wire} \approx 0.38 \cdot R \cdot C = 0.38 \cdot (\rho \cdot L / A) \cdot (\varepsilon \cdot L / d)$$

This grows quadratically with wire length $L$, which is why the placer actively minimizes wire length for timing-critical nets. A gate that synthesizes to a 50 ps delay can have its slack consumed entirely by a poorly placed, high-fanout net routing across the die.

The tool iterates between placement and timing analysis, using **timing-driven placement** to pull the endpoints of critical paths physically closer. After routing, every wire segment has a measured $RC$ and thus a precise delay that replaces the synthesis estimates.

### Timing Analysis: Enforcing the Dynamic Discipline

Once routing is complete, static timing analysis (STA) enumerates every register-to-register path and checks two constraints that come directly from flip-flop physics.

**Setup constraint** — data must arrive and be stable before the capturing clock edge:

$$T_c \geq t_{pcq} + t_{pd} + t_{setup}$$

where $T_c$ is the clock period, $t_{pcq}$ is the clock-to-Q propagation delay of the launch register, $t_{pd}$ is the worst-case combinational path delay, and $t_{setup}$ is the setup time of the capture register.

**Hold constraint** — data must not change before the capture register has latched the previous value:

$$t_{ccq} + t_{cd} \geq t_{hold}$$

where $t_{ccq}$ is the *contamination* (best-case) delay through the launch register and $t_{cd}$ is the shortest combinational path delay.

The hold constraint is independent of clock frequency — it is a property of minimum-delay paths only. This means slowing the clock does not fix a hold violation; you must increase the short-path delay by inserting buffers. Hold violations introduced by routing are particularly dangerous because the routing tool may create a path shorter than the tool anticipated during synthesis.

### Timing Closure

**Slack** is the signed margin on a constraint:

$$\text{slack}_{\text{setup}} = T_c - (t_{pcq} + t_{pd} + t_{setup})$$

$$\text{slack}_{\text{hold}} = (t_{ccq} + t_{cd}) - t_{hold}$$

Negative slack on any path is a violation. The tool reports the worst negative slack as **WNS (Worst Negative Slack)** and the sum of all negative slacks as **TNS (Total Negative Slack)**. Closure means driving both to zero or better.

The iterative fix cycle is: identify critical path → re-synthesize that cone (retiming, gate sizing, logic restructuring) → re-place nearby cells → re-route affected nets → re-run STA. For hold violations, the fix is automatic buffer insertion on the offending short path.

### Constraints: Telling the Tool What Matters

Without constraints, STA has no reference point. The constraint file defines the problem the tool is solving. **SDC (Synopsys Design Constraints)** is the industry standard format, used by both FPGA and ASIC tools.

Key constructs:

- `create_clock`: defines a clock's period and waveform; without this, the tool cannot check any setup or hold constraint
- `set_input_delay` / `set_output_delay`: models external path segments that the tool cannot see — the logic driving your input pins, or the register capturing your outputs downstream
- `set_false_path`: marks paths that are never sensitized simultaneously (e.g., scan chains during functional mode, or configuration registers written only at startup) — removing them from STA prevents false critical paths
- `set_multicycle_path`: when combinational logic is designed to take $N$ cycles, this relaxes the setup constraint by $(N-1) \cdot T_c$, preventing the tool from uselessly trying to shorten a path that is intentionally slow

Incorrect constraints are often more dangerous than missing ones: a `set_false_path` applied to a path that *is* functionally active masks a real violation.

## How It Works

### A Concrete Timing Path

Given:
- $t_{pcq} = 80\,\text{ps}$, $t_{setup} = 50\,\text{ps}$
- Three gate levels at $t_{pd} = 40\,\text{ps}$ each, plus routing at $t_{wire} = 30\,\text{ps}$

$$T_c \geq 80 + 3(40) + 30 + 50 = 280\,\text{ps}$$

$$f_{max} = \frac{1}{280\,\text{ps}} \approx 3.57\,\text{GHz}$$

For the hold check on a short path: $t_{ccq} = 30\,\text{ps}$, one gate $t_{cd} = 25\,\text{ps}$, wire $t_{wire,min} = 0\,\text{ps}$ (direct connection after routing). With $t_{hold} = 60\,\text{ps}$:

$$\text{slack}_{hold} = (30 + 25) - 60 = -5\,\text{ps}$$

This is a hold violation. The fix is inserting a buffer with contamination delay $\geq 5\,\text{ps}$ on that path. In practice, tools insert two matched buffers to avoid introducing new asymmetries.

### SDC Constraint File

```tcl
# Define a 4 GHz clock on pin clk
create_clock -period 0.250 -name sys_clk [get_ports clk]

# Input data arrives 50 ps after the launching clock edge (external register delay)
set_input_delay -clock sys_clk -max 0.050 [get_ports data_in]

# Output must be captured: it must be stable 30 ps before the next clock edge
set_output_delay -clock sys_clk -max 0.030 [get_ports data_out]

# This path crosses asynchronous clock domains — no timing relationship exists
set_false_path -from [get_clocks clk_a] -to [get_clocks clk_b]

# This accumulator takes 2 cycles by design — relax setup by one period
set_multicycle_path 2 -setup -from [get_cells accum_reg*]
# Also adjust hold for a 2-cycle path: hold checks shift to the previous edge
set_multicycle_path 1 -hold  -from [get_cells accum_reg*]
```

Note the paired `set_multicycle_path` for hold: forgetting the hold adjustment with a multicycle setup path creates a spurious hold violation at the original launch edge.

### FPGA Implementation Flow (Open Source)

The open-source **Yosys + nextpnr** toolchain implements the full synthesis and place-and-route flow for several FPGA families. This runs natively on any Linux system.

```bash
# Install on Debian/Ubuntu
sudo apt install yosys nextpnr-ice40 icestorm

# Synthesis: Verilog -> technology-mapped netlist for iCE40 fabric
# synth_ice40 runs: coarse logic opt -> technology mapping -> LUT packing
yosys -p "synth_ice40 -top my_module -json my_design.json" my_design.v

# Place and route: assigns LUT-FF slices and routes interconnect
# --hx8k: iCE40 HX8K device; --package ct256: 256-ball BGA package
nextpnr-ice40 --hx8k --package ct256 \
              --json my_design.json \
              --pcf my_constraints.pcf \
              --asc my_design.asc \
              --timing-allow-fail   # remove this in production

# nextpnr prints timing after routing, e.g.:
# Info: Max frequency for clock 'clk': 87.32 MHz (PASS at 50.00 MHz)
# If it prints FAIL, you have negative slack.

# Pack placed/routed design into iCE40 binary bitstream
icepack my_design.asc my_design.bin

# Program the FPGA via USB (iceprog requires write permission on /dev/ttyUSB*)
iceprog my_design.bin
```

The `.pcf`
