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

## Core Concepts
### Formal Languages, Alphabets, and Strings
An **alphabet** Σ is a finite, non‑empty set of symbols. A **string** over Σ is a finite sequence of symbols from Σ; the set of all strings is denoted Σ\* (including the empty string ε). A **formal language** L is any subset L ⊆ Σ\*.  
The choice of Σ determines what distinctions can be made: a larger alphabet lets us encode more information per symbol, but the computational model’s power depends on how much *state* it can retain while scanning a string.

### Automata as State Machines
An automaton is a 5‑tuple  
$$M = (Q, Σ, δ, q_0, F)$$  
where  
- Q is a finite set of **states**,  
- Σ is the input alphabet,  
- δ : Q × Σ → ℘(Q) is the **transition function** (℘ denotes the powerset; for a DFA δ maps to a single state, for an NFA to a set of states),  
- q₀ ∈ Q is the **start state**,  
- F ⊆ Q is the set of **accepting (final) states**.  

A string w = a₁a₂…aₙ is accepted iff there exists a sequence of states  
q₀ →^{a₁} q₁ →^{a₂} … →^{aₙ} qₙ with qₙ ∈ F.  
The finiteness of Q forces the automaton to have **finite memory**: it can only distinguish a bounded number of histories, which is why DFAs recognize exactly the regular languages.

### Grammars
A **grammar** G is a 4‑tuple  
$$G = (V, Σ, R, S)$$  
where V is a finite set of **non‑terminals**, Σ the terminals (V ∩ Σ = ∅), R ⊆ (V ∪ Σ)\* × (V ∪ Σ)\* a finite set of **production rules**, and S ∈ V the **start symbol**.  
A derivation replaces a non‑terminal by the RHS of a rule; a string x ∈ Σ\* is in L(G) iff S ⇒\* x.  

The **Chomsky hierarchy** restricts the form of rules:  

| Class | Rule form | Recognizer |
|-------|-----------|------------|
| Type‑3 (Regular) | A → aB or A → a (right‑linear) or A → Ba or A → a (left‑linear) | DFA/NFA |
| Type‑2 (Context‑Free) | A → α, α ∈ (V ∪ Σ)\* | PDA |
| Type‑1 (Context‑Sensitive) | αAβ → αγβ, |γ| ≥ |α| (non‑contracting) | Linear‑bounded TM |
| Type‑0 (Unrestricted) | α → β, α,β ∈ (V ∪ Σ)\* | Turing machine |

The restriction on rule shape limits the *memory* needed: regular rules need only remember the *last* symbol seen; context‑free rules need a *stack* to match nested constructs; context‑sensitive rules need linearly bounded tape; unrestricted needs unlimited tape.

### Regular Languages and Regular Expressions
A language L is **regular** iff ∃ a DFA M with L(M)=L. Equivalently, L can be described by a **regular expression** built from:  
- literals a ∈ Σ,  
- concatenation (·),  
- union (+),  
- Kleene star (*).  

The equivalence follows from Kleene’s theorem:  
1. Every regular expression can be converted to an ε‑NFA (Thompson construction).  
2. Every ε‑NFA can be converted to a DFA (subset construction).  
3. Every DFA can be converted to a regular expression (state‑elimination algorithm).  

Because a DFA has only |Q| distinct memory configurations, any language requiring unbounded counting (e.g., {aⁿbⁿ | n≥0}) cannot be regular.

### Context‑Free Languages and Pushdown Automata
A language L is **context‑free** iff ∃ a PDA M with L(M)=L. A PDA extends a DFA with a **stack** Γ\*: its transition relation is  
$$δ ⊆ Q × (Σ ∪ {ε}) × Γ → ℘(Q × Γ\*)$$  
where a move may push a symbol onto the stack, pop the top symbol, or leave it unchanged.  

The stack provides **unbounded but LIFO** memory, enough to recognise languages that require matching nested symbols (e.g., aⁿbⁿ). However, a PDA cannot compare two *independent* counts (e.g., aⁿbⁿcⁿ) because it would need two independent storage mechanisms.

### Closure Properties (Why They Matter)
- **Regular languages** are closed under union, concatenation, Kleene star, intersection, complement, and homomorphism. Proofs rely on product constructions (for intersection/complement) or on the ability to simulate multiple DFAs in parallel.  
- **Context‑free languages** are closed under union, concatenation, Kleene star, and homomorphism, but **not** under intersection or complement in general (e.g., L₁ = {aⁿbⁿcᵐ} ∩ L₂ = {aᵐbⁿcⁿ} = {aⁿbⁿcⁿ} ∉ CFL). This non‑closure explains why parsers for programming languages often need extra mechanisms (symbol tables) beyond pure CFGs.

---

## How It Works
### Recognizing Regular Languages with a DFA
Given a DFA M = (Q, Σ, δ, q₀, F), processing a string w = a₁…aₙ proceeds deterministically:  
$$q_{i} = δ(q_{i-1}, a_i) \quad (1 ≤ i ≤ n)$$  
Acceptance ⇔ qₙ ∈ F.  

**Why determinism suffices**: If an NFA N recognizes L, the subset construction builds a DFA D whose states are subsets of Q_N. Each step of D simulates *all* possible NFA moves in parallel, preserving language equivalence. The blow‑up is at most 2^{|Q_N|} states, but the resulting DFA still has only finite memory.

**Example construction** (derived from regular expression (a|b)*abb):  
1. Build ε‑NFA for sub‑expressions using Thompson’s rules.  
2. Apply subset construction → DFA with states {∅, {q0}, {q0,q1}, {q0,q2}, {q0,q3}} where q3 is accepting.  
3. Transition table (Σ={a,b}):

| State          | a‑move               | b‑move               |
|----------------|----------------------|----------------------|
| ∅              | ∅                    | ∅                    |
| {q0}           | {q0,q1}              | {q0}                 |
| {q0,q1}        | {q0,q1}              | {q0,q2}              |
| {q0,q2}        | {q0,q1}              | {q0,q3}              |
| {q0,q3}        | {q0,q1}              | {q0}                 |

Accepting state = {q0,q3}.  

### Recognizing Context‑Free Languages with a PDA
A PDA M = (Q, Σ, Γ, δ, q₀, Z₀, F) processes input while maintaining a stack content γ ∈ Γ\*. A move is of the form  
$$(p, a, X) → (q, α)$$  
meaning: in state p, reading a (or ε), with X atop the stack, move to state q, replace X by string α (push if |α|>1, pop if α=ε).  

**Why a stack suffices for aⁿbⁿ**:  
- While reading a’s, push a marker X for each a.  
- Upon seeing the first b, switch to a mode that pops one X per b.  
- Accept iff the stack returns to the initial marker Z₀ exactly when input ends.  

The PDA cannot, however, handle aⁿbⁿcⁿ because after matching a’s with b’s the stack is empty; there is no remaining storage to count c’s against a’s (or b’s).

**Formal derivation** for the grammar S → aSb | ε:  
1. Start: S  
2. Apply S → aSb k times ⇒ a^k S b^k  
3. Apply S → ε ⇒ a^k b^k  

The PDA mimics this derivation: each aSb step pushes an a‑marker; each terminal b pops it.

### Subset Construction Proof Sketch (Why DFA ↔ NFA)
Let N = (Q_N, Σ, δ_N, q₀, F_N) be an NFA. Define DFA D = (Q_D, Σ, δ_D, {q₀}, F_D) where  
- Q_D = ℘(Q_N) (all subsets),  
- δ_D(S, a) = ⋃_{q∈S} δ_N(q, a),  
- F_D = { S ∈ Q_D | S ∩ F_N ≠ ∅ }.  

*Invariant*: after reading prefix w, D’s state S_D equals the set of states N could be in after w. Proof by induction on |w|. Hence w is accepted by N ⇔ S_D ∩ F_N ≠ ∅ ⇔ D accepts w.  

---

## Worked Examples
### Example 1: DFA for Language L = { w ∈ {a,b}\* | w ends with “abb” }
**Goal**: Build a DFA that remembers the longest suffix of the input that is a prefix of “abb”.

**Step‑by‑step construction**  
1. States correspond to how much of “abb” we have matched so far:  
   - q₀: matched 0 chars (no relevant suffix).  
   - q₁: matched “a”.  
   - q₂: matched “ab”.  
   - q₃: matched “abb” (accepting).  
2. Transition function δ:  

| Current State | Input a | Input b |
|---------------|---------|---------|
| q₀            | q₁      | q₀      |
| q₁            | q₁      | q₂      |
| q₂            | q₁      | q₃      |
| q₃            | q₁      | q₀      |

3. Start state = q₀, accepting state = {q₃}.

**Simulation on input w = “aababb”**  

| Step | Symbol | State before | Transition | State after |
|------|--------|--------------|------------|-------------|
| 0    | –      | q₀           | –          | q₀          |
| 1    | a      | q₀           | δ(q₀,a)=q₁ | q₁          |
| 2    | a      | q₁           | δ(q₁,a)=q₁ | q₁          |
| 3    | b      | q₁           | δ(q₁,b)=q₂ | q₂          |
| 4    | a      | q₂           | δ(q₂,a)=q₁ | q₁          |
| 5    | b      | q₁           | δ(q₁,b)=q₂ | q₂          |
| 6    | b      | q₂           | δ(q₂,b)=q₃ | q₃ (accept) |

Since the final state q₃ ∈ F, the string is accepted.

### Example 2: PDA for Language L = { aⁿbⁿ | n ≥ 0 } (accept by empty stack)
**PDA definition**:  
- Q = {p, q} (p = processing a’s, q = processing b’s)  
- Σ = {a, b}  
- Γ = {Z₀, X} (Z₀ = bottom‑of‑stack marker)  
- δ:  

| State | Input | Stack‑top | Action (next state, stack replacement) |
|-------|-------|-----------|----------------------------------------|
| p     | a     | Z₀        | (p, XZ₀)  // push X |
| p     | a     | X         | (p, XX)   // push another X |
| p     | b     | X         | (q, ε)    // pop X, switch to b‑mode |
| q     | b     | X         | (q, ε)    // pop X |
| q     | ε     | Z₀        | (q, Z₀)   // accept when only bottom marker remains |

Start configuration: (p, ε, Z₀). Acceptance condition: stack contains only Z₀ (or equivalently, enter state q with stack = Z₀ and input exhausted).

**Simulation on w = “aaabbb”**  

| Step | Input read | State | Stack (top→bottom) | Action taken |
|------|------------|-------|--------------------|--------------|
| 0    | –          | p     | Z₀                 | – |
| 1    | a          | p     | X Z₀               | push X |
| 2    | a          | p     | X X Z₀             | push X |
| 3    | a          | p     | X X X Z₀           | push X |
| 4    | b          | q     | X X Z₀             | pop X |
| 5    | b          | q     | X Z₀               | pop X |
| 6    | b          | q     | Z₀                 | pop X |
| 7    | ε          | q     | Z₀                 | accept (stack = Z₀) |

The PDA accepts because the stack returns to its initial content exactly when the input is consumed.

---

## Common Mistakes
### Mistake 1: Assuming Every Language Described by a Pattern Is Regular  
**What’s wrong**: Many students think that any language describable by a simple pattern (e.g., “equal numbers of a’s and b’s”) must be regular.  
**Why it’s wrong**: Regular languages can only remember a *fixed* amount of information. The language {aⁿbⁿ | n≥0} requires counting arbitrarily many a’s before seeing b’s, which needs unbounded memory. A DFA has only |Q| distinct memory states, so by the pigeonhole principle two different numbers of a’s lead to the same DFA state, causing indistinguishability of aⁱbⁱ and aʲbʲ for i≠j. Hence the language is not regular.  

### Mistake 2: Believing NFAs Are More Powerful Than DFAs  
**What’s wrong**: Claiming that NFAs can recognize languages that DFAs cannot.  
**Why it’s wrong**: The subset construction shows that for every NFA there exists an equivalent DFA (possibly exponentially larger). Both models recognize exactly the regular languages. The perceived power difference is only succinctness, not expressive capability.  

### Mistake 3: Misapplying the Pumping Lemma for Regular Languages  
**What’s wrong**: Trying to prove a language is regular by exhibiting a pumping decomposition.  
**Why it’s wrong**: The pumping lemma is a *necessary* condition for regularity, not sufficient. A language may satisfy the pumping property yet still be non‑regular (e.g., the language {wwᴿ | w∈{a,b}\*} is not regular but can be pumped incorrectly). Correct usage: assume L is regular, obtain a pumping length p, pick a string s∈L with |s|≥p that violates the lemma → contradiction → L non‑regular.  

### Mistake 4: Thinking Complement of a CFL Is Always a CFL  
**What’s wrong**: Assuming closure under complement for context‑free languages.  
**Why it’s wrong**: Counterexample: L₁ = {aⁿbⁿcᵐ | n,m≥0} and L₂ = {aᵐbⁿcⁿ | n,m≥0} are both CFLs, but L₁ ∩ L₂ = {aⁿbⁿcⁿ} ∉ CFL. Since CFLs are not closed under intersection, and complement = Σ\* \ L, closure under complement would imply closure under intersection (via De Morgan), which fails. Hence some CFLs have non‑CFL complements.  

### Mistake 5: Overlooking ε‑Transitions in NFA→DFA Conversion  
**What’s wrong**: Building the subset construction without first ε‑closing the start state or after each transition.  
**Why it’s wrong**: ε‑moves allow the NFA to be in multiple states without consuming input. Ignoring them yields a DFA that may reject strings the NFA accepts. The correct step is: after each input move, take the ε‑closure of the resulting state set.  

---

## Exercises
### Easy
1. **DFA Construction** – Over Σ={0,1}, design a DFA that accepts strings with an **even number of 0’s**. Provide the state diagram and transition table.  
2. **Regular Expression to DFA** – Convert the regular expression `(a|b)*abb` (as in Worked Example 1) to an ε‑NFA via Thompson’s construction, then to a DFA via subset construction. Show the intermediate ε‑NFA graph.

### Medium
3. **PDA for Palindromes** – Construct a PDA (accept by empty stack) for the language L = { wwᴿ | w ∈ {a,b}\* }. Explain how the stack stores the first half while reading the input, and how it is checked against the second half.  
4. **Grammar Ambiguity** – Given the grammar G:  
   ```
   E → E + E | E * E | (E) | id
   ```  
   Show two distinct parse trees for the string `id + id * id`, thereby demonstrating ambiguity. Then rewrite G into an equivalent **unambiguous** grammar suitable for operator precedence (e.g., using separate non‑terminals for term and factor).

### Hard
5. **Non‑Regularity via Pumping Lemma** – Prove that L = { aⁱ bʲ cᵏ | i = j or j = k } is **not** regular. (Hint: intersect with a regular language to isolate a known non‑regular sublanguage, or use a clever choice of s = aᵖ bᵖ cᵖ.)  
6. **Non‑Context‑Freeness via Pumping Lemma for CFLs** – Show that L = { aⁿ bⁿ cⁿ | n ≥ 0 } is **not** context‑free. Use the CFL pumping lemma: assume a pumping length p, choose s = aᵖ bᵖ cᵖ, and argue that any decomposition uvwxy satisfying |vwx| ≤ p and |vx| ≥ 1 cannot be pumped without breaking the equal‑count property.  

---

## Linux Connection
Formal language theory appears throughout the Linux user‑space and kernel toolchain.

### Text‑Processing Utilities (grep, sed, awk)
- **grep** implements regex matching via a hybrid DFA/NFA engine (GNU grep uses a Boyer‑Moore‑like fast path for fixed substrings and falls back to a DFA for complex patterns).  
  ```bash
  # Search for strings that end with "abb" in a file
  grep -E 'abb$' file.txt
  ```
- **sed** uses a line‑oriented automaton; each address pattern is compiled into a tiny DFA that drives the edit script.  
  ```bash
  # Delete lines that contain three consecutive digits
  sed '/[0-9]\{3\}/d' file.txt
  ```
- **awk**’s pattern‑action language compiles each pattern into a DFA; actions are executed when the DFA reaches an accepting state.  
  ```bash
  # Print fields where the first field matches a*b*
  awk '$1 ~ /a*b*/ {print}' file.txt
  ```

### Lexical Analysis (flex)
`flex` reads a specification of regular expressions with associated C code and generates a **lexer** (a DFA‑based scanner) in `lex.yy.c`.  
```bash
# Example lexer that counts lines and words
cat > scanner.l <<'EOF'
%option noyywrap
%%  
\n      { ++lines; }
[[:space:]]+ { /* skip */ }
[^[:space:]]+ { ++words; }
%%  
int main(void) { yylex(); printf("%d lines, %d words\\n", lines, words); }
EOF
flex scanner.l
gcc -ll lex.yy.c -o scanner
echo -e "hello world\nthis is a test" | ./scanner
# Output:
# 2 lines, 4 words
```

### Syntactic Analysis (bison / yacc)
`bison` takes a context‑free grammar and produces an LALR(1) parser (a PDA with a stack encoded in C). The generated parser uses a **shift‑reduce** mechanism that mirrors the PDA transitions described earlier.  
```bash
# Simple arithmetic expression grammar
cat > calc.y <<'EOF'
%token NUM
%left '+' '-'
%left '*' '/'
%%
expr: expr '+' expr   { $$ = $1 + $3; }
    | expr '-' expr   { $$ = $1 - $3; }
    | expr '*' expr   { $$ = $1 * $3; }
    | expr '/' expr   { $$ = $1 / $3; }
    | '(' expr ')'    { $$ = $2; }
    | NUM             { $$ = $1; }
    ;
%%
int main(void) { return yyparse(); }
int yyerror(char *s) { fprintf(stderr, "%s\\n", s); return 0; }
EOF
bison -d calc.y
gcc -o calc calc.y.tab.c -lfl
echo "2*3+4" | ./calc   # prints 10
```

### Kernel Subsystems
- **netfilter/iptables** uses a **finite state machine** for connection tracking (conntrack). Each packet flows through states like `NEW`, `ESTABLISHED`, `RELATED`. The transition table is a tiny DFA implemented in `net/netfilter/nf_conntrack_core.c`.  
  ```bash
  # Show current conntrack entries (requires root)
  sudo conntrack -L
  ```
- **eBPF verifier** models eBPF programs as a control‑flow graph and checks for absence of loops using a **reachability analysis** akin to DFS on a finite graph—another application of automata theory to guarantee safety.  
- **udev rules** employ **key‑value matching** that can be expressed as a regular expression over device attributes; the udev daemon
