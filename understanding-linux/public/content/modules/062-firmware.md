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

## Why This Matters

When a CPU powers on, it has no stack, no initialized RAM, no page tables — just a hardware reset state and one hardwired address it will fetch instructions from. Firmware is the code that runs before any of that exists. It must initialize RAM before RAM can hold anything, enumerate devices before drivers can claim them, and construct a memory map before the kernel can safely allocate a single byte. Every failure mode that precedes the kernel — silent corruption, hangs at the splash screen, misdetected CPU topology — originates here. Understanding firmware means understanding what the kernel *assumes to be true* before its first instruction executes.

## Core Concepts

### The Reset Vector

At power-on, the x86-64 CPU enters a compatibility mode that mimics 16-bit real mode but fetches the first instruction from `0xFFFFFFF0` — 16 bytes below the top of the 32-bit address space. This is the **reset vector**. The address is hardwired in silicon; no software configures it.

At that moment, the chipset's memory controller maps `0xFFFFFFF0` to a physical address inside the **boot ROM**, not to DRAM. This mapping is necessary because DRAM is uninitialized and unreliable — it requires voltage stabilization, ZQ calibration, and timing training before a single read returns predictable data. You cannot store the initialization code in the thing that requires initialization. Boot ROM (flash, read-only during normal operation) holds its contents without power and without setup, so it can be read before anything else exists.

### Boot ROM and Memory-Mapped Execution

The CPU executes directly from the ROM via memory-mapped I/O. Before any RAM is available, UEFI's early phase uses a trick: the CPU's L1 cache is configured as **CAR (Cache-as-RAM)**, a scratch space for a stack and local variables, without any backing DRAM. The cache is put into a write-back, no-eviction mode so that stores never go to the (absent) memory bus. This is how the firmware bootstrap code has a working stack before a single DRAM rank is trained.

### BIOS

BIOS (Basic Input/Output System) was the dominant x86 firmware interface from the late 1970s through the mid-2000s. It runs entirely in 16-bit real mode. Its address space is limited to 1 MB, structured as:

$$\text{address} = \text{segment} \times 16 + \text{offset}$$

With a 16-bit segment and 16-bit offset, the reachable range is $[0, 0xFFFFF]$ — exactly 1 MiB. This is a hard architectural ceiling, not a convention.

Hardware services are exposed through the **IVT (Interrupt Vector Table)**: 256 4-byte entries at physical address `0x00000000–0x000003FF`, each containing a segment:offset pointer to a handler. Calling `INT 0x13` invokes disk I/O; `INT 0x10` invokes video. These are callable before an OS loads.

BIOS boots only from MBR-partitioned disks. The MBR uses 32-bit LBA addresses, capping addressable disk space at:

$$2^{32} \times 512 \text{ bytes} = 2 \text{ TiB}$$

BIOS is obsolete for new hardware, but Linux still supports it because millions of deployed machines still run it, and because the MBR/real-mode boot path is where the x86 boot protocol originated.

### UEFI

UEFI (Unified Extensible Firmware Interface) is not simply a larger BIOS — it is a complete firmware operating environment with its own executable format (PE32+), filesystem (FAT32 on the ESP), driver model, memory allocator, and protocol interface. It boots in 32-bit or 64-bit protected mode from the start, bypassing the 1 MiB constraint entirely.

UEFI uses GPT (GUID Partition Table) instead of MBR. GPT uses 64-bit LBA addresses, extending the addressable range to:

$$2^{64} \times 512 \text{ bytes} = 2^{73} \text{ bytes} \approx 9.4 \text{ ZiB}$$

GPT also stores the partition table in two locations (beginning and end of disk) with CRC32 checksums, making it recoverable after single-point corruption — something MBR cannot do.

The architectural reason UEFI exists is that the hardware initialization problem outgrew 16-bit real mode. A modern PCIe fabric alone can have hundreds of devices, each requiring BAR (Base Address Register) allocation, link training, and capability enumeration — none of which fits in 1 MiB of address space with 16-bit segment arithmetic.

### Hardware Initialization Order

The initialization sequence is strictly ordered because each step depends on the previous one being complete:

1. **CPU microcode** — loaded from ROM before any complex instruction executes; microcode patches errata in the decoded instruction layer
2. **Cache-as-RAM** — L1 cache configured as a scratch stack (CAR mode) before DRAM exists
3. **Chipset (PCH)** — clocks, power rails, and bus bridges configured
4. **DRAM training** — the firmware sends known test patterns, measures round-trip latency, and writes calibration values into the memory controller's timing registers (tCL, tRCD, tRP, tRAS, etc.)
5. **PCIe enumeration** — the firmware walks the device tree, assigns 64-bit MMIO BARs, and configures interrupt routing
6. **Storage/input** — enough to locate a bootloader

DRAM training is why a cold boot is slower than a warm boot. During training, the firmware measures the signal propagation delay for each DRAM channel. If the memory controller runs at $f$ MHz with a data bus width of $w$ bits, the raw bandwidth ceiling per channel is:

$$B = f \times w \div 8 \text{ bytes/cycle}$$

but the actual achievable bandwidth depends on calibrated timing parameters. Firmware saves trained values to NVRAM so warm boots can skip re-training.

## How It Works

### UEFI Boot Phases

UEFI defines six sequential phases. Each phase hands off to the next via a defined interface:

```
SEC → PEI → DXE → BDS → TSL → RT
```

| Phase | Name | What happens |
|---|---|---|
| **SEC** | Security | Executes from ROM in CAR mode; validates PEI image via hash |
| **PEI** | Pre-EFI Init | Initializes DRAM; transitions off CAR; loads DXE dispatcher |
| **DXE** | Driver Execution Env | Loads firmware drivers as EFI modules; builds `EFI_SYSTEM_TABLE` |
| **BDS** | Boot Device Select | Processes boot order from NVRAM; locates and launches `.efi` binary |
| **TSL** | Transient System Load | Bootloader runs in EFI environment; OS loader calls `ExitBootServices()` |
| **RT** | Runtime | Kernel owns hardware; UEFI runtime services remain mapped |

The phase transition from DXE to BDS is where the full UEFI environment becomes available — all `EFI_BOOT_SERVICES` functions, the protocol database, and the memory allocator. This is when GRUB runs.

`ExitBootServices()` is the ownership boundary. Before it is called, UEFI owns the physical memory map and all hardware. After it, the OS owns memory completely. The call is irreversible: the firmware tears down boot-time data structures immediately. Any UEFI boot service called after this point has undefined behavior. The kernel must call it exactly once, with a valid memory map key that matches the current map state — if the map has changed since the key was obtained (e.g., because a protocol was installed), the call fails and must be retried with a fresh map.

### Memory Map Handoff

UEFI constructs a **memory map** — a typed, non-overlapping partition of the physical address space — and the bootloader retrieves it before calling `ExitBootServices()`. The kernel cannot safely use any physical address until it has parsed this map; using an `EfiReservedMemory` region as heap would corrupt firmware data structures still needed at runtime.

```c
// UEFI specification: EFI_MEMORY_DESCRIPTOR
typedef struct {
    UINT32  Type;           // Region classification (see below)
    UINT64  PhysicalStart;  // First byte of this region
    UINT64  VirtualStart;   // Filled in by SetVirtualAddressMap()
    UINT64  NumberOfPages;  // Region size in 4 KiB pages
    UINT64  Attribute;      // EFI_MEMORY_WB, EFI_MEMORY_RUNTIME, etc.
} EFI_MEMORY_DESCRIPTOR;
```

Region size in bytes:

$$\text{size\_bytes} = \text{NumberOfPages} \times 4096$$

Key memory types:

| Type value | Name | Kernel treatment |
|---|---|---|
| 7 | `EfiConventionalMemory` | Usable RAM |
| 0 | `EfiReservedMemory` | Never touch |
| 9 | `EfiACPIReclaimMemory` | Usable after ACPI tables parsed |
| 10 | `EfiACPIMemoryNVS` | Never touch (firmware runtime state) |
| 11 | `EfiMemoryMappedIO` | Device MMIO; not RAM |

The Linux kernel receives this map as part of the EFI boot protocol. It processes it in `arch/x86/platform/efi/efi.c` and converts it into its own internal `memblock` allocator ranges before the buddy allocator is initialized.

### ACPI: Firmware Describing Hardware Topology

UEFI does not describe individual devices — that is ACPI's job. ACPI (Advanced Configuration and Power Interface) is a separate standard for firmware to publish machine topology as structured tables and bytecode that the OS parses at runtime.

Firmware places ACPI tables in physical memory and publishes their location via the **RSDP** (Root System Description Pointer), which UEFI exposes through its configuration table (accessible via `EFI_SYSTEM_TABLE.ConfigurationTable` with the `EFI_ACPI_TABLE_
