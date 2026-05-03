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

## Why This Matters

Every value your program touches — integers, pointers, floating-point numbers, network packets — is a sequence of bits in memory. The rules governing how those bits encode meaning were chosen to make hardware arithmetic circuits simple and fast: two's complement exists because it lets signed and unsigned addition share the same adder. When you misunderstand these rules, you get silent bugs — a network protocol that breaks on ARM but works on x86 because you forgot byte ordering, a buffer overread caused by unsigned wraparound, a physics simulation that drifts because IEEE 754 rounding is not symmetric. The Linux kernel ABI, every syscall interface, and every wire protocol depend on these representations being consistent.

---

## Core Concepts

### Bits, Bytes, and Words

A **bit** holds 0 or 1. A **byte** is 8 bits — a convention that solidified with the IBM System/360 and has dominated since. A byte holds $2^8 = 256$ distinct patterns; a $w$-bit word holds $2^w$.

The unsigned interpretation of a bit vector $\vec{x} = [x_{w-1}, \ldots, x_1, x_0]$ is:

$$B2U_w(\vec{x}) = \sum_{i=0}^{w-1} x_i \cdot 2^i$$

where $x_0$ is the least significant bit. Every other representation in this module is a reinterpretation of this same physical bit pattern.

### Endianness

When a multi-byte value occupies consecutive memory addresses, the byte order must be defined. **Little-endian** (x86, x86-64, AArch64 in its default mode) places the least significant byte at the lowest address. **Big-endian** (network byte order per RFC 1700, SPARC, MIPS in BE mode) places the most significant byte first. The bit ordering *within* each byte is not affected — only the byte sequence across addresses.

The integer `0x12345678` at address `0x100`:

```
Address:   0x100  0x101  0x102  0x103
Little:     0x78   0x56   0x34   0x12
Big:        0x12   0x34   0x56   0x78
```

This is invisible when a program writes and reads its own data. It becomes critical when raw bytes cross machine boundaries: TCP/IP sockets, binary file formats, memory-mapped hardware registers. The POSIX functions `htonl`/`ntohl` (host-to-network, 32-bit) and `htons`/`ntohs` (16-bit) convert between host byte order and big-endian network byte order precisely because the network stack cannot assume host endianness.

You can probe your machine's endianness directly:

```bash
# Read /proc/cpuinfo or use Python to inspect byte layout
python3 -c "import sys; print(sys.byteorder)"

# Or use the endian field in ELF headers
readelf -h /bin/ls | grep "Data"
# Data: 2's complement, little endian
```

### Two's Complement

Two's complement is the dominant signed integer representation because **it makes the addition circuit identical for signed and unsigned operands** — the CPU's ALU does not need to know which interpretation you intend. One's complement and sign-magnitude representations both require separate adder logic for signed values; two's complement does not.

The encoding gives the most significant bit a **negative** weight:

$$B2T_w(\vec{x}) = -x_{w-1} \cdot 2^{w-1} + \sum_{i=0}^{w-2} x_i \cdot 2^i$$

The representable range is $[-2^{w-1},\ 2^{w-1}-1]$. For $w=8$: $[-128, 127]$. The asymmetry — TMin has no positive counterpart — is structural, not incidental: there are $2^w$ bit patterns, which is even, so a symmetric range around zero would waste one pattern. TMin maps to itself because it has no positive image.

**Negation:** flip all bits, add 1. To negate $x = 5$ in 4-bit arithmetic:

$$x = \texttt{0101}_2, \quad \sim x = \texttt{1010}_2, \quad \sim x + 1 = \texttt{1011}_2 = -5$$

This works because $\sim x + x = \texttt{1111\ldots1}_2 = -1$ in two's complement, so $\sim x = -x - 1$, therefore $\sim x + 1 = -x$.

The pathological case: negating TMin overflows back to TMin. In 8-bit arithmetic, $-(-128) = -128$. This is not a hardware defect; it follows directly from the definition. Compilers know this — GCC's `-ftrapv` flag inserts overflow checks, but production code rarely uses it.

### Unsigned vs. Signed Casting

Casting between signed and unsigned at the same bit width **preserves the bit pattern and changes only the interpretation**. The mathematical relationship is:

$$U2T_w(u) = \begin{cases} u & u \leq 2^{w-1}-1 \\ u - 2^w & u > 2^{w-1}-1 \end{cases}$$

$$T2U_w(x) = \begin{cases} x & x \geq 0 \\ x + 2^w & x < 0 \end{cases}$$

So `(int32_t)0xFFFFFFFFU` is $-1$ and `(uint32_t)(-1)` is $4294967295$ — same 32 bits, different interpretation. The C standard mandates this behavior for casts; the machine never moves any data.

In C, when a signed and unsigned operand meet in an arithmetic expression, the signed operand is **implicitly converted to unsigned** (the "usual arithmetic conversions"). This is the source of a large class of bugs.

### Fixed-Point Representation

Fixed-point encoding reuses unsigned or two's complement bit patterns but shifts the implied binary point. If $k$ bits are designated as the fractional part, bit position $i$ carries weight $2^{i-k}$ rather than $2^i$. The hardware is unchanged — you are redefining what the number means.

For a 16-bit value with 8 fractional bits (Q8 format), the value $1.5$ is stored as:

$$1.5 \times 2^8 = 384 = \texttt{0x0180}$$

Multiplication of two Q8 values produces a Q16 result; you must right-shift by 8 to normalize back to Q8. This is why fixed-point code is full of explicit shifts. The Linux kernel uses fixed-point arithmetic in the scheduler (`kernel/sched/`) for load-average calculations: the 1/5/15-minute load averages in `/proc/loadavg` are maintained as Q11 fixed-point integers internally.

### IEEE 754 Floating Point

IEEE 754 encodes a real number as $(-1)^s \times M \times 2^E$. A 32-bit `float` partitions its 32 bits as:

| Field | Bit(s) | Width | Purpose |
|---|---|---|---|
| Sign $s$ | 31 | 1 | 0 = positive |
| Biased exponent | 30–23 | 8 | Encodes $E + 127$ |
| Fraction | 22–0 | 23 | Fractional part of significand |

The stored exponent uses **bias encoding**: $E = \texttt{exp} - 127$ for normalized values. Bias was chosen over two's complement for the exponent field specifically so that floating-point values can be compared correctly using integer comparison hardware — a greater magnitude gives a larger bit pattern.

For **normalized** numbers (exponent field in $[1, 254]$), the significand $M = 1.\texttt{frac}$ — the leading 1 is implicit, buying 24 bits of precision from 23 stored bits.

For **denormalized** numbers (exponent field = 0), $M = 0.\texttt{frac}$ and $E = -126$ (not $-127$). This **gradual underflow** lets the representable range near zero taper smoothly to 0.0, rather than jumping from the smallest normalized value to zero. Without it, $x - y = 0$ could occur with $x \neq y$, breaking basic arithmetic invariants.

Special encodings:

| Exponent field | Fraction field | Value |
|---|---|---|
| `0x00` | 0 | $\pm 0$ |
| `0x00` | $\neq 0$ | Denormalized |
| `0x01`–`0xFE` | any | Normalized |
| `0xFF` | 0 | $\pm\infty$ |
| `0xFF` | $\neq 0$ | NaN |

The gap between 1.0 and the next representable `float` is $2^{-23} \approx 1.19 \times 10^{-7}$, called the **machine epsilon**. For `double` it is $2^{-52} \approx 2.22 \times 10^{-16}$. This bounds relative rounding error per operation — it does not bound accumulated error across many operations.

---

## How It Works

### Two's Complement Overflow

Overflow in $w$-bit two's complement addition is defined by truncation — discard any carry out of bit $w-1$:

$$x +^t_w y = \begin{cases} x + y - 2^w & x + y \geq 2^{w-1} \quad \text{(positive overflow)} \\ x + y + 2^w & x + y < -2^{w-1} \quad \text{(negative overflow)} \\ x + y & \text{otherwise} \end{cases}$$

In 4-bit arithmetic ($w=4$, TMax $= 7$, TMin $= -8$): $5 + 5 = 10$, but $10 \geq 8 = 2^3$, so the result is $10
