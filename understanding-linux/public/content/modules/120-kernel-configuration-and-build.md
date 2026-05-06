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

## Core Concepts
### Kernel Configuration as a Boolean Satisfiability Problem
The Linux kernel source is annotated with **Kconfig** symbols that represent configurable features. Each symbol can be **bool**, **tristate** ( *y*, *m*, *n* ), or have a **hex/string** value. Symbols are related by logical constraints:
- `depends on <expr>` – the symbol can be *y* only if `<expr>` evaluates to true.
- `select <sym>` – forces `<sym>` to *y* when the current symbol is *y* (used sparingly to avoid hidden dependencies).
- `implies <sym>` – similar to `select` but respects the dependent symbol’s own dependencies.

These constraints form a directed implication graph. A valid `.config` file is a **model** that assigns each symbol a value satisfying all constraints. The configuration tools (`menuconfig`, `nconfig`, `xconfig`) perform a SAT‑like search: they start with defaults, propagate implications, and backtrack when a conflict is detected.

### Kconfig Language Primitives
```kconfig
config NET_ETHERNET
        bool "Ethernet driver support"
        depends on NET
        ---help---
          Enable support for Ethernet cards.

config NET_ETHERNET_E1000
        tristate "Intel PRO/1000 Gigabit Ethernet support"
        depends on NET_ETHERNET && PCI
        select CRC32
        ---help---
          Driver for Intel e1000e hardware.
```
- `bool` yields `CONFIG_NET_ETHERNET=y` or `=n`.
- `tristate` yields `=y` (built‑in), `=m` (module), or `=n` (omitted).
- The `depends on` clause is evaluated **after** all symbols in the expression have been assigned; if false, the symbol is forced to `n`.
- `select` creates a **forward implication** that may override a user’s explicit `n` (hence discouraged for user‑visible options).

### Makefile Recursion and Phases
The top‑level `Makefile` does not contain compilation rules for every source file. Instead, it performs a **recursive descent**:
1. **Setup** – reads `ARCH`, `CROSS_COMPILE`, and includes `scripts/Kbuild.include`.
2. **Configuration** – if `.config` is missing or outdated, runs `scripts/kconfig/conf` to regenerate it.
3. **Build preparation** – generates `autoconf.h` and `utsrelease.h` from `.config`.
4. **Descend** – invokes `make` in subdirectories (`arch/$(ARCH)/`, `init/`, `drivers/`, …) each with its own `Makefile` that knows which objects to compile based on `obj-y` and `obj-m` lists.
5. **Linking** – collects all `*.o` files into `vmlinux` (built‑in image) and creates `bzImage` (compressed bootable image) via `scripts/kallsyms` and `objcopy`.

The dependency graph is expressed in each `Makefile` with lines such as:
```make
obj-$(CONFIG_NET_ETHERNET_E1000) += e1000e.o
```
If `CONFIG_NET_ETHERNET_E1000` evaluates to `y`, `e1000e.o` goes into `obj-y` (linked into `vmlinux`); if it evaluates to `m`, it goes into `obj-m` (built as a loadable module); if `n`, the object is omitted.

### Modules vs. Built‑in: ELF Layout and Loading
A **built‑in** driver’s code resides in the kernel’s static image (`vmlinux`). Its symbols are resolved at link time; the kernel can call it directly via a function pointer.

A **module** is a relocatable ELF object (`*.ko`) with additional sections:
- `.modinfo` – contains ASCII tags like `vermagic=...` and `description=...`.
- `.gnu.linkonce.this_module` – holds a `struct module` that the kernel registers.
- `.rodata.str1.1` – strings for module parameters.

Loading a module involves:
1. **`sys_init_module`** (deprecated) or **`sys_finit_module`** (since 3.8) – copies the ELF image into kernel space, resolves symbols against the kernel’s export table (`__ksymtab`), and applies relocations.
2. **`module_layout`** verification – checks the `vermagic` string against the running kernel’s `Utsrelease` and compiler version; a mismatch triggers an “invalid module format” error.
3. **Execution of the module’s init function** (`module_init`) – registers callbacks (e.g., `pci_register_driver`).

Unloading runs the exit function (`module_exit`) and frees memory; the kernel ensures no references remain via a reference count (`module.refcnt`).

### Why the Two‑Tier Model Matters
- **Built‑in** code incurs **zero runtime overhead** for symbol resolution and cannot be removed without reboot.
- **Modules** enable **hot‑plugging** of hardware support, reduce the memory footprint of the base kernel, and allow third‑party vendors to distribute drivers without exposing source (though they must still obey GPL for symbols they use).

---

## How It Works
### Step‑by‑Step Flow from `.config` to Bootable Image
1. **Invoking the configurator**  
   ```bash
   make menuconfig          # launches ncurses UI
   # or
   make nconfig             # newer UI with symbol search
   # or
   make xconfig             # Qt-based GUI
   ```
   The tool reads `Kconfig` files, evaluates defaults, and writes `.config`.

2. **Generating header files**  
   The kernel’s build system runs:
   ```bash
   scripts/kconfig/conf --silentoldconfig Kconfig
   ```
   which produces:
   - `include/generated/autoconf.h` – `#define CONFIG_<SYMBOL> 1/0` for bools/tristates.
   - `include/generated/utsrelease.h` – defines `UTS_RELEASE` string used by `uname -r`.

3. **Compiling object files**  
   For each subsystem `Makefile`:
   ```make
   # Example from drivers/net/ethernet/intel/Makefile
   obj-$(CONFIG_NET_ETHERNET_E1000) += e1000e.o
   ```
   The pattern `obj-$(CONFIG_*)` expands to either `obj-y`, `obj-m`, or is dropped.  
   The compile command (simplified) is:
   ```bash
   $(CC) $(CFLAGS) -c -o e1000e.o e1000e.c
   ```
   where `CFLAGS` includes `-DCONFIG_NET_ETHERNET_E1000=1` (or `0`/`2` for tristate).

4. **Linking built‑in objects**  
   The top‑level link step:
   ```bash
   ld -pseudo-reloc -e __start_kernel -T scripts/linker.lds \
        built-in.o init/main.o ... -o vmlinux
   ```
   `vmlinux` is an ELF executable; its size can be inspected:
   ```bash
   size vmlinux
   ```

5. **Creating the bootable image**  
   For x86:
   ```bash
   objcopy -O binary -R .note -R .comment -S vmlinux vmlinux.bin
   gzip -9 < vmlinux.bin > vmlinuz
   cp scripts/syslinux/mboot.c32 .
   ./scripts/bin2pe/bootsect.pl vmlinuz > bootsect.bin
   cat bootsect.bin vmlinuz > bzImage
   ```
   `bzImage` is the file placed in `/boot`.

6. **Building modules**  
   ```bash
   make modules          # compiles all obj-m targets
   make modules_install  # copies *.ko to /lib/modules/$(KERNELRELEASE)/
   depmod -a             # generates modules.dep and map files
   ```

7. **Installing the kernel** (distribution‑specific)  
   ```bash
   sudo make install     # runs distro‑specific installkernel script
   ```
   Typically copies `bzImage` to `/boot/vmlinuz-$(KERNELRELEASE)`, updates initramfs, and adjusts the bootloader (GRUB).

### Mathematical Model of Build Time
Let:
- `S` = total number of source lines compiled (≈ 20 × 10⁶ for a full kernel).
- `t_c` = average compile time per line (including preprocessing, optimization) ≈ 0.5 µs on a modern Xeon core.
- `N` = number of parallel jobs (`make -jN`).

Assuming perfect scaling and ignoring I/O:
$$
T_{\text{compile}} \approx \frac{S \cdot t_c}{N}
$$
For `S = 2·10⁷`, `t_c = 0.5·10⁻⁶ s`, `N = 8`:
$$
T_{\text{compile}} \approx \frac{2·10⁷·0.5·10⁻⁶}{8} = 1.25\text{ s}
$$
In practice, linking, header processing, and serialization increase the observed time to **10–30 min** on an 8‑core machine, which aligns with empirical measurements.

---

## Worked Examples
### Example 1: Building a Custom Kernel with the Intel e1000e Driver (Module)
**Goal:** Produce a kernel where `e1000e` is loadable as a module, then load/unload it.

#### Step‑by‑step
1. **Obtain source** (assume version 6.6):
   ```bash
   cd /usr/src
   wget https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.6.tar.xz
   tar -xf linux-6.6.tar.xz
   cd linux-6.6
   ```
2. **Start configuration** – we begin from the distro’s default config to avoid missing essential options:
   ```bash
   cp /boot/config-$(uname -r) .config   # seed with running kernel’s config
   make olddefconfig                     # set new symbols to their defaults
   ```
3. **Enable the driver as a module**:
   ```bash
   make menuconfig
   # Navigate: Device Drivers → Network device support → Ethernet driver support
   #         → Intel(R) PRO/1000 Gigabit Ethernet support
   # Press <M> to build as a module
   # Save and exit
   ```
   The resulting `.config` now contains:
   ```
   CONFIG_NET_ETHERNET_E1000=m
   ```
4. **Compile** (using all available cores):
   ```bash
   make -j$(nproc)          # builds vmlinux and modules
   ```
   Expected output (truncated):
   ```
   LD      vmlinux
   ...
   Building modules, stage 2.
   MODPOST 12 modules
   ```
5. **Install modules**:
   ```bash
   sudo make modules_install
   # Creates /lib/modules/6.6.0-custom/extra/e1000e.ko (if EXTRAVERSION set)
   ```
6. **Update dependency map**:
   ```bash
   sudo depmod -a
   ```
7. **Load the module**:
   ```bash
   sudo modprobe e1000e
   # Verify:
   lsmod | grep e1000e
   # Should show e1000e  XXXXX 0 - Live 0xffffffffc1234000
   ```
8. **Unload**:
   ```bash
   sudo modprobe -r e1000e
   lsmod | grep e1000e   # should return nothing
   ```

**Why this works:**  
- The `obj-$(CONFIG_NET_ETHERNET_E1000m) += e1000e.o` line places `e1000e.o` in `obj-m`.  
- `make modules` compiles it to `e1000e.ko` with appropriate `-DMODULE` flag.  
- `modprobe` reads `/lib/modules/6.6.0-custom/modules.dep` to find the file, calls `finit_module`, and the kernel’s module loader verifies `vermagic` (`6.6.0-custom SMP mod_unload modversions`).

### Example 2: Minimal Kernel Build (All Built‑in, No Modules)
**Goal:** Produce the smallest possible bootable image for testing.

```bash
make mrproper                     # clean tree
make allnoconfig                  # set all symbols to n
# Enable only essentials:
scripts/config -e CONFIG_INITRAMFS_SOURCE=""   # no initramfs
scripts/config -e CONFIG_BLK_DEV_INITRD=y      # allow empty initrd
scripts/config -e CONFIG_EXPERT=y              # expose low-level options
scripts/config -e CONFIG_MODULES=n             # disable modules entirely
scripts/config -e CONFIG_DEFAULT_HOSTNAME="(none)"
make -j$(nproc) bzImage
```
The resulting `bzImage` is typically **≈ 3 MB** (vs. ~10 MB for a generic distro kernel).  
Boot it in QEMU:
```bash
qemu-system-x86_64 -kernel arch/x86/boot/bzImage -append "console=ttyS0" -nographic
```
You should see a kernel panic about “no init found”, confirming the kernel loaded but userspace is absent—proof the build succeeded.

### Example 3: Cross‑Compiling for ARMv7 (e.g., Raspberry Pi 2)
```bash
export ARCH=arm
export CROSS_COMPILE=arm-linux-gnueabihf-
make bcm2709_defconfig          # Raspberry Pi 2 default
# Enable a specific driver, e.g., USB Ethernet:
make menuconfig
# Device Drivers → USB support → USB Ethernet Gadget
# Save
make -j$(nproc) zImage dtbs
# Install modules to a temporary rootfs:
mkdir -p /tmp/rpiroot
make INSTALL_MOD_PATH=/tmp/rpiroot modules_install
# Copy kernel and dtbs to the boot partition:
sudo cp arch/arm/boot/zImage /boot/
sudo cp arch/arm/boot/dts/bcm2709-rpi-2-b.dtb /boot/
```
The `CROSS_COMPILE` prefix changes the invoked toolchain (`arm-linux-gnueabihf-gcc`, etc.). The build time scales similarly; on an 8‑core x86_64 host, a full ARM kernel builds in ~12 min.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Running `make` after editing `.config` without running `make olddefconfig` or `make silentoldconfig`** | New Kconfig symbols retain their *default* values, which may be `n` when you intended `y` (or vice‑versa). The kernel will lack features you thought you enabled. | After any manual edit, run `make olddefconfig` to propagate defaults for new symbols, **or** re‑run the configurator (`make menuconfig`) to validate. |
| 2 | **Building modules with `make -jN` but forgetting `make modules_install`** | The `.ko` files stay in the source tree; `modprobe` cannot find them, leading to “module not found” errors despite a successful build. | Always follow `make modules` with `make modules_install` (or use the `INSTALL_MOD_PATH` override) and then run `depmod -a`. |
| 3 | **Loading a module compiled for a different kernel version (vermagic mismatch)** | The kernel checks `vermagic` (includes release string, SMP, mod_unload, etc.). A mismatch triggers `invalid module format: vermagic mismatch`. | Ensure the module is built against the exact kernel source tree (`/lib/modules/$(uname -r)/build`) or set `KERNELRELEASE` consistently. Use `modinfo -F vermagic <module>.ko` to verify. |
| 4 | **Disabling `CONFIG_MODULES` while still trying to load modules** | With `CONFIG_MODULES=n`, the kernel omits all module‑related infrastructure (`sys_finit_module`, `module` struct). Any `modprobe` attempt fails with “Operation not permitted”. | Either keep `CONFIG_MODULES=y` (default) or build all needed drivers statically (`=y`). |
| 5 | **Building with `CONFIG_DEBUG_INFO=y` on a production system** | Debug info adds ~30–50 MB to `vmlinux` and `.ko` files, increasing load time and memory consumption; it also leaks kernel symbols that can aid attackers. | Use `CONFIG_DEBUG_INFO=y` only for debugging or profiling; strip with `make INSTALL_MOD_STRIP=y` or manually run `strip --strip-debug` on modules. |

---

## Exercises
### Easy
1. **Inspect the running kernel’s configuration**  
   ```bash
   zcat /proc/config.gz | grep -E 'CONFIG_EXT4_FS|CONFIG_NET_ETHERNET'
   ```
   Explain what each line tells you about the current kernel.

2. **List all currently loaded modules and their dependencies**  
   ```bash
   lsmod
   sudo modprobe --show-depends ext4
   ```

### Medium
3. **Build a kernel with a single built‑in driver (e.g., `e1000e`) and verify it is present in `vmlinux`**  
   - Configure `CONFIG_NET_ETHERNET_E1000=y`, all other network drivers as `n`.  
   - Build: `make -j$(nproc) bzImage`.  
   - Check: `nm vmlinux | grep e1000e`. The symbol should appear with a `T` (text) address, not `U` (undefined).

4. **Create a simple “hello world” kernel module, insert it, and view its kernel log**  
   ```c
   /* hello.c */
   #include <linux/module.h>
   #include <linux/kernel.h>
   static int __init hello_init(void)
   {
       pr_info("Hello, world!\n");
       return 0;
   }
   static void __exit hello_exit(void)
   {
       pr_info("Goodbye, world!\n");
   }
   module_init(hello_init);
   module_exit(hello_exit);
   MODULE_LICENSE("GPL");
   ```
   Build:
   ```bash
   make -C /lib/modules/$(uname -r)/build M=$(pwd) modules
   sudo insmod hello.ko
   dmesg | tail -n 5
   sudo rmmod hello
   dmesg | tail -n 5
   ```

### Hard
5. **Cross‑compile a minimal kernel for ARMv8 (aarch64) that includes only `CONFIG_SERIAL_EARLYCON=y` and `CONFIG_CMDLINE="console=ttyAMA0,115200"`**  
   - Set up `aarch64-linux-gnu-` toolchain.  
   - Run `make ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- defconfig`.  
   - Use `scripts/config` to enable the two options and disable everything else (`make allyesconfig` then manually turn off).  
   - Build `Image` and DTBs.  
   - Test in QEMU:  
     ```bash
     qemu-system-aarch64 -M virt -cpu cortex-a57 -nographic \
         -kernel arch/arm64/boot/Image \
         -drive if=none,format=raw,file=rootfs.img,id=root \
         -device virtio-blk-device,drive=root \
         -append "console=ttyAMA0,115200 root=/dev/vda"
     ```
   - Confirm the early console appears before any userspace init.

6. **Automate kernel configuration validation**  
   Write a small script that, given a `.config`, uses `scripts/kconfig/conf --checkconfig` to detect unsatisfied dependencies and prints a report. Run it on a random `allyesconfig` and on a minimal `allnoconfig`+selected options to ensure no hidden `select`/`implies` conflicts.

---

## Linux Connection
**.:filesystem:** Kernel configuration sources live in the source tree under `scripts/kconfig/` and architecture‑specific `Kconfig` files (e.g., `arch/x86/Kconfig`). The generated `.config` is conventionally placed in the root of the kernel tree and also exposed to userspace via:
- `/proc/config.gz` (if `CONFIG_IKCONFIG_PROC=y`) – a gzipped copy of the running kernel’s `.config`.
- `/boot/config-$(uname -r)` – the config used to build the distro kernel (kept by package managers).

**.:tools:**  
| Tool | Purpose | Invocation Example |
|------|---------|--------------------|
| `make menuconfig` | ncurses‑based configurator | `make menuconfig` |
| `make nconfig` | newer ncurses with search | `make nconfig` |
| `make xconfig` | Qt‑based GUI | `make xconfig` |
| `scripts/config` | non‑interactive set/get of symbols | `scripts/config -e CONFIG_DEBUG_INFO` |
| `modprobe` | load/unload modules with dependency resolution | `sudo modprobe -v ib_core` |
| `insmod` / `rmmod` | low‑level load/unload (no depmod) | `sudo insmod ./mydrv.ko` |
| `depmod` | generate `modules.dep` and symbol maps | `sudo depmod -a` |
| `mkinitramfs` | create initrd image that loads root‑fs modules | `sudo mkinitramfs -o /boot/initrd.img-$(uname -r) $(uname -r)` |
| `dracut` | alternative initrd generator (Fedora/openSUSE) | `sudo dracut -f` |

**.:kernel objects:**  
- **Built‑in image:** `vmlinux` (ELF) → `arch/$(ARCH)/boot/bzImage` (compressed bootable).  
- **Modules:** `*.ko` files placed under `/lib/modules/$(KERNELRELEASE)/kernel/`.  
- **Symbol versions:** `/lib/modules/$(KERNELRELEASE)/modules.symbols` and `modules.symbols.bin` used by `modprobe` for modversion checking.  
- **udev rules:** `/lib/udev/rules.d/60-block.rules` etc., rely on `MODULE_ALIAS` strings embedded in each `.ko` to auto‑load drivers for detected hardware.

**Real‑world subsystem paths (examples):**  
- Networking core: `net/` – contains `core/dev.c`, `ipv4/`, `ipv6/`.  
- Block layer: `block/` – `blk-core.c`, `blk-mq/`.  
- SCSI subsystem: `drivers/scsi/` – `scsi_mod.o`, `sd.o`.  
- USB: `drivers/usb/` – `core/`, `host/`, `class/`.  
- Filesystems: `fs/` – `ext2/`, `ext4/`, `xfs/`, `btrfs/`.
