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

## Why This Matters

A kernel driver runs at ring 0 with no memory protection between its code and every other kernel data structure. When a userspace program dereferences a null pointer, the kernel delivers `SIGSEGV` and the process dies in isolation. When a driver does the same thing, the kernel panics — or worse, silently corrupts memory and continues running with poisoned state. The four failure modes covered here — input validation failures, object lifetime violations, race conditions, and DMA coherency errors — are not a taxonomy of theoretical risks. CVE-2017-7308 (packet socket ring buffer overflow), CVE-2019-2215 (use-after-free in Binder), and CVE-2021-3490 (eBPF verifier ALU bypass) are all instances of these exact categories. A driver that does not deliberately defend against each one is a vulnerability waiting for a trigger.

---

## Core Concepts

### Input Validation

Every value arriving via `ioctl`, `read`, `write`, `mmap`, or `lseek` is attacker-controlled. The kernel cannot verify that the calling process is well-behaved, that it has not been compromised, or that it is not a fuzzer (e.g., syzkaller) probing every reachable code path. The threat model is simple: assume the caller is adversarial.

**Validate before use, not after.** A size used in `kmalloc` must be range-checked before the call, not audited afterward. A `__user` pointer must be copied through `copy_from_user` or `get_user` — never dereferenced directly — because the address may be unmapped, may alias kernel memory, or may be concurrently modified between a check and a use (a time-of-check/time-of-use race, TOCTOU).

The `__user` annotation in function signatures is enforced by `sparse`, the kernel's semantic checker. Code marked `__user` that is directly dereferenced produces a sparse warning:

```bash
make C=1 CF="-D__CHECK_ENDIAN__" drivers/mydriver/mydriver.o
```

Sparse runs the checker on every `.c` file that is rebuilt. The `C=1` flag enables it; `C=2` checks all files regardless of modification time.

### Lifetime Bugs: Use-After-Free and Premature Free

Every kernel object has a lifetime bounded by allocation and free. A **use-after-free** occurs when a code path holds a pointer to an object that has already been freed. A **premature free** occurs when one context frees an object while another context still holds a live reference to it — the distinction is causal rather than structural, since both result in a dangling pointer.

The canonical driver scenario: a device is hot-unplugged. The driver's `remove` callback runs, frees the `struct my_device`, and returns. Simultaneously, a process blocked in an `ioctl` call wakes up and continues executing with a pointer into the now-freed structure. The slab allocator may have already handed that memory to a different allocation. The write goes into arbitrary kernel data.

Reference counting solves this by making "free" mean "free when the last reference drops" rather than "free immediately." The `kref` API and `kobject` both implement this pattern with atomic operations, ensuring no free occurs while any holder has not yet called `put`.

### Race Conditions

A race condition exists when the correctness of an outcome depends on the relative timing of two or more execution contexts. Drivers have more concurrent contexts than most code:

- Two processes with the device open simultaneously (SMP, two CPUs)
- A process in a `read`/`write` handler and an interrupt handler
- A process and a deferred work callback (workqueue, tasklet, timer)
- A process and a hot-plug removal event

The check-then-act pattern is the most common race. In pseudocode:

```
if (device_is_open == 0)      /* check */
    device_is_open = 1;       /* act */
```

Between the check and the act, another CPU can execute the same check and see the same zero. Both believe they have exclusive access. The fix is not a faster check — it is an atomic check-and-set that cannot be interrupted between the two operations.

LDD3 states it directly: "Race conditions come about as a result of shared access to resources." Any shared state that involves a non-atomic read-modify-write is a potential race. If $N$ concurrent threads each read a counter, increment it, and write it back, and if none of these operations are protected, the final value can be anywhere in the range $[1, N]$ rather than exactly $N$.

### DMA Safety

DMA lets a device read and write system RAM without CPU involvement. This creates two distinct problems.

**Cache coherency.** Modern CPUs do not write to RAM on every store — they write to cache lines, which are flushed to RAM lazily. If the CPU writes data to a buffer and the device reads it via DMA before the cache line is flushed, the device reads stale data. If the device writes new data into RAM via DMA and the CPU reads it before its cache line is invalidated, the CPU reads stale data. The kernel's DMA mapping API (`dma_map_single`, `dma_sync_for_device`, `dma_sync_for_cpu`) exists specifically to insert the correct cache flush and invalidate operations at the right moments.

**Buffer lifetime.** A DMA buffer must remain physically pinned and mapped for the entire duration of the transfer. If a transfer is in flight and the buffer is freed, the device continues writing to whatever physical page was reallocated at that address — no fault is generated, no warning is issued. The corruption is silent.

The address the device uses is a **bus address** (or IOVA), not a virtual address and not necessarily the physical address. The mapping is:

$$\text{virtual address} \xrightarrow{\text{virt\_to\_phys}} \text{physical address} \xrightarrow{\text{IOMMU}} \text{bus address (IOVA)}$$

When an IOMMU is present, the device sees only the IOVA space the driver explicitly mapped. This is the hardware enforcement of DMA safety: a device cannot DMA into unmapped memory even if its firmware is compromised. When no IOMMU is present, the bus address equals the physical address, and there is no hardware enforcement — driver correctness is the only protection.

---

## How It Works

### Input Validation: Mechanics

Consider a minimal `write` implementation with no validation:

```c
ssize_t bad_write(struct file *filp, const char __user *buf,
                  size_t count, loff_t *f_pos)
{
    char *kbuf = kmalloc(count, GFP_KERNEL);  /* count is attacker-controlled */
    if (!kbuf)
        return -ENOMEM;
    if (copy_from_user(kbuf, buf, count)) {
        kfree(kbuf);
        return -EFAULT;
    }
    /* process kbuf ... */
    kfree(kbuf);
    return count;
}
```

If `count` is `SIZE_MAX` ($2^{64}-1$ on a 64-bit system), `kmalloc` internally adds header overhead, wraps around to a small value, and returns a small buffer. `copy_from_user` then copies `SIZE_MAX` bytes starting at that buffer, overwriting all subsequent kernel heap memory. This is a heap overflow triggered entirely from userspace with no kernel bug beyond the missing bounds check.

The fix is an explicit upper bound before any use of `count`:

```c
#define MAX_DEVICE_BUFFER  4096U

ssize_t safe_write(struct file *filp, const char __user *buf,
                   size_t count, loff_t *f_pos)
{
    if (count == 0)
        return 0;
    if (count > MAX_DEVICE_BUFFER)
        return -EINVAL;

    char *kbuf = kmalloc(count, GFP_KERNEL);
    if (!kbuf)
        return -ENOMEM;
    if (copy_from_user(kbuf, buf, count)) {
        kfree(kbuf);
        return -EFAULT;
    }
    /* process kbuf ... */
    kfree(kbuf);
    return count;
}
```

`copy_from_user` does more than a `memcpy`. It verifies the entire range `[buf, buf+count)` lies in the user address space and is accessible, generating `EFAULT` rather than a page fault if not. Directly dereferencing a `__user` pointer bypasses this check and is flagged by sparse as a type error.

For scalar `ioctl` arguments, `get_user` copies a single value with the same safety guarantees:

```c
long safe_ioctl(struct file *filp, unsigned int cmd, unsigned long arg)
{
    int val;

    switch (cmd) {
    case MY_IOCTL_SET_SPEED:
        if (get_user(val, (int __user *)arg))
            return -EFAULT;
        if (val < 0 || val > MAX_SPEED)
            return -EINVAL;
        dev->speed = val;
        return 0;

    default:
        return -ENOTTY;  /* "not a typewriter": command undefined on this fd */
    }
}
```

`-ENOTTY` is the correct response for an unrecognized command. `-EINVAL` means "the command is recognized but the argument is invalid." Returning `-EINVAL` for unknown commands misleads userspace into thinking the command exists but was called incorrectly.

For structures passed by pointer, `copy_from_user` copies the entire structure atomically from the user's perspective — but note that **the structure's contents are still attacker-controlled after the copy**. Individual fields must still be validated:

```c
struct my_config {
    uint32_t mode;
    uint32_t buffer_size;
    uint64_t flags;
};

long config_ioctl(struct file *filp, unsigned int cmd, unsigned long arg)
{
    struct my_config cfg;

    if (cmd != MY_IOCTL_SET_CONFIG)
        return -ENOTTY;
    if (copy_from_user(&cfg, (struct my_config __user *)arg, sizeof(cfg)))
        return -EF
