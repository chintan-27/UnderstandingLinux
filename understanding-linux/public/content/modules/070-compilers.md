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

## Why This Matters

When you write `int x = a + b;`, the compiler must bridge that text to `addq %rsi, %rdi`. That bridge is not a single translation — it is a pipeline of five distinct phases, each solving a problem the previous phase deliberately left unsolved. Understanding the pipeline answers concrete questions: why does `-O2` eliminate a branch you thought was necessary? Why does adding `volatile` change generated code but not semantics? Why can the compiler delete a bounds check you wrote, legally, without warning? When a security bug lives in code that looks correct, or when a hot loop runs slower than the instruction count predicts, the answer is almost always traceable to a specific compiler phase.

---

## Core Concepts

### Lexical Analysis (Scanning)

Source code is a flat character string. The lexer converts it into a sequence of *tokens* — the atomic units the grammar operates on — discarding whitespace and comments. Every token type corresponds to a regular expression: `[a-zA-Z_][a-zA-Z0-9_]*` matches identifiers, `[0-9]+` matches integer literals, and so on.

The reason regular expressions suffice here is structural: tokens have no nesting. You do not need to match balanced parentheses to decide whether `for` is a keyword. The union of all token regexes is compiled into a single DFA via the subset construction algorithm. The DFA runs in $O(n)$ time over an input of $n$ characters, transitioning state on each character until no transition is defined, at which point it emits the current token and resets.

The DFA cannot back up arbitrarily. This forces *maximal munch*: the lexer always extends the current token as far as possible. That is why `i+++++j` tokenizes as `i++ ++ +j` — each `++` is consumed greedily — and why the resulting parse is an error even though `i++ + ++j` would be valid.

### Parsing (Syntactic Analysis)

The parser takes the token stream and constructs an *abstract syntax tree* (AST). The key word is *abstract*: unlike a parse tree, the AST discards punctuation tokens (parentheses, semicolons) that encode structure redundantly once the tree shape is established.

Programming language grammars are *context-free grammars* (CFGs) because token sequences nest arbitrarily. A finite automaton has $O(1)$ memory; it cannot count nesting depth. A pushdown automaton — the machine that recognizes CFGs — uses a stack, and the call stack of a recursive-descent parser *is* that stack.

Operator precedence is not magic: it is encoded in the grammar hierarchy. Addition and multiplication are separate grammar rules at different levels:

$$\text{expr} \rightarrow \text{term} \;(\;(\texttt{+} \mid \texttt{-})\; \text{term}\;)^*$$
$$\text{term} \rightarrow \text{factor} \;(\;(\texttt{*} \mid \texttt{/})\; \text{factor}\;)^*$$

Because `term` is a sub-rule of `expr`, any multiplication is resolved deeper in the tree before the addition that contains it — establishing that $\times$ binds tighter than $+$ purely through grammar structure, before any precedence tables are consulted.

For `2 + 3 * 4` the resulting AST is:

```
BinaryOp(+)
├── Integer(2)
└── BinaryOp(*)
    ├── Integer(3)
    └── Integer(4)
```

Not a flat left-to-right chain. The tree *is* the precedence.

### Intermediate Representation (IR)

After parsing, the compiler lowers the AST into an *intermediate representation* (IR). The IR must be low enough that every construct maps unambiguously to a machine operation, and high enough that optimizations can reason about data flow without being tangled in target-specific details like register names or addressing modes.

The standard IR form is *Static Single Assignment* (SSA). Every variable is defined exactly once. Reassignment in the source introduces a new SSA name:

```
// Source
x = a + b;
x = x * 2;

// SSA
%x1 = add %a, %b
%x2 = mul %x1, 2
```

The key consequence: given any use of a value, its definition site is unique and immediately known. This makes *use-def chains* — the graph connecting every use to the instruction that produced it — trivially representable without an analysis pass. Most classical optimizations (constant propagation, dead code elimination, value numbering) become linear-time algorithms over SSA instead of fixed-point iterations over non-SSA IR.

LLVM IR is SSA-based and survives in textual form you can inspect directly. GCC uses two SSA-based IRs internally: GIMPLE (for language-independent optimizations) and RTL (register transfer language, for machine-level optimizations).

### Optimization

Optimization transforms the IR into a semantically equivalent IR that executes faster or uses fewer resources. "Semantically equivalent" is defined precisely: the compiler must preserve all *observable behavior* — reads and writes to `volatile` objects, calls to I/O functions, signals. Everything else is fair game.

This is the contract behind undefined behavior. When you dereference a null pointer, the standard says behavior is undefined — not "crashes" or "reads zero," but *the compiler may assume this never happens*. That assumption propagates backward: if reaching a code point requires a null dereference, the compiler may assume that code point is unreachable, and may delete the branch that leads to it. This is not a bug in the compiler; it is the optimizer using a contract you agreed to by writing C.

Key passes and why they work:

- **Constant folding**: Evaluate constant expressions at compile time. `3 * 4 → 12`. Valid because integer arithmetic is deterministic and has no observable side effects.
- **Dead code elimination (DCE)**: Remove instructions whose result has no use. SSA makes this $O(n)$: any instruction with zero uses in the use-def chain is dead.
- **Common subexpression elimination (CSE)**: If `%t1 = mul %a, %b` appears twice with no intervening definition of `%a` or `%b`, replace the second with a copy of `%t1`. In SSA this is trivially detected because definitions are unique — two identical expressions with the same operand names *must* produce the same value.
- **Loop invariant code motion (LICM)**: If an expression inside a loop has no operand defined inside the loop, it produces the same value on every iteration. Hoist it to the loop preheader. The loop body then executes fewer instructions; the hoisted instruction executes once regardless of trip count $n$, saving $O(n)$ work.
- **Inlining**: Substitute the function body at a call site. On its own this increases code size. The value is that it *enables* other passes — argument values become constants, enabling constant folding; aliasing becomes local, enabling CSE; branches over dead paths become visible, enabling DCE. Inlining is a multiplier for other optimizations, not a standalone win.

### Code Generation

Code generation maps optimized IR to target instructions. Three sub-problems:

**Instruction selection**: Each IR operation must be covered by one or more machine instructions. A single IR multiply might map to `imulq`, or — if the multiplier is a power of two — to a left shift, which executes in fewer cycles on some microarchitectures. Compilers use *tree pattern matching* over the IR: the cheapest covering set of patterns wins, where cost is typically latency or code size.

**Register allocation**: IR values are unbounded; physical registers are finite. The live range of a value spans from its definition to its last use. Two values whose live ranges overlap *interfere* — they cannot share a register. Build an *interference graph* $G = (V, E)$ where $V$ is the set of IR values and $(u, v) \in E$ iff $u$ and $v$ are simultaneously live. Register allocation is $k$-coloring of $G$ where $k$ is the number of available registers. $k$-coloring is NP-complete in general; compilers use Chaitin-Briggs graph coloring heuristics, which work well in practice. When $G$ cannot be $k$-colored, a node is *spilled*: the value is stored to the stack and reloaded at each use, at the cost of a load-store pair per access.

**Instruction scheduling**: Modern CPUs are pipelined and superscalar. An instruction with a 4-cycle latency that is immediately followed by an instruction consuming its result causes a 3-cycle stall. The scheduler reorders instructions — without changing data dependencies — to fill those slots. This is a variant of list scheduling on the *data dependence graph* of the basic block.

---

## How It Works

### Lexing in Detail

Consider `valP = PC + 9`. The DFA processes left to right:

| Characters | Token type | Value |
|---|---|---|
| `valP` | `IDENTIFIER` | `valP` |
| `=` | `ASSIGN` | — |
| `PC` | `IDENTIFIER` | `PC` |
| `+` | `PLUS` | — |
| `9` | `INTEGER` | `9` |

When the DFA reaches the space after `valP`, the space character has no valid transition from the identifier state, so the lexer emits `IDENTIFIER("valP")` and discards the space. The DFA resets to its start state and advances.

Why does `9abc` fail in C? The maximal-munch rule consumes `9` as an integer literal. Then `a` arrives at the start state — it begins what looks like an identifier, but immediately follows a numeric literal with no separating whitespace. The C standard calls this a *preprocessing number* that fails to convert to a valid token, producing a diagnostic. The lexer does not invent whitespace.

### Parsing and the AST

A recursive-descent parser implements each grammar non-terminal as a function. `parse_expr()` calls `parse_term()`, which calls `parse_factor()`. The mutual recursion mirrors the grammar hierarchy. The call stack at any point *is* the parse stack — this is why recursive descent naturally handles left-to-right, one-token lookahead grammars (LL(1)).

For `valP = PC + 9`, a simplified C-like grammar produces:

```
Assignment
├── lhs: Identifier("valP")
└── rhs: BinaryO
