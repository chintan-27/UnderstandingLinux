---
id: 120
title: "Kernel configuration and build"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Why This Matters

The Linux kernel is a configurable system where thousands of features, drivers, and subsystems can be compiled in, compiled out, or built as loadable modules. The configuration system is what makes a single source tree produce a kernel for a laptop, a router, and an embedded sensor. Get it wrong and you ship a kernel that can't drive its own network card, wastes memory with drivers for absent hardware, or exposes attack surface through subsystems you never needed. The build system also determines whether a feature is permanently fused into the kernel image or lives as a `.ko` file — a distinction that directly affects boot time, memory footprint, and whether a driver can be updated without a reboot.

---

## Core Concepts

### Kconfig: The Configuration Language

Kconfig is a declarative language embedded throughout the kernel source tree. Every subsystem directory contains a `Kconfig` file describing the options that subsystem exposes, their types, dependencies, and defaults. The top-level `Kconfig` includes them all, forming a single dependency graph. When you run `make menuconfig`, the Kconfig parser reads this graph, enforces dependency constraints, and writes your choices to `.config`.

Every option becomes a C preprocessor symbol. `CONFIG_SMP=y` causes the build system to write `#define CONFIG_SMP 1` into `include/generated/autoconf.h`. Every `CONFIG_NET=m` causes `#define CONFIG_NET_MODULE 1`. Kernel C code gates features with `#ifdef CONFIG_SMP` — options you disable are preprocessed away before the compiler sees them, producing zero object code and zero binary footprint for excluded features. This is not link-time dead-code elimination; the code is gone before compilation.

The two primary option types are:

- `tristate` — can be `y` (built-in), `m` (module), or unset
- `bool` — can only be `y` or unset; `bool` options cannot produce modules because there is no separate compilation unit to load

Dependencies are declared with `depends on`. If `CONFIG_USB_STORAGE` declares `depends on USB`, then enabling `CONFIG_USB_STORAGE=m` when `CONFIG_USB=n` is impossible — the Kconfig solver rejects it. This matters in practice: disabling `CONFIG_NET` silently forces every network driver to unset, not just to `n`.

### The `.config` File

`.config` is the canonical record of a build's configuration — a flat key-value file where every kernel option appears in exactly one of three states:

```
CONFIG_SMP=y          # compiled into vmlinux
CONFIG_DRM=m          # compiled as a loadable module
# CONFIG_SOUND is not set   # excluded entirely
```

The comment form `# CONFIG_FOO is not set` is not cosmetic. Tools like `make oldconfig` and scripts that grep `.config` rely on this exact syntax to distinguish "explicitly disabled" from "not mentioned."

When upgrading between kernel versions, `make oldconfig` is the correct workflow: it reads your existing `.config`, silently preserves every option that still exists in the new tree, and prompts you only for options that are new. Running `make menuconfig` on an unfamiliar config risks accidentally toggling things; `make oldconfig` is surgical. A faster variant, `make olddefconfig`, accepts the default answer for every new option without prompting — useful in automated build pipelines.

You can also extract your running kernel's configuration (if `CONFIG_IKCONFIG_PROC=y` was set) directly:

```bash
zcat /proc/config.gz > .config
make olddefconfig
```

### Kbuild Makefiles

Every source directory contains a `Makefile` that uses Kbuild's specialized assignment syntax. The two load-bearing forms:

```makefile
obj-y   += foo.o      # link foo.c into vmlinux directly
obj-m   += bar.o      # compile bar.c as bar.ko
```

In practice these are almost never hardcoded. They are driven by configuration variables:

```makefile
obj-$(CONFIG_E1000) += e1000.o
```

When `CONFIG_E1000=y`, this expands to `obj-y += e1000.o`. When `CONFIG_E1000=m`, it expands to `obj-m += e1000.o`. When unset, it expands to `obj- += e1000.o`, which Kbuild ignores. This single substitution is the mechanism behind all conditional compilation in the kernel.

Multi-file modules require a compound object:

```makefile
obj-$(CONFIG_E1000)    += e1000.o
e1000-objs             := e1000_main.o e1000_hw.o e1000_ethtool.o
```

Kbuild compiles each listed `.c` file, links the resulting `.o` files into a single relocatable object, and produces `e1000.ko`.

### Built-in vs Module: What the Difference Actually Costs

A built-in feature (`=y`) is linked into `vmlinux`. Its `__init`-tagged initialization function runs during boot in the sequence controlled by `initcall` levels — `early_initcall`, `subsys_initcall`, `device_initcall`, and so on. After all initcalls complete, the kernel frees the memory occupied by `__init` code and `__initdata`. That memory is returned to the page allocator; it is gone. A driver's probe function that ran once and will never run again wastes nothing after boot.

A module (`=m`) is not loaded at boot unless something requests it — a `modprobe` call, a udev rule triggered by device enumeration, or an explicit `insmod`. Its `module_init()` function runs on insertion; its `module_exit()` function runs on removal. While loaded, the module occupies non-reclaimable kernel memory (it lives in the module region, not in the vmalloc area on most architectures). Removing it with `rmmod` frees that memory. This means that for a driver you need only once (say, during installation), a module is strictly better on running systems; for a driver your system always needs at boot, built-in avoids the latency and dependency on the initrd.

The constraint on choosing `=m`: a feature that *other built-in code calls at link time* cannot be a module. The linker resolves `vmlinux` as a single link step — it cannot leave a reference to a symbol that won't exist until `insmod` runs later. If `CONFIG_NETFILTER=y` and `CONFIG_NETFILTER_XT_MATCH_CONNTRACK` tries to be `=m`, the Kconfig dependency system should catch this, but badly written `Kconfig` files occasionally miss it, and you get a link error at `vmlinux` link time.

### Kernel Image Generation

After compilation the kernel exists as `vmlinux` — an uncompressed ELF binary with full symbol table. Most uses of the kernel require a compressed, architecture-specific boot image derived from it:

| File | Description |
|------|-------------|
| `vmlinux` | Uncompressed ELF; used for debugging with `gdb` or `crash` |
| `arch/x86/boot/bzImage` | Standard x86 boot image loaded by GRUB/systemd-boot |
| `arch/arm64/boot/Image` | Uncompressed AArch64 flat binary |
| `arch/arm64/boot/Image.gz` | Compressed AArch64 image |
| `arch/arm/boot/zImage` | Self-decompressing ARM image |
| `arch/arm/boot/uImage` | U-Boot wrapped image (prepended with 64-byte header) |

On x86, `make bzImage` appends a self-decompressing stub to a compressed `vmlinux`. GRUB loads the entire `bzImage` below 640 KB, the stub decompresses the kernel to its load address, and jumps to the kernel entry point. The symbol table is not present in `bzImage`; that is why you keep `vmlinux` around for post-mortem debugging.

The `uImage` format adds a 64-byte header that U-Boot reads to determine load address, entry point, compression type, and a CRC32 checksum:

$$\text{CRC32}(d) = \bigoplus_{i} \text{poly\_step}(d_i)$$

U-Boot verifies this before transferring control, which is why a corrupted `uImage` fails explicitly rather than silently jumping into garbage.

---

## How It Works

### Building an In-Tree Module

Suppose you are adding a driver for a device under `drivers/net/mydev/`. The source layout:

```
drivers/net/mydev/
    mydev.c
    mydev_hw.c
    Makefile
    Kconfig
```

`drivers/net/mydev/Kconfig`:

```kconfig
config MYDEV_NET
    tristate "MyDev virtual network driver"
    depends on NET && NETDEVICES
    select CRC32
    help
      Driver for the MyDev virtual network interface.
      If unsure, say N.
```

`select CRC32` means enabling `MYDEV_NET` automatically enables `CONFIG_CRC32`, because your driver calls `crc32_le()` from `lib/crc32.c`. Without `select`, that would be a hidden dependency causing a link error.

`drivers/net/mydev/Makefile`:

```makefile
obj-$(CONFIG_MYDEV_NET)  += mydev.o
mydev-objs               := mydev.c mydev_hw.c
```

You wire this into the parent `Kconfig` and `Makefile`:

```bash
# In drivers/net/Kconfig, add:
source "drivers/net/mydev/Kconfig"

# In drivers/net/Makefile, add:
obj-$(CONFIG_MYDEV_NET) += mydev/
```

Now `make menuconfig` finds your option under the network drivers menu, and `make modules` builds `mydev.ko` when `CONFIG_MYDEV_NET=m`.

### Building an Out-of-Tree Module

When your module lives outside the kernel source tree, you write a minimal `Makefile` in your module directory:

```makefile
# If KERNELRELEASE is defined, we were invoked from the kernel build system
ifneq ($(KERNELRELEASE),)
    obj-m := fishing.o
    fishing-objs := fishing_main.o fishing_reel.o

else
#
