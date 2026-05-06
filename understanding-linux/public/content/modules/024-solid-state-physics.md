---
id: 24
title: "Solid-state physics"
supermoduleId: 2
estimatedMinutes: 45
resources:
  - type: book
    title: "Feynman Lectures on Physics"
  - type: book
    title: "Introduction to Solid State Physics (Kittel)"
---

## Core Concepts  
### Crystal Translation Symmetry and Bloch’s Theorem  
A perfect crystal is described by a Bravais lattice \(\{\mathbf{R}\}\) with basis atoms. The Hamiltonian commutes with all lattice translation operators \(\hat{T}_{\mathbf{R}}\), so eigenstates can be chosen as simultaneous eigenstates of \(\hat{T}_{\mathbf{R}}\):  

\[
\psi_{n\mathbf{k}}(\mathbf{r}) = e^{i\mathbf{k}\cdot\mathbf{r}}u_{n\mathbf{k}}(\mathbf{r}),\qquad 
u_{n\mathbf{k}}(\mathbf{r}+\mathbf{R})=u_{n\mathbf{k}}(\mathbf{r}) .
\]

\(\mathbf{k}\) is the crystal momentum confined to the first Brillouin zone (BZ). This Bloch form is the *origin* of energy bands: solving the Schrödinger equation for each \(\mathbf{k}\) yields a discrete set of energies \(E_n(\mathbf{k})\) that, when plotted versus \(\mathbf{k}\), form continuous bands because \(\mathbf{k}\) varies continuously.

### Nearly Free Electron Model – Origin of Band Gaps  
Treat the periodic ionic potential \(V(\mathbf{r})=\sum_{\mathbf{G}}V_{\mathbf{G}}e^{i\mathbf{G}\cdot\mathbf{r}}\) as a weak perturbation to free electrons. At the BZ boundary where \(\mathbf{k}\) and \(\mathbf{k}+\mathbf{G}\) are degenerate, first‑order perturbation theory splits the degenerate pair:

\[
E_{\pm}(\mathbf{k}) = \frac{\hbar^2k^2}{2m} \pm |V_{\mathbf{G}}| .
\]

Thus a gap \(2|V_{\mathbf{G}}|\) opens. The size of the gap is set by the Fourier component of the crystal potential; stronger potentials (e.g., in insulators) give wider gaps.

### Effective Mass from Band Curvature  
Near a band extremum (\(\mathbf{k}_0\)) we expand to second order:

\[
E_n(\mathbf{k}) \approx E_n(\mathbf{k}_0) + \frac{1}{2}\sum_{i,j}\hbar^2\left(\frac{1}{m^*}\right)_{ij}(k_i-k_{0i})(k_j-k_{0j}),
\]

defining the effective‑mass tensor  

\[
\left(\frac{1}{m^*}\right)_{ij} = \frac{1}{\hbar^2}\frac{\partial^2E_n}{\partial k_i\partial k_j}\Bigg|_{\mathbf{k}_0}.
\]

A large curvature (steep band) → small \(|m^*|\); a flat band → large \(|m^*|\). The effective mass quantifies how the electron responds to external fields as if it were a free particle with mass \(m^*\).

### Fermi Level and Chemical Potential  
At thermal equilibrium the occupation of a single‑particle state of energy \(E\) follows the Fermi‑Dirac distribution  

\[
f(E)=\frac{1}{1+\exp\!\big[(E-\mu)/k_{\!B}T\big]} .
\]

The chemical potential \(\mu\) is the energy at which \(f(E)=1/2\). At \(T=0\) it equals the highest occupied single‑particle level – the *Fermi energy* \(E_F\). In semiconductors \(\mu\) lies inside the gap and shifts with temperature and doping according to charge‑neutrality:

\[
n(\mu,T)=p(\mu,T)+N_D^+-N_A^- .
\]

### Carrier Concentration from Density of States  
The conduction‑band electron density is  

\[
n = \int_{E_c}^{\infty} g_c(E)f(E)\,dE,
\qquad 
g_c(E)=\frac{1}{2\pi^2}\left(\frac{2m_e^*}{\hbar^2}\right)^{3/2}\!\sqrt{E-E_c}.
\]

For non‑degenerate semiconductors (\(E_c-\mu\gg k_{\!B}T\)) the integral simplifies to  

\[
n \approx N_c e^{-(E_c-\mu)/k_{\!B}T},
\quad 
N_c=2\left(\frac{2\pi m_e^*k_{\!B}T}{h^2}\right)^{3/2},
\]

and similarly for holes with \(N_v\). This relation links measurable conductivity to the microscopic band structure and the Fermi level.

### Mobility, Scattering Time, and Matthiessen’s Rule  
The drift velocity under an electric field \(\mathbf{E}\) is  

\[
\mathbf{v}_d = \mu \mathbf{E},\qquad 
\mu = \frac{e\langle\tau\rangle}{m^*},
\]

where \(\tau\) is the mean free time between scattering events. Scattering mechanisms add inversely (Matthiessen’s rule):

\[
\frac{1}{\tau}= \frac{1}{\tau_{\text{ph}}}+\frac{1}{\tau_{\text{imp}}}+\frac{1}{\tau_{\text{def}}}+\dots
\]

* Phonon scattering: \(\tau_{\text{ph}}^{-1}\propto T\) (acoustic) or \(\propto T^{3/2}\) (optical) via deformation‑potential coupling.  
* Ionized‑impurity scattering: \(\tau_{\text{imp}}^{-1}\propto N_I/(kT)^{3/2}\) (Brooks‑Herring formula).  
* Defect/scattering from dislocation cores follows similar \(k\)-dependence.

Thus mobility falls with temperature (phonon‑limited) and with impurity concentration.

### Recombination Mechanisms  
* **Radiative**: electron in conduction band recombines with hole in valence band, emitting a photon; rate \(R_{\text{rad}} = Bnp\).  
* **Auger**: energy transferred to a third carrier; rate \(R_{\text{Auger}} = C_n n^2 p + C_p np^2\).  
* **Shockley‑Read‑Hall (SRH)**: via a trap level \(E_t\) within the gap;  

\[
R_{\text{SRH}} = \frac{np-n_i^2}{\tau_p (n+n_1)+\tau_n (p+p_1)},
\quad 
\tau_{n,p}= \frac{1}{\sigma_{n,p}v_{\text{th}}N_t}.
\]

SRH dominates in indirect‑gap materials (Si, Ge) and sets the minority‑carrier lifetime \(\tau_{\text{eff}}\).

---

## How It Works  
Starting from the periodic potential, Bloch’s theorem gives wavefunctions labeled by \(\mathbf{k}\). Solving the Schrödinger equation for each \(\mathbf{k}\) yields dispersion relations \(E_n(\mathbf{k})\). The *density of states* (DOS) counts how many \(\mathbf{k}\)‑states fall in an energy interval:

\[
g(E)=\frac{2}{(2\pi)^3}\int_{\text{BZ}}\delta\!\big(E-E_n(\mathbf{k})\big)\,d^3k,
\]

the factor 2 accounting for spin.  

The Fermi level \(\mu\) is fixed by charge neutrality; inserting \(f(E)\) into the DOS integral yields carrier concentrations \(n\) and \(p\). Conductivity follows from the drift current density  

\[
\mathbf{J}=e(n\mu_n + p\mu_p)\mathbf{E},
\]

with mobilities obtained from scattering times as above.  

Recombination removes electron‑hole pairs, reducing the steady‑state carrier density under illumination or injection; the balance  

\[
G = R_{\text{rad}}+R_{\text{Auger}}+R_{\text{SRH}}
\]

determines the quasi‑Fermi level splitting, which is the voltage across a p‑n junction under bias.

---

## Worked Examples  

### Example 1: Width of the First Band Gap (Nearly Free Electron)  
*Given*: simple cubic lattice, lattice constant \(a = 5\text{ Å}=5\times10^{-10}\,\text{m}\). Assume the first‑order Fourier component of the ionic potential \(|V_{\mathbf{G}}| = 0.08\text{ eV}\) (typical for Si).  

1. Reciprocal‑lattice vector magnitude for the (100) plane: \(|\mathbf{G}| = 2\pi/a\).  
2. Brillouin‑zone boundary along \([100]\) occurs at \(k = |\mathbf{G}|/2 = \pi/a\).  
3. Free‑electron energy at that \(k\):  

\[
E_0 = \frac{\hbar^2 k^2}{2m_0}
= \frac{\hbar^2 (\pi/a)^2}{2m_0}
\approx \frac{(1.055\times10^{-34})^2 (\pi/5\times10^{-10})^2}{2(9.11\times10^{-31})}
\approx 0.38\text{ eV}.
\]

4. The gap opens symmetrically:  

\[
E_{\pm}=E_0\pm|V_{\mathbf{G}}|
\;\Rightarrow\;
\Delta E = 2|V_{\mathbf{G}}| = 0.16\text{ eV}.
\]

*Interpretation*: The first band gap is 0.16 eV; the bottom of the conduction band lies at \(E_c\approx E_0+|V_{\mathbf{G}}|=0.46\) eV above the free‑electron reference, the top of the valence band at \(E_v\approx0.30\) eV.

### Example 2: Intrinsic Fermi Level in Silicon at 300 K  
Parameters: \(E_g=1.12\text{ eV}\), \(m_e^*=1.08m_0\) (DOS effective mass), \(m_h^*=0.81m_0\), \(N_c=2.8\times10^{19}\text{ cm}^{-3}\), \(N_v=1.04\times10^{19}\text{ cm}^{-3}\).  

The intrinsic Fermi level (mid‑gap corrected for DOS asymmetry) is  

\[
E_i = \frac{E_c+E_v}{2} + \frac{k_{\!B}T}{2}\ln\!\frac{N_v}{N_c}.
\]

Compute:  

\[
\frac{E_c+E_v}{2}= \frac{E_v+E_g/2+E_v}{2}=E_v+\frac{E_g}{2}
\approx E_v+0.56\text{ eV}.
\]

\[
\frac{k_{\!B}T}{2}\ln\!\frac{N_v}{N_c}
= \frac{(8.617\times10^{-5}\,\text{eV/K}\times300)}{2}
\ln\!\left(\frac{1.04}{2.8}\right)
\approx 0.0129\text{ eV}\times(-0.99)
\approx -0.0128\text{ eV}.
\]

Thus  

\[
E_i \approx E_v + 0.56\text{ eV} -0.013\text{ eV}
= E_v + 0.547\text{ eV}.
\]

So the intrinsic level lies ~0.55 eV above the valence band (or 0.57 eV below the conduction band), slightly offset toward the band with larger DOS mass.

### Example 3: Extracting Scattering Time from Measured Mobility  
*Given*: electron mobility in Si \(\mu_n = 1500\text{ cm}^2\!/\!\text{V·s}\), DOS effective mass \(m_e^* = 1.08m_0\).  

Convert to SI: \(\mu_n = 1500\times10^{-4}\text{ m}^2\!/\!\text{V·s}=0.15\text{ m}^2\!/\!\text{V·s}\).  

Using \(\mu = e\tau/m^*\):  

\[
\tau = \frac{\mu m^*}{e}
= \frac{0.15\;\text{m}^2\!/\!\text{V·s}\times(1.08\times9.11\times10^{-31}\text{ kg})}{1.602\times10^{-19}\text{ C}}
\approx \frac{0.15\times9.84\times10^{-31}}{1.602\times10^{-19}}
\approx 9.2\times10^{-13}\text{ s}=0.92\text{ ps}.
\]

*Interpretation*: The average time between momentum‑relaxing scattering events for conduction electrons in Si at room temperature is ~1 ps, consistent with phonon‑limited scattering.

---

## Common Mistakes  

| # | Misconception | Why It’s Wrong |
|---|----------------|----------------|
| 1 | **“The Fermi level is always in the middle of the band gap.”** | Only true for an *intrinsic* semiconductor with symmetric DOS. Doping shifts \(\mu\) toward the band with excess carriers; at high temperature \(\mu\) can even enter the bands (degenerate semiconductor). |
| 2 | **“Effective mass is just the electron’s real mass scaled by a constant.”** | Effective mass is a tensor derived from the curvature of \(E(\mathbf{k})\). It can be negative (near a band maximum) or anisotropic, reflecting how the lattice potential modifies acceleration, not a simple scalar scaling. |
| 3 | **“Increasing temperature always increases conductivity.”** | In metals, increased phonon scattering reduces \(\tau\) and thus conductivity (\(\sigma = ne\mu\)). In semiconductors, carrier concentration rises exponentially with \(T\), often outweighing mobility loss, but at very high \(T\) mobility degradation can dominate, causing \(\sigma\) to fall. |
| 4 | **“Recombination only matters for LEDs or lasers.”** | SRH recombination limits minority‑carrier lifetime in *all* silicon devices (MOSFETs, BJTs, solar cells), directly affecting switching speed, diffusion length, and dark current. |
| 5 | **“Scattering from impurities is independent of temperature.”** | Ionized‑impurity scattering scales as \(T^{-3/2}\) because higher carrier velocity reduces interaction time; neglecting this leads to overestimation of mobility at low \(T\). |

---

## Exercises  

### Easy  
1. **Band‑gap estimation** – Using the nearly free electron model, estimate the first band gap for a 2‑D square lattice with \(a=3\text{ Å}\) and \(|V_{\mathbf{G}}|=0.05\text{ eV}\). Show the calculation of the zone‑boundary energy and the gap size.  
2. **Fermi level shift** – For an n‑type Si sample doped with \(N_D=5\times10^{15}\text{ cm}^{-3}\) at 300 K, approximate the Fermi level position relative to the conduction band using \(n\approx N_D\) and the non‑degenerate formula.  

### Intermediate  
3. **Mobility extraction** – Hall measurements on a GaAs wafer give \(\mu_H = 8500\text{ cm}^2\!/\!\text{V·s}\) and Hall coefficient \(R_H = -5.0\times10^{-3}\text{ cm}^3\!/\!\text{C}\). Compute the electron concentration, compare with the value from \(\mu = e\tau/m^*\) assuming \(m^*=0.067m_0\), and infer the scattering time.  
4. **SRH lifetime** – A Si wafer contains gold traps at \(E_t = E_i+0.2\text{ eV}\) with concentration \(N_t=10^{12}\text{ cm}^{-3}\) and capture cross‑sections \(\sigma_n=\sigma_p=10^{-15}\text{ cm}^2\). Calculate the SRH lifetime for low‑level injection (\(\Delta n = 10^{12}\text{ cm}^{-3}\)).  

### Hard  
5. **Self‑consistent Fermi level** – For p‑type Si with \(N_A=1\times10^{18}\text{ cm}^{-3}\) at 300 K, solve the charge‑neutrality equation  

\[
p = N_A^- + n,
\qquad 
p = N_v e^{-(E_F-E_v)/kT},\;
n = N_c e^{-(E_c-E_F)/kT},
\qquad
N_A^- = \frac{N_A}{1+g_A e^{(E_A-E_F)/kT}},
\]

where \(g_A=4\) and acceptor level \(E_A = E_v+0.045\text{ eV}\). Find \(E_F\) (iteratively or analytically) and compute the resulting hole concentration.  
6. **Mobility temperature dependence** – Derive the temperature dependence of \(\mu\) for Si assuming acoustic‑phonon deformation‑potential scattering dominates (\(\tau_{ac}^{-1}\propto T\)). Show that \(\mu \propto T^{-3/2}\) and compare with experimental data (provide a brief plot description).  

---

## Linux Connection  
Solid‑state physics concepts appear throughout the Linux kernel when it manages hardware that relies on semiconductor properties (CPUs, GPUs, memory controllers, sensors). Below are concrete interfaces, commands, and code snippets that let you observe or manipulate these properties.

### 1. Querying CPU Band‑Structure‑Related Features  
Modern x86 CPUs expose model‑specific registers (MSRs) that give access to performance counters, cache layout, and power‑states derived from the underlying band structure.

```bash
# Show CPU model, family, and stepping
lscpu | grep -E 'Model|Family|Stepping'

# List available frequency scaling states (P‑states) – reflects how the band structure and scattering determine max frequency
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_frequencies

# Current governor (policy) – the kernel changes frequency based on load, which effectively changes carrier distribution (Fermi level) in the transistor channels
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor

# Read the thermal zone temperature – carrier scattering rises with temperature, affecting mobility and thus leakage power
cat /sys/class/thermal/thermal_zone0/temp   # value in millidegrees Celsius
```

### 2. Measuring Cache Misses (Effective Mass Analogy)  
Cache latency is analogous to carrier effective mass: a “heavy” effective mass means slower response to an electric field, just as a larger cache miss penalty stalls the CPU.

```bash
# Run a memory‑intensive workload and record cache‑miss events with perf
perf stat -e cache-references,cache-misses -- ./memory_bound_program
```

The ratio `cache-misses / cache-references` gives a rough proxy for scattering rate; increasing temperature (via a stress test) typically raises this ratio, mirroring increased phonon scattering.

### 3. Interacting with a Sensor IIO Device (e.g., an Ambient Light Sensor)  
Many sensors are based on photodetectors whose responsivity depends on the band gap of the semiconductor material (e.g., Si, InGaAs). The Industrial I/O (IIO) subsystem exposes sysfs attributes.

```bash
# List IIO devices
ls /sys/bus/iio/devices/

# Suppose the light sensor is device0
cat /sys/bus/iio/devices/iio:device0/in_illuminance_raw   # raw ADC counts
cat /sys/bus/iio/devices/iio:device0/in_illuminance_scale # conversion to lux
```

You can compute the generated photocurrent \(I_{ph}=R\cdot P_{opt}\) where the responsivity \(R\) depends on absorption coefficient \(\alpha(E)\) – directly tied to the material’s band gap.

### 4. Writing a Simple Platform Driver that Toggles a GPIO‑Backed LED  
GPIO toggling is essentially moving carriers across a potential barrier; the driver demonstrates how the kernel abstracts the underlying solid‑state device.

```c
/* led_gpio.c – minimal platform driver */
#include <linux/module.h>
#include <linux/platform_device.h>
#include <linux/gpio/consumer.h>

static int led_probe(struct platform_device *pdev)
{
    struct gpio_desc *desc;
    int ret;

    desc = devm_gpiod_get(&pdev->dev, NULL, GPIOD_OUT_LOW);
    if (IS_ERR(desc))
        return PTR_ERR(desc);

    gpiod_set_value(desc, 1);   // turn LED on
    dev_info(&pdev->dev, "LED turned on via GPIO %d\n", desc_to_gpio(desc));
    return 0;
}

static int led_remove(struct platform_device *pdev)
{
    struct gpio_desc *desc = dev_get_drvdata(&pdev->dev);
    gpiod_set_value(desc, 0);
    return 0;
}

static const struct of_device_id led_of_match[] = {
    { .compatible = "example,led-gpio", },
    { },
};
MODULE_DEVICE_TABLE(of, led_of_match);

static struct platform_driver led_driver = {
    .probe  = led_probe,
    .remove = led_remove,
    .driver = {
        .name           = "led-gpio",
        .of_match_table = led_of_match,
    },
};
module_platform_driver(led_driver);

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Student Name");
MODULE_DESCRIPTION("GPIO LED driver illustrating carrier transport abstraction");
```

**Build & Load (assuming kernel headers installed):**

```bash
# Compile against running kernel
make -C /lib/modules/$(uname -r)/build M=$(pwd) modules

# Insert
sudo insmod led_gpio.ko

# Verify in dmesg
dmesg | tail -n 5
```

The driver does not touch band‑structure equations directly, but the underlying hardware (the GPIO’s MOSFET driver) relies on mobility, threshold voltage, and sub‑threshold swing—all solid‑state parameters.

### 5. Using `devmem2` to Read a Device Register (Illustrates Potential Barriers)  
Many SoCs expose MMIO registers that control PLLs, which are ultimately limited by carrier transit times across junctions.

```bash
# Example: read the CPU's clock control register (address varies by SoC)
sudo devmem2 0xFE001000 w   # replace with actual base+offset from SoC TRM
```

Understanding that changing the register alters the carrier density in the varactor diode inside the PLL links back to the Fermi‑level shift concept.

---

## Why This Matters  
Solid‑state physics provides the microscopic foundation—band formation, effective mass, scattering, and recombination—that determines every measurable electronic property of a device: its conductivity, switching speed, power dissipation, and optical response.  

When Linux interacts with hardware, it does not manipulate wavefunctions directly; instead, it configures registers, clocks, and power‑states that are *engineered* manifestations of those microscopic quantities.  

*Choosing a CPU governor* changes the operating point of transistors, thereby moving the quasi‑Fermi levels and altering carrier densities, which in turn changes leakage and dynamic power.  
*Tuning cache‑prefetch or frequency scaling* attempts to mitigate the effective‑mass‑limited latency of memory accesses, just as materials engineers
