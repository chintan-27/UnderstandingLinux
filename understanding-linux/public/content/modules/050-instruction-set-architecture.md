---
id: 50
title: "Instruction set architecture"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Core Concepts
### Instruction Set Architecture as a Contract
The ISA is the *binary contract* between hardware and software: it specifies the exact bit patterns that the CPU will interpret as operations, the storage locations (registers) that may be read or written, and the ways memory addresses may be formed. Unlike a high‑level language API, the ISA leaves no room for interpretation—every valid program must produce the same observable state changes on any implementation that conforms to the contract.

### Encoding Hierarchy
An instruction is a fixed‑ or variable‑length bit field partitioned into:
- **Opcode** (`o` bits) – identifies the operation.
- **Register fields** (`r₁, r₂, …` bits) – select source/destination registers.
- **Immediate / displacement field** (`i` bits) – constant operand or address offset.
- **Mode bits** (`m` bits) – encode addressing mode, register indexing, scaling, etc.

For a typical x86‑64 instruction the average length is 3–5 bytes, but the length `L` (in bytes) is a function of the prefix count `p`, opcode bytes `op`, and the presence of a ModR/M, SIB, and displacement:
$$L = p + op + \begin{cases}
0 & \text{if no ModR/M}\\
1 & \text{if ModR/M present}\\
1 + \text{(SIB?)} & \text{if ModR/M indicates SIB}\\
+ \text{disp}_{8,32} & \text{if displacement present}
\end{cases}$$

### Register File
Registers are a small, fast storage array built from flip‑flops or latches inside the CPU core. Their read/write latency is typically 1 cycle, compared to ~4–10 cycles for L1 cache. The ISA defines:
- **General‑purpose registers** (e.g., `rax, rbx, rcx, rdx, rsi, rdi, rbp, rsp, r8‑r15` in x86‑64) – usable for any data.
- **Special registers** (e.g., `rip` instruction pointer, `eflags` status flags, `cr0‑cr4` control registers) – accessed only via privileged instructions.
- **SIMD/FP registers** (`xmm0‑xmm15`, `ymm0‑ymm15`, `zmm0‑zmm31`) – wider datapaths for vector operations.

### Addressing Modes – Deriving the Effective Address
The CPU computes an **effective address (EA)** from the instruction’s addressing mode fields. For the common *base + index × scale + displacement* form:
$$\text{EA} = \text{Base} + (\text{Index} \times \text{Scale}) + \text{Disp}$$
where:
- `Base` and `Index` are register contents (or zero if omitted),
- `Scale ∈ {1,2,4,8}` (encoded in 2 bits),
- `Disp` is a sign‑extended 8‑, 16‑, or 32‑bit immediate.

If either `Base` or `Index` is omitted, the corresponding term is zero. This formula explains why `mov eax, [ebx+esi*4]` loads a 32‑bit element from an array of 4‑byte integers whose base pointer is in `ebx` and index in `esi`.

### Privilege Levels and Protection Rings
The CPU maintains a **Current Privilege Level (CPL)** in the low two bits of the `cs` segment selector. The ISA defines:
- **Ring 0 (CPL = 0)** – kernel mode: unrestricted access to `cr*` registers, I/O ports, and the ability to execute privileged instructions (e.g., `cli`, `hlt`, `lgdt`).
- **Ring 3 (CPL = 3)** – user mode: restricted to a subset of instructions; any attempt to execute a privileged instruction triggers a #GP fault.

Transition rings occur via:
- **Software interrupts** (`int n`) – gates through the Interrupt Descriptor Table (IDT) with a Descriptor Privilege Level (DPL) that may lower CPL.
- **Syscall/Sysenter** – dedicated fast‑path instructions that switch to a predefined kernel code segment.
- **Hardware interrupts/exceptions** – automatically set CPL to the kernel segment’s DPL.

The *why*: hardware enforces protection by checking CPL against the DPL of target code segments before allowing control transfer; this prevents user code from arbitrarily gaining kernel privileges.

---

## How It Works
### Fetch‑Decode‑Execute Pipeline (Out‑of‑Order Core)
Modern CPUs decouple the ISA from micro‑architecture using a pipeline:
1. **Instruction Fetch (IF)** – The instruction pointer (`rip`) addresses the L1 I‑cache; a 16‑byte line is fetched. Branch predictors steer fetch to the likely path.
2. **Decode (ID)** – Variable‑length x86 bytes are translated into one or more *micro‑ops* (µops). The decoder uses a ROM‑based lookup table keyed by opcode bytes and prefix bits.
3. **Rename & Allocate** – Logical registers are mapped to physical registers to eliminate WAR/WAW hazards.
4. **Issue / Dispatch** – µops are placed in reservation stations awaiting operand readiness.
5. **Execute (EX)** – Functional units (ALU, AGU, FPU, SIMD) compute results. Address Generation Units (AGUs) compute EA using the formula above.
6. **Memory Access (MEM)** – Loads/stores hit L1 D‑cache; misses go to L2/L3 or DRAM.
7. **Write‑Back (WB)** – Results are written to the physical register file; the reorder buffer (ROB) retires instructions in program order.

### Timing Model
Let:
- `I` = dynamic instruction count,
- `CPI` = average cycles per instruction,
- `T_clk` = clock period.

Total execution time:
$$T_{exec} = I \times \text{CPI} \times T_{clk}$$

In an ideal 5‑stage pipeline with no stalls, CPI = 1. Real‑world CPI rises due to:
- **Branch mispredictions** (`p_mispred` × misprediction penalty),
- **Cache misses** (`mem_stalls` × miss latency),
- **Resource conflicts** (e.g., two µops needing the same ALU).

### Control Flow and Speculation
Branch prediction uses a 2‑bit saturating counter per branch direction. The predicted target is fetched speculatively; if the prediction fails, the pipeline flushes and incurs a penalty equal to the pipeline depth (typically 14‑19 stages in Intel Core). The *why*: speculation hides latency but must be rolled back correctly to preserve architectural state.

### Memory Consistency
The ISA defines a **memory ordering model** (x86‑64: Total Store Order, TSO). Stores may be buffered in the store buffer; loads may bypass earlier stores to different addresses but not to the same address (store‑to‑load forwarding). This guarantees that a programmer sees a consistent view without needing explicit fences for most code, yet permits high‑performance implementations.

---

## Worked Examples
### Example 1: Register‑to‑Register Add with Immediate
**Goal:** Compute `eax = eax + 5`.  
**Instruction:** `add eax, 5` → opcode `0x03`, ModR/M `0xC0` (reg‑reg), immediate `0x05`.

| Stage | Action | Detail |
|-------|--------|--------|
| IF    | Fetch 4 bytes from L1 I‑cache at `rip`. | Bytes: `03 C0 05 00 00 00 00` (actually 3 bytes: `03 C0 05`). |
| ID    | Decode opcode `0x03` → `ADD r/m32, r32`. ModR/M `0xC0` → `reg = eax (0)`, `r/m = eax`. Immediate = 5. | No displacement. |
| Rename| Map logical `eax` → physical `p0`. | Allocate ROB entry. |
| Issue | Place µop in ALU reservation station. | Operands: `p0` (current eax), immediate 5. |
| EX    | ALU adds `p0 + 5`. | Result ready in 1 cycle. |
| WB    | Write result to physical register `p0`. | ROB marks instruction retired; architectural `eax` updated. |
| Commit| Update `rip` → next instruction. | No side effects. |

**Result:** If initial `eax = 0x10`, final `eax = 0x15`.

### Example 2: Memory‑Indirect Add with Scaled Index
**Goal:** `eax = eax + A[ebx*4]` where `A` is an array of 32‑bit ints.  
**Instruction:** `add eax, [ebx*4]` → opcode `0x03`, ModR/M `0x04` (SIB required), SIB `0x28` (scale=2, index=ebx, base=none), disp=0.

**Effective Address Calculation:**
$$\text{EA} = 0 + (EBX \times 2^{2}) + 0 = EBX \times 4$$

Assume:
- `EBX = 0x00001000` (points to start of `A`),
- `A[0] = 0x00000007`,
- Initial `EAX = 0x00000003`.

Steps:
1. **Fetch** 3 bytes: `03 04 28`.
2. **Decode** → `ADD r/m32, r32`, SIB indicates `scale=2`, `index=EBX`, `base=none`.
3. **EA** = `EBX << 2` = `0x00004000`.
4. **Load** 4 bytes from memory at `0x00004000` → `0x00000007`.
5. **ALU** computes `0x00000003 + 0x00000007 = 0x0000000A`.
6. **Store** result back to `EAX`.

**Result:** `EAX = 0x0A`.

### Example 3: System Call via `int 0x80` (32‑bit Linux)
**Goal:** Invoke `write(fd=1, buf="Hello\n", len=6)` using the legacy int 0x80 interface.

```asm
section .data
msg db "Hello\n", 0x0A

section .text
global _start
_start:
    mov eax, 4          ; __NR_write
    mov ebx, 1          ; fd = stdout
    mov lea ecx, [msg]  ; pointer to buffer
    mov edx, 6          ; length
    int 0x80            ; transition to kernel
    mov eax, 1          ; __NR_exit
    xor ebx, ebx
    int 0x80
```

**Why it works:**
- `int 0x80` triggers a software interrupt; the CPU looks up vector 0x80 in the IDT.
- The IDT gate has DPL = 3, allowing user code to call it.
- Upon entry, hardware automatically:
  - Pushes `eflags`, `cs`, `eip` onto the kernel stack,
  - Loads `cs` and `eip` from the gate’s segment selector and offset (kernel code segment, CPL = 0),
  - Clears IF if the gate is an interrupt gate (disables further interrupts).
- Kernel entry stub (`system_call`) saves registers, dispatches to `sys_write` based on `eax`.
- After the syscall returns, the kernel restores user state and executes `iret`, restoring `eflags`, `cs`, `eip` and dropping CPL back to 3.

**Alternative:** On x86‑64, the same operation uses the `syscall` instruction (`rax=1` for write, `rdi=fd`, `rsi=buf`, `rdx=len`).

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Happens |
|---------|--------------|----------------|
| **Assuming a fixed opcode length** | Treating all instructions as 1 byte (or 4 bytes) leads to incorrect disassembly or branch target calculation. | x86 ISA uses variable length; prefixes (e.g., `0x66`, `0xF3`) and optional ModR/M/SIB/disp fields change size. Ignoring them yields mis‑aligned fetch streams. |
| **Neglecting sign‑extension of immediates** | Using an 8‑bit immediate as if it were unsigned when the instruction expects a signed value (e.g., `add al, -1`). | The ISA specifies that immediates in certain opcodes are sign‑extended to the operand width before use. Forgetting this produces off‑by‑256 errors. |
| **Misreading little‑endian layout** | Reading a 32‑bit constant from memory and interpreting the byte order as big‑endian. | x86 stores the least‑significant byte at the lowest address. Debuggers that display memory in hex‑dump format must be read accordingly. |
| **Believing all registers are interchangeable** | Using `esi` as a stack pointer or expecting `eax` to preserve its value across a function call without saving. | The ISA defines *calling conventions* (e.g., System V AMD64) that designate certain registers as caller‑saved vs callee‑saved. Violating them corrupts caller state. |
| **Thinking `int 0x80` is always fast** | Using the legacy interrupt for high‑frequency system calls in performance‑critical code. | `int 0x80` traps through the IDT, causing a full pipeline flush and micro‑code sequence (~100 cycles). The `syscall` instruction is a dedicated fast path (~30 cycles). |
| **Assuming address calculation is always a single cycle** | Modeling every `[base+index*scale+disp]` as 1 cycle AGU latency. | Complex AGUs may take multiple cycles if the address crosses a page boundary or requires a TLB walk; also, load‑store dependencies can stall the pipeline. |
| **Overlooking prefix effects on operand size** | Forgetting that the `0x66` operand‑size override switches between 16‑ and 32‑bit operands in 32‑bit mode. | This changes which portion of a register is accessed (e.g., `ax` vs `eax`). Ignoring it leads to silent truncation or sign‑extension bugs. |

---

## Exercises
### Easy
1. **Register Arithmetic** – Write NASM code that computes `result = (a * b) + c` using only `eax`, `ebx`, `ecx`, and `edx`. Use `imul` for multiplication and `add` for the sum. Show the final value in `eax`.
2. **Zero‑Terminated String Length** – Implement `strlen` with `repne scasb`. Load the string address into `edi`, set `ecx = -1`, `al = 0`, and repeat until the terminator is found. Return length in `ecx`.

### Medium
3. **Array Sum with Scaled Index** – Given an array of 32‑bit ints pointed to by `esi` and length in `ecx`, compute the sum into `eax` using a loop that indexes with `[esi + edi*4]`. Use `loop` or `dec/jnz` and show the accumulated sum.
4. **Linux `write` via `syscall`** – Create a 64‑bit ELF executable that prints “Linux\n” using the `syscall` instruction (`rax=1`, `rdi=1`, `rsi=msg`, `rdx=6`). Assemble, link, and run it; verify output with `strace -e write ./prog`.

### Hard
5. **Inline `rdtsc` Benchmark** – Write a C program with an inline assembly block that reads the timestamp counter before and after a tight loop of `10⁸` integer additions. Compute elapsed cycles and print the result. Explain any variance due to CPU frequency scaling.
6. **Mini ELF Loader** – In C, parse the ELF header of a given executable, locate the `PT_LOAD` program header with `p_flags & PF_X`, mmap that segment with `PROT_READ|PROT_EXEC`, jump to the entry point (`e_entry`). Use only the `open`, `fstat`, `mmap`, and `jmp` (via function pointer) system calls. Test with `/bin/true`.

---

## Linux Connection
The ISA is visible throughout the Linux toolchain and kernel interfaces.

### Observing the ISA
```bash
# Show the CPU model and enabled ISA extensions
lscpu
# Example output excerpt:
# Architecture:        x86_64
# CPU op-mode(s):      32-bit, 64-bit
# Byte Order:          Little Endian
# CPU(s):              8
# Model name:          Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz
# Flags:               fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtsp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb invpcid_single pti ssbd ibrs ibpb stibp tpr_shadow vnmi flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 avx2 smep bmi2 erms invpcid mpx rdseed adx smap clflushopt clwb intel_pt avx512f avx512dq rdseed
```

Each flag corresponds to a feature of the ISA (e.g., `avx2` → 256‑bit AVX2 instructions, `rdtsc` → timestamp counter register).

### Disassembling Kernel and User Code
```bash
# Disassemble a user binary
objdump -d -M intel /bin/ls | head -20

# Disassemble the kernel symbol table (requires kernel debuginfo)
sudo eu-readelf -s /usr/lib/debug/boot/vmlinuz-$(uname -r) | grep -E 'system_call|sys_call_table'
```

### Measuring ISA‑Level Performance
```bash
# Count cycles and retired instructions for a program
perf stat -e cycles,instructions,cache-references,cache-misses ./myprog

# Breakdown by instruction type (requires Intel PT)
perf record -e intel_pt// ./myprog
perf script | grep -E 'add|mul|mov'
```

### System Call Tracing
```bash
# Trace all syscalls made by `ls`
strace -f -e trace=all ls -l /usr/bin > /tmp/strace.log 2>&1
# Look for entries like:
# write(1, "file1\nfile2\n", 12) = 12
```

### Manipulating Privilege Rings (Demo)
```bash
# Attempt to execute a privileged instruction from user space (will SIGSEGV)
echo -e '\x0f\x01\xc0' | ./sgdt_test   # sgdt is a privileged instruction; triggers #GP
```
The program `sgdt_test` simply executes the supplied bytes via function pointer; the resulting segmentation fault illustrates the CPU’s privilege check.

---

## Why This Matters
Understanding the ISA is not an academic exercise—it is the *foundation* upon which every layer of the software stack rests:

- **Correctness:** A program’s observable behavior is dictated solely by how the CPU interprets the ISA bit patterns. Mis‑assembling an instruction or mis‑calculating an effective address yields silent data corruption that only appears under specific memory layouts.
- **Performance:** The ISA determines the *maximum* achievable throughput (instructions per cycle) and the *minimum* latency for each operation. By knowing which instructions map to single‑cycle ALU ops versus multi‑cycle micro‑ops, a developer can schedule code to avoid pipeline stalls, choose optimal addressing modes, and leverage SIMD widths for data‑parallel speedups.
- **Security:** Privilege levels, instruction‑set extensions (e.g., `rdtsc`, `sgx`), and memory‑ordering guarantees directly affect the attack surface. Recognizing that `int 0x80` is a slower, more detectable gateway than `syscall` informs the design of sandboxing and monitoring tools.
- **Portability:** Linux runs on multiple ISAs (x86‑64, ARM64, RISC‑V). Knowing where the ISA abstracts away hardware details lets you write portable code (e.g., using `asm volatile ("" ::: "memory")` for compiler barriers) while still being able to tap ISA‑specific features when needed (e.g., `cpuid` to detect AVX‑512).

In short, mastery of the ISA bridges the gap between *what* a programmer writes and *how* the hardware actually executes it—enabling you to write faster, safer, and more portable systems code. This deep, mechanistic view is the payoff for every subsequent topic in computer systems, from compiler back‑ends to kernel scheduling and hardware‑accelerated cryptography.
