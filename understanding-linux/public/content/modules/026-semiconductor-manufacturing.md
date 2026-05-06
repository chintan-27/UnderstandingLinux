---
id: 26
title: "Semiconductor manufacturing"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Core Concepts
### Silicon Purification – Why Ultra‑Pure Si is Required
Silicon used for device fabrication must contain < 1 ppb metallic impurities because even trace transition‑metal atoms create deep‑level traps that increase leakage and reduce carrier lifetime. The **Siemens process** converts metallurgical‑grade Si (≈ 98 % pure) to trichlorosilane (SiHCl₃) via  
\[
\text{Si} + 3\text{HCl} \xrightarrow{300^\circ\text{C}} \text{SiHCl}_3 + \text{H}_2
\]  
followed by high‑temperature (≈ 1100 °C) reduction in a hydrogen atmosphere:  
\[
\text{SiHCl}_3 + \text{H}_2 \rightarrow \text{Si} + 3\text{HCl}
\]  
The gaseous intermediate allows **zone refining**: a moving molten zone sweeps impurities to one end because the segregation coefficient \(k<1\) for most metals in Si. Repeated passes push impurity concentration down exponentially: after \(n\) passes, \(C_n = C_0 k^n\). For boron (\(k\approx0.8\)), ten passes reduce 10 ppb to ≈ 1 ppb. This explains why purification is a multi‑stage chemical‑physical cascade, not a single reaction.

### Ingot Growth – Controlling Defects via the Czochralski (CZ) Process
A seed crystal oriented <100> is dipped into molten Si and withdrawn at rate \(v\) while rotating. The **thermal gradient** \(G\) at the solid–liquid interface determines defect density via the **critical velocity** \(v_c = \frac{D \cdot G}{m \cdot C_0}\) (where \(D\) is solute diffusivity, \(m\) the liquidus slope, \(C_0\) bulk dopant). If \(v>v_c\), constitutional supercooling creates dislocations and vacancies. Hence growth speed must be balanced against furnace temperature profile to keep \(v<v_c\). The pulled ingot’s diameter \(D\) follows from heat balance:  
\[
\pi D^2 v \rho L = 2\pi k (T_{melt}-T_{wall}) D
\]  
where \(\rho\) is density, \(L\) latent heat, \(k\) thermal conductivity. Solving for \(D\) shows why larger ingots require slower pull rates or higher furnace power.

### Wafering – From Ingot to Mirror‑Finish Substrate
Slicing with a **diamond‑impregnated wire saw** produces kerf loss ~ 0.2 mm per cut. Subsequent lapping removes saw damage; **chemical‑mechanical polishing (CMP)** then yields a surface roughness < 0.5 nm RMS. The Preston equation describes material removal rate (MRR):  
\[
\text{MRR}=k_p \cdot P \cdot v
\]  
where \(k_p\) is pad‑specific, \(P\) pressure, \(v\) relative velocity. Controlling \(P\) and \(v\) prevents sub‑surface damage that would otherwise propagate as dislocation loops during later high‑temperature steps.

### Oxidation – Growing SiO₂ via the Deal–Grove Model
Thermal oxidation proceeds by diffusion of O₂ (or H₂O) through the existing oxide to the Si/SiO₂ interface where it reacts. The **Deal–Grove** equation captures both linear‑ and parabolic‑rate regimes:  
\[
x^2 + A x = B (t + \tau)
\]  
where \(x\) oxide thickness, \(A=\frac{2D}{k}\), \(B=\frac{2D C^*}{N}\), \(D\) diffusivity of oxidant in oxide, \(k\) surface reaction rate, \(C^*\) oxidant concentration at gas‑oxide interface, \(N\) number of Si atoms per unit volume in oxide, \(\tau\) accounts for an initial native oxide. For dry O₂ at 1000 °C, typical constants are \(A≈0.165\;\mu\text{m}\), \(B≈0.0115\;\mu\text{m}^2/\text{h}\). Thus, for thin oxides (< 0.1 µm) the linear term dominates (reaction‑limited); for thick oxides the parabolic term dominates (diffusion‑limited). This explains why oxidation time does not scale linearly with thickness.

### Deposition – CVD vs. PVD and Step Coverage
Low‑pressure CVD (LPCVD) of polysilicon uses silane pyrolysis:  
\[
\text{SiH}_4 \xrightarrow{600-650^\circ\text{C}} \text{Si} + 2\text{H}_2
\]  
The deposition rate follows Arrhenius behavior:  
\[
R = R_0 \exp\!\left(-\frac{E_a}{k_B T}\right)
\]  
with \(E_a≈1.8\) eV for SiH₄. **Plasma‑enhanced CVD (PECVD)** lowers \(T\) by ion‑assisted reactions, enabling conformal coating of high‑aspect‑ratio trenches. Physical vapor deposition (PVD) sputtering yields a flux \(\Phi\) that obeys cosine law; step coverage is poor for aspect ratios > 1:1 unless bias‑sputtering or collimation is used. Hence, CVD is preferred for conformal dielectric or polysilicon layers, while PVD is used for metal layers where anisotropy is tolerable.

### Photolithography – Resolution Limits and Proximity Effects
The smallest printable feature \(CD\) (critical dimension) follows the **Rayleigh criterion**:  
\[
CD = k_1 \frac{\lambda}{\text{NA}}
\]  
where \(\lambda\) is exposure wavelength, NA the numerical aperture of the projection lens, and \(k_1\) a process‑dependent factor (≥ 0.25 for modern off‑axis illumination). For ArF excimer lasers (\(\lambda=193\) nm) with NA=1.35 and \(k_1=0.25\), the theoretical limit is ≈ 45 nm. However, **proximity effect** arises because diffraction from dense features alters the aerial image of isolated lines; the intensity distribution is convolved with the mask’s transmission function:  
\[
I(x,y) = |\,M \ast h\,|^2
\]  
where \(h\) is the point‑spread function of the optics. OPC (optical proximity correction) pre‑distorts the mask to compensate. This explains why simply shrinking the mask does not guarantee smaller features.

### Ion Implantation – Dopant Profile from Binary Collision Approximation
Ions lose energy via nuclear stopping (elastic collisions) and electronic stopping (inelastic). The projected range \(R_p\) and straggle \(\Delta R_p\) are given by the **Lindhard–Scharff–Schiott (LSS)** theory:  
\[
R_p = \frac{2E}{N Z_1 Z_2 e^2} \cdot \Phi(\epsilon),\qquad
\Delta R_p = \alpha R_p
\]  
where \(E\) ion energy, \(N\) target atomic density, \(Z_{1,2}\) atomic numbers, \(\epsilon\) reduced energy, \(\Phi\) a universal function, \(\alpha≈0.1\). The dopant concentration after implantation follows a Gaussian:  
\[
C(x) = \frac{\Phi}{\sqrt{2\pi}\Delta R_p}\exp\!\left[-\frac{(x-R_p)^2}{2\Delta R_p^2}\right]
\]  
with \(\Phi\) the implanted dose (atoms cm⁻²). Post‑implant annealing activates dopants but also causes **transient enhanced diffusion (TED)** due to interstitial supersaturation, which must be modeled with coupled diffusion‑reaction equations.

### Diffusion – Redistributing Implanted Species
During anneal, dopants obey **Fick’s second law**:  
\[
\frac{\partial C}{\partial t} = D \frac{\partial^2 C}{\partial x^2}
\]  
with temperature‑dependent diffusivity \(D = D_0 \exp(-E_A/k_B T)\). For boron in Si, \(D_0≈1.0\times10^{-3}\) cm²/s, \(E_A≈3.46\) eV. Solving for a constant‑surface‑concentration source yields the complementary error function profile:  
\[
C(x,t) = C_s \,\text{erfc}\!\left(\frac{x}{2\sqrt{Dt}}\right)
\]  
Thus, the junction depth scales as \(\sqrt{Dt}\). This explains why high‑temperature anneals cause deeper junctions and why spike anneals (millisecond) limit diffusion while still activating dopants.

### Etching – Wet Isotropic vs. Dry Anisotropic
Wet etching (e.g., HF for SiO₂) is isotropic: etch rate \(R\) is uniform in all directions, leading to undercut beneath masks. Dry plasmas (e.g., CF₄/O₂ for Si) generate **ion‑enhanced anisotropy**: neutral radicals chemically react, while ions bombard vertically, enhancing reaction probability only where ion flux is normal. The **ion‑assisted etch rate** can be expressed as  
\[
R = R_{\text{chem}} + \gamma \, J_i \, S(\theta)
\]  
where \(R_{\text{chem}}\) is purely chemical rate, \(J_i\) ion flux, \(\gamma\) sticking coefficient, \(S(\theta)\) angular dependence (maximal at \(\theta=0\)). By tuning bias power, one achieves side‑wall angles > 85°, essential for sub‑100 nm features.

### Chemical Mechanical Planarization (CMP) – Achieving Global Flatness
CMP removes material via synergistic chemical reaction and mechanical abrasion. The Preston equation (above) links removal rate to pressure and velocity. **Pad conditioning** and **slurry chemistry** (e.g., silica colloid with KOH for SiO₂) control selectivity. The **within‑wafer non‑uniformity** (WIWNU) stems from pad wear and pressure distribution; feedback control using in‑situ laser interferometry adjusts pad pressure map to keep WIWNU < 5 nm across a 300 mm wafer.

### Metallization – Interconnects and Electromigration
Aluminum was historically deposited by sputtering; copper now uses **electrochemical plating** followed by a barrier (Ta/TaN) and seed layer. Copper’s lower resistivity (1.68 µΩ·cm vs. Al’s 2.65 µΩ·cm) reduces RC delay. However, Cu is susceptible to **electromigration**: momentum transfer from conducting ions to metal atoms causes void formation. **Black’s equation** predicts mean time to failure (MTTF):  
\[
\text{MTTF}= A J^{-n} \exp\!\left(\frac{E_a}{k_B T}\right)
\]  
where \(J\) current density, \(n≈2\), \(E_a≈0.7\) eV for Cu. Keeping \(J<1\) MA/cm² and maintaining low temperature (< 100 °C) extends interconnect lifetime beyond product lifetime.

### Yield – Statistical Modeling of Defects
Yield \(Y\) for a die of area \(A\) with random defect density \(D_0\) (defects/cm²) follows the **Poisson model**:  
\[
Y = \exp(-D_0 A)
\]  
If defects are clustered, the **negative binomial** model is used:  
\[
Y = \left(1 + \frac{D_0 A}{\alpha}\right)^{-\alpha}
\]  
where \(\alpha\) measures clustering (\(\alpha\to\infty\) recovers Poisson). This explains why yield drops faster than linear with die size and why defect‑reduction initiatives (cleaner wafers, better mask inspection) have exponential impact.

### Packaging – Protecting the Die and Enabling I/O
Flip‑chip packaging solder bumps the die directly to the substrate, reducing inductance. Under‑fill epoxy mitigates thermal expansion mismatch stress. Wire‑bonding uses ultrasonic capillary bonding of Al or Au wires; bond strength follows  
\[
F = \frac{\pi d^2 \sigma}{4}
\]  
where \(d\) wire diameter, \(\sigma\) material yield stress. Reliability tests (temperature cycling, humidity bias) validate that package‑induced stresses do not cause delamination or crack propagation.

### Testing – From Parametric to Reliability
Functional tests apply logic vectors; parametric tests measure \(I_{V_{th}}\), \(I_{off}\), \(R_{ds(on)}\) etc. Reliability tests include **HTOL** (high‑temperature operating life) and **TDDB** (time‑dependent dielectric breakdown). The Weibull slope \(\beta\) describes failure distribution:  
\[
F(t)=1-\exp\!\left[-(t/\eta)^\beta\right]
\]  
A low \(\beta\) (< 1) indicates infant mortality; a high \(\beta\) (> 1) indicates wear‑out. Understanding these distributions informs burn‑in periods and warranty predictions.

---

## How It Works
1. **Purification** – Metallurgical Si → SiHCl₃ (gas) → high‑purity Si via Siemens reactions; zone refining reduces impurity concentration exponentially because segregation coefficient \(k<1\).  
2. **Ingot Growth** – CZ pulling balances temperature gradient \(G\) and pull rate \(v\) to avoid constitutional supercooling; diameter set by heat‑flux balance.  
3. **Wafering** – Saw → lapping → CMP; Preston equation links removal rate to pressure/velocity, enabling sub‑nanometer roughness.  
4. **Oxidation** – O₂/H₂O diffuses through SiO₂; Deal–Grove captures linear (reaction‑limited) and parabolic (diffusion‑limited) regimes.  
5. **Deposition** – LPCVD/PeCVD provides conformal films; rate follows Arrhenius law; PVD sputtering gives anisotropic flux.  
6. **Photolithography** – UV exposure through mask; resolution limited by Rayleigh criterion; OPC corrects proximity effects via aerial‑image convolution.  
7. **Ion Implantation** – Ions lose energy via nuclear/electronic stopping; LSS theory gives projected range and straggle; post‑implant anneal activates dopants but induces TED.  
8. **Diffusion** – Fick’s second law with temperature‑dependent \(D\) governs redistribution; junction depth \(\propto\sqrt{Dt}\).  
9. **Etching** – Wet isotropic vs. dry ion‑enhanced anisotropic; ion flux directionality yields vertical sidewalls.  
10. **CMP** – Mechanical abrasion + chemical reaction; Preston equation; feedback control minimizes WIWNU.  
11. **Metallization** – Cu plating + barrier; electromigration described by Black’s equation sets current‑density limits.  
12. **Yield** – Poisson/negative binomial models link defect density to functional die probability.  
13. **Packaging** – Flip‑chip, under‑fill, wire‑bond; mechanical models ensure stress relief.  
14. **Testing** – Functional, parametric, reliability; Weibull analysis predicts failure rates.

---

## Worked Examples
### Example 1: Oxide Thickness vs. Time (Deal–Grove)
**Problem:** Determine the dry‑oxygen oxidation time needed to grow 100 nm SiO₂ at 1000 °C.  
**Given:** \(A=0.165\;\mu\text{m}\), \(B=0.0115\;\mu\text{m}^2/\text{h}\).  
**Solution:** Solve \(x^2 + A x = B(t+\tau)\). Neglect \(\tau\) (native oxide ≈ 1 nm ≪ x).  
\[
t = \frac{x^2 + A x}{B}
   = \frac{(0.10)^2 + 0.165(0.10)}{0.0115}\;\text{h}
   = \frac{0.0100 + 0.0165}{0.0115}
   = \frac{0.0265}{0.0115}\;\text{h}
   \approx 2.30\;\text{h}
\]  
Thus ~2.3 h (≈ 138 min) in a dry O₂ furnace at 1000 °C yields 100 nm oxide. If the target were 20 nm, the linear term dominates:  
\[
t \approx \frac{A x}{B} = \frac{0.165\times0.02}{0.0115}\approx0.287\;\text{h}=17.2\;\text{min}
\]  
showing the strong thickness‑time nonlinearity.

### Example 2: Ion Implantation Dose for Target Sheet Resistance
**Problem:** Achieve a sheet resistance \(R_{sh}=150\;\Omega/\square\) in a p‑type layer using boron implantation at 30 keV, followed by a 900 °C 30 s spike anneal (assume 80 % activation).  
**Solution:** Sheet resistance relates to dopant concentration \(N_A\) and mobility \(\mu_p\):  
\[
R_{sh}= \frac{1}{q \mu_p N_A t_j}
\]  
Assume \(\mu_p≈450\;\text{cm}^2/\text{V·s}\) (for \(N_A≈10^{18}\) cm⁻³), junction depth \(t_j≈0.1\;\mu\text{m}=1\times10^{-5}\) cm. Solve for \(N_A\):  
\[
N_A = \frac{1}{q \mu_p R_{sh} t_j}
     = \frac{1}{(1.6\times10^{-19})(450)(150)(1\times10^{-5})}
     \approx 9.26\times10^{17}\;\text{cm}^{-3}
\]  
The implanted dose \(\Phi\) (atoms cm⁻²) needed for a Gaussian profile with projected range \(R_p=0.07\;\mu\text{m}\) and straggle \(\Delta R_p=0.02\;\mu\text{m}\) is  
\[
\Phi = N_A \sqrt{2\pi}\,\Delta R_p \approx 9.26\times10^{17}\times\sqrt{2\pi}\times2\times10^{-6}
     \approx 1.16\times10^{13}\;\text{cm}^{-2}
\]  
Considering 80 % activation, increase dose by \(1/0.8\): \(\Phi_{\text{actual}}≈1.45\times10^{13}\;\text{cm}^{-2}\). This is the dose to program into the implanter.

### Example 3: Yield Prediction for a 300 mm Wafer
**Problem:** A fab reports a defect density \(D_0 = 0.02\;\text{defects/cm}^2\). What is the expected yield for a die of 100 mm²?  
**Solution:** Convert area: \(100\;\text{mm}^2 = 1\;\text{cm}^2\). Poisson yield:  
\[
Y = \exp(-D_0 A) = \exp(-0.02\times1) = e^{-0.02} \approx 0.9802\;(98.0\%)
\]  
If the same die size is increased to 400 mm² (4 cm²):  
\[
Y = \exp(-0.02\times4) = e^{-0.08} \approx 0.923\;(92.3\%)
\]  
Hence a four‑fold area increase reduces yield by ~ 5.8 % absolute, illustrating the exponential sensitivity.

---

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Understanding |
|---------|----------------|-----------------------|
| **“Oxidation thickness grows linearly with time.”** | Ignores diffusion‑limited regime; the Deal–Grove model shows a parabolic term dominates once oxide exceeds ~ 20 nm at 1000 °C. | Use \(x^2 + A x = B t\); for thick oxides, \(x \approx \sqrt{Bt}\). |
| **“All implanted dopants become electrically active after anneal.”** | Activation efficiency is < 100 % due to clustering, interstitial trapping, and out‑diffusion; also transient enhanced diffusion can reduce net dose. | Measure active concentration via secondary‑ion mass spectrometry (SIMS) and Hall; apply activation factor (typically 60‑90 %). |
| **“Photolithography resolution is simply λ/NA.”** | Omits the process‑dependent factor \(k_1\) (≥ 0.25) and proximity effects that require OPC; also ignores resist contrast and development bias. | Full expression: \(CD = k_1 \lambda/\text{NA} + \text{bias}\); OPC corrects for proximity. |
| **“Yield scales linearly with die area.”** | Defects are random; yield follows exponential (Poisson) or negative‑binomial law, making large dies disproportionately sensitive to defect density. | Yield = \(e^{-D_0 A}\) (Poisson) or clustered model; small improvements in \(D_0\) give large yield gains for big dies. |
| **“CMP removes material uniformly across the wafer.”** | Pad wear, slurry distribution, and pressure gradients cause within‑wafer non‑uniformity; without feedback, WIWNU can exceed 10 nm. | In‑situ interferometry or reflectometry maps removal rate; adjust pad pressure profile in real time. |
| **“Electromigration only matters at very high current densities.”** | Even moderate densities (≈ 0.5 MA/cm²) cause void nucleation over product lifetime due to temperature‑dependent diffusion; Black’s equation shows strong \(J^{-n}\) dependence. | Keep \(J<1\) MA/cm², use barrier/liner, and manage Joule heating via thermal vias. |

---

## Exercises
### Easy
1. **Oxidation Time:** Using the Deal–Grove parameters \(A=0.17\;\mu\text{m}\), \(B=0.012\;\mu\text{m}^2/\text{h}\) (dry O₂, 1000 °C), calculate the time to grow a 30 nm oxide.  
2. **Implant Dose:** Phosphorus implanted at 40 keV gives \(R_p=0.12\;\mu\text{m}\), \(\Delta R_p=0.03\;\mu\text{m}\). To achieve a surface concentration of \(5\times10^{19}\;\text{cm}^{-3}\) (assuming 70 % activation), what dose is required?  

### Intermediate
3. **Resolution Calculation:** A scanner uses \(\lambda=193\) nm, NA=1.35, and \(k_1=0.28\). What is the minimum printable half‑pitch? If the process introduces a bias of +5 nm, what is the final CD?  
4. **Yield Comparison:** Two dies: Die A = 25 mm², Die B = 225 mm². Defect density \(D_0 = 0.005\;\text{cm}^{-2}\). Compute yields for each using the Poisson model and comment on the scaling.  

### Hard
5. **Electromigration Lifetime:** A Cu line carries \(J=1.2\) MA/cm² at 85 °C. Using Black’s equation with \(A=1.0\times10^{-5}\) h·(A/cm²)ⁿ, \(n=2\), \(E_a=0.7\) eV, estimate MTTF. How does reducing the line width from 0.15 µm to 0.09 µm (keeping current constant) affect MTTF?
