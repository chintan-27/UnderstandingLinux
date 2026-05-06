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

## Core Concepts
### Propositional Logic
Propositional logic studies formulas built from propositional variables using the connectives ¬ (negation), ∧ (conjunction), ∨ (disjunction), → (implication), and ↔ (biconditional). A formula is **satisfiable** iff there exists a truth assignment to its variables that makes it evaluate to true under the usual Boolean semantics. The decision problem SAT asks whether a given formula is satisfiable. SAT is NP‑complete (Cook‑Levin theorem), which means any problem in NP can be reduced to SAT in polynomial time; consequently, a polynomial‑time SAT solver would imply P = NP. Functional completeness of {¬,∧,∨} (or {¬,∧}) allows any Boolean function to be expressed, enabling conversion to canonical forms such as Conjunctive Normal Form (CNF) – a conjunction of clauses, each a disjunction of literals – which is the input format for most SAT solvers.

### Predicate Logic (First‑Order Logic)
First‑order logic (FOL) extends propositional logic with:
* **Terms**: variables, constants, and function applications.
* **Atomic formulas**: predicates applied to terms, e.g., P(x, f(y)).
* **Quantifiers**: ∀ (universal) and ∃ (existential) ranging over a domain D.

A formula’s truth value depends on an **interpretation** I = (D, ·^I) assigning each constant an element of D, each function a mapping Dⁿ→D, and each predicate a relation Dⁿ→{true,false}. Free variables are those not bound by a quantifier; a sentence has no free variables and is either true or false in I.  
Key normal forms:
* **Prenex Normal Form**: ∀x₁∃x₂… Qₙxₙ · φ where φ is quantifier‑free.
* **Skolemization**: Eliminates ∃ by introducing Skolem functions, preserving satisfiability but not equivalence; useful for automated theorem proving because the resulting formula is universally quantified and can be handed to a resolution prover.

FOL is required when properties range over unbounded domains (e.g., “for all natural numbers n, n+1>n”) which propositional logic cannot express.

### SAT/SMT Intuition
**SAT** solves the decision problem for propositional CNF formulas. Core algorithms:
* **DPLL**: depth‑first search with unit propagation and pure‑literal elimination; backtracks on conflict.
* **CDCL (Conflict‑Driven Clause Learning)**: modern SAT solvers augment DPLL with clause learning, non‑chronological backtracking, and activity‑based heuristics (VSIDS). Learned clauses are derived from the implication graph of a conflict and prune the search space exponentially.

**SMT (Satisfiability Modulo Theories)** combines a SAT engine with theory solvers for domains such as:
* Linear Integer Arithmetic (LIA)
* Linear Real Arithmetic (LRA)
* Bit‑vectors (BV)
* Arrays (with read/write axioms)
* Uninterpreted Functions (UF)

The **Nelson‑Oppen** method combines disjoint theories by exchanging equality information over shared variables. An SMT solver iteratively:
1. Calls the SAT core to obtain a Boolean assignment.
2. Sends the resulting literals to each theory solver.
3. If a theory reports inconsistency, it returns a conflict clause (a lemma) that the SAT core learns.
4. Repeats until SAT core reports SAT (all theories agree) or UNSAT.

Thus SMT decides satisfiability of formulas mixing Boolean structure with theory‑specific constraints, which is essential for verifying programs that manipulate arithmetic, memory, etc.

### Model Checking Basics
A **Kripke structure** M = (S, s₀, R, L) consists of:
* Finite set of states S.
* Initial state s₀∈S.
* Transition relation R⊆S×S (total: every state has at least one successor).
* Labeling function L:S→2^AP assigning atomic propositions true in each state.

A **temporal logic** (LTL or CTL) expresses properties over paths. For example, the LTL formula **□(request → ◇ grant)** reads “whenever a request occurs, a grant will eventually follow”.  

Model checking algorithm (symbolic):
1. Represent the set of states as a Binary Decision Diagram (BDD) over Boolean variables encoding S.
2. Compute fixpoints:
   * For **□φ** (invariance): compute the greatest fixpoint of λX. (φ ∧ ∀□X) – i.e., states from which φ holds and all successors stay in X.
   * For **◇φ** (reachability): compute the least fixpoint of λX. (φ ∨ ∃□X).
3. If the initial state belongs to the resulting set, the property holds; otherwise a counterexample path is extracted by traversing the reverse fixpoint computation.

The algorithm’s complexity is PSPACE‑complete for LTL and EXPTIME‑complete for CTL, but BDDs often make practical verification feasible for systems with ≤10⁵ states.

---

## How It Works
We illustrate the pipeline from a high‑level system description to a SAT/SMT query, using a simple mutual‑exclusion protocol (Peterson’s algorithm) as the running example.

### 1. Modeling the Protocol
Two processes, P0 and P1, share two Boolean variables `flag[0]`, `flag[1]` and an integer `turn`. Each process executes:
```
flag[i] = true;
turn = j;          // j = 1‑i
while (flag[j] && turn == j) { /* busy‑wait */ }
// critical section
flag[i] = false;
```
We abstract each line as a propositional variable representing its execution at a discrete time step *t*:
* `F_i_t` : flag[i] is true at step t
* `T_t`  : turn == i at step t
* `CS_i_t`: process i is in its critical section at step t
* `PC_i_t`: program counter of i at step t (encoded with three bits for the three non‑critical sections).

### 2. Transition Relation
For each step we build a Boolean formula **Next** that relates variables at *t* to those at *t+1*. Example for process 0 setting its flag:
```
(F0_{t+1} ↔ (PC0_t == SET_FLAG0)) ∧
(PC0_{t+1} ↔ (PC0_t == SET_FLAG0 ? TURN0 : PC0_t))
```
Similar conjuncts encode the test of `flag[1]` and `turn`, the entry to CS, and the exit. The full transition relation is the conjunction of all such clauses for both processes. This yields a CNF formula after Tseitin transformation (introducing auxiliary variables for each sub‑expression).

### 3. Property to Check
Mutual exclusion: ¬(CS0 ∧ CS1) must hold in every reachable state. In LTL: **□¬(CS0 ∧ CS1)**. To check with a SAT‑based bounded model checker (BMC), we unroll the transition relation *k* steps and ask whether there exists a path violating the property:
```
Init ∧ (⋀_{t=0}^{k-1} Next_t) ∧ (⋁_{t=0}^{k} (CS0_t ∧ CS1_t))
```
If the formula is SAT, the model checker returns a concrete counterexample trace of length ≤ k; if UNSAT for all *k* up to a completeness threshold (the system’s diameter), the property holds.

### 4. From SAT to SMT
Suppose we replace the Boolean `turn` with an integer variable ranging over {0,1} and want to verify **absence of starvation**: each process that repeatedly tries to enter CS eventually succeeds. This requires reasoning about counters, which is naturally expressed in Linear Integer Arithmetic. The transition relation now contains arithmetic constraints like:
```
turn' = (turn == 0) ? 1 : 0
```
and the property becomes:
```
□(req0 → ◇ CS0)
```
where `req0` is a flag that process 0 has set its `flag[0]`. The resulting formula is handed to an SMT solver (e.g., Z3) which uses its SAT core for Boolean structure and its LIA solver for the arithmetic constraints, producing either a model (a violating trace) or a proof of invariance.

---

## Worked Examples
### 1. Propositional Logic – Truth Table with Derivation
**Problem**: Determine whether the formula  
\(F = (P \lor Q) \land (\lnot P \lor R)\)  
is satisfiable.

**Solution**:
1. Apply distributive law (optional):  
   \(F = (P \lor Q) \land (\lnot P \lor R) \equiv (P \land \lnot P) \lor (P \land R) \lor (Q \land \lnot P) \lor (Q \land R)\).
2. Notice \(P \land \lnot P\) is always false, so drop it.  
   \(F \equiv (P \land R) \lor (Q \land \lnot P) \lor (Q \land R)\).
3. Build truth table for the three remaining conjuncts:

| P | Q | R | P∧R | Q∧¬P | Q∧R | F |
|---|---|---|-----|------|-----|---|
| 0 | 0 | 0 | 0   | 0    | 0   | 0 |
| 0 | 0 | 1 | 0   | 0    | 1   | 1 |
| 0 | 1 | 0 | 0   | 1    | 0   | 1 |
| 0 | 1 | 1 | 0   | 1    | 1   | 1 |
| 1 | 0 | 0 | 0   | 0    | 0   | 0 |
| 1 | 0 | 1 | 1   | 0    | 0   | 1 |
| 1 | 1 | 0 | 0   | 0    | 0   | 0 |
| 1 | 1 | 1 | 1   | 0    | 1   | 1 |

Since there are rows with **F = 1** (e.g., P=0,Q=0,R=1), the formula is satisfiable. A satisfying assignment is \(P=0, Q=0, R=1\).

### 2. Predicate Logic – Quantifier Negation and Skolemization
**Problem**: Show that the sentence  
\(\forall x\,\exists y\;(P(x) \rightarrow Q(y))\)  
is equivalent to its Skolem normal form.

**Solution**:
1. Rewrite implication: \(P(x) \rightarrow Q(y) \equiv \lnot P(x) \lor Q(y)\).
2. Move quantifiers to prenex (already prenex).  
   \(\forall x\,\exists y\,(\lnot P(x) \lor Q(y))\).
3. Skolemize the existential ∃y: introduce a Skolem function \(f(x)\) (arity 1 because it depends on the universally quantified x).  
   Result: \(\forall x\,(\lnot P(x) \lor Q(f(x)))\).
4. Drop the universal quantifier (implicit in resolution): clause form  
   \(\{\lnot P(x),\; Q(f(x))\}\).
Thus any refutation of the original sentence can be performed on this clause set.

### 3. SAT – DPLL Walk‑through
**Formula in CNF**:  
\((A \lor B) \land (\lnot A \lor C) \land (\lnot B \lor \lnot C)\).

**DPLL steps**:
1. **Unit propagation**: No unit clauses initially.
2. **Choose literal** (e.g., A = true) → assign A=1.
   * Clause (A ∨ B) satisfied.
   * Clause (¬A ∨ C) reduces to C (unit).
3. Propagate C=1.
   * Clause (¬A ∨ C) satisfied.
   * Clause (¬B ∨ ¬C) reduces to ¬B (unit).
4. Propagate B=0.
   * Clause (A ∨ B) satisfied (A=1).
   * Clause (¬B ∨ ¬C) satisfied (¬B=1).
All clauses satisfied → **SAT** with model {A=1, B=0, C=1}.

If the first choice had been A=0, we would derive B=1 from (A∨B), then C=0 from (¬B∨¬C), conflicting with (¬A∨C) which would become C (unit) requiring C=1 → conflict → backtrack and try A=1, yielding the model above.

### 4. SMT – Linear Arithmetic Example
**Problem**: Check satisfiability of  
\((x + y \geq 5) \land (x - y \leq 1) \land (x \geq 0) \land (y \geq 0)\).

**Solution** (using Z3’s theory of linear real arithmetic):
1. From \(x - y \leq 1\) we get \(y \geq x - 1\).
2. Combine with \(x + y \geq 5\): substitute lower bound for y:  
   \(x + (x - 1) \geq 5 \Rightarrow 2x \geq 6 \Rightarrow x \geq 3\).
3. With \(x \geq 3\) and \(y \geq x - 1\) we get \(y \geq 2\).
4. Check non‑negativity: \(x \geq 3, y \geq 2\) satisfy \(x,y \geq 0\).
Thus the set is SAT; a model is \(x=3, y=2\).  
If we added the constraint \(x + y \leq 4\), the combined inequalities would give \(2x \leq 5 \Rightarrow x \leq 2.5\), contradicting \(x \geq 3\) → UNSAT.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | How to Avoid |
|---|---------|----------------|--------------|
| 1 | **Treating logical equivalence as syntactic equality** (e.g., assuming \(P \rightarrow Q\) equals \(\lnot P \lor Q\) only when written exactly that way). | Semantic equivalence depends on truth tables, not textual form. Two formulas may be equivalent yet look different (e.g., double negation). | Always verify equivalence via truth tables, algebraic laws, or a SAT check of \((\phi \leftrightarrow \psi)\). |
| 2 | **Mis‑scoping quantifiers** (e.g., writing \(\forall x\,P(x) \rightarrow Q\) meaning \((\forall x\,P(x)) \rightarrow Q\) when intending \(\forall x\,(P(x) \rightarrow Q)\)). | The former states “if every x satisfies P then Q holds”, which is far weaker. The scope of ∀ determines which variables are bound. | Use parentheses explicitly; when in doubt, write the quantified sub‑formula in its own block. |
| 3 | **Assuming a SAT solver’s model works for any theory** (e.g., feeding a formula with arithmetic to a plain SAT solver). | SAT solvers only understand Boolean structure; arithmetic constraints are interpreted as uninterpreted Boolean variables, leading to false SAT/UNSAT answers. | Use an SMT solver that includes the needed theory, or encode the theory into Boolean constraints (bit‑blasting) only when justified and with awareness of blow‑up. |
| 4 | **Overlooking the need for CNF conversion** before running DPLL‑based solvers. | DPLL expects clauses; feeding an arbitrary formula may cause incorrect behavior or exponential blow‑up due to missing transformations. | Apply Tseitin transformation to obtain an equisatisfiable CNF with linear size increase; keep track of introduced auxiliary variables if model extraction is needed. |
| 5 | **Believing model checking always terminates quickly** for large systems. | The state space can grow exponentially (state explosion); BDDs may blow up, and bounded model checking may need depth equal to the system’s diameter, which can be huge. | Apply abstraction, symmetry reduction, or inductive invariants; complement model checking with theorem proving or testing when state explosion is unavoidable. |

---

## Exercises
### Easy
1. **Truth Table** – Determine satisfiability of \((A \lor \lnot B) \land (\lnot A \lor B)\). Show the table and a satisfying assignment if any.  
2. **Quantifier Translation** – Express “There exists a smallest natural number” in FOL, then write its negation.  
3. **SAT Solver Invocation** – Install `minisat` (`sudo apt-get install minisat`) and run it on the DIMACS file:  
   ```bash
   echo -e "p cnf 3 3\n1 2 0\n-1 3 0\n-2 -3 0" > example.cnf
   minisat example.cnf
   ```
   Report SAT/UNSAT and the model.

### Medium
4. **DPLL Trace** – Manually run DPLL on the formula  
   \((X \lor Y \lor Z) \land (\lnot X \lor \lnot Y) \land (Y \lor \lnot Z) \land (\lnot Y \lor Z)\)  
   showing each decision, propagation, and backtrack step.  
5. **SMT Arithmetic** – Use Z3’s Python API to check whether the constraints  
   \(2x + 3y = 7,\; x - y \geq 2,\; x \leq 5\)  
   admit an integer solution. Print the model or “unsat”.  
6. **Model Checking Invariant** – For a two‑process mutual‑exclusion algorithm with variables `flag[0], flag[1], turn`, write the inductive invariant that guarantees mutual exclusion and prove it by showing it holds initially and is preserved by each transition (you may sketch the proof; no need to run a model checker).

### Hard
7. **SMT Encoding of a Buffer Overflow** – Model a simple C snippet:  
   ```c
   void foo(int n) {
       char buf[10];
       for (int i = 0; i <= n; i++) buf[i] = 'A';
   }
   ```  
   Using the theory of fixed‑size bit‑vectors (width 8 for `char`), encode the condition that an out‑of‑bounds write occurs (i.e., ∃i·(i < 0 ∨ i ≥ 10) ∧ loop guard permits it). Run Z3 to determine whether such an i exists for any `n`.  
8. **Bounded Model Checking Depth** – Compute the diameter of the transition system for Peterson’s algorithm with two processes and three control locations each (ignore data variables). Using that diameter, argue what bound *k* guarantees completeness for checking mutual exclusion.  
9. **Hybrid SAT/SMT Proof** – Prove that the formula  
   \((x \geq 0) \land (y \geq 0) \land (x + y \leq 5) \land (x - y \geq 3)\)  
   is UNSAT by first converting the arithmetic constraints to CNF via bit‑blasting (4‑bit two’s complement) and then running a SAT solver; show the resulting CNF clause count and the final conflict clause.

---

## Linux Connection
### 1. Kconfig – SAT‑based Configuration
The Linux kernel’s configuration system (`Kconfig`) allows developers to enable/disable features via symbols with Boolean expressions such as `depends on`, `select`, and `implies`. The solver that checks whether a set of user selections is realizable is a **SAT solver** built into `scripts/kconfig/`.  

*File locations*:
- `scripts/kconfig/conf.c` – main entry for `make menuconfig`.
- `scripts/kconfig/expr.c` – parsing and evaluation of Boolean expressions.
- `scripts/kconfig/symbol.c` – symbol database and implication graph.

Running `make menuconfig` invokes the solver; if the configuration is contradictory, the tool prints an error like:
```
error: unsatisfiable dependencies detected
```
**Command to see the underlying CNF** (debug mode):
```bash
make menuconfig KCONFIG_CONFIG=debug.config
# The file debug.config will contain lines like:
# CONFIG_FOO=y
# CONFIG_BAR=n
# ...
```
Internally, the solver converts each `depends on expr` into a clause ¬symbol ∨ expr and runs a CDCL‑based SAT check.

### 2. eBPF Verifier – SMT (Z3) for Safety
The extended Berkeley Packet Filter (eBPF) verifier (`kernel/bpf/verifier.c`) uses the **Z3** SMT solver to prove that every possible execution of an eBPF program respects memory bounds, does not execute infinite loops, and calls only allowed helper functions.

Key steps:
1. Convert the eBPF instruction stream into **static single‑assignment (SSA)** form.
2. Generate verification conditions (VC
