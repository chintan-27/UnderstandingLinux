---
id: 71
title: "Compiler optimizations"
supermoduleId: 6
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Systems A Programmers Perspective (Bryant)"
  - type: book
    title: "The C Programming Language (K&R)"
---

## Why This Matters

When you write `for (i = 0; i < n; i++) result += a[i] * b[i]`, the compiler does not emit one multiply and one add per iteration. It transforms, reorders, and parallelizes your code in ways that determine whether a loop runs at its **latency bound** — one result per 5 clock cycles for double-precision multiply — or its **throughput bound** — one result per 0.5 cycles when the hardware's execution units are fully pipelined. The difference is not cosmetic: a 10× gap in performance can exist between two loops that are semantically identical but structurally different in ways that block or enable these transformations. Without understanding inlining, alias analysis, vectorization, and loop restructuring, you cannot reason about profiler output, cannot make sense of assembly listings, and will write "optimized" code that the compiler silently pessimizes.

---

## Core Concepts

### Inlining

When a function is inlined, the compiler substitutes the callee's body at the call site. The obvious benefit — eliminating register-save/restore, frame setup, and the call/return branch — is secondary to the real one: **inlining exposes the callee's code to the surrounding optimization context**. A bounds-checking accessor called in a tight loop may contain a branch the compiler cannot eliminate in isolation. Once inlined, the compiler can see the loop's induction variable range, prove the index is always valid, and delete the branch entirely. This is the CSAPP `combine2` → `combine3` transformation: replacing `get_vec_element()` with a direct pointer access removes a redundant bounds check that was opaque across the call boundary.

The compiler's inlining decision is driven by a cost model: estimated instruction count of the callee, call-site frequency (hot vs. cold path), and whether the function is `static` (visible only to the current translation unit). `__attribute__((always_inline))` overrides the cost model unconditionally; `__attribute__((noinline))` prevents it. Flags:

```bash
gcc -O2 -finline-functions          # heuristic inlining, included in -O2
gcc -O3                             # more aggressive; widens inlining threshold
gcc -finline-limit=1000             # manually raise instruction-count threshold
gcc -fno-inline                     # disable all inlining (useful when profiling)
```

To see which functions were or were not inlined and why:

```bash
gcc -O2 -fopt-info-inline -c foo.c
```

### Alias Analysis

Two pointers **alias** if they can legally refer to the same memory location at the same time. When the compiler cannot prove non-aliasing, it must treat every store as a potential modification of every subsequent load — it cannot cache a pointed-to value in a register across a write. This conservative treatment blocks hoisting, CSE (common subexpression elimination), and vectorization simultaneously.

```c
/* Compiler must reload *dest on every iteration:
   dest might point into data[], so data[i] might change *dest. */
void combine(double *dest, double *data, long n) {
    for (long i = 0; i < n; i++)
        *dest = *dest + data[i];
}
```

Moving the accumulation into a local variable removes the ambiguity:

```c
void combine4(double *dest, double *data, long n) {
    double acc = *dest;             /* load once */
    for (long i = 0; i < n; i++)
        acc += data[i];
    *dest = acc;                    /* store once */
}
```

The compiler now knows `acc` lives in a register; no pointer can alias a local scalar that has never had its address taken. This is sufficient for the optimizer without any keyword.

The C99 `restrict` keyword makes the non-aliasing promise at the interface level, enabling cross-call optimization and vectorization:

```c
void scale(double *restrict a, const double *restrict sf, long n) {
    for (long i = 0; i < n; i++)
        a[i] *= *sf;   /* *sf hoisted out of loop: no aliasing possible */
}
```

Without `restrict`, the compiler must reload `*sf` on every iteration because writing `a[i]` could change what `*sf` reads (if `sf == &a[j]` for some `j`). With `restrict`, that case is undefined behavior — the programmer vouches it won't happen — and the load is hoisted.

**The strict aliasing rule** is a related but distinct mechanism. C's type system says that an object of type `T` may only be accessed through a pointer to `T`, `char *`, or a compatible type. The compiler uses this to infer non-aliasing between pointers of different types, without any `restrict`. Violating it (casting `int *` to `float *` and dereferencing) produces code that is correct at the C level but wrong after optimization, because the compiler assumed the two accesses couldn't touch the same bytes. `-fno-strict-aliasing` disables this inference; it exists because large codebases (the Linux kernel, for instance) deliberately violate strict aliasing in ways that are semantically well-defined on their target platforms.

### Loop Optimizations

**Loop unrolling** reduces per-iteration overhead — branch prediction slots, loop counter decrements, condition evaluations — by processing $k$ elements per iteration. For $k = 2$:

```c
for (i = 0; i < limit; i += 2) {
    acc += data[i];
    acc += data[i+1];
}
```

The number of branch instructions drops by a factor of $k$. But if every operation feeds the same accumulator, the **critical path** is unchanged: each `acc += ...` depends on the result of the previous one. For double-precision multiply (latency $L = 5$ cycles, throughput $T = 0.5$ cycles/op):

$$\text{CPE}_{\text{latency bound}} = L = 5.00 \text{ cycles/element}$$

Unrolling alone does not change this.

**Multiple accumulators** break the dependency chain by creating $k$ independent accumulation variables:

```c
for (i = 0; i < limit; i += 2) {
    acc0 += data[i];
    acc1 += data[i+1];
}
result = acc0 + acc1;
```

Now `acc0` and `acc1` form two independent chains. The hardware can issue both multiplications simultaneously (or interleave them across pipeline stages). Two results complete every $L$ cycles instead of one:

$$\text{CPE}_{k \times k} = \frac{L}{k} \quad \text{(until throughput bound } T \text{ is reached)}$$

For $k = 2$, double multiply: $\text{CPE} = 5/2 = 2.50$. The throughput bound is $T = 0.5$ cycles/op, reached when $k \geq L/T = 5/0.5 = 10$ accumulators.

**Note on floating-point associativity.** Multiple accumulators change the order of floating-point additions. Because floating-point addition is not associative, this transformation is not valid under `-O1` or `-O2` by default. You must pass `-fassociative-math` (or `-ffast-math`, which implies it) to allow the compiler to do this automatically. When you write the multiple-accumulator loop by hand, you accept the responsibility for any change in rounding behavior.

**Loop unrolling in gcc.** The compiler performs unrolling automatically at `-O3` and with `-funroll-loops`. To control the factor:

```bash
gcc -O2 -funroll-loops -fpeel-iterations=4 foo.c
```

**Jump-to-middle vs. guarded-do.** `gcc` compiles `while` loops using one of two strategies. *Jump-to-middle* unconditionally jumps to the loop test before the first iteration, then falls through to the body. *Guarded-do* inserts a pre-entry test (`if (n <= 0) goto done`) and then emits the body as a `do-while`, which has no backward branch to the test. Guarded-do is preferred because a `do-while` body has one branch (back-edge), not two (back-edge plus condition re-entry). `gcc -O1` and above prefer guarded-do when the entry condition can be simplified.

### Vectorization (SIMD)

x86 vector registers and their widths:

| Register set | Width | Floats (32-bit) | Doubles (64-bit) | ISA extension |
|---|---|---|---|---|
| XMM | 128 bits | 4 | 2 | SSE2 |
| YMM | 256 bits | 8 | 4 | AVX |
| ZMM | 512 bits | 16 | 8 | AVX-512 |

Auto-vectorization replaces a scalar loop with a SIMD loop processing $w$ elements per instruction, where $w$ is the vector width divided by element size. For a loop to vectorize, the compiler needs: (1) independent iterations, (2) provable non-aliasing, and (3) a trip count known or checkable at runtime (the compiler emits a scalar prologue for the remainder $n \bmod w$).

The CPE improvement is ideally linear in $w$:

$$\text{CPE}_{\text{vector}} = \frac{\text{CPE}_{\text{scalar}}}{w}$$

For double-precision addition, scalar CPE = 1.00, AVX $w = 4$:

$$\text{CPE}_{\text{vector}} = \frac{1.00}{4} = 0.25 \text{ cycles/element}$$

In practice, gather/scatter instructions (non-contiguous access), alignment penalties, and loop remainder handling reduce this, but the directional improvement is reliable.

To enable AVX2:

```bash
gcc -O2 -mavx2 -march=native foo.c
```

To inspect what was vectorized and what blocked vectorization:

```bash
gcc -O2 -mavx2 -fopt-info-vec-missed foo.c
```

To read the generated SIMD instructions:

```bash
objdump -d -M intel foo.o | grep -E 'ymm|vmul|vadd'
```

---

## How
