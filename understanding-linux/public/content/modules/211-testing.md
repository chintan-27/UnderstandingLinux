---
id: 211
title: "Testing"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Introduction to Testing in Linux
Testing in Linux is not a monolithic activity; it is stratified by the layer being validated and the failure modes it targets. Each stratum demands distinct techniques because faults manifest differently across the kernel, drivers, and user space.

* **Unit testing** isolates the smallest compilable unit—typically a single function or a set of tightly coupled functions—to verify its internal logic. The kernel provides *KUnit*, a lightweight framework that runs tests as regular kernel modules, enabling execution without user‑space overhead. Why unit test? Because a defect in a low‑level function (e.g., a mis‑handled reference count) can corrupt arbitrary state; catching it early prevents cascading failures.

* **Integration testing** checks the contracts between units—how a driver interacts with the kernel core, how syscalls traverse the VFS layer, or how netfilter hooks see packets. The *Linux Test Project* (LTP) and *kselftest* supply harnesses that spawn real kernel threads, allocate devices, and invoke syscalls, thereby exercising the actual kernel‑user boundary. Faults here often arise from mismatched expectations about locking, memory ownership, or asynchronous completion.

* **System testing** treats the whole kernel plus loaded modules and user‑space services as a black box. Tools such as *stress‑ng* and *ckermit* drive the system toward resource limits while monitoring health via `/proc/stat`, `/proc/meminfo`, and *ftrace*. System tests expose regression bugs that only appear under concurrent load (e.g., deadlocks when the scheduler and I/O subsystem contend for the same spinlock).

* **Stress testing** pushes specific subsystems beyond nominal capacity to reveal exhaustion, throttling, or instability. By deliberately over‑allocating CPU, memory, or I/O, we can observe the kernel’s out‑of‑memory (OOM) killer, CPU hotplug behavior, or I/O scheduler back‑pressure. The causal link: if a system cannot gracefully degrade, it will either hang or corrupt data under realistic spikes.

* **Fuzzing** feeds malformed or unexpected data to interfaces that parse external input—syscalls, ioctls, filesystem parsers, network protocols. Coverage‑guided fuzzers like *syzkaller* or *AFL* mutate inputs based on code‑path feedback, increasing the likelihood of hitting edge cases that trigger null‑pointer dereferences, buffer overflows, or use‑after‑free faults. The underlying principle: the probability of discovering a bug grows with the number of distinct execution paths exercised, which can be modeled as $P_{\text{detect}} = 1-(1-p)^n$, where $p$ is the per‑input probability of hitting a vulnerable path and $n$ is the number of fuzz iterations.

### Why Layered Testing Matters
Each layer addresses a different *failure propagation* model. Unit faults are *localized*; integration faults are *protocol* faults; system faults are *resource* faults; stress faults are *capacity* faults; fuzzing faults are *input validation* faults. Skipping any layer leaves a class of defects invisible to the others.

---

## How It Works
### 1. Test Planning
*Identify the test target* – decide whether the unit is a static inline function, a loadable module, a syscall wrapper, or a whole subsystem (e.g., the block layer).  
*Define the property* – express it as a predicate $P(state)$ that must hold before and after the operation (pre‑ and post‑conditions).  
*Select the harness* – KUnit for pure kernel functions, LTP/kselftest for syscall‑driven behavior, stress‑ng for resource exhaustion, syzkaller for syscall fuzzing.

### 2. Test Development
Write the test in the language of the harness:
* **KUnit** – a C file with `static void test_case(struct kunit *test)`; use `KUNIT_EXPECT_EQ(test, got, expected)`.
* **LTP** – a shell script or C program that calls `tst_resm(TPASS, ...)` or `tst_brk(TBROK, ...)` on failure.
* **stress‑ng** – no code; invoke via command line with appropriate stressors.
* **syzkaller** – a description file (`.syz`) that lists syscalls and their argument ranges; the harness generates C programs automatically.

### 3. Test Execution
* Build the test harness as a kernel module (`make -C /lib/modules/$(uname -r)/build M=$PWD modules`).  
* Insert it (`sudo insmod test.ko`) or run the userspace harness (`./ltp/runltp`).  
* For stress: `stress-ng --cpu 4 --vm 2 --vm-bytes 512M --timeout 30`.  
* For fuzzing: `syz-execprog -config=/etc/syzkaller/config.myprog -prog=/path/to/prog.syz`.

### 4. Test Analysis
* **Coverage** – run with `kcov` (`kcov --cover-dir=kcov_out ./test_binary`) or enable `CONFIG_KCOV` and view `debug/kcov`.  
* **Crash detection** – KUnit logs to `dmesg`; LTP writes results to `ltpconsole.log`; syzkaller produces a detailed report in `$WORKDIR/crashes/`.  
* **Regression detection** – compare current metrics (e.g., average syscall latency from `perf stat -e cycles:u`) against a baseline using a simple t‑test: $t = \frac{\bar{x}_1-\bar{x}_2}{\sqrt{s_1^2/n_1 + s_2^2/n_2}}$.

### 5. Test Reporting
* Export JUnit XML (`--junitxml=results.xml`) for CI ingestion.  
* For kernel tests, `kunit_tool parse` converts the kernel log into a JSON summary.  
* Stress‑ng outputs CSV (`--times`) that can be plotted with `gnuplot`.  
* Fuzzer reports include a minimized reproducing program (`repro.syz`) and a stack trace.

### Automation Benefits
Automation reduces *human error* (missed cleanup, incorrect command line) and enables *repeatability*: the same binary, same kernel config, same hardware yield identical outcomes. This repeatability is essential for regression detection across kernel releases.

---

## Worked Examples
### Example 1: Unit Testing a Character‑Device Driver with KUnit
**Driver code (`scull.c`)** – a simple “Simple Character Utility for Loading Localities” driver that implements `open`, `release`, `read`, `write`.  

```c
/* scull.c */
#include <linux/module.h>
#include <linux/fs.h>
#include <linux/uaccess.h>
#include <linux/slab.h>

#define SCULL_NR_DEVS 4
#define SCULL_QUANTUM 4000
#define SCULL_QSET 1000

struct scull_dev {
    void **data;
    int quantum;
    int qset;
    unsigned long size;
    struct semaphore sem;
    struct cdev cdev;
};

static struct scull_dev *scull_devices;

static int scull_open(struct inode *inode, struct file *filp)
{
    struct scull_dev *dev = container_of(inode->i_cdev, struct scull_dev, cdev);
    filp->private_data = dev;
    return 0;
}

static int scull_release(struct inode *inode, struct file *filp)
{
    return 0;
}

static ssize_t scull_read(struct file *filp, char __user *buf, size_t count,
                          loff_t *f_pos)
{
    struct scull_dev *dev = filp->private_data;
    if (down_interruptible(&dev->sem))
        return -ERESTARTSYS;
    if (*f_pos >= dev->size) {
        up(&dev->sem);
        return 0;
    }
    if (*f_pos + count > dev->size)
        count = dev->size - *f_pos;
    if (copy_to_user(buf, dev->data + (*f_pos / dev->quantum),
                     count)) {
        up(&dev->sem);
        return -EFAULT;
    }
    *f_pos += count;
    up(&dev->sem);
    return count;
}

/* write omitted for brevity */
...
static int __init scull_init(void)
{
    int i, devno = MKDEV(SCULL_MAJOR, 0);
    /* allocate devices, register chrdev region */
    ...
    return 0;
}
static void __exit scull_exit(void) { ... }
module_init(scull_init);
module_exit(scull_exit);
MODULE_LICENSE("GPL");
```

**KUnit test (`scull_kunit.c`)**  

```c
/* scull_kunit.c */
#include <kunit/test.h>
#include <linux/fs.h>
#include <linux/uaccess.h>
#include "scull.c"   /* compile test with driver sources */

static void scull_test_open_release(struct kunit *test)
{
    int fd = sys_open("/dev/scull0", O_RDWR, 0);
    KUNIT_EXPECT_EQ(test, fd >= 0, true);
    sys_close(fd);
}

static void scull_test_rw(struct kunit *test)
{
    int fd = sys_open("/dev/scull0", O_RDWR, 0);
    KUNIT_EXPECT_EQ(test, fd >= 0, true);
    const char msg[] = "KUnit rocks!";
    ssize_t w = sys_write(fd, msg, sizeof(msg));
    KUNIT_EXPECT_EQ(test, w, sizeof(msg));

    char rb[sizeof(msg)];
    loff_t off = 0;
    ssize_t r = sys_pread(fd, rb, sizeof(rb), off);
    KUNIT_EXPECT_EQ(test, r, sizeof(msg));
    KUNIT_EXPECT_EQ(test, memcmp(rb, msg, sizeof(msg)), 0);
    sys_close(fd);
}

static struct kunit_case scull_test_cases[] = {
    KUNIT_CASE(scull_test_open_release),
    KUNIT_CASE(scull_test_rw),
    {}
};

static struct kunit_module scull_test_module = {
    .name = "scull",
    .test_cases = scull_test_cases,
    .init = NULL,
    .exit = NULL,
};
module_test_module(scull_test_module);
```

**Build & Run**  

```bash
# 1️⃣ Install KUnit dependencies (Ubuntu)
sudo apt-get install -y libkunit-dev libelf-dev

# 2️⃣ Build the test as a module
make -C /lib/modules/$(uname -r)/build M=$PWD modules

# 3️⃣ Insert and run
sudo insmod scull_kunit.ko
dmesg | grep -A20 "KUnit: 2 passed"
```

*Explanation*: The test opens the device, writes a known pattern, reads it back via `pread`, and verifies byte‑wise equality. If the driver mishandles the quantum/qset calculations, the read will return garbage or a short count, causing the `KUNIT_EXPECT_EQ` to fail. The test runs in kernel space, so there is no context‑switch overhead, and any failure is instantly visible in the kernel log.

**Quantitative insight**: Assuming the driver has $L=150$ lines of executable code and the test covers $C=120$ lines (open, release, read, write paths), statement coverage is $\frac{C}{L}=80\%$. Adding a test for the `llseek` operation would raise coverage to $\frac{130}{150}=86.7\%$.

---

### Example 2: Stress‑Testing Memory Pressure with stress‑ng
Goal: trigger the OOM killer and observe its behavior.

```bash
# Allocate 2 VM workers, each requesting 800MB, for 45 seconds
stress-ng --vm 2 --vm-bytes 800M --timeout 45 --vm-keep \
          --metrics-brief
```

*What happens*:
1. Each `vm` worker calls `mmap(NULL, size, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0)`.
2. The kernel faults pages on first touch, expanding the process’s RSS.
3. When free memory + reclaimable pages < `watermark[min]`, the kernel initiates direct reclaim.
4. If reclaim cannot free enough pages, the OOM selector scores each task; the victim is killed and a message appears in `dmesg`:
   ```
   [ 123.456789] Out of memory: Kill process 12345 (stress-ng) score 896 or sacrifice child
   ```
5. The `--metrics-brief` flag prints a summary:  
   ```
   stress-ng: info:  [2] successful vm workers completed
   stress-ng: info:  [0] failures
   stress-ng: info:  [2] vm workers
   stress-ng: info:  [1600] MB total memory requested
   ```

**Derivation of expected memory pressure**:  
Total requested memory $M = workers \times vm\text{-}bytes = 2 \times 800\text{MiB} = 1600\text{MiB}$.  
If the system has $R=2048$ MiB RAM and swap $S=1024$ MiB, the combined commit limit is roughly $R+S=3072$ MiB. Since $M < R+S$, the OOM killer will not fire unless additional memory pressure exists (e.g., other workloads). To guarantee OOM, increase workers or size:  
```
stress-ng --vm 3 --vm-bytes 800M --timeout 30
```
Now $M=3\times800=2400$ MiB, still below commit limit but with overhead of page tables and kernel allocations, the reclaim scanner will start thrashing, observable via `vmstat 1` showing rising `si` (swap‑in) and `so` (swap‑out).

---

### Example 3: Fuzzing the `ext4` Filesystem ioctl with syzkaller
**Objective**: Find a missing bounds check in `ext4_ioctl` that could lead to heap overflow.

1. **Create a syzkaller config** (`myext4.cfg`):

```json
{
    "target": "linux/amd64",
    "http": "127.0.0.1:56741",
    "workdir": "/tmp/syzkaller",
    "kernel_obj": "/lib/modules/$(uname -r)/build",
    "sshkey": "",
    "procs": 4,
    "type": "qemu",
    "vm": {
        "count": 4,
        "kernel": "/boot/vmlinuz-$(uname -r)",
        "image": "ubuntu-22.04.img"
    },
    "repro": true,
    "leak": false,
    "sandbox": "none"
}
```

2. **Write a description file** (`ext4_ioctl.syz`) that invokes the ioctl:

```c
#include <sys/ioctl.h>
#include <fcntl.h>
#include <linux/fs.h>
#include <linux/ext4_fs.h>
#include <unistd.h>
#include <stdlib.h>
#include <stdint.h>

int main() {
    int fd = open("/dev/sda1", O_RDONLY);
    if (fd < 0) return 0;
    // IOCTL number: _IOW(0xEF, 0x02, struct arg_struct)
    struct arg {
        uint32_t cmd;
        char   data[0];
    } __attribute__((packed));
    struct arg *a = malloc(0x1000); // oversized buffer
    a->cmd = 0x1234;
    memset(a->data, 0xFF, 0xFF);
    ioctl(fd, 0xEF02, a); // triggers ext4_ioctl
    close(fd);
    free(a);
    return 0;
}
```

3. **Run the fuzzer**:

```bash
syz-manager -config=myext4.cfg
```

*What syzkaller does*:
- Starts QEMU instances with the kernel under test.
- Executes the generated program, captures coverage via `KCOV`.
- Mutates the `ioctl` argument struct, trying different sizes and values.
- When a crash occurs, it saves the minimal reproducing program (`syzkaller/crashes/.../repro.prog`) and a detailed report (`.../report.txt`).

**Sample report excerpt**:

```
FAIL ext4_ioctl+0x1a2/0x230 [ext4]
    BUG: KASAN: slab-out-of-bounds in ext4_ioctl+0x1a2/0x230
    Read of size 8 at addr ffff88003c7d1000 by task syz-executor.1/1234
    CPU: 0 PID: 1234 Comm: syz-executor.1 Not tainted 5.15.0-102-generic #112-Ubuntu
    ...
    CRASH: ext4_ioctl: negative length argument leads to memcpy(dst, src, -4)
```

*Why this matters*: The bug would allow a privileged user (or a malicious container) to trigger an out‑of‑bounds write, potentially leading to local privilege escalation. Detecting it via fuzzing before release prevents such exploits.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong (Root Cause) | How to Avoid |
|---|---------|----------------------------|--------------|
| 1 | **Testing only the “happy path”** (e.g., assuming `open` always succeeds) | Ignores error‑propagation paths; many kernel bugs arise from improper error handling (e.g., forgetting to `kfree` on `-ENOMEM`). | Use table‑driven tests that iterate over error codes returned by mocked internals or fault‑injection frameworks like `failcmd`. |
| 2 | **Running stress tests on a production server without isolation** | Stress‑ng can consume all CPU or memory, causing service disruption or data loss. | Run stress in a dedicated namespace (`unlink --map-root-user`) or inside a VM/container with resource limits (`cgroup v2: max memory=2G`). |
| 3 | **Fuzzing without sanitizers** (e.g., no KASAN, UBSAN) | Crashes may be silent; memory corruption can corrupt unrelated structures, making bugs nondeterministic. | Build the kernel with `CONFIG_KASAN=y CONFIG_UBSAN=y` and run syzkaller under those configs; sanitizers emit detailed reports. |
| 4 | **Neglecting to clean up test resources** (leaving device nodes, mount points, or allocated memory) | Leaked resources accumulate across test runs, causing flaky failures or exhausting limits (e.g., `max_user_instances`). | Implement teardown hooks in KUnit (`module_exit`) or use `trap` in shell scripts; verify with `ls /dev/*` or `mount` after each test. |
| 5 | **Using outdated LTP tests against a new kernel** | LTP may rely on deprecated syscall interfaces; false passes hide regressions. | Pin LTP version to the kernel tree (`git submodule`) and run `ltp/runltp -f` with `-p` to only run relevant test groups. |
| 6 | **Ignoring flaky tests caused by race conditions** | Non‑deterministic passes/breaks erode trust in the test suite. | Increase iteration count, add deterministic ordering (e.g., `mutex_lock` in test), or use `ktest`’s `--repeat` flag to detect flakiness. |

---

## Exercises
### Easy
1. **KUnit sanity check** – Write a KUnit test for the kernel function `int add_int(int a, int b) { return a + b; }` placed in a separate source file. Build, insert, and verify the test passes.  
   *Goal*: Familiarize with KUnit macros and module build system.

### Medium
2. **Controlled memory pressure** – Using `stress-ng`, allocate exactly 75% of total RAM (obtain via `grep MemTotal /proc/meminfo`) for 20 seconds, while monitoring `vmstat 1`. Capture the output and compute the average page‑in rate (`si`) during the stress window.  
   *Goal*: Practice quantifying stress impact and interpreting kernel memory statistics.

### Hard
3. **Syzkaller regression hunt** – Pick a recent commit that introduced a bug in the `btrfs` ioctl tree‑search (e.g., CVE‑2023‑XXXXX).  
   a) Build the kernel *without* the fix, run syzkaller for 10 minutes, and confirm a crash is reproduced.  
   b) Apply the fixing patch, rerun the fuzzer for the same duration, and show that no crash occurs.  
   c) Write a short report (≤200 words) describing the root cause and how the fuzzer’s coverage feedback helped isolate it.  
   *Goal*: End‑to‑end experience of building, configuring, and triaging a kernel fuzzing campaign.

---

## Linux Connection
Linux provides first‑class testing infrastructure that maps directly to the concepts above.

| Concept | Linux Subsystem / Tool | Typical Invocation | Example Command |
|---------|------------------------|--------------------|-----------------|
| Unit testing (kernel) | **KUnit** (`CONFIG_KUNIT=y`) | Build as module, run via `kunit_tool` | `kunit_tool run --kunitconfig=kunitconfig .` |
| Unit testing (userspace) | **cmocka**, **GoogleTest** (via `apt`) | Standard `make test` | `make -C /usr/src/linux-headers-$(uname -r) test` |
| Integration testing (syscall) | **Linux Test Project (LTP)** | `./runltp -f` (functional) or `-s` (stress) | `./runltp -f -l net` |
| System testing (regression) | **kselftest** (`tools/testing/selftests/`) | `make -C /lib/modules/$(uname -r)/build M=$PWD kselftest` | `make -C /tools/testing/selftests/kvm run_tests` |
| Stress testing | **stress-ng** (package `stress-ng`) | `stress-ng --cpu $(nproc) --io 4 --vm 2 --vm-bytes 50
