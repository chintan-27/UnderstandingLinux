---
id: 101
title: "Kernel source tree organization"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Core Concepts  
The Linux kernel source tree is a deliberately partitioned hierarchy that mirrors the kernel’s functional decomposition and its portability requirements. Each top‑level directory groups code that shares a **common set of constraints** (e.g., same ISA, same resource type, same ABI). This partitioning serves three concrete purposes:

1. **Isolation of architecture‑specific details** – the `arch/` tree contains everything that varies with the underlying CPU (instruction set, MMU layout, interrupt controller, boot protocol). By keeping these files separate, the generic kernel code (`kernel/`, `mm/`, `fs/`, …) can be written once and compiled for any supported ISA simply by swapping the `arch/` subtree.  
2. **Encapsulation of subsystem responsibilities** – directories such as `mm/`, `fs/`, `net/`, `drivers/` each implement a well‑defined kernel subsystem with a clear interface (usually a set of header files in `include/`). This enables independent development, testing, and versioning of each subsystem.  
3. **Modular build system integration** – the recursive Makefile infrastructure descends into each directory, compiles only the objects needed for the current `.config`, and links them into either the monolithic `vmlinux` image or loadable `.ko` modules. The structure of the tree therefore directly drives the dependency graph that `make` evaluates.

Key directories and their *why*:

| Directory | Primary responsibility | Reason for separate placement |
|-----------|-----------------------|--------------------------------|
| `arch/` | ISA‑specific boot, MMU, SMP, exception handling | Portability: allows same generic kernel to target x86, ARM, RISC‑V, etc., without source changes |
| `include/` | Exported headers (`linux/*`, `asm/*`, `uapi/*`) | Provides a stable API for both kernel internal code and user‑space (via `libc`); keeping them central avoids duplicate definitions |
| `kernel/` | Core scheduling, synchronization, syscalls, power management | Houses the *behaviour* that is architecture‑neutral; changes here affect all ports |
| `mm/` | Page allocator, vm area management, swap, slab | Memory management is tightly coupled to hardware page size (`PAGE_SIZE`) and cache line layout, yet its algorithms are ISA‑independent |
| `fs/` | VFS layer, individual filesystem implementations (ext4, xfs, nfs, …) | VFS defines a uniform set of operations (`struct file_operations`); each FS can be plugged in without touching the VFS core |
| `net/` | Protocol stacks (IPv4/IPv6, TCP/UDP, netdevice framework) | Networking is layered; keeping protocols together simplifies correctness proofs and performance analysis |
| `drivers/` | Device drivers (platform, USB, PCI, GPIO, etc.) | Drivers are the most volatile part of the kernel; segregation limits the impact of a buggy driver on core kernel stability |
| `lib/` | Generic routines (string, hash, rbtrees, bitmap) | Code reused across subsystems; centralising avoids duplication and ensures a single source of truth for bugs |
| `scripts/` | Configuration (`kconfig`), build helpers (`modpost`, `signed`) | Isolates the meta‑build tooling from source code, making the build process reproducible across hosts |
| `Documentation/` | In‑tree documentation (DocBook, reST) | Keeps documentation version‑aligned with source; `make htmldocs` can generate up‑to‑date reference |

---

## How It Works  

### Build System Foundations  

The kernel uses **Kconfig** for configuration and a **recursive Makefile** hierarchy for compilation. The process can be broken down into four stages that are causally linked:

1. **Configuration** – Running `make menuconfig` (or `nconfig`, `xconfig`) invokes scripts in `scripts/kconfig/` which parse `Kconfig` files scattered throughout the tree. Each symbol’s dependencies are evaluated, producing a `.config` file that contains `CONFIG_XXX=y/m/n` entries.  
   *Why?* The kernel must be able to enable/disable subsystems at compile time to keep the image size minimal and to avoid pulling in code for unsupported hardware. The dependency graph guarantees that, e.g., selecting `CONFIG_X86_64` automatically forces `CONFIG_MMU=y`.  

2. **Dependency generation** – `make` descends into each directory, invoking the directory’s Makefile. The Makefile uses the `cc -M` flag (via `scripts/Makefile.lib`) to emit `.d` files listing the header files each `.c` source depends on. These `.d` files are included (`-include`) so that a change in a header triggers recompilation of all affected objects.  
   *Why?* Guarantees incremental builds are correct without manually tracking header changes—a critical property given the thousands of header files in `include/`.  

3. **Compilation** – Each `.c` is compiled to a `.o` with architecture‑specific flags (`-march`, `-mtune`, `-mabi`) pulled from the `arch/$(SRCARCH)/Makefile`. Object files are placed in `out/` (or `tmp/`) to keep the source tree clean.  
   *Why?* Separating build artifacts enables multiple parallel builds (`make -j$(nproc)`) and easy cleaning (`make mrproper`).  

4. **Linking** –  
   * **Monolithic image** – `vmlinux` is produced by linking all built-in objects (`*.o`) via `ld`. The linker script (`arch/$(SRCARCH)/kernel/vmlinux.lds`) places sections (`.text`, `.rodata`, `.data`, `.bss`) at specific virtual addresses respecting **page alignment** (`$$PAGE\_SIZE = 4096$$`) and **cache line alignment** (`$$64$$` bytes on most CPUs).  
   * **Modules** – Each subsystem’s objects that were built with `CONFIG_FOO=m` are linked into a separate `.ko`. The linker adds a `.modinfo` section containing version magic (`vermagic`) derived from `UTS_RELEASE` and `CONFIG_MODVERSIONS`.  

   *Why?* Proper alignment ensures the CPU can fetch instructions without crossing page boundaries, avoiding costly TLB misses. Module versioning prevents loading a module compiled against a different kernel ABI, which would cause undefined behavior.

### Applying Patches  

Patches are usually generated with `git format-patch` or `diff -u`. Applying them follows these steps:

```bash
# 1. Verify base commit matches the patch’s "From" line
git log --oneline -1  # should equal the patch’s parent commit
# 2. Apply with contextual fuzz tolerance (allows slight line shifts)
git apply --reject --whitespace=fix patch_file.patch
# 3. Inspect .rej files; resolve manually if any
```

*Why?* The kernel development model relies on a linear series of patches applied to a known base. Using `git apply` preserves author metadata and sign‑off chains, which are required for upstream submission. The `--reject` flag creates `.rej` files for hunks that cannot be applied automatically, making the failure mode explicit rather than silently corrupting source.

### Kernel Modules  

A module is a relocatable ELF object (`ET_REL`) that the kernel’s module loader (`/sbin/insmod` → `sys_init_module` syscall) maps into kernel space, resolves symbols against the exported symbol table (`/proc/kallsyms`), and applies **relocations** (e.g., `R_X86_64_PC32`).  

Key steps:

1. **Symbol versioning** – If `CONFIG_MODVERSIONS=y`, each exported symbol carries a checksum (`__crc_<symbol>`). The loader compares the module’s checksums against the running kernel’s; a mismatch yields `invalid module format`.  
2. **Dependency resolution** – `depmod` scans all `.ko` files, builds `modules.dep` listing which symbols each module needs, and writes `modules.alias` for automatic loading via `modprobe`.  
3. **Parameter handling** – Module parameters are declared with `module_param()`; at load time the kernel copies user‑space values into the module’s `.data` section, performing type checking (`uint`, `bool`, `invbool`).  

*Why?* These mechanisms keep the kernel **stable** despite dynamic code insertion: versioning guards against ABI drift, dependency tracking prevents unsatisfied symbols, and parameter validation avoids passing malformed data to privileged code.

---

## Worked Examples  

### Example 1: Building a Configured Kernel  

Assume we are on an x86_64 host with the kernel source at `/usr/src/linux`.

```bash
# 1. Clean any previous build
make mrproper

# 2. Generate a minimal config (all built‑in, no modules)
make allyesconfig   # enables every option that is not marked as "depends on EXPERIMENTAL"

# 3. Show the resulting configuration size
grep -c '^CONFIG_' .config   # → ~6200 symbols

# 4. Build with parallelism equal to number of logical CPUs
time make -j$(nproc)   # real time varies; on an 8‑core/16‑thread machine ~12‑15 min

# 5. Verify the produced image
ls -l vmlinux          # e.g., -rw-r--r-- 1 root root  125M Apr 20 10:00 vmlinux
size vmlinux           # text   data    bss    total
# Example output:
#   92,345,600   4,210,176   6,553,600  103,109,376
```

**Reasoning**:  
* `allyesconfig` maximises built‑in code, giving an upper bound on image size.  
* The `time` prefix lets us observe the scaling of the build with `-j`.  
* `size` breaks down the ELF sections; the **text** section (code) dominates (~90 MiB).  

If we instead wanted a stripped, modular build:

```bash
make defconfig          # default config for the host architecture
make -j$(nproc)         # builds core + modules
make modules_install    # installs /lib/modules/$(uname -r)/*
```

`make modules_install` copies each `.ko` to the appropriate directory and runs `depmod -A` to regenerate `modules.dep`.

### Example 2: Applying a Patch from the Mailing List  

Suppose we received a patch that fixes a race in the ext4 journal:

```bash
# 1. Ensure we are on the correct base (e.g., v6.8-rc1)
git checkout v6.8-rc1
git rev-parse HEAD   # should match the "From" line in the patch e.g., 8f3c2d1...

# 2. Apply the patch, allowing whitespace fixes
git apply --reject --whitespace=fix 0001-ext4-fix-journal-race.patch

# 3. Check for rejects
if [ -f *.rej ]; then
    echo "Patch applied with conflicts; inspect .rej files and resolve manually"
else
    echo "Patch applied cleanly"
fi

# 4. Verify the change (look at the modified function)
git diff ext4/jbd2/journal.c | grep -A5 -B5 '^+'
```

If a `.rej` appears, we manually edit the hunk, then `git add` the file and continue with `git am --continue` (if using `git am`) or simply commit after fixing.

### Example 3: Loading and Inspecting a Simple Kernel Module  

Create `hello.c`:

```c
#include <linux/init.h>
#include <linux/module.h>
#include <linux/printk.h>

static int __init hello_init(void)
{
    pr_info("Hello, world from %s\n", KBUILD_MODNAME);
    return 0;
}
static void __exit hello_exit(void)
{
    pr_info("Goodbye, world\n");
}
module_init(hello_init);
module_exit(hello_exit);
MODULE_LICENSE("GPL");
MODULE_AUTHOR("Student");
MODULE_DESCRIPTION("Minimal hello world module");
```

Build against the running kernel:

```bash
# 1. Ensure kernel headers match the running kernel
sudo apt-get install linux-headers-$(uname -r)   # Debian/Ubuntu
# 2. Compile
make -C /lib/modules/$(uname -r)/build M=$(pwd) modules
# 3. Load
sudo insmod hello.ko
# 4. Check kernel ring buffer
dmesg | tail -n 5
# Expected output:
# [  123.456789] Hello, world from hello
# 5. Verify loaded module
lsmod | grep hello
# 6. Unload
sudo rmmod hello
dmesg | tail -n 5
# Expected:
# [  124.001234] Goodbye, world
```

**Why this works**:  
* The Makefile invoked by the kernel build system knows the correct `CFLAGS` (`-DMODULE`, `-include linux/compiler.h`, etc.) and sets `KBUILD_MODNAME` to `hello`.  
* `insmod` calls `sys_init_module`, which copies the ELF object into kernel space, runs relocations, and executes the `init` function.  
* `dmesg` shows the output of `pr_info`, which logs to the kernel log buffer with `KERN_INFO` level.

---

## Common Mistakes  

| Mistake | What’s wrong | Why it fails |
|---------|--------------|--------------|
| **Building with `make -j$(($(nproc)*2))` on a low‑memory machine** | OOM killer terminates `cc1` processes, leading to missing object files and link errors. | The compiler spawns one translation unit per job; each needs ~50‑150 MiB of RAM for templates and intermediate files. Over‑subscribing exhausts RAM, causing the kernel to kill processes. |
| **Applying a patch generated against v6.6 to a v6.8 tree without rebasing** | Patch applies with many rejects or silently mis‑applies (e.g., hunks shifted by a few lines). | The line numbers and context differ; `patch`’s fuzz factor may still apply but to the wrong location, introducing bugs that are hard to trace. |
| **Loading a module whose `vermagic` does not match the running kernel** | `insmod: error inserting 'foo.ko': Invalid module format` | `vermagic` encodes GCC version, SMP, PAGE_SIZE, and `CONFIG_MODVERSIONS`. A mismatch means the module was compiled with a different ABI (different struct layout, different symbol versioning), leading to unresolved symbols or memory corruption. |
| **Skipping `depmod` after manually copying a `.ko` to `/lib/modules/`** | `modprobe foo` reports “module not found” even though the file exists. | `depmod` creates `modules.dep` (dependency map) and `modules.alias`. Without it, the module loader cannot locate the module nor its required symbols. |
| **Using `printk(KERN_INFO "…")` inside a hard‑irq context** | System may stall or watchdog triggers. | `printk` acquires locks and may sleep; in hard IRQs sleeping is forbidden. The proper primitive is `printk_ratelimited()` or deferring to a workqueue (`schedule_work()`). |

---

## Exercises  

### Easy  
1. **Tree Exploration** – List all subdirectories under `arch/` and identify which ones correspond to 64‑bit CPUs.  
   ```bash
   find arch -type d -maxdepth 1 | sort
   ```
2. **Header Lookup** – Find the definition of `struct task_struct`.  
   ```bash
   grep -r '^struct task_struct' include/
   ```
   (Answer: `include/linux/sched.h`)

### Medium  
3. **Configuration Impact** – Compare build time and image size between `make defconfig` and `make allyesconfig` on the same machine.  
   ```bash
   # defconfig
   make mrproper
   make defconfig
   time make -j$(nproc)
   size vmlinux > size_defconfig.txt
   # allyesconfig
   make mrproper
   make allyesconfig
   time make -j$(nproc)
   size vmlinux > size_allyesconfig.txt
   diff size_defconfig.txt size_allyesconfig.txt
   ```
   Report the percentage increase in text section size and the real‑time build difference.

4. **Patch Application** – Apply a patch that adds a new `sysctl` knob to `/proc/sys/vm/` (e.g., `vm.lru_cache_enabled`). Verify the knob appears after rebuild and boot.  
   *Steps*: obtain patch, `git apply`, `make olddefconfig`, rebuild, install, boot, `sysctl vm.lru_cache_enabled`.

### Hard  
5. **Write a Loadable Character Driver** – Implement a simple “echo” device that reads from a kernel buffer and writes back the same data.  
   *Requirements*:  
   - Implement `struct file_operations` with `read`, `write`, `open`, `release`.  
   - Use `cdev_init()` and `cdev_add()`.  
   - Export a sysfs attribute (`/sys/class/echo/buffer`) showing current buffer length.  
   - Provide a Makefile that builds against the running kernel (`make -C /lib/modules/$(uname -r)/build M=$(pwd) modules`).  
   - Test with `dd if=/dev/zero of=/dev/echo0 bs=1 count=64` and verify with `hexdump -C /dev/echo0`.  

6. **Performance Analysis** – Measure the overhead of a system call (`getpid()`) vs. a direct call to `vgetcpu()` (which reads a per‑CPU variable without entering the kernel).  
   ```c
   #include <stdio.h>
   #include <unistd.h>
   #include <sys/syscall.h>
   #define GETCPU_SYSCALL 318   // x86_64 __NR_getcpu
   int main() {
       unsigned long t0 = __rdtsc();
       for (int i=0; i<1000000; ++i) syscall(SYS_getpid);
       unsigned long t1 = __rdtsc();
       printf("getpid avg cycles: %lu\n", (t1-t0)/1000000);
       
       unsigned int cpu, node;
       t0 = __rdtsc();
       for (int i=0; i<1000000; ++i) syscall(GETCPU_SYSCALL, &cpu, &node, NULL);
       t1 = __rdtsc();
       printf("getcpu avg cycles: %lu\n", (t1-t0)/1000000);
   }
   ```
   Compile with `-O2 -march=native`, run, and explain the difference in terms of **trap overhead**, **context switch**, and **CPU‑local variable access**.

---

## Linux Connection  

The kernel source tree maps directly to the runtime interfaces you interact with on a typical Linux system.

| Source Directory | Runtime Manifestation | Example Command / File |
|------------------|----------------------|------------------------|
| `arch/x86/boot/` | Kernel image (`bzImage`, `vmlinuz`) used by the bootloader | `ls /boot/vmlinuz-*` |
| `kernel/sched/`  | Scheduler policy & data structures (`struct rq`, `task_struct`) | `cat /proc/sched_debug` |
| `mm/`            | Page allocator, slab, vm_area_struct | `cat /proc/meminfo` shows `MemTotal`, `Slab` |
| `fs/`            | VFS layer & filesystems (ext4, xfs, tmpfs) | `mount | grep ext4` shows mounted ext4 |
| `net/`           | Network stack (IPv4, TCP, netdevice) | `ss -tunap` lists TCP/UDP sockets |
| `drivers/`       | Device drivers (USB, PCI, platform) | `lspci -k` shows kernel driver in use per device |
| `lib/`           | Helper routines (e.g., `crc32`, `bitmap`) | Used internally; no direct user file |
| `include/linux/` | Public headers exported to user space via glibc | `#include <linux/fs.h>` when writing a FUSE filesystem |
| `scripts/`       | Build‑time tools (kconfig, modpost) | `scripts/config --enable CONFIG_DEBUG_INFO` |
| `Documentation/` | Admin & developer guides | `Documentation/admin-guide/sysctl/vm.rst` |

**Concrete interactions:**

* **Viewing kernel symbols** – `cat /proc/kallsyms | grep sys_call_table` shows the address of the system call table, which is built from `arch/x86/entry/syscalls/syscall_64.tbl` and linked into `vmlinux`.  
* **Tracing syscalls** – `strace -e trace=open,read,write ./a.out` relies on the kernel’s `tracepoint` subsystem (`include/trace/events/syscalls.h`) and the `debugfs` interface (`/sys/kernel/debug/tracing`).  
* **Adjusting scheduler parameters** – `echo 5 > /proc/sys/kernel/sched_migration_cost_ns` modifies a value defined in `kernel/sched/core.c` (`sysctl_sched_migration_cost_ns`).  
* **Inspecting memory zones** – `cat /proc/zoneinfo` reflects the zone structures (`struct zone`) defined in `mmzone.h` and populated during `mem_init()` in `mm/page_alloc.c`.  

These examples demonstrate that **every file or subsystem you see in the running kernel has a direct counterpart in the source tree**, and modifications to the source are reflected after a rebuild and reboot (or via module reload for dynamically loadable parts).

---

## Why This Matters  

Understanding the kernel source tree is not an academic exercise; it is the **foundational map** that lets you locate, modify, and verify the exact code responsible for any observable Linux behavior.  

* When you debug a system hang, you look at `kernel/sched/` and `kernel/locking/` because the scheduler and synchronization primitives are the usual culprits.  
* When you add a new device driver, you place it under `drivers/` and follow the existing patterns of `struct device_driver` and `struct file_operations` so that the driver integrates cleanly with the device model and the VFS/net/block layers.  
* When you tune performance, you adjust sysctls that are merely thin wrappers around variables defined in `mm/` or `net/`; knowing where those variables live lets you verify that your changes affect the intended data structures (e.g., increasing `vm.min_free_kbytes` changes `min_free_kbytes` in `mm/page_alloc.c`).  
* When you submit a patch upstream, you must respect the tree’s organization: architecture‑specific fixes go under `arch/`, generic algorithmic improvements under the relevant subsystem, and documentation under `Documentation/`. This ensures maintainers can review your change in the correct context and that future merges remain clean.  

In short, the source tree’s structure mirrors the kernel’s run‑time organization. By learning **why** each directory exists, **how** the build system turns those sources into a running kernel, and **what** concrete interfaces the kernel exposes to userspace and hardware, you gain the ability to navigate the kernel confidently, make targeted modifications, and predict the ripple effects of your changes. This mastery is the stepping stone to advanced kernel development, performance tuning, and reliable system administration.
