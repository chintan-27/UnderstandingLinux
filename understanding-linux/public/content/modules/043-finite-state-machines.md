---
id: 43
title: "Finite-state machines"
supermoduleId: 4
estimatedMinutes: 45
resources:
  - type: book
    title: "Digital Design and Computer Architecture (Harris)"
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
---

## Core Concepts
A finite‑state machine (FSM) is a 5‑tuple for a Moore machine  
\((S, \Sigma, \delta, \lambda, s_0)\) and a 6‑tuple for a Mealy machine  
\((S, \Sigma, \Gamma, \delta, \lambda, s_0)\) where  

- \(S\) = finite set of abstract states  
- \(\Sigma\) = input alphabet  
- \(\Gamma\) = output alphabet (Mealy only)  
- \(\delta : S \times \Sigma \rightarrow S\) = next‑state function  
- \(\lambda : S \rightarrow \Gamma\) (Moore) or \(\lambda : S \times \Sigma \rightarrow \Gamma\) (Mealy) = output function  
- \(s_0 \in S\) = reset state  

The purpose of an FSM is to capture **sequential** behavior: the response at time \(t\) depends on the entire history of inputs, but that history can be summarized by the current state.  

### State Encoding
In hardware the abstract set \(S\) must be mapped to a binary vector stored in flip‑flops. Let \(|S| = N\).  

- **Binary encoding** uses \(\lceil \log_2 N \rceil\) bits.  
  Example: \(N=5 \rightarrow 3\) bits (000‑100).  
  Minimum number of flip‑flops, but a state change may flip many bits simultaneously (Hamming distance >1), which can generate glitches in the combinational next‑state logic.  

- **One‑hot encoding** uses \(N\) bits, exactly one bit high per state.  
  Flip‑flop count = \(N\).  
  Advantage: any transition changes at most two bits (the old state bit goes low, the new state bit goes high), eliminating internal hazards. Disadvantage: linear growth in flip‑flops and higher static power.  

- **Gray encoding** also uses \(\lceil \log_2 N \rceil\) bits but guarantees that consecutive states differ by exactly one bit (Hamming distance = 1).  
  This eliminates glitches caused by simultaneous bit changes while keeping the flip‑flop count low.  

The choice of encoding is a trade‑off among **area (flip‑flop count)**, **power (switching activity)**, and **timing safety (hazard‑free transitions)**.  

### Moore vs. Mealy
- In a Moore machine the output depends **only** on the present state: \(\lambda(s)\). The output changes **after** the state register updates, i.e., one clock cycle later than the input that caused the transition. This makes output glitch‑free but can increase latency.  
- In a Mealy machine the output depends on both state and input: \(\lambda(s, x)\). The output can change **combinatorially** with the input, potentially in the same clock cycle as the state change. This can reduce the number of states needed (e.g., a sequence detector) but introduces the risk of output glitches if the input changes while the state register is still settling.  

A classic illustration is a **non‑overlapping “110” detector**:  
- Moore needs 4 states (S0‑S3).  
- Mealy needs only 3 states (S0‑S2) because the output can be asserted as soon as the third ‘1’ is sampled.  

## How It Works
### Synchronous Operation
A practical FSM is clocked. On each rising edge of the clock \(clk\):  

1. The **state register** (a bank of flip‑flops) captures the next state computed by the combinational **next‑state logic** \(F_{next}(s, x)\).  
2. The **output logic** \(F_{out}(s)\) (Moore) or \(F_{out}(s, x)\) (Mealy) drives the external outputs.  

Timing constraints:  

- **Propagation delay** of the state register: \(t_{clk\to q}\)  
- **Combinational delay** of next‑state logic: \(t_{comb}\)  
- **Setup time** of the flip‑flop: \(t_{setup}\)  

The maximum clock frequency is therefore  

\[
f_{max} = \frac{1}{t_{clk\to q} + t_{comb} + t_{setup}} .
\]

If the clock period violates this bound, the flip‑flop may capture an incorrect next state, leading to a **state‑transition error**.  

### Deriving Next‑State Logic (Example: D Flip‑Flop)
For a D‑FF the excitation table is trivial: \(D = Q_{next}\).  
Given a state transition table, we write the Boolean function for each flip‑flop input as a function of the present state bits and inputs, then minimise (e.g., with Karnaugh maps).  

Consider a 2‑bit binary counter (states 00, 01, 10, 11) with next‑state logic:  

\[
\begin{aligned}
D_1 &= \overline{Q_1}\,Q_0 \quad &\text{(LSB toggles every cycle)}\\
D_0 &= Q_1 \oplus Q_0 \quad &\text{(MSB toggles when LSB = 1)} .
\end{aligned}
\]

These equations are realised with two‑input XOR and AND gates, yielding a hazard‑free implementation because each \(D_i\) changes at most one bit per transition (Gray‑encoded counter would be even safer).  

### From Abstract to C Model
In software we often model an FSM with a `switch` on the current state and a function that returns the next state:

```c
typedef enum { S0, S1, S2, S3 } state_t;

state_t next_state(state_t s, int x) {
    switch (s) {
        case S0: return x ? S1 : S0;
        case S1: return x ? S2 : S0;
        case S2: return x ? S3 : S1;
        case S3: return x ? S0 : S2;
    }
}
```

The function embodies the combinational next‑state logic; the caller (typically a timer or interrupt handler) plays the role of the clock.  

## Worked Examples
### Example 1 – 3‑Bit Binary Counter (Moore)
**Goal:** Count from 0 to 7 repeatedly, output the current count on three LEDs.  

1. **State set**: \(S = \{0,1,2,3,4,5,6,7\}\).  
2. **Encoding**: binary, 3 bits \((q_2 q_1 q_0)\).  
3. **Transition**: \(\delta(s, x) = (s + 1) \bmod 8\) (input `x` is always 1; we omit it for clarity).  
4. **Output**: \(\lambda(s) = s\) (the LEDs directly show the state).  

**Next‑state equations** (derived by observing that each bit toggles when all less‑significant bits are 1):

\[
\begin{aligned}
D_0 &= \overline{q_0} \\
D_1 &= q_0 \oplus q_1 \\
D_2 &= (q_0 \land q_1) \oplus q_2 .
\end{aligned}
\]

**C simulation (cycle‑accurate):**

```c
#include <stdio.h>
typedef unsigned char state_t;   /* 3‑bit */

state_t next(state_t s) {
    return (s + 1) & 0x07;
}

int main(void) {
    state_t s = 0;
    for (int i = 0; i < 16; ++i) {
        printf("state = %d (0b%03b)\n", s, s);
        s = next(s);
    }
    return 0;
}
```

*Timing analysis*: Assuming a 74HC series flip‑flop with \(t_{clk\to q}=6\) ns, \(t_{comb}=4\) ns (worst‑case carry chain), \(t_{setup}=3\) ns → \(f_{max}=1/(6+4+3)=76.9\) MHz.  

### Example 2 – “101” Pattern Detector (Mealy)
**Goal:** Assert `z=1` whenever the last three input bits are `101`, overlapping allowed.  

1. **State diagram** (minimal Mealy):  
   - S0: reset / no relevant suffix  
   - S1: last bit was `1`  
   - S2: last two bits were `10`  

2. **State transition table**  

| Present State | Input `x` | Next State | Output `z` |
|---------------|-----------|------------|------------|
| S0            | 0         | S0         | 0          |
| S0            | 1         | S1         | 0          |
| S1            | 0         | S2         | 0          |
| S1            | 1         | S1         | 0          |
| S2            | 0         | S0         | 0          |
| S2            | 1         | S1         | 1          |  

3. **Encoding** (binary, 2 bits): S0=00, S1=01, S2=10.  

4. **Next‑state logic** (using D‑FF excitation):  

\[
\begin{aligned}
D_1 &= \overline{q_1}\,q_0\,x \;+\; q_1\,\overline{q_0}\,\overline{x} \\
D_0 &= \overline{q_1}\,x \;+\; q_1\,\overline{q_0}\,x .
\end{aligned}
\]

5. **Output logic** (Mealy):  

\[
z = q_1 \,\overline{q_0}\, x .
\]

**C implementation (cycle‑based):**

```c
typedef enum { S0, S1, S2 } state_t;

typedef struct {
    state_t state;
    int     out;
} fsm_t;

void tick(fsm_t *m, int x) {
    switch (m->state) {
        case S0:
            m->state = x ? S1 : S0;
            m->out   = 0;
            break;
        case S1:
            m->state = x ? S1 : S2;
            m->out   = 0;
            break;
        case S2:
            m->state = x ? S1 : S0;
            m->out   = x ? 1 : 0;
            break;
    }
}

/* demo */
int main(void) {
    fsm_t m = { .state = S0, .out = 0 };
    int seq[] = {1,0,1,1,0,1,0,1};
    for (size_t i=0; i<sizeof seq/sizeof *seq; ++i) {
        tick(&m, seq[i]);
        printf("in=%d out=%d state=%d\n", seq[i], m.out, m.state);
    }
    return 0;
}
```

*Why Mealy wins*: Only three states are needed versus four for a Moore equivalent, reducing flip‑flop count from 2 to 2 (same here) but the combinational output saves one cycle of latency.  

## Common Mistakes
| # | Mistake | Why It’s Wrong | How to Avoid / Fix |
|---|---------|----------------|--------------------|
| 1 | **Binary encoding for a controller where state changes often flip >1 bit** (e.g., traffic light with states Red→Yellow→Green). | Simultaneous bit changes create a transient intermediate state that can be latched by combinational logic, causing a **glitch** that may trigger an incorrect next state (hazard). | Use Gray or one‑hot encoding for control‑dominated FSMs, or add explicit hazard‑covering terms in the next‑state equations. |
| 2 | **Missing reset or power‑on initialization**. | Flip‑flops power up to an unknown state; the FSM may start in an illegal state, leading to undefined behavior or lock‑up. | Assert an asynchronous reset on power‑up; in C, initialise `state = RESET_STATE;` before the main loop. |
| 3 | **Incomplete `case` statement (implied latch)**. In HDL, omitting an `else` or a `default` creates a latch; in C, omitting an `else` leaves `state` unchanged for some input combos, which may be unintentional. | Latches introduce memory that is not clocked, causing race conditions and unpredictable timing. | Always cover all possible state‑input pairs; use `default: /* handle error */` or `assert(0);` to catch illegal combos during simulation. |
| 4 | **Confusing Moore and Mealy semantics** (e.g., assigning output inside the transition block). | The output will change **mid‑cycle** depending on when the input is sampled, breaking the model’s timing assumptions and causing output glitches. | Keep output logic strictly separate: compute `next_state` first, then compute `output` from (next_state, input) for Mealy or (next_state) for Moore. |
| 5 | **Ignoring clock skew in multi‑bit state registers**. If the clock arrives at different flip‑flops at different times, a transition that should change two bits may be seen as a intermediate state, causing a **state‑encoding violation**. | Leads to false transitions, especially in high‑speed designs. | Use a common clock tree, minimize skew, or adopt Gray encoding where only one bit changes per transition, making the design skew‑tolerant. |

## Exercises
### Easy  
1. **Design a 2‑bit Gray‑code counter** (states: 00, 01, 11, 10).  
   - Draw the state diagram.  
   - Derive the next‑state equations for D‑FFs.  
   - Write a C function `state_t gray_next(state_t s)` that simulates one clock tick.  

### Medium  
2. **Implement a Mealy FSM that detects the overlapping pattern “1101”.**  
   - Produce the minimal state diagram and state table.  
   - Encode states with the fewest flip‑flops (hint: 3 states → 2 bits).  
   - Derive the Boolean expressions for the next‑state and output logic.  
   - Provide a Verilog‑style always block (or C) that updates the FSM each clock cycle.  

### Hard  
3. **Experiment with the Linux TCP state machine.**  
   - Compile a simple kernel module that registers a tracepoint for `tcp_state_change` and prints the old and new states.  
   - Use `ss -tan` to list all TCP connections and decode the state hex values from `/proc/net/tcp`.  
   - Add a new artificial state `TCP_DEBUG` (value `0x0D`) to `include/net/tcp.h`, modify `tcp_set_state()` in `net/ipv4/tcp.c` to allow the transition, and rebuild the kernel.  
   - Verify that a connection can be forced into `TCP_DEBUG` via `setsockopt(TCP_DEBUG)` and observe the trace.  

## Linux Connection
Finite‑state machines are woven throughout the Linux kernel. The most studied example is the **TCP protocol state machine** defined in `net/ipv4/tcp.c`.  

### Core Data Structures
```c
/* include/net/tcp.h */
enum tcp_state {
    TCP_CLOSE          = 0x00,
    TCP_LISTEN         = 0x01,
    TCP_SYN_SENT       = 0x02,
    TCP_SYN_RECV       = 0x03,
    TCP_ESTABLISHED    = 0x04,
    TCP_FIN_WAIT1      = 0x05,
    TCP_FIN_WAIT2      = 0x06,
    TCP_CLOSE_WAIT     = 0x07,
    TCP_LAST_ACK       = 0x08,
    TCP_CLOSING        = 0x09,
    TCP_TIME_WAIT      = 0x0A,
    TCP_NEW_SYN_RECV   = 0x0B   /* Linux‑specific */
};
```

The state of a socket is stored in `struct sock->sk_state`.  

### State Transition Core
```c
/* net/ipv4/tcp.c */
void tcp_set_state(struct sock *sk, int state)
{
    int old = sk->sk_state;

    /* Guard against illegal transitions – a typical FSM safety check */
    if (!tcp_valid_state_transition(old, state))
        pr_err("TCP: illegal state transition %d->%d\n", old, state);

    sk->sk_state = state;
    /* Notify listeners (e.g., ss, netlink) */
    tcp_fire_event(sk, TCP_EVENT_STATE_CHANGE);
}
```

The function `tcp_valid_state_transition()` contains a **transition table** (a 2‑D array of booleans) that encodes the δ function of the FSM.  

### Observing States from Userspace
```bash
# Show all TCP connections with their state names
ss -tan | awk '
    { 
        state=$NF; 
        sub("ESTAB", "0x04", state); sub("SYN-SENT","0x02",state);
        sub("SYN-RECV","0x03",state); sub("FIN-WAIT-1","0x05",state);
        sub("FIN-WAIT-2","0x06",state); sub("CLOSE-WAIT","0x07",state);
        sub("LAST-ACK","0x08",state); sub("CLOSING","0x09",state);
        sub("TIME-WAIT","0x0A",state); sub("LISTEN","0x01",state);
        printf "%-22s %s\n", $1, state;
    }'
```

The `/proc/net/tcp` file gives a raw hex view:  

```bash
# Decode the state field (the 5th column, little‑endian hex)
cat /proc/net/tcp | while read -r line; do
    [[ $line =~ ^[[:space:]]*[0-9]+: ]] || continue
    state=$(echo $line | awk '{print $5}')
    printf "%s -> %s\n" "$line" "$(printf '%02x' "$((16#$state))")"
done
```

Mapping (little‑endian) :  
`01` → `TCP_LISTEN`, `02` → `TCP_SYN_SENT`, `03` → `TCP_SYN_RECV`, `04` → `TCP_ESTABLISHED`, `05` → `TCP_FIN_WAIT1`, … `0A` → `TCP_TIME_WAIT`.  

### Adding a Probe
A trivial kernel module that logs every state change:

```c
/* tcp_state_logger.c */
#include <linux/module.h>
#include <linux/tcp.h>
#include <trace/events/tcp.h>

static void logger_tcp_state_change(void *ignore, struct sock *sk,
                                    int oldstate, int newstate)
{
    pr_info("TCP state change: %s(%d) -> %s(%d)\n",
            tcp_state_string[oldstate], oldstate,
            tcp_state_string[newstate], newstate);
}
static int __init init(void)
{
    register_trace_tcp_state_change(logger_tcp_state_change, NULL);
    return 0;
}
static void __exit exit(void)
{
    unregister_trace_tcp_state_change(logger_tcp_state_change);
}
module_init(init);
module_exit(exit);
MODULE_LICENSE("GPL");
```

Compile with the kernel’s build system and insert:

```bash
make -C /lib/modules/$(uname -r)/build M=$PWD modules
sudo insmod tcp_state_logger.ko
dmesg -w   # watch state changes in real time
```

### Other Kernel FSMs
- **VFS file‑descriptor lifecycle**: `struct file` transitions among `FMODE_READ`, `FMODE_WRITE`, `FMODE_EXEC` via `open/close/dup`.  
- **Block I/O scheduler**: `cfq_queue` uses an FSM to track `idle`, `waiting`, `busy` states.  
- **Network device driver**: `net_device` follows `NETREG_REGISTERED`, `NETREG_UNREGISTERING`, `NETREG_UNREGISTERED`.  

All of these are implemented with `enum` + `switch` or function pointers, exactly as described in the FSM theory.  

## Why This Matters
Finite‑state machines provide a **rigorous, compositional model** for any system whose
