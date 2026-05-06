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

## Core Concepts
### What KVM Is
KVM (Kernel‑based Virtual Machine) is a **loadable kernel module** that turns the Linux kernel into a **type‑1 hypervisor** by leveraging CPU hardware virtualization extensions (Intel VT‑x or AMD‑V). Unlike hosted hypervisors, KVM runs VMs **directly on the host hardware**; the kernel itself handles privileged operations, while device emulation is delegated to a user‑space program (usually QEMU).

### Why Hardware Assistance Matters
Without VT‑x/AMD‑V, a VMM must use **binary translation** or **full software emulation** to trap and reinterpret privileged instructions. This adds interpretive overhead on every sensitive instruction (e.g., `LGDT`, `CLI`, `INVLPG`). Hardware virtualization introduces a **new processor mode**—*VMX root* (host) and *VMX non‑root* (guest)—so that the CPU can automatically:

1. **Intercept** privileged guest attempts via VM‑exits,
2. **Restore** host state without software inspection,
3. **Resume** guest execution via VM‑entry.

The cost of a VM‑exit is bounded (≈ 1–2 µs on modern CPUs) and is amortized over the many instructions executed between exits, yielding near‑native performance for most workloads.

### Guest‑Physical ↔ Host‑Physical Address Translation
KVM uses **shadow page tables** (or, when available, **nested paging/EPT**) to translate a guest‑virtual address (GVA) → guest‑physical address (GPA) → host‑physical address (HPA).  

*Shadow paging*: The hypervisor maintains a copy of the guest’s page tables that map GVA → HPA directly. On every write to a guest page‑table entry (PTE), the kernel must **protect** the guest page‑table page (set it read‑only) and intercept the write to update the shadow copy.  

*Nested paging* (EPT/VPID): The CPU maintains two levels of translation: guest page tables (GVA→GPA) and an **EPT** table (GPA→HPA). The guest can modify its own page tables without causing a VM‑exit; only EPT misconfigurations trigger exits. This reduces exit frequency dramatically.

#### Memory‑overhead Derivation (shadow paging)
Assume a 4‑level x86‑64 page table, page size $P = 4\text{KB}$, PTE size $= 8\text{B}$. To map a guest memory region of size $S$:

- Level 0 (leaf) entries needed: $S/P$  
  Memory for leaf PTEs: $(S/P) \times 8\text{B} = \frac{S}{512}\text{B}$
- Level 1 entries: $\frac{S}{P \times 512}$ → memory $= \frac{S}{512^2}\text{B}$
- Level 2: $\frac{S}{512^3}\text{B}$
- Level 3 (PML4): $\frac{S}{512^4}\text{B}$

Total shadow‑table memory:
$$
M_{\text{shadow}} = S\!\left(\frac{1}{512} + \frac{1}{512^2} + \frac{1}{512^3} + \frac{1}{512^4}\right) \approx S \times 0.0078
$$
Thus a 1 GB guest consumes ≈ 8 MB of shadow tables (~0.8 % overhead). With EPT, the guest’s own page tables remain in guest memory; the host only needs a single EPT table (~$S/512$ bytes), cutting overhead to < 0.1 %.

### Core Components
| Component | Role | Implementation |
|-----------|------|----------------|
| **kvm.ko** | Kernel module providing `/dev/kvm` and VM‑management ioctls | `kernel/kvm/` |
| **kvm_intel.ko / kvm_amd.ko** | Architecture‑specific VMX/SVM support | `arch/x86/kvm/` |
| **QEMU** | User‑space device emulator, I/O backend, and VMM launcher | `qemu-system-x86_64` (package `qemu-kvm`) |
| **libvirt** | Daemon (`libvirtd`) offering stable XML API, storage, networking, and lifecycle tools | `/etc/libvirt/`, `/var/lib/libvirt/` |

---

## How It Works
### KVM API Overview (ioctl‑based)
All interactions with KVM happen through file descriptors opened on `/dev/kvm`. The primary ioctls are:

| ioctl | Purpose | Typical struct |
|-------|---------|----------------|
| `KVM_CREATE_VM` | Create a VM object, returns a VM fd | none |
| `KVM_SET_USER_MEMORY_REGION` | Register a guest‑physical memory slot | `struct kvm_userspace_memory_region` |
| `KVM_CREATE_IRQCHIP` | Create an emulated PIC/IOAPIC | none |
| `KVM_CREATE_VCPU` | Allocate a VCPU fd | none |
| `KVM_RUN` | Enter guest mode until a VM‑exit | `struct kvm_run` |
| `KVM_GET_REGS / KVM_SET_REGS` | Access guest registers | `struct kvm_regs` |
| `KVM_GET_SREGS / KVM_SET_SREGS` | Access special registers (CR0‑CR4, GDT, IDT) | `struct kvm_sregs` |

#### Example: Creating a 256 MiB VM
```c
int kvm_fd = open("/dev/kvm", O_RDWR);
int vm_fd  = ioctl(kvm_fd, KVM_CREATE_VM, 0);

/* Define a memory slot: guest physical 0x0–0x10000000 maps to host anonymous memory */
struct kvm_userspace_memory_region mem = {
    .slot   = 0,
    .flags  = 0,
    .guest_phys_addr = 0x0,
    .memory_size     = 0x10000000,   /* 256 MiB */
    .userspace_addr  = (unsigned long)mmap(NULL, 0x10000000,
                                          PROT_READ|PROT_WRITE,
                                          MAP_PRIVATE|MAP_ANONYMOUS, -1, 0)
};
ioctl(vm_fd, KVM_SET_USER_MEMORY_REGION, &mem);
```
After registering memory, VCPUs are created with `KVM_CREATE_VCPU` and run via `KVM_RUN`. Each `KVM_RUN` returns a `struct kvm_run` whose `exit_reason` field tells the host why the VM exited (e.g., `KVM_EXIT_IO` for port‑mapped I/O, `KVM_EXIT_HLT` for halt, `KVM_EXIT_MMIO` for memory‑mapped I/O).

### QEMU’s Role
QEMU is not a hypervisor; it is a **device emulator** that:

1. **Allocates** guest RAM via `mmap` and registers it with KVM using the above ioctl.
2. **Creates** VCPUs and runs the main loop invoking `KVM_RUN`.
3. **Handles** VM‑exits: for each `KVM_EXIT_IO` it emulates in/out ports; for `KVM_EXIT_MMIO` it maps the address to a virtual device (virtio‑blk, virtio‑net, e1000, etc.).
4. **Provides** a command‑line interface (`-enable-kvm`) that hides the ioctl complexity.

When launched with `-enable-kvm`, QEMU essentially becomes a thin wrapper around the KVM API; without it, QEMU falls back to **TCG** (tiny code generator) and runs entirely in software.

### Virtual Devices & VirtIO
KVM delegates I/O to QEMU, which implements **virtio** para‑virtualized devices:

- **virtio‑blk**: block device, uses virtqueues in shared host‑guest memory.
- **virtio‑net**: network device, can be backed by a TAP, bridge, or vhost‑net (kernel‑accelerated).
- **virtio‑console**: serial‑like console for logs.
- **virtio‑rng**: entropy source.

The virtio driver in the guest negotiates feature bits via the virtio configuration space; the host (QEMU or vhost‑net) processes packets directly, avoiding extra copies.

### CPU Scheduling & NUMA Awareness
Each VCPU is a regular Linux task (visible via `ps -L`). The CFS scheduler treats VCPUs like any other thread, but latency‑sensitive workloads benefit from:

- **CPU pinning**: `virsh vcpupin <domain> <vcpu> <cpulist>`.
- **NUMA placement**: `virsh numatune <domain> --mode strict --nodeset 0` ensures guest memory is allocated from a specific NUMA node, reducing remote‑node latency.
- **Thread‑level isolation**: allocating a dedicated `vhost-worker` thread per virtio device via `vhost-net`.

### Security Boundaries
- The VM fd and VCPU fds are ordinary file descriptors; their permissions are governed by the process that opened `/dev/kvm`. Typically only root (or users in the `kvm` group) can open it.
- Device assignment via **VFIO** (`vfio-pci`) passes a PCI device directly to the guest, bypassing QEMU emulation. The IOMMU must isolate the device’s DMA to the guest’s memory, preventing hostile DMA from affecting the host.

---

## Worked Examples
### Example 1: Creating a VM with `virt-install` (step‑by‑step)
Goal: provision an Ubuntu 22.04 VM with 2 GiB RAM, 2 vCPUs, 20 GiB qcow2 disk, virtio‑net bridged to `virbr0`, and cloud‑init user‑data.

```bash
# 1. Verify host supports KVM
grep -E '(vmx|svm)' /proc/cpuinfo   # should show vmx or svm
lsmod | grep kvm                    # kvm_intel or kvm_amd loaded

# 2. Create a cloud‑init ISO (optional)
cat > user-data <<'EOF'
#cloud-config
hostname: kvm-demo
users:
  - name: ubuntu
    sudo: ALL=(ALL) NOPASSWD:ALL
    groups: users, admin
    shell: /bin/bash
    lock_passwd: false
    ssh_authorized_keys:
      - ssh-rsa AAAAB3... user@example.com
EOF
cloud-localds seed.iso user-data meta-data   # meta-data can be empty

# 3. Install the VM
virt-install \
  --name ubuntu-demo \
  --ram 2048 \
  --vcpus 2 \
  --cpu host \
  --disk size=20,format=qcow2 \
  --cdrom /var/lib/libvirt/boot/ubuntu-22.04-live-server-amd64.iso \
  --disk seed.iso,device=cdrom \
  --network bridge=virbr0,model=virtio \
  --os-variant ubuntu22.04 \
  --graphics none \
  --console pty,target_type=serial \
  --noautoconsole
```
**Why each flag?**

| Flag | Reason |
|------|--------|
| `--cpu host` | Exposes the host’s exact CPU feature set (including VT‑x/AMD‑V, AES‑NI, etc.) so the guest can use them. |
| `--disk size=20,format=qcow2` | qcow2 supports snapshots and compression; the size is the *virtual* size, actual allocation grows on demand. |
| `--network bridge=virbr0,model=virtio` | Uses the libvirt‑managed bridge; virtio gives near‑native throughput (~10 Gbps on a 10 GbE host). |
| `--graphics none --console pty,target_type=serial` | Disables graphical console (saves GPU memory) and uses a serial console accessible via `virsh console`. |
| `--os-variant ubuntu22.04` | Libvirt picks optimal machine type (`pc-q35-6.2`) and enables hypervisor features (e.g., `apic`, `hyperv`). |

After installation, verify:
```bash
virsh list --all
# Output shows ubuntu-demo in "shut off" state
virsh start ubuntu-demo
virsh console ubuntu-demo   # press Enter to get login prompt
```

### Example 2: Adjusting VM Memory at Runtime
```bash
# Current memory
virsh domifstat ubuntu-demo | grep 'memory'   # or use dommemstat
# Set to 4 GiB (must be ≤ max memory defined in XML)
virsh setmem ubuntu-demo 4096 --config   # --config persists across reboots
# If you need to change max memory, edit XML:
virsh edit ubuntu-demo
# <memory unit='MiB'>4096</memory>
# <currentMemory unit='MiB'>4096</currentMemory>
```
**Why `--config`?** Without it, the change is transient and will be lost after a shutdown; `--config` updates the persistent XML so the next boot uses the new size.

### Example 3: Pinning VCPUs to Specific Host CPUs
```bash
# Show current VCPU placement
virsh vcpuinfo ubuntu-demo
# Pin VCPU0 to host CPU2, VCPU1 to CPU3
virsh vcpupin ubuntu-demo 0 2
virsh vcpupin ubuntu-demo 1 3
```
**Why pinning?** Prevents the host scheduler from migrating VCPUs away from cores that share LLC (last‑level cache) with the guest’s working set, reducing cache‑miss latency especially for memory‑intensive workloads.

### Example 4: Using VFIO to Assign a Physical NIC
Assume the host has an Ethernet controller at `0000:03:00.0` (Intel X710).
```bash
# 1. Bind the device to vfio-pci (requires IOMMU enabled in kernel)
echo 'vfio-pci' | sudo tee /sys/bus/pci/devices/0000:03:00.0/driver/override
echo '0000:03:00.0' | sudo tee /sys/bus/pci/devices/0000:03:00.0/driver/unbind
echo '0000:03:00.0' | sudo tee /sys/bus/pci/drivers/vfio-pci/bind

# 2. Add to VM XML (via edit)
virsh edit ubuntu-demo
```
Inside the `<devices>` section add:
```xml
<hostdev mode='subsystem' type='pci' managed='yes'>
  <source>
    <address domain='0x0' bus='0x03' slot='0x00' function='0x0'/>
  </source>
  <address type='pci' domain='0x0' bus='0x0' slot='0x05' function='0x0'/>
</hostdev>
```
**Why managed='yes'?** Libvirt will detach the device from the host driver before assigning it to the guest and re‑attach it on VM shutdown, keeping the host usable.

---

## Common Mistakes
### 1. Forgetting to Enable CPU Virtualization in BIOS/UEFI
- **What’s wrong:** `kvm_intel` (or `kvm_amd`) loads but `dmesg` shows `VMX: disabled by BIOS`.
- **Why it matters:** Without VT‑x/AMD‑V the kernel falls back to **software emulation** (TCG), which is **10‑100× slower**. The symptom is high CPU usage in `qemu-system-x86_64` processes and `VM exits` dominated by `KVM_EXIT_IO` for simple MMIO.
- **How to avoid:** In BIOS, enable “Intel Virtualization Technology” (VT‑x) or “AMD Virtualization” (SVM). Verify after boot with `dmesg | grep -i vmx` or `grep -E 'vmx|svm' /proc/cpuinfo`.

### 2. Launching QEMU Without `-enable-kvm`
- **What’s wrong:** Running `qemu-system-x86_64 -hda disk.img` works but the VM crawls.
- **Why it matters:** The absence of `-enable-kvm` tells QEMU to use its **TCG** interpreter. No KVM ioctls are used; all privileged instructions are translated in software, causing frequent `vm_exit` equivalents in TCG and massive overhead.
- **How to avoid:** Always add `-enable-kvm` when you intend to use hardware acceleration, or rely on libvirt/virt-install which injects it automatically.

### 3. Overcommitting Host Memory Without Swapping Considerations
- **What’s wrong:** Creating several VMs whose *configured* RAM exceeds host RAM, assuming the hypervisor will reclaim unused memory via ballooning.
- **Why it matters:** If guests actually use their allocated memory (e.g., in‑memory databases), the host will start swapping. Swapping introduces **millisecond‑scale latency** and can stall I/O, defeating the purpose of virtualization.
- **How to avoid:** Use `virsh dommemstat` to monitor actual usage, enable **memory ballooning** (`<memballoon model='virtio'/>`) only when you have a balloon driver in the guest, and enforce a hard limit via `maxMemory` in the domain XML. Consider **transparent huge pages** (THP) only after testing, as they can cause uneven latency.

### 4. Misconfiguring VirtIO Queue Size Leading to Dropped Packets
- **What’s wrong:** Setting `<driver queues='4'/>` on a virtio‑net while the guest driver only allocates 1 queue.
- **Why it matters:** Virtio uses *virtqueues*; a mismatch causes the host to place descriptors in queues the guest never consumes, leading to **tx/rx ring overflow** and packet loss.
- **How to avoid:** Ensure the guest’s driver parameters match the host: e.g., in Linux guest, `ethtool -L eth0 combined 4` to set 4 queues, or use `multiqueue=on` in the XML and verify with `virsh dumpxml` and `ethtool`.

### 5. Ignoring NUMA Placement When Assigning Large Memory
- **What’s wrong:** A VM with 64 GiB RAM on a dual‑socket host gets all its memory allocated from node 0, leaving node 1 idle.
- **Why it matters:** Remote‑node memory accesses incur ~ 60‑120 ns extra latency (vs ~ 80 ns local) and reduce memory bandwidth, hurting performance of NUMA‑aware workloads (e.g., in‑memory analytics).
- **How to avoid:** Use `virsh numatune <domain> --mode strict --nodeset 0,1` or `virsh setmem <domain> --current --config` with `<numatune>` in XML to bind memory to specific nodes, and optionally bind VCPUs with `vcpupin`.

---

## Exercises
### Easy
1. **Check KVM readiness** – Run `kvm-ok` (from `cpu-checker` package) and verify it reports `KVM acceleration can be used`.
2. **Create a minimal VM** – `virt-install --name test --ram 512 --vcpus 1 --disk size=5,format=qcow2 --cdrom /path/to/ubuntu.iso --noautoconsole --graphics none --console pty,target_type=serial`. Start it, log in via `virsh console test`, and run `uname -a`.
3. **Inspect VCPU threads** – After starting the VM, run `ps -Lf -C qemu-system-x86_64` and note the LWP IDs; correlate with `virsh vcpuinfo test`.

### Medium
1. **Enable nested virtualization** – On an Intel host, add `options kvm_intel nested=1` to `/etc/modprobe.d/kvm.conf`, reload the module, then create a VM that itself runs KVM (`virt-install --cpu host --features nested=1`). Verify inside the guest with `kvm-ok`.
2. **Configure a virtio‑scsi disk with write‑back cache** –  
   ```bash
   virt-install --name scsi-test \
     --ram 1024 --vcpus 1 \
     --disk size=10,format=qcow2,cache=writeback,io=native,bus=scsi \
     --cdrom /path/to/ubuntu.iso \
     --graphics none --console pty,target_type=serial
   ```
   Inside the guest, install `scsi-debug` and run `hdparm -tT /dev/sda` to measure throughput; compare with default `cache=none`.
3. **Set up a vhost‑net accelerated virtual network** –  
   ```bash
   # Ensure vhost-net module is
