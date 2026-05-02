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

## Why This Matters

Software has bugs that testing cannot find. Testing checks specific inputs; logic checks *all* inputs simultaneously. The difference is not quantitative — it is categorical. A test suite that covers a million inputs still leaves unchecked the one input that triggers the race condition. A formal proof eliminates that category of doubt entirely.

This is not theoretical: the Linux kernel's memory model is formally specified in a language called LKMM and checked with a tool called `herd7`. The TLS 1.3 protocol was verified with ProVerif before deployment. A model checker found a real livelock bug in the Linux ext3 journaling layer. SAT solvers are embedded in GCC's value-range propagation, in CBMC (a bounded model checker for C), and in hardware verification toolchains. Knowing how these tools work tells you what they can and cannot guarantee — and why "passes all tests" is a weaker claim than it sounds.

---

## Core Concepts

### Propositional Logic

Propositional logic deals with atomic propositions — statements with a definite truth value — and connectives that combine them. There are no quantified variables, no functions, no structure inside a proposition. It is the base layer that everything else builds on.

| Symbol | Name | Truth condition |
|--------|------|-----------------|
| $\neg P$ | negation | true iff $P$ is false |
| $P \land Q$ | conjunction | true iff both true |
| $P \lor Q$ | disjunction | true iff at least one true |
| $P \Rightarrow Q$ | implication | false only when $P$ true and $Q$ false |
| $P \Leftrightarrow Q$ | biconditional | true iff same truth value |

Implication deserves attention. $P \Rightarrow Q$ is **vacuously true** when $P$ is false — the premise never fired, so the implication was never challenged. This is why a specification like "if `malloc` returns non-null, then the pointer is aligned" is trivially satisfied whenever `malloc` returns null. Your verifier is not broken; the formula is vacuously true. You must separately verify the case where the pointer is actually returned.

A formula is a **tautology** if it is true under every truth assignment (e.g., $P \lor \neg P$), a **contradiction** if false under every assignment (e.g., $P \land \neg P$), and **satisfiable** if true under at least one assignment. Tautologies and contradictions are the two degenerate cases; satisfiability is the interesting middle ground that SAT solvers exploit.

### Predicate Logic

Predicate logic adds variables, predicates, and quantifiers. A predicate $P(x)$ is a proposition parameterized by an object $x$. Quantifiers let you make claims over entire domains.

$$\forall x \, P(x) \quad \text{"for all } x \text{, } P(x) \text{ holds"}$$
$$\exists x \, P(x) \quad \text{"there exists an } x \text{ such that } P(x) \text{ holds"}$$

The duality of quantifiers and negation is fundamental and practical:

$$\neg \forall x \, P(x) \equiv \exists x \, \neg P(x)$$
$$\neg \exists x \, P(x) \equiv \forall x \, \neg P(x)$$

To **refute** a universal claim, you need one counterexample. To **refute** an existential claim, you must rule it out for every element of the domain. This asymmetry directly explains why model checkers produce counterexample traces when they find a bug: they are witnessing the existential $\exists \text{trace} \, \neg P(\text{trace})$.

Predicate logic is the natural language for system specifications. "Every file descriptor returned by `open` is positive" is $\forall fd \, (\text{open returns } fd \Rightarrow fd > 0)$. "There exists a schedule under which two threads both hold the same mutex" is $\exists s \, (\text{mutex\_held}(A, s) \land \text{mutex\_held}(B, s))$. Making specifications explicit in this form forces precision that informal prose cannot provide.

### The SAT Problem

A formula in **conjunctive normal form (CNF)** is a conjunction of **clauses**, each clause a disjunction of **literals** (a variable $x_i$ or its negation $\neg x_i$):

$$(x_1 \lor \neg x_2 \lor x_3) \land (\neg x_1 \lor x_4) \land (x_2 \lor \neg x_3 \lor \neg x_4)$$

The **SAT problem**: given a CNF formula over $n$ variables, does there exist a truth assignment satisfying all clauses simultaneously?

Any propositional formula can be converted to CNF via the Tseitin transformation, which introduces auxiliary variables to avoid exponential blowup. This is why CNF is the standard input format — it is not a restriction, it is a normal form.

SAT is NP-complete: in the worst case, the search space is $2^n$. But worst-case inputs (random 3-SAT near the phase transition at clause-to-variable ratio $\approx 4.27$) rarely appear in practice. Real instances — encoding hardware circuits, compiler constraints, program verification conditions — have enough structure that DPLL with conflict-driven clause learning (CDCL) solves formulas with millions of variables in minutes. The theoretical hardness bound does not bind on structured inputs.

### SMT: SAT Over Theories

**Satisfiability Modulo Theories (SMT)** lifts SAT to richer domains. Instead of asking whether a boolean formula is satisfiable, you ask whether it is satisfiable given that variables inhabit a specific theory: linear integer arithmetic ($\mathbb{Z}$ with $+$, $\leq$), bitvectors ($\mathbb{Z}/2^n\mathbb{Z}$ with bitwise ops), arrays, uninterpreted functions.

The bitvector theory is directly relevant to C: a C `uint32_t` is exactly a 32-bit bitvector. When you ask Z3 whether an unsigned overflow check is correct, it is reasoning about $\mathbb{Z}/2^{32}\mathbb{Z}$, not mathematical integers. The distinction matters: $2^{32} - 1 + 1 = 0$ in bitvector arithmetic but $= 2^{32}$ in $\mathbb{Z}$. Getting the theory wrong gives you a proof about the wrong model.

An SMT solver works by having a DPLL-style SAT engine coordinate with theory solvers. The SAT engine proposes a candidate boolean assignment; theory solvers check whether that assignment is consistent within their theory; if not, they produce a theory lemma (a clause) that rules out the conflicting assignment and feeds it back to the SAT engine. This DPLL(T) architecture is why Z3 can handle mixed arithmetic-and-logic queries efficiently.

### Model Checking

A **Kripke structure** is a tuple $(S, S_0, R, L)$: a set of states $S$, initial states $S_0 \subseteq S$, a transition relation $R \subseteq S \times S$, and a labeling function $L : S \to 2^{AP}$ mapping states to the atomic propositions true there.

A **specification** in Linear Temporal Logic (LTL) is evaluated over paths through this structure. The core operators:

- $\square P$ — $P$ holds at **every** state on the path ("globally" / "always")
- $\diamond P$ — $P$ holds at **some** state on the path ("eventually")
- $P \mathbin{\mathcal{U}} Q$ — $P$ holds until $Q$ holds ("until")

These compose. A standard safety property for mutex correctness:

$$\square \neg (\text{cs}_A \land \text{cs}_B)$$

"It is always the case that $A$ and $B$ are not simultaneously in the critical section." A liveness property:

$$\square (\text{request} \Rightarrow \diamond \text{response})$$

"Every request is eventually followed by a response." Safety says bad things never happen. Liveness says good things eventually do. Both are necessary: a system that deadlocks satisfies all safety properties vacuously (nothing bad ever happens because nothing happens at all) but violates liveness.

Model checking works by computing the set of reachable states — either explicitly (BFS/DFS over the state graph) or symbolically (representing sets of states as BDDs or SAT formulas). When the model checker finds a state violating the specification, it outputs the shortest path from an initial state to that state. That path is a concrete counterexample.

The fundamental limitation is **state space explosion**: $k$ boolean variables give $2^k$ states; $n$ concurrent processes each with $k$ variables give $k^n$ interleavings. Symbolic model checking (using BDDs or SAT/SMT to represent sets of states) pushes this boundary but does not eliminate it.

---

## How It Works

### Resolution

Given two clauses containing a complementary literal, resolution derives a new clause:

$$\frac{(A \lor x) \quad (\neg x \lor B)}{A \lor B}$$

The variable $x$ is **resolved away**. The derived clause is a logical consequence of the two premises — if both are satisfied, so is $A \lor B$.

The **resolution refutation** procedure: add the negation of the formula you want to prove to your axioms, then apply resolution repeatedly. If you derive the empty clause $\bot$, the extended set is unsatisfiable, which means the original formula was a tautology. This is the foundation of automated theorem proving and the theoretical basis of DPLL.

### DPLL and Unit Propagation

DPLL is a backtracking search over variable assignments, accelerated by two rules:

1. **Unit propagation**: if a clause has exactly one unassigned literal, that literal *must* be true (otherwise the clause is falsified). Assign it immediately.
2. **Pure literal elimination**: if a variable appears only positively or only negatively across all remaining clauses, assign it to satisfy all those clauses at once.

Consider:

$$(x_1 \lor x_2) \land (\neg x_1 \lor x_3)
