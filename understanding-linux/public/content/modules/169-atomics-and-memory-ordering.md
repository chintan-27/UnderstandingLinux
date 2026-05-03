---
id: 169
title: "Atomics and memory ordering"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Every compiler and every out-of-order CPU is free to reorder memory operations as long as the result appears correct *from a single thread's perspective*. This is the fundamental problem: the CPU's correctness guarantee is scoped to one observer. The moment two threads share memory, both the compiler's reorderings (dead store elimination, hoisting loads out of loops, merging adjacent stores) and the CPU's reorderings (store buffering, speculative loads, write combining) become visible across threads. A lock-free queue that works on x86 may silently corrupt data on ARM — not because of a bug in the logic, but because x86's strong memory model was accidentally hiding a missing acquire. Atomics and memory ordering let you express the *minimum* synchronization required for correctness, no more, so you neither rely on platform-specific accidents nor pay for fences you don't need.

---

## Core Concepts

### The Memory Model Problem

Every architecture defines a *memory consistency model* — a contract specifying which reorderings are legal. x86 uses *Total Store Order* (TSO): each core sees its own stores immediately, and stores from any given core become visible to other cores in program order. Critically, TSO does *not* guarantee that a load sees the latest store from another core immediately — it only guarantees that stores from one core appear to other cores in the order they were issued. ARM and POWER use much weaker models where loads can be reordered past loads, stores past stores, and loads past stores in either direction. The C11/C++11 abstract machine adds a third layer on top of hardware: the compiler treats unsynchronized accesses to shared memory as if no other thread exists, which licenses it to eliminate, duplicate, or reorder those accesses arbitrarily.

The practical consequence: without explicit synchronization, you have no cross-thread visibility guarantee from either the compiler or the hardware.

### Happens-Before

*Happens-before* ($\xrightarrow{hb}$) is the partial order that defines when one operation's memory effects are guaranteed visible to another. It is not wall-clock time. It is established only by synchronization actions. The definition is precise:

- **Single-thread order**: within one thread, every operation happens-before every later operation in program order (sequenced-before).
- **Synchronization edge**: a release store on thread A that is *read by* an acquire load on thread B creates a synchronization edge, making everything sequenced-before the release in A happen-before everything sequenced-after the acquire in B.
- **Transitivity**: if $A \xrightarrow{hb} B$ and $B \xrightarrow{hb} C$, then $A \xrightarrow{hb} C$.

If two operations on the same memory location lack a happens-before relationship and at least one is a write, the result is a *data race*, and the C standard declares the program's behavior undefined — not merely unspecified.

### Acquire and Release

Acquire and release are asymmetric half-barriers:

- A **release** operation prevents all prior memory operations (loads and stores) from being reordered *after* it. It "publishes" all preceding writes to any thread that subsequently acquires.
- An **acquire** operation prevents all subsequent memory operations from being reordered *before* it. It "drains" the load so that all writes preceding the matching release become visible before any dependent code runs.

The asymmetry is deliberate and cheap: a release costs a store-side barrier; an acquire costs a load-side barrier. Together they are sufficient for producer-consumer synchronization. You only pay for a full bidirectional fence when the *same operation* must act as both acquire and release (`acq_rel`) or when global ordering across all threads is required (`seq_cst`).

### Fences

A fence is an ordering constraint decoupled from any particular memory location. A `memory_order_release` fence prevents all preceding stores from being reordered past *any* subsequent atomic store, even a relaxed one. A `memory_order_acquire` fence prevents all subsequent loads from being reordered before *any* preceding atomic load, even a relaxed one.

Fences are heavier than per-operation acquire/release because they affect *all* surrounding memory operations rather than just the single atomic they are attached to. They are also the correct tool when you need to order a batch of non-atomic writes before publishing a pointer.

A release fence + relaxed store is equivalent in ordering strength to a release store. The fence does the ordering; the atomic provides the communication vehicle that the other thread reads.

### Sequential Consistency

`seq_cst` imposes a single global total order over all `seq_cst` operations across all threads — every thread observes all `seq_cst` operations in the same order. This is the intuitive "everything happens in some interleaving" model. It requires a full memory fence on store on most architectures. The cost is real: on a store-heavy workload on ARM, replacing `seq_cst` stores with `release` stores is measurably faster because `stlr` (store-release) replaces `stlr` + `dmb ish`.

---

## How It Works

### The Producer-Consumer Pattern

One thread writes data, then sets a flag. Another polls the flag, then reads the data.

```c
// Broken: no synchronization
int data = 0;
int ready = 0;

// Thread A
data = 42;
ready = 1;   // compiler may hoist this above the store to data,
             // or CPU may allow this store to reach other cores first

// Thread B
while (!ready) {}
printf("%d\n", data);  // may observe ready==1 and data==0 simultaneously
```

The compiler is allowed to reorder `data = 42` and `ready = 1` because from a single-thread view they touch independent memory. The CPU's store buffer may drain in a different order. Thread B can spin, see `ready == 1`, and then load `data` before the store to `data` has propagated to its cache.

The fix:

```c
#include <stdatomic.h>

int data = 0;
atomic_int ready = 0;

// Thread A (producer)
data = 42;
atomic_store_explicit(&ready, 1, memory_order_release);
// Release: the store to `data` cannot be reordered past this point.
// All cores that acquire from `ready` will see data == 42.

// Thread B (consumer)
while (!atomic_load_explicit(&ready, memory_order_acquire)) {}
// Acquire: no load after this point can be reordered before it.
// After observing ready == 1, this thread is guaranteed to see data == 42.
printf("%d\n", data);
```

The synchronization chain:

$$\text{store}(data = 42) \xrightarrow{\text{seq-before}} \underbrace{\text{release}(ready \leftarrow 1)}_{\text{Thread A}} \xrightarrow{\text{sync}} \underbrace{\text{acquire}(ready = 1)}_{\text{Thread B}} \xrightarrow{\text{seq-before}} \text{load}(data)$$

The $\xrightarrow{\text{sync}}$ edge exists because the acquire load *reads the value written by* the release store. If Thread B spins and observes `ready == 0`, no sync edge forms yet — the guarantee only kicks in when the acquiring load reads the released value.

### What `relaxed` Actually Means

`memory_order_relaxed` guarantees only *atomicity*: the operation completes without tearing (no partial word reads/writes), but the compiler and CPU may reorder it arbitrarily relative to all other memory operations. Appropriate use: a counter where you care only about the final count, not about which other operations are visible at each increment.

```c
atomic_uint64_t dropped_packets = 0;

void on_drop(void) {
    // Only the count matters. We don't need this increment ordered
    // relative to any other reads or writes.
    atomic_fetch_add_explicit(&dropped_packets, 1, memory_order_relaxed);
}
```

A common mistake is using `relaxed` on a flag and then assuming that reads of other variables are safe. They are not — `relaxed` provides no ordering relative to `data`.

### Fences as Explicit Barriers

When you need to order a batch of non-atomic stores before publishing a pointer, a standalone release fence is cleaner than adding `memory_order_release` to each individual write (which would be wrong anyway — non-atomic writes cannot carry ordering):

```c
#include <stdatomic.h>

struct message { int a, b, c; };

struct message msg;
atomic_int msg_ready = 0;

// Thread A
msg.a = 1;
msg.b = 2;
msg.c = 3;
atomic_thread_fence(memory_order_release);
// All three stores above are now ordered before the following relaxed store.
atomic_store_explicit(&msg_ready, 1, memory_order_relaxed);

// Thread B
while (!atomic_load_explicit(&msg_ready, memory_order_relaxed)) {}
atomic_thread_fence(memory_order_acquire);
// All subsequent loads now see the stores above the release fence.
printf("%d %d %d\n", msg.a, msg.b, msg.c);
```

The fence-based approach requires that the fence on Thread B is paired with *any* atomic load that reads the value written by Thread A, not just the fence on Thread A. The acquire fence must appear *after* the relaxed load that observes `msg_ready == 1`.

### What the CPU Actually Emits

On x86, TSO makes release stores and acquire loads compile to plain `MOV` instructions — no fence instruction, because the hardware already provides the required ordering for free. Only `seq_cst` stores require an additional barrier:

```asm
; x86-64: release store — just a MOV
mov  DWORD PTR [rdi], 1

; x86-64: seq_cst store — MOV + MFENCE, or XCHG (which is implicitly locked)
mov  DWORD PTR [rdi], 1
mfence
```

On ARM64, the compiler emits architectural acquire/release instructions:

```asm
// ARM64: release store
stlr  w0, [x1]      // Store-Release: no later store/load reordered before drain

// ARM64: acquire load
ldar  w0, [x1]      // Load-Acquire: no earlier
