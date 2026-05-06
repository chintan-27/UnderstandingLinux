---
id: 140
title: "Security and robustness of drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Introduction to Driver Security and Robustness
A driver executes in kernel mode with direct access to CPU registers, memory management units (MMU), and I/O buses. Because it runs with privileged execution, any flaw can be leveraged to compromise the entire system: arbitrary memory read/write, DMA-based memory injection, or denial‑of‑service via resource exhaustion. Security and robustness therefore arise from **minimizing the trusted input surface** and **ensuring that every kernel‑side operation respects hardware‑enforced isolation**.  

The four classic defect classes are:
1. **Input validation** – untrusted data from user space must be checked before it is used as an index, size, or pointer.  
2. **Lifetime bugs** – resources (memory, DMA buffers, interrupt descriptors) must be released exactly once for each acquisition.  
3. **Race bugs** – concurrent threads or interrupt contexts may interleave on shared state, producing non‑atomic updates.  
4. **DMA safety** – devices can read/write system memory bypassing the CPU; the kernel must guarantee that the memory region exposed to the device is both *valid* and *exclusively owned* for the duration of the transfer.

### Input Validation
User‑space pointers are not kernel virtual addresses; they are interpreted through the process’s page tables. If a driver dereferences such a pointer without verification, it may:
* Access an unmapped page → page fault → oops.  
* Access a kernel address → bypass memory protection → arbitrary kernel write.  

The kernel provides `access_ok(type, addr, size)` which checks that the entire range `[addr, addr+size)` lies within the user address space (`0 ≤ addr < TASK_SIZE` and `addr+size ≤ TASK_SIZE`). The check is performed against the current task’s memory descriptor (`current->mm`).  
Mathematically, let `U = [0, TASK_SIZE)` be the user address interval. The predicate is:  

$$
\text{access\_ok}(type,addr,size) \iff
\bigl[addr, addr+size\bigr) \subseteq U .
$$

If the predicate fails, the driver must return `-EFAULT`; otherwise the data can be safely copied with `copy_from_user`/`copy_to_user`.  

### Lifetime Bugs
Kernel resources are acquired via allocators (`kmalloc`, `vmalloc`, `alloc_page`, `dma_alloc_coherent`, `request_irq`, etc.) and must be released with the matching free function. A lifetime bug occurs when the acquisition–release pairing is violated:
* **Leak** – allocated object never freed → memory exhaustion → OOM killer triggers.  
* **Double free** – same object freed twice → corrupts freelist → possible use‑after‑free or slab corruption.  

Correct lifetime management can be expressed as an invariant:  

$$
\forall r \in \text{Resources}:\quad
\#\text{acquire}(r) - \#\text{release}(r) = 0
\quad\text{at any observable program point.}
\]

Tracking this invariant requires either explicit pairing (e.g., `kmalloc`/`kfree`) or reference counting (`kref_get`/`kref_put`).  

### Race Bugs
When two execution contexts (process threads, softirqs, hardirqs, or tasklets) access the same mutable location without ordering guarantees, the final state depends on the interleaving—a classic race condition.  

Consider a shared counter `cnt`. Two threads each execute `cnt++;`. Without synchronization, the possible outcomes after both finishes are `{cnt_initial+1, cnt_initial+2}` instead of the deterministic `cnt_initial+2`.  

The kernel offers primitives that enforce *mutual exclusion* (`mutex`, `spinlock`) or *read‑copy‑update* (`rcu`). A mutex, for example, guarantees that only one holder may enter the critical section at a time by using an atomic test‑and‑set on a lock word and putting the waiter to sleep if held.  

Formally, let `L` be a lock variable initially `0`. The lock operation executes:

```
do {
    while (atomic_cmpxchg(&L, 0, 1) != 0)
        cpu_relax();   // spin
} while (0);
```

The unlock stores `0` with a release barrier, ensuring that all prior stores become visible to the next acquirer.  

### DMA Safety
Direct Memory Access lets a device read/write system RAM without CPU intervention. The device sees **physical addresses**; the kernel must therefore:
1. **Pin** the memory pages (prevent them from being swapped out).  
2. **Obtain** the correct physical address range.  
3. **Synchronize** caches so that the device sees coherent data.  

If the kernel exposes an incorrect or dangling physical range, the device may corrupt unrelated kernel structures or read privileged data.  

The DMA API provides `dma_alloc_coherent(dev, size, &dma_handle, gfp)` which returns a kernel virtual address `cpu_addr` and the corresponding bus address `dma_handle`. Internally it:
* Allocates contiguous pages (`alloc_pages`).  
* Calls `dma_map_page` to obtain the bus address (using the IOMMU if present).  
* Returns a pointer that is cache‑coherent (either using non‑cached mapping or explicit `dma_sync_*`).  

When the transfer completes, the driver must call `dma_free_coherent(dev, size, cpu_addr, dma_handle)`. Failure to unmap or sync leads to *stale cache* bugs or *dangling DMA* after the buffer is freed.  

---

## How It Works
### User‑Space Pointer Validation
```c
/* returns 0 on success, -EFAULT on bad pointer */
static int chk_usr_ptr(const void __user *uaddr, size_t len)
{
    if (!access_ok(VERIFY_READ, uaddr, len))
        return -EFAULT;
    /* optional: also check for overflow of len */
    if ((uintptr_t)uaddr + len < (uintptr_t)uaddr)
        return -EFAULT;   /* wrapped around */
    return 0;
}
```
*Why*: `access_ok` checks the interval against `current->mm->mmap` via `range_ok`. The extra overflow test guards against pointer arithmetic overflow on 64‑bit kernels where `len` may be attacker‑controlled.  

### Safe Data Transfer
```c
int copy_from_user_safe(void *dst, const void __user *src, size_t n)
{
    if (chk_usr_ptr(src, n))
        return -EFAULT;
    return copy_from_user(dst, src, n);   /* uses __builtin_memcpy with probes */
}
```
`copy_from_user` itself performs per‑page fault handling; if a page is not present it triggers a `get_user_pages` fault and may sleep (hence must not be called from atomic context).  

### Mutual Exclusion with Mutex
```c
static DEFINE_MUTEX(dev_mutex);

static ssize_t dev_read(struct file *filp, char __user *buf,
                        size_t count, loff_t *ppos)
{
    mutex_lock(&dev_mutex);
    /* critical section: read hardware registers */
    u32 val = readl(dev->regs + DATA_REG);
    mutex_unlock(&dev_mutex);
    if (copy_to_user(buf, &val, min(count, sizeof(val))))
        return -EFAULT;
    return sizeof(val);
}
```
*Why*: `mutex_lock` may put the task to sleep if the lock is held, therefore it is only valid in contexts that may schedule (process context, not hardirq). The lock word is an atomic integer; the unlock performs a `smp_store_release` to ensure prior stores (the register read) become visible to the next acquirer.  

### Spinlock for Short, Irq‑Safe Sections
```c
static spinlock_t dev_lock;

static irqreturn_t dev_isr(int irq, void *dev_id)
{
    unsigned long flags;
    spin_lock_irqsave(&dev_lock, flags);
    /* clear interrupt status, update software state */
    dev->status |= readl(dev->regs + IRQ_STATUS);
    spin_unlock_irqrestore(&dev_lock, flags);
    return IRQ_HANDLED;
}
```
*Why*: `spin_lock_irqsave` disables local interrupts on the current CPU and acquires the lock via an atomic test‑and‑set. The critical section must be bounded (typically < 10 µs) because spinning wastes CPU cycles and blocks interrupt handling on that CPU.  

### DMA Allocation and Synchronization
```c
struct dma_buf {
    void *cpu_addr;
    dma_addr_t dma_handle;
    size_t size;
};

static struct dma_buf *dma_buf_alloc(struct device *dev, size_t size)
{
    struct dma_buf *db = kmalloc(sizeof(*db), GFP_KERNEL);
    if (!db)
        return NULL;
    db->cpu_addr = dma_alloc_coherent(dev, size, &db->dma_handle, GFP_KERNEL);
    if (!db->cpu_addr) {
        kfree(db);
        return NULL;
    }
    db->size = size;
    return db;
}

static void dma_buf_free(struct device *dev, struct dma_buf *db)
{
    dma_free_coherent(dev, db->size, db->cpu_addr, db->dma_handle);
    kfree(db);
}

/* After device writes into the buffer, make CPU see the data */
static void dma_buf_sync_cpu(struct device *dev, struct dma_buf *db)
{
    dma_sync_single_for_cpu(dev, db->dma_handle, db->size, DMA_FROM_DEVICE);
}

/* Before device reads, make sure CPU writes are visible to device */
static void dma_buf_sync_dev(struct device *dev, struct dma_buf *db)
{
    dma_sync_single_for_device(dev, db->dma_handle, db->size, DMA_TO_DEVICE);
}
```
*Why*: The coherent allocator ensures that the returned virtual address is mapped with the `pgprot_noncached` attribute (or uses cache‑flushing primitives) so that CPU and device see the same data without explicit flushing. However, many platforms still require explicit `dma_sync_*` when using streaming mappings (`dma_map_single`). The synchronization functions issue the necessary cache clean/invalidate operations and, on systems with an IOMMU, update the translation tables.  

### Reference Counting for Lifetime Safety
```c
struct dev_obj {
    struct kref kref;
    void *buffer;
    /* ... other fields ... */
};

static void dev_obj_release(struct kref *kref)
{
    struct dev_obj *obj = container_of(kref, struct dev_obj, kref);
    kfree(obj->buffer);
    kfree(obj);
}

static struct dev_obj *dev_obj_get(struct dev_obj *obj)
{
    kref_get(&obj->kref);
    return obj;
}

static void dev_obj_put(struct dev_obj *obj)
{
    kref_put(&obj->kref, dev_obj_release);
}
```
*Why*: `kref` uses an atomic counter; `kref_get` increments with `atomic_inc`, `kref_put` decrements with `atomic_dec_and_test`. When the counter reaches zero, the release callback runs exactly once, guaranteeing that the buffer is freed after the last user drops its reference.  

---

## Worked Examples
### Example 1: Input Validation with Sized Structure
A driver implements an ioctl `SET_CONFIG` that takes a pointer to a user‑space struct:
```c
struct cfg {
    uint32_t flags;
    uint16_t len;          /* length of following buffer */
    uint8_t  data[0];      /* variable length */
};
```
**Goal**: reject malformed requests that could cause over‑reads or overflows.

**Step‑by‑step**:
1. Verify the pointer to `struct cfg` itself:
   ```c
   if (chk_usr_ptr(arg, sizeof(struct cfg)))
       return -EFAULT;
   ```
2. Copy the fixed header to kernel space to inspect `len` safely:
   ```c
   struct cfg kcfg;
   if (copy_from_user(&kcfg, arg, sizeof(struct cfg)))
       return -EFAULT;
   ```
3. Validate that `len` does not exceed a reasonable maximum (say 4096) and that the total user allocation is large enough:
   ```c
   if (kcfg.len > 4096)
       return -EINVAL;
   size_t total = sizeof(struct cfg) + kcfg.len;
   if (chk_usr_ptr(arg, total))
       return -EFAULT;
   ```
4. Allocate a kernel buffer of exactly `total` and copy the whole struct:
   ```c
   void *kbuf = kmalloc(total, GFP_KERNEL);
   if (!kbuf)
       return -ENOMEM;
   if (copy_from_user(kbuf, arg, total)) {
       kfree(kbuf);
       return -EFAULT;
   }
   /* now safely access kcfg.data = kbuf + sizeof(struct cfg) */
   ```
**Why each step matters**:  
* Step 1 prevents dereferencing an invalid user pointer.  
* Step 2 avoids TOCTOU: we copy the immutable header before checking `len`.  
* Step 3 ensures the user supplied enough memory for the variable part and caps the size to avoid kernel exhaustion.  
* Step 4 performs the actual transfer under the validated bounds.

### Example 2: Lifetime Bug – Reference‑Counted Buffer
A network driver stores received packets in a pre‑allocated pool. Each packet struct contains a `kref`.  
```c
struct pkt {
    struct kref ref;
    struct sk_buff *skb;
    /* ... */
};

static struct pkt *pkt_alloc(void)
{
    struct pkt *p = kmalloc(sizeof(*p), GFP_KERNEL);
    if (!p)
        return NULL;
    kref_init(&p->ref);
    p->skb = alloc_skb(2048, GFP_KERNEL);
    if (!p->skb) {
        kfree(p);
        return NULL;
    }
    return p;
}

static void pkt_release(struct kref *ref)
{
    struct pkt *p = container_of(ref, struct pkt, ref);
    kfree_skb(p->skb);
    kfree(p);
}

/* Acquisition */
static struct pkt *pkt_get(struct pkt *p)
{
    kref_get(&p->ref);
    return p;
}

/* Release */
static void pkt_put(struct pkt *p)
{
    kref_put(&p->ref, pkt_release);
}
```
**Scenario**: The driver queues a packet to the transmit ring, hands ownership to the hardware, and later the TX complete interrupt frees it. If the driver mistakenly calls `pkt_put` twice (once in the TX queue routine and again in the interrupt), the counter goes negative, triggering a WARN and double‑free.  

**Correct usage**:  
* After `pkt_alloc`, refcount = 1.  
* `pkt_get` before handing to hardware → refcount = 2.  
* Hardware completion interrupt calls `pkt_put` → refcount = 1 (still owned by driver).  
* When driver finally no longer needs the packet (e.g., after retransmission limit), it calls `pkt_put` → refcount = 0 → `pkt_release` runs exactly once, freeing the `skb` and the pkt struct.  

**Why**: The atomic nature of `kref_get`/`kref_put` guarantees that the release callback executes precisely when the last reference disappears, eliminating both leaks and double frees even under concurrent access.  

### Example 3: Race Bug – Protecting a Hardware Register with a Mutex
A USB driver exposes a vendor command that writes a 16‑bit value to a device register. Multiple threads may call the ioctl concurrently.  
```c
static DEFINE_MUTEX(vendor_mutex);

static long vendor_ioctl(struct file *filp, unsigned int cmd,
                         unsigned long arg)
{
    u16 val;
    if (copy_from_user(&val, (void __user *)arg, sizeof(val)))
        return -EFAULT;

    mutex_lock(&vendor_mutex);
    /* Ensure no other thread is mid‑transaction */
    usb_control_msg(dev->udev,
                    usb_sndctrlpipe(dev->udev, 0),
                    VENDOR_WRITE_REG,
                    USB_TYPE_VENDOR | USB_DIR_OUT,
                    0, 0, &val, sizeof(val), USB_CTRL_SET_TIMEOUT);
    mutex_unlock(&vendor_mutex);
    return 0;
}
```
**Why a mutex?**  
* The USB core serializes control messages at the endpoint level, but the driver’s internal state (e.g., a flag indicating a pending reset) may be accessed by other ioctls.  
* A mutex blocks callers that cannot proceed until the current transaction finishes, preventing interleaved writes that could corrupt the register or cause the device to enter an undefined state.  
* The mutex may sleep, which is acceptable because the ioctl is invoked from process context.  

If instead a spinlock were used, the driver would risk sleeping while holding the lock (illegal) or wasting CPU cycles if the USB transaction takes milliseconds.  

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Leads to Failure |
|---|---------|--------------|--------------------------|
| 1 | **Using `copy_from_user` without `access_ok`** | Drivers often omit the check, assuming the caller passed a valid buffer. | If the user supplies a kernel address or an address beyond `TASK_SIZE`, the kernel will dereference it, causing an oops or, worse, silent kernel memory corruption. |
| 2 | **Calling `kmalloc` with `GFP_ATOMIC` in a sleepable context** | `GFP_ATOMIC` forbids sleeping; if called from a context that may schedule (e.g., process context while holding a mutex), the allocation may fail spuriously. | Results in `-ENOMEM` errors under load, leading to dropped packets or failed ioctls, and masks real allocation problems. |
| 3 | **Failing to call `dma_unmap_single` after a streaming DMA transfer** | The driver maps a buffer with `dma_map_single`, starts the transfer, then frees the original buffer without unmapping. | The IOMMU (if present) retains a translation that points to freed memory; subsequent allocations may reuse the same physical pages, allowing the device to overwrite unrelated kernel data or stale data to be seen by the CPU. |
| 4 | **Using a spinlock for a critical section that may sleep** | Spinlocks disable preemption; if the holder calls a function that may sleep (e.g., `msleep`, `wait_event`), the CPU spins forever. | System lockup on SMP kernels; watchdog triggers, leading to a hard crash. |
| 5 | **Neglecting memory barriers when sharing data between CPU and device** | After writing a descriptor ring, the driver forgets to issue `wmb()` before kicking the device. | The device may read stale descriptor values due to store buffers, causing it to process incorrect lengths or addresses, leading to DMA corruption. |
| 6 | **Using `mutex_lock` in interrupt context** | Mutexes may put the task to sleep; interrupt context cannot schedule. | Results in `BUG: sleeping function called from invalid context` kernel oops, crashing the system. |
| 7 | **Relying on `copy_to_user` without checking the return value** | Assuming the copy always succeeds. | If a fault occurs (e.g., user buffer got unmapped mid‑copy), the driver returns success while only partial data was transferred, leaking kernel information or causing user‑space confusion. |
| 8 | **Failing to handle `-ERESTARTSYS` from interrupted syscalls** | Drivers that ignore this error may leave resources locked. | When a signal interrupts a blocking wait (e.g., `wait_event_interruptible`), the driver returns an error but retains a held mutex, causing deadlock for later callers. |
| 9 | **Using `udelay` for long delays (>10 µs) in tight loops** | `udelay` busy‑waits, wasting CPU cycles and increasing power consumption. | Degrades overall system responsiveness, especially on battery‑powered devices, and may cause soft lockups if the loop exceeds the watchdog timeout. |
|10| **Not initializing lockdep classes, leading to false positives** | When developing a new lock, omitting `LOCK_DEP_MAP` initialization makes lockdep report spurious cycles. | Masks real deadlocks because developers learn to ignore lockdep warnings, reducing confidence in the verification tool. |

---

## Exercises
### Easy – Input Validation Char Driver
1. Create a simple character driver (`cdev`) with an ioctl `GET_STATS` that copies a kernel‑space `struct stats` to user space.  
2. Implement `access_ok` checks on the user pointer and length, copy the data with `copy_to_user`, and return `-EFAULT` on failure.  
3. Test with `ioctl(fd, GET_STATS, &buf)` using a valid pointer and then with an invalid pointer (e.g., `NULL`). Verify that the driver returns the appropriate error.  
*Deliverable*: Source code, Makefile, and a short shell script that loads the module, runs the two test cases, and prints the results.

### Medium – Lifetime Management with kobject
1. Implement a driver that creates a `kobject` under `/sys/module/<name>/parameters/` to expose a buffer size.  
2. When the size changes, allocate/reallocate a kernel buffer using `kmalloc`/`krealloc`.  
3. Ensure that on module removal the buffer is freed exactly once, even if the parameter was changed multiple times. Use a `kref` to track outstanding references (e.g., from a sysfs show/store callback).  
4. Verify with `grep -R "" /sys/module/<name>/parameters/` before and after unloading, and check `dmesg` for leak warnings (enable `CONFIG_DEBUG_KMEMLEAK`).  
*Deliverable*: Source, Makefile, and a script that toggles the sysfs attribute, unloads the module, and confirms no leaks via `dmesg | grep -i leak`.

### Hard – Double‑Buffered DMA with Synchronization
1. Write a PCIe driver that allocates two coherent DMA buffers (`bufA`, `bufB`) using `dma_alloc_coherent`.  
2. Implement a ping‑pong transmission loop:  
   * Fill `bufA` with data, start DMA to device, then immediately begin filling `bufB`.  
   * Use a `completion` to signal when the device signals DMA done (via MSI‑X interrupt).  
   * In the ISR, complete the appropriate buffer, swap the active buffer, and restart DMA if the next buffer is ready.  
3. Protect the buffer indices with a `spinlock`; protect the completion signaling with a `memory_barrier` after updating the descriptor.  
4. Stress test by sending 1 GB of data via `dd if=/dev/zero of=/
