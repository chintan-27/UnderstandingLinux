---
id: 191
title: "KVM concepts"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Every privileged instruction a guest kernel executes — writing CR3 to switch page tables, accessing an I/O port, modifying an MSR — must be intercepted by the hypervisor, validated, and handled. The cost of that interception is paid on every guest kernel entry, every device access, every memory mapping operation. Understanding KVM's architecture explains three things precisely: why compute-bound guest workloads run at near-native speed, why I/O-bound workloads pay a measurable tax, and why observability tools like `perf` and BPF can return incomplete or misleading data inside a guest (the guest's PMU is virtualized; the host's BPF programs don't see guest kernel symbols).

---

## Core Concepts

### KVM Is a Linux Kernel Extension, Not a Separate Hypervisor

KVM is implemented as two kernel modules: `kvm.ko` (architecture-independent core) and either `kvm-intel.ko` or `kvm-amd.ko` (the hardware virtualization backend). There is no separate hypervisor layer. The host Linux kernel *becomes* the hypervisor. This matters because:

- vCPUs are scheduled by CFS like any other thread — guest CPU starvation shows up in `schedstat`, not in a hypervisor-specific tool
- Guest memory is managed by the host's page allocator and reclaim machinery — a memory-pressured host can balloon or swap guest RAM
- KVM reuses the entire Linux driver stack instead of reimplementing it

The type-1 vs. type-2 distinction matters less than the architectural consequence: KVM has no scheduler of its own, which means a noisy neighbor VM doesn't just slow down other VMs — it shows up as ordinary CPU contention on the host, diagnosable with standard Linux tools.

### vCPUs Are POSIX Threads

Each vCPU is a thread in the QEMU process. When a vCPU thread is scheduled, it executes a `KVM_RUN` ioctl on its file descriptor (`/dev/kvm`), which causes the kernel to issue a `VMLAUNCH` or `VMRESUME` instruction. The guest then runs directly on hardware in **VMX non-root mode** (Intel) or **SVM guest mode** (AMD) — real CPU instructions, real registers, no interpretation.

The vCPU thread is in kernel space for the duration of guest execution. From the Linux scheduler's perspective, it looks like a thread blocked in a syscall. When a VM exit occurs, the CPU transitions back to VMX root mode, the kernel exit handler runs, and the thread either re-enters the guest or returns to QEMU userspace.

```c
// The userspace side of the run loop (simplified from QEMU's kvm-all.c)
// vcpu->fd is opened via ioctl(vm_fd, KVM_CREATE_VCPU, vcpu_id)
// vcpu->run is a struct kvm_run mmap'd from the vcpu fd

while (true) {
    ret = ioctl(vcpu->fd, KVM_RUN, 0);
    // On return, vcpu->run->exit_reason says why we exited
    switch (vcpu->run->exit_reason) {
    case KVM_EXIT_IO:
        // guest did IN/OUT — handle port I/O in userspace
        handle_io(vcpu->run);
        break;
    case KVM_EXIT_MMIO:
        // guest accessed unmapped MMIO region
        handle_mmio(vcpu->run);
        break;
    case KVM_EXIT_HLT:
        // guest is idle
        break;
    case KVM_EXIT_SHUTDOWN:
        return;
    }
}
```

The `struct kvm_run` layout is defined in `<linux/kvm.h>`. The `exit_reason` field tells QEMU what the guest was trying to do; the union members carry the operands.

### VM Exits Are the Fundamental Cost Unit

A VM exit forces the CPU to:
1. Save the complete guest architectural state into the **VMCS** (Intel) or **VMCB** (AMD) — a per-vCPU hardware structure in memory
2. Load host state from the same structure
3. Jump to the hypervisor's exit handler at a fixed host virtual address

The round-trip latency for a minimal exit (one that returns immediately) is roughly $500$–$2000$ ns on current hardware, depending on the exit reason and whether KPTI/Spectre mitigations are active. Mitigations add retpoline overhead and potentially an IBPB flush on each exit:

$$t_{\text{exit}} = t_{\text{vmexit}} + t_{\text{handler}} + t_{\text{vmentry}} + t_{\text{mitigations}}$$

For comparison, a native syscall (SYSCALL/SYSRET) costs roughly $100$–$200$ ns. A VM exit is $5$–$10\times$ more expensive before any emulation work. If a guest kernel issues $N$ privileged operations per second, the overhead floor is:

$$\text{overhead} \geq N \cdot t_{\text{exit}}$$

This is why paravirtualization exists: replacing a sequence of trapping instructions with a single hypercall collapses $N$ exits into $1$.

### Two-Level Address Translation

The guest OS maintains its own page tables mapping guest-virtual to guest-physical addresses. But guest-physical addresses are not real — they are an address space KVM manages, backed by host-virtual memory allocated via `mmap`. Reaching a real DRAM cell requires two translations:

$$\text{GVA} \xrightarrow{\text{guest PT}} \text{GPA} \xrightarrow{\text{EPT/NPT}} \text{HPA}$$

**Extended Page Tables** (Intel EPT) and **Nested Page Tables** (AMD NPT) extend the hardware MMU to walk both levels in a single TLB miss, producing a GVA→HPA entry cached directly in the TLB. Without EPT/NPT, the hypervisor must maintain **shadow page tables** that directly map GVA→HPA in software. Every guest write to its own page tables would trigger an EPT violation exit so the hypervisor could update the shadow tables — this was the dominant source of overhead in pre-EPT hypervisors.

A TLB miss under EPT requires walking up to $5 \times 4 = 20$ memory accesses (4 levels of guest PT + 4 levels of EPT per guest PT level, plus the final EPT walk). This is why hugepages matter: each TLB entry covers more address space, reducing miss frequency.

$$\text{TLB entries needed} = \left\lceil \frac{\text{Guest RAM}}{\text{Page Size}} \right\rceil$$

For 8 GB of guest RAM:

| Page size | TLB entries |
|---|---|
| 4 KB | $2{,}097{,}152$ |
| 2 MB | $4{,}096$ |
| 1 GB | $8$ |

KVM exposes hugepage backing to the guest via transparent hugepages (THP) or explicit `hugetlbfs` allocation on the host. The guest doesn't need to know — the EPT mappings use large entries regardless of what the guest's own page tables do.

### QEMU Handles Device I/O

KVM only virtualizes CPU execution and memory translation. Everything with a device model — disks, NICs, USB controllers, firmware — lives in QEMU userspace. When a guest driver accesses an emulated device register (e.g., writes to the e1000's command register at a specific I/O port), the sequence is:

1. Guest executes `OUT` instruction
2. CPU triggers VM exit (`EXIT_REASON_IO_INSTRUCTION`)
3. Kernel exit handler reads port/data from VMCS
4. Handler determines this port belongs to QEMU, writes to an `ioeventfd`
5. QEMU's event loop wakes, reads the I/O request from `struct kvm_run`
6. QEMU emulates the device, performs real I/O (e.g., `pwrite` to a disk image)
7. QEMU writes results back into guest memory and signals the guest via `irqfd`
8. KVM injects a virtual interrupt; guest driver receives completion

Steps 4–7 are the "QEMU round-trip." Each one is a context switch or syscall. For legacy device emulation, every register access in a device transaction may trigger a separate exit. A single guest disk read touching 10 device registers costs 10 exits plus the round-trip.

### Virtio Reduces Exit Count, Not Latency

Virtio replaces the register-per-operation protocol with a shared-memory ring buffer (**virtqueue**). The guest driver writes one or more descriptors into the ring, then writes to a single "doorbell" register to notify the host. That one write is the only exit per batch:

```
Guest memory (shared):
┌──────────────────────────────────────────┐
│  Descriptor Table  │  Available Ring  │  Used Ring  │
└──────────────────────────────────────────┘
         ↑ guest writes here          ↑ host writes completions here
```

The host reads the available ring, processes descriptors (doing real I/O), writes to the used ring, and raises an interrupt. The guest processes the used ring in its interrupt handler.

The protocol is defined by the VirtIO specification. The in-kernel implementation lives in `drivers/virtio/` (guest side) and `drivers/vhost/` (host side, for in-kernel vhost backend that avoids the QEMU round-trip entirely for network and block I/O).

For network I/O, `vhost-net` processes virtqueue descriptors in a kernel thread on the host, eliminating the QEMU userspace round-trip for the data path. Latency drops from ~$50\ \mu s$ (QEMU emulated) to ~$5\ \mu s$ (vhost-net) to ~$1\ \mu s$ (SR-IOV passthrough).

---

## How It Works

### The Kernel-Side Exit Handler

Inside `arch/x86/kvm/vmx/vmx.c`, the exit dispatch table maps exit reasons to handlers:

```c
// Simplified from arch/x86/kvm/vmx/vmx.c
// The actual table is vm
