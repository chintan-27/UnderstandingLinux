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

## Core Concepts
### Inlining
Inlining replaces a call site with the callee’s body, eliminating the call‑and‑return sequence.  
The overhead of a call on x86‑64 is roughly **5–10 cycles** (push rbp, mov rbp, rsp, call, ret). If a function’s body executes in **≤ 3 cycles**, the call dominates runtime. Inlining is therefore profitable when  

$$
\text{call\_overhead} > \text{body\_latency}
$$

Modern compilers use heuristics based on function size (estimated in IR instructions) and call‑site frequency (from profiling or static branch probabilities).  
*Why it matters*: reduces branch misprediction pressure and enables further optimizations (constant propagation, dead‑code elimination) across the formerly separate scopes.

### Vectorization
Vectorization transforms scalar operations into SIMD instructions that operate on **W** data lanes per instruction (e.g., **W = 4** for SSE, **W = 8** for AVX2, **W = 16** for AVX‑512).  
For a loop of **N** iterations each doing **α** scalar operations, the scalar latency is  

$$
T_{\text{scalar}} = N \cdot \alpha \cdot t_{\text{op}}
$$

where *tₒₚ* is the per‑operation latency (≈ 1 cycle for a fused‑multiply‑add on modern CPUs).  
If the loop is perfectly vectorizable, the vector latency becomes  

$$
T_{\text{vec}} = \left\lceil \frac{N}{W} \right\rceil \cdot \alpha \cdot t_{\text{op}} + t_{\text{setup}}
$$

*Setup* includes prologue/epilogue to handle misaligned tails. The speed‑up approximates  

$$
S \approx \frac{W}{1 + \frac{W \cdot t_{\text{setup}}}{N \cdot \alpha \cdot t_{\text{op}}}}
$$

Thus vectorization wins when **N ≫ W** and the memory subsystem can supply **W** elements per cycle (bandwidth‑bound vs. latency‑bound).

### Alias Analysis
Two pointers *p* and *q* may alias if they could refer to the same memory location. If the compiler cannot prove *p* and *q* are disjoint, it must conservatively reload after each store through *q* to preserve correctness.  
Alias analysis builds a points‑to graph; in SSA form each variable has a single definition, simplifying dependence testing.  
*Why it matters*: enables **load‑store motion**, **store‑to‑load forwarding**, and **loop‑carried dependence elimination**. Without it, many loop optimizations would be unsafe.

### Loop Optimizations
| Technique | Transformation | When profitable |
|-----------|----------------|-----------------|
| **Unrolling** | Replicates loop body *U* times, increments index by *U·stride*. Reduces branch frequency; exposes ILP. | Loop body latency **L** < branch misprediction penalty **≈ 15 cycles**; register pressure acceptable. |
| **Fusion** | Merges two adjacent loops with identical iteration space into one. | Improves cache reuse: reduces total passes over data from 2→1, cutting memory traffic by ~½. |
| **Tiling (Blocking)** | Splits iteration space into tiles of size *T×T* (for 2D) to improve temporal locality. | Working set per tile fits in L1/L2 cache: *T²·sizeof(elem) ≤ Ccache*. Reduces cache miss rate from *O(N²/B)* to *O(N²/(B·T))* where *B* is cache line size. |
| **Software Prefetch** | Inserts `__builtin_prefetch(ptr, 0, 3)` ahead of use. | Hides memory latency when load latency > compute latency and prefetch distance matches pipeline depth. |
| **Loop Distribution** | Splits a loop with independent statements into multiple loops. | Enables vectorization of each statement when mixed types prevent a single SIMD width. |

Each technique trades **instruction count** for **better pipeline utilization** or **lower memory traffic**; the compiler estimates the net effect using a cost model that incorporates latency, bandwidth, and resource constraints.

## How It Works
A modern optimizing compiler (e.g., GCC, LLVM) proceeds through distinct phases; each phase produces facts that later phases consume.

1. **Frontend** – Lexing → Parsing → AST → **High‑level IR** (GIMPLE in GCC, LLVM IR in Clang).  
   *Why*: Language‑agnostic representation enables uniform analyses.

2. **SSA Construction** – Variables renamed so each has a single static definition.  
   *Why*: Def‑use chains become explicit, simplifying data‑flow equations.

3. **Analysis Passes** (run on SSA IR)  
   - **Constant Propagation & Folding**: Solve a lattice of `{⊥, constant, ⊤}`; propagate known values.  
   - **Alias Analysis**: Build points‑to sets via Andersen’s or Steensgaard’s algorithm; compute *may‑alias* relation.  
   - **Dependence Analysis**: For loops, compute direction vectors (e.g., `<, =, >`) using the GCD test or Banerjee inequalities.  
   - **Branch Prediction Modeling**: Use static heuristics (`__builtin_expect`) or profile data to assign execution probabilities to edges.  

4. **Transformation Passes** (guided by analysis)  
   - **Inlining**: Replace call with callee body if `size(callee) < threshold × call_site_frequency`.  
   - **Vectorization**: Detect *reduction* or *elementwise* patterns; emit ISA‑specific shuffles and aligned/unaligned load/store intrinsics.  
   - **Loop Unrolling**: Duplicate body *U* times; adjust loop bound and epilogue.  
   - **Loop Tiling**: Introduce two nested loops; compute tile bounds `for (ti = 0; ti < N; ti += T) for (i = ti; i < min(ti+T, N); ++i)`.  
   - **Dead Code Elimination**: Remove instructions whose result is unused and have no side effects (checked via liveness).  

5. **Backend** – Instruction selection (DAG matching), register allocation (graph coloring), scheduling (list scheduling targeting issue width & latency).  
   *Why*: Maps IR to machine code while preserving earlier optimizations; scheduling can re‑expose ILP created by unrolling.

Each phase’s output is provably correct because transformations are justified by the properties proven in the preceding analyses (e.g., no aliasing ⇒ safe to move a load across a store).

## Worked Examples
### Example 1: Inlining with Cost Model
```c
static inline int mul3(int x) { return x * 3; }   // (1)

int foo(int a) {
    int y = mul3(a);      // (2)
    return y + 1;
}
```
Assume:
- Call overhead = 7 cycles (push rbp, mov rbp, call, ret).
- `mul3` body latency = 1 cycle (IMUL r32, r32, imm8).
- Call site frequency = 1 (called once per `foo`).

**Before inlining**  
`T_before = 7 (call) + 1 (mul3) + 1 (add) = 9 cycles`.

**After inlining** (compiler substitutes body)  
`T_after = 1 (mul3) + 1 (add) = 2 cycles`.

Speed‑up = 9/2 ≈ **4.5×**.  
If `mul3` were larger (e.g., 10 IR instructions), the compiler would compare `size(callee) = 10` against `inline‑hint = 30` (typical GCC `-finline-limit=30`) and decide not to inline.

### Example 2: Vectorization of a Dot Product
```c
float dot(const float *a, const float *b, size_t n) {
    float s = 0.0f;
    for (size_t i = 0; i < n; ++i)
        s += a[i] * b[i];
    return s;
}
```
Target: AVX2 (W = 8 floats per __m256).  
Assume memory bandwidth sufficient to stream 8 floats per cycle.

**Scalar latency per iteration**:  
`load a[i]` (1 cycle) + `load b[i]` (1 cycle) + `mul` (1 cycle) + `add` (1 cycle) = 4 cycles (ideal, ignoring port contention).

**Vectorized latency per 8‑elem chunk**:  
`vmovaps ymm0, [a+i]` (1) + `vmovaps ymm1, [b+i]` (1) + `vmulps ymm2, ymm0, ymm1` (1) + `vaddps ymm3, ymm2, ymm3` (1) = 4 cycles for 8 elements → **0.5 cycle/element**.

**Speed‑up**: 4 / 0.5 = **8×**, matching the SIMD width.  
Remainder handling (`n % 8`) adds at most 7 scalar iterations, negligible for large *n*.

### Example 3: Loop Tiling for Matrix‑Vector Multiply
```c
void mv(const float *A, const float *x, float *y, size_t n) {
    for (size_t i = 0; i < n; ++i) {
        float sum = 0.0f;
        for (size_t j = 0; j < n; ++j)
            sum += A[i * n + j] * x[j];
        y[i] = sum;
    }
}
```
Assume L1 data cache = 32 KB, cache line = 64 B, float = 4 B → **8 floats per line**.

Without tiling, inner loop streams `x[j]` (size *n*·4 B) repeatedly; if *n* > 8 K (≈ 32 KB/4), `x` does not fit in L1 → each inner iteration incurs a load miss.

**Choose tile size T** such that a tile of `x` plus a row of `A` fits in L1:  
`T * sizeof(float) (x tile) + n * sizeof(float) (row of A) ≤ 32 KB`.  
If *n* = 4096, row of A = 16 KB, leaving 16 KB for `x` tile → `T = 16 KB / 4 B = 4096`.  
Thus we can tile the *j* loop with `T = 256` (a safer power‑of‑two) to keep both tile and row in L1.

Transformed code:
```c
void mv_tiled(const float *A, const float *x, float *y, size_t n) {
    for (size_t i = 0; i < n; ++i) {
        float sum = 0.0f;
        for (size_t j0 = 0; j0 < n; j0 += 256) {
            size_t j_end = min(j0 + 256, n);
            // prefetch next tile of x
            __builtin_prefetch(x + j0 + 256, 0, 3);
            for (size_t j = j0; j < j_end; ++j)
                sum += A[i * n + j] * x[j];
        }
        y[i] = sum;
    }
}
```
**Performance model**:  
- Misses per inner loop without tiling: ≈ n · (1 miss per cache line) = n·(n/8) = n²/8.  
- With tile size T, each tile of `x` is loaded once per outer iteration: misses ≈ n·(n/T)·(T/8) = n²/8 (same) **but** each tile stays in L1 while processing the row, reducing *effective* miss penalty from main memory (~100 cycles) to L2/L3 (~10‑20 cycles).  
Thus the absolute number of misses stays similar, but the **latency per miss drops**, yielding a 2‑5× speed‑up for large *n* on realistic hierarchies.

## Common Mistakes
| Mistake | What’s wrong | Why it hurts |
|---------|--------------|--------------|
| **Assuming `-O3` always improves performance** | `-O3` enables aggressive inlining, vectorization, and `-ftree-loop-distribute-patterns`. It can increase code size dramatically, causing I‑cache thrashing. | Larger binaries raise instruction‑fetch latency; on CPUs with limited L1 I‑cache (e.g., 32 KB), the extra cycles spent fetching outweigh gains from ILP. |
| **Ignoring the `restrict` qualifier** | Declaring `float *restrict a, *restrict b` tells the compiler the pointers do not alias. Omitting it forces conservative reloads after each store. | Prevents vectorization and load‑store motion; inner loops remain scalar, losing SIMD width benefits. |
| **Using `-ffast-math` indiscriminately** | This flag allows reassociation of floating‑point operations, breaking IEEE‑754 guarantees (e.g., `(a+b)+c ≠ a+(b+c)`). | Can produce silently incorrect results in scientific code where reproducibility matters; performance gain may be illusory if the algorithm becomes numerically unstable. |
| **Over‑unrolling beyond register pressure** | Unrolling a loop with many live variables can exceed the number of available registers, causing spills to stack. | Each spill/additional load/store adds ~3‑5 cycles, negating the branch‑reduction benefit; performance may degrade. |
| **Misapplying `__builtin_expect`** | Marking the unlikely branch as likely (or vice‑versa) misguides the backend’s block layout. | Increases branch‑misprediction penalty; on a tight loop, a single misprediction can cost ~15 cycles, outweighing any predicted gain. |
| **Neglecting alignment requirements for SIMD** | Using `vmovaps` on an address not 32‑byte aligned raises a general‑protection fault (or incurs a costly unaligned load on some CPUs). | Leads to crashes or severe slowdowns; programmers must either ensure alignment (`alignas(32)`) or use the unaligned variant (`vmovups`). |

## Exercises
### 1. Easy – Manual Loop Unrolling
Take the following function and unroll it by a factor of 4. Show the resulting C code and compute the theoretical reduction in branch overhead assuming a 5‑cycle branch penalty and a loop body latency of 2 cycles.
```c
void scale(int *a, int n) {
    for (int i = 0; i < n; ++i)
        a[i] *= 3;
}
```

### 2. Medium – Enabling Safe Vectorization
Given the dot‑product function from Worked Example 2, modify it to:
- Add `restrict` qualifiers.
- Align the input arrays to 32 bytes (use `aligned_alloc` or `__attribute__((aligned(32)))`).
- Compile with `-O3 -march=native -ffast-math` and compare the assembly output (`objdump -d`) before and after the changes. Explain how the compiler’s vectorization decision changed.

### 3. Hard – Cache‑Blocking and Measurement
1. Write a program that multiplies a large dense matrix (size 8192×8192) by a vector, first with the naïve triple‑loop implementation, then with a tiled version (choose tile size based on your L2 cache size, which you can obtain via `lscpu`).
2. Build both versions with `-O2 -march=native`.
3. Run each under `perf stat -r 5 -e cycles,instructions,cache-misses,cache-references ./a.out` and record the average cycles per iteration.
4. Compute the observed speed‑up and compare it to the roofline model:  
   $$ \text{Performance} \le \min\bigl(\text{Peak FLOPS},\; \text{Memory Bandwidth} \times \text{Operational Intensity}\bigr) $$
   where operational intensity = FLOPs / bytes transferred. Discuss why the tiled version approaches the memory‑bound roof more closely.

## Linux Connection
### Kernel Build Optimizations
The Linux kernel is compiled with a series of make‑driven flags that enable aggressive optimizations while preserving correctness for preemption and debugging.

```bash
# Build with native micro‑architectural tuning and level‑3 optimizations
make -j$(nproc) KCFLAGS="-O3 -march=native -pipe"
```
*`-march=native`* tells GCC to enable all instruction sets detected on the host (AVX2, BMI2, etc.). The kernel’s Makefile respects `KCFLAGS` for extra CFLAGS.

#### Inlining in the Kernel
Many small helper functions are declared `static inline __always_inline` to force inlining even at `-O2`. Example from `include/linux/kernel.h`:

```c
static inline __always_inline void barrier(void)
{
    asm volatile("": : :"memory");
}
```
*Why*: The barrier prevents compiler reordering; inlining avoids the call overhead while keeping the asm visible to the optimizer.

#### Vectorization in Subsystems
*Crypto API*: Drivers such as `crypto/aesni-intel.asm` use explicit AVX2/AVX‑512 intrinsics. The generic C fallback (`crypto/aes_generic.c`) is compiled with `-ftree-vectorize` to allow the compiler to generate SIMD code when the hardware supports it.

```c
/* In crypto/aes_generic.c */
static void aes_encrypt(u8 *out, const u8 *in, const struct aes_ctx *ctx)
{
    for (int i = 0; i < 4; ++i)
        out[i] = in[i] ^ ctx->key[i];
    /* … */
}
```
When compiled with `-O3 -march=native`, GCC emits `vmovdqu`, `vpxor`, etc., processing 16 bytes per iteration.

#### Loop Tiling in the Page Allocator
The buddy allocator (`mm/page_alloc.c`) contains a *scan* loop that searches for a free page of a given order. To limit cache-line walks, it scans in *chunks* of `CONFIG_PAGE_ALLOCATOR_CHUNK_SIZE` (typically 512 pages). The inner loop is effectively tiled:

```c
for (unsigned long idx = start; idx < end; idx += BITMAP_CHUNK_SIZE) {
    unsigned long mask = bitmap_chunk(idx);
    if (mask)
        return find_bit idx;   // inner search within the chunk
}
```
*Why*: Guarantees that at most one cache line of the bitmap is touched per outer iteration, reducing miss rate.

#### Profiling with `perf`
To locate hot spots after building an optimized kernel:

```bash
# Record 10 seconds of system‑wide activity
sudo perf record -g -a sleep 10

# Generate a readable report
sudo perf report --stdio | less
```
Look for symbols with high `Overhead` percentages; if you see a lot of time in `native_smp_send_reschedule` or `mutex_spin_on_owner`, consider reducing lock contention or adjusting preemption flags (`CONFIG_PREEMPT_NONE`, `CONFIG_PREEMPT_VOLUNTARY`, `CONFIG_PREEMPT`).

#### Inspecting Generated Code
```bash
# Disassemble the vmlinux image with source intermix
sudo objdump -dS vmlinux | less -I
```
Search for `vmulps` or `vaddps` to verify vectorization, or for `jmp` patterns to see loop unrolling.

## Why This Matters
Compiler optimizations are not mystical black‑boxes; they are a series of provably correct transformations guided by precise analyses of data flow, control flow, and hardware characteristics. Understanding the **why** behind each pass lets you:

* **Write code that the optimizer can actually improve** – e.g., adding `restrict`, aligning data, keeping hot functions small enough for inlining.
* **Diagnose when the optimizer fails** – recognizing when register pressure, aliasing uncertainty, or branch prediction misleads the backend.
* **Exploit Linux‑specific tooling** – using `perf`, `objdump`, and kernel build flags to measure and tune real systems.
* **Balance trade‑offs** – knowing that aggressive `-O3` can blow I‑cache, that `-ffast-math` may break numerical contracts, and that loop tiling’s tile size must be derived from actual cache hierarchies.
* **Ultimately ship faster, more energy‑efficient software** – whether it’s a user‑space server handling millions of requests per second or the Linux kernel scheduling tasks on a data‑center rack, the cumulative effect of well‑applied optimizations translates into measurable latency reductions, higher throughput, and lower power consumption.

By mastering the underlying mechanisms—not just the flags—you turn compiler optimizations from a hopeful after‑tuning step into a principled lever for performance engineering.
