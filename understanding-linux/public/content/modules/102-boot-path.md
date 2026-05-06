---
id: 102
title: "Boot path"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Core Concepts
### Firmware Handoff
When power is applied, the CPU starts in **real‑mode** (CS:IP = 0xF000:0xFFF0 for legacy BIOS, or at a defined entry point for UEFI). The firmware’s first job is the **Power‑On Self Test (POST)**, which probes and initializes essential hardware: CPU caches, RAM, PCIe enumeration, and legacy I/O ports (e.g., the 8042 keyboard controller).  
Why? The CPU can only execute code from memory that has been made accessible; the firmware configures the **memory controller** to map RAM into the CPU’s address space and enables the **A20 gate** so that addresses above 1 MiB wrap correctly (otherwise the CPU would truncate to the 20‑bit real‑mode limit).  

After POST, the firmware scans boot devices in the order defined by NVRAM. For BIOS it reads the first 512‑byte **Master Boot Record (MBR)**; for UEFI it locates an **EFI System Partition (ESP)** and loads the PE/COFF binary referenced by `\EFI\BOOT\BOOTX64.EFI`. The firmware then copies the bootloader into RAM (typically at 0x7C00 for MBR, or at a UEFI‑allocated buffer) and transfers control via a far jump or `BootServices->StartImage`.  

**Key point:** the handoff is not merely a “load and jump”; it establishes a *known* CPU state (real mode, interrupts disabled, A20 enabled) and provides a minimal set of runtime services (BIOS INT 13h disk I/O, or UEFI Boot/Services tables) that the bootloader can rely on without writing its own drivers.

### Bootloader
A bootloader’s primary responsibility is to transition the system from the firmware‑provided minimal environment to one capable of loading and executing an OS kernel. This involves three stages:

1. **Hardware initialization** – e.g., enabling the A20 gate (if not already done), setting up the GDT, switching to **protected mode** (or directly to long mode on x86‑64), and programming the PIC/APIC.  
   *Why?* The kernel expects to run in a flat 32‑ or 64‑bit address space with paging disabled (or with a minimal identity‑mapped page table). Real mode’s segmentation would prevent loading a multi‑megabyte kernel at high addresses.

2. **Loading the kernel and initramfs** – the bootloader reads files from a filesystem it understands (e.g., ext4 via a built‑in driver, or FAT12/16 for MBR). It places the kernel at a predetermined **load address** (commonly 0x100000 for a compressed vmlinuz, or 0x1000000 for an uncompressed bzImage) and the initramfs just after it.  
   *Why?* The kernel’s entry point is hard‑coded; the bootloader must respect the kernel’s linker script. Placing the initramfs after the kernel allows a simple “boot\_params” structure to describe its location and size.

3. **Transfer of control** – the bootloader sets up the **boot parameters** (struct boot_params in `arch/x86/include/uapi/boot.h`) containing the memory map, command line, and initrd location, then jumps to the kernel’s entry point (`start_kernel` for x86_64).  

A typical bootloader (GRUB) does all of this in C, but the essence can be seen in a minimal assembly stub:

```asm
; ----- Minimal BIOS bootloader (512 bytes) -----
org 0x7C00
start:
    cli                     ; disable interrupts
    lgdt [gdt_desc]         ; load GDT
    mov eax, cr0
    or eax, 1               ; set PE bit (protected mode)
    mov cr0, eax
    jmp 0x08:protected_entry ; far jump to reload CS

protected_entry:
    ; now in protected mode, set up segment registers
    mov ax, 0x10
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax
    mov ss, ax

    ; load kernel (simplified)
    mov esi, kernel_ptr      ; source address in low memory
    mov edi, 0x100000        ; load address
    mov ecx, kernel_size
    rep movsb                ; copy kernel

    ; jump to kernel entry
    jmp 0x100000
    ; ... (GDТ, etc.) ...

gdt_desc:
    dw gdt_end - gdt - 1
    dd gdt
gdt:
    dd 0                     ; null descriptor
    dw 0xFFFF, 0x0000, 0x9200, 0x00CF ; code descriptor
    dw 0xFFFF, 0x0000, 0x9200, 0x00CF ; data descriptor
gdt_end:
```

### Kernel Decompression
Most distributed kernels are compressed with **gzip** (or increasingly **xz/lz4**) to fit within the limited space of the boot medium and to reduce load time. The decompression routine lives in the kernel’s head (`arch/x86/boot/compressed/`).  

Why compress?  
- **Size reduction**: A typical 10 MiB uncompressed bzImage compresses to ~2.5 MiB (ratio ≈ 0.25).  
- **Transfer speed**: Reading 2.5 MiB from flash/disk is faster than 10 MiB, offsetting the CPU cost of decompression.  

The decompression algorithm works on a **stream**: it reads compressed chunks, expands them into an output buffer, and finally jumps to the uncompressed kernel’s entry point. The math is simple:

Let  
- $S_u$ = uncompressed size (bytes)  
- $S_c$ = compressed size (bytes)  
- $r = S_c / S_u$ = compression ratio  

If the bootloader can read at bandwidth $B$ (bytes/s) and the CPU can decompress at rate $D$ (bytes/s), the total time $T$ is:

$$
T = \underbrace{\frac{S_c}{B}}_{\text{I/O}} + \underbrace{\frac{S_u}{D}}_{\text{CPU}} 
   = \frac{r S_u}{B} + \frac{S_u}{D}
   = S_u\!\left(\frac{r}{B} + \frac{1}{D}\right)
$$

For typical values $B = 200\text{ MB/s}$ (SATA SSD), $D = 500\text{ MB/s}$ (x86 decompression), $r = 0.25$, $S_u = 10\text{ MiB}$:

$$
T = 10\!\times\!2^{20}\!\left(\frac{0.25}{200\!\times\!10^6} + \frac{1}{500\!\times\!10^6}\right)
  \approx 0.021\text{ s}
$$

Thus decompression adds only a few milliseconds, a worthwhile trade‑off.

### Early Init
Before the kernel’s memory manager (`mm/`) is functional, the kernel must set up a **minimal runtime** to allow later code to execute safely:

1. **Pagetable setup** – identity‑map the first few megabytes (where the kernel resides) so that virtual == physical addresses while paging is enabled.  
2. **CPU feature detection** – check for SSE, AVX, etc., and enable appropriate CR0/CR4 bits.  
3. **Early console** – register `early_printk` to write debug output via VGA text mode or UART before `printk` is available.  
4. **Trap/interrupt initialization** – load the IDT with a dummy handler; later replaced by the full interrupt desk.  

These steps are necessary because many kernel subsystems (e.g., `kmalloc`, `smp_call_function`) assume a working MMU and interrupt system. Skipping them would cause a triple fault as soon as the kernel tries to access memory via a virtual address or enable interrupts.

### Initramfs
The **initramfs** (initial RAM filesystem) is a cpio archive compressed into a single blob and loaded into RAM by the bootloader. It is mounted as the root filesystem (`/`) **before** the real root is known.  

Why is it needed?  
- The kernel cannot directly access the eventual root device because the necessary **block‑device driver** (e.g., for LVM, mdraid, or encrypted volumes) may be compiled as a module.  
- Userspace tools (e.g., `cryptsetup`, `lvm`, `mdadm`) required to assemble the real root reside in the initramfs.  
- It provides a writable tmpfs for early boot scripts (e.g., udev, systemd‑udevd) to populate `/dev`.

The kernel’s `init/` code detects the initramfs via the `setup_data` struct passed by the bootloader, extracts it into a **tmpfs** (using `unpack_to_rootfs`), then attempts to execute `/init`. If `/init` returns, the kernel proceeds to mount the real root (via `mount` syscall) and switches root with `pivot_root`.

### Userspace Init
After `pivot_root`, the kernel no longer uses the initramfs; the real root’s `/sbin/init` (typically `systemd`) becomes PID 1. This stage:

- Parses the kernel command line (`/proc/cmdline`) for parameters like `systemd.unit=rescue.target`.  
- Starts the **udev** daemon to populate `/dev` with device nodes.  
- Brings up essential services (network, local filesystems) according to the chosen target.  
- Finally spawns getty/login prompts or a graphical display manager.

The transition from kernel‑space to userspace is marked by the first execution of an ELF binary in userspace (`execve("/sbin/init", …)`). All prior code has run in kernel mode with CPL 0.

---

## How It Works
The boot sequence is a cascade of causally linked transformations. Each stage prepares the hardware and software state required by the next.

1. **Firmware handoff** – POST configures memory controller, enables A20, and hands control to the bootloader at a known entry point. *Why?* The CPU can only execute from RAM that is mapped and accessible; the firmware guarantees a flat 1 MiB‑real‑mode environment with basic I/O services.

2. **Bootloader initialization** –  
   - Switches CPU from real mode → protected mode → (optionally) long mode by setting CR0.PE and loading a GDT.  
   - Enables paging only if loading a 64‑bit kernel (identity‑mapped first 2 MiB).  
   - Reads kernel and initramfs from disk using BIOS INT 13h or UEFI BlockIO services, placing them at predetermined physical addresses.  
   - Builds the `boot_params` struct: memory map (`E820`), command line, initrd start/size, and EFIBootLoader info.  
   *Why?* The kernel expects to run in a protected/long mode environment with a known virtual‑to‑physical mapping; the bootloader supplies the exact location of its code and data structures.

3. **Kernel decompression** – If the kernel image is marked `Z_IMAGE` (gzip) or `Y_IMAGE` (xz), the bootloader jumps to the kernel’s decompression routine, which expands the image in place (or into a temporary buffer). *Why?* Compression reduces I/O time and flash wear; the kernel can afford a few extra CPU cycles because it runs before any userspace activity.

4. **Early init** –  
   - Sets up a minimal identity‑mapped page table (`swapper_pg_dir`).  
   - Enables paging (`mov cr0, eax | PG`) and switches to virtual addressing.  
   - Detects CPU features, sets up the IDT, and initializes `early_printk`.  
   *Why?* Subsequent C code (e.g., `memcpy`, `memset`) relies on virtual addresses and interrupts for debugging; the kernel cannot safely call `printk` before these are ready.

5. **Initramfs loading** – The kernel copies the initramfs blob into RAM, decompresses it (gzip/xz), and extracts the cpio archive into a tmpfs mounted at `/`. It then executes `/init`. *Why?* Userspace tools needed to discover and mount the real root may be unavailable in the kernel image; placing them in initramfs guarantees they are present early.

6. **Userspace init** – After `pivot_root`, the kernel executes `/sbin/init` (usually systemd) as PID 1. Systemd reads `/etc/fstab`, starts services, and eventually launches a login prompt. *Why?* The userspace init system provides the full feature set (dependency tracking, socket activation, etc.) that a monolithic kernel init could not practically implement.

---

## Worked Examples
### Example 1: Booting a Linux System with GRUB on UEFI
**Scenario:** A modern UEFI system boots Ubuntu 22.04. The ESP is FAT32, mounted at `/boot/efi`. Kernel: `vmlinuz-5.15.0-78-generic` (compressed, ~7.2 MiB). Initramfs: `initrd.img-5.15.0-78-generic` (xz compressed, ~14 MiB).

**Step‑by‑step:**

| Step | Action | Details & Numbers |
|------|--------|--------------------|
| 1 | **Firmware handoff** | UEFI firmware reads `\EFI\ubuntu\grubx64.efi` into RAM at `0x1_0000_0000` (1 GiB) using Boot Services. It sets `CR0.PE=0` (still real mode) but has already enabled A20 and set up the memory map via `GetMemoryMap`. |
| 2 | **GRUB entry** | GRUB’s `_start` runs in 64‑bit long mode (UEFI guarantees this). It relocates itself to low memory (`0x7c00`) for compatibility with BIOS emulation paths, then re‑enters long mode. |
| 3 | **Hardware init** | GRUB enables paging (`IA32_EFER.LME=1`, `IA32_EFER.LMA=1`), sets up an identity‑mapped PGD for the first 2 MiB, and loads its own GDT. |
| 4 | **Load kernel** | Using the `ext2` filesystem driver, GRUB reads `/boot/vmlinuz-5.15.0-78-generic` (7 200 000 bytes) into physical address `0x100000` (1 MiB). It records `kernel_addr = 0x100000`, `kernel_size = 0x6E2000`. |
| 5 | **Load initramfs** | Reads `/boot/initrd.img-5.15.0-78-generic` (14 300 000 bytes) into `0x300000` (3 MiB). Records `initrd_addr = 0x300000`, `initrd_size = 0xDA5C00`. |
| 6 | **Build boot params** | Fills `struct boot_params` (located at `0x90000`):<br>• `hdr.cmd_line_ptr = pointer to "root=UUID=… ro quiet splash"`<br>• `hdr.ramdisk_image = initrd_addr`<br>• `hdr.ramdisk_size = initrd_size`<br>• `e820.entries` populated from UEFI memory map. |
| 7 | **Jump to kernel** | GRUB executes `jmp 0x100000`. The CPU is already in long mode with paging enabled; the kernel’s entry point (`start_of_kernel`) begins at `0x100000`. |
| 8 | **Kernel decompression** | The kernel’s `decompress_kernel()` detects `Z_IMAGE` flag. It allocates a temporary buffer at `0x200000` (2 MiB) and runs gzip decompression: <br>Input size = 7.2 MiB, output size ≈ 12.8 MiB (uncompressed bzImage). <br>Time ≈ (7.2 MiB / 200 MB/s) + (12.8 MiB / 500 MB/s) ≈ 0.045 s. |
| 9 | **Early init** | Sets up identity‑mapped page tables for first 16 MiB, enables paging, copies kernel to its final location (`0x100000` → `0x100000` (already there) but relocates if needed), initializes `early_printk` to VGA (0xB8000). |
|10| **Initramfs** | Detects initrd at `0x300000`, size 14.3 MiB, runs xz decompress into a tmpfs, extracts cpio, runs `/init` (which launches `dracut`/`systemd-udevd`). |
|11| **Userspace init** | After `pivot_root`, executes `/usr/lib/systemd/systemd` as PID 1, which mounts `/` from the real root (`/dev/mapper/ubuntu–vg–root`) and starts `getty` on tty1. |

**Result:** The system reaches a login prompt in ≈ 2.5 seconds from power‑on (typical for SSD + UEFI).

---

### Example 2: Debugging a Missing Initramfs
**Situation:** The system hangs after “Loading Linux …” with no further output; serial console shows no early printk.

**Investigation steps:**

1. **Verify firmware handoff** – Check UEFI boot order: `efibootmgr -v`. Ensure `Boot0000` points to `\EFI\ubuntu\grubx64.efi`.  
   ```bash
   sudo efibootmgr -v
   ```
   Output should list the correct entry; if missing, recreate with `grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=ubuntu`.

2. **Inspect GRUB config** – Look for `linux` and `initrd` directives:  
   ```bash
   cat /boot/grub/grub.cfg | grep -A2 "linux.*vmlinuz"
   ```
   Expect lines like:  
   ```
   linux   /boot/vmlinuz-5.15.0-78-generic root=UUID=abcd… ro quiet splash
   initrd  /boot/initrd.img-5.15.0-78-generic
   ```
   If the `initrd` line is absent or points to a non‑existent file, the kernel will attempt to continue without an initramfs, leading to a panic when it tries to mount the real root.

3. **Check file existence and size:**  
   ```bash
   ls -lh /boot/initrd.img-5.15.0-78-generic
   ```
   If the file is 0 bytes or missing, regenerate it:  
   ```bash
   sudo update-initramfs -u -k all
   ```
   (Ubuntu uses `update-initramfs`; on Fedora use `dracut --force`).

4. **Enable early console** to see kernel messages before initramfs: temporarily edit GRUB menu entry to add `earlycon=uart,mmio,0x10001000` and `debug`. Then reboot and capture serial output.

**Why this works:** The kernel will not proceed to `vfs_init` (mount root) without a valid initramfs when the root device requires userspace tools (LVM, encryption). By validating each hand‑off point we isolate where the chain breaks.

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Matters |
|---|---------|--------------|----------------|
| 1 | **Forgetting to enable the A20 gate** before switching to protected mode. | The CPU will wrap addresses ≥ 1 MiB back to low memory, causing the kernel to overwrite the bootloader or BIOS data structures. | Results in immediate triple fault; the system resets silently. |
| 2 | **Loading the kernel at an address that overlaps the initramfs** (e.g., placing initramfs at 0x100000 and kernel at 0x200000 when the kernel expects to be first). | The bootloader overwrites part of the kernel image with initramfs data, corrupting the executable. | Kernel fails to decompress or jumps to invalid address → no early console output. |
| 3 | **Using a compressed kernel but not telling the bootloader to run the decompression routine** (e.g., GRUB `linux` directive without `initrd` and missing `zimage` flag). | The bootloader jumps directly to the compressed blob; the CPU attempts to execute gzip data as code. | Leads to illegal instruction fault; early boot hangs. |
| 4 | **Providing an incorrect `root=` parameter** (UUID typo or wrong device) while the initramfs lacks the needed userspace tools to fall back. | The kernel mounts the wrong filesystem or cannot find `/sbin/init`. | Results in `Kernel panic - not syncing: VFS: Unable to mount root fs on unknown-block(0,0)`. |
| 5 | **Building a kernel with `CONFIG_DEBUG_RODATA` enabled but failing to set the NX bit** (or running on CPU without NX). | The kernel marks some pages as read‑only but not executable; if the CPU lacks execute‑disable protection, malicious code could still run. | Security regression; though not a boot failure, it undermines hardening guarantees. |
| 6 | **Omitting `earlycon=` when debugging silent hangs** and relying solely on `dmesg` after boot. | Early kernel messages (before `printk` is initialized) are lost, making it impossible to see where the kernel stalled. | Wastes time; you cannot distinguish between firmware vs. early‑kernel faults. |

---

## Exercises
### Easy
1. **Write a 512‑byte BIOS boot sector** that prints “Hello, World!” using BIOS teletype interrupt (`int 0x10`, `ah=0x0E`). Assemble with `nasm -f bin boot.asm -o boot.img` and test in QEMU: `qemu-system-i386 -fda boot.img`.  
   *Goal:* Understand real‑mode entry, interrupt usage, and the 512‑byte limit.

2. **Regenerate an initramfs** for the current kernel and verify its contents:  
   ```bash
   sudo mkinitcpio -p linux   # Arch
   # or
   sudo dracut --force
   lsinitrd /boot/initramfs-$(uname -r).img | head -20
   ```  
   *Goal:* Observe the cpio layout and confirm essential binaries (e.g., `bash`, `lvm`) are present.

### Medium
3. **Configure GRUB to boot a custom kernel** compiled with `CONFIG_DEBUG_INFO=y`. Add a custom kernel command line parameter `debug_earlyprint=serial,0x3F8,115200` and verify early kernel output appears on a serial port (use QEMU’s `-serial stdio`).  
   ```bash
   menuentry "Custom Debug Kernel" {
       linux   /boot/vmlinuz-debug root=/dev/sda1 earlycon=uart,mm
