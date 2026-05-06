---
id: 70
title: "Compilers"
supermoduleId: 6
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Systems A Programmers Perspective (Bryant)"
  - type: book
    title: "The C Programming Language (K&R)"
---

## Core Concepts
### What a Compiler Does and Why It Exists
A compiler is a translation system that maps a program written in a high-level language (HLL) to a sequence of machine instructions that the target processor can execute directly. The necessity arises from two opposing constraints:  
1. **Human productivity** – HLLs provide abstractions (types, control structures, scoping) that let programmers express algorithms concisely.  
2. **Hardware efficiency** – CPUs understand only binary opcodes tied to a specific ISA (Instruction Set Architecture) and ABI (Application Binary Interface).  

A compiler bridges this gap by performing **sempreserving transformations**: each phase rewrites the program into an equivalent form that is closer to the machine while preserving the observable behavior (termination, output, side‑effects). If any phase were to alter semantics, the generated program could produce incorrect results, making correctness the first principle that drives every design decision.

### Phase‑wise First‑Principle Breakdown
| Phase | Input | Output | Core Mechanism | Why It Is Needed |
|-------|-------|--------|----------------|------------------|
| **Lexical Analysis** | Source character stream | Token stream (keywords, identifiers, literals, operators, punctuation) | Scans characters with a deterministic finite automaton (DFA) built from regular expressions of the language’s lexical grammar. | Groups raw characters into meaningful symbols; eliminates whitespace/comments; provides a fixed‑size alphabet for the parser, simplifying grammar to context‑free form. |
| **Syntax Analysis (Parsing)** | Token stream | Parse tree / Abstract Syntax Tree (AST) | Uses a push‑down automaton (PDA) guided by a context‑free grammar (CFG). Common algorithms: LL(1) (recursive‑descent) or LR(1) (shift‑reduce) with look‑ahead tables. | Checks that the token sequence conforms to the language’s syntactic structure; builds a hierarchical representation that makes explicit the scoping of expressions, statements, and declarations. |
| **Semantic Analysis** (often interleaved with parsing) | AST | Annotated AST (type info, symbol table entries) | Walks the AST, applying type‑checking rules, scope resolution, and consistency constraints (e.g., lvalue/rvalue, function prototype matching). | Guarantees that the program respects the language’s type system and declaration rules; catches errors that are not syntactic (e.g., using an undeclared variable). |
| **Intermediate Representation (IR)** | Annotated AST | Platform‑independent IR (e.g., three‑address code, SSA form) | Translates each AST node into a low‑level but ISA‑neutral instruction; may insert temporary variables, break complex expressions into simple ops. | Provides a stable substrate for retargeting (same IR → multiple back‑ends) and for applying optimizations that depend on data‑flow rather than concrete instruction encodings. |
| **Optimization** | IR | Optimized IR | Performs data‑flow analysis (live variable, reaching definitions, available expressions) and applies transformation rules: constant folding, dead‑code elimination, strength reduction, loop invariant code motion, loop unrolling, register allocation via graph coloring, instruction scheduling. | Reduces dynamic instruction count, improves pipeline utilization, minimizes memory traffic, and exploits target‑specific capabilities while preserving program semantics. |
| **Code Generation** | Optimized IR | Target machine code (object file) | Maps IR ops to machine instructions (instruction selection), assigns physical registers (register allocation), lays out stack frames according to the ABI, emits relocation info for external symbols. | Produces a binary that the linker/loader can resolve and the CPU can fetch/decode/execute; respects calling conventions, stack alignment, and system‑specific constraints (e.g., PIC for shared libraries). |

The **causal chain** is strict: each phase consumes the exact output of the previous one; skipping or reordering a phase would break the invariants the next phase relies on (e.g., parsing expects a token stream, not raw characters).  

---

## How It Works
We trace the compilation of a tiny C program through every phase, showing concrete data structures and the rationale behind each transformation.

### Source Program
```c
int main() {
    int x = 5;
    int y = x * 2;
    return y;
}
```
Assume target ISA: x86‑64 System V ABI, Linux glibc environment.

### 1. Lexical Analysis → Token Stream
| Step | Input (char) | Action (DFA) | Token |
|------|--------------|--------------|-------|
| 1    | `i`          | start → identifier | `int` |
| 2    | `n`          | identifier | (continues) |
| …    | …            | …            | … |
| 13   | `(`          | punctuation | `(` |
| 14   | `)`          | punctuation | `)` |
| 15   | `{`          | punctuation | `{` |
| 16   | `i`          | identifier | `int` |
| …    | …            | …            | … |
| 23   | `=`          | operator | `=` |
| 24   | `5`          | literal | `5` |
| 25   | `;`          | punctuation | `;` |
| …    | …            | …            | … |
| 31   | `x`          | identifier | `x` |
| 32   | `*`          | operator | `*` |
| 33   | `2`          | literal | `2` |
| …    | …            | …            | … |
| 38   | `;`          | punctuation | `;` |
| 39   | `r`          | identifier | `return` |
| …    | …            | …            | … |
| 44   | `y`          | identifier | `y` |
| 45   | `;`          | punctuation | `;` |
| 46   | `}`          | punctuation | `}` |

Resulting token stream (simplified):
```
int main ( ) { int x = 5 ; int y = x * 2 ; return y ; }
```

*Why a DFA?*  
Regular expressions describing lexical tokens can be recognized in O(1) per character with a DFA, giving linear‑time scanning and eliminating the need for backtracking.

### 2. Parsing → AST
Using an LR(1) parser for the C grammar (excerpt):
```
translation_unit → external_declaration
external_declaration → function_definition
function_definition → declarator compound_statement
declarator → direct_declarator
direct_declarator → ID '(' ')'   // main
compound_statement → '{' statement_list '}'
statement_list → statement statement_list | ε
statement → declaration_statement | expression_statement | selection_statement | iteration_statement | jump_statement
declaration_statement → decl_specifiers init_declarator_list ';'
init_declarator_list → init_declarator
init_declarator → declarator '=' initializer
declarator → direct_declarator
direct_declarator → ID   // x, y
initializer → assignment_expression
assignment_expression → additive_expression
additive_expression → multiplicative_expression
multiplicative_expression → unary_expression
unary_expression → primary_expression
primary_expression → ID | constant | '(' expression ')'
```

Applying the shifts/reductions yields the following AST (indented for clarity):
```
FunctionDef
  └─ DeclSpec: int
  └─ Declarator: main
  └─ CompoundStmt
        ├─ DeclStmt
        │    ├─ DeclSpec: int
        │    └─ InitDeclarator: x = 5
        ├─ DeclStmt
        │    ├─ DeclSpec: int
        │    └─ InitDeclarator: y = x * 2
        └─ ReturnStmt
             └─ Expression: y
```

*Why a parse tree?*  
The hierarchical AST makes explicit the nesting of scopes and the data dependencies (e.g., `y` depends on `x`). This structure is indispensable for later phases that need to query “what variables are live at this point?” or “which expression defines this value?”

### 3. Intermediate Representation → Three‑Address Code (TAC)
We convert each AST node into a TAC instruction using temporary variables `t1`, `t2`, … . The IR is kept in **Static Single Assignment (SSA)** form, meaning each variable is assigned exactly once.

| TAC Instruction | Meaning |
|-----------------|---------|
| `t1 = 5`                | constant → x |
| `x = t1`                | store x |
| `t2 = x`                | load x |
| `t3 = t2 * 2`           | multiply |
| `y = t3`                | store y |
| `t4 = y`                | load y for return |
| `return t4`             | function exit |

*Why SSA?*  
SSA eliminates ambiguous uses of a variable; each definition has a unique name, which simplifies data‑flow analysis (e.g., reaching definitions become trivial: a use points to the unique definition that dominates it).

### 4. Optimization
We apply three classic optimizations, showing the intermediate IR after each step.

#### 4.1 Constant Folding & Propagation
- `t1 = 5` is a constant → replace all uses of `t1` with `5`.
- After propagation:
```
x = 5
t2 = x          → t2 = 5
t3 = t2 * 2     → t3 = 5 * 2
y = t3
t4 = y
return t4
```
- Fold `5 * 2`:
```
x = 5
t2 = 5
t3 = 10
y = 10
t4 = 10
return t4
```

#### 4.2 Dead‑Code Elimination
- `x` is never read after its store → remove `x = 5`.
- `t2` is only used to compute `t3`, but we already have constant `5` → replace `t2` with `5` and delete the assignment.
- Result:
```
t3 = 10
y = 10
t4 = 10
return t4
```
- `y` is only read for `t4`; replace `t4` with `y` and delete `t4 = y`.
- Final IR:
```
t3 = 10
y = 10
return y
```
- `t3` is dead (no further use) → drop.
- **Optimized IR**:
```
y = 10
return y
```

*Why these steps improve performance?*  
Each eliminated instruction reduces the dynamic instruction count, decreases register pressure, and removes memory stores/loads that would otherwise hit the data cache.

#### 4.3 Strength Reduction (illustrative, not needed here) – if we had a loop we would replace multiplication by repeated addition.

### 5. Code Generation → x86‑64 Assembly (AT&T syntax)
We follow the System V ABI:  
- Return value in `%eax` (32‑bit) or `%rax` (64‑bit).  
- Stack must be 16‑byte aligned at call sites; `main` is called by the C runtime (`_start`) with a properly aligned stack, so we can omit explicit stack adjustment for this leaf function.

Mapping the optimized IR:
```
y = 10          → movl $10, -4(%rbp)   // store 10 into local variable y (offset -4)
return y        → movl -4(%rbp), %eax  // load y into eax for return
                ret
```
Prologue/epilogue generated by gcc (omitted for brevity) would be:
```
push   %rbp
mov    %rsp, %rbp
sub    $16, %rsp        // allocate space for y (and keep alignment)
...
leave
ret
```
Full assembly (`gcc -S -masm=att`):
```
    .file   "demo.c"
    .text
    .globl  main
    .type   main, @function
main:
.LFB0:
    .cfi_startproc
    pushq   %rbp
    .cfi_def_cfa_offset 16
    .cfi_offset %rbp, -16
    movq    %rsp, %rbp
    .cfi_def_cfa_register %rbp
    subl    $16, %rsp
    movl    $10, -4(%rbp)      // y = 10
    movl    -4(%rbp), %eax    // eax = y
    leave
    .cfi_def_cfa 7, 8
    ret
    .cfi_endproc
.LFE0:
    .size   main, .-main
    .ident  "GCC: (Ubuntu 11.2.0-19ubuntu1) 11.2.0"
    .section    .note.GNU-stack,"",@progbits
```

*Why this layout?*  
The prologue saves the caller’s frame pointer, establishes a new frame, and allocates space for locals while maintaining the required 16‑byte stack alignment (`%rsp` modulo 16 == 0 before the call). The epilogue restores `%rsp` and `%rbp` and transfers control back via `ret`.

---

## Worked Examples
Each example walks through the entire pipeline, showing numbers, intermediate representations, and the motivation for each transformation.

### Example 1: Simple Arithmetic (already shown)
We already detailed the full pipeline; the key take‑away is that **constant folding + dead‑code elimination** reduced the original six TAC instructions to a single store and a return, shrinking the dynamic instruction count from ~6 to 2.

### Example 2: Loop Summation – Strength Reduction & Loop Unrolling
Source:
```c
int sum_loop(void) {
    int sum = 0;
    for (int i = 0; i < 10; ++i)
        sum += i;
    return sum;
}
```
#### 5.1 Unoptimized TAC (SSA)
```
t0 = 0          // sum
i0 = 0
L1:  t1 = i0 < 10
     if (!t1) goto L2
     t2 = t0 + i0   // sum += i
     t0 = t2
     i1 = i0 + 1
     i0 = i1
     goto L1
L2:  return t0
```
*Why this form?*  
The loop is expressed as a conditional branch with an induction variable `i`. The body contains a dependent addition.

#### 5.2 Optimization Steps
1. **Loop Invariant Code Motion** – none (no invariant inside).  
2. **Strength Reduction** – replace multiplication (none here) with addition; the induction variable update `i = i + 1` is already an addition.  
3. **Loop Unrolling (factor = 4)** – we duplicate the body four times and adjust the loop counter stride.

Unrolled version (hand‑unrolled for clarity):
```
t0 = 0          // sum
i0 = 0
L1:  // iteration 0
     t1 = i0 < 10
     if (!t1) goto L2
     t2 = t0 + i0
     t0 = t2
     i1 = i0 + 1
     // iteration 1
     t3 = i1 < 10
     if (!t3) goto L2
     t4 = t0 + i1
     t0 = t4
     i2 = i1 + 1
     // iteration 2
     t5 = i2 < 10
     if (!t5) goto L2
     t6 = t0 + i2
     t0 = t6
     i3 = i2 + 1
     // iteration 3
     t7 = i3 < 10
     if (!t7) goto L2
     t8 = t0 + i3
     t0 = t8
     i4 = i3 + 1
     i0 = i4
     goto L1
L2:  return t0
```
*Why unroll?*  
Each iteration originally executes:
- Compare (`i < 10`) → 1 instruction
- Branch (taken/not taken) → 1 instruction (mis‑prediction penalty possible)
- Add to sum → 1 instruction
- Increment `i` → 1 instruction  
Total ≈ 4 µ‑ops per iteration (ignoring pipeline effects). Unrolling by 4 reduces the number of branch/compare operations from 10 to 3 (one per group of four), cutting branch overhead by ~70 %. The trade‑off is a modest increase in code size (still negligible for such a tiny loop).

#### 5.3 Constant‑Time Closed Form (Compiler‑Level Optimization)
A smart compiler can recognize the loop as computing the arithmetic series:
\[
\sum_{i=0}^{n-1} i = \frac{n(n-1)}{2}
\]
For `n = 10`:
\[
\frac{10 \times 9}{2} = 45
\]
Thus the entire loop can be replaced with:
```
return 45;
```
*Why is this legal?*  
The loop has no side effects besides updating `sum`; the loop bound and stride are constants, and the body is a pure addition of the loop index. The transformation preserves the observable return value.

#### 5.4 Generated Assembly (gcc -O2)
```
    .globl  sum_loop
    .type   sum_loop, @function
sum_loop:
    movl    $45, %eax
    ret
```
The compiler performed **closed‑form replacement**, eliminating the loop entirely.

### Example 3: From Optimized IR to Machine Bytes
Optimized IR (as given in the draft):
```
mov eax, 10
ret
```
We encode it for x86‑64, AT&T syntax → Intel byte encoding.

| Instruction | Opcode (hex) | ModR/M | Imm8/Imm32 | Encoding (little‑endian) |
|-------------|--------------|--------|------------|--------------------------|
| `mov eax, imm32` | `B8` | – | `0A 00 00 00` | `B8 0A 00 00 00` |
| `ret` (near) | `C3` | – | – | `C3` |

Full byte stream:
```
B8 0A 00 00 00 C3
```
We can verify with `objdump -d` after assembling:

```bash
# Assemble with nasm (Intel syntax)
echo -e 'section .text\n    global _start\n_start:\n    mov eax, 10\n    ret' > prog.asm
nasm -f elf64 prog.asm
ld -o prog prog.o
objdump -d prog
```
Output:
```
0000000000400080 <_start>:
  400080:	b8 0a 00 00 00       	mov    eax,0xa
  400085:	c3                   	ret
```
*Why this encoding?*  
`B8 + rd` is the opcode for `mov r32, imm32` where the low 3 bits of the opcode encode the destination register (`eax` = `000`). The immediate follows in little‑endian order. `C3` is the one‑byte near return opcode.

---

## Common Mistakes
Each mistake identifies a subtle misconception, explains why it’s wrong, and gives a concrete consequence.

### Mistake 1 – “Lexical analysis just removes whitespace; parsing does the real work.”
**What’s wrong:**  
Lexical analysis is not merely whitespace stripping; it **tokenizes** the input using a formal regular‑language recognizer. If the lexer mis‑classifies a sequence (e.g., treating `>=` as two tokens `>` and `=`), the parser will receive an invalid token stream and may either reject a valid program or accept an invalid one, producing silently incorrect code.

**Why it matters:**  
Consider the C snippet `if (x >= 0)`. A lazy lexer that returns `[ID(x), '>', '=', ')', ...]` would cause the parser to see a binary `>` followed by an `=` token, which does not match any grammar rule, leading to a syntax error even though the source is correct. Conversely, confusing `==` with `=` could allow an assignment inside a condition to be parsed as a comparison, changing program semantics.

### Mistake 2 – “Optimization is optional; I can always rely on -O0 for debugging and still get acceptable performance.”
**What’s wrong:**  
While `-O0` is useful for debugging (preserves a near‑1‑to‑1 mapping between source and machine instructions), many **performance‑critical kernels, drivers, or user‑space services** require the transformations that only `-O2`/`-O3` provide (e.g., inlining, vectorization, loop unrolling). Relying on `-O0` in production can lead to **order‑of‑magnitude slowdowns**, missed deadlines, or excessive energy consumption.

**Why it matters:**  
In a Linux kernel driver that processes network packets at line rate, the inner loop may process 64‑byte packets. Without loop unrolling and SIMD vectorization, the driver might achieve only 10 % of the NIC’s throughput, causing packet drops under load.

### Mistake 3 – “The IR is just a temporary representation; I can ignore it when thinking about code generation.”
**What’s wrong:**  
The IR is the **optimization barrier** between front‑end and back‑end. Ignoring it leads to two pitfalls:
1. **Missed optimization opportunities** – many transformations (e.g., SSA‑based constant propagation, alias analysis) are impossible or extremely hard to perform directly on the AST.
2. **Portability bugs** – assuming a particular register layout or calling convention in the IR may produce code that works on one ABI but crashes on another (e.g., assuming the first argument is in `%edi` when targeting the Windows x86‑64 ABI, where it is in `%ecx`).

**Why it matters:**  
When compiling the same source for both Linux (System V) and Windows (Microsoft) x86‑64, the front‑end must emit IR that is ABI‑neutral; the back‑end then inserts the correct prologue/epilogue and register mappings. If a developer hard‑codes register names in the IR, the Windows build will misplace arguments, leading to stack corruption.

### Mistake 4 – “More aggressive optimization always yields better code.”
**What’s wrong:**  
Optimizations have **trade‑offs**: loop unrolling increases code size (potentially hurting I‑cache performance), aggressive inlining can blow up the binary, and certain transformations (e.g., speculative loads) may introduce pipeline stalls
