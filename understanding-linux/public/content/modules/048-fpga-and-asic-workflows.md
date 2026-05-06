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

## Core Concepts
### FPGA vs. ASIC: Silicon Foundations
An **FPGA** (Field‑Programmable Gate Array) is a prefabricated silicon die that contains a regular array of **configurable logic blocks (CLBs)**, programmable interconnects, and I/O blocks. Each CLB typically holds a **lookup‑table (LUT)** (often 6‑input) and a flip‑flip. The configuration is stored in **SRAM cells** (or antifuse/flash in some families) that define the LUT truth values and the multiplexer settings of the interconnect. Because the configuration logic is *volatile* (SRAM‑based) the device can be reprogrammed any number of times, but the configuration must be loaded at power‑up.

An **ASIC** (Application‑Specific Integrated Circuit) is a **custom‑masked** silicon die where the transistor layout, interconnect geometry, and logic functions are fixed during fabrication. The design undergoes **mask‑set generation** (one set per metal layer) and a **non‑recurring engineering (NRE)** cost that can reach millions of dollars. The benefit is that every transistor is placed exactly where the designer wants it, eliminating the overhead of programmable routing and configuration memory, which yields:
* **Higher performance** – shorter interconnect delays (typically 2‑5× faster than an equivalent FPGA).
* **Lower static power** – no configuration SRAM leakage.
* **Higher density** – more logic per mm² because the routing resources are not over‑provisioned.

### Why the Design Flow Differs
Both flows start from an HDL description, but the **implementation targets** diverge:
* In FPGA flow the **technology mapping** step must map generic gates onto the fixed CLB primitives (LUT+FF). The mapper therefore solves a **technology‑binding problem**: minimize the number of LUTs while respecting fan‑out and carry‑chain constraints.
* In ASIC flow the mapper targets a **standard‑cell library** (e.g., NAND2, NOR2, XOR1, flip‑flops) supplied by the foundry. The optimization problem becomes a **gate‑sizing and buffer insertion** task to meet timing under arbitrary load capacitance.

### Key Metrics and Their Origins
* **Area (A)** – measured in equivalent gate count (FPGA: number of LUTs; ASIC: µm²). Derived from the placement step: \(A = \sum_{i} a_i\) where \(a_i\) is the area of placed cell *i*.
* **Maximum frequency (f_max)** – limited by the **critical‑path delay** \(t_{cp}\). For a synchronous design:
  \[
  f_{\max} = \frac{1}{t_{cp} + t_{setup} + t_{skew}}
  \]
  where \(t_{setup}\) is the flip‑flop setup time and \(t_{skew}\) accounts for clock‑tree variation.
* **Power (P)** – split into dynamic and static:
  \[
  P_{dyn}= \alpha C_{eff} V_{dd}^{2} f
  \]
  \[
  P_{static}= I_{leak} V_{dd}
  \]
  (\(\alpha\) = activity factor, \(C_{eff}\) = switched capacitance per node). In FPGAs the configuration SRAM contributes a significant static term; in ASICs leakage dominates at advanced nodes.

---

## How It Works
### 1. Design Entry
* HDL (Verilog/SystemVerilog or VHDL) describes **behavior** or **structural** netlist.
* The description must be **synthesis‑friendly**: avoid unsupported constructs (e.g., initial blocks in combinational logic, non‑blocking assignments inside combinational always blocks).

### 2. Synthesis
Synthesis transforms HDL into a **gate‑level netlist** while optimizing for area, speed, and power.

| Sub‑step | What happens | Why it matters |
|----------|--------------|----------------|
| **Parsing** | Lexer → AST; checks syntax and semantic rules. | Guarantees a well‑formed IR for later transformations. |
| **Elaboration** | Instantiates modules, resolves parameter values, builds hierarchy. | Creates a flat (or hierarchically annotated) netlist where each node is a primitive operation. |
| **Optimization** | Applies Boolean algebra (constant propagation, dead‑code removal), **resource sharing**, and **retiming**. | Reduces node count; retiming can move registers across combinational logic to balance delays without changing functionality. |
| **Technology Mapping** | Covers the optimized DAG with **library cells** (LUTs for FPGA, standard cells for ASIC). Uses **pattern matching** or **flow‑map** algorithms. | Determines the final primitive set; quality directly impacts area and delay. |
| **Output** | Writes an **EDIF**, **Verilog netlist**, or **BLIF** file plus **SDC/XDC** constraints. | This netlist is the input to place‑and‑route. |

*Example of a timing‑driven optimization*: If a node has slack \(s = T_{req} - (t_{pd}+t_{setup}+t_{skew}) < 0\), the mapper may **duplicate** the driver or **insert buffers** to reduce fan‑out capacitance, thereby lowering \(t_{pd}\).

### 3. Place‑and‑Route (P&R)
P&R assigns physical locations to logic elements and creates wiring that respects design rules.

1. **Global Placement** – treats cells as movable objects, minimizes a quadratic wirelength objective:
   \[
   \min \sum_{(i,j)} w_{ij} \| (x_i,y_i) - (x_j,y_j) \|^2
   \]
   subject to density constraints (prevents overlap).  
   *Why*: spreads high‑fan‑out nets evenly, reducing congestion.

2. **Legalization / Detailed Placement** – snaps cells to legal sites (FPGA CLB rows, ASIC standard‑cell rows) while preserving the global solution.

3. **Global Routing** – routes nets on a coarse grid, estimating congestion via **routing demand** vs **capacity** per grid edge. Uses **maze‑routing** (Lee algorithm) with congestion costs.

4. **Detailed Routing** – assigns actual metal layers and vias, obeying **design‑rule checks (DRC)** (minimum width, spacing, via rules).  
   *Why*: ensures manufacturability; violations cause shorts or opens.

5. **Extraction & RC Generation** – produces a **parasitic RC network** for each net; fed back to the timing engine.

### 4. Timing Closure
Static Timing Analysis (STA) computes **arrival times** at each pin and **required times** based on constraints.

* **Setup check** (launch edge → capture edge):
  \[
  t_{arr}^{launch} + t_{pd}^{comb} + t_{setup}^{ff} \le t_{clk} + t_{skew}^{clk}
  \]
* **Hold check** (same edge):
  \[
  t_{arr}^{launch} + t_{pd}^{comb} \ge t_{hold}^{ff} + t_{skew}^{clk}
  \]
* **Slack** = Required – Arrival. Positive slack = timing margin; negative slack = violation.

Optimization iterations:
* **Buffer insertion** to reduce slew and capacitance on long nets.
* **Gate sizing** (increase drive strength) to lower \(t_{pd}\).
* **Netlist restructuring** (e.g., rewriting a wide‑xor as a tree of 2‑input xors) to balance delays.
* **Clock‑tree synthesis (CTS)** to minimize skew: target \(t_{skew} < 10\) ps for high‑speed designs.

### 5. Constraints
Constraints are expressed in **SDC** (Synopsys Design Constraints) for ASIC or **XDC** (Xilinx Design Constraints) for FPGA. They drive every optimization step.

| Constraint Type | Typical Syntax | Effect |
|-----------------|----------------|--------|
| `create_clock` | `create_clock -period 5.000 -name clk [get_ports clk]` | Sets target period, defines launch/capture edges. |
| `set_input_delay` | `set_input_delay -max 1.2 -clock clk [get_ports data_in]` | Models external source timing. |
| `set_output_delay` | `set_output_delay -max 0.8 -clock clk [get_ports data_out]` | Models external sink timing. |
| `set_max_area` | `set_max_area 15000` (FPGA LUT count) | Forces placer to keep utilization below a threshold. |
| `set_power_budget` | `set_power_budget -max 500` (mW) | Guides clock‑gating and voltage‑frequency scaling. |
| `set_false_path` | `set_false_path -from [get_regs *] -to [get_regs *]` | Excludes irrelevant paths (e.g., across asynchronous FIFO) from timing analysis. |

Missing or overly loose constraints cause the tools to optimize for the wrong objective, leading to **over‑design** (wasted area/power) or **under‑design** (timing failures).

---

## Worked Examples
### Example 1: FPGA‑Based 8‑Bit ALU (Vivado)
**Goal**: Implement an ALU that supports ADD, SUB, AND, OR. Target a **Xilinx Artix‑7** (XC7A35T) device, aiming for **250 MHz** clock.

#### Step‑by‑Step
1. **RTL (alu.v)**
   ```verilog
   module alu (
       input  wire        clk,
       input  wire        rst_n,
       input  wire [1:0]  op,      // 00:ADD, 01:SUB, 10:AND, 11:OR
       input  wire [7:0]  a,
       input  wire [7:0]  b,
       output reg  [7:0]  result
   );
       always @(posedge clk or negedge rst_n) begin
           if (!rst_n) result <= 8'b0;
           else case (op)
               2'b00: result <= a + b;
               2'b01: result <= a - b;
               2'b10: result <= a & b;
               2'b11: result <= a | b;
           endcase
       end
   endmodule
   ```

2. **Create a Vivado project & add constraints (alu.xdc)**
   ```tcl
   # 4 ns period = 250 MHz
   create_clock -period 4.0 -name clk [get_ports clk]
   set_input_delay  -max 0.5 -clock clk [get_ports a]
   set_input_delay  -max 0.5 -clock clk [get_ports b]
   set_input_delay  -min 0.0 -clock clk [get_ports a]
   set_input_delay  -min 0.0 -clock clk [get_ports b]
   set_output_delay -max 0.5 -clock clk [get_ports result]
   set_output_delay -min 0.0 -clock clk [get_ports result]
   ```

3. **Synthesis (Tcl snippet)**
   ```tcl
   read_verilog alu.v
   synth_design -top alu -part xc7a35tcsg324-1
   # effort level high for better timing
   set_property synth_design_effort_level High [get_runs synth_1]
   launch_runs synth_1 -jobs 4
   wait_on_run synth_1
   ```

4. **Place‑and‑Route**
   ```tcl
   launch_runs impl_1 -jobs 4 -to_step write_bitstream
   wait_on_run impl_1
   ```

5. **Timing Report Extraction**
   ```bash
   vivado -mode batch -source report_timing.tcl
   ```
   `report_timing.tcl`:
   ```tcl
   open_run impl_1 -name impl_1
   report_timing -delay_type max -max_paths 10 -file alu_setup.rpt
   report_timing -delay_type min -max_paths 10 -file alu_hold.rpt
   report_utilization -file alu_util.rpt
   ```

6. **Typical Numbers (post‑route)**
   * LUT Utilization: **45/53200** (<0.1 %)
   * FF Utilization: **8/26600**
   * Worst‑case **setup slack**: **+0.31 ns** (meets 250 MHz)
   * Worst‑case **hold slack**: **+0.07 ns**
   * Estimated **dynamic power**: **12 mW** at 250 MHz (Vcc=1.0 V, α≈0.2)

**Why these numbers matter**: The ALU uses only a handful of LUTs because the operations map directly to the DSP-friendly carry chain and the built‑in LUT‑based logic. The positive slack shows that the placer successfully balanced the adder’s carry‑propagation delay against the clock period.

---

### Example 2: ASIC‑Based 5‑Stage RISC‑V Core (Design Compiler + Innovus)
**Goal**: Synthesize a simple RV32I core (5‑stage pipeline) targeting a **45 nm CMOS** standard‑cell library (typical cell area ≈ 0.02 µm² per NAND2). Target frequency **500 MHz**, area **< 0.5 mm²**, power **< 80 mW**.

#### Step‑by‑Step
1. **RTL (rv32i_pipeline.v)** – includes IF, ID, EX, MEM, WB stages with hazard detection and forwarding.

2. **Library Setup**
   ```tcl
   # set up target library and link library
   set_target_library   [list ./45nm_lib.db]
   set_link_library     [list ./45nm_lib.db]
   set_operating_conditions -typical
   ```

3. **Define Clock**
   ```tcl
   create_clock -period 2.0 -name clk [get_ports clk]   # 2 ns = 500 MHz
   ```

4. **Input/Output Delays (pad model)**
   ```tcl
   set_input_delay  -max 0.1 -clock clk [get_ports *in*]
   set_output_delay -max 0.1 -clock clk [get_ports *out*]
   ```

5. **Synthesis**
   ```tcl
   read_verilog rv32i_pipeline.v
   synth_design -top rv32i_pipeline
   # enable aggressive retiming and gate sizing
   set_attribute [current_design] synth_retiming true
   set_attribute [current_design] synth_gate_sizing true
   compile -map_effort high -gate_effort high
   write_verilog -format decimal -hierarchy -output rv32i_synth.v
   ```

6. **Scan Insertion (DFT)**
   ```tcl
   insert_scan -scan_chains 4
   ```

7. **Place‑and‑Route (Innovus)**
   ```bash
   innovus -files innovus.tcl
   ```
   `innovus.tcl`:
   ```tcl
   read_verilog rv32i_synth.v
   read_sdf    rv32i_synth.sdf
   read_lef    ./45nm_lib.lef
   read_def    ./core.def   # empty floorplan
   set_die_area [list 0 0 1000 1000]   # 1 mm × 1 mm in microns
   create_floorplan -utilization 0.6
   place_opt -timing_driven
   cts_clock_tree -clock clk
   route_detail
   extract -spef
   ```

8. **Signoff STA**
   ```tcl
   read_sdf    ./route.sdf
   read_spef   ./route.spef
   report_timing -delay max -max_paths 10 -file setup.rpt
   report_timing -delay min -max_paths 10 -file hold.rpt
   report_power  -file power.rpt
   report_area   -file area.rpt
   ```

9. **Typical Results (post‑route)**
   * **Gate count**: ~28 k NAND2‑eq (≈ 0.56 mm²)
   * **Setup slack**: **+0.12 ns** (meets 500 MHz)
   * **Hold slack**: **+0.03 ns**
   * **Total power**: **72 mW** (dynamic 55 mW + leakage 17 mW at 1.0 V, 25 °C)
   * **Utilization**: 55 % (leaves routing headroom)

**Why these numbers matter**: The pipeline’s forward‑ing paths are carefully balanced; the placer kept the ALU and register file close to reduce wire delay. The static timing analyzer shows that the critical path resides in the **EX‑stage adder‑carry chain**, which was mitigated by **gate‑sizing** the carry‑propagation cells.

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Fails |
|---|---------|--------------|--------------|
| 1 | **Ignoring Clock‑Domain Crossing (CDC)** – passing a signal between two asynchronous clocks without a synchronizer. | The receiving flip‑flop may sample a metastable state. | MTBF of metastability drops exponentially with insufficient synchronizer stages; can cause rare lock‑ups or data corruption. |
| 2 | **Over‑constraining with Tight `set_max_delay` on False Paths** – applying a tight max‑delay to a path that is logically irrelevant (e.g., test‑mode logic). | The tool wastes effort trying to meet an impossible constraint, inflating area and power. | Optimization focuses on the wrong nets, starving timing‑critical paths of resources, leading to *negative slack* on the real datapath. |
| 3 | **Using Generic Gate Library Instead of Vendor‑Specific Cells** – e.g., mapping a design to a generic NAND2 library when targeting a 7 nm FinFET ASIC. | The library lacks cell variants (low‑Vt, high‑Vt, multi‑drive) needed for optimal sizing. | The synthesized netlist is either too slow (if only high‑Vt cells used) or leaks excessively (if low‑Vt used everywhere). |
| 4 | **Neglecting Routing Congestion Estimates** – placing high‑fan‑out blocks without checking congestion maps. | Detailed routing fails; design rule violations appear or rip‑up‑and‑retry loops explode runtime. | Congestion forces long detours, increasing wire RC and destroying timing margins; may also cause manufacturing yield loss. |
| 5 | **Assuming Zero Wire Delay in Early Synthesis** – relying on ideal wire models for timing budget. | Post‑route nets have significant RC, especially for global clocks or long buses. | The setup slack estimated pre‑route is overly optimistic; after P&R the design fails timing, requiring costly respins. |
| 6 | **Missing Power‑Domain Isolation** – connecting always‑on logic to a power‑gated island without isolation cells. | When the island is shut down, its outputs float, potentially driving active logic to undefined states. | Can cause latch‑up or excessive leakage, destroying the intended power‑saving scheme. |
| 7 | **Skipping Multi‑Cycle Path (MCP) Declaration** – treating a multi‑cycle data path as a single‑cycle path. | The analyzer flags a false setup violation, prompting unnecessary buffering or retiming. | Over‑design increases area and power; the design may still function, but resources are wasted. |
| 8 | **Using Incorrect Temperature/Voltage Corners for STA** – running STA only at typical corner. | Real silicon may be slower (hot, low Vdd) or leakier (cold, high Vdd). | The design may pass typical STA but fail in silicon, leading to field failures after tape‑out. |

---

## Exercises
### Easy – FPGA ALU Exploration
1. Write a **parameterized** ALU that supports 8‑bit addition, subtraction, left shift, and right shift (logical).  
2. Synthesize for a **Xilinx Kintex‑7** (xc7k325t) targeting **200 MHz**.  
3. Report LUT/FF utilization, worst‑case slack, and estimated power.  
4. **Deliverable**: Vivado project folder + a short README summarizing results.

### Medium – Pipelined FPGA Design
1. Take the ALU from Exercise 1 and insert a **pipeline register** after the operation select logic, creating a 2‑stage pipeline.  
2. Constrain the design to **350 MHz**.  
3. Perform **post‑place‑and‑route timing analysis**; if slack is negative, apply **gate‑sizing** or **register duplication** to close timing.  
4. Show before/after slack numbers and explain which optimization helped most.

### Hard – ASIC Mini‑Core
1. Implement a **4‑stage** RV32I core (IF, ID, EX/MEM, WB) with a simple 32‑bit ALU (add, sub, and, or, xor).  
2. Target the **TSMC 28 nm HPM** library (provided as `tsmc28nm.lib`).  
3. Constrain the core to **800 MHz** clock, **area < 0.3 mm²**, **power < 60 mW** (typical corner).  
4. Run **synthesis → scan insertion → placement → CTS → detailed routing → extraction → STA**.  
5. Provide:  
   * Netlist (gate‑level Verilog)  
   * DEF/GDSII streamout  
   * Timing reports (setup/hold)  
   * Power report  
   * A brief discussion of the most limiting path and how you mitigated it (e.g., buffer insertion, logic replication).  

*Hint*: Use Design Compiler’s `compile -map_effort medium -gate_effort medium` followed by `optimize_clock_gating` to reduce dynamic power.

---

## Linux Connection
### FPGA Subsystem in the Mainline Kernel
* **FPGA Manager Framework** – provides a generic API to program FPGAs over various interfaces (SPI, PCIe, PCI, etc.).  
  * Header: `<linux
