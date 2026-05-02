---
id: 14
title: "Formal languages and automata math"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Why This Matters

Every program you write is a string of characters. Whether the kernel accepts it, a compiler transforms it, or a shell executes it depends entirely on whether that string belongs to a particular *language* — a set defined by precise mathematical rules. Without formal language theory, you cannot build a parser, write a regex engine, design a protocol grammar, or reason about what problems are fundamentally unsolvable.

This is not abstract: when `flex` tokenizes C source, it compiles regular expressions into a DFA transition table and emits it as a C array. When the kernel's `ftrace` subsystem parses filter expressions in `/sys/kernel/debug/tracing/set_ftrace_filter`, it runs a hand-written recursive descent parser for a context-free grammar. When `iptables` matches packet strings with `-m string --algo bm`, it uses the Boyer-Moore finite automaton. The theory tells you not just *how* these tools work, but *which classes of tools are possible to build at all* — and where the hard mathematical ceiling is.

---

## Core Concepts

### Alphabets, Strings, and Languages

An **alphabet** $\Sigma$ is a finite nonempty set of symbols. A **string** over $\Sigma$ is a finite sequence of symbols. The **length** of string $w$ is written $|w|$. The empty string is $\varepsilon$, with $|\varepsilon| = 0$. The set of all strings over $\Sigma$ is $\Sigma^*$; the set excluding $\varepsilon$ is $\Sigma^+$.

A **language** $L \subseteq \Sigma^*$ is any set of strings — finite or infinite. Every decision problem is a language membership question: "does input $x$ have property $P$?" is exactly "does $x \in L_P$ where $L_P = \{x \in \Sigma^* \mid P(x)\}$?" This reduction is what connects automata theory to computability theory: asking whether a language is decidable is asking whether the corresponding decision problem has an algorithm.

### Grammars

A **formal grammar** $G = (V, \Sigma, R, S)$ consists of:
- $V$: finite set of **non-terminal** symbols (syntactic categories, never in the final string)
- $\Sigma$: finite set of **terminal** symbols, with $V \cap \Sigma = \emptyset$
- $R$: finite set of **production rules** $\alpha \to \beta$ where $\alpha, \beta \in (V \cup \Sigma)^*$
- $S \in V$: the **start symbol**

A derivation step $uAv \Rightarrow u\gamma v$ applies rule $A \to \gamma$ in context $u, v$. The language generated is:

$$L(G) = \{w \in \Sigma^* \mid S \xRightarrow{*} w\}$$

The form of the rules is what determines expressive power. Restrict the rules more tightly, and the class of languages shrinks — but so does the complexity of the recognizer you need.

### The Chomsky Hierarchy

| Type | Constraint on rules | Recognizer | Canonical example |
|------|--------------------|-----------|--------------------|
| 3 | $A \to aB$ or $A \to a$ (right-linear) | Finite automaton (DFA/NFA) | `[a-z]+[0-9]*` |
| 2 | $A \to \gamma$ (single non-terminal LHS) | Pushdown automaton | Balanced parentheses, C expressions |
| 1 | $|\alpha| \leq |\beta|$ (non-contracting) | Linear-bounded automaton | Some cross-serial dependencies |
| 0 | Unrestricted | Turing machine | Arbitrary computation |

The containment is strict: Regular $\subsetneq$ Context-free $\subsetneq$ Context-sensitive $\subsetneq$ Recursively enumerable. Each boundary marks a concrete capability jump: finite memory → stack → bounded tape → unbounded tape.

### Regular Languages and Finite Automata

A **deterministic finite automaton (DFA)** is a 5-tuple $(Q, \Sigma, \delta, q_0, F)$:
- $Q$: finite set of states
- $\delta: Q \times \Sigma \to Q$: total transition function
- $q_0 \in Q$: start state
- $F \subseteq Q$: accepting states

The DFA processes input left-to-right, one symbol at a time. On string $w = a_1 a_2 \cdots a_n$, it computes the state sequence:

$$q_0, \; \delta(q_0, a_1), \; \delta(\delta(q_0, a_1), a_2), \; \ldots$$

and accepts iff the final state is in $F$. The extended transition function $\hat{\delta}: Q \times \Sigma^* \to Q$ is defined recursively:

$$\hat{\delta}(q, \varepsilon) = q \qquad \hat{\delta}(q, wa) = \delta(\hat{\delta}(q, w), a)$$

A language is **regular** if and only if some DFA recognizes it. The three formalisms — DFA, NFA, regular expression — describe exactly the same class.

**Why the equivalence?**
- NFA → DFA: the **subset construction**. States of the DFA are elements of $2^Q$ (subsets of NFA states). If the NFA has $n$ states, the DFA has at most $2^n$ states — this bound is tight in the worst case, which is why some regex engines that simulate NFAs directly avoid the exponential blowup.
- Regex → NFA: **Thompson's construction**. Build NFA fragments for base cases ($\varepsilon$, single symbol), then compose them for union, concatenation, and Kleene star. The result is always an NFA with at most $2|r|$ states for regex $r$.
- DFA → regex: state elimination on the transition graph, treating each edge label as a regex.

These constructions matter in practice: `re2c` (used in PHP, Nginx) applies subset construction to generate minimal DFAs from regex; GNU `grep` with `-E` uses NFA simulation to avoid backtracking.

### Context-Free Languages and Pushdown Automata

A **context-free grammar (CFG)** restricts all rules to $A \to \gamma$ where $A \in V$ is a single non-terminal. The "context-free" name is precise: the rule applies to $A$ regardless of the symbols surrounding it in any sentential form. This is what makes CFGs tractable — you can parse a non-terminal's subtree independently.

A **pushdown automaton (PDA)** is an NFA plus a stack. The transition reads the current input symbol and top-of-stack symbol, then writes a new stack string and moves to a new state. The stack gives unbounded memory with LIFO discipline. This is exactly enough to match nested structures because nesting is inherently a last-in-first-out phenomenon: the innermost delimiter must close before the outer one.

The canonical non-regular, context-free language:

$$L = \{a^n b^n \mid n \geq 1\}$$

No DFA recognizes this because any DFA has a fixed finite number of states $|Q|$, so by the time it reads $|Q|+1$ copies of $a$, it must have revisited some state — it has lost count. The PDA strategy: push one stack symbol per $a$, pop one per $b$, accept on empty stack.

**The Pumping Lemma for regular languages**: if $L$ is regular with pumping length $p$, then any $w \in L$ with $|w| \geq p$ can be written $w = xyz$ where:
1. $|xy| \leq p$
2. $|y| \geq 1$
3. $xy^iz \in L$ for all $i \geq 0$

To prove $\{a^n b^n\}$ is not regular: choose $w = a^p b^p$. Any split $xyz$ with $|xy| \leq p$ forces $y = a^k$ for some $k \geq 1$, so $xy^2z = a^{p+k}b^p \notin L$. Contradiction.

There is an analogous pumping lemma for CFLs (Ogden's lemma), which establishes that $\{a^n b^n c^n\}$ is not context-free.

### Computability: Turing Machines and Limits

A **Turing machine** has a finite-state control, a two-way infinite tape of cells, and a head that reads, writes, and moves left or right. A transition is a function:

$$\delta: Q \times \Gamma \to Q \times \Gamma \times \{L, R\}$$

where $\Gamma \supseteq \Sigma$ is the tape alphabet. Unlike a DFA, a TM can loop forever.

A language is **decidable** (recursive) if some TM halts on every input and accepts iff the input is in $L$. It is **recognizable** (recursively enumerable) if some TM halts and accepts all strings in $L$ but may loop on strings not in $L$.

The **Halting Problem** $H = \{\langle M, w \rangle \mid M \text{ halts on } w\}$ is recognizable but not decidable. The proof by **diagonalization**: assume decider $H$ exists. Construct TM $D$: on input $\langle M \rangle$, run $H(\langle M, \langle M \rangle \rangle)$; if $H$ accepts, loop; if $H$ rejects, accept. Now ask: what does $D$ do on input $\langle D \rangle$? $D$ halts iff $D$ loops — contradiction. No engineering resolves this. It is a property of the mathematical structure of computation itself.

**Reductions** extend undecidability: if you can transform instances of $H$ into instances of problem $P$ in a computable way, then $P$ is also undecidable. This is how Rice's theorem is proved: every non
