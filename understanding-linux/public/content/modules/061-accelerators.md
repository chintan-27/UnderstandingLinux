---
id: 61
title: "Accelerators"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Core Concepts
### GPU as a SIMT Parallel Processor
A Graphics Processing Unit (GPU) executes many threads in parallel using the **Single‑Instruction, Multiple‑Thread (SIMT)** model. Unlike a CPU core that fetches and decodes one instruction per hardware thread, a GPU groups threads into **warps** (NVIDIA) or **wavefronts** (AMD) of 32 or 64 threads that share a single program counter.  
*Why?* The graphics pipeline historically required the same operation (e.g., vertex transformation) to be applied to millions of vertices. By sharing instruction fetch and decode across a warp, the GPU reduces control‑logic area and can allocate far more arithmetic units per mm² than a CPU.  

### Thread Hierarchy and Execution Model
- **Thread** – the smallest unit of execution; has a private register file and a unique 3‑D ID (`threadIdx.x/y/z`).  
- **Warp** – 32 consecutive threads that execute in lock‑step; divergence (different branches) causes the warp to serialize the divergent paths, reducing utilization.  
- **Thread Block** – up to 1024 threads (or limited by registers/shared memory) that cooperate via `__syncthreads()` and share **shared memory**. Blocks are scheduled to **Streaming Multiprocessors (SMs)**.  
- **Grid** – a collection of blocks that launches a kernel; the grid dimension is chosen to cover the problem size.  

*Why this hierarchy?* It maps naturally to data‑parallel problems: each block works on a tile of data that fits in shared memory, while the grid scales to arbitrary problem sizes. The block‑level synchronization enables cooperative loading and communication without going to global memory.

### Memory Hierarchy and Latency Hiding
| Level | Typical Size (per SM) | Access Latency (cycles) | Purpose |
|-------|----------------------|--------------------------|---------|
| Registers | 256 KB (≈64 K 32‑bit regs) | ~0 | Private, fastest storage for loop induction, pointers. |
| Shared Memory (L1) | 64–163 KB | ~20 | Manually managed user‑controlled cache; enables data reuse and reduces global traffic. |
| L1 Cache | 128 KB | ~30–40 | Transparent cache for loads/stores that are not explicitly placed in shared memory. |
| L2 Cache | 1–4 MB (GPU‑wide) | ~150–200 | Second‑level cache shared across SMs; captures spillover from L1. |
| Global Memory (DRAM) | 4–80 GB | ~400–800 | Main GPU‑resident storage; high latency, high bandwidth. |

*Why does this matter?* To keep the many ALUs busy, the GPU must hide memory latency by having enough warps ready to issue instructions while others wait for data. If each warp issues one instruction every 4 cycles and a global load takes 400 cycles, we need at least `400/4 = 100` active warps per SM to saturate the pipeline. This occupancy requirement drives register and shared‑memory usage limits: each block consumes registers and shared memory; exceeding limits reduces the number of resident blocks and thus occupancy.

### DMA‑Heavy Data Movement
GPUs have limited on‑die memory; most data lives in system RAM or GPU VRAM. Moving data across the PCIe bus without CPU intervention is done by **Direct Memory Access (DMA)** engines embedded in the GPU.  
*Why DMA?* The CPU would otherwise stall on each copy, wasting cycles and limiting overlap of compute and transfer. DMA allows the CPU to launch a kernel and, concurrently, have the GPU pull the next batch of data while the current batch is processed.

### Offload Models
- **CUDA** (NVIDIA): Exposes a C‑like language with explicit memory alloc (`cudaMalloc`), copy (`cudaMemcpy`), and kernel launch (`<<<>>>`). The driver sets up DMA transfers behind the scenes.  
- **OpenCL** (vendor‑neutral): Uses a C‑99‑based kernel language, platform/runtime API for device discovery, buffer creation (`clCreateBuffer`), and command‑queue submission. The same DMA principle applies, but the API abstracts over vendors.  

Both models require the programmer to manage data lifetimes explicitly; unified memory (CUDA) or SVM (OpenCL) can hide copies but still rely on DMA under the hood and may incur page‑fault overhead.

## How It Works
### Warp Scheduling and Issue
Each SM contains ** warp schedulers** (typically 4) that pick eligible warps each cycle. A warp is eligible if:
1. Its next instruction’s operands are ready (registers or shared memory resolved).  
2. No structural hazard (e.g., two warps trying to use the same special function unit).  

The scheduler issues the instruction to the appropriate execution unit (CUDA cores for integer/FP, SFUs for transcendentals, LD/ST units for memory).  

### Memory Coalescing
For global memory accesses, the hardware combines the 32 addresses of a warp into **cache‑line transactions** (typically 128 B). If the 32 threads access contiguous 32‑bit words, the warp generates a single 128‑B transaction (ideal coalescing). If the pattern is strided or random, the transaction may expand to multiple lines, reducing effective bandwidth.  

*Derivation of effective bandwidth:*  
Let `B_peak` be the raw DRAM bandwidth (e.g., 900 GB/s). If a warp’s access pattern yields an average of `ϕ` cache lines per warp, the achieved bandwidth is `B_eff = B_peak / ϕ`. Coalescing aims for `ϕ = 1`.  

### Occupancy Calculation
Occupancy = (active warps per SM) / (maximum warps per SM).  
Maximum warps per SM = `max_threads_per_SM / warp_size`. For an NVIDIA Ampere SM: 2048 threads / 32 = 64 warps max.  

If each block uses `R` registers per thread and `S` bytes of shared memory, the limits are:
- Register limit: `max_blocks_by_reg = floor( total_regs_per_SM / (R * block_threads) )`
- Shared‑memory limit: `max_blocks_by_smem = floor( total_smem_per_SM / S )`
- Block‑limit: `max_blocks_by_count = max_blocks_per_SM` (often 32)

The active warps per SM = `min(max_blocks_by_reg, max_blocks_by_smem, max_blocks_by_count) * (block_threads / warp_size)`.  

*Why is this useful?* It tells you whether you are limited by registers, shared memory, or block count, guiding optimizations (e.g., reduce register usage via `-maxrregcount` or tiling to lower shared memory).

### Latency Hiding Example
Assume:
- Global load latency `L = 400` cycles.  
- Issue width `I = 2` instructions per cycle per warp (typical for ALU).  
- Each warp needs `n_load = 2` loads per iteration (e.g., loading A and B elements).  

To hide latency, we need enough warps such that while one warp waits for its load, others can issue ALU instructions. The number of warps required `W_req` satisfies:  
`W_req * I >= L * n_load` → `W_req >= (L * n_load) / I = (400 * 2) / 2 = 400`.  

Since a single SM can hold at most 64 warps, we rely on **multiple SMs** and **instruction-level parallelism** (each warp can have multiple independent instructions in flight). In practice, we also rely on **out‑of‑order execution** within the warp and **prefetching** via shared memory to reduce `n_load`.

## Worked Examples
### Example 1: Tiled Matrix Multiplication (CUDA)
We multiply `C = A * B` where `A, B, C` are `N × N` float matrices stored row‑major. The naïve kernel (shown in the draft) suffers from low memory reuse: each element of `A` and `B` is read `N` times.

#### Tiling Strategy
Choose a tile size `T` (multiple of warp size, e.g., 32). Each block computes a `T × T` sub‑matrix of `C`. Within the block, we load a `T × T` tile of `A` and a `T × T` tile of `B` into shared memory, then compute the partial dot product.

**Kernel code**
```c
#define TILE 32   // must be multiple of warp size

__global__ void matMulTiled(const float *A, const float *B, float *C, int N)
{
    __shared__ float As[TILE][TILE];
    __shared__ float Bs[TILE][TILE];

    int bx = blockIdx.x, by = blockIdx.y;
    int tx = threadIdx.x, ty = threadIdx.y;

    int row = by * TILE + ty;
    int col = bx * TILE + tx;
    float sum = 0.0f;

    for (int t = 0; t < (N + TILE - 1) / TILE; ++t) {
        // Load tile of A and B into shared memory (coalesced)
        if (row < N && t * TILE + tx < N)
            As[ty][tx] = A[row * N + t * TILE + tx];
        else
            As[ty][tx] = 0.0f;

        if (col < N && t * TILE + ty < N)
            Bs[ty][tx] = B[(t * TILE + ty) * N + col];
        else
            Bs[ty][tx] = 0.0f;

        __syncthreads();  // ensure tile is fully loaded

        // Compute partial product
        for (int k = 0; k < TILE; ++k)
            sum += As[ty][k] * Bs[k][tx];

        __syncthreads();  // before loading next tile
    }

    if (row < N && col < N)
        C[row * N + col] = sum;
}
```

#### Step‑by‑step Reasoning
1. **Tile selection**: `TILE = 32` gives 1024 threads per block (max for many GPUs) and ensures each warp loads a contiguous 128‑byte segment (32 × 4 B) → perfect coalescing.  
2. **Shared memory usage**: Each tile needs `2 * TILE * TILE * sizeof(float) = 2 * 32 * 32 * 4 = 8 KB`. With 64 KB of shared memory per SM, we can host up to 8 blocks (limited also by registers).  
3. **Register usage**: Each thread uses ~5 registers (`row, col, sum, tx, ty, bx, by, t`). Well under typical limits, so occupancy is not register‑bound.  
4. **Memory traffic reduction**:  
   - Naïve: each of the `N^2` output elements reads `N` elements of `A` and `N` of `B` → `2 * N^3` reads.  
   - Tiled: each tile of `A` and `B` is read once per block column/row. Total reads ≈ `2 * N^2 * (N/TILE) * TILE * sizeof(float) = 2 * N^3 * sizeof(float)`? Wait, that's the same count; the benefit is **reuse**: each loaded element participates in `TILE` dot‑product computations instead of just one. Thus the **arithmetic intensity** (FLOPs/byte) rises from `0.25` to roughly `TILE/2`. For `TILE=32`, AI ≈ 16 FLOP/byte, moving the kernel from memory‑bound toward compute‑bound on modern GPUs.  
5. **Performance estimate** (using Ampere A100: `B_peak = 1.5 TB/s`, `FLOP_peak = 19.5 TFLOP` FP32):  
   - Naïve: `P = min(FLOP_peak, B_peak * AI_naive) = min(19.5, 1.5e12 * 0.25) = 375 GFLOP/s`.  
   - Tiled (`AI ≈ 16`): `P = min(19.5, 1.5e12 * 16) ≈ 19.5 TFLOP/s` (compute‑bound). In practice we achieve ~12–15 TFLOP/s due to imperfect occupancy and instruction overhead.  

#### Timing Calculation (illustrative)
Assume we measure kernel time `t` for `N=4096`.  
- FLOPs = `2 * N^3 = 2 * 4096^3 ≈ 1.37e11`.  
- If measured `t = 8 ms`, achieved FLOP/s = `1.37e11 / 0.008 = 17.1 TFLOP/s`, close to the compute roof.

### Example 2: Separable Convolution (OpenCL) – Image Blur
We apply a 3×3 box blur (separable into horizontal then vertical passes) to an RGBA8 image.

**OpenCL kernel (horizontal pass)**
```c
// sampler uses clamp-to-edge and normalized coordinates
sampler_t smp = CLK_NORMALIZED_COORDS_FALSE |
                CLK_ADDRESS_CLAMP_TO_EDGE |
                CLK_FILTER_NEAREST;

__kernel void blur_horizontal(
    read_only  image2d_t src,
    write_only image2d_t dst,
    const int width,
    const int height)
{
    int x = get_global_id(0);
    int y = get_global_id(1);
    if (x >= width || y >= height) return;

    // read three neighboring pixels
    float4 p0 = read_imagef(src, smp, (int2)(x-1, y));
    float4 p1 = read_imagef(src, smp, (int2)(x,   y));
    float4 p2 = read_imagef(src, smp, (int2)(x+1, y));

    float4 blur = (p0 + p1 + p2) * 0.33333f;
    write_imagef(dst, smp, (int2)(x, y), blur);
}
```
The vertical pass is identical but swaps x/y.

**Why separable?**  
A 2‑D 3×3 blur needs 9 reads per output pixel (9 × 4 B = 36 B). Splitting into two 1‑D passes needs 3 reads per pass → 6 reads total (24 B), a 33% reduction in memory traffic. The arithmetic intensity rises from `2 FLOPs / 36 B ≈ 0.056` to `2 FLOPs / 24 B ≈ 0.083`, still memory‑bound but significantly better.  

**Boundary handling:** The sampler’s `CLK_ADDRESS_CLAMP_TO_EDGE` replicates edge pixels, avoiding explicit conditionals and warp divergence.

**Performance note:** On an integrated Intel GPU (Gen12, `B_peak ≈ 68 GB/s`), the horizontal pass achieves ~0.5 GB/s per thread; with 1024‑thread workgroups the GPU saturates its memory controller, demonstrating that even simple stencil benefits from careful access patterns.

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Hurts Performance |
|---|---------|--------------|---------------------------|
| 1 | **Ignoring warp divergence** | Writing kernels where threads in a warp take different branches (e.g., `if (tid % 2) { … } else { … }`). | The warp executes both paths serially, halving effective throughput. On divergent-heavy code, occupancy may stay high but *utilization* drops. |
| 2 | **Misaligned or non‑coalesced global accesses** | Accessing `A[tid * stride]` where `stride` is not 1, or using `float2` with odd address. | Each warp issues multiple memory transactions, increasing `ϕ` in the bandwidth formula and reducing `B_eff`. May also cause L2 cache thrashing. |
| 3 | **Over‑subscribing registers** | Launching kernels with many local variables or large structs, causing register usage > 64 per thread. | Reduces the number of resident blocks per SM, lowering occupancy and thus latency‑hiding capability. Use `nvcc --ptxas-options=-v` to inspect register count and `-maxrregcount` to limit. |
| 4 | **Assuming unified memory eliminates copies** | Relying on `cudaManaged` pointers without prefetching or advising. | Page faults on first access trigger synchronous DMA stalls; performance can be worse than explicit `cudaMemcpy` if access patterns are not uniform. |
| 5 | **Neglecting error checking** | Not testing return codes of `cudaMalloc`, `clCreateBuffer`, or `ioctl`. | Silent failures lead to undefined behavior, corrupted output, or GPU hangs that are hard to debug. |
| 6 | **Using `__syncthreads()` inside divergent control flow** | Placing a barrier inside an `if` that not all threads enter. | Causes deadlock: threads that skip the barrier wait forever for others that never reach it. |

## Exercises
### Easy – Exploration & Tooling
1. **Device Query**  
   Run `nvidia-smi` (NVIDIA) or `rocm-smi` (AMD) and note: GPU name, compute capability (or GPU architecture), total memory, and current utilization.  
   *Linux:* `lspci -vnn | grep -A1 -i vga` to see the PCIe device ID and driver in use.  
2. **OpenCL Info**  
   Execute `clinfo` (install via `apt install clinfo`) and list all platforms, devices, and their `CL_DEVICE_MAX_CLOCK_FREQUENCY`, `CL_DEVICE_MAX_MEM_ALLOC_SIZE`, and `CL_DEVICE_MAX_COMPUTE_UNITS`.  

### Medium – Kernel Optimization
3. **Tiled Matrix Multiplication**  
   - Implement the naïve kernel from the draft (no tiling).  
   - Implement the tiled kernel shown above.  
   - For `N = 2048, 4096, 8192`, measure execution time with `cudaEventElapsedTime` (or OpenCL profiling events).  
   - Plot achieved GFLOP/s vs. `N` and compare to the roofline model using the measured memory bandwidth (`cudaMemGetInfo` or `clGetDeviceInfo` for `CL_DEVICE_GLOBAL_MEM_BANDWIDTH`).  
   - Explain any deviations (e.g., register pressure, shared memory bank conflicts).  

4. **Separable Convolution**  
   - Write OpenCL code for horizontal and vertical passes (as in the example).  
   - Compare to a naïve 2‑D 3×3 convolution kernel that reads nine neighbors directly.  
   - Measure throughput (megapixels/sec) on both an integrated GPU (Intel Iris Xe) and a discrete GPU (NVIDIA RTX 3060).  
   - Discuss why the speed‑up differs between architectures.  

### Hard – Advanced Profiling & Analysis
5. **Occupancy Experiment**  
   - Write a simple “noop” kernel that does only a few arithmetic ops per thread.  
   - Vary block size (128, 256, 512, 1024) and deliberately increase register usage via `volatile` arrays or `-maxrregcount`.  
   - Use `nvprof`/`nsight compute` or `rocprof` to collect achieved occupancy, achieved bandwidth, and stall reasons.  
   - Produce a roofline chart (compute vs. memory bound) and pinpoint the bottleneck for each configuration.  

6. **Multi‑GPU Peer‑to‑Peer**  
   - On a machine with two NVLink‑connected GPUs, allocate buffers on each GPU with `cudaMalloc`.  
   - Enable peer access (`cudaDeviceEnablePeerAccess`) and copy data directly between GPUs (`cudaMemcpyPeer`).  
   - Measure bandwidth with a bidirectional ping‑pong benchmark and compare to PCIe‑mediated transfers
