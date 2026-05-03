---
id: 190
title: "Virtualization basics"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When you rent a cloud VM, your kernel is a guest being managed by software that intercepts every privileged operation you attempt. This matters concretely: a `VMEXIT` round-trip costs roughly $1$–$10\,\mu s$ depending on exit reason and hardware, versus $\sim200\,\text{ns}$ for a bare-metal syscall. That gap is not random overhead — it is the cost of saving and restoring CPU state across a hardware-enforced mode switch. If you cannot identify when your code is triggering exits, you cannot diagnose the latency.

You also need to understand this layer to reason about why `/proc/cpuinfo` reports a CPU count that does not match what your workload experiences, why TLB pressure doubles under nested paging, and why a neighbor's disk-heavy workload can saturate your I/O path even when your own `iostat` looks clean.

---

## Core Concepts

### Type 1 vs. Type 2 Hypervisors

The distinction is about which software holds hardware privilege first — and that determines what the hypervisor can reuse.

**Type 1 (bare-metal):** The hypervisor boots directly into ring 0 (or the equivalent privilege level) and owns all hardware. No host OS sits beneath it. Xen is the canonical example: it boots as the most privileged layer and carves out `dom0`, a privileged guest with direct device access and the right to create/destroy other guests (`domU`). The hypervisor directly implements its own CPU scheduler, memory allocator, and device drivers.

**Type 2 (hosted):** A host OS kernel runs first and retains hardware ownership. The hypervisor is implemented as kernel modules plus user-space components running *under* that kernel. KVM is the canonical Linux example: `kvm.ko` adds a new CPU execution mode to the host kernel, but Linux's own scheduler, memory manager, and block layer remain active. Guest vCPUs are scheduled as ordinary tasks (`struct task_struct`) — which means KVM inherits Linux's entire observability stack (perf, ftrace, cgroups), but also inherits its scheduler jitter.

The performance gap between the two shrinks to near-zero with hardware virtualization extensions. The operational gap remains: on a KVM host, you can `strace` QEMU, attach `perf` to a vCPU thread, and inspect its cgroup directly.

### The Guest/Host Boundary and VM Exits

A guest kernel operates under the illusion that it owns physical hardware. When it executes a privileged instruction — writing `CR3` to switch page tables, issuing an `LGDT`, performing port I/O — it is actually running in **VMX non-root mode** (Intel) or **SVM guest mode** (AMD). The CPU detects the instruction and automatically performs a **VMEXIT**:

1. Saves the *entire* guest register state into the per-vCPU **VMCS** (Virtual Machine Control Structure).
2. Loads the hypervisor's register state from the same VMCS.
3. Transfers control to the hypervisor's exit handler at the address recorded in the VMCS's `HOST_RIP` field.

The hypervisor reads the **exit reason** from the VMCS, handles the operation, then calls `VMRESUME` to re-enter the guest. The round-trip cost is dominated by the state-save/restore — the VMCS region is $4\,\text{KB}$, and a full exit flushes pipeline state that took many cycles to build.

Before hardware extensions existed, hypervisors like early VMware used **binary translation**: scanning guest kernel code at runtime and rewriting privileged instructions into trap sequences. Hardware VMX/SVM eliminated that complexity entirely — the CPU enforces the boundary in microcode.

Common exit reasons on x86:

| Reason | Decimal | Cause |
|---|---|---|
| `EXCEPTION_NMI` | 0 | Guest fault requiring hypervisor attention |
| `CPUID` | 10 | Guest probing CPU capabilities |
| `HLT` | 12 | Guest idle loop halting a vCPU |
| `IO_INSTRUCTION` | 30 | Guest port I/O (`IN`/`OUT`) |
| `MSR_WRITE` | 32 | Guest writing a model-specific register |
| `EPT_VIOLATION` | 48 | Guest physical address not mapped in EPT |

### Two-Level Memory Translation

On bare metal, the MMU performs one translation:

$$\text{virtual address} \xrightarrow{\text{guest page table (4 levels)}} \text{physical address}$$

A TLB miss requires walking 4 levels × 8 bytes per entry = 4 sequential memory reads.

In a VM with EPT/NPT enabled, the hardware performs two nested translations:

$$\text{guest virtual} \xrightarrow{P_g} \text{guest physical} \xrightarrow{P_h} \text{host physical}$$

where $P_g$ is the guest's own page table and $P_h$ is the hypervisor's Extended Page Table. On a full TLB miss, the hardware walker must resolve *each* of the 4 guest-level pointers through the host EPT:

$$\text{memory accesses per TLB miss} = (d_g + 1) \times d_h$$

where $d_g = 4$ is the guest page table depth and $d_h = 4$ is the EPT depth. In the worst case — all levels cold in cache — this is $(4 + 1) \times 4 = 20$ sequential memory reads to resolve a single guest virtual address. Compare to 4 on bare metal.

This is why **huge pages in the guest** matter so much: a $2\,\text{MB}$ guest mapping reduces the guest page table depth by one level, and every page table pointer lookup it eliminates saves $d_h = 4$ additional host memory accesses.

EPT/NPT entries carry the same protection bits as normal PTEs. An `EPT_VIOLATION` exit fires when a guest accesses a guest-physical address not yet mapped in the EPT — the hypervisor must allocate a host-physical page, install the EPT mapping, and resume. This is the VM analog of a host page fault.

After resolution, the full guest-virtual → host-physical mapping is cached in the TLB tagged with a **VPID** (Virtual Processor ID, per vCPU). This avoids a full TLB flush on every `VMENTRY`/`VMEXIT` — without VPID, the hypervisor would need to flush the TLB on every context switch between guest and host.

### KVM's I/O Path

A guest writing to a virtual disk cannot access real hardware directly. The path for emulated virtio devices is:

1. Guest driver writes to a **virtqueue** — a shared-memory ring buffer mapped into both guest and host address spaces.
2. Guest issues a **kick**: an `OUT` to a specific port (or an MMIO write), triggering a `VMEXIT`.
3. KVM's kernel module (`kvm_intel.ko`/`kvm_amd.ko`) handles the exit and signals the QEMU process via `eventfd`.
4. QEMU (user space) reads the virtqueue, performs the actual host I/O (e.g., `pread` on an image file or a block device), and writes the result back to the virtqueue.
5. QEMU injects a virtual interrupt into the guest by writing to KVM via `ioctl(vcpufd, KVM_INTERRUPT, ...)`.
6. KVM delivers the interrupt on the next `VMENTRY`.

The QEMU involvement crosses two user/kernel boundaries: host kernel → QEMU user space (to process the request), and QEMU user space → host kernel (to inject the IRQ). The **virtio** shared ring buffer means *bulk data* never crosses those boundaries — only the notification does. Without virtio (pure port I/O emulation), every byte transferred would trigger a separate exit.

**SR-IOV passthrough** eliminates the exit path entirely for qualifying hardware: the physical NIC or NVMe device presents multiple PCIe Virtual Functions, each assigned directly to a guest with no hypervisor in the data path. Throughput approaches bare metal; the tradeoff is loss of live migration capability.

---

## Linux Connection

### Detecting Virtualization from Inside a Guest

```bash
# High-level detection via systemd (checks CPUID, DMI, device tree)
systemd-detect-virt
# Outputs: kvm, xen, vmware, none, etc.

# Check the hypervisor bit: CPUID leaf 1, ECX bit 31
# If set, you are in a VM
grep -m1 "hypervisor" /proc/cpuinfo

# Read the hypervisor vendor string from CPUID leaf 0x40000000
# Returns e.g. "KVMKVMKVM\0\0\0" for KVM, "VMwareVMware" for ESXi
cpuid -l 0x40000000 -1

# DMI chassis type often reveals cloud provider
dmidecode -s system-product-name

# KVM clock source: if this shows "kvm-clock", you are on KVM
cat /sys/devices/system/clocksource/clocksource0/current_clocksource
```

### KVM Kernel Modules and the /dev/kvm Interface

KVM splits into three modules: `kvm.ko` (architecture-independent infrastructure), `kvm_intel.ko` (VMX), and `kvm_amd.ko` (SVM). Loading the hardware-specific module activates VMX/SVM on all CPUs.

```bash
lsmod | grep kvm
# kvm_intel   380928  0
# kvm         1130496  1 kvm_intel

ls -la /dev/kvm       # Character device, mode 0660, owned by group 'kvm'
ls /sys/module/kvm_intel/parameters/  # Tunable VMX parameters
# e.g., ept=1 (EPT enabled), vpid=1, flexpriority=1
```

A program that creates and runs a minimal VM uses this interface directly:

```c
#include <linux/kvm.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <fcntl.h>

int kvmfd  = open("/dev
