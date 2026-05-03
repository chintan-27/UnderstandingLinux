---
id: 117
title: "Kernel tracing and observability"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

When a system misbehaves — a process stalls, latency spikes, a driver corrupts state — you cannot freeze the kernel and inspect it. The kernel is live, preemptive, and mediating every other operation on the machine. `/proc` counters tell you aggregates; they cannot tell you that the scheduler ran task A before task B, that an interrupt preempted a spinlock holder, or that a specific function was called 40,000 times in one second. The tracing infrastructure (ftrace, tracepoints, perf, eBPF) exists precisely because post-hoc statistics are insufficient for understanding causal sequences. Each tool occupies a different point in the tradeoff space between generality, overhead, and programmability.

---

## Core Concepts

### ftrace: Dynamic NOP Patching for Zero Idle Overhead

ftrace exploits the fact that the kernel is compiled with `-pg` (or `-mfentry` on x86-64), which inserts a `callq __fentry__` at the start of every function. At boot, the kernel iterates the `__mcount_loc` section — a table of every such call site — and overwrites each one with NOPs using `text_poke_early()`. The overhead when ftrace is idle is therefore exactly the cost of executing those NOPs: on x86-64, a 5-byte NOP executes in one cycle with no branch prediction involvement.

When you enable a tracer, `ftrace_update_ftrace_func()` calls `text_poke_bp()` to atomically replace NOPs with `callq` to the tracer dispatcher. The `_bp` variant uses a breakpoint-based protocol (INT3 → update → resume) to keep SMP systems consistent without stopping all CPUs for the full duration of the patch.

Tracing state lives under `tracefs`, mounted at `/sys/kernel/debug/tracing`. This is a virtual filesystem — reads and writes to its files are syscalls into kernel tracing code, not disk I/O.

### Tracepoints: Instrumentation as a Versioned API

Tracepoints are developer-placed hook sites in kernel source, defined with `TRACE_EVENT()` macros in headers under `include/trace/events/`. The critical design decision is that they are *stable*: their names and argument types are maintained across kernel versions, forming a contract between the kernel and tracing consumers. This is why `perf`, `ftrace`, and eBPF can all attach to `sched:sched_switch` — the name and signature are guaranteed.

The fast-path cost is a single conditional branch over a null pointer check. When no probe is attached, the branch is never taken, and modern branch predictors learn this immediately, making the overhead sub-nanosecond per call site.

### perf Events: A Unified FD Interface to Hardware Counters

The `perf_event` subsystem (`kernel/events/core.c`) abstracts two fundamentally different things through one interface: hardware PMU registers (which count CPU-internal events like cache misses and retired instructions at zero software overhead) and software events (context switches, page faults, tracepoints). The unifying primitive is `perf_event_open()`, which returns a file descriptor. The FD model is not cosmetic — it means event groups, inheritance across fork, and ring buffer access via `mmap()` all fall out of existing Unix machinery.

Hardware PMU counters are scarce. A typical x86 core has 4–8 general-purpose programmable counters. When you request more events than available counters, the kernel multiplexes them across time slices. The scaling correction is:

$$\hat{c} = c_{\text{obs}} \times \frac{T_{\text{enabled}}}{T_{\text{running}}}$$

where $c_{\text{obs}}$ is the raw count, $T_{\text{enabled}}$ is the wall time the event was enabled, and $T_{\text{running}}$ is the time a physical counter was actually assigned to it. The ratio $T_{\text{running}} / T_{\text{enabled}}$ is always $\leq 1$; the further it is from 1, the less trustworthy the estimate.

### eBPF: Verified, JIT-Compiled Kernel Programs

eBPF is a register-based virtual machine with 11 64-bit registers (R0–R10), a fixed 512-byte stack, and a restricted ISA. You write programs in a C subset, compile with `clang -target bpf`, and load with the `bpf()` syscall. Before execution, the in-kernel verifier performs:

1. **DAG check**: the CFG must be a DAG — no back edges, so no unbounded loops (bounded loops are permitted since 5.3 with bounded loop support verified by unrolling/iteration count proof).
2. **Type tracking**: every register has a tracked type (scalar, pointer-to-map, pointer-to-stack, etc.). Dereferencing a scalar is rejected.
3. **Bounds checking**: every memory access must be provably within bounds at verification time.

If verification passes, the JIT compiler (`arch/x86/net/bpf_jit_comp.c` on x86) emits native code. The verifier's conservatism is intentional: it rejects some safe programs to keep the verifier itself simple and auditable.

eBPF programs communicate with userspace via **maps** — kernel-resident typed data structures (hash tables, arrays, ring buffers, per-CPU arrays) accessed from both sides. Per-CPU map variants avoid cache-line contention by giving each CPU its own value slot, which matters when every packet or syscall increments a counter.

---

## How It Works

### ftrace Ring Buffer: Lockless Per-CPU Design

The ftrace ring buffer (`kernel/trace/ring_buffer.c`) uses one buffer per CPU. Writers never touch another CPU's buffer, eliminating inter-CPU synchronization entirely. Within a single CPU's buffer, writers claim slots using a local atomic `cmpxchg` on the write pointer. If an interrupt fires mid-write and the interrupt handler also writes a trace record, it claims a slot after the interrupted writer's reservation and commits independently — the ring buffer handles nested writers at different interrupt levels.

The buffer is a power-of-two allocation. The write pointer wraps via bitmask:

$$\text{slot} = \text{write\_ptr} \mathbin{\&} (\text{buf\_size} - 1)$$

When the buffer fills, old events are overwritten. This is a deliberate policy: tracing must never apply backpressure to kernel execution. A tracing consumer that is too slow loses data, not performance.

### Tracepoint Expansion

In `include/trace/events/sched.h`:

```c
TRACE_EVENT(sched_switch,
    TP_PROTO(bool preempt,
             struct task_struct *prev,
             struct task_struct *next),
    TP_ARGS(preempt, prev, next),
    TP_STRUCT__entry(
        __array(char, prev_comm, TASK_COMM_LEN)
        __field(pid_t, prev_pid)
        __field(int,   prev_prio)
        __field(long,  prev_state)
        __array(char, next_comm, TASK_COMM_LEN)
        __field(pid_t, next_pid)
        __field(int,   next_prio)
    ),
    TP_fast_assign(
        memcpy(__entry->prev_comm, prev->comm, TASK_COMM_LEN);
        __entry->prev_pid   = prev->pid;
        __entry->prev_prio  = prev->prio;
        __entry->prev_state = prev->__state;
        memcpy(__entry->next_comm, next->comm, TASK_COMM_LEN);
        __entry->next_pid   = next->pid;
        __entry->next_prio  = next->prio;
    ),
    TP_printk("prev_comm=%s prev_pid=%d ... next_comm=%s next_pid=%d",
              __entry->prev_comm, __entry->prev_pid,
              __entry->next_comm, __entry->next_pid)
);
```

At the call site in `kernel/sched/core.c`:

```c
trace_sched_switch(preempt, prev, next);
```

The macro expands to approximately:

```c
if (unlikely(atomic_read(&__tracepoint_sched_switch.key.enabled) > 0)) {
    /* copy fields into ring buffer slot, call registered probes */
}
```

The `unlikely()` hint tells the compiler to lay out the hot path (no probe attached) as straight-line code. The enabled counter is zero by default; the branch is never mispredicted after the first few executions.

### perf_event_open: Counting and Sampling

**Counting mode** — accumulate a single 64-bit value:

```c
#include <linux/perf_event.h>
#include <sys/syscall.h>
#include <sys/ioctl.h>
#include <unistd.h>
#include <stdint.h>

struct perf_event_attr pe = {
    .type           = PERF_TYPE_HARDWARE,
    .config         = PERF_COUNT_HW_CACHE_MISSES,
    .size           = sizeof(pe),
    .disabled       = 1,
    .exclude_kernel = 0,
    .exclude_hv     = 1,
    .read_format    = PERF_FORMAT_TOTAL_TIME_ENABLED
                    | PERF_FORMAT_TOTAL_TIME_RUNNING,
};

int fd = syscall(SYS_perf_event_open, &pe,
                 0,   /* pid: current process */
                 -1,  /* cpu: any */
                 -1,  /* group_fd: no group */
                 0);  /* flags */

ioctl(fd, PERF_EVENT_IOC_RESET,  0);
ioctl(fd, PERF_EVENT_IOC_ENABLE, 0);

/* ... workload ... */

ioctl(fd, PERF_EVENT_IOC_DISABLE, 0);

struct {
    uint64_t value;
    uint64_t time_enabled;
    uint64_t time_running;
}
