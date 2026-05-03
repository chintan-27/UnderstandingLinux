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

Every `SIGSEGV` from a corrupted stack, every `gdb` backtrace you've read, every ROP gadget in a CVE write-up — these trace back to one mechanism: the calling convention. It is the contract that lets code compiled by `gcc` call code compiled by `clang`, lets the kernel invoke a user-space signal handler without corrupting the process state, and lets `printf` trust that `$a0` contains a valid pointer. Without it, there is no reliable way to pass arguments, recover register state after a call, or find the return address. This module explains the mechanism, not just the rules.

---

## Core Concepts

### Arithmetic in Assembly

MIPS uses a three-operand register format for all arithmetic:

```asm
add  $t0, $t1, $t2    # $t0 = $t1 + $t2
sub  $t0, $t1, $t2    # $t0 = $t1 - $t2
addi $t0, $t1, 42     # $t0 = $t1 + 42  (sign-extended immediate)
```

The three-operand design makes every read and every write explicit — no implicit source/destination aliasing. This simplifies both hardware (the register file has three ports: two read, one write) and compiler dataflow analysis.

Contrast with x86's two-operand form: `add eax, ebx` encodes `eax = eax + ebx`, destroying one source. This compresses the instruction encoding but forces compilers to emit extra `mov` instructions to preserve values. The tradeoff is encoding density vs. dataflow clarity.

**Overflow is not uniform.** `add` triggers a trap on signed overflow; `addu` silently wraps modulo $2^{32}$. The C compiler emits `addu` for `unsigned int` arithmetic and `add` for `int`, because the C standard defines unsigned overflow as well-defined wrap-around and signed overflow as undefined behavior.

For a 32-bit signed addition, the overflow condition is:

$$\text{overflow} \iff (a > 0 \land b > 0 \land s < 0) \lor (a < 0 \land b < 0 \land s \geq 0)$$

where $s = a + b$ computed in 32-bit arithmetic. The hardware detects this by checking whether the carry into the sign bit differs from the carry out of it.

### Branches and Control Flow

MIPS branches compare two registers directly:

```asm
beq  $t0, $t1, label  # branch if $t0 == $t1
bne  $t0, $t1, label  # branch if $t0 != $t1
slt  $t2, $t0, $t1    # $t2 = ($t0 < $t1) ? 1 : 0
bne  $t2, $zero, label # branch on that boolean
```

`slt` exists because a single compare-and-branch-less-than instruction would need to encode three register fields plus a branch target — too many bits for a 32-bit instruction word. MIPS resolves this by materializing the boolean into a general-purpose register, then branching on zero/non-zero. This is a direct consequence of the fixed-width instruction constraint:

$$32 \text{ bits} = 6 \text{ (opcode)} + 5 \text{ (rs)} + 5 \text{ (rt)} + 16 \text{ (immediate/offset)}$$

There is no room for a third register operand and a branch offset simultaneously.

x86 avoids this by writing condition codes into `EFLAGS` as a side effect of arithmetic, then testing flags in a separate `jcc` instruction. The cost is implicit state: the flags belong to no named register, so any intervening instruction that modifies `EFLAGS` silently invalidates a pending branch condition. Compilers handle this carefully; humans debugging assembly often do not.

`jr $ra` — jump to the address held in `$ra` — is the universal procedure return. There is no dedicated `ret` instruction in MIPS; `jr $ra` makes the mechanism explicit.

### The Stack

The stack is a LIFO region of memory with one defining property: **it grows toward lower addresses**. On MIPS:

$$\text{push:} \quad sp \leftarrow sp - 4, \quad M[sp] \leftarrow \text{value}$$

$$\text{pop:} \quad \text{value} \leftarrow M[sp], \quad sp \leftarrow sp + 4$$

The reason for downward growth is address space layout: historically, the heap was placed at the low end of the virtual address space and the stack at the high end, growing toward each other. The collision point — stack pointer meets program break — is detectable and signals exhaustion. Linux preserves this layout exactly. On a 64-bit process, the stack starts just below `0x7fffffffffff` and grows down; the heap starts above the BSS segment and grows up via `brk(2)`.

`$sp` (register 29) points to the **last written word** — the top of the occupied region, not the next free slot. When you allocate a frame of $N$ bytes, you execute `subu $sp, $sp, N`, and the frame occupies $[sp,\ sp+N)$. Individual slots are addressed as `offset($sp)` where $0 \leq \text{offset} < N$.

Frame size must remain a multiple of 8 bytes on MIPS (16 bytes on many 64-bit ABIs) to satisfy alignment constraints for double-precision loads/stores. A misaligned `$sp` causes an address exception on the first 64-bit memory access.

### The Activation Record

Every procedure invocation owns a contiguous slice of the stack called its **activation record** (or stack frame). It must hold:

1. The return address (`$ra`), if this procedure makes any call
2. Any caller-saved registers the caller wants preserved across the call
3. Any callee-saved registers this procedure modifies
4. Local variables that don't fit in registers
5. Outgoing arguments beyond the first four (which go in `$a0–$a3`)

```
Higher addresses
  ┌──────────────────┐  ← caller's $sp before call
  │  caller's frame  │
  ├──────────────────┤
  │  saved $ra       │  ← $fp (if frame pointer used)
  │  saved $fp       │
  │  saved $s0–$s7   │  (only those this function modifies)
  │  local variables │
  │  arg 5, arg 6…   │  (spilled outgoing args, if any)
  └──────────────────┘  ← $sp  (after subu $sp, $sp, N)
Lower addresses
```

The **frame pointer** `$fp` (register 30) holds the value of `$sp` at function entry and does not change for the life of the call. Its purpose is stability: if a function uses `alloca(3)` or a variable-length array, `$sp` moves during execution, making `$sp`-relative offsets for locals non-constant. With `$fp` fixed, every local has a constant offset regardless of dynamic allocation. Compilers omit `$fp` when no dynamic allocation occurs (controlled by `-fomit-frame-pointer`), recovering one general-purpose register.

### Calling Conventions

The MIPS O32 calling convention divides registers into caller-saved and callee-saved, assigning responsibility based on who loses if the value is clobbered:

| Register | Name | Saver | Purpose |
|---|---|---|---|
| `$a0–$a3` | Arguments | Caller | First 4 integer arguments |
| `$v0–$v1` | Values | — | Return value(s) |
| `$t0–$t9` | Temporaries | Caller | Scratch; callee may overwrite |
| `$s0–$s7` | Saved | Callee | Must survive any call |
| `$ra` | Return address | Callee (non-leaf) | Set by `jal`; must be saved before recursive call |
| `$sp` | Stack pointer | Both | Must equal entry value on return |
| `$fp` | Frame pointer | Callee | Stable base when used |

**Caller-saved** means: if the caller needs `$t3` after a `jal`, the caller saves it before the call and restores it after. The callee makes no promise.

**Callee-saved** means: if the callee wants to use `$s2`, it saves `$s2` at entry and restores it before returning. The caller makes no save/restore effort.

The split exists to minimize unnecessary saves. A leaf function that uses only `$t` registers and never calls anything touches neither `$ra` nor any `$s` register — zero stack traffic for register preservation. A non-leaf function only saves the `$s` registers it actually uses, not all eight.

The fifth and later arguments are placed on the stack at `0($sp)`, `4($sp)`, etc. — allocated by the caller — before the `jal`. The callee reads them from these known offsets.

---

## How It Works

### A Concrete Procedure Call: Recursive Factorial

```c
int fact(int n) {
    if (n <= 0) return 1;
    return n * fact(n - 1);
}
```

This is non-leaf: it calls itself, which means `jal` will overwrite `$ra`, and the recursive call will overwrite `$a0`. Both must be saved before the call.

```asm
fact:
        subu  $sp, $sp, 24      # allocate 24-byte frame (8-byte aligned, room for $ra + $a0)
        sw    $ra, 20($sp)       # save return address — jal will overwrite it
        sw    $a0, 16($sp)       # save n — recursive call will overwrite $a0

        # base case: if n <= 0, return 1
        bgt   $a0, $zero, recurse
        li    $v0, 1
        j     done

recurse:
        subu  $a0, $a0, 1        # $a0 = n - 1
        j
