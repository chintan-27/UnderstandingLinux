---
id: 114
title: "Module system"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Core Concepts
### Loadable Modules
A loadable kernel module (LKM) is an ELF relocatable object (`*.ko`) that the kernel can map into its address space at runtime. Unlike a monolithic kernel image, modules let you add or remove functionality without rebooting, which is essential for device drivers, filesystems, and optional features that would otherwise bloat the base image. The kernel treats a module as a separate allocation in the **vmalloc** area, assigns it its own reference count, and links it into the global `modules` list.  
Why this matters from first principles: the kernel’s address space is limited by the virtual memory layout (typically 128 TB on x86_64). Mapping a module via `vmalloc` avoids fragmenting the **direct‑mapped** region (`PAGE_OFFSET` to `VMALLOC_START`) and lets the kernel unmap the memory cleanly when the module is removed.

### Symbol Export
Kernel symbols are made available to modules through the `__ksymtab` (and `__ksymtab_gpl`) ELF sections. The macro  
```c
EXPORT_SYMBOL(name);
```  
expands to two generated symbols:  
* `__ksymtab_name` – a `struct kernel_symbol { unsigned long value; const char *name; }` entry placed in `__ksymtab`  
* `__crc_name` – a 32‑bit CRC of the symbol’s prototype (used for module versioning when `CONFIG_MODVERSIONS` is enabled)  

When a module is loaded, the kernel’s linker walks its unresolved relocations, looks each symbol up in the kernel’s symbol table (`/proc/kallsyms` is a runtime view), and copies the address into the module’s relocation slots. If the symbol resides in `__ksymtab_gpl`, the loader checks the module’s **taint** state; a non‑GPL (proprietary) module will cause the symbol to be considered unsatisfied, leading to an “unknown symbol” error.

### Taint Basics
The kernel maintains a bitmap `unsigned long tainted;` (defined in `include/linux/kernel.h`). Bit 0 (`TAINT_PROPRIETARY_MODULE`) is set when a module with a license incompatible with GPL is loaded. Setting this bit has three concrete effects:  

1. **Warning** – the kernel prints a taint message to `dmesg`.  
2. **GPL‑only symbol restriction** – the module loader refuses to resolve any symbol whose `__ksymtab` entry resides in the `__ksymtab_gpl` section unless the module’s license is GPL‑compatible.  
3. **Debugging impact** – many debugging helpers (e.g., `lockdep`, `kmemleak`) are disabled or limited when the kernel is tainted, because proprietary code can invalidate their assumptions.  

The bitmap can be inspected via `/proc/sys/kernel/tainted`; each bit corresponds to a specific reason (see `man 7 taint`).  

---

## How It Works
### Loading a Module (`insmod` → `sys_init_module`)
1. **Permission check** – `capable(CAP_SYS_MODULE)` must hold; otherwise `-EPERM`.  
2. **Optional signature verification** – if `CONFIG_MODULE_SIG` is enabled, the kernel computes a SHA‑256 hash of the module and compares it to the embedded signature; failure aborts with `-ENOKEY`.  
3. **Memory allocation** – `module_alloc()` obtains contiguous virtual memory from the vmalloc area. The size requested is  
   $$
   M_{\text{size}} = \big\lceil\frac{S_{\text{text}}+S_{\text{rodata}}+S_{\text{data}}+S_{\text{bss}}}{\text{PAGE\_SIZE}}\big\rceil \times \text{PAGE\_SIZE}
   $$  
   where each `S_*` is the ELF section size obtained from the module’s program headers.  
4. **Section copy** – the kernel ELF‑loads each allocable section (`.text`, `.rodata`, `.data`, `.bss`) into the allocated region, zero‑filling `.bss`.  
5. **Relocation processing** – for each relocation entry (type depends on architecture, e.g., `R_X86_64_RELATIVE` on x86_64) the kernel computes  
   $$
   \text{addr} = \text{base} + \text{addend}
   $$  
   and writes the result back to the location specified by the relocation.  
6. **Symbol resolution** – the kernel walks the module’s undefined symbol table, looks each name up in `kallsyms` (which aggregates `__ksymtab` from the core and all loaded modules), and patches the relocation with the found address. If the symbol is GPL‑only and the module is tainted, the lookup fails.  
7. **Init execution** – the kernel calls the function pointed to by the module’s `init` entry (marked `__init`). After execution, the `__init` section may be freed to recover memory.  
8. **List insertion** – the module’s `struct module` is linked into the global `modules` list and its refcount is set to 1.  

### Unloading a Module (`rmmod` → `sys_delete_module`)
1. **Reference‑count check** – if `module->refcnt != 0`, unloading is denied (`-EBUSY`).  
2. **Stop** – the kernel calls the module’s `exit` function (`__exit`).  
3. **List removal** – the module’s `struct module` is unlinked from `modules`.  
4. **Memory release** – the vmalloc area occupied by the module is returned via `vfree()`.  
5. **Optional trace** – if `CONFIG_TRACING` is enabled, a trace event records the unload.  

---

## Worked Examples
### Example 1: Building and Loading a “hello‑world” Module
**Source (`hello.c`)**  
```c
#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/init.h>

static int __init hello_init(void)
{
    pr_info("Hello, world: %s\n", THIS_MODULE->name);
    return 0;
}

static void __exit hello_exit(void)
{
    pr_info("Goodbye, %s\n", THIS_MODULE->name);
}

module_init(hello_init);
module_exit(hello_exit);
MODULE_LICENSE("GPL");
MODULE_AUTHOR("Student");
MODULE_DESCRIPTION("Simple hello world LKM");
```

**Makefile**  
```make
obj-m += hello.o
all:
	make -C /lib/modules/$(shell uname -r)/build M=$(PWD) clean
	make -C /lib/modules/$(shell uname -r)/build M=$(PWD) modules
```

**Build**  
```bash
$ make
```

Assume the build produces `hello.ko` of size 12 KiB, with sections:  
`.text` = 2 KiB, `.rodata` = 0.5 KiB, `.data` = 0.2 KiB, `.bss` = 0.1 KiB.  
Page size on x86_64 = 4096 B →  
$$
M_{\text{pages}} = \big\lceil\frac{2048+512+200+100}{4096}\big\rceil = 1
$$  
so the kernel allocates a single 4 KiB vmalloc page (the ELF loader actually rounds up to the next page‑multiple, giving 4 KiB for the raw image; the remainder is left unused).

**Load**  
```bash
$ sudo insmod hello.ko
$ dmesg | tail -5
[  123.456789] Hello, world: hello
```
Check the module list:  
```bash
$ lsmod | grep hello
hello                 16384  0 - Live 0xffffffffc0123000
```
The address `0xffffffffc0123000` lies in the vmalloc region (`VMALLOC_START` … `VMALLOC_END`).  

**Unload**  
```bash
$ sudo rmmod hello
$ dmesg | tail -2
[  124.001234] Goodbye, hello
```
After removal, `lsmod` no longer shows `hello`, and the vmalloc page is returned to the free list.

### Example 2: Exporting and Using a Symbol Between Modules
**Module A (`provider.c`) – exports a helper**
```c
#include <linux/module.h>
#include <linux/kernel.h>

static int add_two(int a, int b)
{
    return a + b;
}
EXPORT_SYMBOL(add_two);          /* puts entry in __ksymtab */
MODULE_LICENSE("GPL");
```

**Module B (`consumer.c`) – uses the exported symbol**
```c
#include <linux/module.h>
#include <linux/kernel.h>
extern int add_two(int, int);    /* prototype matches exported symbol */

static int __init consumer_init(void)
{
    pr_info("5 + 7 = %d\n", add_two(5, 7));
    return 0;
}
static void __exit consumer_exit(void) {}
module_init(consumer_init);
module_exit(consumer_exit);
MODULE_LICENSE("GPL");
```

**Build both** (`make -C /lib/modules/$(uname -r)/build M=$PWD modules`).  

**Load order matters**  
```bash
$ sudo insmod provider.ko
$ sudo insmod consumer.ko
$ dmesg | tail -2
[  200.111111] 5 + 7 = 12
```
**What happens under the hood**  
* `provider.ko`’s `__ksymtab` contains `{ .value = (unsigned long)&add_two, .name = "add_two" }`.  
* When `consumer.ko` is loaded, its relocation table holds an undefined reference to `add_two`. The kernel’s lookup routine scans `kallsyms`, finds the entry from `provider.ko`, reads the `value` field, and writes that address into the consumer’s call site.  
* If `provider.ko` were built with `MODULE_LICENSE("Proprietary")`, the kernel would set the taint bit, and because `add_two` is exported with plain `EXPORT_SYMBOL` (not `EXPORT_SYMBOL_GPL`), the consumer would still load; however, had the symbol been `EXPORT_SYMBOL_GPL`, the load would fail with “unknown symbol add_two”.

### Example 3: Tainting with a Proprietary Module
**Proprietary module (`vmblock.c`)** – mimics a out‑of‑tree driver  
```c
#include <linux/module.h>
#include <linux/kernel.h>

static int __init vmblock_init(void)
{
    pr_info("VMware block driver loaded\n");
    return 0;
}
static void __exit vmblock_exit(void) { pr_info("VMware block driver unloaded\n"); }

module_init(vmblock_init);
module_exit(vmblock_exit);
MODULE_LICENSE("Proprietary");
```

**Load**  
```bash
$ sudo insmod vmblock.ko
$ dmesg | tail -2
[  300.555555] VMware block driver loaded
[  300.555560] tainted: Proprietary module loaded
```
**Check taint**  
```bash
$ cat /proc/sys/kernel/tainted
1   /* bit 0 set */
```
**Attempt to use a GPL‑only symbol** (e.g., call `schedule_timeout` which is exported as `EXPORT_SYMBOL_GPL`)  
```c
/* inside vmblock.c */
extern void schedule_timeout(unsigned long); /* GPL‑only */
static int __init bad_init(void)
{
    schedule_timeout(1);   /* will cause unresolved symbol */
    return 0;
}
```
Re‑building and loading now yields:  
```bash
$ sudo insmod vmblock.ko
[  310.123456] vmblock: Unknown symbol schedule_timeout (err -2)
```
The loader refuses to resolve `schedule_timeout` because the symbol resides in `__ksymtab_gpl` and the module’s taint state indicates a proprietary license.

---

## Common Mistakes
### Mistake 1 – Omitting or Mis‑specifying `MODULE_LICENSE`
**What’s wrong:** A module without an explicit license defaults to “unspecified”, which the kernel treats as proprietary for taint purposes. If `CONFIG_MODULE_SIG_FORCE` is set, the kernel will also reject the module because it cannot verify a signature.  
**Why it matters:** The license flag determines whether the kernel sets the taint bit and whether GPL‑only symbols are accessible. Missing it leads to unexpected taint warnings or hard load failures.

### Mistake 2 – Assuming `static inline` Functions Are Exported
**What’s wrong:** Declaring a helper as `static inline` in a header and then trying to call it from another module results in an “unknown symbol” error at load time.  
**Why it matters:** `static inline` emits the function body only where it is inlined; if not inlined, the compiler discards the definition, leaving no external symbol. The kernel’s symbol table never sees it, so other modules cannot resolve it.

### Mistake 3 – Forgetting to Increment Module Reference Count in File Operations
**What’s wrong:** A module that implements a character device but does not call `try_module_get(THIS_MODULE)` in its `open` method (or neglects `module_put` in `release`) can be unmounted while a file descriptor remains open, leading to use‑after‑free and kernel oops.  
**Why it matters:** The module’s lifetime is governed by its reference count; user‑space holds a reference via the file descriptor. Not bumping the count breaks this coupling, violating the invariant that the module stays loaded as long as any of its resources are in use.

### Mistake 4 – Skipping `depmod` After Building New Modules
**What’s wrong:** After compiling a new `.ko`, running `insmod` may succeed, but `modprobe` (used by higher‑level tools like `udev`) will fail to resolve dependencies because the module dependency map (`modules.dep`) is stale.  
**Why it matters:** `depmod` scans `/lib/modules/$(uname -r)/` and writes `modules.dep` and `modules.softdep`. Tools that automatically load hardware‑specific drivers rely on this map; an out‑of‑date map causes missing‑symbol errors seemingly unrelated to the module you just built.

---

## Exercises
### Easy
1. **Load a pre‑built module**  
   ```bash
   $ sudo modprobe dummy   # dummy.ko ships with most distros
   $ lsmod | grep dummy
   $ dmesg | tail -2
   ```
   Verify that the module appears in `lsmod` and that a “dummy” message is in the kernel log.

2. **Check current taint state**  
   ```bash
   $ cat /proc/sys/kernel/tainted
   $ sudo modprobe vmblock   # if you have a proprietary module handy
   $ cat /proc/sys/kernel/taint
   ```

### Medium
3. **Create a symbol‑exporting pair**  
   - Write `provider.c` exporting `int mul_three(int x) { return x*3; }`.  
   - Write `consumer.c` that calls `mul_three` and prints the result.  
   - Build both, load `provider.ko` then `consumer.ko`, and confirm the output in `dmesg`.  
   - Attempt to load `consumer.ko` **before** `provider.ko` and observe the failure; explain why the symbol is unresolved.

4. **Measure module memory footprint**  
   - Build a simple module (`memtest.ko`) with known section sizes (you can adjust by adding large arrays).  
   - After loading, run:  
     ```bash
     $ sudo cat /proc/vmallocinfo | grep memtest
     ```  
   - Compare the reported size with the theoretical page count from the formula in *How It Works*.

### Hard
5. **Proprietary module vs. GPL‑only symbol**  
   - Write a proprietary module (`bad.ko`) that attempts to call `schedule_timeout` (exported as `EXPORT_SYMBOL_GPL`).  
   - Load it and capture the error.  
   - Change the license to `GPL` and reload; verify that the call succeeds (you may need to add a wrapper that prints the timeout value).  
   - Explain, in terms of taint and symbol sections, why the license change resolves the issue.

6. **Dynamic dependency handling with `modprobe`**  
   - Create two modules: `dep_a.ko` (no dependencies) and `dep_b.ko` that contains an unresolved reference to a symbol exported by `dep_a.ko`.  
   - Run `depmod -a` to generate the dependency map.  
   - Load `dep_b.ko` with `modprobe dep_b.ko` and watch it automatically pull in `dep_a.ko`.  
   - Then remove the `modules.dep` file and repeat; observe the failure and explain the role of the dependency map.

---

## Linux Connection
The Linux kernel exposes module management through a well‑defined set of interfaces and filesystems:

| Interface / File | Purpose | Example Command |
|------------------|---------|-----------------|
| `/proc/modules`  | List of loaded modules with refcount and memory address | `cat /proc/modules` |
| `/sys/module/<name>/` | Runtime attributes (parameters, refcnt, sections) | `ls /sys/module/ext4/` |
| `/proc/kallsyms` | Kernel symbol table (including exported module symbols) | `grep -w my_func /proc/kallsyms` |
| `/proc/sys/kernel/tainted` | Taint bitmap (see `man 7 taint`) | `cat /proc/sys/kernel/tainted` |
| `/lib
