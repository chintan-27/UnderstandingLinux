---
id: 46
title: "Hardware description languages"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Core Concepts  
### Hardware Description Languages (HDLs) as Precise Behavioral Specifications  
An HDL is not a general‑purpose programming language; it is a **formal notation** that maps directly onto **gate‑level netlists** and **timing‑aware hardware**. Every construct has a well‑defined semantics in terms of **signal drivers**, **update semantics**, and **delta‑cycle scheduling**. This precision enables two distinct flows:  

* **Simulation** – an event‑driven scheduler evaluates assignments in zero‑time delta cycles until a fixed point is reached, then advances simulated time.  
* **Synthesis** – a set of rewrite rules transforms the abstract syntax tree (AST) into a technology‑mapped netlist obeying **area**, **power**, and **timing** constraints.  

The two dominant HDLs differ in philosophy:  

| Feature | Verilog‑2001/SystemVerilog | VHDL‑2008 |
|---------|---------------------------|----------|
| Type system | weakly typed, implicit `logic`/`wire`/`reg` | strongly typed, explicit subtypes |
| Concurrency model | `always`/`initial` blocks with sensitivity lists | `process` with explicit sensitivity |
| Package system | `packages` (SystemVerilog) | `packages` + `libraries` |
| Assertions | `assert property` (SVA) | `assert` + `cover` statements |

Understanding these differences matters when mixing languages in a **co‑simulation** environment (e.g., Verilog testbench driving a VHDL DUT).

### Modules, Entities, and Hierarchy  
A **module** (Verilog) or **entity/architecture** (VHDL) declares a **interface** (ports) and a **body** that defines concurrent statements. Hierarchy is created by **instantiation**:

```verilog
// top.v
module top (
    input  wire clk,
    input  wire rst_n,
    output wire [7:0] led
);
    // instance of a 8‑bit counter
    counter_8bit u0 (
        .clk   (clk),
        .rst_n (rst_n),
        .q     (led)
    );
endmodule
```

The synthesizer treats each instance as a separate **design unit**, preserving hierarchy for **design‑for‑test** (scan chains) and **partial reconfiguration** on FPGAs.

### Combinational vs. Sequential Logic – Formal Definitions  
*Combinational logic* is a **pure function** \( f : \{0,1\}^k \rightarrow \{0,1\}^m \) with **no internal state**. Its output at time \(t\) depends only on the current input vector:  

\[
y(t) = f\bigl(a(t),b(t),\dots\bigr)
\]

*Sequential logic* implements a **finite‑state machine** (FSM) defined by a tuple \((S, s_0, \delta, \lambda)\) where  

* \(S\) – finite set of states, \(|S| = 2^n\) for an \(n\)-bit state register,  
* \(s_0 \in S\) – reset state,  
* \(\delta : S \times \{0,1\}^k \rightarrow S\) – next‑state function,  
* \(\lambda : S \times \{0,1\}^k \rightarrow \{0,1\}^m\) – output function (Mealy) or \(\lambda : S \rightarrow \{0,1\}^m\) (Moore).  

The clocked update is:  

\[
s[t+1] = \delta\bigl(s[t], x[t]\bigr) \\
y[t]   = \lambda\bigl(s[t], x[t]\bigr)
\]

Thus sequential logic inevitably contains **storage elements** (flip‑flops or latches) that enforce a **propagation delay** bounded by the clock period.

### Simulation and Synthesis – From First Principles  
**Simulation** proceeds in **delta cycles**:  

1. All active processes evaluate their RHS using current signal values.  
2. Assignments are scheduled (nonblocking `<=` for FFs, blocking `=` for comb).  
3. After all RHS evaluations, LHS updates are applied; if any signal changed, another delta cycle begins.  
4. When no signal changes, time advances to the next scheduled event (e.g., next posedge).  

This guarantees **deterministic** behavior matching the hardware semantics (assuming no race conditions).

**Synthesis** can be viewed as a series of **source‑to‑source transformations**:  

* **Unrolling** of loops → explicit bit‑width operations.  
* **FSM encoding** → state register + next‑state logic.  
* **Resource sharing** → multiplexers and adders mapped to LUTs/DSPs.  
* **Technology mapping** → Boolean expressions decomposed into target cell library (e.g., 6‑input LUT + carry chain for Xilinx 7‑series).  

Each step preserves functional equivalence while optimizing a cost function (area, delay, power).  

---

## How It Works  
### HDL Syntax – Signals, Types, and Concurrency  
#### Nets vs. Variables  
* `wire` (net) – continuously driven, models physical connections.  
* `reg` (variable) – holds value only within a procedural block; synthesizes to a flip‑flop if assigned inside an `always @(posedge clk)` block, otherwise to a latch.  

#### Blocking vs. Nonblocking Assignments  
Within an `always` block:  

* `=` (blocking) – immediate update; subsequent statements in the same block see the new value.  
* `<=` (nonblocking) – RHS evaluated with old values; LHS updated after the block ends.  

**Why it matters:** Nonblocking assignments model **parallel register updates**, preventing race conditions in sequential logic. Using blocking assignments inside a clocked block inadvertently creates latches or incorrect timing.

#### Sensitivity Lists and `@(*)`  
In Verilog‑2001, `@(*)` (or `always_comb` in SystemVerilog) tells the simulator to trigger the block on any change of any signal read inside the block, guaranteeing correct combinational behavior. Omitting a signal leads to **latch inference** (the simulator holds the previous value when the omitted signal changes).

### Simulation Workflow – Command‑Line Details  
```bash
# 1. Compile Verilog sources into a VVP object
iverilog -g2005-sv -Wall -o example.vvp top.v counter_8bit.v

# 2. Run the simulation, dumping a VCD for waveform viewing
vvp example.vvp +vcd=wave.vcd

# 3. Examine waveforms (GTKWave)
gtkwave wave.vcd &
```

*`-g2005-sv`* selects SystemVerilog‑2005; `-Wall` enables all warnings (critical for catching latch inference).  
The VCD file contains time‑stamped signal changes; the period between successive rising edges of `clk` can be measured directly to verify timing constraints.

### Synthesis Workflow – From RTL to Netlist  
```bash
# 1. Read RTL, elaborate hierarchy, and produce an abstract netlist
yosys -p "read_verilog -sv top.v counter_8bit.v; \
          hierarchy -check -top top; \
          proc; fsm; opt; techmap; \
          stat" -o example.json

# 2. Map to a target FPGA architecture (e.g., Xilinx 7‑series)
yosys -p "read_json example.json; \
          synth_xilinx -top top -edif example.edif"

# 3. Place & route with vendor tools (vivado in batch mode)
vivado -mode batch -source run_impl.tcl
```

*Key passes:*  
- `proc` converts `always` blocks to RTL netlist (flip‑flops + combinational logic).  
- `fsm` detects and encodes state registers (one‑hot, binary, or gray).  
- `techmap` breaks down complex operators into LUT‑compatible primitives.  

The resulting EDIF netlist can be fed to the vendor placer/router, which attempts to meet a **user‑specified clock period** \(T_{clk}\). If the worst‑case path delay \(t_{pd}^{max} > T_{clk} - t_{setup}\), synthesis will fail with a timing violation report.

### Timing Analysis – Setup/Hold and Clock Period  
For a flip‑flop with data‑to‑clock propagation \(t_{pd}\), setup time \(t_{su}\), and hold time \(t_{h}\):  

\[
\begin{aligned}
\text{Setup constraint:}&\quad T_{clk} \ge t_{pd}^{max} + t_{su}^{max} \\
\text{Hold constraint:}&\quad t_{pd}^{min} \ge t_{h}^{min}
\end{aligned}
\]

If the design uses a **clock enable** \(ce\), the effective clock period for the data path becomes \(T_{clk}/ce\) only when \(ce=1\); timing tools model this via **clock gating** cells that add a small delay \(t_{gate}\).  

---

## Worked Examples  
### Example 1: 4‑Bit Binary Counter with Synchronous Reset  
**Goal:** Produce a 4‑bit count that increments each rising edge of `clk` when `rst_n` is low; output `q[3:0]`.  

**Step‑by‑step reasoning:**  

1. Determine required flip‑flop width: \(n = \lceil\log_2(2^4)\rceil = 4\).  
2. Next‑state function: \(q_{next} = q + 1\) (mod \(2^4\)).  
3. Reset overrides next state: \(q_{next} = 0\) when `rst_n == 0`.  
4. Output assignment: `assign y = q;` (optional, can expose `q` directly).  

**Verilog‑SystemVerilog implementation:**  

```verilog
module counter_4bit (
    input  wire        clk,
    input  wire        rst_n,   // active low reset
    output logic [3:0] q
);
    // synchronous reset, nonblocking update
    always_ff @(posedge clk) begin
        if (!rst_n)
            q <= 4'b0;
        else
            q <= q + 1'b1;
    end
endmodule
```

*Why `always_ff`?* It signals to the synthesizer that the block describes sequential logic, preventing latch inference.  

*Timing check:* Assume a Xilinx Artix‑7 LUT+FF with \(t_{pd}^{max}=0.45\text{ ns}\), \(t_{su}=0.12\text{ ns}\). For a 100 MHz clock (\(T_{clk}=10\text{ ns}\)):  

\[
T_{clk} - (t_{pd}^{max}+t_{su}) = 10 - (0.45+0.12) = 9.43\text{ ns} \gg 0
\]

Thus timing is comfortably met.

### Example 2: One‑Hot FSM – Traffic Light Controller  
**States:** `{RED, YELLOW, GREEN}` encoded as one‑hot (`state[2:0]`).  
**Inputs:** `timer_exp` (pulse when a programmable timer expires).  
**Outputs:** `red_light`, `yellow_light`, `green_light`.  

**State transition table:**  

| Current State | `timer_exp` | Next State |
|---------------|-------------|------------|
| RED (001)     | 0           | RED        |
| RED (001)     | 1           | GREEN      |
| GREEN (100)   | 0           | GREEN      |
| GREEN (100)   | 1           | YELLOW     |
| YELLOW (010)  | 0           | YELLOW     |
| YELLOW (010)  | 1           | RED        |

**Moore output:** each state directly drives the lights.  

**SystemVerilog implementation:**  

```verilog
module traffic_light_fsm (
    input  wire        clk,
    input  wire        rst_n,
    input  wire        timer_exp,
    output logic       red_light,
    output logic       yellow_light,
    output logic       green_light
);
    typedef enum logic [2:0] {
        S_RED   = 3'b001,
        S_GREEN = 3'b100,
        S_YELLOW= 3'b010
    } state_e;

    state_e state, state_next;

    // state register (sequential)
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            state <= S_RED;
        else
            state <= state_next;
    end

    // next-state logic (combinational)
    always_comb begin
        unique case (state)
            S_RED:   state_next = timer_exp ? S_GREEN : S_RED;
            S_GREEN: state_next = timer_exp ? S_YELLOW : S_GREEN;
            S_YELLOW:state_next = timer_exp ? S_RED : S_YELLOW;
        endcase
    end

    // output logic (Moore)
    always_comb begin
        red_light   = (state == S_RED);
        green_light = (state == S_GREEN);
        yellow_light= (state == S_YELLOW);
    end
endmodule
```

*Why `unique case`?* It guarantees mutual exclusivity, helping the synthesizer avoid priority encoder inference and producing a clean one‑hot decoder.  

*Resource estimate:* One‑hot encoding uses 3 flip‑flops; the next‑state logic is a 3‑input multiplexer per bit → ~6 LUTs on a 6‑LUT FPGA.

### Example 3: Pipelined Multiply‑Accumulate (MAC)  
**Goal:** Compute \(y = \sum_{i=0}^{N-1} a_i \cdot b_i\) with a throughput of one MAC per clock.  

**Pipeline stages:**  

1. **Stage 1:** Register inputs `a_reg`, `b_reg`.  
2. **Stage 2:** Compute partial product `pp = a_reg * b_reg` (DSP slice).  
3. **Stage 3:** Accumulate `acc_reg <= acc_reg + pp`.  

**Verilog:**  

```verilog
module mac_pipe #(
    parameter WIDTH = 18   // matches DSP48E1 width
) (
    input  wire               clk,
    input  wire               rst_n,
    input  wire signed [WIDTH-1:0] a,
    input  wire signed [WIDTH-1:0] b,
    output logic signed [2*WIDTH-1:0] acc
);
    // pipeline registers
    logic signed [WIDTH-1:0] a1, b1;
    logic signed [2*WIDTH-1:0] pp;

    // stage 1
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            a1 <= '0;
            b1 <= '0;
        end else begin
            a1 <= a;
            b1 <= b;
        end
    end

    // stage 2 – DSP multiplication (inferred)
    assign pp = $signed(a1) * $signed(b1);

    // stage 3 – accumulation
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            acc <= '0;
        else
            acc <= acc + pp;
    end
endmodule
```

*Why pipeline?* The combinational delay of an 18×18‑bit multiply is ~1.2 ns in a 7‑series DSP; without pipelining the max clock would be ≈800 MHz, unrealistic for routing. Adding registers splits the critical path, allowing a 300 MHz target with ample slack.

*Throughput analysis:* With latency = 3 cycles, after the pipeline fills, one result per clock → **1 MAC/clk**. For \(N=1024\), total cycles = 3 + (N‑1) = 1026 → **≈3.42 µs** at 300 MHz.

---

## Common Mistakes  
| # | Mistake | What’s Wrong | Why It Causes Errors |
|---|---------|--------------|----------------------|
| 1 | **Missing reset in an `always_ff` block** | Flip‑flop inferred without reset → power‑up state undefined. | On FPGA/ASIC, uninitialized registers may toggle randomly, causing functional simulation‑silicon mismatch. Synthesis may still infer a reset‑less FF, but formal verification will flag unknown states. |
| 2 | **Using blocking (`=`) inside a clocked `always` block for sequential logic** | Updates propagate immediately within the same delta cycle, mimicking a latch. | Leads to **race conditions**: the order of statements affects the final value, which is not synthesizable to flip‑flops; simulation may pass but netlist fails timing or produces glitches. |
| 3 | **Omitting a signal from the sensitivity list (or forgetting `@(*)`)** | Block only evaluates when listed signals change; omitted signal changes are ignored. | Causes **latch inference** because the simulator holds the previous value when the omitted signal toggles, leading to extra memory elements and unexpected behavior in hardware. |
| 4 | **Mixing signed and unsigned arithmetic without explicit casting** | Verilog treats unsized literals as unsigned; signedness propagation can be surprising. | Results in **incorrect magnitude** (e.g., `-1 * 2` yields a large positive number due to two’s‑complement wrap), causing functional bugs that are hard to spot in simulation if test vectors don’t exercise sign bits. |
| 5 | **Assuming combinational loops are synthesizable** | Writing `assign y = ~y;` or feedback via `always_comb`. | Creates **oscillators** or unstable logic; synthesis tools either reject the design or generate a latch with undefined behavior, violating timing analysis and causing excess power. |
| 6 | **Neglecting clock‑enable gating when using a multi‑cycle path** | Treating a multi‑cycle path as a single‑cycle path. | Timing analysis will report a **setup violation** because the data path delay exceeds the clock period; the fix is to introduce a false path constraint or pipeline register. |
| 7 | **Using `reg` for purely combinational signals** | Declaring a combinational signal as `reg` and driving it outside a procedural block. | Synthesizer may infer a latch; simulation works but hardware yields unintended memory. The fix is to use `wire` for nets driven continuously. |

---

## Exercises  

### Easy  
1. **Combinational AND‑OR** – Write a Verilog module `maj3` that outputs the majority of three 1‑bit inputs (`y = (a&b) | (a&c) | (b&c)`). Show the truth table and derive the Boolean expression using Karnaugh map.  
2. **Reset‑Synchronizer** – Create a two‑flip‑flop synchronizer for an asynchronous reset signal. Explain why two stages reduce metastability probability.  

### Moderate  
3. **Parameterizable Shift Register** – Design a shift register with parameter `WIDTH` and input `shift_left`. When `shift_left=1`, shift left; otherwise shift right. Provide synthesis report snippet showing LUT/FF utilization for `WIDTH=8` and `WIDTH=32`.  
4. **FSM with Edge Detector** – Implement a Moore FSM that detects a rising edge on input `sig` and asserts a one‑clock pulse `tick`. Use one‑hot state encoding and show the state transition diagram.  

### Hard  
5. **Pipelined FIR Filter** – Given coefficients `c[0..3] = {1,2,2,1}`, design a 4‑tap FIR filter with a pipeline register after each multiply‑add. Derive the maximum achievable clock frequency assuming a DSP slice multiply latency of 1.2 ns and an adder latency of 0.45 ns.  
6. **Clock‑Domain Crossing (CDC) FIFO** – Build a synchronous FIFO with dual‑clock write (`wclk`) and read (`rclk`) ports using Gray‑code pointers. Explain why Gray coding prevents metastability and calculate the FIFO depth needed to tolerate a worst‑case write‑read rate mismatch of 10 % over 1 ms.  

---

## Linux Connection  
Linux treats programmable logic as **first‑class devices** via the **FPGA subsystem** (since kernel 4.4). Key components:

| Subsystem | Purpose | Typical Path |
|-----------|---------|--------------|
| `fpga-manager` | Loads bitstreams into FPGA fabric (partial or full reconfiguration) | `/sys/class/fpga-manager/` |
| `fpga-region` | Represents a reusable FPGA region that can host multiple accelerators | `/sys/fpga/region0/` |
| `fpga-bridge` | Exposes AXI‑Lite / AXI‑Stream master/slave interfaces to the CPU | `/sys/class/fpga-bridge/bridge0/` |
| `uio` (Userspace I/O) | Allows mmap‑based access to FPGA registers without writing a kernel driver | `/dev/uio0` |
| `devmem` / `mmap` | Direct access to physical addresses (requires root or `CAP_SYS_RAWIO`) | `/dev/mem` (use with caution) |

### Example: Loading a Bitstream via `fpga-manager`  
```bash
# 1. Identify the manager (usually one per FPGA)
ls /sys/class/fpga-manager/
# → fpga0

# 2. Load a bitstream (e.g., built with Vivado)
cat /lib/firmware/my_design.bit > /sys/class/fpga-manager/fpga0/data

# 3. Trigger configuration (write 1 to the control attribute)
echo 1 > /sys/class/fpga-manager/fpga0/loading
# Wait for status to become "done"
cat /sys/class/fpga-manager/fpga0/state
# → done
```

### Example: Accessing Control Registers with `uio`  
Assume the FPGA exposes a simple 32‑bit control register at offset `0x0` within an AXI‑Lite region.

```c
/* uio_example.c */
#include <fcntl.h>
#include <unistd.h>
#include <sys/mman.h>
#include <stdio.h>
#include <stdint.h>

int main(void) {
    int fd = open("/dev/uio0", O_RDWR);
    if (fd < 0) { perror("open uio"); return 1; }

    /* Get the size of the UIO region (from sysfs) */
    size_t len;
    FILE *f = fopen("/sys/class/uio/uio0/maps/map0/size", "r");
    fscanf(f, "%zu", &len);
    fclose(f);

    void *addr = mmap(NULL, len, PROT_READ|WRITE, MAP_SHARED, fd, 0);
    if (addr == MAP_FAILED) { perror("mmap"); return 1; }

    volatile uint32_t *ctrl = addr;   // offset 0
    *ctrl = 0xA5A5A5A5;               // write test pattern
    printf("Readback: 0x%08x\n", *ctrl);

    munmap(addr, len);
    close(fd);
    return 0;
}
```
Compile and run:  

```bash
gcc -Wall -O2 uio_example.c -o uio_example
sudo ./uio_example   # needs access to /dev/uio0
```

### Example: Reading FPGA Temperature via SysFS  
Many Xilinx FPGAs expose a thermal sensor:

```bash
cat /sys/class/hwmon/hwmon0/temp1_input   # value in millidegrees Celsius
```

### Why These Interfaces Matter  
* **FPGA‑manager** enables **runtime reconfiguration**, letting Linux swap accelerators without reboot (useful for cloud workloads).  
* **UIO** provides a low‑overhead, deterministic path for high‑speed control loops (e.g., motor control, SDR).  
* **Sysfs** offers discovery and monitoring (bitstream version, temperature, error counters) essential for system health and debugging.  

---

## Why This Matters  
Understanding HDLs is not an academic exercise; it is the bridge between **software‑driven Linux systems** and the **hardware that actually executes them**.  

* By mastering the **formal semantics** of HDL constructs (blocking vs nonblocking, sensitivity lists, clocked resets), you avoid subtle bugs that only appear after synthesis—bugs that can silently corrupt data in a production server or cause a safety‑critical controller to
