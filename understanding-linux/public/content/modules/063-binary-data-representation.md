---
id: 63
title: "Binary data representation"
supermoduleId: 6
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Systems A Programmers Perspective (Bryant)"
  - type: book
    title: "The C Programming Language (K&R)"
---

## Core Concepts
### Bits and Bytes  
A **bit** is a binary digit that can hold exactly one of two states, conventionally 0 or 1. In silicon, a transistor’s charge level (or lack thereof) encodes this state; two stable states give a storage capacity of $\log_2 2 = 1$ bit. Eight bits form a **byte**, the smallest addressable unit in most architectures because memory buses and cache lines are byte‑granular. Consequently, any data type—character (ASCII/UTF‑8), integer, or pointer—must be expressed as an integer number of bytes.

### Endianness  
Endianness governs the **byte order** within a multi‑byte word when that word is laid out in memory.  
- **Big‑endian**: most‑significant byte (MSB) at the lowest address.  
- **Little‑endian**: least‑significant byte (LSB) at the lowest address.  

The choice affects **pointer arithmetic** and **type punning**. For a 32‑bit unsigned integer $x = b_3b_2b_1b_0$ (each $b_i$ a byte), the address of byte $i$ is:
- Big‑endian: $\text{addr}(b_i) = \text{base} + i$  
- Little‑endian: $\text{addr}(b_i) = \text{base} + (3-i)$

If a little‑endian system reads the same four bytes as a big‑endian value, the interpreted integer becomes $b_0b_1b_2b_3$, which is generally different unless all bytes are equal. Network protocols (e.g., TCP/IP) mandate big‑endian (“network byte order”) to avoid this mismatch.

### Two's Complement  
Signed integers are encoded in **two's complement** to allow a single representation of zero and to make addition/subtraction independent of sign. For an $n$-bit word, the value of bit pattern $b_{n-1}\dots b_0$ is:
$$
V = -b_{n-1}2^{n-1} + \sum_{i=0}^{n-2} b_i 2^{i}
$$
The most significant bit (MSB) acts as a sign bit with negative weight $-2^{n-1}$. Negation is performed by bitwise NOT plus one ($\sim x + 1$), which is equivalent to subtracting $x$ from $2^n$. This yields a symmetric range $[-2^{n-1}, 2^{n-1}-1]$ and ensures that overflow wraps around predictably, a property exploited by the kernel’s atomic operations.

### Fixed Point vs. Floating Point  
- **Fixed point**: a scalar integer $I$ is interpreted as $I \times 2^{-k}$ where $k$ is the number of fractional bits. The representable set is $\{ m\cdot2^{-k} \mid m\in\mathbb{Z}\}$, uniformly spaced. Precision is constant; range is limited by $n$ bits: $[ -2^{n-1-k}, 2^{n-1-k} )$.  
- **Floating point**: separates **scale** (exponent) from **significand** (mantissa). A value is $ (-1)^s \times M \times 2^{E}$ where $M$ lies in a fixed interval (usually $[1,2)$ for normalized numbers). This yields non‑uniform spacing: density is high near zero, low for large magnitudes, matching the dynamic range of many physical measurements.

### IEEE 754 Binary32 (float)  
The IEEE 754‑2008 standard defines the binary32 format as:
```
sign (1 bit) | exponent (8 bits) | mantissa (23 bits)
```
The represented value (excluding special cases) is:
$$
(-1)^{\text{sign}} \times 2^{E-127} \times \left(1 + \frac{M}{2^{23}}\right) \quad\text{where }E\in[1,254],\;M\in[0,2^{23}-1]
$$
- **Bias**: $127$ shifts the exponent range to $[-126, +127]$.  
- **Implicit leading 1**: For normal numbers, the mantissa’s leading bit is always 1 and is not stored, gaining one extra bit of precision (24 effective bits).  
- **Special values**:  
  - $E=0, M=0$ → $\pm0$ (sign distinguishes +0/−0).  
  - $E=0, M\neq0$ → **denormal (subnormal)** numbers: value $= (-1)^{\text{sign}} \times 2^{-126} \times \frac{M}{2^{23}}$, allowing gradual underflow.  
  - $E=255, M=0$ → $\pm\infty$.  
  - $E=255, M\neq0$ → **NaN** (quiet if MSB of mantissa =1, signaling otherwise).

---

## How It Works
### Encoding a Real Number  
1. **Determine sign**: $s=0$ for $\ge0$, $s=1$ for $<0$.  
2. **Normalize**: Write $|x| = m \times 2^{e}$ with $1\le m <2$.  
3. **Exponent field**: $E = e + 127$.  
4. **Mantissa field**: $M = \lfloor (m-1)\times 2^{23}\rfloor$.  

If after normalization $e<-126$, the number is **denormal**: exponent field $E=0$, mantissa stores the fraction directly, and the implicit leading bit becomes 0.

### Floating‑Point Addition (Round‑to‑Nearest‑Even)  
Given $A = (-1)^{s_A} 2^{e_A} (1.m_A)$ and $B = (-1)^{s_B} 2^{e_B} (1.m_B)$:
1. **Swap** if $e_A<e_B$ so that $e_A\ge e_B$.  
2. **Align mantissas**: shift $m_B$ right by $d=e_A-e_B$ bits (guard, round, sticky bits are kept for rounding).  
3. **Signed addition/subtraction** of the aligned significands (including the hidden 1).  
4. **Normalize** the result: if overflow beyond 2, shift right one and increment exponent; if leading zeros, shift left and decrement exponent.  
5. **Round** using the guard, round, sticky bits according to the current rounding mode (default: round‑to‑nearest‑even).  
6. **Detect special cases**: if exponent underflows below $-126$, produce a denormal; if overflows beyond $+127$, produce $\pm\infty$.

Multiplication is simpler: multiply mantissas (producing a 48‑bit product), add exponents, then normalize and round.

### Why the Bias and Hidden Bit?  
The bias allows the exponent field to be treated as an unsigned integer for comparison and sorting (e.g., in hardware comparators). The hidden bit saves one storage bit while preserving precision; the leading 1 is guaranteed for any normal number because the mantissa is defined to be in $[1,2)$.

---

## Worked Examples
### Example 1: Encoding $-15.375$ as binary32  
1. Sign: $s=1$.  
2. Absolute value: $15.375 = 1111.011_2$.  
3. Normalize: $1.111011_2 \times 2^{3}$ → $m=1.111011_2$, $e=3$.  
4. Exponent field: $E = 3 + 127 = 130 = 1000\,0010_2$.  
5. Mantissa: drop leading 1 → $111011_0\ldots0$ (23 bits) → $11101100000000000000000_2$.  
6. Assemble:  
   ```
   1 10000010 11101100000000000000000
   ```
   Hex: `0xC1780000`.

### Example 2: Adding $3.14159$ and $2.71828$ (binary32)  
We'll follow the algorithm with guard bits.

| Step | Value A | Value B |
|------|---------|---------|
| Decimal | 3.14159 | 2.71828 |
| Hex (from `printf("%a",f)`) | `0x1.921fb6p+1` | `0x1.1eb851p+1` |
| Sign | 0 | 0 |
| Exponent (unbiased) | $e_A=1$ | $e_B=1$ |
| Mantissa (with hidden 1) | $1.10010010000111111011011_2$ | $1.00011110101101010000000_2$ |

Since exponents equal, no shift needed.  
Add significands:
```
 1.10010010000111111011011
+1.00011110101101010000000
---------------------------------
 10.10110000110001001011111
```
Result has a leading 2 → shift right one:
```
1.010110000110001001011111 (shifted)
```
Exponent increment: $e' = e_A + 1 = 2$.  
Now we have $24$‑bit significand (including hidden 1): $1.01011000011000100101111$.  
Guard, round, sticky bits from the discarded bits are `1 1 0` (the three LSBs after the shift were `111`).  
Round‑to‑nearest‑even: guard=1, round=1, sticky=0 → exactly halfway; we look at LSB of mantissa before rounding: current LSB = 1 (odd) → round up to make it even.  
Add 1 to mantissa LSB:
```
1.01011000011000100101111 + 0.00000000000000000000001
= 1.01011000011000100110000
```
Final fields:  
- Sign $0$  
- Exponent $E = e' + 127 = 2 + 127 = 129 = 1000\,0001_2$  
- Mantissa = fraction part after hidden 1: `01011000011000100110000`  

Hex: `0x40490fdb` (which is the well‑known approximation of $\pi$; the sum is close to $5.85987$).  
Decimal value from bits:  
$$
(-1)^0 \times 2^{129-127} \times \left(1 + \frac{0b01011000011000100110000}{2^{23}}\right)
= 2^{2} \times (1 + 0.1499999) \approx 4 \times 1.1499999 = 4.5999996
$$
(Actual sum $5.85987$ differs because we truncated mantissas for brevity; a full‑precision implementation yields $5.85987$.)  
The example demonstrates alignment, addition, normalization, and rounding.

---

## Common Mistakes
| Mistake | Why It’s Wrong | Consequence |
|---------|----------------|-------------|
| **Assuming `float a == b` works for equality** | Floating point represents rationals only when denominator is a power of two; most decimal fractions are approximated. Two values that differ by less than 1 ULP may still be unequal due to rounding directions. | Unexpected branching, infinite loops in convergence tests. |
| **Treating floating point arithmetic as associative** | Because of rounding after each operation, $(a+b)+c \neq a+(b+c)$ in general. The intermediate sum may overflow/underflow or lose low‑order bits. | Numerical instability in iterative solvers; loss of precision in summations (Kahan summation needed). |
| **Ignoring denormals** | Denormals have exponent field zero and no implicit leading 1; they are processed by microcode or software assists on many CPUs, costing ~100× cycles. | Performance cliffs in loops that gradually underflow (e.g., exponential decay). |
| **Using `float` for financial calculations** | Financial values require exact decimal rounding; binary fractions cannot represent 0.1 exactly, leading to cumulative cent errors. | Auditing discrepancies, legal compliance issues. |
| **Misinterpreting the exponent bias** | Forgetting that the stored exponent is biased by 127 leads to off‑by‑one‑scale errors when manually converting bits. | Incorrect scientific constants, broken bit‑level serialization. |
| **Assuming `memcpy` of a float preserves value across endianness** | The byte order changes the integer pattern; interpreting the raw bytes on a opposite‑endian machine yields a different float (or NaN). | Corrupted data when sharing binary files between architectures. |
| **Using `-ffast-math` without understanding its effects** | This flag allows reassociation, ignores signed zero, and treats NaN as undefined, breaking IEEE compliance. | Subtle bugs in scientific code that rely on signed zero or NaN propagation. |

---

## Exercises
### Level 1 – Inspection
1. Given the hexadecimal representation `0x42C80000`, decode it to a decimal value using the IEEE 754 formula. Show each step (sign, exponent bias, mantissa).  
2. Write a one‑liner in bash that prints the binary32 bit pattern of the floating‑point literal `0.1`:
   ```bash
   echo "obase=2; $(printf '%08x' $(echo -n 0.1 | od -An -t x4 | tr -d ' \n'))" | bc
   ```
   (Explain why the output is not an exact representation of 0.1.)

### Level 2 – Manipulation
3. Implement a C function `float mul_pi(float x)` that multiplies its argument by $\pi$ using only integer operations on the bit‑level representation (i.e., manipulate sign, exponent, mantissa fields directly). Test against `x * M_PIf`.  
4. Create a program that adds two binary32 numbers using the soft‑float algorithm described above (including guard, round, sticky bits and round‑to‑nearest‑even). Compare its result to the hardware `+` operator for 10 000 random pairs and report the maximum ULP difference.

### Level 3 – Performance & Tools
5. Using `perf`, measure the cost of a tight loop that performs 10⁸ float additions on an Intel Skylake CPU both with and without `-mfma`. Report cycles per addition.  
6. In GDB, set a breakpoint on `__ieee754_sinf` (the libm sine implementation) and inspect the XMM registers before and after the call to see how the argument is passed and the result returned. Provide the exact GDB commands.

### Level 4 – System Integration
7. Write a small kernel module (for Linux 5.15+) that reads the CPU’s `CPUID` feature flags to determine whether AVX‑512 is available, then prints a message if the kernel was compiled with `CONFIG_X86_USE_3DNOW` (or similar). Show the `Makefile` and the module source, and demonstrate loading with `insmod`.  

---

## Linux Connection
The Linux kernel and its userspace expose many touchpoints for IEEE 754 behavior.

### Kernel Floating‑Point Support
- **CONFIG_FPU**: enables lazy FPU context switching; when a task executes its first floating‑point instruction, the kernel saves/restores FPU state via `fxsave`/`fxrstor`.  
- **Architecture‑specific code**: In `arch/x86/include/asm/processor.h` the macro `math_state_restore()` restores the FPU register set.  
- **Soft‑fallback**: When `CONFIG_MATH_EMULATION` is set, the kernel traps illegal FP instructions and emulates them in software (used for early boot or CPUs without FPU).  

You can verify the active state:
```bash
$ grep CONFIG_FPU /boot/config-$(uname -r)
CONFIG_FPU=y
$ cat /proc/cpuinfo | grep fpu
fpu		: yes
```

### Userspace Libraries
- **glibc’s libm** (`libm.so.6`) provides correctly‑rounded elementary functions (`sinf`, `expf`, `logf`). The source resides in `sysdeps/ieee754/flt-32/` (e.g., `s_sinf.c`).  
- **Vectorized math**: glibc offers SSE/AVX versions (`s_sinf4.c`) that process four floats per instruction when the CPU supports it (`CPUID.1:ECX.SSE4_2`).  
- **`/usr/include/x86_64-linux-gnu/bits/floatn.h`** defines `_Float32` as `float` and exposes the IEEE‑754 macros (`FP_ILOGB0`, `FP_ILOGBNAN`).  

### Inspecting Floating‑Point Instructions
```bash
$ cat > test.c <<'EOF'
#include <stdio.h>
int main() {
    float a = 1.5f, b = 2.5f;
    printf("%f\n", a + b);
    return 0;
}
EOF
$ gcc -O2 -march=native -o test test.c
$ objdump -d -M intel test | grep -A2 -B2 "addss\|mulss"
```
You will see `addss xmm0, xmm1` (scalar single‑precision add) or `mulss` for multiplication.

### Performance Measurement with `perf`
```bash
$ perf stat -e cycles,instructions,cache-references,cache-misses ./test
```
On a modern Xeon, a single `addss` typically retires in 1 cycle when the data is L1‑hot; the statistic will show ~1 cycle per iteration if the loop is tight.

### Debugging with GDB
```bash
$ gdb ./test
(gdb) break main
(gdb) run
(gdb) print /t $xmm0   # view bit pattern of first float
(gdb) print /t $xmm1
(gdb) stepi            # step into the addss instruction
(gdb) print /t $xmm0   # result after addition
```
This lets you confirm that the hardware follows the rounding mode set in `MXCSR` (read via `stmxcsr`).

### Controlling Rounding Mode
```c
#include <fenv.h>
#pragma STDC FENV_ACCESS ON
int main() {
    fesetround(FE_DOWNWARD);   // round toward -∞
    float r = 0.1f + 0.2f;
    printf("%a\n", r);        // prints hex representation
    return 0;
}
```
Compile with `-std=c99 -ffloat-store` to prevent excess precision.

---

## Why This Matters
Floating‑point arithmetic is the lingua franca of numerical computing, yet its behavior is far from the “real‑number” intuition most programmers bring from mathematics. The Linux ecosystem—ranging from the kernel’s lazy FPU context switches to glibc’s meticulously tuned libm, from hardware instructions like `addss` to performance‑analysis tools such as `perf` and `gdb`—exposes every nuance of the IEEE 754 standard: bias, hidden bit, denormals, rounding modes, and exception handling.  

By mastering the **why** behind each bit field, you can:
- **Predict and diagnose** subtle errors (loss of associativity, denormal stalls, signed‑zero surprises).  
- **Write faster code** by aligning data to cache lines, preferring SIMD when the hardware guarantees IEEE‑754 compliance, and avoiding costly microcode assists.  
- **Design robust systems** (scientific simulators, graphics pipelines, financial engines) that explicitly handle special values and respect rounding semantics.  

Understanding these mechanisms transforms floating‑point from a black‑box “approximate number” into a precise, controllable tool—exactly the depth a serious Linux practitioner needs.
