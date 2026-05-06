---
id: 27
title: "Reliability physics"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Core Concepts  
Reliability physics quantifies the time‑dependent probability that a semiconductor device fails due to atomistic transport processes driven by electrical, thermal, or mechanical fields. Rather than treating failure as a black‑box random event, it derives failure rates from the underlying microscopic mechanisms:

* **Electromigration (EM)** – momentum transfer from conduction electrons to metal ions (electron wind) creates a net ionic flux \( \mathbf{J}_i = \frac{Z^*e\rho}{\Omega}\mathbf{J}\), where \(Z^*\) is the effective charge, \(e\) the electron charge, \(\rho\) the resistivity, \(\Omega\) the atomic volume, and \(\mathbf{J}\) the current density. Divergence of this flux leads to void formation (open) or hillock formation (short).  
* **Dielectric breakdown** – under high electric field, trap‑assisted tunneling and Poole‑Frenkel emission increase the concentration of generated carriers in the oxide, which can trigger a runaway avalanche. The intrinsic breakdown field \(E_{bd}\) scales with oxide thickness \(t_{ox}\) as \(E_{bd}\propto t_{ox}^{-1}\) for ultrathin oxides due to quantum‑mechanical tunneling.  
* **Thermal cycling fatigue** – repeated temperature swings cause differential expansion between layers (CTE mismatch). The resulting strain range \(\Delta\varepsilon = \Delta\alpha\,\Delta T\) drives dislocation motion and crack growth; the Coffin‑Manson relation links plastic strain range to cycles to failure \(N_f = C(\Delta\varepsilon)^{-m}\).  
* **Aging mechanisms** – bias temperature instability (BTI) shifts threshold voltage via hole trapping and interface‑state generation; hot‑carrier injection (HCI) creates interface defects that increase drift‑field scattering; time‑dependent dielectric breakdown (TDDB) accumulates trapped charge that enhances local field. Each follows a reaction‑rate law \(k = k_0\exp(-E_a/kT)\) with field‑enhanced terms (e.g., \(E = E_0 - \beta\sqrt{E}\) for BTI).  
* **Failure distributions** – the Weibull distribution arises from extreme‑value statistics of the weakest link in a large population of identical flaws. Its cumulative form  
\[
F(t)=1-\exp\!\Big[-\big(\tfrac{t}{\eta}\big)^{\beta}\Big]
\]  
has shape \(\beta\) (controls early‑life vs. wear‑out slope) and scale \(\eta\) (characteristic life). A bathtub curve is modeled by mixing infant‑mortality (exponential), random (constant), and wear‑out (Weibull) components.

---

## How It Works  
The overall failure rate \(\lambda(t)\) of a device is the sum of contributions from each mechanism, each accelerated by stress variables:

\[
\lambda(t)=\lambda_{\text{EM}}(J,T)+\lambda_{\text{TDDB}}(E_{\text{ox}},T)+\lambda_{\text{TC}}(\Delta T)+\lambda_{\text{aging}}(V_G,T)
\]

### Electromigration acceleration  
From the ionic flux expression, the mean time to failure (MTTF) follows Black’s equation:

\[
\text{MTTF}=A J^{-n}\exp\!\Big(\frac{E_a}{kT}\Big)
\]

*Derivation*: The vacancy flux \(J_v = D_v C_v \frac{Z^*e\rho J}{\Omega kT}\) (Nernst‑Einstein). Failure occurs when a critical vacancy concentration \(C_{crit}\) accumulates at a node; integrating \(dC_v/dt = -\nabla\!\cdot\!J_v\) gives \(t_f \propto (J_v)^{-1}\). Substituting the diffusivity \(D_v=D_0\exp(-E_a/kT)\) yields the above form, with \(n\approx2\) for bamboo lines and \(n\approx1\) for lined grains.

### Dielectric breakdown (TDDB) acceleration  
For thin oxides, the E‑model predicts  

\[
\tau = \tau_0 \exp\!\Big(-\beta E_{\text{ox}}\Big)
\]

where \(\beta\) is the field acceleration factor (≈ 40 cm/MV for SiO₂). The Weibull CDF for time‑dependent breakdown is  

\[
F(t)=1-\exp\!\Big[-\big(\tfrac{t}{\tau}\big)^{\beta_w}\Big]
\]

with Weibull slope \(\beta_w\) capturing defect distribution.

### Thermal‑cycling acceleration  
Plastic strain range per cycle: \(\Delta\varepsilon_p = \Delta\alpha\,\Delta T\). Coffin‑Manson gives  

\[
N_f = \Big(\frac{C}{\Delta\varepsilon_p}\Big)^{m}
\]

Typical values for Si/SiO₂: \(C\approx0.5\), \(m\approx2.5\).

### Combined use  
When multiple stresses act, acceleration factors multiply:  

\[
\text{AF}_{\text{total}} = \text{AF}_{\text{EM}}\times\text{AF}_{\text{TDDB}}\times\text{AF}_{\text{TC}}
\]

Thus a device operating at 1.2× nominal voltage and 10 °C above ambient sees a predictable reduction in lifetime that can be budgeted in design margins.

---

## Worked Examples  

### Example 1: Electromigration MTTF of an Al interconnect  
*Given*:  
- Line width \(w=0.5\,\mu\text{m}\), thickness \(h=0.5\,\mu\text{m}\) → cross‑section \(A_{cs}=wh=0.25\,\mu\text{m}^2 = 2.5\times10^{-11}\,\text{m}^2\)  
- Current \(I=5\,\text{mA}\) → current density \(J = I/A_{cs}=2\times10^{8}\,\text{A/m}^2 = 2\times10^{6}\,\text{A/cm}^2\)  
- Temperature \(T=400\,\text{K}\)  
- Material constants for Al: \(E_a=0.9\,\text{eV}\), \(n=2\), \(A=1.0\times10^{-4}\,\text{h·(A/cm}^2)^2\)  

**Step‑by‑step**  
1. Compute exponential term: \(\displaystyle \exp\!\Big(\frac{E_a}{kT}\Big)=\exp\!\Big(\frac{0.9}{8.617\times10^{-5}\times400}\Big)=\exp(26.1)\approx2.0\times10^{11}\).  
2. Compute current term: \(J^{-n}=(2\times10^{6})^{-2}=2.5\times10^{-13}\).  
3. Multiply: \(\text{MTTF}=A\cdot J^{-n}\cdot\exp(E_a/kT)=1.0\times10^{-4}\times2.5\times10^{-13}\times2.0\times10^{11}\,\text{h}\).  
4. \(\text{MTTF}=5.0\times10^{-6}\,\text{h}=0.018\,\text{s}\).  

*Interpretation*: At this extreme current density the Al line would fail in milliseconds; reducing \(J\) by a factor of 10 raises MTTF to ~1.8 s, illustrating the strong \(J^{-2}\) dependence.

### Example 2: TDDB probability for a 5 nm gate oxide  
*Given*:  
- Oxide thickness \(t_{ox}=5\,\text{nm}\) → oxide field \(E_{ox}=V_G/t_{ox}\).  
- Voltage \(V_G=1.0\,\text{V}\) → \(E_{ox}=2.0\times10^{8}\,\text{V/m}=20\,\text{MV/cm}\).  
- E‑model parameters: \(\tau_0=1\,\text{s}\), \(\beta=40\,\text{cm/MV}\).  
- Weibull slope \(\beta_w=1.2\).  
- Mission time \(t=10\,\text{years}=3.15\times10^{8}\,\text{s}\).  

**Step‑by‑step**  
1. Compute time constant: \(\displaystyle \tau=\tau_0\exp(-\beta E_{ox})=1\,\text{s}\times\exp[-40\times20]=\exp(-800)\,\text{s}\approx1.0\times10^{-348}\,\text{s}\) (practically zero → breakdown is certain).  
2. To avoid underflow, work in log‑domain: \(\ln(t/\tau)=\ln t + \beta E_{ox}= \ln(3.15\times10^{8})+800\approx19.6+800=819.6\).  
3. Weibull argument: \(\big(t/\tau\big)^{\beta_w}= \exp\big[\beta_w\ln(t/\tau)\big]=\exp[1.2\times819.6]=\exp[983.5]\approx10^{427}\).  
4. CDF: \(F(t)=1-\exp[-10^{427}]\approx1\).  

Thus at 1 V across a 5 nm oxide the TDDB failure probability is essentially unity for a 10‑year mission. Reducing the voltage to 0.5 V halves the field, giving \(\tau\approx\exp(-400)\) s and a failure probability of ~\(10^{-180}\) – still negligible, showing the extreme field sensitivity.

### Example 3: Thermal‑cycling fatigue of a Si die attached to Cu substrate  
*Given*:  
- CTE Si: \(\alpha_{Si}=2.6\times10^{-6}\,\text{K}^{-1}\)  
- CTE Cu: \(\alpha_{Cu}=16.5\times10^{-6}\,\text{K}^{-1}\)  
- Effective mismatch \(\Delta\alpha = |\alpha_{Cu}-\alpha_{Si}| = 1.39\times10^{-5}\,\text{K}^{-1}\)  
- Temperature swing \(\Delta T = 150\,\text{K}\) (from –50 °C to +100 °C)  
- Coffin‑Manson constants for Si: \(C=0.5\), \(m=2.5\)  

**Step‑by‑step**  
1. Strain range: \(\displaystyle \Delta\varepsilon_p = \Delta\alpha\,\Delta T = 1.39\times10^{-5}\times150 = 2.09\times10^{-3}\).  
2. Cycles to failure: \(\displaystyle N_f = \Big(\frac{C}{\Delta\varepsilon_p}\Big)^{m}= \Big(\frac{0.5}{2.09\times10^{-3}}\Big)^{2.5}= (239.2)^{2.5}\).  
3. \(\log_{10}N_f = 2.5\log_{10}(239.2)=2.5\times2.38=5.95\) → \(N_f\approx 8.9\times10^{5}\) cycles.  

*Interpretation*: Approximately 0.9 million temperature cycles cause a 50 % probability of fatigue crack initiation; this matches typical power‑cycling test profiles for automotive electronics.

---

## Common Mistakes  

| # | Mistake | Why it’s wrong (first‑principles) |
|---|---------|-----------------------------------|
| 1 | **Using Black’s equation without temperature acceleration** – assuming MTTF depends only on current density. | The exponential term \(\exp(E_a/kT)\) originates from thermally activated vacancy diffusion. Ignoring it overestimates lifetime at low T and underestimates it at high T; the activation energy for Al (~0.9 eV) changes MTTF by > 10⁴× between 300 K and 400 K. |
| 2 | **Assuming uniform current density in a partitioned line** – treating a width‑varied interconnect as if J is constant. | Current crowds at constrictions; the local J can be 2–5× the average, and because MTTF ∝ J⁻ⁿ, a 3× local increase reduces MTTF by 3ⁿ (≈ 9 for n=2). Design rules therefore use *effective* current density based on the narrowest segment. |
| 3 | **Modeling early‑life failures with an exponential distribution** – assuming a constant failure rate from t=0. | Early‑life (infant mortality) follows a decreasing hazard rate due to defect annihilation; the exponential’s constant λ cannot capture this. A mixed Weibull (β<1) or log‑normal is required to fit the observed bathtub curve. |
| 4 | **Neglecting stress migration vs. electromigration** – attributing all void growth to electron wind. | Stress migration arises from gradients in hydrostatic stress (e.g., due to thermal expansion mismatch) and drives atomic flux opposite to electron wind. In bamboo lines with low J, stress migration can dominate, leading to hillocks rather than voids. Ignoring it mispredicts failure morphology. |
| 5 | **Using a single activation energy for TDDB across all oxides** – applying SiO₂‑derived Ea to high‑k dielectrics. | High‑k materials have different trap densities and band gaps; their field‑induced trap generation follows a different Poole‑Frenkel coefficient, giving an effective Ea that can be 0.1–0.3 eV lower. Using the wrong Ea yields orders‑of‑magnitude errors in predicted TDDB lifetime. |

---

## Exercises  

### Easy  
1. **Electromigration scaling** – A Cu line has \(J=0.8\times10^{6}\,\text{A/cm}^2\) at \(T=350\,\text{K}\). With \(E_a=0.7\,\text{eV}\), \(n=1\), \(A=5\times10^{-5}\,\text{h·(A/cm}^2)\), compute its MTTF in hours.  

### Medium  
2. **TDDB voltage margin** – A 6 nm HfO₂ gate dielectric has \(\tau_0=10^{-3}\,\text{s}\), \(\beta=30\,\text{cm/MV}\), Weibull slope \(\beta_w=1.5\). Determine the gate voltage that yields a 0.1 % probability of failure after 5 years (assume \(t_{ox}=6\) nm).  

### Hard  
3. **Combined acceleration** – A power MOSFET operates at \(V_{DS}=30\) V, \(T_j=125\) °C, and sees a temperature swing of \(\Delta T=80\) K during switching.  
   - Use Black’s equation (Al interconnect, \(E_a=0.9\) eV, \(n=2\), \(A=1\times10^{-4}\) h·(A/cm²)²) with \(J=1.2\times10^{6}\) A/cm² to get \(\text{AF}_{\text{EM}}\).  
   - Use the E‑model (SiO₂, \(\tau_0=1\) s, \(\beta=40\) cm/MV, \(t_{ox}=2\) nm) to get \(\text{AF}_{\text{TDDB}}\) for the off‑state voltage \(V_{DS}=30\) V.  
   - Use Coffin‑Manson (Si/SiO₂, \(C=0.5\), \(m=2.5\), \(\Delta\alpha=1.0\times10^{-5}\) K⁻¹) to get \(\text{AF}_{\text{TC}}\).  
   - Compute the total acceleration factor and the effective lifetime if the nominal (nominal‑stress) MTTF is 10⁵ h.  

---

## Linux Connection  
Linux provides first‑class interfaces for exposing reliability‑related hardware data to userspace. The most relevant subsystems are:

### 1. EDAC (Error Detection and Correction) – memory controller  
*Sysfs path*: `/sys/devices/system/edac/mc/mc0/`  
- `ce_count` – correctable error count  
- `ue_count` – uncorrectable error count  
- `sdram_scrub_rate` – scrubbing interval (seconds)  

**Runnable commands**  
```bash
# Show total correctable ECC errors since boot
cat /sys/devices/system/edac/mc/mc0/ce_count

# Show uncorrectable errors (often fatal)
cat /sys/devices/system/edac/mc/mc0/ue_count

# Enable/disable scrubbing (requires root)
echo 1 > /sys/devices/system/edac/mc/mc0/sdram_scrub_rate   # scrub every second
echo 0 > /sys/devices/system/edac/mc/mc0/sdram_scrub_rate   # disable
```

### 2. Thermal monitoring (hwmon)  
*Typical path*: `/sys/class/thermal/thermal_zone0/`  
- `temp` – temperature in millidegrees Celsius  
- `mode` – “enabled”/“disabled”  
- `trip_point_0_temp` – threshold for passive cooling  

**Runnable commands**  
```bash
# Read CPU core temperature (°C)
cat /sys/class/thermal/thermal_zone0/temp | awk '{printf "%.2f°C\n", $1/1000}'

# List all cooling devices linked to this zone
ls -l /sys/class/thermal/thermal_zone0/cdev*
```

### 3. S.M.A.R.T. for storage (smartctl)  
*Tool*: `smartctl` from the `smartmontools` package.  

**Runnable commands**  
```bash
# Display full SMART data for a SATA disk
sudo smartctl -a /dev/sda

# Show only health self‑assessment log
sudo smartctl -H /dev/sda

# For NVMe drives, use nvme-cli
sudo nvme smart-log /dev/nvme0
```

### 4. Machine‑Check Exception (MCE) logging  
*Daemon*: `mcelog` (x86) or `rasdaemon` (generic RAS).  

**Runnable commands**  
```bash
# Show recent machine‑check errors (requires root)
sudo mcelog --raw

# With rasdaemon (provides structured JSON)
sudo rasdaemon --show --format=json
```

### 5. Kernel RAS subsystem – reliable‑availability‑serviceability  
Key structures (exported via `include/linux/ras/err.h`):  

```c
struct ras_common_if {
    void (*init)(void);
    void (*exit)(void);
    int  (*inject_error)(enum ras_error_type type, u64 addr);
    ssize_t (*get_error_count)(enum ras_error_type type, char *buf, size_t len);
};

/* Example registration (simplified) */
static struct ras_common_if edac_ras_if = {
    .init    = edac_ras_init,
    .exit    = edac_ras_exit,
    .inject_error = edac_ras_inject,
    .get_error_count = edac_ras_get_count,
};

static int __init edac_ras_init(void)
{
    return ras_register_common(&edac_ras_if, RAS_SUBSYS_MEM);
}
```

A minimal **C** program that reads the EDAC correctable error count via sysfs:

```c
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <inttypes.h>

int main(void)
{
    int fd = open("/sys/devices/system/edac/mc/mc0/ce_count", O_RDONLY);
    if (fd < 0) {
        perror("open");
        return 1;
    }
    char buf[32];
    ssize_t n = read(fd, buf, sizeof(buf)-1);
    if (n >= 0) {
        buf[n] = '\0';
        printf("Correctable ECC errors: %s\n", buf);
    }
    close(fd);
    return 0;
}
```

Compile with `gcc -o edac_rd edac_rd.c -Wall`.

These interfaces let system administrators and health‑monitoring daemons (e.g., `rsyslogd`, `prometheus node exporter`) predict imminent hardware degradation and trigger preventive actions such as workload migration or pre‑emptive replacement.

---

## Why This Matters  
Reliability physics transforms vague “hardware can fail” intuition into quantitative design rules:  

* By linking **current density**, **temperature**, and **electric field** to atomistic flux equations, designers can size interconnects, select barrier metals, and set voltage margining with provable lifetime targets.  
* Understanding **defect‑generation kinetics** (BTI, HCI, TDDB) enables circuit‑level techniques such as adaptive body biasing, guard‑band reduction, and refresh‑aware scheduling that directly improve yield and operational lifespan.  
* The **thermal‑cycling fatigue model** informs package‑level decisions—choice of underfill, solder alloy, and substrate CTE matching—so that power‑cycling tests in automotive or aerospace environments translate into predictable field MTBF.  
* When these physical models are encoded into kernel subsystems (EDAC, hwmon, RAS), the operating system becomes a **proactive reliability sensor**: it logs correctable ECC errors before they become uncorrectable, throttles frequency when temperature approaches electromigration‑accelerated limits, and can trigger firmware‑initiated voltage scaling to extend TDDB life.  
* Consequently, engineers can close the loop from **materials science → device physics → system architecture → OS health monitoring → runtime management**, achieving systems that meet the stringent uptime and safety requirements of data centers, autonomous vehicles, and medical implants. Mastery of reliability physics is therefore not an academic add‑on; it is the foundation for building trustworthy, high‑performance Linux‑based platforms.
