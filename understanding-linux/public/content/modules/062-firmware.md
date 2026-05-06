---
id: 62
title: "Firmware"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Core Concepts
### Firmware as the First‑Execution Environment
Firmware is the *first* code executed by a processor after reset. Unlike an operating system, it runs in a *bare‑metal* context: no OS services, no virtual memory, and often with a limited instruction set (e.g., real‑mode 16‑bit on legacy BIOS or 64‑bit long mode on UEFI). The reason it must be stored in non‑volatile memory (flash, ROM, or EEPROM) is that the processor’s reset vector points to a fixed physical address; if that address contained volatile RAM, the contents would be undefined at power‑up and the system could not boot.

### Reset Vector and Entry Point
On x86‑64 the reset vector lives at physical address **0xFFFFFFFFF000** (the last 16 MiB of the 4 GiB address space). The firmware image is mapped there by the hardware (e.g., the SPI flash controller). The CPU begins execution in real‑mode with CS:IP = 0xF000:0xFFF0, which translates to that physical address. The firmware therefore must:
1. Set up a minimal stack (typically in RAM that has been initialized by the memory controller).
2. Detect the boot mode (BIOS legacy vs. UEFI) by examining configuration registers or strapping pins.
3. Transition to the appropriate processor mode (protected mode → long mode for UEFI, or stay in real‑mode for BIOS).

### UEFI vs. Legacy BIOS: Contractual Differences
| Feature | Legacy BIOS | UEFI |
|---------|--------------|------|
| Entry point | 16‑bit real‑mode interrupt‑driven (INT 10h/13h) | 64‑bit PE/COFF image with UEFI boot services |
| Boot selection | MBR partition table, active flag | UEFI boot variables (`Boot####`) stored in NVRAM |
| Runtime services | None (only INT 13h for disk) | EFI Runtime Services (variables, time, reset) |
| Extensibility | Limited to option ROMs | Drivers, shells, scripts via UEFI Driver Model |
| Security | No signature verification (except optional) | Secure Boot (PK/KEK/db/dbx) enforced in firmware |

The *why* behind UEFI’s design is to replace the BIOS’s ad‑hoc interrupt interface with a well‑defined, C‑callable API that enables modular drivers, pre‑OS networking, and cryptographic verification—capabilities impossible in the 16‑bit BIOS world.

### Hardware Initialization: From Power‑On to Stable State
1. **Clock and PLL configuration** – The memory controller and CPU core clocks are programmed via Model Specific Registers (MSRs). Example: enabling the CPU’s external clock (`IA32_MISC_ENABLE`) and setting the core‑to‑bus ratio.
2. **Memory controller initialization** – DRAM timings (tCL, tRCD, tRP, tRAS) are programmed into the memory controller’s registers. The controller then performs DRAM initialization (CKE, ODT, ZQCS) before any read/write.
3. **Cache setup** – The firmware flushes and invalidates all caches (`wbinvd`), then sets the Memory Type Range Registers (MTRRs) to mark RAM as write‑back (WB) and MMIO regions as uncacheable (UC). This guarantees deterministic memory access latency.
4. **Interrupt controller** – The APIC is placed in *virtual wire* mode; the firmware writes the Spurious Interrupt Vector Register (SVR) to enable the local APIC and sets the Task Priority Register (TPR) to 0 to allow interrupts.
5. **A20 gate** – On legacy BIOS the A20 line must be enabled (via keyboard controller or fast A20) to allow access to memory above 1 MiB; UEFI firmware runs with A20 already enabled by the hardware.

Only after these steps does the firmware have a *known* CPU state: protected mode with paging disabled, a valid stack, initialized RAM, and functional interrupt handling—prerequisites for loading a bootloader.

## How It Works
### Step‑by‑Step Boot Flow (UEFI Example)
1. **Power‑on reset** – CPU starts at reset vector, executes firmware from SPI flash.
2. **PEI (Pre‑EFI Initialization)** – Minimal hardware bring‑up: CPU, memory controller, basic RAM. PEI produces a hand‑off block (HOB) describing the memory map.
3. **DXE (Driver Execution Environment)** – UEFI drivers are loaded (e.g., block‑io, console, network). The DXE core collects all available memory descriptors via `GetMemoryMap()`.
4. **Boot Manager** – Reads UEFI boot variables (`Boot####`, `BootOrder`) from NVRAM (`/sys/firmware/efi/efivars`). Selects the highest‑priority entry.
5. **Load Boot Option** – Firmware loads the referenced PE/COFF image (e.g., `\EFI\ubuntu\grubx64.efi`) into memory using `LoadImage()` and transfers control via `StartImage()`.
6. **Bootloader (GRUB)** – Reads its configuration (`/boot/grub/grub.cfg`), loads the Linux kernel (`vmlinuz`) and initrd (`initrd.img`) using its own file‑system drivers (ext4, btrfs, etc.).
7. **Kernel entry** – GRUB jumps to the kernel’s entry point (`startup_64()`), which sets up paging, transfers control to `start_kernel()`.

Each step is causal: the firmware *must* provide a memory map (`GetMemoryMap()`) because the bootloader needs to know where RAM resides to place the kernel and initrd. The UEFI specification requires that the memory map be returned as an array of `EFI_MEMORY_DESCRIPTOR` structures; the size of the buffer is given by the formula:

$$
\text{bufSize} = n \times \sizeof(EFI\_MEMORY\_DESCRIPTOR)
$$

where *n* is the number of descriptors returned. The caller typically queries with a zero‑size buffer to obtain the required size, allocates, then calls again.

### Role of the Bootloader
The bootloader is *not* part of the firmware; it is a separate program that the firmware loads and executes. Its responsibilities:
- Parse a file system (FAT, ext4, etc.) to locate kernel/initrd.
- Relocate the kernel to the address expected by its entry point (usually 0x100000 for a 64‑bit kernel, or 0x1000000 for a kernel built with `CONFIG_PHYSICAL_START=0x1000000`).
- Pass a boot info structure (e.g., the `boot_params` struct for Linux) containing the memory map, kernel command line, and initrd location.
- Transfer control via a far jump to the kernel’s entry point.

The firmware’s only job regarding the bootloader is to *load* it correctly and *transfer* execution; any mistake in the bootloader will manifest after firmware hands over control.

### Hardware Initialization Techniques (Expanded)
*Interrupt handling*: The firmware sets up the Interrupt Descriptor Table (IDT) with a single handler that increments a counter and executes `iret`. This is necessary because, before the OS takes over, any stray interrupt (e.g., from the timer) must be acknowledged to prevent lock‑ups. In UEFI, the firmware installs a temporary handler for the Legacy Interrupt vector 0x08 (IRQ0) using `SetVirtualAddressMap()` if runtime services are needed.

*Memory mapping*: The firmware programs the Memory Type Range Registers (MTRRs) to define cacheability. For a typical system with 8 GiB RAM, the MTRR configuration might look like:
```
base = 0x00000000, size = 8GB, type = WB
base = 0x80000000, size = 2GB (MMIO), type = UC
```
The effective memory attribute for an address *a* is determined by the *first* matching MTRR; if none match, the default is UC.

*I/O device initialization*: The firmware initializes the UART (16550) by writing to its Divisor Latch (DLAB) to set baud rate:
$$
\text{Divisor} = \frac{\text{UART\_CLK}}{16 \times \text{Baud}}
$$
For a 1.8432 MHz clock and 115200 baud, Divisor = 1. The firmware then enables the FIFO and sets the line control register to 8‑N‑1.

## Worked Examples
### Example 1: Booting a Linux System on UEFI (with real numbers)
**Scenario**: A laptop with an AMI UEFI firmware, 8 GiB DDR4‑2400 RAM, and an NVMe SSD containing an EFI System Partition (ESP) formatted FAT32.

| Phase | Action | Details |
|------|--------|---------|
| Reset | CPU jumps to 0xFFFFFFFFF000 | Firmware image (4 MiB) is mapped here by the SPI flash controller. |
| PEI | Initialize DDR4 controller | Writes to `MC_CH0_CSR` registers: tCL=17, tRCD=17, tRP=17, tRAS=34 (in cycles). At 2400 MT/s, each cycle = 0.4167 ns → tRAS ≈ 14.2 ns. |
| PEI | Enable caches | `wbinvd`, set MTRR: base 0x00000000 size 8 GB type WB. |
| DXE | Load `Fat` driver | Reads ESP, finds `\EFI\BOOT\BOOTX64.EFI` (fallback) or `\EFI\ubuntu\grubx64.efi`. |
| Boot Manager | Reads `Boot0002` variable | Variable stores: `File(\EFI\ubuntu\grubx64.efi)`. |
| LoadImage | Allocates 256 KB buffer, copies PE/COFF image | Image size = 1.2 MiB; after relocation, entry point = 0x8000 + 0x2000 (PE header). |
| StartImage | Transfers control to GRUB | GRUB sets up its own stack at 0x9 0000. |
| GRUB | Parses `/boot/grub/grub.cfg` | Finds `linux /boot/vmlinuz-5.15.0-76-generic root=UUID=… ro quiet splash`. |
| GRUB | Loads kernel | Reads 8 MiB kernel image, places it at 0x100000 (physical). |
| GRUB | Loads initrd | 12 MiB initrd placed at 0x300000. |
| GRUB | Constructs `boot_params` | Fills `hdr.cmd_line_ptr`, `hdr.ramdisk_image`, `hdr.ramdisk_size`. |
| GRUB | Jumps to `startup_64()` | CPU now in long mode, paging disabled. |
| Kernel | Early setup | `early_identify_cpu()`, sets up temporary identity‑mapped page table (1 GiB mapping), enables paging (`cr0.PG=1`), switches to `_text`. |
| Kernel | `start_kernel()` | Initializes sched, mm, devices, mounts rootfs from initrd, then transitions to real root. |

**Key calculations**  
- Page size $P = 4096$ B. Kernel size $S_k = 8$ MiB → number of pages $N_k = \lceil S_k / P \rceil = \lceil 8 MiB / 4 KiB \rceil = 2048$ pages.  
- Initrd size $S_i = 12$ MiB → $N_i = \lceil 12 MiB / 4 KiB \rceil = 3072$ pages.  
- Total RAM needed for kernel+initrd during early boot = $(N_k+N_i) \times P = (2048+3072) \times 4096 = 21 MiB$ (still < 8 GiB, leaving ample space for further allocations).

### Example 2: Initializing Device Memory (x86‑64, UEFI Runtime Services)
**Goal**: Show how firmware prepares a contiguous, identity‑mapped region for early kernel use and then transfers control.

```c
/* firmware.c – simplified PEI phase */
#include <Uefi.h>
#include <Library/UefiBootServicesTableLib.h>
#include <Library/UefiRuntimeServicesTableLib.h>
#include <Library/MemoryAllocationLib.h>
#include <Library/BaseMemoryLib.h>
#include <Library/DebugLib.h>

EFI_STATUS
EfiMain (IN EFI_HANDLE ImageHandle, IN EFI_SYSTEM_TABLE *SystemTable)
{
    EFI_STATUS Status;
    EFI_MEMORY_DESCRIPTOR *MemMap = NULL;
    UINTN MapSize, MapKey, DescriptorSize;
    UINT32 DescriptorVersion;

    /* 1. Obtain the memory map from UEFI boot services */
    Status = SystemTable->BootServices->GetMemoryMap(
                &MapSize, MemMap, &MapKey, &DescriptorSize, &DescriptorVersion);
    if (Status == EFI_BUFFER_TOO_SMALL) {
        MemMap = AllocatePool(MapSize);
        Status = SystemTable->BootServices->GetMemoryMap(
                    &MapSize, MemMap, &MapKey, &DescriptorSize, &DescriptorVersion);
        if (EFI_ERROR(Status)) {
            Print(L"Failed to get memory map: %r\n", Status);
            return Status;
        }
    }

    /* 2. Identify the largest contiguous block >= 64MiB for kernel */
    UINT64 KernelBase = 0x100000;          /* 1 MiB, traditional Linux load address */
    UINT64 KernelSize = 64 * 1024 * 1024;  /* 64 MiB */
    UINT64 FreeBase = 0;
    for (UINTN i = 0; i < MapSize / DescriptorSize; ++i) {
        EFI_MEMORY_DESCRIPTOR *desc = (EFI_MEMORY_DESCRIPTOR*)((UINT8*)MemMap + i*DescriptorSize);
        if (desc->Type == EfiConventionalMemory &&
            desc->NumberOfPages * EFI_PAGE_SIZE >= KernelSize) {
            FreeBase = desc->PhysicalStart;
            break;
        }
    }
    if (FreeBase == 0) {
        Print(L"No sufficient conventional memory found.\n");
        return EFI_NOT_FOUND;
    }

    /* 3. Enable caching for the region (WB) via MTRR */
    /* Pseudo‑code: IA32_MTRR_PHYS_BASE3 = (FreeBase & ~0xFFF) | (Type_WB << 10) */
    /* IA32_MTRR_PHYS_MASK3 = ((~(KernelSize-1)) & ~0xFFF) | 0x800;   */
    /* (Actual implementation uses AsmWriteMsr64) */

    /* 4. Allocate a boot info structure to pass to the OS */
    typedef struct {
        UINT64 mem_map_addr;
        UINT64 mem_map_size;
        UINT64 mem_desc_size;
        UINT32 mem_desc_ver;
    } EFI_BOOT_INFO;
    EFI_BOOT_INFO *info = AllocateZeroPool(sizeof(EFI_BOOT_INFO));
    info->mem_map_addr = (UINT64)MemMap;
    info->mem_map_size = MapSize;
    info->mem_desc_size = DescriptorSize;
    info->mem_desc_ver = DescriptorVersion;

    /* 5. Load and jump to the OS kernel (PE/COFF) */
    EFI_HANDLE KernelImageHandle;
    Status = SystemTable->BootServices->LoadImage(
                FALSE, ImageHandle,
                DevicePathFromText(L"\\EFI\\BOOT\\KERNEL.EFI"),
                NULL, 0, &KernelImageHandle);
    if (!EFI_ERROR(Status)) {
        Status = SystemTable->BootServices->StartImage(
                    KernelImageHandle, NULL, NULL);
    }
    /* If StartImage returns, something went wrong */
    Print(L"Boot failed: %r\n", Status);
    return Status;
}
```

**Explanation of the steps**  
- *GetMemoryMap* is required because the firmware does **not** know the RAM layout; the OS needs it to allocate its early structures.  
- The loop scans for a block of type `EfiConventionalMemory` large enough for the kernel; this mirrors what the Linux kernel’s early boot does when it receives the `boot_params`.  
- MTRR programming ensures the kernel’s region is cacheable (WB), preventing severe performance loss due to UC accesses.  
- The `EFI_BOOT_INFO` structure is a minimal stand‑in for the Linux `boot_params`; real firmware would fill the full struct (`struct boot_params` from `arch/x86/include/uapi/linux/boot.h`).  

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Approach |
|---|---------|----------------|------------------|
| 1 | **Assuming firmware runs in protected mode with paging enabled** | Firmware starts in real mode (BIOS) or long mode *without* page tables (UEFI PEI). Enabling paging before RAM is initialized leads to triple faults. | Initialize memory controller, set up a temporary identity‑mapped page table *only* after RAM is ready, then enable paging. |
| 2 | **Neglecting to set the A20 gate on legacy BIOS** | Without A20, the CPU cannot address memory above 1 MiB, causing the kernel to wrap around and corrupt low memory. | Use the keyboard controller (`out 0x64,0xD1; out 0x60,0xDF`) or fast A20 via chipset before loading the kernel. |
| 3 | **Using the wrong memory type for MMIO (e.g., marking it as WB)** | WB allows speculative reads and write‑back buffering, which can cause device registers to be read incorrectly or lose writes. | Mark MMIO ranges as UC or UC‑ (write‑combining) via MTRRs or PAT. |
| 4 | **Calling `ExitBootServices()` too early** | The OS still needs UEFI boot services (e.g., `AllocatePages`) to load kernel/initrd. Premature exit frees the memory map and causes crashes. | Call `ExitBootServices()` only after the kernel and initrd have been placed in memory and the OS is about to take control. |
| 5 | **Believing that firmware can directly invoke Linux system calls** | Firmware runs in a different privilege level and execution environment; there is no libc or syscall interface. | Use the UEFI boot services to load the kernel; the kernel then invokes its own syscalls after taking control. |
| 6 | **Ignoring Secure Boot signatures when loading a custom kernel** | If Secure Boot is enabled, the firmware will refuse to launch an unsigned PE/COFF image, leaving the system unbootable. | Enroll a custom key (`mokutil --import`) or sign the kernel/shim with `sbsigntool`. |
| 7 | **Assuming that `fwupdate` works on all platforms** | `fwupdate` only supports devices that expose a Linux firmware class (`/sys/class/firmware/`). Many embedded SoCs use vendor‑specific update mechanisms. | Verify the presence of `/sys/firmware/efi/fwupd` or use vendor tools (e.g., `intel-flash`, `nvme fmt`). |

## Exercises
### Easy
1. **Read UEFI variables from Linux**  
   ```bash
   sudo apt-get install -y efibootmgr
   sudo efibootmgr -v
   ```
   Explain the output: what do `Boot####` and `BootOrder` represent?

2. **Check the EFI memory map exposed by the kernel**  
   ```bash
   dmesg | grep -E 'EFI: mem'
   cat /sys/firmware/efi/memmap
   ```
   Identify the number of `EfiConventionalMemory` entries and their total size.

### Medium
3. **Build and run a minimal UEFI “Hello World” application** (using EDK II or GNU‑EFI)  
   ```bash
   # Install GNU-EFI
   sudo apt-get install -y gnu-efi
   # Hello.c
   cat > hello.c <<'EOF'
   #include <efi.h>
   #include <efilib.h>
   EFI_STATUS
   efi_main (EFI_HANDLE ImageHandle, EFI_SYSTEM_TABLE *SystemTable)
   {
       InitializeLib(ImageHandle, SystemTable);
       Print(L"Hello, UEFI World!\n");
       return EFI_SUCCESS;
   }
   EOF
   gcc -c hello.c -DEFI_FUNCTION_WRAPPER -fno-stack-protector -fPIC -I/usr/include/efi -I/usr/include/efi/x86_64
   ld hello.o /usr/lib/gnu-efi/crt0-efi-x86_64.o \
        /usr/lib/gnu-efi/efi.dll -o hello.efi \
        -T /usr/lib/gnu-efi/elf_x86_64_efi.lds \
        -shared -Bsymbolic -L/usr/lib/gnu-efi
   # Copy to ESP
   sudo mkdir -p /boot/efi/EFI/BOOT
   sudo cp hello.efi /boot/efi/EFI/BOOT/BOOTX64.EFI
   sudo efibootmgr -c -d /dev/sda -p 1 -L "HelloUEFI" -l '\\EFI\\BOOT\\BOOTX64.EFI'
   ```
   Reboot and select the new entry from the firmware boot menu. Verify the message appears.

4. **Modify GRUB to load a custom kernel**  
   - Compile a kernel with `CONFIG_DEBUG_INFO=y` and place it at `/boot/vmlinuz-debug`.  
   - Add a menuentry to `/etc/grub.d/40_custom`:
     ```bash
     menuentry "Debug Kernel" {
         linux   /boot/vmlinuz-debug root=UUID=XXXX ro quiet splash
         initrd  /boot/initrd.img-debug
     }
     ```
   - Run `sudo update-grub` and reboot. Confirm that the debug kernel is booted via `uname -r`.

### Hard
5. **Implement a firmware update verification step using Secure Boot**  
   - Generate a test key pair: `openssl req -new -x509 -newkey rsa:2048 -keyout KEK.key -out KEK.crt -days 365 -nodes -subj "/CN=Test KEK/"`.  
   - Convert to EFI format: `openssl x509 -outform DER -in KEK.crt -out KEK.auth`.  
   - Sign a firmware image: `sbattach --key KEK.key --cert KEK.crt --output firmware-signed.bin firmware.raw`.  
   - Enroll the KEK in UEFI firmware via `mokutil --import KEK.auth` (requires reboot into MokManager).  
   - Attempt to boot an unsigned image; verify that the firmware rejects it. Then boot the signed image and confirm success.

6. **Measure the time taken for firmware to exit boot services**  
   Add a timestamp wrapper around `ExitBootServices()` in a custom UEFI application:
   ```c
   UINT64 Start
