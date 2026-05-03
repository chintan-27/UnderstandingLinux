---
id: 104
title: "Process and task model"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

Every schedulable unit on a Linux system — a userspace process, a POSIX thread, a kernel worker thread — is represented by exactly one `task_struct` in the kernel's task list. This structure is not an abstraction over some lower-level primitive; it *is* the process, from the kernel's perspective. Remove it and the scheduler has nothing to schedule, the VFS has no file descriptor table to consult, and signal delivery has no target. When the slab cache for `task_struct` cannot be created at boot, the kernel calls `panic()` — not as a policy decision, but because there is no state from which to recover. Everything in the next several modules — scheduling, memory management, signals, namespaces, cgroups — is implemented as fields inside `task_struct` or as subsystems that take a `task_struct *` as their primary argument.

---

## Core Concepts

### The Process Descriptor: `task_struct`

A process in Linux is represented by `struct task_struct`, defined in `include/linux/sched.h`. On a 64-bit kernel it runs to roughly 9.5 KB — not because the struct is bloated, but because it directly embeds scheduling, memory, signal, and credential state rather than scattering them across separately allocated objects that would require pointer chases on hot paths.

Key embedded members:

```c
struct task_struct {
    /* scheduling */
    volatile long           state;       /* TASK_RUNNING, TASK_INTERRUPTIBLE, ... */
    struct sched_entity     se;          /* CFS scheduling entity */
    int                     prio;        /* effective (dynamic) priority */
    int                     static_prio; /* assigned nice-based priority */

    /* identity */
    pid_t                   pid;         /* PID in its own namespace */
    pid_t                   tgid;        /* thread group ID (== PID of group leader) */
    struct task_struct      *real_parent;
    struct task_struct      *parent;     /* current parent (may differ after reparenting) */

    /* memory */
    struct mm_struct        *mm;         /* userspace memory descriptor; NULL for kernel threads */
    struct mm_struct        *active_mm;  /* borrowed mm for kernel threads */

    /* files */
    struct files_struct     *files;      /* open file descriptor table */

    /* signals */
    struct signal_struct    *signal;     /* shared signal state for thread group */
    struct sighand_struct   *sighand;    /* signal handlers */
    sigset_t                blocked;     /* blocked signal mask */

    /* namespaces */
    struct nsproxy          *nsproxy;    /* PID, net, mount, UTS, IPC namespaces */

    /* credentials */
    const struct cred       *real_cred;
    const struct cred       *cred;       /* effective credentials */

    /* ... ~200 more fields */
};
```

The circular doubly-linked list threading through all descriptors uses the `tasks` member:

```c
struct list_head tasks; /* prev/next in the global task list */
```

The kernel traverses this with `for_each_process(p)`, defined as iterating from `init_task` (PID 1's descriptor, statically allocated) around the ring.

### Why a Linked List, Not an Array

Static task arrays impose a compile-time cap and waste memory at every size except exactly full. Linux uses a linked list because process count is workload-dependent: a busy container host might run tens of thousands of tasks; an embedded system might run fewer than twenty. The list grows and shrinks with demand at the cost of $O(n)$ lookup by PID — which the kernel avoids by maintaining a separate hash table and radix tree for PID-to-descriptor translation (see `find_task_by_vpid()` in `kernel/pid.c`).

### Allocation via the Slab Allocator

`task_struct` is not allocated with `kmalloc`. At boot, `kernel/fork.c` creates a dedicated slab cache:

```c
task_struct_cachep = kmem_cache_create(
    "task_struct",
    sizeof(struct task_struct),
    ARCH_MIN_TASKALIGN,       /* align to L1_CACHE_BYTES */
    SLAB_PANIC | SLAB_NOTRACK,
    NULL
);
```

The slab allocator maintains per-CPU magazines of pre-allocated, pre-zeroed objects. A `fork()` call pulls one from the magazine without touching the general allocator at all. This matters because `fork()` is a hot path — shells, web servers, and build systems call it thousands of times per second on loaded machines.

`ARCH_MIN_TASKALIGN` expands to `L1_CACHE_BYTES`, typically 64 bytes on x86-64. This alignment guarantee means a `task_struct` starts on a cache line boundary. Without it, a single scheduler read of `state` and `se.vruntime` might span two cache lines, doubling the cache pressure on every scheduling decision across every CPU.

`SLAB_PANIC` means: if `kmem_cache_create` fails, call `panic()` immediately. The kernel does not attempt a fallback. A system unable to allocate process descriptors cannot execute any code on behalf of any user.

You can observe the live cache in `/proc/slabinfo`:

```bash
grep task_struct /proc/slabinfo
# task_struct         1024   1024   9472    3    8 : tunables    0    0    0 : slabdata    341    341      0
# columns: name | active_objs | num_objs | objsize | objperslab | pagesperslab
```

The `objsize` column (here 9472 bytes) reflects the actual compiled size of `task_struct` on your kernel.

### The PID: Process Identification

`pid_t` is a 32-bit signed integer. The default upper bound is 32,768 (controlled by `/proc/sys/kernel/pid_max`), raised to a 22-bit maximum ($2^{22} = 4{,}194{,}304$) on 64-bit kernels. PIDs are allocated from a bitmap; when the counter wraps past `pid_max`, the kernel scans from 300 (reserving low PIDs for system processes) for the next free bit. This makes late-wrap allocation $O(n/w)$ where $n$ is `pid_max` and $w$ is the word size, though in practice the bitmap scan is fast because most slots are free.

PIDs are not pointers. Userspace receives a `pid_t`; the kernel translates it via `find_task_by_vpid(pid)`, which indexes into a hash table keyed on the PID within the calling process's PID namespace:

```c
struct task_struct *find_task_by_vpid(pid_t vnr)
{
    return find_task_by_pid_ns(vnr, task_active_pid_ns(current));
}
```

### Scheduling Entities: `sched_entity`

CFS does not operate on `task_struct` directly. It operates on `struct sched_entity`, embedded inside `task_struct` as the `se` field. This indirection is load-bearing: a `sched_entity` can represent either a single task or an entire cgroup of tasks (a `task_group`), allowing CFS to enforce CPU bandwidth at the group level without special-casing the scheduler logic.

```c
struct sched_entity {
    struct load_weight  load;       /* weight derived from nice value */
    struct rb_node      run_node;   /* node in the CFS red-black tree */
    u64                 vruntime;   /* accumulated virtual runtime, nanoseconds */
    /* ... */
};
```

CFS inserts `sched_entity` objects into a per-runqueue red-black tree keyed on `vruntime`. The scheduler always picks the leftmost node — the task that has received the least weighted CPU time. The leftmost node is cached in `cfs_rq->rb_leftmost`, making the common-case pick $O(1)$ despite the tree being $O(\log n)$ for insertion and deletion.

### Namespaces and the PID Model

PIDs are unique within a PID namespace, not globally. Each `task_struct` stores a pointer to a `struct nsproxy`:

```c
struct nsproxy {
    struct uts_namespace    *uts_ns;
    struct ipc_namespace    *ipc_ns;
    struct mnt_namespace    *mnt_ns;
    struct pid_namespace    *pid_ns_for_children;
    struct net              *net_ns;
    struct time_namespace   *time_ns;
};
```

A process created inside a container has a PID visible at every namespace level it is nested in. The kernel represents this with `struct pid`, which contains an array of `struct upid` — one per namespace level:

```c
struct pid {
    unsigned int level;           /* depth in the namespace tree */
    struct upid numbers[1];       /* flexible array: one upid per level */
};

struct upid {
    int nr;                       /* PID number at this level */
    struct pid_namespace *ns;
};
```

A process three namespaces deep has three simultaneously valid PIDs — one per level — all referring to the same `task_struct`.

---

## How It Works

### fork() to task_struct: The Creation Path

`fork()` enters the kernel as `sys_fork()` → `kernel_clone()` (the renamed `do_fork()` in kernels ≥ 5.10) → `copy_process()` → `dup_task_struct()`:

```c
/* kernel/fork.c */
static struct task_struct *dup_task_struct(struct task_struct *orig, int node)
{
    struct task_struct *tsk;

    tsk = alloc_task_struct_node(node);  /* pulls from slab cache */
    if (!tsk)
        return NULL;

    err = arch_dup_task_struct(tsk, orig); /* memcpy of the parent descriptor */
    if (err)
        goto free_tsk;

    err = alloc_thread_stack_node(tsk, node); /* allocate kernel stack */
    if (!err)
        goto free_tsk;

    /* tsk->stack now points to the new kernel stack */
