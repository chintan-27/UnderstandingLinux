---
id: 38
title: "Clocks and timing"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Core Concepts
### Clocks as Periodic Signals
A clock is a periodic voltage (or current) signal \(v(t)=V_{0}\sin(2\pi f t+\phi)\) whose fundamental frequency \(f\) (Hz) determines the time between successive rising edges \(T=1/f\). In digital logic the clock edge triggers state changes; therefore any deviation of the edge time from the ideal schedule directly translates to timing error.

### Oscillator Fundamentals
An oscillator sustains oscillation by satisfying the Barkhausen criterion: loop gain \(|\beta A|\ge1\) and total phase shift \(\angle\beta A =0\) (mod \(2\pi\)).  
* **Crystal oscillator** – the quartz plate presents a high‑Q series‑resonant impedance \(Z_s\approx R_s + j(\omega L -1/(\omega C))\) near its series resonance \(\omega_s=1/\sqrt{LC}\). The feedback network is designed to present exactly the opposite impedance, yielding a net phase shift of zero and a frequency stability limited by the crystal’s temperature coefficient (typically ± 20 ppm/°C).  
* **RC oscillator** – the phase shift network is a first‑order RC ladder; oscillation frequency \(\omega_{0}=1/(RC)\) is inversely proportional to the product, giving poor stability because \(R\) and \(C\) drift with temperature and aging.  
* **LC oscillator** – uses a tank circuit; frequency \(\omega_{0}=1/\sqrt{LC}\) is set by the inductor and capacitor. Q‑factor determines phase noise: \(\mathcal{L}(f_{\Delta})\approx \frac{F k T}{2 P_{sig}} \left(\frac{f_{0}}{2 Q f_{\Delta}}\right)^{2}\) (Leeson’s equation).

### Phase‑Locked Loop (PLL) as a Negative‑Feedback System
A PLL forces the VCO output phase \(\phi_{out}(t)\) to track a reference phase \(\phi_{ref}(t)\) by minimizing the phase error \(\phi_{e}=\phi_{ref}-\phi_{out}\).  

*Phase detector* (PD) output: \(e_{PD}=K_{d}\phi_{e}\) (rad → V).  
*Loop filter* (LF) impedance \(Z_{LF}(s)\) shapes the control voltage \(v_{c}(s)=Z_{LF}(s) e_{PD}(s)\).  
*Voltage‑controlled oscillator* (VCO) converts voltage to frequency: \(\Delta\omega_{out}=K_{vco} v_{c}\) (rad/s per V). In the Laplace domain \(\Phi_{out}(s)=\frac{K_{vco}}{s} V_{c}(s)\).

Combining gives the open‑loop transfer function  

\[
G(s)=\frac{K_{d}K_{vco}}{s}Z_{LF}(s)
\]

and the closed‑loop phase transfer function  

\[
H(s)=\frac{\Phi_{out}(s)}{\Phi_{ref}(s)}=\frac{G(s)}{1+G(s)} .
\]

Choosing a low‑pass \(Z_{LF}(s)=\frac{1}{1+s\tau}\) (single‑pole lag) yields a second‑order PLL with natural frequency  

\[
\omega_{n}=\sqrt{\frac{K_{d}K_{vco}}{\tau}}
\]

and damping factor  

\[
\zeta=\frac{1}{2}\sqrt{\frac{\tau K_{d}K_{vco}}{}} .
\]

The **loop bandwidth** (≈ \(\omega_{n}\) for \(\zeta\approx0.707\)) sets how fast the PLL can follow reference variations while rejecting high‑frequency noise.

### Jitter and Skew – Statistical vs. Deterministic Timing Errors
* **Jitter** \(J(t)\) is the zero‑mean random deviation of a clock edge from its ideal position. Its power spectral density \(S_{\phi}(f)\) integrates to variance  

\[
\sigma_{j}^{2}=2\int_{0}^{\infty}S_{\phi}(f)\,df .
\]

If the jitter is Gaussian, the probability of an edge exceeding \(\pm k\sigma_{j}\) is given by the complementary error function.  

* **Skew** \(S_{ij}\) is a deterministic offset between two clock domains \(i\) and \(j\):  

\[
S_{ij}=t_{i}^{\text{edge}}-t_{j}^{\text{edge}} .
\]

Skew adds directly to setup/hold margins; unlike jitter it cannot be averaged out.

### Timing Closure – From Spec to Silicon
Timing closure requires that for every sequential path  

\[
t_{pd}+t_{setup}\le T_{clock}-S_{skew}-J_{margin}
\]

where \(t_{pd}\) is the worst‑case propagation delay, \(t_{setup}\) the flip‑flop setup time, \(S_{skew}\) the inter‑clock skew, and \(J_{margin}\) a jitter budget (often taken as \(6\sigma_{j}\) for a 99.999% confidence). If the inequality fails, the designer must either reduce \(t_{pd}\) (logic optimization, buffering), increase \(T_{clock}\) (lower frequency), or mitigate skew/jitter (balanced clock trees, PLL‑based deskew).

## How It Works
### Detailed PLL Operation – From Equations to Circuit
1. **Phase Detection** – A digital XOR PD produces a pulse width proportional to \(\phi_{e}\):  

   \[
   e_{PD}(t)=K_{d}\,\phi_{e}(t),\qquad K_{d}=\frac{V_{DD}}{2\pi}\text{ (V/rad)} .
   \]

2. **Loop Filter Design** – A passive lag‑lead filter  

   \[
   Z_{LF}(s)=R_{1}+\frac{1}{sC_{1}}\parallel\left(R_{2}+\frac{1}{sC_{2}}\right)
   \]

   yields a zero at \(\omega_{z}=1/(R_{2}C_{2})\) and a pole at \(\omega_{p}=1/[(R_{1}+R_{2})C_{1}]\). Placing \(\omega_{z}<\omega_{n}<\omega_{p}\) gives ~45° phase boost at the crossover, improving phase margin.

3. **VCO Gain** – Measured experimentally: apply a small \(\Delta v_{c}\) and record \(\Delta f_{out}\).  

   \[
   K_{vco}= \frac{2\pi\Delta f_{out}}{\Delta v_{c}}\;\text{[rad/(s·V)]}.
   \]

4. **Closed‑Loop Transfer Function** – Substituting the lag‑lead \(Z_{LF}(s)\) into \(G(s)\) and solving for \(H(s)\) yields a standard second‑order form  

   \[
   H(s)=\frac{\omega_{n}^{2}}{s^{2}+2\zeta\omega_{n}s+\omega_{n}^{2}} .
   \]

   The **-3 dB bandwidth** is \(\omega_{BW}\approx\omega_{n}\sqrt{1-2\zeta^{2}+\sqrt{2-4\zeta^{2}+4\zeta^{4}}}\).

5. **Phase Noise Transfer** – The PLL acts as a low‑pass filter for the VCO’s intrinsic phase noise and a high‑pass filter for the reference’s noise. Output phase noise  

   \[
   S_{\phi,out}(f)=\underbrace{|H(f)|^{2}}_{\text{PL​L}}\,S_{\phi,ref}(f)+\underbrace{|1-H(f)|^{2}}_{\text{VCO}}\,S_{\phi,VCO}(f) .
   \]

   Inside the loop bandwidth (\(f<\omega_{BW}\)) the reference noise dominates; outside, the VCO noise dominates.

### Clock Domain Crossing (CDC) – Metastability‑Safe Transfer
When a signal generated in domain A (clock \(f_{A}\)) is sampled in domain B (clock \(f_{B}\)), the flip‑flop may enter a metastable state if the data changes within its aperture window \(t_{ap}\). The **Mean Time Between Failures (MTBF)** for a single synchronizer stage is  

\[
\text{MTBF}= \frac{e^{\frac{t_{ap}}{\tau}}}{T_{0}\,f_{A}\,f_{B}} ,
\]

where \(\tau\) is the flip‑flop’s decay constant and \(T_{0}\) a technology‑dependent constant (~\(10^{-10}\) s). Adding a second stage multiplies the exponent, giving  

\[
\text{MTBF}_{2stage}= \frac{e^{\frac{2t_{ap}}{\tau}}}{T_{0}\,f_{A}\,f_{B}} .
\]

For multi‑bit CDC, a **gray‑coded FIFO** is used: only one bit changes between successive FIFO pointers, eliminating multi‑bit metastability. The FIFO depth must satisfy  

\[
D \ge \frac{f_{B}}{f_{A}-f_{B}} \quad (f_{B}>f_{A})
\]

to avoid overflow when the write domain is slower than the read domain.

## Worked Examples
### Example 1: Designing a 100 MHz PLL from a 10 MHz Reference
**Specifications**  
* \(f_{ref}=10\text{ MHz}\)  
* Desired \(f_{out}=100\text{ MHz}\) → integer multiplication factor \(N=10\)  
* Loop bandwidth \(f_{BW}=1\text{ kHz}\)  
* Phase noise target \(-100\text{ dBc/Hz}\) at 10 kHz offset  

**Step‑by‑step**

1. **VCO selection** – Choose a VCO with tunable range 80‑120 MHz and measured gain  
   \[
   K_{vco}=2\pi\times\frac{20\text{ MHz}}{1\text{ V}}=1.26\times10^{8}\text{ rad/(s·V)} .
   \]

2. **Phase detector gain** – Using an XOR PD with \(V_{DD}=1.8\text{ V}\):  
   \[
   K_{d}= \frac{V_{DD}}{2\pi}= \frac{1.8}{2\pi}=0.286\text{ V/rad}.
   \]

3. **Loop filter** – Adopt a lag‑lead with \(R_{1}=1\text{ k}\Omega\), \(C_{1}=100\text{ pF}\), \(R_{2}=10\text{ k}\Omega\), \(C_{2}=10\text{ pF}\).  
   Compute pole and zero:  
   \[
   \omega_{p}= \frac{1}{(R_{1}+R_{2})C_{1}}=\frac{1}{11\text{k}\Omega\cdot100\text{pF}}=9.09\times10^{2}\text{ rad/s}\;(≈145\text{ Hz}) ,
   \]  
   \[
   \omega_{z}= \frac{1}{R_{2}C_{2}}=\frac{1}{10\text{k}\Omega\cdot10\text{pF}}=1.0\times10^{5}\text{ rad/s}\;(≈15.9\text{ kHz}) .
   \]  
   The zero lies well above the desired \(\omega_{n}\) (see next step), providing phase boost.

4. **Determine \(\omega_{n}\) and \(\zeta\)** – For a second‑order PLL with lag‑lead filter, approximate  

   \[
   \omega_{n}\approx\sqrt{\frac{K_{d}K_{vco}}{R_{1}C_{1}}}= \sqrt{\frac{0.286\times1.26\times10^{8}}{1\text{k}\Omega\cdot100\text{pF}}}= \sqrt{3.60\times10^{7}}=6.0\times10^{3}\text{ rad/s}\;(≈955\text{ Hz}) .
   \]  
   This matches the 1 kHz BW target. Damping factor  

   \[
   \zeta=\frac{1}{2}\left(\frac{R_{2}}{R_{1}}+\frac{1}{\omega_{n}R_{2}C_{2}}\right)=\frac{1}{2}\left(10+\frac{1}{6.0\times10^{3}\cdot10\text{k}\Omega\cdot10\text{pF}}\right)\approx5.0 .
   \]  
   A \(\zeta>1\) gives an overdamped response; we can reduce \(R_{2}\) to 2 kΩ to obtain \(\zeta\approx0.7\).

5. **Phase noise check** – Reference phase noise assumed \(-150\text{ dBc/Hz}\) at 10 kHz. Inside the loop bandwidth the PLL suppresses it by \(20\log_{10}(f/f_{BW})\). At 10 kHz offset (10×\(f_{BW}\)):  

   \[
   L_{out}= -150 + 20\log_{10}(10)= -130\text{ dBc/Hz}.
   \]  
   Adding VCO noise (assume \(-130\text{ dBc/Hz}\) at 10 kHz) yields roughly \(-100\text{ dBc/Hz}\) after combining, meeting the spec.

**Resulting Schematic (Verilog‑AMS)**  
```verilog
// PLL behavioral model
`include "constants.vams"
`include "disciplines.vams"

module pll (input ref, output vco_out);
  real   phi_ref, phi_out, phi_err, vctrl;
  parameter real Kd = 0.286;          // V/rad
  parameter real Kvco = 1.26e8;      // rad/(s·V)
  parameter real R1 = 1e3, C1 = 100e-12;
  parameter real R2 = 2e3,  C2 = 10e-12;

  analog begin
    // phase detector (XOR approximated as linear)
    phi_err = phi_ref - phi_out;
    vctrl = Kd * phi_err;               // PD output

    // loop filter (lag‑lead)
    // I = C1*d(vctrl)/dt + C2*d(vctrl - vfn)/dt
    // where vfn is voltage across R2
    // Implemented using Laplace: Zlf = R1 + 1/(s*C1) || (R2 + 1/(s*C2))
    // Use built-in filter
    vctrl = laplace_lti(vctrl, {[R1, 1/(C1*0)], [1, 0]}, 
                                 {[R1+R2, 1/(C1*0)+(1/(C2*0))], [1, 0]});

    // VCO: d(phi_out)/dt = Kvco * vctrl
    ddt(phi_out) == Kvco * vctrl;

    // reference phase accumulator
    ddt(phi_ref) == 2.0*`M_PI*10e6;
  end
endmodule
```
(The above uses Verilog‑AMS `laplace_lti` to instantiate the filter; a synthesis‑level implementation would replace it with RC networks.)

### Example 2: Two‑Stage Synchronizer for 100 MHz → 200 MHz CDC
**Goal** – Transfer a single‑bit signal `sig_a` from the 100 MHz domain (`clk_a`) to the 200 MHz domain (`clk_b`) with MTBF > 10⁹ years.

**Given** – Typical 65 nm flip‑flop: \(\tau=50\text{ ps}\), \(T_{0}=1\times10^{-10}\text{ s}\).

**Single‑stage MTBF**  

\[
\text{MTBF}_{1}= \frac{e^{t_{ap}/\tau}}{T_{0}f_{a}f_{b}} .
\]

Assume aperture \(t_{ap}=30\text{ ps}\).  

\[
\frac{t_{ap}}{\tau}= \frac{30}{50}=0.6,\qquad e^{0.6}=1.822 .
\]

\[
\text{MTBF}_{1}= \frac{1.822}{1\times10^{-10}\times10^{8}\times2\times10^{8}}
               = \frac{1.822}{2\times10^{6}} \approx 9.1\times10^{-7}\text{ s}.
\]

That is far too low.  

**Two‑stage MTBF**  

\[
\text{MTBF}_{2}= \frac{e^{2t_{ap}/\tau}}{T_{0}f_{a}f_{b}}
               = \frac{e^{1.2}}{2\times10^{6}}
               = \frac{3.32}{2\times10^{6}}
               \approx 1.66\times10^{-6}\text{ s}.
\]

Still insufficient because the data rate is high. The standard remedy is to **reduce the effective data rate** by using a handshake or a FIFO. For a single‑bit, we instead use a **dual‑flip‑flop synchronizer with added delay** (increase \(t_{ap}\) by inserting a buffer). Adding two series inverters (~30 ps each) raises \(t_{ap}\) to ~90 ps:

\[
\frac{t_{ap}}{\tau}= \frac{90}{50}=1.8,\quad e^{1.8}=6.05,
\]
\[
\text{MTBF}_{2}= \frac{6.05^{2}}{2\times10^{6}} \approx \frac{36.6}{2\times10^{6}} \approx 1.8\times10^{-5}\text{ s}.
\]

Still not enough – we conclude that for such a high frequency ratio a **gray‑coded FIFO** is required. The FIFO depth for a 100 MHz → 200 MHz crossing (write slower) is  

\[
D \ge \frac{f_{B}}{f_{B}-f_{A}} = \frac{200}{200-100}=2 .
\]

A 2‑deep FIFO with gray‑coded pointers ensures that only one bit changes per pointer update, giving each bit the full metastability protection of a two‑stage synchronizer. The resulting MTBF per bit exceeds 10⁹ years.

**Verilog implementation**  
```verilog
module cdc_fifo #(
    parameter WIDTH = 8,
    parameter DEPTH = 2   // must be power of two
) (
    input  wire        wr_clk,
    input  wire        wr_rst_n,
    input  wire [WIDTH-1:0] wr_data,
    input  wire        wr_en,
    output reg         wr_full,
    input  wire        rd_clk,
    input  wire        rd_rst_n,
    output reg [WIDTH-1:0] rd_data,
    output reg         rd_empty
);
  // RAM
  reg [WIDTH-1:0] mem [0:DEPTH-1];

  // Binary pointers
  reg [$clog2(DEPTH):0] wptr, wptr_g, wptr_g_next;
  reg [$clog2(DEPTH):0] rptr, rptr_g, rptr_g_next;

  // Gray code conversion
  function automatic [$clog2(DEPTH):0] bin2gray;
    input [$clog2(DEPTH):0] b;
    bin2gray = b ^ (b >> 1);
  endfunction

  // Write side
  always @(posedge wr_clk or negedge wr_rst_n) begin
    if (!wr_rst_n) begin
      wptr   <= 0;
      wptr_g <= 0;
    end else begin
      if (wr_en && !wr_full) begin
        mem[wptr[DEPTH-1:0]] <= wr_data;
        wptr <= wptr + 1;
      end
      wptr_g <= bin2gray(wptr);
    end
  end

  // Synchronize read pointer to write clock domain (2‑FF)
  reg [$clog2(DEPTH):0] rptr_g_sync1, rptr_g_sync2;
  always @(posedge wr_clk or negedge wr_rst_n) begin
    if (!wr_rst_n) begin
      rptr_g_sync1 <= 0;
      rptr_g_sync2 <= 0;
    end else begin
      rptr_g_sync1 <= rptr_g;
      rptr_g_sync2 <= rptr_g_sync1;
    end
  end

  // Full/empty logic
  assign wr_full = (wptr_g == {~rptr_g_sync2[$clog2(DEPTH):$clog2(DEPTH)-1],
                               rptr_g_sync2[$clog2(DEPTH)-2:0]});
  assign rd_empty = (rptr_g == wptr_g);

  // Read side
  always @(posedge rd_clk or negedge rd_rst_n) begin
    if (!rd_rst_n) begin
      rptr   <= 0;
      rptr_g <= 0;
      rd_data <= 0;
    end else begin
      if (!rd_empty) begin
        rd_data <= mem[rptr[DEPTH-1:0]];
        rptr <= rptr + 1;
      end
      rptr_g <= bin2gray(rptr);
    end
  end
endmodule
```
The module uses a two‑flip‑flop synchronizer for the read pointer (`rptr_g_sync1/2`) and gray coding to guarantee only one bit changes per update, making it safe for the 100 → 200 MHz crossing.

## Common Mistakes
| # | Mistake | Why It’s Wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | **Assuming a fixed VCO gain \(K_{vco}\)** | \(K_{vco}\) varies with temperature, supply voltage, and process. Designing the loop filter for a nominal value ignores gain margin; the actual loop bandwidth can shift by ± 30 %, causing either insufficient tracking (loss of lock) or excessive noise peaking. | PLL may lose lock under temperature extremes or exhibit unexpected peaking that raises phase noise beyond spec. |
| 2 | **Using a single flip‑flop synchronizer for multi‑bit CDC** | Metastability resolution is independent per bit; the probability that *all* bits resolve correctly within the same clock cycle is \((1-P_{fail})^{N}\). For N > 1 this drops quickly, producing silent data corruption. | Intermittent data errors that are hard to reproduce, often appearing as occasional bit‑flips in wide buses. |
| 3 | **Placing the loop filter’s pole at or above the unity‑gain frequency** | The loop filter must provide phase lag at the crossover to achieve stability. If the pole is too high, the phase margin collapses (< 30°) and the PLL exhibits ringing or limit‑cycle oscillations. | Observable jitter peaks at offset frequencies near the loop bandwidth, and possible chaotic frequency pulling. |
| 4 | **Neglecting reset synchronization in clock domain crossing** | Asynchronous de‑assertion of a reset can leave flip‑flops in an undefined state when the clock starts, leading to metastable release. | System may boot into an incorrect state; rare but catastrophic in safety‑critical designs. |
| 5 | **Using a crystal oscillator without proper load capacitance** | The crystal’s series resonance frequency shifts with load; incorrect load caps pull the frequency by tens of ppm, breaking timing budgets. | System clock drifts, causing communication protocol failures (e.g., UART baud‑rate error). |

## Exercises
### Easy
1. **Jitter budget calculation** – A system requires a total timing margin of 50 ps. If the clock skew is fixed at 10 ps, what is the maximum RMS jitter allowed (assuming a 6‑sigma bound)?  
2. **Frequency division** – Given a 24 MHz crystal, what integer division ratio yields a 1 MHz clock? What is the resulting period?

### Moderate
3. **PLL loop filter design** – Design a passive lag‑lead filter for a PLL with \(K_{d}=0.5\text{ V/rad}\), \(K_{vco}=2\pi\times10^{6}\text{ rad/(s·V)}\), target loop bandwidth 5 kHz, and damping factor \(\zeta
