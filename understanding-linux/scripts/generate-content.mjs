import { writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/content/modules');

// Only write files that don't exist yet (won't overwrite manually-edited content)
const FORCE = process.argv.includes('--force');

function write(id, slug, part, supermoduleId, estimatedMinutes, resources, body) {
  const filename = `${String(id).padStart(3,'0')}-${slug}.md`;
  const path = resolve(OUT, filename);
  if (existsSync(path) && !FORCE) { console.log(`  skip ${filename}`); return; }
  const fm = [
    '---',
    `id: ${id}`,
    `title: "${body.split('\n').find(l=>l.startsWith('# ')).slice(2)}"`,
    `part: "${part}"`,
    `supermoduleId: ${supermoduleId}`,
    `estimatedMinutes: ${estimatedMinutes}`,
    'resources:',
    ...resources.map(r => [
      `  - type: ${r.type}`,
      `    title: "${r.title}"`,
      `    url: "${r.url}"`,
      r.description ? `    description: "${r.description}"` : null,
      r.required    ? `    required: true` : null,
    ].filter(Boolean).join('\n')),
    '---',
    '',
  ].join('\n');
  writeFileSync(path, fm + body.trim() + '\n');
  console.log(`✓ ${filename}`);
}

// ─── SUPERMODULE 1 — Math for Physical Computing ────────────────────────────

write(1,'basic-algebra-and-quantitative-reasoning','I',1,30,[
  {type:'article',title:'Khan Academy — Algebra Fundamentals',url:'https://www.khanacademy.org/math/algebra',description:'Free, comprehensive; good for gaps.',required:true},
  {type:'book',title:'Art of Problem Solving Vol. 1',url:'https://artofproblemsolving.com/store/book/intro-algebra',description:'Rigorous algebraic reasoning with problems.'},
],`
# Basic Algebra and Quantitative Reasoning

## Why This Matters

Every equation describing hardware behaviour — clock frequency, memory bandwidth, power dissipation — is algebra. Before you can reason about why a cache is 100× faster than DRAM, you need fluency with ratios, logarithms, and orders of magnitude.

## Core Concepts

### Equations and Rearrangement

An equation is a constraint: \`latency = size / bandwidth\`. Given any two quantities you can derive the third. This pattern appears throughout systems work — always identify what is known and what you're solving for, then rearrange symbolically before substituting numbers.

### Exponents and Logarithms

Binary computers make powers of two unavoidable. The key identity: **2¹⁰ ≈ 10³**. This means 1 KiB ≈ 1000 bytes, 1 MiB ≈ 10⁶ bytes. Logarithm base 2 answers "how many bits?":

\`\`\`python
import math
print(math.ceil(math.log2(1_000_000)))  # 20 bits to represent 1 million values
print(math.ceil(math.log2(2**32)))      # 32 — as expected for uint32
\`\`\`

### Ratios and Orders of Magnitude

A CPU L1 cache hit takes ~1 ns; a DRAM access ~100 ns; an NVMe read ~100 µs. These are 100×, 100,000× differences. Thinking in multiplicative ratios — not additive differences — is the core skill of performance engineering.

### Dimensional Analysis

Always track units. If \`bandwidth = bytes / second\` and \`latency = seconds\`, then \`throughput = 1 / latency\` gives \`requests/second\`. If your units don't cancel correctly, your formula is wrong.

## Key Insights

- **Think multiplicatively.** A 10× speedup matters; a 9 ns difference rarely does.
- **2¹⁰ ≈ 10³** is the most useful identity in systems work.
- **Rearrange first, substitute numbers last.** Arithmetic errors are common; algebraic errors are caught symbolically.
- **Logarithms appear everywhere:** entropy, complexity (O(log n)), decibels, compression ratios.

## What Comes Next

Module 2 introduces trigonometry — the mathematics of sinusoidal signals, which are the physical form of every clock, wave, and oscillation in hardware.
`);

write(2,'trigonometry','I',1,25,[
  {type:'article',title:'Khan Academy — Trigonometry',url:'https://www.khanacademy.org/math/trigonometry',required:true},
  {type:'book',title:'Principles of Mathematics — Allendoerfer',url:'https://archive.org/details/principlesofmath00alle',description:'Classic treatment with signal applications.'},
],`
# Trigonometry

## Why This Matters

Every clock signal, RF carrier, audio waveform, and power-supply ripple is a sinusoid. Understanding amplitude, frequency, and phase is prerequisite to signal integrity, clock design, and analog circuit analysis.

## Core Concepts

### The Unit Circle

Sine and cosine are coordinates on a unit circle parameterised by angle θ. The key identities:

\`\`\`
sin²θ + cos²θ = 1          (Pythagorean)
sin(A+B) = sinA cosB + cosA sinB
cos(2θ)  = 1 − 2sin²θ
\`\`\`

### Sinusoids and Their Parameters

A general sinusoid: **A · sin(2πft + φ)**

- **A** — amplitude (peak voltage, signal strength)
- **f** — frequency in Hz (cycles per second)
- **φ** — phase offset (timing relationship between two signals)
- **T = 1/f** — period

A 100 MHz CPU clock: f = 10⁸ Hz, T = 10 ns.

### Phase and Timing

Phase difference φ between two signals at the same frequency determines whether they add constructively (φ = 0) or cancel (φ = π). This is the basis of differential signalling (PCIe, USB, HDMI) which cancels common-mode noise.

### Frequency and the Fourier Insight

Any periodic signal can be decomposed into a sum of sinusoids. A square wave (what a digital clock actually is) contains the fundamental frequency plus all odd harmonics: 3f, 5f, 7f, … This is why a 1 GHz digital signal needs analog bandwidth well above 1 GHz to remain a sharp square wave.

## Key Insights

- Every real signal is a sum of sinusoids — Fourier's insight.
- Phase matters as much as amplitude in clocked systems.
- A sharp digital edge requires high-frequency harmonics; bandwidth limits degrade edges.
- 360° = 2π radians; hardware engineers use both.

## What Comes Next

Module 3 extends trigonometry into the complex plane — Euler's formula \`e^{jθ} = cosθ + j sinθ\` unifies sinusoids and complex exponentials, forming the foundation of impedance analysis and signal processing.
`);

write(3,'complex-numbers','I',1,25,[
  {type:'article',title:'Khan Academy — Complex Numbers',url:'https://www.khanacademy.org/math/algebra2/x2ec2f6f830c9fb89:complex',required:true},
  {type:'book',title:'Engineering Mathematics — Stroud',url:'https://www.amazon.com/Engineering-Mathematics-K-Stroud/dp/1137031221',description:'Practical complex numbers for engineers.'},
],`
# Complex Numbers

## Why This Matters

Impedance (how capacitors and inductors resist AC current) is complex-valued. Phase relationships in circuits are rotation in the complex plane. Phasors — the standard tool for AC circuit analysis — are complex numbers.

## Core Concepts

### Definition

A complex number z = a + jb (engineers use j, mathematicians use i to avoid confusion with current).

- **Real part** Re(z) = a
- **Imaginary part** Im(z) = b
- **Magnitude** |z| = √(a² + b²)
- **Phase (argument)** ∠z = arctan(b/a)

### Euler's Formula

**e^{jθ} = cos θ + j sin θ**

This is the single most important identity in electrical engineering. It means:
- A sinusoid A·cos(ωt + φ) is the real part of A·e^{j(ωt+φ)}
- Rotating a phasor by angle φ multiplies it by e^{jφ}

### Phasors

Represent a sinusoidal signal as a complex number (phasor): drop the time dependence and work only with amplitude and phase. Multiplying phasors multiplies magnitudes and adds phases — much simpler than trigonometric identities.

### Impedance

In AC analysis, impedance Z replaces resistance:

\`\`\`
Resistor:    Z_R = R              (real, in-phase)
Capacitor:   Z_C = 1/(jωC)       (imaginary, current leads voltage by 90°)
Inductor:    Z_L = jωL            (imaginary, voltage leads current by 90°)
\`\`\`

Ohm's law generalises: V = I · Z. Now it handles all linear passive components.

## Key Insights

- Complex numbers are a 2D number system where multiplication rotates and scales.
- Euler's formula connects exponentials to sinusoids.
- Impedance is the AC generalisation of resistance — it's always complex.
- Phase is angle in the complex plane.

## What Comes Next

Module 4 introduces calculus, which describes how signals change over time — derivatives of voltage give current through capacitors; integrals of current give charge.
`);

write(4,'calculus','I',1,45,[
  {type:'book',title:'Calculus — James Stewart',url:'https://www.stewartcalculus.com/',description:'Standard university calculus; strong on applications.',required:true},
  {type:'article',title:'3Blue1Brown — Essence of Calculus',url:'https://www.youtube.com/playlist?list=PLZHQObOWTQDMsr9K-rj53DwVRMYO3t5Yr',description:'Outstanding visual intuition series.'},
],`
# Calculus

## Why This Matters

Derivatives and integrals appear throughout systems work: the relationship between charge and current (i = dq/dt), the exponential decay of an RC circuit, the integral formulation of DFT, differential equations governing thermal dissipation, and Big-O analysis of algorithms.

## Core Concepts

### Derivatives — Rate of Change

The derivative df/dx is the instantaneous rate of change of f at x. Key rules:

\`\`\`
d/dx [xⁿ]     = n·xⁿ⁻¹          (power rule)
d/dx [eˣ]     = eˣ               (exponential)
d/dx [ln x]   = 1/x
d/dx [sin x]  = cos x
d/dx [f(g(x))] = f'(g(x))·g'(x)  (chain rule)
\`\`\`

In electronics: if q(t) is charge, then current i(t) = dq/dt.

### Integrals — Accumulation

Integration is the inverse of differentiation. ∫ i(t) dt = q(t) — total charge accumulated.

The RC circuit: when a capacitor charges through a resistor, the voltage follows:
\`\`\`
V(t) = V₀(1 − e^{−t/RC})
\`\`\`
This is the solution to the differential equation C·dV/dt = (V_supply − V)/R.

### Taylor Series

Any smooth function near point a: f(x) ≈ f(a) + f'(a)(x−a) + f''(a)(x−a)²/2! + …

This is how CPUs implement transcendental functions (sin, exp) in hardware, and how linearisation of non-linear circuits works.

### Partial Derivatives and Gradients

For functions of multiple variables, ∂f/∂x treats all other variables as constants. Gradient ∇f = (∂f/∂x, ∂f/∂y, …) points in the direction of steepest increase — used in optimisation (gradient descent for ML on the host CPU).

## Key Insights

- Derivatives describe instantaneous rate of change; integrals accumulate totals.
- Exponential functions e^{at} are eigenfunctions of differentiation — they're their own derivative scaled by a.
- Most hardware transients (RC, RL) are solutions to first-order linear ODEs.
- Taylor series let you approximate complex functions with polynomials.

## What Comes Next

Module 5 extends to vectors and matrices — the mathematics of transformations, which underpins graphics pipelines, SIMD operations, neural network inference, and cache-line representations.
`);

write(5,'linear-algebra','I',1,40,[
  {type:'book',title:'Introduction to Linear Algebra — Gilbert Strang',url:'https://math.mit.edu/~gs/linearalgebra/',description:'The definitive accessible text; free lectures on MIT OCW.',required:true},
  {type:'article',title:'3Blue1Brown — Essence of Linear Algebra',url:'https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab',description:'Best visual introduction available.'},
],`
# Linear Algebra

## Why This Matters

SIMD instructions (SSE, AVX, NEON) operate on vectors. GPU workloads are matrix multiplications. Page tables map virtual address spaces via linear transformations. Compression codecs (DCT in JPEG, wavelet in PNG) are orthogonal transforms. Cache coherence protocols track state vectors.

## Core Concepts

### Vectors and Spaces

A vector in ℝⁿ is an ordered tuple of n real numbers. Vectors represent: points in space, directions, states, feature embeddings. Addition and scalar multiplication follow the parallelogram law.

### Matrix Multiplication

\`\`\`
C = A · B    where C[i][j] = Σₖ A[i][k] · B[k][j]
\`\`\`

Modern CPUs and GPUs are optimised to perform this operation on large matrices. The trick is cache reuse: naïve O(n³) works but misses the cache badly; blocked matrix multiply fits working sets into L1/L2.

### Linear Transformations

Every matrix A encodes a linear transformation: rotation, scaling, shear, projection. A 4×4 homogeneous matrix encodes 3D rotation + translation in one multiply — this is how GPU vertex shaders work.

### Eigenvalues and Eigenvectors

Av = λv — the matrix A applied to vector v just scales it by λ. Eigenanalysis reveals the "natural axes" of a transformation. Used in: principal component analysis (data compression), stability analysis of control systems, Google's PageRank.

### Rank and the Null Space

The rank of a matrix is the dimension of its column space. Full rank = invertible = unique solution. Rank deficiency means some directions are collapsed to zero — a degenerate transform.

## Key Insights

- Matrix-vector multiply is the fundamental operation of modern compute hardware.
- Orthogonal matrices (rotation, reflection) preserve lengths and angles — they're numerically stable.
- Eigenvalues characterise the long-run behaviour of repeated applications of a matrix.
- Sparse matrices (most entries zero) are common in graph problems, finite element methods, and kernel data structures.

## What Comes Next

Module 6 introduces probability — the mathematics of uncertainty, noise, and statistical behaviour of systems under load.
`);

write(6,'probability','I',1,35,[
  {type:'book',title:'Probability and Statistics for Engineers — Walpole',url:'https://www.amazon.com/Probability-Statistics-Engineers-Scientists-9th/dp/0321629116',required:true},
  {type:'article',title:'Introduction to Probability — Blitzstein & Hwang (free PDF)',url:'https://projects.iq.harvard.edu/stat110/strategic-practice-problems'},
],`
# Probability

## Why This Matters

CPU branch prediction is a probabilistic model. Cache miss rates are probabilities. Network packet loss and queueing delays follow probability distributions. Reliability analysis (MTBF, failure rates) is applied probability. Hardware thermal noise is modelled as a random variable.

## Core Concepts

### Random Variables and Distributions

A random variable X maps outcomes to real numbers. Key distributions in systems:

- **Bernoulli(p)** — single yes/no event (packet arrives/lost)
- **Geometric(p)** — number of trials until first success (retry count)
- **Poisson(λ)** — count of events in fixed time (interrupts/second)
- **Exponential(λ)** — time between events (inter-arrival time)
- **Normal(μ,σ)** — continuous measurement noise, thermal variation

### Expectation and Variance

E[X] = Σ x·P(X=x) — the probability-weighted average.

Var[X] = E[(X − E[X])²] = E[X²] − (E[X])²

Standard deviation σ = √Var[X] is in the same units as X.

### Conditional Probability and Bayes

P(A|B) = P(A ∩ B) / P(B)

**Bayes' theorem:** P(A|B) = P(B|A)·P(A) / P(B)

Application: spam filters, intrusion detection systems, branch predictors that maintain a probability of "branch taken" conditioned on recent history.

### Independence and Correlation

Events A,B are independent if P(A ∩ B) = P(A)·P(B). Correlated failures (e.g., multiple disks in the same RAID enclosure failing together) violate independence and make redundancy less effective than calculated.

## Key Insights

- Most real system metrics are random variables with distributions, not deterministic values.
- The expected value tells you the average; variance tells you how unpredictable it is.
- Tail probabilities (P(X > 99th percentile)) matter more than means for latency SLOs.
- Independence assumptions are often wrong in practice — correlated failures dominate.

## What Comes Next

Module 7 covers statistics — how to estimate these distributions from measured data, and how to tell if a performance change is real or noise.
`);

write(7,'statistics','I',1,30,[
  {type:'book',title:'Statistics — Freedman, Pisani, Purves',url:'https://www.amazon.com/Statistics-4th-David-Freedman/dp/0393929728',description:'Conceptual depth without heavy formulas.',required:true},
  {type:'article',title:'Brendan Gregg — The USE Method',url:'https://www.brendangregg.com/usemethod.html',description:'Statistics applied directly to performance analysis.'},
],`
# Statistics

## Why This Matters

When you benchmark a kernel patch, statistics tells you whether the measured speedup is real or measurement noise. When you analyse latency distributions, statistics gives you the tools to characterise tails, compare populations, and detect regressions.

## Core Concepts

### Estimation

Given a sample {x₁, …, xₙ} from an unknown population:
- **Sample mean** x̄ = (Σxᵢ)/n — estimates E[X]
- **Sample variance** s² = Σ(xᵢ − x̄)² / (n−1) — estimates Var[X]
- **Standard error** SE = s/√n — how uncertain is x̄?

### Confidence Intervals

A 95% confidence interval: x̄ ± 1.96·SE. If you repeated the experiment 100 times, ~95 of the intervals would contain the true mean. This is not "95% probability the true mean is in this interval" — the frequentist interpretation is subtle.

### Hypothesis Testing

Is the observed difference between two systems real? Null hypothesis H₀: no difference. Compute a p-value: the probability of observing a difference this large if H₀ is true. Common threshold: p < 0.05.

\`\`\`python
from scipy import stats
a = [10.2, 9.8, 10.5, 9.9, 10.1]  # system A latencies
b = [9.1, 8.9, 9.3, 9.0, 9.2]     # system B latencies
t, p = stats.ttest_ind(a, b)
print(f"p={p:.4f}")  # p < 0.05 suggests real difference
\`\`\`

### Percentiles and Latency Distributions

For latency, the mean is often misleading. Report:
- p50 (median), p95, p99, p99.9 ("four nines")

A system with p50=1ms and p99.9=10s is not a "1ms system" for users at the tail.

### Regression

Linear regression fits a line y = ax + b to data. Used to model how latency scales with load, how temperature correlates with failure rate.

## Key Insights

- Always report variance and percentiles, never just the mean.
- Statistical significance ≠ practical significance; a 0.1% speedup that's statistically significant may not matter.
- Warmup effects, measurement interference, and system jitter are the enemy of repeatable benchmarks.
- Latency tails (p99+) determine user experience; they're driven by outlier events (GC pauses, context switches, thermal throttling).

## What Comes Next

Module 8 covers discrete mathematics — the foundation of algorithm analysis, data structures, and the combinatorial problems that appear throughout compilers and operating systems.
`);

write(8,'discrete-mathematics','I',1,40,[
  {type:'book',title:'Discrete Mathematics and Its Applications — Rosen',url:'https://www.mheducation.com/highered/product/discrete-mathematics-applications-rosen/M9781259676512.html',description:'Standard university text; excellent breadth.',required:true},
  {type:'book',title:'How to Prove It — Velleman',url:'https://www.amazon.com/How-Prove-Structured-Approach-2nd/dp/0521675995',description:'Proof techniques.'},
],`
# Discrete Mathematics

## Why This Matters

Algorithm complexity (O(n log n) sort, O(1) hash lookup) is discrete math. Kernel data structures — red-black trees, skip lists, hash tables — are discrete structures with provable properties. Scheduling decisions, memory allocation algorithms, and file system b-trees are all analysed with discrete mathematical tools.

## Core Concepts

### Logic and Proofs

Propositional logic: AND (∧), OR (∨), NOT (¬), implication (→), biconditional (↔). De Morgan: ¬(A ∧ B) ≡ ¬A ∨ ¬B.

Proof techniques: direct proof, proof by contradiction, proof by induction.

### Induction

To prove P(n) for all n ≥ 1: (1) prove P(1), (2) prove P(k) → P(k+1). Induction is how you prove that a recursive algorithm terminates and is correct.

### Sets, Relations, Functions

A function f: A → B assigns each element of A exactly one element of B. Injective (one-to-one), surjective (onto), bijective (both). Bijections have inverses — relevant to invertible cryptographic operations.

### Graphs

G = (V, E) — vertices and edges. Properties:
- **Degree** — number of edges per vertex
- **Path** — sequence of adjacent vertices
- **Cycle** — path that returns to start
- **Tree** — connected, acyclic graph; n vertices, n−1 edges

The Linux kernel's dependency graph (modules, locks, memory dependencies) is a directed graph; cycles indicate deadlocks.

### Combinatorics

Counting arguments appear in cache analysis (how many ways to map n addresses to k sets?), cryptographic key space analysis (2²⁵⁶ possible keys), and probability calculations.

## Key Insights

- Big-O notation is a formal statement about function dominance as n→∞.
- Trees are the most common data structure in kernel code (VFS, scheduler, memory manager all use red-black trees).
- Boolean logic is implemented directly in hardware: AND/OR/NOT are physical gates.
- Hash functions give expected O(1) lookup by spreading keys uniformly.

## What Comes Next

Module 9 introduces information theory — Shannon's framework for quantifying information, which underpins compression, error correction, and the fundamental limits of communication channels.
`);

write(9,'information-theory','I',1,30,[
  {type:'book',title:'Elements of Information Theory — Cover & Thomas',url:'https://www.amazon.com/Elements-Information-Theory-Telecommunications-Processing/dp/0471241954',description:'The definitive reference.',required:true},
  {type:'article',title:'A Mathematical Theory of Communication — Shannon (original 1948)',url:'https://people.math.harvard.edu/~ctm/home/text/others/shannon/entropy/entropy.pdf'},
],`
# Information Theory

## Why This Matters

gzip, zstd, lz4 compression; ECC memory; CRCs and checksums; entropy-based password strength; HTTPS key sizes — all are applications of information theory. Understanding entropy tells you the fundamental limits of what compression can achieve.

## Core Concepts

### Entropy

Shannon entropy H(X) = −Σ p(x) log₂ p(x) — measured in bits.

Intuition: H = 0 means the outcome is certain (no information). H = log₂ n means n equally likely outcomes (maximum uncertainty). A fair coin has H = 1 bit. A biased coin with p=0.9 has H ≈ 0.47 bits.

\`\`\`python
import math
def entropy(probs):
    return -sum(p * math.log2(p) for p in probs if p > 0)

print(entropy([0.5, 0.5]))      # 1.0 bit — fair coin
print(entropy([0.9, 0.1]))      # 0.469 bits — biased coin
print(entropy([0.25]*4))        # 2.0 bits — uniform 4-outcome
\`\`\`

### Source Coding (Compression)

Shannon's source coding theorem: the minimum average code length for a source with entropy H is H bits/symbol. You cannot compress below entropy. Huffman coding achieves the optimum for symbol-by-symbol coding.

### Channel Capacity

A noisy channel can reliably transmit at most C bits/second, where C = B · log₂(1 + SNR) (Shannon-Hartley). B is bandwidth in Hz, SNR is signal-to-noise ratio. This is why better SNR and wider bandwidth both increase network throughput.

### Coding and Error Correction

Redundancy (adding bits beyond the information content) buys error detection and correction. ECC RAM adds parity bits; RAID 6 uses Reed-Solomon codes; TCP uses 16-bit CRC checksums. All trade storage/bandwidth for reliability.

## Key Insights

- Entropy is the fundamental limit of lossless compression.
- High-entropy data (random/encrypted) cannot be compressed.
- Error correction trades redundancy for reliability — always a spectrum.
- Strong encryption should produce output indistinguishable from maximum entropy.

## What Comes Next

Module 10 covers optimisation — the mathematics of finding minima and maxima, which appears in scheduler objective functions, compiler transformations, and ML inference on the CPU.
`);

write(10,'optimization','I',1,25,[
  {type:'book',title:'Convex Optimization — Boyd & Vandenberghe (free PDF)',url:'https://web.stanford.edu/~boyd/cvxbook/',description:'The authoritative text; Chapter 1 is accessible.',required:true},
],`
# Optimization

## Why This Matters

CPU frequency governors minimise power under a performance constraint. Compiler register allocation is a graph-colouring optimisation. Memory allocators minimise fragmentation. Neural network training is gradient descent optimisation. Storage systems schedule I/O to minimise seek time.

## Core Concepts

### Objective Functions and Constraints

An optimisation problem: minimise f(x) subject to constraints gᵢ(x) ≤ 0.

- **Objective** f(x): what you want to minimise (latency, energy, time)
- **Decision variables** x: what you can control (frequency, scheduling order, buffer sizes)
- **Constraints**: physical limits (max power, memory capacity, time budget)

### Convexity

A function f is convex if f(λx + (1−λ)y) ≤ λf(x) + (1−λ)f(y). Convex functions have a unique global minimum — any local minimum is the global minimum. This is the property that makes gradient descent reliable.

### Gradient Descent

\`\`\`
x_{k+1} = x_k − α ∇f(x_k)
\`\`\`

Move in the direction opposite the gradient (steepest descent) by step size α. Terminates at a local minimum where ∇f = 0. Used everywhere from ML training to parameter tuning.

### Dynamic Programming

Break a complex problem into overlapping subproblems; solve each once and store results (memoisation). Example: shortest path (Dijkstra/Bellman-Ford), optimal I/O scheduling, minimum-cost register allocation.

### Greedy Algorithms

Make locally optimal choices. Often suboptimal globally but fast and practical. Example: Least Recently Used (LRU) cache eviction is a greedy approximation of the optimal OPT policy.

## Key Insights

- Convex optimisation has efficient, reliable algorithms; non-convex problems are generally hard.
- Most real system optimisation problems are non-convex — approximations and heuristics dominate.
- Lagrange multipliers handle constrained optimisation by penalising constraint violation.
- Trading one resource for another (latency vs. throughput, memory vs. compute) is an optimisation problem.

## What Comes Next

Module 11 introduces numerical methods — how computers compute approximate answers to continuous problems, and why floating-point arithmetic introduces subtle errors.
`);

write(11,'numerical-methods','I',1,25,[
  {type:'book',title:'Numerical Recipes in C — Press et al.',url:'http://numerical.recipes/',description:'Practical algorithms with C implementations.',required:true},
],`
# Numerical Methods

## Why This Matters

IEEE 754 floating-point is the numerical substrate of every \`float\` and \`double\` in C. Floating-point errors accumulate in DSP pipelines, physics simulations, and ML inference. Numerical stability determines whether an iterative algorithm converges or diverges. The Linux kernel itself uses fixed-point arithmetic in several places to avoid FP in interrupt context.

## Core Concepts

### Floating-Point Representation

IEEE 754 double: 1 sign bit, 11 exponent bits, 52 mantissa bits.

\`\`\`c
// These are NOT equal
double a = 0.1 + 0.2;
double b = 0.3;
printf("%d\\n", a == b);   // prints 0 — FALSE!
printf("%.17f\\n", a);     // 0.30000000000000004
\`\`\`

The representable values are not uniformly spaced — density is highest near zero. Large integers lose precision: a double can only represent integers exactly up to 2⁵³.

### Approximation and Error

Absolute error |x_approx − x_true|. Relative error |x_approx − x_true| / |x_true|. Relative error is usually more meaningful.

Floating-point operations introduce rounding error at each step. Summation of many values: Kahan compensated summation minimises accumulated error.

### Iterative Methods

Newton-Raphson root finding: x_{n+1} = xₙ − f(xₙ)/f'(xₙ). Converges quadratically (error squares each iteration) for well-behaved functions. Used in hardware reciprocal and square-root instructions.

### Numerical Stability

An algorithm is numerically stable if small input perturbations produce small output changes. Gaussian elimination without pivoting is unstable; with partial pivoting it's stable. Choosing stable algorithms matters for correctness in production code.

## Key Insights

- Never compare floating-point numbers with ==; use |a−b| < ε.
- Catastrophic cancellation occurs when two nearly equal numbers are subtracted — significant digits are lost.
- Integer arithmetic in the kernel is exact; float arithmetic in user space is approximate.
- Fixed-point arithmetic (integers with an implicit decimal) gives exact results and is used in audio DSP and kernel timing.

## What Comes Next

Module 12 introduces queueing theory — the mathematics of waiting lines, which directly models CPU scheduler queues, network packet queues, and I/O request queues.
`);

write(12,'queueing-theory','I',1,30,[
  {type:'book',title:'Queueing Systems Vol. 1 — Kleinrock',url:'https://www.amazon.com/Queueing-Systems-Computer-Applications-Vol/dp/0471491101',description:'The classic text; Volume 1 covers theory.',required:true},
  {type:'article',title:'Performance Analysis of Computer Systems — Lazowska et al. (free)',url:'https://www.cs.washington.edu/homes/lazowska/qsp/'},
],`
# Queueing Theory

## Why This Matters

Every resource in a computer system — CPU, disk, network interface, memory bus — is a server with a queue. Queueing theory predicts latency, throughput, and utilisation from first principles. It explains why a CPU at 90% utilisation has dramatically higher latency than one at 50%, and why adding a second CPU core helps even if the first isn't full.

## Core Concepts

### The M/M/1 Queue

The simplest useful model: Poisson arrivals (rate λ), exponential service times (mean 1/μ), single server.

- **Utilisation** ρ = λ/μ (must be < 1 for stability)
- **Mean queue length** E[N] = ρ / (1−ρ)
- **Mean latency** E[T] = (1/μ) / (1−ρ)

At ρ = 0.5: E[T] = 2 × service time. At ρ = 0.9: E[T] = 10 × service time.

\`\`\`python
def mm1_latency(arrival_rate, service_rate):
    rho = arrival_rate / service_rate
    if rho >= 1: return float('inf')
    mean_service = 1 / service_rate
    return mean_service / (1 - rho)

print(mm1_latency(9, 10))   # ρ=0.9 → 1.0s at 0.1s service time
print(mm1_latency(5, 10))   # ρ=0.5 → 0.2s at 0.1s service time
\`\`\`

### Little's Law

**N = λ · T** — the average number of items in a system equals arrival rate times average time in system. This law holds for any stable queueing system regardless of distributions. If you measure λ and T, you know N.

### The Knee of the Utilisation Curve

Latency is approximately flat until ρ ≈ 0.7, then rises sharply. This is why performance engineers target 60–70% utilisation for predictable latency, not 100%.

### Multi-Server Queues (M/M/c)

c parallel servers each with rate μ. Adding servers reduces latency superlinearly when ρ is high — the second server has a disproportionate impact.

## Key Insights

- Latency explodes as utilisation approaches 100% — this is universal, not a bug.
- Little's Law connects throughput, latency, and concurrency without any distributional assumptions.
- Variance in service time worsens latency — a bimodal service distribution is worse than a uniform one with the same mean.
- Queues are everywhere: NIC receive ring, block device request queue, CPU run queue, kernel workqueues.

## What Comes Next

Module 13 covers graph theory — the study of networks and connectivity, which models routing tables, memory dependency graphs, lock hierarchies, and the Linux device tree.
`);

write(13,'graph-theory','I',1,25,[
  {type:'book',title:'Introduction to Algorithms (CLRS) — Chapters 22–26',url:'https://mitpress.mit.edu/books/introduction-algorithms-third-edition',description:'Definitive algorithms text; graph chapters are excellent.',required:true},
],`
# Graph Theory

## Why This Matters

The Linux kernel's lock dependency checker (lockdep) maintains a directed graph of lock acquisition orders and detects potential deadlocks by looking for cycles. IP routing is shortest-path computation on a graph. The Linux device tree is a graph. File system directory hierarchies are trees (acyclic graphs). Package dependency resolution is graph reachability.

## Core Concepts

### Graph Representations

**Adjacency matrix**: O(V²) space, O(1) edge lookup. Good for dense graphs.
**Adjacency list**: O(V+E) space, O(degree) iteration. Good for sparse graphs (most real graphs).

\`\`\`c
// Typical kernel adjacency list: lock dependency graph
struct lock_class {
    struct list_head locks_after;   // directed edges to dependent locks
    struct list_head locks_before;
};
\`\`\`

### Traversal: BFS and DFS

**BFS** (breadth-first): visits nodes level by level; finds shortest paths in unweighted graphs. O(V+E).
**DFS** (depth-first): goes deep before backtracking; detects cycles; computes topological order. O(V+E).

Lockdep uses DFS to detect cycles in the lock dependency graph.

### Shortest Paths

**Dijkstra** (non-negative weights): O((V+E) log V) with a priority queue. Used in IP routing daemons (OSPF).
**Bellman-Ford** (negative weights allowed): O(VE). Detects negative cycles. Used in BGP.

### Minimum Spanning Trees

**Kruskal / Prim**: connect all vertices with minimum total edge weight. Used in network topology design, clustering.

### Topological Sort

For a DAG (directed acyclic graph): order vertices such that all edges point forward. Used in: build systems (Make/CMake), software package install ordering, scheduling dependent tasks.

## Key Insights

- Cycles in a directed graph are almost always a problem (deadlock, circular dependency).
- Most real-world graphs are sparse — adjacency lists dominate.
- BFS finds shortest unweighted paths; Dijkstra finds shortest weighted paths.
- Trees are just connected acyclic graphs — a special case of general graphs.

## What Comes Next

Module 14 introduces formal languages and automata — the theoretical foundation of compilers, regular expressions, and the kernel's BPF verifier.
`);

write(14,'formal-languages-and-automata-math','I',1,30,[
  {type:'book',title:'Introduction to the Theory of Computation — Sipser',url:'https://www.amazon.com/Introduction-Theory-Computation-Michael-Sipser/dp/113318779X',description:'The most readable theory of computation text.',required:true},
],`
# Formal Languages and Automata

## Why This Matters

Regular expressions (grep, sed, kernel packet filters) are implemented by finite automata. The BPF verifier uses abstract interpretation (a form of formal analysis) to prove programs terminate safely. Compilers use context-free grammars and pushdown automata to parse source code. Understanding these foundations clarifies why some patterns are O(n) and others are exponential.

## Core Concepts

### Regular Languages and Finite Automata

A finite automaton (FA) has states, transitions, a start state, and accepting states. It reads input one symbol at a time and accepts if it ends in an accepting state.

Regular expressions compile to NFAs (nondeterministic FA) via Thompson's construction, then to DFAs (deterministic) via subset construction. DFAs run in O(n) time on input of length n — this is why grep is fast.

Backtracking regex engines (Python re, Perl) can be exponential for certain patterns — the "catastrophic backtracking" problem.

### Context-Free Languages and Pushdown Automata

A pushdown automaton is an FA + a stack. It can match nested structures: parentheses, XML tags, C function calls. Programming language syntax is context-free. Parsers (recursive descent, LR) are pushdown automata implementations.

### Chomsky Hierarchy

Regular ⊂ Context-Free ⊂ Context-Sensitive ⊂ Recursively Enumerable

- **Regular**: finite automaton, O(n) recognition
- **Context-free**: pushdown automaton, O(n³) recognition (usually O(n) for unambiguous grammars)
- **Recursively enumerable**: Turing machine

### Computability

The halting problem is undecidable — no program can determine if an arbitrary program halts. The BPF verifier sidesteps this by only accepting programs that can be proven to terminate (no backwards jumps in classic BPF).

## Key Insights

- Regular expressions are powerful but limited — they cannot match nested structures.
- DFA-based regex is O(n) and cannot be exploited for ReDoS; backtracking engines can.
- Parsing is automata theory made practical — every compiler has a lexer (FA) and parser (PDA).
- The BPF verifier applies formal methods to ensure kernel programs are safe.

## What Comes Next

Module 15 covers logic and formal methods — propositional and predicate logic, SAT solvers, and model checking, which are increasingly used to verify hardware and kernel correctness.
`);

write(15,'logic-and-formal-methods','I',1,25,[
  {type:'book',title:'Logic in Computer Science — Huth & Ryan',url:'https://www.amazon.com/Logic-Computer-Science-Modelling-Reasoning/dp/052154310X',description:'Accessible introduction from a CS perspective.',required:true},
],`
# Logic and Formal Methods

## Why This Matters

SAT solvers verify hardware correctness before tape-out. Model checkers find concurrency bugs in protocols. The Linux kernel's memory model is formally specified in LKMM (Linux Kernel Memory Model) and verified with herd7 and CBMC. SMT solvers power symbolic execution tools used in kernel security research.

## Core Concepts

### Propositional Logic

Variables (true/false) combined with AND, OR, NOT, →, ↔. A formula is satisfiable if some assignment makes it true. SAT (Boolean satisfiability) is NP-complete but modern solvers handle millions of variables in practice.

DPLL algorithm: the basis of all modern SAT solvers — unit propagation + backtracking search.

### Predicate Logic (First-Order Logic)

Extends propositional logic with: variables ranging over domains, quantifiers ∀ (for all), ∃ (there exists), and predicates. Expressive enough to state "every process that acquires lock A before lock B will never deadlock with a process that acquires B before A."

### Temporal Logic

Expresses properties over time:
- **LTL** (Linear Temporal Logic): □ (always), ◇ (eventually), ○ (next)
- **CTL**: properties over computation trees (branching time)

Example: □(requested → ◇granted) — "every request is eventually granted."

### Model Checking

Exhaustively verify that a finite-state model satisfies a temporal logic specification. Tools: SPIN (for protocols), NuSMV (for hardware), CBMC (for C code bounded model checking).

The LKMM formalises the Linux memory model; herd7 model-checks small litmus tests to verify that memory ordering guarantees hold on specific architectures.

## Key Insights

- Formal verification finds bugs that testing misses — especially concurrency bugs.
- SAT/SMT solvers are now fast enough for practical use in synthesis and verification.
- The C memory model (and Linux kernel memory model) is formally specified — informal reasoning about memory ordering is often wrong.
- Security researchers use symbolic execution (angr, KLEE) to find kernel vulnerabilities formally.

## What Comes Next

Module 16 begins Part II — moving from mathematics to the physical world. Classical mechanics introduces force, energy, and thermal motion, which set the physical constraints on all computing hardware.
`);

// ─── SUPERMODULE 2 — Physics and Chemistry of Computing ─────────────────────

write(16,'classical-mechanics-basics','II',2,25,[
  {type:'book',title:'University Physics — Young & Freedman',url:'https://www.pearson.com/en-us/subject-catalog/p/university-physics/P200000006795',description:'Standard university physics; Chapters 1–8.',required:true},
],`
# Classical Mechanics Basics

## Why This Matters

Mechanical vibration causes hard drive head crashes and PCB resonance failures. Thermal expansion stresses solder joints and IC packages. Momentum and energy conservation govern heat dissipation. Understanding basic mechanics contextualises why cooling matters and how mechanical reliability constrains system design.

## Core Concepts

### Force, Mass, Acceleration

Newton's second law: F = ma. A hard drive read head is positioned by a voice coil actuator — a current through the coil in a magnetic field produces force (F = BIL), moving the head with acceleration a = F/m.

### Energy and Power

Kinetic energy: KE = ½mv². Potential energy (gravitational): PE = mgh. Power P = dE/dt = F·v.

A CPU dissipating 150 W converts 150 joules of electrical energy into heat every second. Cooling must remove this energy or the temperature rises until thermal throttling or failure.

### Vibrations and Resonance

A mass-spring system oscillates at f₀ = (1/2π)√(k/m). At resonance, small periodic forces produce large oscillations — destructive for hard drives (seek vibration from adjacent drives), PCBs (mechanical shock), and cooling fans (bearing wear).

### Thermal Motion

At temperature T (Kelvin), particles have average kinetic energy ½mv² = (3/2)k_B T where k_B = 1.38×10⁻²³ J/K. This thermal energy causes resistance (phonon scattering), Johnson-Nyquist noise, and the random diffusion that sets impurity profiles during chip fabrication.

## Key Insights

- Power = energy/time; a 150 W CPU is a 150 W heater — the cooling system must remove exactly this much energy.
- Resonance can destroy mechanical components; hard drive vendors specify vibration specs for this reason.
- Thermal energy at room temperature (~26 meV) is small but significant at the transistor level.
- Differential thermal expansion between materials causes fatigue and cracking over time.

## What Comes Next

Module 17 covers electromagnetism — the theory underlying every wire, magnetic storage device, transformer, and wireless link.
`);

write(17,'electromagnetism','II',2,40,[
  {type:'book',title:'Introduction to Electrodynamics — Griffiths',url:'https://www.amazon.com/Introduction-Electrodynamics-David-J-Griffiths/dp/1108420419',description:'The best undergraduate EM text.',required:true},
  {type:'book',title:'The Art of Electronics — Horowitz & Hill, Ch. 1',url:'https://artofelectronics.net/',description:'Practical EM for engineers.'},
],`
# Electromagnetism

## Why This Matters

Every wire, inductor, capacitor, transformer, antenna, and magnetic storage device operates on electromagnetic principles. Signal integrity problems (reflections, crosstalk, EMI) are EM phenomena. PCIe differential pairs, DRAM traces, and USB cables are all transmission lines governed by Maxwell's equations.

## Core Concepts

### Electric Fields and Potential

A charge q creates an electric field E = kq/r² (Coulomb's law). The potential difference V between two points is the work done moving a unit charge. V = IR (Ohm's law in field terms: J = σE).

### Magnetic Fields and Induction

A moving charge creates a magnetic field B. A changing magnetic flux through a loop induces an EMF (Faraday's law): V = −dΦ/dt. This is how transformers, inductors, and hard drive read heads work.

### Maxwell's Equations (conceptual)

Four equations that unify all of classical electromagnetism:
1. ∇·E = ρ/ε₀ — charges create E fields
2. ∇·B = 0 — no magnetic monopoles
3. ∇×E = −∂B/∂t — changing B creates E
4. ∇×B = μ₀(J + ε₀∂E/∂t) — currents and changing E create B

Equations 3 and 4 together imply electromagnetic waves propagating at c = 1/√(ε₀μ₀) ≈ 3×10⁸ m/s.

### Electromagnetic Waves

Light, radio, WiFi, and 5G are all EM waves. Frequency f and wavelength λ: c = fλ. A 2.4 GHz WiFi signal has λ = 12.5 cm. PCIe Gen 5 at 32 GT/s has signal transitions at multi-GHz rates — the PCB trace is effectively an antenna at these frequencies.

## Key Insights

- Changing E fields produce B fields and vice versa — the basis of all radiation and induction.
- At high frequencies, every wire is an antenna and every loop is an inductor.
- Faraday cages (grounded metal enclosures) shield against external E fields — used in data centres.
- The speed of signal propagation in a PCB trace is ~60% of the speed of light.

## What Comes Next

Module 18 covers thermodynamics — how energy flows as heat, how entropy governs what's possible, and why cooling is a fundamental constraint on computing density.
`);

write(18,'thermodynamics','II',2,30,[
  {type:'book',title:'Fundamentals of Engineering Thermodynamics — Moran et al.',url:'https://www.wiley.com/en-us/Fundamentals+of+Engineering+Thermodynamics%2C+8th+Edition-p-9781118412930',required:true},
  {type:'article',title:'Thermal Design Guide — Intel',url:'https://www.intel.com/content/www/us/en/developer/articles/technical/thermal-design-guide.html'},
],`
# Thermodynamics

## Why This Matters

TDP (Thermal Design Power) is a thermodynamic specification. CPU thermal throttling is governed by thermodynamic limits. Data centre cooling accounts for ~40% of operating cost. Landauer's principle connects information erasure to heat generation, setting a theoretical minimum energy per bit operation.

## Core Concepts

### Temperature and Heat

Temperature measures average thermal kinetic energy. Heat Q is energy transferred due to a temperature difference. Heat flows spontaneously from hot to cold (2nd Law).

Specific heat capacity c: Q = mcΔT. Silicon has c ≈ 700 J/(kg·K). A 5g CPU die with 150 W input, no cooling, would rise at dT/dt = P/(mc) = 150/(0.005×700) ≈ 43 K/s.

### Thermal Resistance

Analogous to electrical resistance: ΔT = P · θ_JA (junction-to-ambient thermal resistance in °C/W). A CPU with θ_JA = 0.3 °C/W dissipating 150 W: ΔT = 45°C above ambient. If ambient is 25°C, junction temperature is 70°C — within spec for most CPUs (T_max ≈ 100°C).

### Entropy and the Second Law

Entropy S measures disorder. ΔS ≥ 0 for any spontaneous process. You cannot convert heat entirely into work without a cold reservoir — hence no 100%-efficient heat engine.

Landauer's limit: erasing one bit at temperature T dissipates at minimum k_B T ln(2) ≈ 2.8×10⁻²¹ J at 300K. Actual CMOS logic dissipates ~10⁻¹⁵ J/switch — 10⁶× above the Landauer limit, leaving enormous room for efficiency improvement.

### Phase Changes and Cooling

Heat pipes exploit latent heat of vaporisation — water absorbs ~2260 J/g evaporating, carrying heat from hot spot to cold spot with minimal temperature gradient. This is why modern CPU coolers use copper heat pipes filled with water.

## Key Insights

- Power dissipation = heat generation; every watt must be actively removed.
- Thermal resistance is the circuit-equivalent model for heat flow.
- Higher temperatures increase electron-phonon scattering → higher resistance → more heat (positive feedback that causes thermal runaway).
- Fanless/passive cooling is limited by natural convection; forced air is ~10× more effective.

## What Comes Next

Module 19 introduces statistical mechanics — the bridge between microscopic thermal physics and macroscopic material behaviour.
`);

write(19,'statistical-mechanics-intuition','II',2,25,[
  {type:'book',title:'Statistical Mechanics — Kittel & Kroemer',url:'https://www.amazon.com/Thermal-Physics-Charles-Kittel/dp/0716710889',description:'Accessible statistical mechanics.',required:true},
],`
# Statistical Mechanics Intuition

## Why This Matters

Why does a conductor have free electrons? Why does a semiconductor change resistance with temperature? Why does dopant concentration follow a Boltzmann distribution? These are statistical mechanics questions. The answers determine transistor operation, which determines every circuit in every chip.

## Core Concepts

### The Boltzmann Distribution

The probability of a system being in a state with energy E at temperature T: P(E) ∝ e^{−E/(k_B T)}.

The Boltzmann factor e^{−E/(k_B T)} is the most important formula in solid-state physics. At low T, only low-energy states are occupied. As T rises, higher-energy states become accessible.

Application: the number of electrons thermally excited across a semiconductor bandgap E_g follows e^{−E_g/(k_B T)}. For silicon, E_g = 1.12 eV, k_B T at 300K = 0.026 eV, so only ~1 in 10^{18} electrons are excited — pure silicon is nearly an insulator.

### Fermi-Dirac Distribution

For electrons (fermions, obeying Pauli exclusion): the probability of an energy state E being occupied: f(E) = 1 / (1 + e^{(E−E_F)/(k_B T)}).

E_F is the Fermi energy — the energy at which f = 0.5. In metals, E_F is in the middle of the conduction band; in semiconductors, it's in the bandgap.

### Density of States

Not all energies have the same number of available states. The density of states g(E) tells how many quantum states exist per unit energy. The product g(E)·f(E) gives the actual electron density at energy E.

### Macroscopic Emergence

Temperature, pressure, conductivity — these are averages over ~10²³ microscopic states. Statistical mechanics shows why these averages are extraordinarily precise (fluctuations scale as 1/√N).

## Key Insights

- The Boltzmann factor e^{−E/kT} governs thermally activated processes: diffusion, chemical reactions, electron excitation.
- The Fermi energy separates filled from empty states at T=0; temperature smears this boundary.
- Doping a semiconductor moves E_F — this is how p-type and n-type semiconductors are created.
- Statistical fluctuations are negligible at macroscopic scales but become important at the nanometer scale of modern transistors.

## What Comes Next

Module 20 covers atomic physics — the quantised energy levels of electrons in atoms, which directly determine chemical bonding and therefore material properties.
`);

write(20,'atomic-physics','II',2,25,[
  {type:'book',title:'Introductory Quantum Mechanics — Liboff',url:'https://www.amazon.com/Introductory-Quantum-Mechanics-Richard-Liboff/dp/0805387145',description:'Accessible, physics-focused.',required:true},
],`
# Atomic Physics

## Why This Matters

The electronic structure of silicon atoms — specifically the 4 valence electrons in sp³ hybrid orbitals — is why silicon forms a diamond cubic crystal and has a band gap suitable for transistors. Dopant atoms (phosphorus, boron) provide extra carriers because of their atomic structure. X-ray lithography wavelengths are chosen based on atomic absorption edges.

## Core Concepts

### Quantum Numbers

Each electron in an atom is described by four quantum numbers:
- **n** (principal): energy level (shell 1, 2, 3, …)
- **l** (azimuthal): orbital shape (s, p, d, f)
- **m_l** (magnetic): orientation
- **m_s** (spin): +½ or −½

**Pauli exclusion principle**: no two electrons can have the same four quantum numbers. This is why electrons fill orbitals in order (Aufbau principle) rather than all collapsing to n=1.

### Electron Configuration

Silicon: 1s² 2s² 2p⁶ 3s² 3p² — 4 valence electrons in the outer shell. Phosphorus: 1s² 2s² 2p⁶ 3s² 3p³ — 5 valence electrons (donor in silicon). Boron: 5 electrons, 3 in outer shell (acceptor).

### Energy Levels and Photons

Electrons transition between energy levels by absorbing or emitting photons: E = hf = hc/λ.

LEDs emit photons when electrons drop from conduction band to valence band. Photodetectors absorb photons and generate electron-hole pairs. The wavelength of EUV lithography (13.5 nm) is chosen to match silicon's opacity.

### Ionisation Energy

Energy required to remove an electron completely. For silicon, first ionisation: 8.15 eV. Ionising radiation (cosmic rays, alpha particles) can knock electrons free in silicon, causing single-event upsets in memory — a real reliability concern in space systems and at altitude.

## Key Insights

- Atomic structure determines valence, bonding, and therefore material properties.
- The 4 valence electrons of silicon enable covalent bonding in 4 directions — perfect for a crystal lattice.
- Dopant atoms work because they have one more or one fewer valence electron than silicon.
- Pauli exclusion is why matter is rigid and why electron states in a crystal form bands.

## What Comes Next

Module 21 introduces quantum mechanics foundations — the wave-particle duality, wavefunctions, and tunnelling that govern transistor scaling limits.
`);

write(21,'quantum-mechanics-foundations','II',2,30,[
  {type:'book',title:'Quantum Mechanics — Griffiths (Introduction)',url:'https://www.cambridge.org/highereducation/books/introduction-to-quantum-mechanics/990799CA07A83FC5312402AF6860311E',description:'Most accessible QM text for engineers.',required:true},
],`
# Quantum Mechanics Foundations

## Why This Matters

Quantum tunnelling limits how thin a gate oxide can be — below ~1 nm, electrons tunnel through it and the transistor leaks badly. This sets a fundamental physical limit on CMOS scaling. Quantum confinement changes the band structure of nanometer-scale devices. Tunnelling FETs (TFETs) and quantum dots exploit quantum effects intentionally.

## Core Concepts

### Wave-Particle Duality

Electrons behave as both particles and waves. The de Broglie wavelength: λ = h/p. For an electron in a crystal, λ ~ 1–10 nm — comparable to modern transistor gate lengths.

### The Wavefunction

Ψ(x,t) describes the quantum state. |Ψ|² is the probability density of finding the particle at position x. The Schrödinger equation governs its evolution:

iℏ ∂Ψ/∂t = −(ℏ²/2m)∂²Ψ/∂x² + V(x)Ψ

### Tunnelling

A particle can penetrate a potential barrier even with energy below the barrier height. Transmission probability T ∝ e^{−2κd} where κ = √(2m(V₀−E))/ℏ and d is barrier width.

For a 1 nm SiO₂ gate oxide: tunnelling current is ~1 A/cm² — significant. Intel's introduction of high-k dielectrics (hafnium oxide) in 2007 allowed thicker physical oxides with equivalent electrical thickness, reducing tunnelling leakage.

### Energy Quantisation

In confined geometries (quantum well, quantum wire, quantum dot), only discrete energy levels exist. A quantum dot confines electrons in all three dimensions — energy levels are fully quantised. The discrete energy spacing ΔE ∝ 1/L² (where L is confinement length).

### Pauli Exclusion and Bands

Electrons in a crystal see a periodic potential → Bloch waves → energy bands separated by gaps. The band structure determines whether a material is a metal (overlapping bands), semiconductor (small gap), or insulator (large gap).

## Key Insights

- Tunnelling is a hard physical limit on oxide thickness — not an engineering challenge but a physics constraint.
- Modern transistor gates are ~5–7 nm; at this scale quantum effects are not perturbations but dominant physics.
- High-k dielectrics are a quantum mechanics workaround: thicker physically, same capacitance electrically.
- The band gap of silicon (1.12 eV) is set by quantum mechanics of the crystal lattice.

## What Comes Next

Module 22 covers chemistry foundations — bonding, reactions, and the chemistry of semiconductor processing (oxidation, deposition, etching).
`);

write(22,'chemistry-foundations','II',2,20,[
  {type:'book',title:'Chemistry: The Central Science — Brown et al.',url:'https://www.pearson.com/en-us/subject-catalog/p/chemistry-the-central-science/P200000006802',description:'Chapters 1–10 cover the essentials.',required:true},
],`
# Chemistry Foundations

## Why This Matters

Semiconductor fabrication is applied chemistry: silicon oxidation grows SiO₂, chemical vapour deposition (CVD) deposits thin films, wet etching uses HF to remove oxide, ion implantation introduces dopants, and CMP (chemical mechanical planarisation) polishes surfaces. Photoresist is a photochemical system. Understanding these reactions clarifies why fabrication steps have their constraints.

## Core Concepts

### Atomic Bonding

**Covalent bonds**: electrons shared between atoms. Silicon forms 4 covalent bonds (tetrahedral sp³ hybridisation) → diamond cubic crystal structure.

**Ionic bonds**: electron transferred from one atom to another. NaCl. Common in dielectrics (SiO₂, Al₂O₃, HfO₂).

**Metallic bonds**: electrons delocalised across all atoms → good electrical and thermal conductivity. Copper, aluminium, tungsten interconnects.

### Oxidation and Reduction

Oxidation: loss of electrons. Reduction: gain of electrons (remember: OIL RIG — Oxidation Is Loss, Reduction Is Gain).

Silicon thermal oxidation: Si + O₂ → SiO₂. This consumes silicon (SiO₂ grows both above and below the original surface — 44% grows down into Si). The reaction is limited by O₂ diffusion through the growing oxide layer (Deal-Grove model).

### Chemical Reactions and Equilibrium

A reaction proceeds forward if ΔG = ΔH − TΔS < 0 (Gibbs free energy decreases). Temperature drives reactions by increasing the TΔS term — this is why many CVD reactions need high temperatures.

### Acids, Bases, and Etching

HF dissolves SiO₂ by breaking Si-O bonds: SiO₂ + 6HF → H₂SiF₆ + 2H₂O. Selectivity — HF etches oxide much faster than silicon — enables patterning. KOH anisotropically etches silicon crystal planes at different rates, used in MEMS fabrication.

## Key Insights

- Semiconductor fab is a series of controlled chemical reactions at precise temperatures and pressures.
- Oxidation grows SiO₂ from silicon — the oxide is partly below the original surface.
- Selectivity (etch rate ratio between target and non-target materials) is the key figure of merit for etch chemistry.
- Contamination control (Class 1 cleanrooms) is chemistry: a single sodium ion can create a mobile charge that ruins a MOSFET.

## What Comes Next

Module 23 covers materials science — crystal structure, defects, and mechanical properties of the solid materials that constitute every chip.
`);

write(23,'materials-science','II',2,25,[
  {type:'book',title:'Materials Science and Engineering: An Introduction — Callister',url:'https://www.wiley.com/en-us/Materials+Science+and+Engineering%3A+An+Introduction%2C+10th+Edition-p-9781119405498',required:true},
],`
# Materials Science

## Why This Matters

Silicon wafers must be defect-free single crystals for transistors to work reliably. Thin film stress causes wafer bow and delamination. Grain boundaries in copper interconnects scatter electrons and limit conductivity. Crystal orientation affects carrier mobility. Thermal expansion mismatch between materials causes solder joint fatigue over thermal cycles.

## Core Concepts

### Crystal Structures

Atoms in crystalline solids arrange in periodic lattices. Silicon has the **diamond cubic structure** — two interpenetrating FCC (face-centred cubic) lattices offset by (¼, ¼, ¼) of the unit cell. This gives each Si atom 4 nearest neighbours at tetrahedral angles.

Miller indices (hkl) describe crystal planes. The (100), (110), and (111) planes have different atomic densities → different etch rates, oxidation rates, and carrier mobilities. Silicon wafers are cut along (100) for CMOS.

### Defects

**Point defects**: vacancies (missing atoms), interstitials (extra atoms in non-lattice positions), substitutional impurities (dopants replace Si atoms).

**Dislocations**: line defects where atoms are misregistered. Dislocations in silicon create trap states that capture carriers → recombination centres → reduced carrier lifetime → leaky devices.

**Grain boundaries**: interfaces between crystal domains of different orientation. Polycrystalline silicon (polysilicon) — used for MOSFET gates — has many grain boundaries. Single-crystal silicon wafers have none.

### Stress and Strain

Stress = force / area (Pa). Strain = fractional dimensional change. Strained silicon (silicon lattice stretched by growing it on SiGe) has higher carrier mobility → faster transistors. Intel introduced strained silicon in 90nm process (2003).

### Diffusion

Atoms diffuse through a solid driven by concentration gradients (Fick's laws). Dopant diffusion during annealing broadens implanted profiles — a key process control challenge as junctions get shallower.

## Key Insights

- Single-crystal silicon wafers (grown by Czochralski process) have no grain boundaries — essential for uniform device properties.
- Defect density directly limits yield — fewer defects per cm² → more good dies per wafer.
- Strained silicon is an example of using materials science to overcome a physics barrier.
- Thermal expansion mismatch (CTE mismatch) between silicon (2.6 ppm/°C) and solder (17 ppm/°C) causes fatigue cracks over temperature cycles.

## What Comes Next

Module 24 covers solid-state physics — band theory, carrier transport, and the electronic properties that make semiconductors useful for switching.
`);

write(24,'solid-state-physics','II',2,35,[
  {type:'book',title:'Introduction to Solid State Physics — Kittel',url:'https://www.amazon.com/Introduction-Solid-State-Physics-8th/dp/047141526X',description:'The classic text; Chapters 1, 8, 10, 12.',required:true},
  {type:'book',title:'Semiconductor Physics and Devices — Neamen',url:'https://www.amazon.com/Semiconductor-Physics-Devices-Donald-Neamen/dp/0073529583'},
],`
# Solid-State Physics

## Why This Matters

Why is silicon a semiconductor and copper a conductor? Why does doping change conductivity by 10 orders of magnitude? Why does a p-n junction only conduct in one direction? These questions are solid-state physics. The answers explain every transistor in every chip.

## Core Concepts

### Energy Bands

In a crystal, atomic energy levels broaden into bands due to the periodic potential. The valence band is filled; the conduction band is empty at 0K. The gap between them is the band gap E_g.

- **Metal**: conduction band partially filled, or bands overlap. E_g = 0.
- **Semiconductor**: E_g small (Si: 1.12 eV, GaAs: 1.42 eV).
- **Insulator**: E_g large (SiO₂: 9 eV, diamond: 5.5 eV).

At room temperature, thermal energy kT ≈ 0.026 eV can excite electrons across small band gaps.

### Carriers: Electrons and Holes

When an electron is excited to the conduction band, it leaves a **hole** in the valence band. Holes act like positive charge carriers and move opposite to electrons. Both contribute to current.

Intrinsic silicon at 300K: n = p = nᵢ ≈ 1.5×10¹⁰ cm⁻³ (very few carriers — poor conductor).

### Doping

Adding phosphorus (5 valence electrons) to silicon provides extra electrons: n-type, n ≈ N_D (donor concentration), can be 10¹⁵–10²⁰ cm⁻³.

Adding boron (3 valence electrons) creates holes: p-type, p ≈ N_A.

Carrier product: np = nᵢ². So if n increases, p decreases proportionally.

### Carrier Transport

Current = drift + diffusion:
- **Drift**: J = qnμ_n E (electrons move with field)
- **Diffusion**: J = qD_n ∇n (electrons move down concentration gradient)

Mobility μ (electrons faster than holes in silicon: μ_n = 1400 cm²/V·s, μ_p = 450 cm²/V·s).

## Key Insights

- The band gap is a quantum mechanical effect of the periodic crystal lattice.
- Doping shifts the Fermi energy toward the conduction band (n-type) or valence band (p-type).
- Both drift and diffusion contribute to current — this is why transistors work near zero bias.
- Higher carrier mobility → faster transistor → reason for interest in GaN, GaAs, SiGe devices.

## What Comes Next

Module 25 covers semiconductor physics — the p-n junction, depletion region, and MOSFET operation that are the building blocks of every logic gate.
`);

write(25,'semiconductor-physics','II',2,40,[
  {type:'book',title:'Physics of Semiconductor Devices — Sze & Ng',url:'https://www.wiley.com/en-us/Physics+of+Semiconductor+Devices%2C+3rd+Edition-p-9780471143239',description:'The definitive reference.',required:true},
  {type:'book',title:'Semiconductor Device Fundamentals — Pierret',url:'https://www.amazon.com/Semiconductor-Device-Fundamentals-Robert-Pierret/dp/0201543931'},
],`
# Semiconductor Physics

## Why This Matters

Every logic gate is made of MOSFETs. Every MOSFET is a controlled p-n junction. Understanding the p-n junction, depletion region, and MOSFET operation is prerequisite to understanding CMOS power, speed, and scaling limits.

## Core Concepts

### The p-n Junction

When p-type and n-type silicon are joined, electrons diffuse from n to p and holes from p to n, creating a **depletion region** depleted of free carriers. The resulting electric field (built-in potential V_bi ≈ 0.7V for silicon) opposes further diffusion, reaching equilibrium.

**Forward bias** (+ on p side): reduces depletion width, exponential current I = I₀(e^{V/V_T} − 1). V_T = kT/q ≈ 26mV.

**Reverse bias** (+ on n side): widens depletion region, only small leakage current flows — the junction blocks.

### The MOSFET

A MOSFET (Metal-Oxide-Semiconductor Field-Effect Transistor) has 4 terminals: Gate (G), Source (S), Drain (D), Body (B).

For an n-MOSFET on p-type silicon:
- Gate voltage V_GS < V_T (threshold): channel not formed, transistor off.
- V_GS > V_T: gate field inverts channel, thin n-type inversion layer connects Source to Drain.
- Current I_D = μ_n C_ox (W/L)[(V_GS − V_T)V_DS − V_DS²/2] in linear region.

Threshold voltage V_T ≈ 0.5V in modern CMOS (was ~1V in older processes).

### CMOS Complementary Operation

CMOS uses both n-MOSFET and p-MOSFET in complementary pairs. In static CMOS: when output is 0, n-network conducts; when output is 1, p-network conducts. Only during switching do both conduct briefly — this is why CMOS power P ∝ C·V²·f (dynamic power only when switching).

### Short Channel Effects

As gate length L decreases below ~100nm:
- **DIBL** (Drain-Induced Barrier Lowering): drain bias affects threshold voltage
- **Subthreshold slope**: minimum swing = kT/q × ln(10) ≈ 60 mV/decade at 300K — limits how sharply the transistor switches off
- **Quantum confinement**: 2D electron gas in inversion layer, quantised subbands

## Key Insights

- The MOSFET is a voltage-controlled current source — gate voltage controls drain current.
- C_ox (oxide capacitance) must be high for strong inversion → thin oxide or high-k dielectric.
- CMOS power is dominated by dynamic switching power (C·V²·f) — reducing V saves power quadratically.
- The 60 mV/decade subthreshold limit means you need ~400mV V_T margin for good off-state — this floors supply voltage at ~0.6V for conventional CMOS.

## What Comes Next

Module 26 covers semiconductor manufacturing — how wafers become ICs through the 500+ step photolithography process.
`);

write(26,'semiconductor-manufacturing','II',2,35,[
  {type:'article',title:'How CPUs Are Made — Extremetech',url:'https://www.extremetech.com/extreme/191996-how-a-cpu-is-made',description:'Accessible process overview.',required:true},
  {type:'book',title:'Silicon VLSI Technology — Plummer, Deal, Griffin',url:'https://www.amazon.com/Silicon-VLSI-Technology-Fundamentals-Practice/dp/0130850373'},
],`
# Semiconductor Manufacturing

## Why This Matters

Why does a 3nm process have different characteristics than a 7nm process? Why is yield so critical to economics? Why does EUV lithography matter? Manufacturing constraints directly determine what transistors are available, how fast they are, and how much the final chips cost.

## Core Concepts

### The Wafer

Silicon wafers start as polysilicon melted and grown into a single-crystal ingot (Czochralski process). Ingot sliced into 300mm diameter, ~0.75mm thick wafers. Each wafer yields hundreds of dies; a 300mm wafer area is ~70,000 mm²; a 200 mm² GPU die fits ~300 per wafer.

Yield: if defect density D (defects/cm²) and die area A, then roughly Yield ≈ e^{−D·A}. Large dies have lower yield — why CPUs are cut into chiplets.

### Photolithography

1. **Coat**: spin photoresist onto wafer
2. **Expose**: shine UV/EUV through photomask; resist becomes soluble (positive resist) or insoluble (negative resist) where exposed
3. **Develop**: wash away soluble resist
4. **Etch or implant** into exposed silicon/oxide
5. **Strip**: remove remaining resist

Feature size is limited by diffraction: minimum feature ≈ k₁ λ/NA. EUV (13.5nm wavelength) enables sub-5nm features. Numerical aperture NA of modern scanners: 0.33 (ASML EUV), increasing to 0.55 (High-NA EUV).

### Key Process Steps

- **Thermal oxidation**: grow SiO₂ (gate oxide, isolation)
- **Ion implantation**: shoot dopant ions (B, P, As) into silicon to defined depth
- **CVD (Chemical Vapour Deposition)**: deposit thin films (polysilicon, nitride, tungsten)
- **CMP (Chemical Mechanical Planarisation)**: polish surface flat for multi-layer metal
- **Copper damascene**: fill etched trenches with Cu for interconnects (Cu has lower resistance than Al)

Modern processes: 500+ steps, 3 months cycle time, $10M+ per mask set.

### Process Nodes and Transistor Types

"3nm", "5nm" are marketing terms — actual gate length is larger. Key transistor innovations:
- **FinFET** (Intel 22nm, 2011): 3D fin improves short-channel control
- **GAA (Gate-All-Around)** / Nanosheet (Samsung 3nm, 2022): gate wraps all four sides

## Key Insights

- Every chip design is constrained by what the foundry's process supports.
- Yield economics favour smaller dies — chiplets (AMD, Apple, Intel) allow large designs on smaller dice.
- EUV lithography is the key enabling technology for sub-10nm nodes.
- Copper interconnects (damascene) replaced aluminium at 130nm due to lower resistivity.

## What Comes Next

Module 27 covers reliability physics — how devices age and fail, and how these rates determine product lifetimes and warranty costs.
`);

write(27,'reliability-physics','II',2,20,[
  {type:'book',title:'Electronic Device Reliability and Failure Analysis — Tobias & Trindade',url:'https://www.amazon.com/Applied-Reliability-Tobias-Trindade/dp/1584884991',required:true},
],`
# Reliability Physics

## Why This Matters

Server hardware must run for years without failure. JEDEC reliability specifications require 10-year MTBF under specific conditions. Reliability physics models (Arrhenius, Black's equation) let engineers predict lifetime from accelerated testing. The same models explain why CPUs throttle temperature — high temperature accelerates every failure mechanism.

## Core Concepts

### Failure Distributions

**Bathtub curve**: failure rate vs. time has 3 phases:
1. **Infant mortality**: early failures from defects (first weeks)
2. **Useful life**: roughly constant failure rate (years)
3. **Wear-out**: increasing failures as devices age

The Weibull distribution models all three phases with appropriate shape parameter β.

### Arrhenius Acceleration

Most failure mechanisms are thermally activated: failure rate ∝ e^{−E_a/(k_B T)}.

Acceleration factor between T₁ and T₂: AF = e^{(E_a/k_B)(1/T₁ − 1/T₂)}.

For E_a = 0.7 eV (typical for hot carrier degradation): running at 125°C vs 25°C gives AF ≈ 100×. This means 100 hours at 125°C = 10,000 hours at 25°C — accelerated testing.

### Key Failure Mechanisms

**Electromigration (EM)**: current moves metal atoms along interconnects, creating voids (opens) and hillocks (shorts). Black's equation: MTF ∝ J^{−n} e^{E_a/(kT)}. Copper has 3× better EM lifetime than aluminium.

**Time-Dependent Dielectric Breakdown (TDDB)**: gate oxide eventually breaks down under sustained field. Lifetime ∝ e^{γ/E_ox}. Driving factor for keeping oxide fields below specification.

**Hot Carrier Injection (HCI)**: energetic carriers trapped in gate oxide, shifting threshold voltage. Worsens at high V_DS. Reduced by lower supply voltages.

**Negative Bias Temperature Instability (NBTI)**: p-MOSFET threshold voltage shift under negative gate bias at elevated temperature. Partially recovers when bias removed — complicates lifetime modelling.

**Thermal Cycling Fatigue**: solder joints crack from repeated thermal expansion/contraction. Governed by Coffin-Manson relationship: N_f ∝ (ΔT)^{−n}.

## Key Insights

- Temperature is the enemy of reliability — every 10°C rise approximately halves lifetime for many mechanisms.
- Accelerated testing compresses years of use into weeks by elevating temperature and/or voltage.
- Electromigration limits current density in metal interconnects → minimum wire widths.
- Modern CPUs run near their reliability limits — firmware temperature management is critical.

## What Comes Next

Module 28 begins Part III — moving from materials to circuits. Basic electrical quantities (charge, current, voltage, resistance) are the interface between physics and engineering.
`);

console.log('\\n✓ Supermodules 1–2 done (modules 1–27)');
