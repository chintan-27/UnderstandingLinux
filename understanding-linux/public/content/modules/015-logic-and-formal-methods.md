---
id: 15
title: "Logic and formal methods"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Module 15: Logic and Formal Methods — Propositional Logic, Predicate Logic, SAT/SMT, and Model Checking

## Why This Matters

The Linux kernel's BPF verifier rejects a program if it cannot prove, through exhaustive symbolic execution, that every possible execution path is memory-safe. The rejection is not heuristic — it is a logical proof. The verifier encodes program state as constraints and checks satisfiability. When it fails, the kernel prints a message like `R1 unbounded memory access` — which means: "I could not prove $\forall$ execution paths, the pointer is within bounds." Understanding why requires knowing what satisfiability means, what makes a proof valid, and why exhaustive state-space search is sometimes the only option.

Dirty COW (CVE-2016-5195) is instructive not as a cautionary tale but as a logical failure: the kernel held a belief expressible as $\text{readonly}(\text{mapping}) \Rightarrow \neg\text{writable}(\text{pte})$, but a race condition allowed a sequence of events that falsified the consequent while the antecedent held. The invariant was never formally stated, never checked mechanically, and therefore broke silently. `sparse`, `CBMC`, and the BPF verifier exist because informal reasoning has a track record of missing exactly these cases.

---

## Core Concepts

### Propositional Logic

Propositional logic deals with atomic statements — true ($\top$) or false ($\bot$) — combined with connectives:

| Operator | Symbol | Semantics |
|---|---|---|
| NOT | $\neg P$ | $\top$ iff $P = \bot$ |
| AND | $P \land Q$ | $\top$ iff both $\top$ |
| OR | $P \lor Q$ | $\top$ iff at least one $\top$ |
| IMPLIES | $P \Rightarrow Q$ | $\bot$ iff $P = \top$ and $Q = \bot$ |
| IFF | $P \Leftrightarrow Q$ | $\top$ iff same value |

Implication deserves attention because it consistently surprises people. $P \Rightarrow Q$ is not an assertion that $Q$ is true — it is a constraint on the relationship between $P$ and $Q$. When $P$ is false, the constraint is trivially satisfied regardless of $Q$. This is called **vacuous truth** and it is not a philosophical quirk; it is what makes modus ponens sound. If implication were false when $P$ was false, you could not chain inferences: knowing $A \Rightarrow B$ and $B \Rightarrow C$ would no longer guarantee $A \Rightarrow C$ in degenerate cases.

A formula is:
- **Tautological** if it evaluates to $\top$ under every variable assignment — e.g., $P \lor \neg P$
- **Contradictory** if it evaluates to $\bot$ under every assignment — e.g., $P \land \neg P$
- **Satisfiable** if at least one assignment makes it $\top$

The tautology/satisfiability duality is operationally important: to check if a formula $\phi$ is a tautology, check whether $\neg \phi$ is unsatisfiable. This is why SAT solvers are the computational core of theorem provers.

### Predicate Logic (First-Order Logic)

Propositional logic has no variables ranging over objects, so it cannot express properties of kernel data structures in any useful way. Predicate logic adds:

- **Terms**: variables ($x$, $p$, $\text{addr}$) ranging over a domain
- **Predicates**: $\text{valid}(p)$, $\text{locked}(m)$, $\text{covers}(\text{vma}, \text{addr})$
- **Quantifiers**:
  - $\forall x \, P(x)$ — $P$ holds for every element of the domain
  - $\exists x \, P(x)$ — $P$ holds for at least one element

The Linux VMA invariant — every mapped address is covered by exactly one VMA — is:

$$\forall \text{addr} \left( \text{mapped}(\text{addr}) \Rightarrow \exists! \, \text{vma} \left( \text{covers}(\text{vma}, \text{addr}) \right) \right)$$

where $\exists!$ means "there exists exactly one." This is a formula you can write down, attempt to prove from the kernel's data structure invariants, or hand to a model checker. You cannot express it in propositional logic because it quantifies over an unbounded domain of addresses.

Quantifier scope matters precisely because negation distributes through quantifiers in non-obvious ways:

$$\neg \forall x \, P(x) \equiv \exists x \, \neg P(x)$$
$$\neg \exists x \, P(x) \equiv \forall x \, \neg P(x)$$

A bug report that says "this invariant was violated" is asserting $\exists x \, \neg P(x)$ — a single counterexample suffices to falsify a universal claim. This is why model checkers and fuzzers search for counterexamples rather than attempting proofs: falsification is often dramatically cheaper than verification.

### SAT and the Complexity of Reasoning

A **SAT problem** asks: given a propositional formula in **Conjunctive Normal Form (CNF)** — a conjunction of clauses, each clause a disjunction of literals — does any variable assignment satisfy it?

$$(\neg A \lor B \lor C) \land (A \lor \neg B) \land (\neg C \lor A)$$

SAT is NP-complete. This means: no polynomial-time algorithm is known, and the problem is at least as hard as every other problem in NP under polynomial reduction. The implication for verification is direct: checking whether a program has a bug that can be triggered within $k$ steps is reducible to SAT in $O(k)$ clauses, so verification is at least NP-hard in general. This is not a limitation of current tools — it is a structural property of the problem.

Despite NP-completeness, modern solvers (CaDiCaL, Kissat, MiniSat) handle industrial instances with $10^6$–$10^7$ variables because real-world instances have exploitable structure. The key algorithmic ingredient is **Conflict-Driven Clause Learning (CDCL)**, described below.

### SMT: Reasoning Over Richer Domains

**SMT (Satisfiability Modulo Theories)** extends SAT with background theories: integers ($\mathbb{Z}$), bitvectors ($\mathbb{Z}_{2^n}$), arrays, floating point, uninterpreted functions. The SMT solver coordinates a SAT solver (handling Boolean structure) with theory solvers (handling arithmetic, memory models, etc.) via the DPLL(T) architecture.

Where SAT can only check:

$$(A \land B) \lor \neg C$$

SMT can check, in the theory of bitvectors, whether a C expression can overflow:

$$\text{BV}_{32}(x) + \text{BV}_{32}(y) < \text{BV}_{32}(x)$$

This is precisely what the BPF verifier does for register arithmetic: it maintains range constraints as SMT-style bitvector constraints and checks whether unsafe states are reachable.

The core SMT theories relevant to kernel verification:

| Theory | Domain | Kernel Use |
|---|---|---|
| QF_BV | Fixed-width bitvectors | Integer overflow, pointer arithmetic |
| QF_A | Arrays with reads/writes | Memory models |
| QF_LIA | Linear integer arithmetic | Loop bounds, buffer sizes |
| QF_UF | Uninterpreted functions | Abstraction of system calls |

### Model Checking

A **Kripke structure** is a tuple $M = (S, S_0, R, L)$ where $S$ is a set of states, $S_0 \subseteq S$ the initial states, $R \subseteq S \times S$ the transition relation, and $L : S \to 2^{\text{AP}}$ a labeling function mapping states to the atomic propositions true in that state.

**Model checking** answers: does $M \models \phi$? — does every execution of the system satisfy the formula $\phi$?

The key temporal logics are:

- **LTL (Linear Temporal Logic)**: reasons about a single linear execution path. Operators:
  - $\mathbf{G}\, P$ — $P$ holds at every future state ("globally")
  - $\mathbf{F}\, P$ — $P$ holds at some future state ("finally")
  - $P \, \mathbf{U} \, Q$ — $P$ holds continuously until $Q$ becomes true
  - $\mathbf{X}\, P$ — $P$ holds at the next state

- **CTL (Computation Tree Logic)**: reasons over branching execution trees, with path quantifiers $\mathbf{A}$ (all paths) and $\mathbf{E}$ (some path) prefixed to temporal operators.

The mutual exclusion property in LTL:

$$\mathbf{G}\, \neg (\text{inCS}_1 \land \text{inCS}_2)$$

The liveness property (every request is eventually granted) in LTL:

$$\mathbf{G}\, (\text{request} \Rightarrow \mathbf{F}\, \text{granted})$$

The difference between LTL and CTL matters for expressiveness. "$P$ is reachable" is $\mathbf{EF}\, P$ in CTL but not directly expressible in LTL (LTL cannot distinguish "on some path" from "on all paths"). Conversely, $\mathbf{G}\,\mathbf{F}\, P$ ("$P$ happens infinitely often") is LTL but not CTL. Most industrial model checkers support CTL* (which subsumes both) or operate directly on LTL via automata-theoretic methods.

---

## How It Works

### CNF Conversion: Tseitin Transformation

Naive CNF conversion via distribution can produce
