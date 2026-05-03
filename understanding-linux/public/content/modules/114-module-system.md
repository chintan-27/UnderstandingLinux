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

## Why This Matters

The kernel cannot ship with every possible driver compiled in — but the real constraint is subtler than image size. Modules solve *three distinct problems simultaneously*: they keep the kernel image small enough to fit in memory before the page allocator is initialized, they allow driver updates without rebooting, and they let hardware vendors ship binary drivers without GPL-mandated source disclosure (a consequence that kernel developers view with varying degrees of hostility). The price is that a module runs at ring 0 with full access to every kernel data structure. There is no MMU protection between a module and `init_task`. A use-after-free in a module corrupts kernel memory directly — no segfault, no signal handler, potentially no immediately visible symptom before a delayed panic. The module system's symbol export machinery, license checking, and taint flags exist precisely because of this asymmetry: the kernel must cooperate with code it cannot fully trust.

---

## Core Concepts

### What a `.ko` File Actually Is

A module is a relocatable ELF object — not a shared library, not a position-independent executable. It has type `ET_REL` in its ELF header (relocatable), not `ET_DYN`. It has no interpreter segment. It is incomplete by design: its undefined symbols are resolved not by `ld.so` at process startup but by the kernel's own module loader against the exported symbol table at `insmod` time.

The difference matters because a userspace shared library gets its own virtual address space mapping — the kernel can kill the process if it misbehaves. A `.ko` file is mapped directly into the kernel's virtual address space. On x86-64 this is in the module region, which sits between the kernel text and the vmalloc area:

$$\text{module region} \subset [\texttt{0xffffffffa0000000},\ \texttt{0xffffffffe0000000})$$

(exact bounds are configuration-dependent, but the region is intentionally close to the kernel text so that 32-bit-relative calls in the module's code can reach kernel functions without requiring large relocations).

### Init and Exit Hooks

The kernel cares about exactly two entry points at load/unload time:

```c
static int __init my_init(void) {
    pr_info("my_module: initializing\n");
    return 0; /* any nonzero value aborts loading and propagates as errno */
}

static void __exit my_exit(void) {
    /* must undo everything my_init did, in reverse order */
    /* not compiled into a monolithic kernel — unreachable code eliminated */
}

module_init(my_init);
module_exit(my_exit);
```

`__init` is not just advisory. The linker places `__init`-annotated functions in a separate ELF section (`.init.text`). After the module finishes initializing, the kernel frees that section's pages. The savings are small per module but cumulative across dozens of drivers. `__exit` is stripped entirely from a kernel built with `CONFIG_MODULES=n` because a module that cannot be unloaded has no cleanup path.

`module_init` and `module_exit` are macros that rename your functions to the magic symbols `init_module` and `cleanup_module` that the loader looks for. If you define two modules in one translation unit (don't), the second `module_init` call silently wins.

### Symbol Export and the Kernel Symbol Table

The exported symbol table is built at kernel link time and stored in two ELF sections of `vmlinux`: `__ksymtab` for non-GPL symbols and `__ksymtab_gpl` for GPL-only ones. Each entry is a `kernel_symbol` struct:

```c
struct kernel_symbol {
    unsigned long value;   /* address of the symbol */
    const char   *name;    /* null-terminated name string */
    const char   *namespace; /* optional namespace string, or NULL */
};
```

A kernel developer opts a symbol into one of these tables explicitly:

```c
EXPORT_SYMBOL(symbol_name);       /* any module may call this */
EXPORT_SYMBOL_GPL(symbol_name);   /* GPL-compatible modules only */
```

If a module's undefined symbol is not in either table, `insmod` refuses to load it — this is enforced by the module loader in `kernel/module/main.c`, not by the hardware or the ELF toolchain. The full table is visible at runtime:

```bash
# All exported symbols with their addresses and owning module:
cat /proc/kallsyms | grep ' T '   # exported text (function) symbols
cat /proc/kallsyms | grep '\[e1000\]'  # symbols from a specific module
```

`EXPORT_SYMBOL_GPL` enforcement is policy, not cryptography. The check is against `MODULE_LICENSE()`. A module that declares `MODULE_LICENSE("GPL")` while containing no GPL-compatible code is lying, but the kernel has no way to verify the claim — it trusts the declaration and checks the taint flag accordingly.

### Reference Counting and Safe Unload

The reference count is what makes `rmmod` safe. Any subsystem that holds a pointer into a module's code or data must increment the count for the duration:

```c
/* Caller must check return value — returns false if module is being removed */
if (!try_module_get(THIS_MODULE)) {
    return -ENODEV;
}

/* ... use the module ... */

module_put(THIS_MODULE);
```

If the reference count is nonzero when `rmmod` runs, the unload is refused with `EBUSY`. The count is not a safety net for careless code — it must be managed explicitly. A module that registers a callback (say, a network protocol handler) and forgets to increment its reference count can be unloaded while the callback is executing, producing a call into freed memory. The oops will appear unrelated to the unload, making it one of the harder module bugs to diagnose.

The current use count is visible:

```bash
lsmod | awk '$1 == "your_module" {print $3}'
# or
cat /sys/module/your_module/refcnt
```

### Taint

Taint is a bitmask in the global `tainted_mask` variable. Once a bit is set it stays set for the life of the running kernel. Reading it:

```bash
cat /proc/sys/kernel/tainted
```

The value is an integer; each bit encodes a specific condition. Selected bits defined in `include/linux/panic.h`:

| Bit | Value | Meaning |
|-----|-------|---------|
| 0 | `TAINT_PROPRIETARY_MODULE` | Non-GPL module loaded |
| 1 | `TAINT_FORCED_MODULE` | Module force-loaded (`insmod -f`) |
| 3 | `TAINT_FORCED_RMMOD` | Module force-removed |
| 4 | `TAINT_MACHINE_CHECK` | Machine check exception occurred |
| 12 | `TAINT_OUT_OF_TREE` | Out-of-tree module loaded |

To decode a taint value programmatically:

```bash
# The kernel ships a script for this:
linux-check-taint $(cat /proc/sys/kernel/tainted)

# Or decode manually — bit N is set if:
taint=$(cat /proc/sys/kernel/tainted)
for i in $(seq 0 17); do
    (( (taint >> i) & 1 )) && echo "bit $i set"
done
```

Taint does not prevent execution. It is a diagnostic signal to kernel developers: a tainted kernel oops report may reflect corruption introduced by a binary module that nobody can inspect. Upstream kernel developers formally decline to diagnose oopses from tainted kernels.

---

## How It Works

### The Build System

A module's `Kbuild` file has one meaningful line when building a single-file module:

```makefile
obj-m := fishing.o
```

For a multi-file module, list the constituent objects explicitly:

```makefile
obj-m := fishing.o
fishing-objs := fishing-main.o fishing-line.o fishing-hook.o
```

Out-of-tree builds require pointing `make` at the running kernel's build directory, because the module must be compiled against the exact headers and `autoconf.h` that describe the kernel it will be inserted into. Version skew here produces a `vermagic` mismatch and a load failure:

```bash
make -C /lib/modules/$(uname -r)/build M=$(pwd) modules
```

`/lib/modules/$(uname -r)/build` is a symlink to the configured kernel source (or header package). `M=$(pwd)` tells the kernel build system to build only the external module in the current directory.

The installed location mirrors the source tree. A module at `drivers/net/ethernet/intel/e1000/` in the source tree installs to:

```
/lib/modules/$(uname -r)/kernel/drivers/net/ethernet/intel/e1000/e1000.ko
```

After installation, `depmod` must regenerate the module dependency database:

```bash
make -C /lib/modules/$(uname -r)/build M=$(pwd) modules_install
depmod -A   # scan only for new/changed modules, faster than full rebuild
```

`depmod` reads the `.ko` files, inspects their `EXPORT_SYMBOL` declarations and `MODULE_IMPORT_NS` annotations, and writes dependency data to `/lib/modules/$(uname -r)/modules.dep` and the binary cache `modules.dep.bin`. `modprobe` reads these to resolve load order automatically.

### Module Parameters

Parameters are declared with a family of macros that register the variable with the parameter subsystem and, optionally, expose it under `/sys/module/<name>/parameters/`.

**Scalar parameter** — the common case:

```c
static int max_connections = 100;
module_param(max_connections, int, 0644);
MODULE_PARM_DESC(max_connections, "Maximum simultaneous connections (default 100)");
```

The third argument is the sysfs file permission mode. `0644` exposes the parameter at `/sys/module/<name>/parameters/max_connections` as readable by all and writable by root. Writing to this file at runtime changes the variable in place — the module sees the new value on next read, with no locking provided by the parameter system itself. If the module does not want runtime changes, pass `0` to suppress the sysfs entry.
