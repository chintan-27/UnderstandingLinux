---
id: 100
title: "Kernel high-level structure"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Core Concepts
### Monolithic Kernel with Dynamic Extensibility
The Linux kernel is a **monolithic** design: all core services (process scheduling, memory management, filesystem, device drivers, networking) execute in the same privileged address space and share data structures directly. This eliminates message‑passing overhead but raises concerns about size and fault isolation. To retain flexibility without sacrificing performance, Linux provides **kernel modules**—object files (`*.ko`) that can be linked into the running kernel via the module loader (`insmod`/`rmmod`). A module runs at **CPL 0** (kernel mode) with full access to kernel symbols, yet it can be loaded/unloaded without reboot, allowing hardware support, filesystems, or schedulers to be added on demand.

### Subsystem Decomposition
Despite the monolithic image, the source is deliberately partitioned into loosely coupled subsystems, each owning a well‑defined set of data structures and invariants:

| Subsystem | Primary Responsibility | Key Data Structures |
|-----------|------------------------|---------------------|
| **Scheduler** (`kernel/sched/`) | CPU time allocation, load balancing, preemption | `struct task_struct`, `struct rq`, `sched_class` |
| **Memory Manager** (`mm/`) | Virtual memory, page allocation, swap, kmalloc/vmalloc | `struct mm_struct`, `struct vm_area_struct`, `struct page` |
| **Virtual Filesystem (VFS)** (`fs/`) | Uniform namespace for all filesystems, dentry/inode caches | `struct inode`, `struct dentry`, `struct super_block` |
| **Device Drivers** (`drivers/`) | Hardware abstraction, interrupt handling, DMA | `struct device`, `struct file_operations`, `struct usb_driver` |
| **IPC** (`ipc/`) | SysV msg/sem/shm, POSIX queues | `struct msg_queue`, `struct sem_array` |
| **Network** (`net/`) | Packet processing, socket layers, protocols | `struct sock`, `struct sk_buff`, `struct net_device` |

Each subsystem enforces its own locking discipline (spinlocks, mutexes, rw-semaphores, RCU) to guarantee correctness under preemption and SMP.

### System‑Call Boundary
The **syscall boundary** is the sole controlled transition from user mode (CPL 3) to kernel mode (CPL 0). On x86‑64 it is invoked via the `syscall` instruction, which:

1. Saves user‑space `RIP`, `RFLAGS`, `RCX`, `R11` into kernel‑mode MSRs (`STAR`, `LSTAR`, `FKSMASK`, `CFG`).
2. Loads kernel `RIP` from `LSTAR` (entry point `entry_SYSCALL_64`).
3. Switches stack to the per‑CPU kernel stack (`% rsp` → `per_cpu(__irq_stack_ptr, cpu)`).
4. Masks interrupts according to `FKSMASK` (typically clears `IF`).

The entry point then:

* Saves all general‑purpose registers on the kernel stack (`pt_regs` struct).
* Extracts the syscall number from `regs->ax`.
* Validates the number against `NR_syscalls` (currently 442 on x86‑64).
* Dispatches via `sys_call_table[regs->ax]`.
* After the subsystem routine returns, restores registers and executes `sysretq` to resume user mode.

Because the transition is synchronous and deterministic, the kernel can guarantee that any user request is mediated by a single, auditable entry point.

---

## How It Works
### From User Request to Kernel Service
Consider a generic system call `sys_foo(arg1, arg2)`. The end‑to‑end flow is:

1. **User‑space invocation**  
   ```asm
   mov     eax, __NR_foo          ; syscall number
   mov     edi, arg1              ; first arg in rdi
   mov     esi, arg2              ; second arg in rsi
   syscall                        ; trap to kernel
   ```
   The CPU performs the steps described above, switching to kernel mode and loading `entry_SYSCALL_64`.

2. **Register saving & pt_regs construction**  
   In `entry_SYSCALL_64` (arch/x86/entry/entry_64.S):
   ```asm
   push    rbp
   push    rbx
   /* … save all regs … */
   mov     pt_regs_ax(%rsp), eax   ; store syscall number
   ```
   The `pt_regs` struct now mirrors the user‑space register state.

3. **Syscall number validation**  
   ```c
   if (unlikely(regs->ax >= NR_syscalls))
       return sys_ni_syscall(regs);   /* returns -ENOSYS */
   ```
   This check prevents out‑of‑bounds table access.

4. **Dispatch via sys_call_table**  
   ```c
   nr = regs->ax;
   ret = sys_call_table[nr](regs);   /* indirect call */
   ```
   The table is defined in `arch/x86/entry/syscalls/syscall_64.tbl` and linked at compile time; its address is exported as `sys_call_table`.

5. **Subsystem execution**  
   The target routine (e.g., `sys_fork`) performs:
   * Argument copying from `pt_regs` to local variables.
   * Validation (e.g., checking flags, permissions via `cred` struct).
   * Invocation of internal helper functions (e.g., `copy_process()` for fork).
   * Interaction with the relevant subsystem (scheduler, mm, fs, etc.).
   * Return of an integer (`long`) result in `eax`.

6. **Exit to user mode**  
   ```c
   /* in __syscall_return */
   sysretq
   ```
   The CPU restores `RIP`, `RFLAGS`, `RCX`, `R11` from the saved MSRs and resumes execution at the instruction after `syscall`.

### Performance Model
A first‑order latency model for a syscall is:

$$
T_{\text{syscall}} = T_{\text{enter}} + T_{\text{dispatch}} + T_{\text{subsys}} + T_{\text{exit}}
$$

* `T_enter` ≈ 120 cycles (register save, stack switch, MSR loads)  
* `T_dispatch` ≈ 30 cycles (bounds check, table lookup, indirect call)  
* `T_subsys` varies:  
  * Simple `getpid` → ~200 cycles (mostly field access)  
  * `fork` (copy‑on‑write) → ~1500–3000 cycles (page‑table duplication, `task_struct` allocation)  
  * `read` from cached file → ~500–800 cycles (VFS lookup, page cache hit)  
* `T_exit` ≈ 80 cycles (register restore, `sysretq`)

On a 3 GHz core, a `getpid` syscall costs ≈0.5 µs, while a `fork` costs ≈0.8–1.5 µs plus any page‑fault overhead from subsequent COT.

Memory‑layout math: the kernel occupies the **upper half** of the 48‑bit virtual address space. On x86‑64:

$$
\text{PAGE\_OFFSET} = 0xffff\_ffff\_8000\_0000
$$

A physical address `phys` is mapped to kernel virtual address:

$$
v = \text{PAGE\_OFFSET} + \text{phys}
$$

Thus, a page frame at `0x0000_0000_0010_0000` appears at `0xffff_ffff_8010_0000`.

---

## Worked Examples
### Example 1: `fork()` – Process Creation
**Goal:** Show how a user request becomes a new `task_struct`, COW page‑table duplication, and scheduler enqueue.

**Step‑by‑step (x86‑64):**

1. **User invocation**  
   ```c
   pid_t pid = fork();    /* glibc wrapper → syscall */
   ```
   The wrapper loads `__NR_fork` (= 57) into `eax` and executes `syscall`.

2. **Kernel entry** – as described in *How It Works*.

3. **`sys_fork`** (`kernel/fork.c`):
   ```c
   SYSCALL_DEFINE0(fork)
   {
       return do_fork(SIGCHLD, 0, 0, NULL, NULL);
   }
   ```

4. **`do_fork`**:
   * Allocates a new `struct task_struct` via `alloc_task_struct_node()` (slab cache).
   * Duplicates the parent’s `mm_struct` but marks all VMAs as `VM_COW` (`copy_mm()`).
   * For each VMA, increments the `mm_users` counter; the actual page tables are **not** copied yet.
   * Copies kernel stack, thread_info, and TLS.
   * Sets `child->state = TASK_RUNNING` and enqueues on the parent’s runqueue via `wake_up_new_task()`.
   * Returns child’s PID to parent, 0 to child.

5. **Copy‑On‑Write fault** (first write by either process):
   * Page fault handler (`do_page_fault`) sees a present‑but‑read‑only PTE.
   * Allocates a new physical page (`alloc_page_vma`), copies contents, updates PTE to writable.
   * Cost: one extra page allocation + memcpy (~4 KB) ≈ 2000 cycles.

**Numbers (typical Intel i7‑12700K, Linux 6.6):**
| Operation | Approx. Cycles | Approx. Time |
|-----------|----------------|--------------|
| `task_struct` allocation | 300 | 0.1 µs |
| `mm_struct` dup + VMA walk | 500 | 0.17 µs |
| Page‑table walk (no copy) | 200 | 0.07 µs |
| Enqueue + wakeup | 250 | 0.08 µs |
| **Total fork entry** | **≈1250** | **≈0.42 µs** |
| First COW fault (per page) | ≈2000 | 0.67 µs |

Thus, creating a process with a 2 MB stack (512 pages) costs ~0.42 µs + (pages actually dirtied)×0.67 µs. If only the stack top page is touched, latency ≈1.1 µs.

**Code snippet (kernel side):**
```c
/* kernel/fork.c */
static long do_fork(unsigned long clone_flags,
                    unsigned long stack_start,
                    unsigned long stack_size,
                    int __user *parent_tidptr,
                    int __user *child_tidptr)
{
    struct task_struct *p;
    int retval;

    p = copy_process(clone_flags, stack_start, stack_size,
                     parent_tidptr, child_tidptr);
    if (IS_ERR(p))
        return PTR_ERR(p);

    retval = wake_up_new_task(p);
    if (retval)
        retval = PTR_ERR(p);
    else
        retval = p->pid;

    return retval;
}
```

### Example 2: Loading a Kernel Module (`insmod`)
**Goal:** Demonstrate ELF loading, symbol resolution, and module initialization.

1. **User command**
   ```bash
   sudo insmod hello.ko
   ```
   `insmod` reads the ELF file, extracts the `.modinfo` section, and issues the `init_module` syscall (`__NR_init_module` = 175).

2. **`sys_init_module`** (`kernel/module.c`):
   * Copies the module image from user space (`copy_from_user`).
   * Verifies ELF magic, section headers.
   * Calls `load_module()` which:
     * Allocates vmalloc space for core and init sections.
     * Relocates references (`apply_relocations`).
     * Resolves symbols against the kernel’s symbol table (`kallsyms`) and any already‑loaded modules (`find_symbol`).
     * Marks the module state `MODULE_STATE_COMING`.

3. **Execution of init function**:
   * The loader locates the `module_init` callback (via `__attribute__((section(".init.text")))`).
   * Calls it; typical module prints via `printk`:
     ```c
     static int __init hello_init(void)
     {
         pr_info("Hello, world %s\n", THIS_MODULE->name);
         return 0;
     }
     static void __exit hello_exit(void)
     {
         pr_info("Goodbye, %s\n", THIS_MODULE->name);
     }
     module_init(hello_init);
     module_exit(hello_exit);
     ```
   * `printk` writes to the log buffer (`log_buf`) and wakes `klogd`/`journald`.

4. **Cleanup on rmmod**:
   * Calls `delete_module` syscall → `module_put()` → calls the `__exit` function, frees vmalloc memory, removes from `modules` list.

**Run‑time inspection:**
```bash
# Show loaded modules
lsmod | grep hello
# See init call address
modinfo hello.ko | grep ^vermagic
# Dump kernel symbols related to the module
grep hello /proc/kallsyms
```

**Performance note:** Relocation of a typical 30 KB module takes ~150 µs on an SSD‑backed system, dominated by `vmalloc` page table updates.

### Example 3: `read()` from a Regular File
**Goal:** Trace VFS, page cache, and disk I/O.

1. **User call**
   ```c
   ssize_t n = fd = open("data.bin", O_RDONLY);
   char buf[4096];
   n = read(fd, buf, sizeof buf);
   ```

2. **`sys_read`** (`fs/read_write.c`):
   * Calls `vfs_read(fd, buf, count, ppos)`.

3. **VFS layer**:
   * Retrieves `struct file *f` from fd table.
   * Calls `f->f_op->read` (usually `generic_file_read_iter`).

4. **Page cache lookup**:
   * `filemap_fault` finds the page for the requested offset via `find_get_page()`.
   * If present, increments page count, copies data via `kmap_atomic`/`memcpy_toiovec`.
   * If absent, triggers `readahead` and schedules disk read.

5. **Disk I/O** (if miss):
   * The block device driver’s `request_fn` (e.g., `sd` driver) builds a `struct request`.
   * The I/O scheduler (CFQ, BFQ, or none) merges and orders requests.
   * The low‑level driver issues DMA; completion interrupt triggers `end_io`.

6. **Return**: copies up to `count` bytes to user buffer, updates `f->f_pos`, returns byte count.

**Latency breakdown (SSD, 4 KiB read, cache hit):**
| Stage | Approx. Time |
|-------|--------------|
| VFS lookup + fd table | 0.2 µs |
| Page cache hit (find_get_page) | 0.3 µs |
| kmap + memcpy | 0.5 µs |
| **Total** | **≈1.0 µs** |

If a miss requires a 4 KiB SSD read (~50 µs) plus scheduler overhead (~5 µs), total ≈55 µs.

**Kernel snippet:**
```c
/* fs/read_write.c */
ssize_t vfs_read(struct file *file, char __user *buf,
                 size_t count, loff_t *ppos)
{
    if (!file->f_op->read)
        return -EINVAL;
    return file->f_op->read(file, buf, count, ppos);
}

/* fs/read_write.c (generic) */
ssize_t generic_file_read_iter(struct kiocb *iocb,
                               struct iov_iter *iter)
{
    struct address_space *mapping = file_inode(file)->i_mapping;
    return generic_perform_read(iter, file->f_pos, mapping);
}
```

---

## Common Mistakes
| # | Misconception | Why It’s Wrong | Correct Understanding |
|---|---------------|----------------|-----------------------|
| 1 | “The kernel is a single monolithic block; you cannot change anything without recompiling.” | Ignores the **module subsystem** which links object files at runtime, resolves symbols against `kallsyms`, and can invoke `init`/`exit` functions. | Kernel core is monolithic for performance, but modules provide **dynamic extensibility** without reboot. |
| 2 | “System calls are the only way user space talks to the kernel.” | Overlooks **/proc**, **sysfs**, **debugfs**, **netlink sockets**, and **ioctl** on device nodes, which are also kernel‑mediated interfaces. | Syscalls are the *primary* controlled entry; other interfaces exist for configuration, diagnostics, and device‑specific control. |
| 3 | “Kernel modules run in user space.” | Modules are loaded into kernel virtual address space and execute at CPL 0; they can call any kernel function and cause a panic if buggy. | Modules are **kernel‑mode** code; they share the same privilege as the core kernel. |
| 4 | “File operations bypass the VFS and go straight to the underlying filesystem.” | The VFS layer provides **namespace unification**, dentry/inode caches, and permission checks; all file ops flow through `struct file_operations` pointers set by the VFS. | Every `open`, `read`, `write`, etc., first hits the VFS, which then delegates to the specific filesystem’s `->f_op`. |
| 5 | “Because the kernel is preemptible, locks are unnecessary.” | Preemption only allows the scheduler to interrupt a task; **data races** still exist on shared structures (e.g., `task_struct`, page tables). | Preemptible kernel **requires** fine‑grained locking (spinlocks, mutexes, RCU) to protect concurrent access. |
| 6 | “`fork()` copies the entire parent memory space immediately.” | Linux uses **copy‑on‑write**; physical pages are shared until a write triggers a page‑fault‑driven copy. | `fork()` duplicates page tables (read‑only) and increments page counts; actual memory copy occurs lazily on first write. |
| 7 | “All kernel code runs with the same stack size.” | Each process has its own **kernel stack** (typically 8 KB on x86‑64) stored in `thread_info`; interrupt contexts use separate **per‑CPU IRQ stacks**. | Kernel stack size is fixed per task; deep recursion or large local variables can cause stack overflow → `oops`. |

---

## Exercises
### Easy
1. **Hello‑world module**  
   Write a module that prints “Hello, LKM!” on load and “Goodbye!” on unload using `pr_info`.  
   *Compile:* `make -C /lib/modules/$(uname -r)/build M=$PWD modules`  
   *Load:* `sudo insmod hello.ko`  
   *Verify:* `dmesg | tail -n 5`

2. **Straight‑forward syscall tracing**  
   Use `strace -e trace=open,read,write ./a.out` to observe the syscalls made by a simple program that reads a file and prints its length.

### Moderate
3. **Add a custom syscall**  
   * Implement a syscall `sys_helloworld(const char __user *msg)` that copies the string from user space (max 128 bytes) and prints it via `pr_info`.  
   * Add an entry to `arch/x86/entry/syscalls/syscall_64.tbl`:  
     ```
     442 common  helloworld          sys_helloworld
     ```  
   * Recompile the kernel (or use `kprobe`/`ftrace` to intercept an existing syscall for demonstration).  
   * Test with a small C program invoking `syscall(442, "test")`.

4. **Simple character device**  
   Implement a misc device that returns a monotonically increasing counter on each read.  
   * Define `struct file_operations { .read = counter_read, .owner = THIS_MODULE };`
   * Register via `misc_register(&counter_device)`.  
   * Verify with `dd if=/dev/counter of=/dev/null bs=1 count=10`.

### Challenging
5. **Implement a round‑robin scheduler class**  
   * Clone `kernel/sched/fair.c` into a new file `rr.c`.  
   * Implement `pick_next_task_rr()` that selects the next runnable task in a simple FIFO queue, ignoring VRUNTIME.  
   * Register the class with `sched_register_class(&rr_sched_class)`.  
   * Boot with `sched=rr` kernel parameter and verify via `chrt -r 0 ping -c 5 localhost` that all tasks get equal time slices.

6. **Mini‑filesystem using tmpfs as a base**  
   * Create a new filesystem type `simplefs` that stores all data in a single page‑cache backed inode (i.e., no actual block device).  
   * Implement the `simplefs_mount`, `simplefs_fill_super`, and the `inode_operations`/`file_operations` stubs that just route to `generic_file_*`.  
   * Mount with `mount -t simplefs none /mnt/simple` and run `dd if=/dev/zero of=/mnt/simple/file bs=1M count=1`.  
   * Check that memory usage grows as shown by `cat /proc/meminfo`.

---

## Linux Connection
### Real Subsystems and Source Locations
| Subsystem | Source Directory | Key Header |
|-----------|------------------|------------|
| Scheduler | `kernel/sched/` | `<linux/sched.h>` |
| Memory Manager | `mm/` | `<linux/mm.h>` |
| VFS | `fs/` | `<linux/fs.h>` |
| Block Layer | `block/` | `<linux/blkdev.h>` |
| Network Core | `net/` | `<linux/net.h>` |
| Device Drivers (example: USB) | `drivers/usb/` | `<linux/usb.h>` |
| Module Loader | `kernel/module.c` | `<linux/module.h>` |
| Syscall Table (x86‑64) | `arch/x86/entry/syscalls/sys
