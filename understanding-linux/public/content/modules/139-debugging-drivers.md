---
id: 139
title: "Debugging drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

A driver runs in kernel space — no process boundary, no segfault on a bad pointer, no debugger you can simply attach. A bad pointer dereference corrupts kernel memory silently; the crash that follows may happen in unrelated code 10 milliseconds later with no visible connection to the cause. The tools here exist because three normal debugging assumptions all fail at once: isolated address space, controlled execution, and attachable debugger. Every technique in this module is a direct response to one of those failures.

---

## Core Concepts

### `printk` and `dmesg`: Logging From Any Context

`printk` writes to a fixed-size circular ring buffer in kernel memory. `dmesg` reads that buffer via `/dev/kmsg` (preferred since 3.5) or the `syslog(2)` syscall. The reason `printk` exists instead of `printf` is context: `printk` is safe from interrupt handlers, NMI context, early boot before memory allocation is available, and atomic sections where sleeping is forbidden. It acquires a raw spinlock, writes directly, and returns — no heap allocation, no scheduling.

Each message carries a log level encoded as a numeric prefix in the string:

| Macro | Level | Use |
|---|---|---|
| `KERN_EMERG` | 0 | Hardware failure, imminent panic |
| `KERN_ALERT` | 1 | Must act immediately |
| `KERN_CRIT` | 2 | Critical condition |
| `KERN_ERR` | 3 | Error — something failed |
| `KERN_WARNING` | 4 | Unexpected but recoverable |
| `KERN_NOTICE` | 5 | Normal but significant |
| `KERN_INFO` | 6 | Operational messages |
| `KERN_DEBUG` | 7 | Developer detail |

The kernel compares a message's level against the **console log level** (default 4). Messages with level numerically less than that threshold — i.e., level $< 4$, meaning EMERG through WARNING — are echoed to the console in real time. Level 7 (`KERN_DEBUG`) messages go to the ring buffer only, which is why `pr_debug()` output is invisible until you read `dmesg` or raise the threshold:

```bash
# Raise console log level to show KERN_DEBUG on the console
echo 8 > /proc/sys/kernel/printk

# Read the ring buffer with human-readable timestamps
dmesg -T

# Follow new messages in real time (like tail -f)
dmesg -w

# Filter to your driver module
dmesg -T | grep mydriver
```

The preferred modern wrappers are `pr_info()`, `pr_warn()`, `pr_err()`, and `pr_debug()` (not raw `printk`). For device drivers specifically, use `dev_info(dev, ...)` and `dev_err(dev, ...)` — these prepend the device name and bus address automatically, which matters when you have 16 instances of the same hardware.

### Dynamic Debug: Per-Callsite Enable/Disable at Runtime

Static `pr_debug()` calls compiled unconditionally waste memory even when silent: the format strings live in `.rodata`, and every call site evaluates its arguments before the level check discards them. This matters in hot paths.

`CONFIG_DYNAMIC_DEBUG` solves this by transforming each `pr_debug()` and `dev_dbg()` call site into a reference to a small descriptor struct placed in a dedicated ELF section (`__verbose`). The descriptor holds the filename, function name, line number, module name, and a one-byte flags field. At build time, all descriptors are disabled. The call site compiles to:

```c
/* Simplified expansion of pr_debug() under CONFIG_DYNAMIC_DEBUG */
do {
    static struct _ddebug __aligned(8)
        __attribute__((section("__verbose"))) _dd = {
        .modname  = KBUILD_MODNAME,
        .function = __func__,
        .filename = __FILE__,
        .lineno   = __LINE__,
        .flags    = 0,
    };
    if (unlikely(_dd.flags & _DPRINTK_FLAGS_PRINT))
        __dynamic_pr_debug(&_dd, pr_fmt(fmt), ##__VA_ARGS__);
} while (0)
```

The `unlikely()` annotation marks the branch as cold. A disabled call site costs one predicted-not-taken branch plus one 8-byte load from the descriptor — on modern hardware, effectively zero overhead in a non-hot loop. The per-callsite granularity is the point: you can enable exactly the 3 lines in a 50,000-line driver you care about.

Control happens through a debugfs file. The control interface accepts match specifiers (`module`, `file`, `func`, `line`) combined with flag operations (`+p` to enable print, `-p` to disable):

```bash
# Enable all debug output in a module
echo "module e1000 +p" > /sys/kernel/debug/dynamic_debug/control

# Enable a specific line range in one file
echo "file drivers/net/ethernet/intel/e1000/e1000_main.c line 1200-1300 +p" \
  > /sys/kernel/debug/dynamic_debug/control

# Enable with augmented format: function name (f), line (l), module (m), thread (t)
echo "module mydriver +pflmt" > /sys/kernel/debug/dynamic_debug/control

# Show currently enabled call sites
grep '=p' /sys/kernel/debug/dynamic_debug/control

# Enable at boot time (before debugfs is mounted) via kernel command line
# dyndbg="module mydriver +p"
```

You can also pass `dyndbg` as a module parameter on `modprobe`:

```bash
modprobe mydriver dyndbg=+p
```

### Tracepoints: Structured Probe Points With Stable ABI

A tracepoint is a named, static hook compiled into kernel source at a semantically meaningful location — a scheduler wakeup, a block I/O submission, a driver read completion. When no tracer is attached, the tracepoint costs a single non-taken branch checked against a per-tracepoint atomic flag: effectively free. When a tracer registers a callback, the tracepoint invokes it with typed, structured arguments — not a format string.

The critical property distinguishing tracepoints from `printk` is **ABI stability**. Tracepoint names and argument signatures are treated as stable kernel interfaces. Tools like `perf`, `ftrace`, `LTTng`, and BPF programs written against a tracepoint continue to work across kernel versions. A `pr_debug()` string is not an interface — it can change any time. A tracepoint is.

Define a tracepoint in a dedicated header under `include/trace/events/`:

```c
/* include/trace/events/mydriver.h */
#undef TRACE_SYSTEM
#define TRACE_SYSTEM mydriver

#if !defined(_TRACE_MYDRIVER_H) || defined(TRACE_HEADER_MULTI_READ)
#define _TRACE_MYDRIVER_H

#include <linux/tracepoint.h>

TRACE_EVENT(mydriver_read,
    TP_PROTO(struct mydevice *dev, size_t count, int ret),
    TP_ARGS(dev, count, ret),
    TP_STRUCT__entry(
        __field(int,    dev_id)
        __field(size_t, count)
        __field(int,    ret)
    ),
    TP_fast_assign(
        __entry->dev_id = dev->id;
        __entry->count  = count;
        __entry->ret    = ret;
    ),
    TP_printk("dev_id=%d count=%zu ret=%d",
              __entry->dev_id, __entry->count, __entry->ret)
);

#endif
#include <trace/define_trace.h>
```

In exactly one `.c` file for the driver, define the trace points before including the header:

```c
/* mydriver.c */
#define CREATE_TRACE_POINTS
#include <trace/events/mydriver.h>
```

At the call site:

```c
ssize_t mydriver_read(struct file *f, char __user *buf, size_t count, loff_t *pos)
{
    ssize_t ret;
    /* ... actual read logic ... */
    trace_mydriver_read(dev, count, ret);
    return ret;
}
```

Attach a tracer via `ftrace`:

```bash
# List available tracepoints for your driver
ls /sys/kernel/debug/tracing/events/mydriver/

# Enable the tracepoint
echo 1 > /sys/kernel/debug/tracing/events/mydriver/mydriver_read/enable

# Start tracing
echo 1 > /sys/kernel/debug/tracing/tracing_on

# Exercise the driver, then read the trace
cat /sys/kernel/debug/tracing/trace

# Disable
echo 0 > /sys/kernel/debug/tracing/events/mydriver/mydriver_read/enable
```

### Lockdep: Deadlock Detection Before the Deadlock

A deadlock from lock order inversion is often not reproducible — threads A and B only reach the dangerous interleaving under specific scheduler timing. Lockdep (`CONFIG_PROVE_LOCKING`) eliminates the timing dependency by detecting the dangerous *pattern* the first time it occurs.

Lockdep instruments every lock acquisition and release. It maintains a directed graph of **lock dependency classes** — a class represents all instances of a given lock type (all `struct mydevice` spinlocks map to one class). An edge from class X to class Y means "a thread held X when it acquired Y." Lockdep checks: if X → Y exists in the graph, then Y → X must never appear. If you take `lock_a` then `lock_b` anywhere in the system, Lockdep will report the moment any code path takes `lock_b` then `lock_a` — regardless of whether an actual deadlock has yet occurred.

The report appears in `dmesg` and includes the full acquisition stack traces for both lock orderings:

```
WARNING: possible circular locking dependency detected
mydriver/1234 is trying to acquire lock:
  (&dev
