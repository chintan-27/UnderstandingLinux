---
id: 37
title: "Signal integrity"
supermoduleId: 3
estimatedMinutes: 45
resources:
  - type: book
    title: "The Art of Electronics (Horowitz and Hill)"
  - type: book
    title: "Microelectronic Circuits (Sedra and Smith)"
---

## Core Concepts
### Signal Integrity Fundamentals
Signal integrity (SI) quantifies how faithfully a voltage waveform preserves its shape, amplitude, and timing while propagating through an interconnect. In the frequency domain, SI is degraded when the transfer function of the interconnect deviates from an ideal flat response—i.e., when attenuation, phase distortion, or reflections cause the received spectrum to differ from the transmitted spectrum. In the time domain, this manifests as ringing, overshoot, undershoot, or increased jitter.

The root cause is **impedance mismatch**. A transmission line supports forward‑ and backward‑traveling voltage and current waves. When the line’s characteristic impedance \(Z_0\) does not equal the impedance seen at a discontinuity (source, load, or another line), part of the incident wave reflects. The reflection coefficient \(\Gamma\) determines the fraction reflected; the transmitted fraction is \(1+\Gamma\). Reflections interfere with subsequent bits, creating inter‑symbol interference (ISI) and narrowing the eye diagram.

### Transmission Line Parameters
For a uniform, lossless line the Telegrapher’s equations reduce to wave equations with propagation constant \(\gamma = j\beta\) where \(\beta = \omega\sqrt{LC}\). The per‑unit‑length inductance \(L\) and capacitance \(C\) are determined by geometry and dielectric:

- **Coaxial cable**:  
  \[
  L = \frac{\mu}{2\pi}\ln\frac{b}{a},\quad
  C = \frac{2\pi\epsilon}{\ln\frac{b}{a}}
  \]
  where \(a\) and \(b\) are inner and outer radii, \(\mu\approx\mu_0\), \(\epsilon=\epsilon_0\epsilon_r\).

- **Microstrip** (approximate, \(h\) substrate thickness, \(w\) trace width, \(t\) thickness):  
  Effective dielectric constant \(\epsilon_{\text{eff}} = \frac{\epsilon_r+1}{2} + \frac{\epsilon_r-1}{2}\left[1+\frac{12h}{w}\right]^{-1/2}\).  
  \[
  Z_0 \approx \frac{60}{\sqrt{\epsilon_{\text{eff}}}} \ln\!\left(\frac{8h}{w}+0.25\frac{w}{h}\right) \quad\text{(for } w/h\le1\text{)}
  \]
  \[
  Z_0 \approx \frac{120\pi}{\sqrt{\epsilon_{\text{eff}}}\left[w/h+1.393+0.667\ln(w/h+1.444)\right]} \quad\text{(for } w/h\ge1\text{)}
  \]

The **characteristic impedance** is \(Z_0=\sqrt{L/C}\). It is independent of line length; only the termination matters for reflections.

### Reflections and Terminations
When a wave reaches a load \(R_L\), the voltage reflection coefficient is  
\[
\Gamma = \frac{R_L-Z_0}{R_L+Z_0}.
\]
The reflected voltage adds to the incident wave on the line toward the source. If \(\Gamma\neq0\), a standing wave pattern forms, producing voltage peaks and troughs that depend on line length and frequency. Proper termination (matching \(R_L=Z_0\)) forces \(\Gamma=0\), eliminating reflections and ensuring that all incident power is absorbed.

### Crosstalk and EMI
**Crosstalk** arises from electromagnetic coupling between adjacent lines. Two mechanisms dominate:

1. **Inductive coupling**: changing current in the aggressor line creates a magnetic flux that links the victim line, inducing a voltage \(v = -M \frac{di}{dt}\) where \(M\) is mutual inductance.
2. **Capacitive coupling**: time‑varying voltage on the aggressor drives displacement current through the mutual capacitance \(C_m\), injecting current \(i = C_m \frac{dv}{dt}\) into the victim.

For weakly coupled, uniform lines over length \(\ell\), the **near‑end crosstalk (NEXT)** voltage ratio is approximately  
\[
\frac{V_{\text{NEXT}}}{V_{\text{source}}} \approx \frac{1}{2}\left(\frac{L_m}{L} - \frac{C_m}{C}\right)\frac{\ell}{\lambda},
\]
where \(\lambda = v_p/f\) is the wavelength on the line, \(L_m\) and \(C_m\) are per‑unit‑length mutual inductance and capacitance, and \(v_p=1/\sqrt{LC}\) is the propagation velocity. **Far‑end crosstalk (FEXT)** scales with \((\ell/\lambda)^2\) and is usually smaller for short lines.

**EMI** is external electromagnetic energy coupling into the line via the same mechanisms; shielding reduces the external field that reaches the conductors. A perfect conductive shield creates a Faraday cavity: the tangential electric field must vanish at the shield, forcing field lines to terminate on the shield rather than penetrate.

### Grounding and Shielding
A low‑impedance ground plane provides a return path that minimizes loop area, thereby reducing inductive coupling and the effective inductance of the signal path. Shielding (braid, foil, or metal enclosure) attenuates external fields by a factor approximated by **shielding effectiveness**  
\[
SE (dB) = 20\log_{10}\!\left(\frac{\mu_r t}{\delta}\right) + 20\log_{10}\!\left(\frac{1}{\tanh(t/\delta)}\right),
\]
where \(t\) is shield thickness, \(\delta=\sqrt{2/(\omega\mu\sigma)}\) is skin depth, \(\mu_r\) relative permeability, and \(\sigma\) conductivity. At high frequencies the absorption term dominates, giving roughly \(SE\approx 8.68\,t/\delta\) dB.

---

## How It Works
### Step‑by‑Step SI Analysis Flow
1. **Extract per‑unit‑length parameters (L, C, R, G)** from geometry and material data.  
   - For PCB microstrip, use a 2‑D field solver or the formulas above; include frequency‑dependent resistance via skin effect: \(R(f)=\frac{1}{w\delta\sigma}\) (for \(t\gg\delta\)).  
   - Conductance \(G\) captures dielectric loss: \(G = \omega C \tan\delta\).

2. **Compute characteristic impedance and propagation constant**:  
   \[
   Z_0 = \sqrt{\frac{R+j\omega L}{G+j\omega C}},\qquad
   \gamma = \sqrt{(R+j\omega L)(G+j\omega C)} = \alpha + j\beta.
   \]
   \(\alpha\) (Np/m) quantifies attenuation; \(\beta\) (rad/m) determines phase delay.

3. **Determine source and load impedances** (\(Z_S\), \(Z_L\)). Compute reflection coefficients at each end:  
   \[
   \Gamma_S = \frac{Z_S-Z_0}{Z_S+Z_0},\quad
   \Gamma_L = \frac{Z_L-Z_0}{Z_L+Z_0}.
   \]

4. **Calculate net reflected voltage after multiple bounces** (if needed) using the lattice diagram or the infinite‑series sum:  
   \[
   V_{\text{reflected}}(t) = V^{+}\sum_{n=1}^{\infty}\Gamma_S^{\,n}\Gamma_L^{\,n-1}e^{-2n\gamma\ell}.
   \]

5. **Assess crosstalk** using coupled‑line equations. For two identical lines with mutual inductance \(L_m\) and capacitance \(C_m\):  
   \[
   \begin{bmatrix}
   V_1\\ V_2
   \end{bmatrix}
   =
   \begin{bmatrix}
   Z_{0e} & Z_{0o}\\
   Z_{0o} & Z_{0e}
   \end{bmatrix}
   \begin{bmatrix}
   I_1\\ I_2
   \end{bmatrix},
   \]
   where even‑mode impedance \(Z_{0e}=\sqrt{(L+L_m)/(C-C_m)}\) and odd‑mode impedance \(Z_{0o}=\sqrt{(L-L_m)/(C+C_m)}\).  
   Excite line 1 with a step; compute the induced voltage on line 2 at near/far ends via mode conversion.

6. **Estimate eye‑diagram closure** from total jitter:  
   \[
   T_{\text{jitter}} = \sqrt{T_{\text{random}}^2 + T_{\text{deterministic}}^2},
   \]
   where deterministic jitter includes ISI from reflections and crosstalk, duty‑cycle distortion, and bounded uncorrelated jitter (BUJ). Compare \(T_{\text{jitter}}\) to the unit interval (UI) to predict bit‑error rate (BER) via  
   \[
   \text{BER} \approx \frac{1}{2}\operatorname{erfc}\!\left(\frac{V_{\text{eye}}/2}{\sigma_n\sqrt{2}}\right),
   \]
   with \(\sigma_n\) the RMS noise voltage.

### Why Each Step Matters
- **Extracting L, C** tells you how geometry influences wave speed and impedance—no amount of termination can fix a line whose intrinsic \(Z_0\) is wrong for the driver/receiver.
- **Complex \(Z_0\)** (including R, G) reveals frequency‑dependent loss; ignoring it overestimates eye opening at high data rates.
- **Reflection coefficients** directly link mismatches to measurable voltage overshoot/undershoot on an oscilloscope.
- **Mode analysis** explains why crosstalk can be both positive and negative (depending on whether even or odd mode dominates) and why routing orthogonal layers reduces coupling.
- **Eye‑diagram jitter budget** ties physical-layer impairments to the digital system’s BER requirement, giving a concrete design target.

---

## Worked Examples
### Example 1: Characteristic Impedance of a 50 Ω Coaxial Cable
**Given**: inner conductor diameter \(d=1\text{ mm}\) → radius \(a=0.5\text{ mm}\); outer conductor inner diameter \(D=5\text{ mm}\) → radius \(b=2.5\text{ mm}\); dielectric \(\epsilon_r=2.3\); assume non‑magnetic (\(\mu_r=1\)).

**Derivation**:  
\[
L = \frac{\mu_0}{2\pi}\ln\frac{b}{a}
   = \frac{4\pi\times10^{-7}}{2\pi}\ln\frac{2.5}{0.5}
   = 2\times10^{-7}\ln(5)
   \approx 2\times10^{-7}\times1.609 = 3.22\times10^{-7}\,\text{H/m}.
\]
\[
C = \frac{2\pi\epsilon_0\epsilon_r}{\ln\frac{b}{a}}
   = \frac{2\pi(8.854\times10^{-12})(2.3)}{\ln(5)}
   \approx \frac{1.283\times10^{-10}}{1.609}
   = 7.97\times10^{-11}\,\text{F/m}.
\]
\[
Z_0 = \sqrt{\frac{L}{C}}
    = \sqrt{\frac{3.22\times10^{-7}}{7.97\times10^{-11}}}
    = \sqrt{4040}
    \approx 63.6\,\Omega.
\]

The approximate formula \(Z_0\approx\frac{138}{\sqrt{\epsilon_r}}\log_{10}\frac{D}{d}\) yields  
\[
\frac{138}{\sqrt{2.3}}\log_{10}\frac{5}{1}
 = \frac{138}{1.516}\times0.699
 \approx 63.6\,\Omega,
\]
matching the exact calculation.  
**Interpretation**: To achieve 50 Ω you must adjust the ratio \(b/a\) or \(\epsilon_r\); e.g., increasing \(\epsilon_r\) to ≈3.2 lowers \(Z_0\) to 50 Ω.

### Example 2: Reflection Coefficient with Mismatched Load
**Given**: \(Z_0=50\,\Omega\), load \(R_L=75\,\Omega\).

\[
\Gamma = \frac{R_L-Z_0}{R_L+Z_0}
       = \frac{75-50}{75+50}
       = \frac{25}{125}
       = 0.2.
\]
The reflected voltage amplitude is \(0.2\times V_{\text{inc}}\). If the incident step is 1 V, the reflected step is 0.2 V, adding to the incident wave on the line toward the source. After one round‑trip (time \(2\ell/v_p\)) the source sees an additional 0.2 V of opposite polarity, producing a small ringing. The power reflected is \(|\Gamma|^2=0.04\) → 4 % of incident power is wasted.

### Example 3: Near‑End Crosstalk Between Two Microstrip Lines
**Given**:  
- Line width \(w=0.2\text{ mm}\), spacing \(s=0.2\text{ mm}\) (edge‑to‑edge), substrate height \(h=0.2\text{ mm}\), \(\epsilon_r=4.0\).  
- Length \(\ell=50\text{ mm}\).  
- Data rate 1 Gbps → fundamental frequency \(f\approx 500\text{ MHz}\) (first harmonic).  
- Assume copper (\(\sigma=5.8\times10^{7}\,\text{S/m}\)), thickness \(t=35\mu\text{m}\).

**Step 1: Effective dielectric constant** (using Wheeler’s formula for microstrip):  
\[
\epsilon_{\text{eff}} \approx \frac{\epsilon_r+1}{2} + \frac{\epsilon_r-1}{2}\left[1+\frac{12h}{w}\right]^{-1/2}
 = \frac{5}{2} + \frac{3}{2}\left[1+\frac{12\times0.2}{0.2}\right]^{-1/2}
 = 2.5 + 1.5\left[1+12\right]^{-1/2}
 = 2.5 + 1.5\left[13\right]^{-1/2}
 \approx 2.5 + 1.5\times0.277 = 2.915.
\]

**Step 2: Uncoupled line impedance** (using \(w/h=1\) formula):  
\[
Z_0 \approx \frac{60}{\sqrt{\epsilon_{\text{eff}}}}\ln\!\left(\frac{8h}{w}+0.25\frac{w}{h}\right)
 = \frac{60}{\sqrt{2.915}}\ln\!\left(\frac{8\times0.2}{0.2}+0.25\right)
 = \frac{60}{1.707}\ln(8+0.25)
 = 35.16\times\ln(8.25)
 \approx 35.16\times2.11 = 74.2\,\Omega.
\]

**Step 3: Extract mutual L and C** (approximate quasi‑static formulas for edge‑coupled microstrip):  
\[
\frac{L_m}{L} \approx \frac{1}{\pi}\left[\frac{K(k')}{K(k)}\right],\qquad
\frac{C_m}{C} \approx \frac{1}{\pi}\left[\frac{K(k)}{K(k')}\right],
\]
where \(k = \frac{w}{w+2s}\) and \(K\) is the complete elliptic integral of the first kind.  
With \(w=0.2\), \(s=0.2\): \(k = 0.2/(0.2+0.4)=0.2/0.6=0.333\).  
\(K(0.333)\approx1.685\), \(K'(k)=K(\sqrt{1-k^2})\approx K(0.943)\approx2.257\).  
Thus  
\[
\frac{L_m}{L}\approx\frac{1}{\pi}\frac{2.257}{1.685}=0.427,\qquad
\frac{C_m}{C}\approx\frac{1}{\pi}\frac{1.685}{2.257}=0.237.
\]

**Step 4: NEXT voltage ratio**  
Propagation velocity \(v_p = c/\sqrt{\epsilon_{\text{eff}}}=3\times10^{8}/\sqrt{2.915}=1.76\times10^{8}\,\text{m/s}\).  
Wavelength \(\lambda = v_p/f = 1.76\times10^{8}/5\times10^{8}=0.352\text{ m}=352\text{ mm}\).  
\[
\frac{V_{\text{NEXT}}}{V_{\text{source}}}
 \approx \frac{1}{2}\left(\frac{L_m}{L}-\frac{C_m}{C}\right)\frac{\ell}{\lambda}
 = \frac{1}{2}(0.427-0.237)\frac{50}{352}
 = 0.5\times0.190\times0.142
 \approx 0.0135.
\]
So a 1 V step on the aggressor induces ≈13.5 mV of NEXT at the far end of the victim line—enough to cause logic‑threshold violations if the victim’s noise margin is < 50 mV.

---

## Common Mistakes
| Mistake | Why It’s Wrong | Consequence |
|---------|----------------|-------------|
| **Assuming lumped‑element model at > 1/10 λ** | At frequencies where line length exceeds ~10 % of wavelength, phase variation along the line becomes significant; voltage and current are no longer uniform. | Underestimates ringing, mis‑predicts reflection timing, leads to ineffective termination. |
| **Neglecting skin‑effect resistance** | AC resistance grows as \(\sqrt{f}\) because current crowds to the surface; at 5 GHz, copper’s effective resistance can be 5–10× DC. | Overestimates signal amplitude, underestimates attenuation, causing optimistic eye diagrams. |
| **Using a single‑ended termination for a differential pair** | Differential signals rely on matched odd‑mode impedance; terminating each side to ground breaks symmetry and creates common‑mode noise. | Increases EMI, exacerbates crosstalk, reduces noise immunity. |
| **Assuming a perfect ground plane** | Real planes have finite thickness, via inductance, and split planes; return‑path discontinuities increase loop area. | Increases inductive coupling, raises ground bounce, degrades SI especially for high‑speed clocks. |
| **Ignoring dielectric loss tangent** | Lossy dielectric contributes conductance \(G = \omega C \tan\delta\); at > 10 GHz, \(\tan\delta\) can dominate attenuation. | Underestimates frequency‑dependent roll‑off, leading to insufficient equalization in SerDes. |
| **Believing shielding eliminates all external fields** | Shield effectiveness drops when shield thickness < skin depth or when apertures exist (seams, connectors). | Unexpected EMI ingress; shielding must be designed with seams < λ/10 and proper grounding. |

---

## Exercises
### Easy
1. **Microstrip impedance** – A PCB microstrip has \(w=0.3\text{ mm}\), \(h=0.18\text{ mm}\), \(\epsilon_r=4.2\). Compute \(Z_0\) using the \(w/h>1\) formula.  
2. **Reflection coefficient** – A 100 Ω differential pair is terminated with two 60 Ω resistors to ground (single‑ended). What is the effective differential reflection coefficient?  

### Medium
3. **Skin effect** – For a copper trace of width 0.2 mm and thickness 35 µm, calculate the AC resistance per meter at 2.5 GHz. Compare to the DC resistance.  
4. **Crosstalk budgeting** – Two parallel striplines (spacing 0.15 mm, dielectric \(\epsilon_r=3.5\)) run 30 mm length. Estimate the far‑end crosstalk voltage for a 0.5 V step with rise time 200 ps (use the approximate FEXT formula \(\propto (\ell/\lambda)^2\)).  

### Hard
5. **Eye‑diagram closure** – A 10 Gbps NRZ link has a transmitter launch amplitude of 800 mV differential, a channel loss of –12 dB at 5 GHz, and a reflection coefficient magnitude of 0.15 at the receiver. Assuming Gaussian jitter with σ=5 ps and deterministic jitter from ISI of 15 ps, compute the resulting eye height and width, and estimate the BER using the erfc approximation.  
6. **Shielding design** – A shielded twisted‑pair cable must achieve > 60 dB shielding effectiveness at 3 GHz using copper braid (conductivity \(5.8\times10^{7}\) S/m, relative permeability 1). Determine the minimum braid thickness required, assuming the absorption term dominates.  

---

## Linux Connection
Linux provides direct visibility into the physical layer of network interfaces, allowing you to observe and tune many SI‑related parameters.

### Ethernet (wired) – ethtool & sysfs
```bash
# Show link speed, duplex, and auto‑negotiation status
ethtool eth0

# Display detailed PHY registers (requires root)
ethtool -d eth0   # dump registers

# Read statistics that reveal SI problems
ethtool -S eth0   # e.g., tx_errors, rx_errors, rx_crc_errors, tx_aborted

# View the raw MDIO bus via sysfs (if the driver exports it)
cat /sys/class/net/eth0/device/mdio_bus/mdio0/0x1e/regs
# The above path varies; look for files under /sys/class/net/<dev>/device/mdio_bus/

# Adjust link parameters that affect SI
# Disable auto‑negotiation and force 1000base‑T full duplex (uses fixed equalization)
ethtool -s eth0 autoneg off speed 1000 duplex full

# Enable/disable hardware features that influence signal quality
ethtool -k eth0 show   # list offload features (rx/tx checksum, scatter‑gather, etc.)
ethtool -K eth0 tso off gso off   # turning off segmentation can reduce jitter in some NICs
```
**Why this matters:** `rx_crc_errors` increment when the receiver cannot decode the frame due to excessive noise, jitter, or ISI—direct symptoms of SI degradation. Adjusting `autoneg off` forces the PHY to use a known equalizer setting, useful for lab‑controlled experiments.

### Wireless (Wi‑Fi) – iw & debugfs
```bash
# Show link quality, signal level, and noise (dBm)
iw dev wlan0 link

# Get per‑rate statistics (retries, failed transmissions)
iw dev wlan0 station get <AP‑MAC>

# Access driver debugfs for PHY registers (if available)
cat /sys/kernel/debug/ieee80211/phy0/netdev:wlan0/statistics/tx_retries
cat /sys/kernel/debug/ieee80211/phy0/netdev:wlan0/statistics/rx_beacon_signal_avg

# Example: Force a specific channel width to study its effect on multipath
sudo iw dev wlan0 set channel 36 HT40+   # 5 GHz, 40 MHz channel
```
Higher retry rates or fluctuating RSSI often correlate with multipath interference and poor SI in the RF front‑end.

### PCIe (on‑board high‑speed links) – lspci & sysfs
```bash
# Show negotiated link speed and width
lspci -vv -s 03:00.0 | grep -i "LnkCap\|LnkSta"

# Read correctable/uncorrectable error counts (AER)
cat /usr/src/linux-headers-$(uname -r)/include/linux/pci.h   # for reference
grep -A2 -B2 "aer" /var/log/kern.log   # or use 'journalctl -k | grep aer'

# Enable PCIe ASPM (Active State Power Management) to test impact on SI
echo performance > /sys/module/pcie_aspm/parameters/policy
```
PCIe link training includes TX equalization and RX CTLE; error counters increase when the eye closes due to impedance discontinuities or crosstalk.

### Custom Kernel Modules – Accessing PHY via MDIO
```c
/* Simple module to
