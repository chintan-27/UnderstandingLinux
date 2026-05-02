---
id: 51
title: "Assembly language"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Why This Matters

When two separately compiled object files link together, they share no source-level context — the linker sees only symbols and relocations. A calling convention is the binary contract that makes interoperation possible: it specifies exactly which register holds the first argument, which registers the callee must preserve, and where the return address lives. Violate it in one function and the rest of the program silently computes garbage, because the CPU has no notion of "argument" or "return" — it only executes instructions. The stack is not merely convenient storage; it is the mechanism that gives recursion its semantics. Without per-call save/restore of `$ra`, each recursive invocation would overwrite the previous return address and the call chain would collapse to a single level. Every tool that reconstructs call chains — `gdb` backtraces, `perf record`, Linux's `DWARF` unwinder, `libunwind` — depends on these conventions being followed precisely and consistently.

---

## Core Concepts

### Arithmetic in Assembly

Each instruction performs exactly one ALU operation with no implicit coercion, no precedence, and no hidden side effects on unrelated state. On MIPS:

```asm
add  $t0, $t1, $t2    # $t0 = $t1 + $t2  (traps on signed overflow via OverflowException)
addu $t0, $t1, $t2    # $t0 = $t1 + $t2  (wraps mod 2^32; no trap)
addi $t0, $t1, 42     # $t0 = $t1 + 42   (16-bit immediate, sign-extended to 32)
sub  $t0, $t1, $t2    # $t0 = $t1 - $t2  (traps on signed overflow)
mul  $t0, $t1, $t2    # $t0 = low 32 bits of $t1 * $t2 (high 32 bits discarded)
```

`add` vs `addu` is not about signedness of the operands — both interpret bits identically. The difference is the overflow trap. C compilers emit `addu` for `int` arithmetic because C defines signed integer overflow as undefined behavior; generating a trap would be valid, but silently wrapping is cheaper and the standard does not require the trap. The compiler is exploiting the UB license, not making a correctness guarantee.

For multiplication, the full 64-bit product goes into the `HI:LO` register pair; `mul` is a pseudoinstruction that discards `HI`. If you need the high word — for example, to implement 64-bit multiply on a 32-bit machine — you use `mult` and then `mfhi`/`mflo`:

```asm
mult $t1, $t2         # HI:LO = $t1 * $t2 (signed 64-bit product)
mflo $t0              # $t0 = low 32 bits
mfhi $t3              # $t3 = high 32 bits
```

The full 64-bit product satisfies $t_1 \times t_2 = \texttt{HI} \cdot 2^{32} + \texttt{LO}$.

### Branches and Jumps

MIPS has no flags register. There is no carry bit, no zero bit, no negative bit updated as a side effect of every instruction. Instead, comparisons write a boolean integer into a general-purpose register, which a branch then tests:

```asm
beq  $t0, $t1, label  # branch if $t0 == $t1
bne  $t0, $t1, label  # branch if $t0 != $t1
slt  $t2, $t0, $t1    # $t2 = ($t0 < $t1) ? 1 : 0   (signed)
sltu $t2, $t0, $t1    # same, unsigned comparison
bne  $t2, $zero, label
j    label             # unconditional jump (PC-relative 26-bit target)
jr   $ra               # jump to address in $ra (used for return)
jal  target            # $ra = PC+4; jump to target (call)
```

The regularity pays off in pipeline design: the branch decision always comes from a register comparison, never from implicit flag state written several instructions earlier. The cost is one extra instruction for any `<` branch. For a tight inner loop that branches on a less-than condition, this extra `slt` adds measurable overhead; x86's flag-based branches avoid this at the cost of making out-of-order flag dependencies more complex to track.

The branch offset is encoded as a signed 16-bit word offset from `PC+4`, giving a reach of $\pm 2^{15}$ instructions $= \pm 131072$ bytes. `j` uses a 26-bit word address, reaching any target in the same 256 MB region as the instruction. When neither suffices, the assembler synthesizes a longer sequence.

### The Stack

The stack grows **downward**: higher addresses are older frames, lower addresses are newer ones. `$sp` points to the **last used** word — the current top of the stack — not to the next free slot. The invariant:

$$\text{push: } sp_{\text{new}} = sp_{\text{old}} - 4N, \quad \text{then store at } [sp_{\text{new}}]$$

$$\text{pop: } \text{load from } [sp_{\text{old}}], \quad \text{then } sp_{\text{new}} = sp_{\text{old}} + 4N$$

This ordering is not stylistic. Storing before decrementing leaves a window where an interrupt or signal handler that uses the stack could corrupt the value you just wrote, because `$sp` still points above it and the handler considers that space free. Decrement first, then store — the value is always below `$sp` and therefore protected.

The stack exists because the register file is finite. MIPS has 32 registers. Any live value that must survive a function call — and that call uses all available caller-saved registers — must be written to memory. The stack is the designated area for this **register spilling**, because it provides automatic reclamation (restoring `$sp` releases the whole frame) and its LIFO structure matches call/return nesting exactly.

### The Call/Return Mechanism

`jal target` atomically sets `$ra = PC + 4` and jumps to `target`. "Atomically" here means in one pipeline stage — there is no intermediate state where `$ra` is updated but the jump has not happened, which matters for interrupt safety. `jr $ra` returns by treating the register contents as a jump target.

The return address `$ra` is an ordinary register. A leaf function (one that issues no `jal`) can return without touching the stack. A non-leaf must save `$ra` before its first `jal`, because that instruction overwrites `$ra` unconditionally. The requirement cascades: saving `$ra` means writing it to the stack, which requires having already allocated a frame.

### Calling Conventions

The MIPS O32 convention assigns specific roles to every register:

| Class | Registers | Who is responsible |
|---|---|---|
| Arguments | `$a0–$a3` | Caller places args; values undefined after call |
| Return values | `$v0–$v1` | Callee places result |
| Caller-saved temporaries | `$t0–$t9` | Callee may destroy freely; caller saves if needed |
| Callee-saved | `$s0–$s7` | Callee must save before use and restore before return |
| Return address | `$ra` | Callee saves if it issues any `jal` |
| Stack pointer | `$sp` | Callee must restore to entry value before return |
| Frame pointer | `$fp` / `$s8` | Callee-saved; optional but required if `$sp` moves mid-function |
| Global pointer | `$gp` | Points to the middle of the global data segment; callee-saved |

The caller-saved/callee-saved split is a performance contract. Callee-saved registers (`$s0–$s7`) let the compiler allocate long-lived variables there and issue calls without generating save/restore code around every call site — the callee guarantees preservation. Caller-saved registers (`$t0–$t9`) give the callee free scratch space without overhead — but the caller must save them if their values are needed after a call, and often they are not, so no save is needed at all. The split is tuned so that the common case generates minimal memory traffic.

Arguments 5 and beyond go on the stack at `$sp + 16` through `$sp + 4(N-1)` — the first 16 bytes of the caller's stack frame are reserved as the **argument home area** even for the first four arguments, which lets a callee that takes its own address (or uses varargs) spill `$a0–$a3` there without needing to know the caller's layout.

---

## How It Works

### A Leaf Procedure

A leaf procedure issues no `jal`, so `$ra` is untouched and no stack frame is needed unless local variables overflow the register file:

```asm
# int square(int x) { return x * x; }
# Caller places x in $a0; result returned in $v0.
square:
    mul  $v0, $a0, $a0    # $v0 = x * x (low 32 bits)
    jr   $ra
```

Zero stack operations. The function is three bytes of machine code on a 32-bit MIPS. Any optimization that avoids a stack frame pays off in tight loops — one `subu`/`addiu` pair per call saves two memory operations plus the latency of the cache hit.

### A Non-Leaf Procedure: Factorial

`fact(n)` calls itself, so the `jal fact` inside the body will overwrite `$ra`. It also needs `n` after the recursive call returns, but `$a0` is caller-saved — the recursive call is free to destroy it. Both `$ra` and `$a0` must be spilled:

```asm
# int fact(int n) { return n <= 1 ? 1 : n * fact(n-1); }
fact:
    subu  $sp, $sp
