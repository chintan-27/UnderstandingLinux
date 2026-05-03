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

## Why This Matters

Every time a process calls `read()`, the CPU changes privilege level, the kernel validates arguments it cannot trust, and control returns to user space — all in a few hundred nanoseconds. The kernel's internal structure determines whether that transition is safe, fast, and correct. This is not an academic concern: the boundary between user space and kernel space is what prevents process A from writing into process B's page tables, and what prevents a userland bug from silencing an interrupt handler mid-execution. Understanding the structure means understanding why these guarantees hold and where they can break.

## Core Concepts

### The Monolithic Design

Linux is a **monolithic kernel**: all subsystems run in a single privileged address space. The scheduler can call the memory manager with a direct function call. The VFS can reach a block driver with no serialization. There is no privilege transition between subsystems because there are no subsystem boundaries at the hardware level — just one ring-0 address space.

The alternative is a **microkernel**: each subsystem runs as an isolated user-space server, and subsystems communicate via IPC. The isolation benefit is real — a crashing driver cannot corrupt the scheduler — but every cross-subsystem operation pays a context switch and a copy. Mach and L4 are microkernels. Linux is not, and the decision was deliberate: driver-to-filesystem calls happen millions of times per second on a busy system.

The cost is also real: a bug in a driver has write access to every kernel data structure. This is not hypothetical; it is the reason nearly all Linux privilege escalation exploits target drivers or kernel modules.

### Kernel Modules

Monolithic does not mean static. Linux loads **kernel modules** (`.ko` files) at runtime by linking them directly into the kernel's address space. After loading, a call from module code to `printk` or `kmalloc` is a direct `call` instruction with a resolved address — identical to what statically compiled kernel code does. There is no IPC, no indirection, no privilege transition.

The module system recovers microkernel-style flexibility without microkernel overhead: a Wi-Fi driver that nobody uses costs nothing until loaded, and a driver that crashes can be removed without rebooting (if the rest of the kernel is still coherent enough to do so).

### Subsystems and Internal APIs

The kernel is divided into **subsystems**, each owning a domain and exposing a defined internal API:

| Subsystem | Kernel source path | Core internal interface |
|---|---|---|
| Process Scheduler | `kernel/sched/` | `schedule()`, `wake_up_process()` |
| Memory Manager | `mm/` | `alloc_pages()`, `vmalloc()`, `handle_mm_fault()` |
| VFS | `fs/` | `struct file_operations`, `struct inode_operations` |
| Network Stack | `net/` | `struct sk_buff`, `netif_rx()` |
| Device Drivers | `drivers/` | `struct device`, bus-specific probe callbacks |
| Interrupt Subsystem | `kernel/irq/` | `request_irq()`, `irq_desc` table |

The VFS enforces its abstraction through function pointers. When the kernel calls `file->f_op->read()`, it does not know or care whether the backing implementation is in `fs/ext4/`, `fs/tmpfs/`, or a FUSE driver. This is runtime polymorphism without C++ — just a struct of function pointers.

```c
/* From include/linux/fs.h — the interface every filesystem must implement */
struct file_operations {
    ssize_t (*read)  (struct file *, char __user *, size_t, loff_t *);
    ssize_t (*write) (struct file *, const char __user *, size_t, loff_t *);
    int     (*open)  (struct inode *, struct file *);
    int     (*release)(struct inode *, struct file *);
    /* ... ~30 more function pointers ... */
};
```

Any driver or filesystem that populates this struct becomes accessible through the same `read(2)` / `write(2)` syscalls that work on regular files.

### The Syscall Boundary

User-space code cannot call kernel functions by address — the kernel's virtual address range is present in every process's page table but marked non-executable and inaccessible at user privilege. The **system call interface** is the only controlled gate.

A syscall is a hardware trap, not a function call. On x86-64, the `syscall` instruction atomically:

1. Saves `%rip` and `%rflags` into MSRs (`IA32_LSTAR`, `IA32_FMASK`)
2. Loads the kernel-mode `%rsp` from the per-CPU TSS
3. Transfers control to the address in `IA32_LSTAR` — the kernel's syscall entry point

The kernel validates every pointer argument before dereferencing it. A user-space address passed to `read()` could be unmapped, could point to kernel memory, or could be concurrently unmapped by another thread. The `copy_from_user()` / `copy_to_user()` functions perform this validation — they fault safely if the address is invalid rather than oopsing the kernel.

### The Three Execution Contexts

At any instant a CPU is in exactly one of three states:

| Context | Privilege | Has `task_struct`? | Can sleep? |
|---|---|---|---|
| User space | Ring 3 | Yes | Yes |
| Kernel, process context | Ring 0 | Yes | Yes |
| Kernel, interrupt context | Ring 0 | No | **No** |

The "cannot sleep in interrupt context" rule is not a style convention. `schedule()` saves the current task's state and switches stacks. In interrupt context there is no task — no `struct task_struct`, no associated kernel stack. Calling `schedule()` from an interrupt handler would leave the scheduler with nothing to save and nothing to return to. The constraint is a structural consequence of the design.

## How It Works

### Syscall Dispatch

The C library's `read()` wrapper places the syscall number in `%rax` (for `read`, that is `0` on x86-64), places arguments in `%rdi`, `%rsi`, `%rdx`, and executes `syscall`. The kernel entry point reads `%rax` and indexes into `sys_call_table`:

```c
/* arch/x86/entry/syscall_64.c — the actual table declaration */
asmlinkage const sys_call_ptr_t sys_call_table[__NR_syscall_max+1] = {
    [0 ... __NR_syscall_max] = &__x64_sys_ni_syscall,
    [__NR_read]  = &__x64_sys_read,   /* slot 0 */
    [__NR_write] = &__x64_sys_write,  /* slot 1 */
    [__NR_open]  = &__x64_sys_open,   /* slot 2 */
    /* ... */
};
```

The dispatch is $O(1)$: the syscall number is an index, not a key in a lookup structure. The table has 256–350 populated entries on a typical x86-64 kernel.

The total wall-clock cost of a null syscall (one that immediately returns) has two components:

$$T_{\text{syscall}} = T_{\text{entry}} + T_{\text{handler}} + T_{\text{exit}}$$

where $T_{\text{entry}}$ and $T_{\text{exit}}$ each include register save/restore, page-table switching (if KPTI is enabled), and speculation barrier instructions. On a modern x86-64 with KPTI enabled, $T_{\text{entry}} + T_{\text{exit}} \approx 100\text{–}300\,\text{ns}$ even for a handler that does nothing. KPTI — Kernel Page Table Isolation, the Meltdown mitigation — doubles this cost by requiring a CR3 write on each transition.

### Module Linking

When `insmod` loads a `.ko` file, the kernel executes a runtime link step:

1. Reads the ELF `.ko` and allocates physically contiguous memory in the module region (`MODULES_VADDR` to `MODULES_END`, a 1 GiB window near the kernel on x86-64)
2. Applies ELF relocations — patches every `R_X86_64_PC32` or `R_X86_64_PLT32` relocation with the actual address of the target symbol
3. Resolves symbols against the kernel's exported symbol table (`__ksymtab` section), failing if any required symbol is not exported
4. Calls `module->init()`

After step 2, a call from module code to `kmalloc` is a `callq 0xffffffff81234567` — a direct call with a 32-bit PC-relative offset baked in. There is no PLT, no dynamic linker, no vtable. The module is structurally indistinguishable from statically compiled kernel code at the instruction level.

A minimal compilable module:

```c
// my_module.c
#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/init.h>

static int __init my_init(void)
{
    printk(KERN_INFO "my_module: loaded, kernel text at %px\n",
           (void *)my_init);
    return 0;  /* non-zero aborts load */
}

static void __exit my_exit(void)
{
    printk(KERN_INFO "my_module: unloaded\n");
}

module_init(my_init);
module_exit(my_exit);
MODULE_LICENSE("GPL");
MODULE_DESCRIPTION("Minimal example");
```

The `__init` annotation places `my_init` in the `.init.text` ELF section. After the init function returns, the kernel frees that section's pages. The same applies to `__initdata`. This is not cosmetic — on a system with many built-in drivers, `__init` reclaims several hundred kilobytes at boot.

### Interrupt Context and the Top/Bottom Half Split

Because interrupt handlers cannot sleep, any interrupt-triggered work that might block must be deferred. Linux provides three deferral mechanisms, in increasing order of flexibility:

| Mechanism |
