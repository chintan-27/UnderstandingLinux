---
id: 92
title: "Filesystem hierarchy and conventions"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Why This Matters

Every program you run makes silent assumptions about the filesystem layout. `bash` searches `PATH` entries like `/usr/bin` because that is where the FHS says executables live. `syslogd` opens `/var/log/syslog` because `/var` is defined as the writable runtime-state tree. `getpwuid()` opens `/etc/passwd` because that file's location is a compile-time constant in glibc. When these assumptions break — `/proc` not mounted so `ps` returns nothing, `/dev/null` missing so redirections hang, `/etc` world-writable so `sudo` refuses to run — the failures look unrelated to their cause. Understanding the hierarchy means you can read a failure and immediately know which assumption was violated and why.

---

## Core Concepts

### `/bin` and `/sbin` — Early-Boot Survival Constraint

The constraint that defines `/bin` is temporal, not categorical: these binaries must be reachable before any filesystem other than `/` is mounted. If `mount` lived in `/usr/bin` and `/usr` were on a separate block device, you could not mount `/usr` to retrieve `mount`. The circular dependency is broken by placing the minimum required tools — `sh`, `mount`, `ls`, `cp`, `fsck`'s front-end — on the root partition.

`/sbin` applies the same constraint to tools only the superuser needs during early boot or recovery: `fsck` (filesystem repair), `ip`/`ifconfig` (network bring-up), `init` itself. The distinction between `/bin` and `/sbin` is purely conventional — file permissions, not the directory, control who can execute them.

On modern distributions (Fedora, Ubuntu ≥ 20.04, Arch), `/bin`, `/sbin`, `/lib`, and `/lib64` are symlinks into `/usr`. The constraint is now satisfied differently: the initramfs carries its own copy of every tool needed before `/usr` is available, so the root partition can be merged.

```bash
# Check whether your distro has merged the hierarchy
ls -la /bin /sbin /lib
# On merged systems: /bin -> usr/bin, /sbin -> usr/sbin, /lib -> usr/lib
```

### `/usr` — Shareable, Read-Only System Software

`/usr` holds the bulk of installed software and can be mounted read-only, shared over NFS, or even be a squashfs image. The contents are not host-specific: `/usr/bin/python3` is the same binary whether it is on your laptop or a rack server running the same distro version. Host-specific state lives elsewhere precisely so `/usr` can remain static and shareable.

The original split between `/bin` and `/usr/bin` on early UNIX was literal disk space: the root disk was small, `/usr` was a larger second disk. This is historical trivia, but understanding it explains why the naming seems arbitrary — it is.

### `/etc` — Intentional, Human-Placed Configuration

The operational definition of `/etc`: files that are placed there deliberately (by a human or a package manager's post-install script) and never written by a running service. `/etc/fstab` tells the kernel what to mount. `/etc/resolv.conf` tells the resolver which nameservers to use. `/etc/ld.so.conf` tells the dynamic linker where to search for shared libraries.

The "no generated data" rule has a concrete consequence: you can tar up `/etc`, restore it to a fresh install of the same distro, and recover the system's configuration exactly. If services wrote runtime state into `/etc`, that guarantee breaks.

```bash
# Everything that changed in /etc in the last 7 days
find /etc -newer /etc/fstab -type f
# On systems with etckeeper, see the full change history
cd /etc && git log --oneline -20
```

### `/proc` — Kernel State Exported as Files

`/proc` is backed by the `procfs` kernel module. There are no inodes on any disk; when you `open("/proc/meminfo")`, the VFS calls `procfs`'s open handler, which allocates a `seq_file` context. Each `read()` invokes a kernel function that formats current memory statistics directly into the userspace buffer. The file size reported by `stat()` is zero because the kernel does not know in advance how many bytes it will produce — the data is generated lazily per `read()` call.

```bash
# Physical and available RAM directly from the kernel
cat /proc/meminfo | grep -E '^(MemTotal|MemAvailable|Buffers|Cached)'

# All sockets the kernel currently tracks (no netstat needed)
cat /proc/net/tcp   # hex local/remote addresses, connection state

# Kernel's view of your CPU
cat /proc/cpuinfo | grep -E '^(model name|cpu MHz|cache size)' | head -6
```

Every running process has a directory `/proc/<PID>/`. The kernel creates this directory entry when the process is forked and removes it when the process exits — the directory's lifetime is exactly the process's lifetime.

### `/sys` — The Kernel Object Model as a Filesystem

`sysfs` exposes the kernel's `kobject` hierarchy — every object registered with the driver model (PCI devices, USB devices, block devices, network interfaces, CPU topology) appears as a directory. Each `kobject` attribute becomes a file: reading it calls the attribute's `show()` function; writing it calls `store()`.

This design replaced ad-hoc `ioctl` calls for device configuration. Instead of a program needing to know a magic `ioctl` number compiled into a driver, it writes to a documented path:

```bash
# Read CPU 0's current scaling frequency (Hz)
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq

# Set the CPU frequency governor to performance mode
echo performance > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor

# Check the power state of a PCIe device
cat /sys/bus/pci/devices/0000:00:1f.2/power/runtime_status

# List network interface statistics without ip or ifconfig
cat /sys/class/net/eth0/statistics/rx_bytes
cat /sys/class/net/eth0/statistics/tx_packets
```

The path structure mirrors the kernel's internal `kobject` tree, which mirrors the hardware topology. `/sys/devices/` is the canonical tree; `/sys/class/` and `/sys/bus/` are symlink views over the same objects organized differently.

### `/dev` — Kernel I/O Dispatch Table as Files

A device file is an inode whose `i_rdev` field encodes a major and minor number. No data is stored in the inode beyond those two numbers and the file type (`S_IFBLK` or `S_IFCHR`). When a process opens `/dev/sda`, the VFS reads the major number (8) from the inode, looks it up in the kernel's block device table, and calls the `sd` (SCSI disk) driver's `open()` method with the minor number (0 = whole disk, 1 = first partition, ...) as context.

The major/minor split encodes two levels of dispatch: major selects the driver, minor selects the instance. For the SCSI disk driver, minor numbers follow a pattern: disk $n$ occupies minors $16n$ through $16n + 15$, where minor $16n$ is the whole disk and minors $16n + k$ (for $k \geq 1$) are partitions. So `/dev/sdb` is major 8, minor 16; `/dev/sdb3` is major 8, minor 19.

```bash
ls -l /dev/sda /dev/sda1 /dev/sda2 /dev/null /dev/zero /dev/urandom
# brw-rw---- root disk    8,  0  /dev/sda
# brw-rw---- root disk    8,  1  /dev/sda1
# brw-rw---- root disk    8,  2  /dev/sda2
# crw-rw-rw- root root    1,  3  /dev/null
# crw-rw-rw- root root    1,  5  /dev/zero
# crw-rw-rw- root root    1,  9  /dev/urandom

# Confirm major/minor numbers directly
stat /dev/sda --format='%t %T'   # hex major, minor
```

`/dev/null`, `/dev/zero`, and `/dev/urandom` are implemented by the `mem` driver (major 1). Their existence does not depend on any hardware; the kernel always registers them.

`udev` (or `systemd-udevd`) populates `/dev` at runtime by listening to kernel uevents via a `netlink` socket. When the kernel detects a new device, it emits a uevent; `udevd` receives it and creates the device node using `mknod()`. On a running system, `/dev` is a `tmpfs` mount — its contents exist only in RAM and are rebuilt on every boot.

### `/var` — Writable Runtime State

`/var` exists so that `/usr` can be mounted read-only. Everything a running service needs to write goes here:

| Path | Contents |
|---|---|
| `/var/log/` | Logs written by `syslogd`, `journald`'s legacy text output |
| `/var/lib/<service>/` | Persistent service state (e.g., `/var/lib/postgresql/`) |
| `/var/run/` → `/run/` | PID files, Unix sockets (tmpfs; cleared on boot) |
| `/var/spool/` | Queued data awaiting processing (print jobs, mail) |
| `/var/cache/` | Derived data that can be regenerated (package caches, font caches) |

On modern systems, `/var/run` is a symlink to `/run`, which is a separate `tmpfs` mounted very early in boot (before `/var` might be fsck'd). This ensures PID files and sockets are always available even if `/var` is on a separate partition that hasn't been mounted yet.

### `/home` — User Namespace

`/home` is structurally just a convention: programs locate a user's home directory via `getpwuid(getuid())->pw_dir` (which reads `/etc/passwd`) or the `$HOME` environment variable, not by constructing the path
