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

## Core Concepts
### What a Hypervisor Is and Why It Exists
A hypervisor (or VMM) is a privileged software layer that presents to each guest operating system the illusion of exclusive access to the underlying hardware. The fundamental problem it solves is **resource multiplexing**: a single set of physical CPU cores, memory banks, and I/O devices must be shared among multiple mutually distrustful software stacks without allowing any guest to corrupt another or the host.  

If we denote the set of physical resources by \(R\) and the set of guests by \(G=\{g_1,\dots,g_n\}\), the hypervisor enforces a partition function  
\[
\pi : R \rightarrow \mathcal{P}(G)
\]  
that maps each resource to a subset of guests allowed to use it. The hypervisor must mediate every access attempt by a guest to ensure \(\pi\) is respected.

### Type 1 vs Type 2 Hypervisors – Architectural Consequences
| Property | Type 1 (Bare‑Metal) | Type 2 (Hosted) |
|----------|--------------------|-----------------|
| **Execution privilege** | Runs in CPU root mode (VMX‑root) – no intervening OS | Runs as a normal process in user mode; host OS kernel mediates hardware |
| **Attack surface** | Only the hypervisor code | Host OS kernel + hypervisor code |
| **Performance overhead** | Primarily VM‑exit/entry cost | Additional cost of host‑system calls for each privileged operation |
| **Typical use** | Data‑center servers, cloud infrastructure | Desktop virtualization, development, testing |

The *why*: a Type 1 hypervisor can execute guest instructions directly in VMX‑non‑root mode, only trapping when the guest attempts an operation that would violate \(\pi\) (e.g., accessing a control register, performing I/O). A Type 2 hypervisor must first transition to the host OS (a system call) before it can perform the same check, adding an extra context switch and possible scheduler delay.

### Hardware Virtualization Support (Intel VT‑x / AMD‑V)
Modern CPUs provide a **virtual machine control structure (VMCS)** that holds guest‑state and host‑state fields. When the CPU is in VMX‑non‑root mode, executing certain instructions (e.g., `CLI`, `STI`, `IN`, `OUT`, `MOV` to CR registers) causes a **VM‑exit**: control transfers to a predefined handler in the hypervisor, which examines the exit reason, emulates the operation if needed, then resumes the guest via **VM‑entry**.

The VMCS also supports **Extended Page Tables (EPT)** (Intel) or **Rapid Virtualization Indexing (RVI)** (AMD), which remap guest‑physical addresses to host‑physical addresses without hypervisor intervention for most memory accesses. This eliminates the need for shadow page tables and reduces the cost of address translation from \(O(\text{page‑walk})\) to a single hardware walk with two levels of translation.

Mathematically, the effective memory access time (EMAT) with EPT is:  
\[
\text{EMAT} = (1-m) \cdot t_{\text{cache}} + m \cdot \bigl(t_{\text{walk}}^{\text{guest}} + t_{\text{walk}}^{\text{host}}\bigr)
\]  
where \(m\) is the miss rate in the guest‑TLB, \(t_{\text{cache}}\) is cache hit latency, and each walk costs ~30‑40 cycles on modern cores. Without EPT, the hypervisor must intervene on every guest‑page‑table write, adding an extra VM‑exit per update.

### Guest/Host Boundary and Protection Rings
The CPU operates in privilege rings (0‑3). The host hypervisor runs in ring 0 (root mode). Guests are placed in ring 0 of their own virtual CPU but actually execute in VMX‑non‑root mode, which is *still* ring 0 from the hardware’s perspective but with a restricted set of privileged instructions that cause VM‑exits. Thus the hypervisor enforces the boundary by **trapping** any attempt by a guest to cross from its virtual ring 0 to operations that would affect the host (e.g., loading a new GDT, accessing MSRs that control VMX).

## How It Works
### Instruction Execution Flow
1. **VM‑Entry** – CPU loads guest state from VMCS (RIP, RSP, registers, CR3, etc.) and begins executing in VMX‑non‑root mode.  
2. **Execution** – Most instructions run natively.  
3. **VM‑Exit Trigger** – Occurs on:  
   * privileged instruction accesses (e.g., `CLI`, `hlt`, `invlpg`)  
   * I/O port accesses (`in`/`out`)  
   * MSR reads/writes not authorized by the MSR bitmap  
   * external interrupts, NMIs, or exceptions that exceed guest‑defined thresholds  
   * EPT violations (guest‑physical address not mapped)  
4. **Exit Handling** – Hypervisor reads VM‑exit qualification fields, decides whether to:  
   * emulate the instruction (e.g., perform the I/O operation on behalf of the guest)  
   * inject an event into the guest (e.g., deliver a timer interrupt)  
   * adjust guest state and resume  
5. **VM‑Entry** – Guest state restored, execution continues.

The cost of a VM‑exit/entry pair on modern Intel Xeon is roughly **1500‑2000 cycles** (~0.5 µs at 3 GHz). This dominates overhead for workloads that cause frequent exits (e.g., heavy I/O).

### CPU Scheduling and Time‑keeping
The hypervisor schedules virtual CPUs (vCPUs) onto physical pCPUs using its own scheduler (often a variant of CFS). Each vCPU receives a timeslice; when the slice expires, the hypervisor forces a VM‑exit via a **pre‑timer** (configured in the VMCS). The hypervisor then accounts the stolen time to the guest and may inject a virtual timer interrupt.

Mathematically, if a guest runs for \(t_g\) nanoseconds before a pre‑timer fires, the hypervisor incurs an overhead \(t_{ex}\) (exit+entry). The effective utilization seen by the guest is:  
\[
U_{\text{guest}} = \frac{t_g}{t_g + t_{ex}}
\]  
Minimizing \(t_{ex}\) (by reducing unnecessary exits via MSR bitmaps, EPT, and virtio) directly improves guest performance.

### Memory Virtualization with EPT
Without EPT, the hypervisor maintains **shadow page tables** that mirror the guest’s page tables but map guest‑virtual → host‑physical. Any change to a guest page‑table entry (PTE) triggers a VM‑exit so the hypervisor can update the shadow copy. With EPT, the guest’s CR3 points to a guest‑physical page table; the CPU walks this table to obtain a guest‑physical address, then walks the EPT to obtain the host‑physical address. Only when the EPT lacks a mapping (EPT violation) does a VM‑exit occur.

Thus the number of VM‑exits per memory access drops from **O(number of PTE updates)** to **O(number of EPT misses)**, which is typically near zero after the working set is mapped.

### I/O Virtualization
* **Emulated I/O** – Devices like the legacy PCI IDE controller are fully emulated; each I/O port read/write causes a VM‑exit.  
* **Paravirtualized I/O (virtio)** – The guest uses a special virtio PCI device; the hypervisor shares queues via shared memory. The guest writes descriptors, kicks the device via a MMIO write (which still causes a VM‑exit, but the exit is cheap and batches many I/O operations).  
* **Device Assignment (VFIO/Passthrough)** – The hypervisor assigns a physical PCI device directly to a guest using IOMMU protection. No VM‑exits for normal device operation; only initialization/unassignment cause exits.

## Worked Examples
### Example 1: Virtualizing a CPU – Measuring Exit Overhead
**Scenario**: A guest runs a tight loop that executes `hlt` (halt) 10 000 times. Each `hlt` triggers a VM‑exit because the instruction is privileged in VMX‑non‑root mode.

**Parameters** (Intel Xeon E5‑2680 v4, 2.4 GHz):
* VM‑exit+entry latency \(t_{ex} = 1800\) cycles ≈ 0.75 µs  
* `hlt` execution time in guest (if not trapped) ≈ 100 cycles ≈ 0.04 µs  

**Total time without trapping** (hypothetical):  
\[
T_{\text{raw}} = 10{,}000 \times 0.04\,\mu s = 400\,\mu s
\]

**Actual time with trapping**:  
\[
T_{\text{trap}} = 10{,}000 \times (0.04 + 0.75)\,\mu s = 7.9\,\text{ms}
\]

**Overhead factor**:  
\[
\frac{T_{\text{trap}}}{T_{\text{raw}}} \approx 197\times
\]

This illustrates why minimizing exits (e.g., using the `pause` loop instead of `hlt`, or configuring the MSR bitmap to allow `hlt`) is critical.

**Linux demonstration** (checking VM‑exit rate):
```bash
# Load kvm_intel with debug to expose VM-exit stats
sudo modprobe kvm_intel emulate_invalid_guest_state=0
# Run a simple guest with QEMU that executes hlt in a loop
qemu-system-x86_64 -enable-kvm -m 256 -cpu host \
   -kernel /boot/vmlinuz-$(uname -r) \
   -append "console=ttyS0" -nographic -serial mon:stdio \
   -device isa-debug-exit,iobase=0xf4,iosize=0x04
# In another terminal, watch VM-exit counters:
sudo perf stat -e kvm_exit -a sleep 5
```
The `kvm_exit` counter will show roughly the number of exits per second.

### Example 2: Virtualizing Memory – EPT Page‑Walk Cost
**Scenario**: A guest accesses an address that triggers a guest‑TLB miss, requiring a guest‑page‑table walk (4 levels) and an EPT walk (4 levels). Assume:
* Guest‑TLB miss rate \(m_g = 0.02\) (2 %)  
* Host‑TLB miss rate \(m_h = 0.001\) (0.1 %)  
* Cache hit latency \(t_{cache}=4\) cycles  
* Each page‑table walk level costs 5 cycles (L1 hit) → 20 cycles per walk  

**EMAT with EPT**:
\[
\begin{aligned}
\text{EMAT} &= (1-m_g) t_{cache} \\
&\quad + m_g \bigl[ (1-m_h)(t_{walk}^{g}+t_{walk}^{h}) + m_h (t_{walk}^{g}+t_{walk}^{h}+t_{penalty}) \bigr] \\
&\approx (0.98)(4) + 0.02\bigl[0.999(20+20) + 0.001(20+20+200)\bigr] \\
&\approx 3.92 + 0.02\bigl[39.96 + 0.202\bigr] \\
&\approx 3.92 + 0.803 \\
&\approx 4.72 \text{ cycles}
\end{aligned}
\]
Without EPT (shadow tables), each guest‑page‑table write causes a VM‑exit (~1800 cycles). If the guest modifies its page tables once every 10 000 memory accesses, the added overhead per access is:
\[
\frac{1800}{10{,}000} = 0.18 \text{ cycles}
\]
which is negligible compared to the 4.72 cycle EMAT, but the *variance* spikes dramatically on each update, causing latency jitter. EPT removes this jitter.

**Linux demonstration** (checking EPT usage):
```bash
# Verify that the CPU supports EPT
grep -E '(ept|vmx)' /proc/cpuinfo | head -n1
# Load kvm_intel with EPT enabled (default)
sudo modprobe kvm_intel ept=1
# Launch a guest and watch for EPT violations
qemu-system-x86_64 -enable-kvm -m 512 -cpu host \
   -drive file=ubuntu.qcow2,format=qcow2 \
   -monitor stdio
# Inside the QEMU monitor:
(info mem)
```
The output will show `EPT: enabled` and a count of `EPT violations` (should be near zero after boot).

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Understanding |
|---------|----------------|-----------------------|
| **Assuming VT‑x eliminates all overhead** | VT‑x only removes the need for binary translation of privileged instructions; VM‑exits for I/O, MSR accesses, and EPT violations still occur. | Measure exit rate (`perf stat -e kvm_exit`) and reduce unnecessary exits via MSR bitmaps, virtio, and device assignment. |
| **Confusing hypervisors with containers** | Containers share the host kernel; they do not provide hardware‑level isolation or run separate OS kernels. | A hypervisor creates separate VMCS and virtual hardware; containers use namespaces/cgroups. |
| **Believing Type 2 is always slower than Type 1** | If the host OS is idle and the Type 2 hypervisor uses KVM (which leverages VT‑x), the path length can be similar to Type 1; the extra host‑syscall overhead is only incurred on privileged operations, not on every instruction. | Benchmark with `qemu-system-x86_64 -enable-kvm` (Type 2 via KVM) vs. bare‑metal KVM (Type 1) – differences are often <5 % for CPU‑bound workloads. |
| **Neglecting IOMMU when assigning devices** | Without IOMMU protection, a malicious guest could DMA‑access host memory, breaking isolation. | Enable Intel VT‑d/AMD‑Vi, bind the device to `vfio-pci`, and verify with `dmesg | grep -I IOMMU`. |
| **Using the default `kvm_intel` parameters for production** | Defaults may enable excessive logging or disable features like `ept` or `flexpriority`, hurting performance. | Tune via `/etc/modprobe.d/kvm.conf` (e.g., `options kvm_intel ept=1 flexpriority=1 ple_gap=0 ple_window=0`). |

## Exercises
### Easy
1. **Check CPU virtualization support**  
   ```bash
   egrep -c '(vmx|svm)' /proc/cpuinfo
   ```
   Explain what the output means and which flag indicates Intel vs AMD.

2. **Load and unload KVM modules, list parameters**  
   ```bash
   sudo modprobe -r kvm_intel kvm
   sudo modprobe kvm_intel
   sudo systool -m kvm_intel -v
   ```
   Identify at least three module parameters and describe their effect.

### Medium
3. **Measure VM‑exit rate for a busy guest**  
   *Start a guest that runs a tight loop performing `in`/`out` to port 0x80 (legacy debug port).*  
   ```bash
   qemu-system-x86_64 -enable-kvm -m 256 -cpu host \
      -kernel /boot/vmlinuz-$(uname -r) \
      -append "console=ttyS0" -nographic -serial mon:stdio \
      -device isa-debug-exit,iobase=0x80,iosize=0x02
   ```
   In another terminal, run:
   ```bash
   sudo perf stat -e kvm_exit,kmem:kvmmem_alloc sleep 10
   ```
   Report exits per second and hypothesize why the rate is high.

4. **Create a shadow‑page‑table‑free guest using EPT**  
   *Boot a guest with `ept=1` (default) and then force an EPT violation by unmapping a guest‑physical page from the host.*  
   Inside the guest, allocate a page, write to it, then from the host use `kvm_ioctl` to delete the corresponding EPT entry (via `KVM_SET_USER_MEMORY_REGION`). Observe the VM‑exit and measure the latency with `rdtsc` around the fault.

### Hard
5. **Implement a minimal hypervisor using the KVM API**  
   Write a C program that:
   * Opens `/dev/kvm`  
   * Creates a VM (`KVM_CREATE_VM`)  
   * Allocates a vCPU (`KVM_CREATE_VCPU`)  
   * Sets up a simple real‑mode guest that prints “Hello” via the BIOS interrupt `0x10` (requires setting up the VMCS, entry/exit handlers).  
   * Runs the vCPU in a loop, handling `KVM_EXIT_IO` for port 0xE9 (debug port) to output characters to stdout.  
   * Use `ioctl(fd, KVM_RUN, ...)` and decode `struct kvm_run`.  
   * Bonus: Measure the average time per `KVM_RUN` iteration with `clock_gettime(CLOCK_MONOTONIC)`.

6. **Compare performance of virtio-blk vs. IDE emulation**  
   *Create two identical guests, one with `-drive if=none,format=qcow2,id=hd0 -device virtio-blk-pci,drive=hd0` and one with `-drive if=ide,format=qcow2,hd0`.  
   *Run `fio --name=randread --ioengine=libaio --direct=1 --bs=4k --rw=randread --size=1G --numjobs=4 --runtime=60` inside each guest.  
   *Report IOPS and latency, and explain the difference in terms of VM‑exit batching and interrupt handling.

## Linux Connection
### KVM – The Linux Kernel‑Based VM
* **Kernel module**: `kvm.ko` (core) + architecture‑specific (`kvm_intel.ko` or `kvm_amd.ko`).  
* **Device node**: `/dev/kvm` – a character device used by user‑space via ioctls.  
* **Key files**:
  * `/sys/module/kvm/parameters/` – tunables (e.g., `ignore_msrs`, `allow_unsafe_assigned_interrupts`).  
  * `/proc/cpuinfo` – look for `vmx` (Intel) or `svm` (AMD) flags.  
  * `/sys/kernel/debug/kvm/` (if `debugfs` mounted) – exposes VM‑exit statistics per vCPU.

### Commands to Verify and Tune
```bash
# 1. Verify hardware support
grep -E 'vmx|svm' /proc/cpuinfo | head -n1
# 2. Load modules with common tuning options
sudo modprobe kvm_intel \
    ept=1 \
    flexpriority=1 \
    ple_gap=0 \
    ple_window=0 \
    emulate_invalid_guest_state=0
# 3. Check current parameters
systool -m kvm_intel -v | grep -A2 -B2 "Parameters:"
# 4. List active VMs (via libvirt)
virsh list --all
# 5. QEMU command line using KVM acceleration
qemu-system-x86_64 -enable-kvm -m 4G -smp 4 -cpu host \
   -drive file=ubuntu.qcow2,format=qcow2,if=none,id=root \
   -device virtio-blk-pci,drive=root \
   -netdev user,id=net0,hostfwd=tcp::2222-:22 \
   -device virtio-net-pci,netdev=net0
```
### Virtio – Paravirtualized I/O in Linux
* **Kernel drivers**: `virtio_blk`, `virtio_net`, `virtio_scsi`, `virtio_rng`.  
* **Device tree**: Appear as PCI devices with vendor `0x1af4` (virtio).  
* **Queue layout**: Descriptor table, available ring, used ring in shared guest‑physical memory.  
* **Example**: Attach a virtio block device and monitor queue usage.
  ```bash
  # Inside guest
  lsblk  # should show vda
  # On host, check virtio queue stats
  cat /sys/bus/pci/devices/0000:00:05.0/virtio0/queues/rx0/avg_len
  ```

### Device Assignment (VFIO)
* **Kernel modules**: `vfio`, `vfio_pci`, `vfio_iommu_type1`.  
* **Procedure**:
  ```bash
  # 1. Bind device to vfio-pci
  sudo lspci -nnk | grep -i eth   # note PCI address, e.g., 02:00.0
  sudo echo "0000:02:00.0" > /sys/bus/pci/devices/0000:02:00.0/driver/unbind
  sudo echo "1af4 1000" > /sys/bus/pci/drivers/vfio-pci/new_id   # if needed
  sudo echo "0000:02:00.0" > /sys/bus/pci/drivers/vfio-pci/bind
  # 2. Launch QEMU with device assignment
  qemu-system-x86_64 -enable-kvm -m 2G \
     -device vfio-pci,host=02:00.0,id=gpu0 \
     -display none
  ```

## Why This Matters
Virtualization is the foundation of modern compute abstraction. By inserting a thin, hardware‑assisted layer between software and silicon, we gain:

* **Isolation** – Faults or malicious code in one guest cannot corrupt another or the host, because every privileged operation funnels through the VMCS and triggers a controlled VM‑exit.  
* **Utilization** – Data‑centers run dozens of VMs per physical server, amortizing the cost of expensive hardware (CPUs, NICs, NVMe) while maintaining predictable performance through mechanisms like EPT, virtio batching, and IOMMU‑protected device assignment.  
* **Security** – The hypervisor’s attack surface is deliberately minimized; most code runs in unprivileged guest context, and the VM‑exit handler can enforce policies (e.g., MSR filtering, EPT permissions) that are impossible in a monolithic kernel.  
* **Enablement of Higher‑Level Abstractions** – Cloud platforms (OpenStack, Kubernetes with KubeVirt), container runtimes (Kata Containers, gVisor) rely on VMs to provide stronger isolation than namespaces alone. Live migration, snapshots, and remote attestation are all built on the VM‑exit/entry model.  

Understanding the *why* behind each mechanism—why a VM‑exit costs ~1500 cycles, why EPT eliminates shadow‑table jitter, why virtio reduces exit frequency—allows you to tune, troubleshoot, and innovate beyond the defaults. Mastery of these principles prepares you to design efficient, secure virtualized infrastructures and to appreciate the trade‑offs when newer technologies (e.g., SEV‑SNP, TDX) add further layers of hardware‑enforced confidentiality.
