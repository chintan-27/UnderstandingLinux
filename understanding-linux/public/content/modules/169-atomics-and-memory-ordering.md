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

## Core Concepts
### Atomicity
An operation is **atomic** when it appears to execute as a single, indivisible step with respect to all other threads. In hardware this is provided by primitives such as **Compare‑And‑Swap (CAS)**, **Load‑Linked/Store‑Conditional (LL/SC)**, or the x86 `LOCK` prefix. The guarantee is that no other thread can observe a partially‑executed operation; the memory system either sees the old value or the new value, never a mixture.

### Memory Ordering
Modern processors and compilers may **reorder** memory operations for performance, as long as the reordering does not violate the single‑threaded program’s semantics. Reordering categories that matter for concurrency are:

| Reordering | Allowed on x86‑TSO? | Allowed on ARM/AArch64? | Effect if unchecked |
|------------|--------------------|--------------------------|----------------------|
| Load→Load  | No                 | No                       | benign               |
| Store→Store| No                 | No (except via store buffer) | benign               |
| Load→Store | No                 | **Yes** (store can be delayed) | May cause **StoreLoad** violation |
| Store→Load | **Yes** (store buffer) | **Yes**                 | Can break acquire/release semantics |

To prevent unwanted reordering we insert **memory barriers** (fences). A barrier instructs the CPU to drain its store buffer and/or invalidate its load queue before proceeding.

### Acquire/Release Semantics
- **Acquire** on a load: ensures that **no subsequent memory read or write** can be reordered **before** this load. It *acquires* visibility of all writes that happened‑before the matching release.
- **Release** on a store: ensures that **no preceding memory read or write** can be reordered **after** this store. It *releases* all prior writes to become visible to a later acquire.

Formally, for an atomic variable `A`:
```
release_store(A, v)   // semantics:  ⟨store A=v⟩  ⊢  fence_release
acquire_load(A)       // semantics:  fence_acquire  ⊢  ⟨load A⟩
```
The pair (release, acquire) establishes a **synchronizes‑with** relation: if thread T1 performs `release_store(A,1)` and thread T2 later performs `acquire_load(A)` and reads the value `1`, then all memory writes that happened‑before the release in T1 **happen‑before** the acquire in T2.

### Fences
A fence is a barrier without an associated load/store. Linux distinguishes three types (mapping to hardware instructions):
- **acquire fence** (`smp_rmb()` on ARM, `lfence` on x86) – prevents later loads/stores from moving before the fence.
- **release fence** (`smp_wmb()` on ARM, `sfence` on x86) – prevents earlier loads/stores from moving after the fence.
- **full fence** (`smp_mb()` on ARM, `mfence` on x86) – combines both, preventing any reordering across the fence.

### Happens‑Before (HB)
The HB relation is the **transitive closure** of:
1. **Program order** (`po`): each thread’s sequential execution order.
2. **Synchronizes‑with** (`sw`): a release operation in one thread and an acquire operation in another that read the value written by the release.

If `A →_po B` and `B →_sw C` then `A →_hb C`. HB guarantees that the effects of `A` are visible to `C`.

---

## How It Works
### Acquire/Release from First Principles
Consider two threads sharing an atomic flag `lock`.  
Thread 1 executes:
```c
store_release(&lock, 1);   // release store
store_relaxed(&data, 42);  // ordinary store
```
Thread 2 executes:
```c
while (load_acquire(&lock) == 0) { }   // spin
r = load_relaxed(&data);               // ordinary load
```
**Why does this work?**  
- The release store forces the store buffer to drain before the flag becomes visible. Hence, when Thread 2 observes `lock == 1`, the store buffer of Thread 1 is empty, guaranteeing that `data`’s store has already reached the cache subsystem.  
- The acquire load prevents any later load (the read of `data`) from being moved before the acquire, ensuring Thread 2 sees the updated `data`.  
Without the acquire/release pair, on a weakly ordered CPU (ARM) Thread 2 could see `lock == 1` while still observing the old value of `data` because the store to `data` might remain in Thread 1’s store buffer.

### Fences from First Principles
A **full fence** (`smp_mb()`) executes the following micro‑architectural steps on ARM:
1. Issue a `DSB SY` (Data Synchronization Barrier) – stalls until all outstanding memory transactions complete.
2. Issue an `DSB ISH` (Inner Shareable) – ensures ordering of both loads and stores.
On x86 the equivalent is `mfence`, which serializes the load and store units and drains the store buffer.

The fence creates a **global ordering point**: all memory ops before the fence are globally visible before any op after the fence. This eliminates the StoreLoad reordering that can break patterns like:
```c
x = 1;          // store
smp_mb();       // full fence
y = 1;          // store
```
Without the fence, an ARM core could make the store to `y` visible to another core before the store to `x`, allowing a reader to see `y==1` while `x==0`. The fence forces the store to `x` to retire first.

### Happens‑Before Construction
Given a mutex implemented with acquire/release:
```
T1:  store_release(&mutex, 1);   // unlock
T1:  store_relaxed(&x, 99);
T2:  while (load_acquire(&mutex) == 0) { } // lock
T2:  r = load_relaxed(&x);
```
The release store **synchronizes‑with** the acquire load when T2 reads `1`. By HB transitivity, the store to `x` in T1 happens‑before the load of `x` in T2, so `r == 99` is guaranteed.

---

## Worked Examples
### Example 1: Release‑Acquire Lock (x86 & ARM)
```c
/* atomic.h wrapper */
static inline void lock_release(atomic_t *v) {
    atomic_set_release(v, 1);   // __atomic_store_n(v,1,__ATOMIC_RELEASE)
}
static inline int lock_acquire(atomic_t *v) {
    return atomic_acquire_read(v); // __atomic_load_n(v,__ATOMIC_ACQUIRE)
}

/* test.c */
#include <stdio.h>
#include <stdatomic.h>
#include <pthread.h>

atomic_t lock = ATOMIC_INIT(0);
int data = 0;

void *t1(void *_){
    data = 42;                     // (1) ordinary store
    lock_release(&lock);           // (2) release store
    return NULL;
}
void *t2(void *_){
    while (lock_acquire(&lock) == 0) { } // (3) acquire load
    printf("%d\n", data);                // (4) ordinary load
    return NULL;
}
int main(){
    pthread_t a,b;
    pthread_create(&a,NULL,t1,NULL);
    pthread_create(&b,NULL,t2,NULL);
    pthread_join(a,NULL);
    pthread_join(b,NULL);
    return 0;
}
```
**Step‑by‑step reasoning (ARM):**  
1. T1 executes `data = 42`. This enters the store buffer.  
2. T1 executes `lock_release`. The release translates to `stlr wzr, [x0]` (store‑release) followed implicitly by a `dmb ish` barrier; the barrier forces the store buffer to drain, so the store to `data` reaches the cache before the flag becomes visible.  
3. T2 spins on `lock_acquire`. The acquire load is `ldar w0, [x0]` (load‑acquire) which includes a preceding `dmb ish` barrier, preventing any later load from moving before the flag read.  
4. When T2 observes `lock == 1`, the barrier guarantees T1’s store buffer is empty, thus the store to `data` is already globally visible. The subsequent `printf` reads `42`.  
On x86 the same reasoning holds because the `LOCK XCHG` used by `atomic_set_release` implicitly includes a full fence, and the acquire load is a normal load (x86 already prevents Load→Store reordering).

### Example 2: Full Fence Between Stores (ARM)
```c
#include <stdio.h>
#include <stdatomic.h>
#include <pthread.h>

atomic_int x = ATOMIC_VAR_INIT(0);
atomic_int y = ATOMIC_VAR_INIT(0);

void *writer(void *_){
    atomic_store_explicit(&x, 1, memory_order_relaxed);
    atomic_thread_fence(memory_order_seq_cst);   // full fence
    atomic_store_explicit(&y, 1, memory_order_relaxed);
    return NULL;
}
void *reader(void *_){
    while (atomic_load_explicit(&y, memory_order_relaxed) == 0) { }
    printf("%d\n", atomic_load_explicit(&x, memory_order_relaxed));
    return NULL;
}
int main(){
    pthread_t w,r;
    pthread_create(&w,NULL,writer,NULL);
    pthread_create(&r,NULL,reader,NULL);
    pthread_join(w,NULL);
    pthread_join(r,NULL);
    return 0;
}
```
**Why the fence is needed on ARM:**  
- Without the fence, the ARM core may place the store to `x` in its store buffer and later raise the store to `y` to the coherence point first (store buffer can reorder stores).  
- The reader could then see `y==1` while still observing the old value of `x==0`.  
- The `atomic_thread_fence(memory_order_seq_cst)` emits a `dmb ish` instruction, which stalls until the store buffer is empty, guaranteeing that the store to `x` reaches the cache before the store to `y`. Consequently, any observer that sees `y==1` must also see `x==1`.

### Example 3: Happens‑Before via Mutex (Linux futex)
```c
#include <stdio.h>
#include <stdatomic.h>
#include <unistd.h>
#include <sys/syscall.h>
#include <linux/futex.h>
#include <sys/time.h>
#define FUTEX_WAIT   0
#define FUTEX_WAKE   1
static inline int futex_wait(atomic_int *uaddr, int val){
    return syscall(SYS_futex, uaddr, FUTEX_WAIT, val, NULL, NULL, 0);
}
static inline int futex_wake(atomic_int *uaddr){
    return syscall(SYS_futex, uaddr, FUTEX_WAKE, 1, NULL, NULL, 0);
}

atomic_int lock = ATOMIC_VAR_INIT(0);
int msg = 0;

void *sender(void *_){
    msg = 123;                         // (1) store
    atomic_store_explicit(&lock,1,memory_order_release); // (2) release
    futex_wake(&lock);                 // wake waiter
    return NULL;
}
void *receiver(void *_){
    while (atomic_load_explicit(&lock, memory_order_acquire) == 0) // (3) acquire
        futex_wait(&lock,0);           // block until lock!=0
    printf("%d\n", msg);               // (4) should print 123
    return NULL;
}
int main(){
    pthread_t s,r;
    pthread_create(&s,NULL,sender,NULL);
    pthread_create(&r,NULL,receiver,NULL);
    pthread_join(s,NULL);
    pthread_join(r,NULL);
    return 0;
}
```
**HB explanation:**  
- The `store_release` (`memory_order_release`) **synchronizes‑with** the `load_acquire` (`memory_order_acquire`) when the receiver reads the value `1`.  
- By program order, the store to `msg` precedes the release store in the sender, and the acquire load precedes the load of `msg` in the receiver.  
- Transitivity of HB yields: store to `msg` →hb→ load of `msg`. Therefore the receiver must observe `msg == 123`.

---

## Common Mistakes
| Mistake | What’s wrong | Why it breaks correctness |
|---------|--------------|---------------------------|
| **Assuming `atomic` alone gives ordering** | Using `atomic_int x;` with `memory_order_relaxed` and expecting other threads to see writes in program order. | Relaxed atomics guarantee atomicity *only*; they impose no ordering constraints. On ARM/POWER a later load can be reordered before an earlier relaxed store, leading to stale reads. |
| **Using `volatile` for synchronization** | Declaring shared data as `volatile int flag;` and relying on it for acquire/release. | `volatile` prevents compiler reordering but does **not** emit hardware memory barriers. On weakly ordered CPUs the hardware can still reorder, so the flag may become visible before prior stores. |
| **Missing compiler barrier after an asm fence** | Writing `asm volatile ("dmb ish" ::: "memory");` but then accessing non‑atomic variables without telling the compiler the fence clobbers memory. | The compiler may still move loads/stores across the asm block if it doesn’t know it clobbers memory, defeating the fence. Use `__asm__ volatile ("" ::: "memory")` or the Linux `barrier()` macro. |
| **Over‑using full fences** | Placing `smp_mb()` before every atomic operation in a lock‑free queue. | Full fences are expensive (≈30‑40 cycles on x86, ≈12‑20 cycles on ARM). Unnecessary fences serialize execution and destroy scalability; acquire/release fences are sufficient for most patterns. |
| **Assuming x86 ordering holds everywhere** | Writing code that relies on the fact that x86 prevents StoreLoad reordering and then porting to ARM without adding barriers. | x86’s TSO model implicitly provides acquire/release semantics for normal loads/stores, but ARM does not. Portable code must express ordering explicitly via C11 atomics or Linux kernel barriers. |
| **Mixing mutexes with atomic releases** | Performing `pthread_mutex_unlock()` then doing an atomic store with `memory_order_relaxed` to share data. | The mutex unlock already performs a release; adding a relaxed store after it is not protected by the mutex’s release, allowing a concurrent thread to see the store before the mutex is considered released. Always pair the data store with the same release (or place it before the unlock). |

---

## Exercises
### 1. Easy – Spinlock with Acquire/Release
Implement a lock using an atomic flag:
```c
typedef struct { atomic_t l; } spinlock_t;
static inline void spin_lock(spinlock_t *s){
    while (atomic_xchg_acquire(&s->l, 1))   // acquire on exchange
        cpu_relax();
}
static inline void spin_unlock(spinlock_t *s){
    atomic_store_release(&s->l, 0);         // release store
}
```
*Tasks:*  
- Write a test program that increments a shared counter 1 M times with 4 threads using this lock.  
- Compile with `gcc -O2 -pthread test.c -o test` and run; verify the final counter equals 4 000 000.  
- Use `objdump -d test | grep -E "xchg|lock"` to confirm the generated `xchg` includes the `lock` prefix (acquire) and the unlock is a plain `mov`.

### 2. Medium – MPSC Queue with Minimal Fences
Create a single‑producer, single‑consumer ring buffer where:
- The producer does **relaxed** stores to the slot, then a **release** store to the tail index.  
- The consumer does an **acquire** load of the tail index, then **relaxed** loads from the slot.  
Use `struct { atomic_int head, tail; char buf[SIZE]; }` and `memory_order_relaxed` for data, `memory_order_release/acquire` for indices.

*Tasks:*  
- Implement `enqueue` and `dequeue`.  
- Stress‑test with a producer that pushes 10 M integers and a consumer that sums them; ensure no loss or duplication.  
- Measure overhead with `perf stat -r 5 ./test` and compare to a version that uses `memory_order_seq_cst` everywhere.

### 3. Hard – RCU‑Style Read‑Side Critical Section
Implement a tiny read‑copy‑update (RCU) mechanism:
- Readers execute `rcu_read_lock()` (no atomic, just compiler barrier) and `rcu_read_unlock()` (again just barrier).  
- Updaters call `synchronize_rcu()` which waits for a grace period by exposing a global counter that each reader increments on lock and decrements on unlock (using acquire/release).  
- After the counter reaches zero, the updater can safely reclaim the old object.

*Tasks:*  
- Use `__atomic_fetch_add` with `memory_order_acquire` on lock and `memory_order_release` on unlock.  
- Implement `synchronize_rcu()` by spinning until the counter is 0, issuing a `smp_mb()` after each read to ensure visibility of the decrement.  
- Validate with a test where multiple readers traverse a linked list while a updater replaces the list head; use `valgrind --tool=helgrift` to detect races.  
- Bonus: run the test on both x86 and ARM (e.g., via QEMU) to show portability.

---

## Linux Connection
### Kernel Primitives
| Concept | Kernel API | Header | Typical Use |
|---------|------------|--------|-------------|
| Atomic increment/decrement | `atomic_inc_return()`, `atomic_dec_and_test()` | `<linux/atomic.h>` | Reference counts (`struct kref`), `struct file->f_count` |
| Acquire load | `smp_load_acquire(&ptr)` | `<linux/barrier.h>` | Reading a pointer after a lock (`rcu_dereference`) |
| Release store | `smp_store_release(&ptr, val)` | `<linux/barrier.h>` | Publishing a new RCU pointer (`rcu_assign_pointer`) |
| Full fence | `smp_mb()` | `<linux/barrier.h>` | Ensuring descriptor rings are updated before NIC sees them (`netif_tx_lock`) |
| Acquire fence | `smp_rmb()` | `<linux/barrier.h>` | Preventing load‑load reordering in network drivers |
| Release fence | `smp_wmb()` | `<linux/barrier.h>` | Preventing store‑store reordering in block I/O |
| Memory barrier macro | `barrier()` (compiler only) | `<linux/compiler.h>` | Stopping GCC from reordering around inline asm |
| Futex (userspace) | `sys_futex()` | `<linux/futex.h>` | Implementing mutexes, condvars, semaphores |

### Real‑world Example: Network Device Reference Count
In `net/core/dev.c`:
```c
static inline void dev_hold(struct net_device *dev)
{
    atomic_inc_return(&dev->ptype->refs); // atomic_inc_return = atomic add + acquire
}
static inline void dev_put(struct net_device *dev)
{
    if (atomic_dec_and_test(&dev->ptype->refs))
        kfree_rcu(dev->ptype, rcu);      // dec+test = release + barrier
}
```
- `atomic_inc_return` uses `LOCK XADD` on x86 (acquire semantics) and `ldaddal` on ARM (acquire).  
- `atomic_dec_and_test` performs a release store followed by a memory‑order barrier (`smp_mb__after_atomic`) before invoking `kfree_rcu`, ensuring that any prior updates to the device are visible before the free.

### Runnable Demonstration
```bash
# 1. Build a tiny module that shows the fence instruction
cat > fence_demo.c <<'EOF'
#include <linux/module.h>
#include <linux/atomic.h>
#include <linux/barrier.h>

static int __init fence_init(void)
{
    atomic_t v = ATOMIC_INIT(0);
    atomic_set_release(&v, 42);   // release store
    smp_mb();                     // full fence
    pr_info("value after fence: %d\n", atomic_acquire_read(&v));
    return 0;
}
static void __exit fence_exit(void) { }
module_init(fence_init);
module_exit(fence_exit);
MODULE_LICENSE("GPL");
EOF
make -C /lib/modules/$(uname -r)/build M=$(pwd) modules
sudo insmod fence_demo.ko
dmesg | tail -5
# 2. Verify the generated code contains mfence (x86) or dmb ish (ARM)
objdump -d fence_demo.ko | grep -A2 -B2 "mfence\|dmb"
```
Output will show `mfence` (x86) or `dmb ish` (ARM) right after the store, proving the kernel emits the hardware barrier.

### Tools for Validation
- **cppmem / herd7**: Run litmus tests like `message passing` or `store buffering` to confirm that your atomics+barriers enforce the intended HB relations.  
- **perf**: `perf stat -e cycles,instructions,cache-references,cache-misses ./test` to quantify fence overhead.  
- **kmemcheck / KASAN**: Detect use-after-free caused by missing barriers in
