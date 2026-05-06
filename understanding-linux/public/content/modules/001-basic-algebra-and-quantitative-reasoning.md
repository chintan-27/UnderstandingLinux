---
id: 1
title: "Basic algebra and quantitative reasoning"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Core Concepts
### Variables, Expressions, and Equations  
A variable is a symbol that stands for an unspecified quantity that can change within a given context. In Linux, variables appear as shell parameters (`$HOME`), kernel tunables (`/proc/sys/net/ipv4/tcp_rmem`), or C program identifiers. An **expression** combines variables, constants, and operators to denote a value; an **equation** states that two expressions have the same value for all assignments that satisfy it.  
*Why*: When we write `x = 5` we are asserting that the unknown quantity `x` occupies exactly five units of whatever we are measuring (bytes, cycles, packets). Solving the equation tells us the precise value that makes the assertion true, which is exactly what a configurator or a scheduler must determine when it enforces a resource limit.

### Linear Equations and Inequalities  
A linear equation in one variable has the form $ax + b = 0$ with $a\neq0$. Solving proceeds by isolating $x$: subtract $b$ from both sides, then divide by $a$.  
*Why*: Each step preserves equality because we apply the same operation to both sides—a direct consequence of the **additive** and **multiplicative** properties of equality, which follow from the definition of equality as an equivalence relation.

An inequality such as $ax + b > c$ is solved similarly, but the direction of the inequality flips when we multiply or divide by a negative number.  
*Why*: Multiplying by a negative reflects the number line about zero, reversing order; this is a geometric consequence of the definition of $<$ on $\mathbb{R}$.

### Exponentiation and Its Laws  
For a base $a\in\mathbb{R}$ and exponent $n\in\mathbb{Z}$, $a^n$ denotes repeated multiplication when $n>0$, repeated division when $n<0$, and $a^0=1$ (the empty product). The fundamental laws follow from associativity and commutativity of multiplication:  

$$
\begin{aligned}
a^{m+n} &= a^m a^n \quad &\text{(add exponents when multiplying)}\\[4pt]
a^{mn} &= (a^m)^n \quad &\text{(multiply exponents when raising a power)}\\[4pt]
(ab)^n &= a^n b^n \quad &\text{(distribute exponent over product)}
\end{aligned}
$$

*Why*: These laws let us rewrite expressions so that unknowns appear only once, turning a seemingly complex relationship into a solvable linear or logarithmic equation.

### Logarithms as Inverse Exponentials  
The logarithm base $b>0,\ b\neq1$ is defined by $y=\log_b x \iff b^y = x$. Consequently:

$$
\log_b (xy) = \log_b x + \log_b y,\qquad
\log_b\!\left(\frac{x}{y}\right)=\log_b x-\log_b y,\qquad
\log_b(x^k)=k\log_b x.
$$

*Why*: These identities transform products into sums, which is why they appear in algorithmic analyses (e.g., turning a multiplicative recurrence into an additive one) and in signal processing (convolution → multiplication in frequency domain).

### Scientific Notation and Significant Figures  
Any real number $x\neq0$ can be uniquely written as $x = m \times 10^e$ where $1\le |m|<10$ and $e\in\mathbb{Z}$. The mantissa $m$ carries the significant digits; the exponent $e$ scales the value.  
*Why*: In Linux kernel logs and `/proc` files, numbers span many orders of magnitude (bytes vs. petabytes). Scientific notation lets us compare magnitudes without counting zeros, and it preserves precision when floating‑point representation is limited.

### Ratios, Proportions, and Percentages  
A ratio $a:b$ (or $\frac{a}{b}$) compares two quantities of the same kind. A **proportion** states that two ratios are equal: $\frac{a}{b}=\frac{c}{d}$. Solving a proportion uses cross‑multiplication: $ad = bc$.  
*Why*: Resource allocation policies (e.g., CFS weight, QoS bands) are expressed as ratios; verifying that a system respects a proportion guarantees fairness or bounded latency.

---

## How It Works
### Algebraic Modeling of System Behavior  
Linux subsystems expose counters that increase monotonically (e.g., jiffies, byte counters). To infer a rate we form a **difference quotient**:

$$
\text{rate} = \frac{\Delta\text{counter}}{\Delta t}.
$$

If the counter follows a linear model $C(t)=C_0+rt$, then solving $C(t_2)-C(t_1)=r(t_2-t_1)$ for $r$ yields the instantaneous rate.  
*Why*: The difference quotient is a discrete approximation of the derivative; assuming linearity over a short interval is justified by the **mean value theorem** when the underlying process varies slowly relative to the sampling period.

### Memory Address Calculation  
Physical address $PA$ of a byte is derived from its virtual address $VA$, page size $P$, and page table entry (PTE) frame number $F$:

$$
\begin{aligned}
\text{page\_offset} &= VA \bmod P,\\
\text{frame\_number} &= \text{PTE}[VA\!>>\!\log_2 P],\\
PA &= (\text{frame\_number}\times P) + \text{page\_offset}.
\end{aligned}
$$

*Why*: The decomposition relies on the division algorithm $VA = qP + r$ with $0\le r<P$. The quotient $q$ identifies the frame; the remainder $r$ is the offset inside the frame. This is the exact arithmetic the MMU performs on every memory access.

### Network Throughput and the Shannon Limit  
The maximum error‑free bit rate $C$ (bits/s) of a channel with bandwidth $B$ (Hz) and signal‑to‑noise ratio $S/N$ is given by the Shannon‑Hartley theorem:

$$
C = B\log_2\!\left(1+\frac{S}{N}\right).
$$

*Why*: The logarithm appears because each doubling of $S/N$ contributes one additional distinguishable amplitude level per Hz, and the number of distinguishable levels grows exponentially with the number of bits per symbol.

### CPU Utilization from `top`  
`top` shows the percentage of CPU time spent in user (`%us`) and system (`%sy`) modes over a sampling interval $\Delta t$. If the kernel records ticks spent in each mode ($U_t$, $S_t$) and total ticks $T_t$, then

$$
\%us = 100\frac{U_t}{T_t},\qquad
\%sy = 100\frac{S_t}{T_t}.
$$

*Why*: The ratio of time spent in a mode to total elapsed time is dimensionless; multiplying by 100 converts it to a conventional percentage. This follows directly from the definition of a proportion.

---

## Worked Examples
### Example 1: Solving a Linear Equation with a Negative Coefficient  
Solve $-4x + 7 = 3$ for $x$.

$$
\begin{aligned}
-4x + 7 &= 3 &&\text{(original)}\\
-4x &= 3-7 &&\text{(subtract 7 from both sides)}\\
-4x &= -4 &&\text{(simplify)}\\
x &= \frac{-4}{-4} &&\text{(divide by $-4$)}\\
x &= 1.
\end{aligned}
$$

*Why*: Subtracting the same constant preserves equality; dividing by a negative flips the sign of both numerator and denominator, leaving the quotient unchanged.

### Example 2: Evaluating a Mixed Exponential Expression  
Evaluate $2^{5}\times 3^{-2}$.

$$
\begin{aligned}
2^{5} &= 2\times2\times2\times2\times2 = 32,\\
3^{-2} &= \frac{1}{3^{2}} = \frac{1}{9},\\[4pt]
2^{5}\times 3^{-2} &= 32 \times \frac{1}{9} = \frac{32}{9} \approx 3.\overline{5}.
\end{aligned}
$$

*Why*: Negative exponent denotes reciprocal; multiplication of fractions follows $\frac{a}{b}\times\frac{c}{d}=\frac{ac}{bd}$.

### Example 3: Converting to Scientific Notation with Precision  
Express $0.0000456$ in scientific notation to three significant figures.

$$
\begin{aligned}
0.0000456 &= 4.56 \times 10^{-5} \quad (\text{move decimal 5 places right})\\
\text{Three sig. figs.} &\Rightarrow 4.56\times10^{-5}.
\end{aligned}
$$

*Why*: Moving the decimal point $k$ places multiplies by $10^{k}$; to keep the value unchanged we compensate with $10^{-k}$. The mantissa now holds exactly the desired significant digits.

### Example 4: Solving a Logarithmic Equation  
Solve $\log_2(x+4) = 5$ for $x$.

$$
\begin{aligned}
\log_2(x+4) &= 5\\
x+4 &= 2^{5} &&\text{(definition of logarithm)}\\
x+4 &= 32\\
x &= 32-4 = 28.
\end{aligned}
$$

*Why*: Exponentiating both sides with base $2$ cancels the logarithm because $2^{\log_2 y}=y$ for $y>0$.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It’s Wrong |
|---|---|---|
| **Dropping the negative sign when dividing**: solving $-3x=9$ as $x=3$ | Forgets that dividing both sides by $-3$ yields $x=-3$. | Division by a negative number multiplies the quotient by $-1$; equality is preserved only if the divisor’s sign is applied to both sides. |
| **Misapplying the log product rule**: claiming $\log_2(8+2)=\log_2 8+\log_2 2$ | The argument of a log is a sum, not a product. | $\log_b(xy)=\log_b x+\log_b y$ follows from $b^{\log_b x+\log_b y}=b^{\log_b x}b^{\log_b y}=xy$. No similar identity exists for $x+y$. |
| **Treating $a^{b+c}$ as $a^b + a^c** | Writes $2^{3+4}=2^3+2^4=8+16=24$. | Exponent addition corresponds to multiplication of powers: $2^{3+4}=2^3\cdot2^4=8\cdot16=128$. The error confuses the additive law of exponents with the distributive law of multiplication over addition, which does **not** hold for powers. |
| **Using scientific notation incorrectly for addition**: writing $3.2\times10^4 + 4.5\times10^3 = 7.7\times10^4$ | Adds mantissas without aligning exponents. | To add, convert to a common exponent: $4.5\times10^3 = 0.45\times10^4$, then $3.2+0.45=3.65$, giving $3.65\times10^4$. The mistake ignores place value. |
| **Confusing ratio with difference**: saying a 20% increase equals a 20% decrease | Claims $1.20\times$ original equals $0.80\times$ original. | A ratio multiplies; a decrease multiplies by $(1-0.20)=0.80$. An increase multiplies by $1+0.20=1.20$. The two operations are not inverses unless the base is 1. |

---

## Exercises
### Easy
1. Solve $5x - 12 = 23$ for $x$.  
2. Evaluate $4^{3}\times 2^{-2}$.  
3. Write $7\,200\,000$ in scientific notation with two significant figures.  

### Medium
4. Solve the inequality $-2x+5 > 11$ and express the solution set in interval notation.  
5. Compute $\log_5(125)$ without a calculator.  
6. A disk reports `Read: 1 200 MiB, Write: 300 MiB` over a 10‑second interval. What is the average read throughput in MiB/s?  

### Hard
7. Derive the formula for the physical address $PA$ given a 4‑KiB page size, a virtual address $VA = 0x7FFF FFFF FFFF$, and a page‑table entry that maps the page to frame number $0x1AF3$. Show each step.  
8. Using the Shannon‑Hartley theorem, calculate the maximum channel capacity (in Mbps) for a Wi‑Fi link with $B=20$ MHz and $S/N = 31$ (linear).  
9. Write a C program that reads two integers from the command line, computes their ratio as a floating‑point percentage, and prints the result with exactly two decimal places. Include the necessary headers and error checking for division by zero.  

*Provide your answers in separate markdown code blocks where appropriate (bash, C, plain text).*

---

## Linux Connection
### Inspecting Memory with `/proc/meminfo` and `free`  
The kernel exports memory statistics as plain text. Each line is a **key‑value** pair; the value is expressed in kilobytes unless otherwise noted.

```bash
# Show total, used, and free memory in megabytes
$ free -m
              total        used        free      shared  buff/cache   available
Mem:           7874        3656        2515         144        1703        3818
Swap:          2048           0        2048
```

*Why*: `free` reads `/proc/meminfo`, extracts `MemTotal`, `MemFree`, `Buffers`, `Cached`, etc., and applies the linear relations:

$$
\begin{aligned}
\text{Used} &= \text{MemTotal} - (\text{MemFree} + \text{Buffers} + \text{Cached})\\
\text{Available} &\approx \text{MemFree} + \text{Buffers} + \text{Cached} \;(\text{approximation used by the kernel}).
\end{aligned}
$$

### Processing `/proc/meminfo` with `awk`  
Suppose we want the percentage of memory used:

```bash
$ awk '/MemTotal/ {total=$2}
       /MemFree/  {free=$2}
       /Buffers/  {buff=$2}
       /Cached/   {cache=$2}
       END {
           used = total - (free + buff + cache);
           printf "Memory usage: %.2f%%\n", (used/total)*100;
       }' /proc/meminfo
Memory usage: 46.42%
```

*Why*: `awk` fields `$1`, `$2` correspond to the key and the numeric value. The arithmetic follows directly from the definitions above; the final `printf` converts the ratio to a percentage.

### Solving Equations with `bc`  
`bc` is an arbitrary‑precision calculator that understands infix notation and can solve simple linear equations by iterating.

```bash
$ bc
bc 1.07.1
scale=10          # keep ten decimal places
# Solve 3x + 7 = 22
3*x + 7 = 22
x = (22 - 7) / 3
5.0000000000
quit
```

*Why*: `bc` treats the input as a sequence of assignments; the expression `(22-7)/3` is evaluated using the same algebraic steps we performed by hand.

### Calculating Page Offset with Bitwise Operations  
On x86‑64 with a 4‑KiB page ($2^{12}$ bytes), the offset is the low 12 bits of the virtual address.

```bash
$ # Example: VA = 0x7ffff7ff2000
$ printf "0x%x\n" $(( 0x7ffff7ff2000 & 0xFFF ))   # mask low 12 bits
0x2000
```

*Why*: The mask `0xFFF` (= $2^{12}-1$) isolates the bits that represent the offset because higher bits correspond to the page number. This is the exact operation the MMU performs before adding the frame base address.

### Network Throughput Measurement with `ethtool` and `miitool`  
To verify the Shannon‑Hartley prediction we can query the negotiated link speed and compare it to the measured byte rate from `ifconfig`.

```bash
$ # Show link speed (in Mbps) for eth0
$ ethtool eth0 | grep -i speed
        Speed: 1000Mb/s

$ # Count received bytes over 5 seconds
$ ip -s link show eth0 | awk '/RX:/{getline; print $1}'
12345678
$ # Convert to Mbps
$ echo "scale=2; (12345678*8)/(5*1e6)" | bc
19.75
```

*Why*: `ethtool` reports the negotiated physical layer rate (the channel bandwidth $B$ in the Shannon formula). The byte counter difference divided by the elapsed time yields an empirical throughput; converting bytes to bits (`*8`) and dividing by $10^6$ yields megabits per second.

### Scheduling Weight Calculation with `cgroup v2`  
The CPU scheduler distributes CPU time proportionally to the `cpu.weight` attribute of each cgroup.

```bash
$ # Create two cgroups with weights 200 and 800
$ mkdir -p /sys/fs/cgroup/cpu/demo/{low,high}
$ echo 200 > /sys/fs/cgroup/cpu/demo/low/cpu.weight
$ echo 800 > /sys/fs/cgroup/cpu/demo/high/cpu.weight

$ # Run a CPU‑bound task in each for 10s and check accumulated time
$ cgexec -g cpu:demo/low   yes > /dev/null &
$ cgexec -g cpu:demo/high  yes > /dev/null &
$ sleep 10
$ kill %1 %2
$ cat /sys/fs/cgroup/cpu/demo/low/cpu.stat  | grep usage_usec
usage_usec 1234567
$ cat /sys/fs/cgroup/cpu/demo/high/cpu.stat | grep usage_usec
usage_usec 4938271
```

*Why*: The ratio of accumulated CPU time approximates the ratio of weights (200:800 = 1:4). The scheduler enforces this by allocating time slices proportional to the weight, a direct application of the proportion principle.

---

## Why This Matters
Algebra is not a detached abstract exercise; it is the **quantitative language** that Linux uses to turn raw counters into actionable insights, to translate virtual addresses into physical memory, to allocate CPU cycles fairly, and to predict the limits of communication channels. By mastering the manipulation of variables, the precise application of exponent and logarithm laws, and the correct handling of ratios and scientific notation, you gain the ability to:

* **Derive** system‑level formulas from first principles instead of memorizing magic numbers.  
* **Diagnose** performance bottlenecks by interpreting `/proc` metrics with the same rigor used in solving equations.  
* **Design** resource‑allocation policies (cgroups, QoS, scheduler tunables) that provably meet desired ratios.  
* **Verify** that observed throughput conforms to theoretical bounds such as the Shannon limit, ensuring that hardware is not being under‑utilized or mis‑configured.  

When you can move fluently between a symbolic expression and a concrete `bash` or `C` implementation, you close the gap between theory and practice—exactly the skill set that separates a casual Linux user from a systems engineer capable of optimizing, troubleshooting, and extending the operating system itself.
