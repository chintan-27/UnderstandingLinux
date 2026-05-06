---
id: 159
title: "Magnetic storage basics"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Introduction to Magnetic Storage
Magnetic storage encodes bits as the orientation of magnetic domains in a thin ferromagnetic film. Each domain’s magnetic moment can be aligned either parallel or antiparallel to an applied write field, representing logical 0 or 1. The stability of a domain is governed by its **anisotropy energy** \(E_K = K V \sin^2\theta\), where \(K\) is the material anisotropy constant, \(V\) the volume of the grain, and \(\theta\) the angle between the moment and the easy axis. Thermal fluctuations can cause spontaneous reversal when \(k_B T \gtrsim E_K\); thus modern media increase \(K\) (using alloys like CoCrPt) and reduce grain volume to push the superparamagnetic limit to acceptable temperatures for multi‑year retention.

### Disk Structure
A hard‑disk drive (HDD) comprises one or more **platters** rotating on a spindle motor at a constant angular velocity \(\omega\). Each platter surface is divided into concentric **tracks** (typically hundreds of thousands per inch). Tracks are further split into **sectors**, the smallest addressable unit; legacy disks use 512 B sectors, while modern drives employ 4 KiB **Advanced Format** sectors to reduce overhead from inter‑sector gaps and error‑correction codes (ECC).  

The **read/write head** flies a few nanometers above the media on an air bearing created by the platter’s rotation. The head contains a **magnetoresistive (MR) sensor** for reading and an inductive coil for writing. Positioning is performed by a **voice‑coil actuator (VCA)** that moves the head radially across the platter with sub‑micron accuracy.

### Disk Performance Metrics
Three fundamental quantities characterize HDD performance:

1. **Throughput** (\(T\)): steady‑state data rate achievable when the head stays on a single track (sequential I/O).  
   \[
   T = \frac{\text{bytes per track}}{\text{time per revolution}} = \frac{S \times N_{\text{sectors/track}}}{60/\text{RPM}}
   \]
   where \(S\) is sector size.

2. **Rotational latency** (\(L_{\text{rot}}\)): average time for the desired sector to rotate under the head. For uniform sector distribution,
   \[
   L_{\text{rot}} = \frac{1}{2}\frac{60}{\text{RPM}} \;\text{seconds}.
   \]

3. **Average seek time** (\(L_{\text{seek}}\)): time for the VCA to move the head from its current track to the target track. It depends on stroke length, actuator mass, and coil force; empirically modeled as  
   \[
   L_{\text{seek}} = a + b\sqrt{D},
   \]
   where \(D\) is the distance in tracks, and \(a,b\) are drive‑specific constants (e.g., \(a\approx0.5\text{ ms}, b\approx0.1\text{ ms}/\sqrt{\text{track}}\) for a 7200 RPM drive).

**Access time** for a random I/O is the sum:
\[
L_{\text{access}} = L_{\text{seek}} + L_{\text{rot}}.
\]

**IOPS** (input/output operations per second) for random operations is the inverse of access time:
\[
\text{IOPS} = \frac{1}{L_{\text{access}}}.
\]

When the workload is sequential, the dominant term becomes the **transfer time** per sector:
\[
t_{\text{xfer}} = \frac{S}{T},
\]
and IOPS approximates \(\frac{1}{t_{\text{xfer}} \times N_{\text{sectors per request}}}\).

---

## How It Works
The lifecycle of a single I/O request in an HDD can be decomposed into four stages, each with a clear physical cause:

1. **Command processing & queuing** – The block layer receives a `struct bio` from the VFS, assigns it a scheduler (e.g., `mq-deadline`), and may merge it with adjacent requests. This step adds a fixed overhead \(t_{\text{cmd}}\) (typically 0.1–0.3 ms) that is independent of media mechanics.

2. **Seek** – The VCA drives the actuator arm. The force \(F = B I l\) (magnetic field \(B\), current \(I\), coil length \(l\)) accelerates the arm mass \(m\). Assuming a trapezoidal velocity profile, the seek time for a distance of \(\Delta t\) tracks is derived from the actuator’s acceleration limit \(a_{\max}\):
   \[
   L_{\text{seek}} = 
   \begin{cases}
   2\sqrt{\frac{\Delta t}{a_{\max}}} & \Delta t < \frac{v_{\max}^2}{a_{\max}}\\[4pt]
   \frac{\Delta t}{v_{\max}} + \frac{v_{\max}}{a_{\max}} & \text{otherwise}
   \end{cases}
   \]
   where \(v_{\max}\) is the maximum reachable radial velocity.

3. **Rotational latency** – While the head is positioned over the target track, the platter rotates at angular speed \(\omega = 2\pi \times \text{RPM}/60\). The expected wait for a uniformly distributed sector is half a revolution:
   \[
   L_{\text{rot}} = \frac{\pi}{\omega} = \frac{30}{\text{RPM}}\;\text{s}.
   \]

4. **Data transfer** – The MR sensor reads flux transitions as the disk spins under the head. The raw bit rate is limited by the **read channel bandwidth** \(B_{\text{ch}}\) (≈ 500 Mb/s for perpendicular recording). After accounting for ECC overhead (e.g., Reed‑Solomon parity adding ~10 %), the effective user‑data transfer time for a sector of size \(S\) bytes is
   \[
   t_{\text{xfer}} = \frac{8S}{B_{\text{ch}} \times (1 - \text{overhead})}.
   \]
   For a 4 KiB sector and \(B_{\text{ch}} = 500\text{ Mb/s}\), \(t_{\text{xfer}} \approx 66\ \mu\text{s}\).

5. **Completion** – The head lifts off the track, the actuator settles, and the block layer signals I/O completion via an interrupt.

**Access time** for a random 4 KiB read therefore is:
\[
L_{\text{access}} = t_{\text{cmd}} + L_{\text{seek}} + L_{\text{rot}} + t_{\text{xfer}}.
\]
Plugging typical numbers (7200 RPM, \(L_{\text{seek}}=5\) ms, \(L_{\text{rot}}=4.17\) ms, \(t_{\text{cmd}}=0.2\) ms, \(t_{\text{xfer}}=0.066\) ms) yields ≈ 9.44 ms, consistent with measured HDD latency.

---

## Worked Examples
### Example 1: Sequential Throughput of a 7200 RPM Drive
**Given:**  
- Rotational speed = 7200 RPM → \(\omega = 2\pi \times 7200/60 = 753.98\) rad/s.  
- Track density = 200 k tracks/inch, average sectors per track = 600 (typical for 4 KiB sectors).  
- Sector size \(S = 4096\) B.  

**Step‑by‑step:**  
1. Time per revolution: \(T_{\text{rev}} = 60/\text{RPM} = 8.33\) ms.  
2. Bytes per track: \(B_{\text{track}} = S \times 600 = 2.46\) MiB.  
3. Sequential throughput:  
   \[
   T = \frac{B_{\text{track}}}{T_{\text{rev}}}
     = \frac{2.46\times 2^{20}\text{ B}}{8.33\times10^{-3}\text{ s}}
     \approx 300\text{ MB/s}.
   \]
   (Real drives achieve ~200 MB/s due to zone bit recording and gaps; the calculation shows the upper bound.)

### Example 2: Random Read IOPS with Seek and Latency
**Given:**  
- Average seek time \(L_{\text{seek}} = 5\) ms (measured).  
- Rotational speed = 5400 RPM.  
- Command overhead \(t_{\text{cmd}} = 0.2\) ms.  
- Transfer time for 4 KiB sector \(t_{\text{xfer}} = 0.07\) ms (from Example 1).  

**Compute rotational latency:**  
\[
L_{\text{rot}} = \frac{30}{\text{RPM}} = \frac{30}{5400}\text{ s} = 5.56\text{ ms}.
\]

**Access time per I/O:**  
\[
L_{\text{access}} = t_{\text{cmd}} + L_{\text{seek}} + L_{\text{rot}} + t_{\text{xfer}}
                  = 0.2 + 5 + 5.56 + 0.07 \approx 10.83\text{ ms}.
\]

**IOPS:**  
\[
\text{IOPS} = \frac{1}{L_{\text{access}}} \approx \frac{1}{0.01083\text{ s}} \approx 92\text{ ops/s}.
\]

If the workload were **sequential**, the dominant term would be transfer time only:
\[
\text{IOPS}_{\text{seq}} = \frac{1}{t_{\text{xfer}}}\approx \frac{1}{0.00007}\approx 14{,}300\text{ ops/s},
\]
illustrating why random access vastly reduces effective IOPS.

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Correct Understanding |
|---|---------|----------------|-----------------------|
| 1 | **Treating “seek time” as a constant** | Seek time depends on the distance the actuator must travel; short strokes are faster due to acceleration limits, while long strokes saturate at \(v_{\max}\). Assuming a fixed 5 ms for all requests overestimates cost for nearby tracks and underestimates for full‑stroke seeks. | Use a seek‑time model \(L_{\text{seek}} = a + b\sqrt{D}\) (or the trapezoidal velocity profile) and account for the actual track distance in queuing algorithms. |
| 2 | **Neglecting the impact of command overhead and queue depth** | The block layer, scheduler, and interrupt handling add non‑negligible latency (≈ 0.2 ms). At high queue depths, the drive can reorder requests to reduce average seek, but ignoring this leads to pessimistic IOPS estimates. | Measure or model \(t_{\text{cmd}}\) and incorporate queueing theory (e.g., M/G/1) to predict how scheduling (CFQ, deadline) changes effective latency. |
| 3 | **Confusing raw bit rate with user data throughput** | The raw channel bandwidth includes sync patterns, ECC, and servo wedges; only a fraction (≈ 80‑90 %) is user data. Using the raw rate inflates throughput predictions. | Compute effective throughput as \(T_{\text{eff}} = B_{\text{ch}} \times (1 - \text{overhead}) \times \frac{S}{S+\text{overhead bytes}}\). For 4 KiB sectors with 10 % ECC overhead, effective rate ≈ 0.9×raw. |

---

## Exercises
### Easy
1. **Latency calculation** – A 5400 RPM HDD has an average seek time of 8 ms and command overhead of 0.15 ms. Compute the average access time for a random 4 KiB read (ignore transfer time).  
2. **Throughput bound** – Using the formula \(T = \frac{S \times N_{\text{sectors/track}}}{60/\text{RPM}}\), calculate the theoretical maximum sequential throughput for a drive with 7200 RPM, 500 sectors/track, and 4 KiB sectors.

### Intermediate
3. **IOPS comparison** – Two drives:  
   - Drive A: 7200 RPM, seek = 4 ms, overhead = 0.2 ms.  
   - Drive B: 10 000 RPM, seek = 2.5 ms, overhead = 0.2 ms.  
   Both use 4 KiB sectors and have negligible transfer time. Compute IOPS for each and comment on the influence of RPM vs. seek time.  
4. **Seek‑distance model** – Assume a drive’s seek follows \(L_{\text{seek}} = 0.5 + 0.1\sqrt{D}\) ms, where \(D\) is track distance. If a workload issues requests uniformly across the entire surface (average \(D = 0.5 \times \text{max tracks}\)), estimate the average seek time for a drive with 200 k tracks.

### Hard
5. **Queueing effect** – A solid‑state drive (SSD) has a service time of 0.1 ms per 4 KiB read. Using an M/M/1 queue model, derive the average response time as a function of offered load \(\lambda\) (requests/s). Determine the load at which the response time doubles relative to the idle service time.  
6. **Zone Bit Recording (ZBR) impact** – A drive uses ZBR with outer zones holding 600 sectors/track and inner zones 300 sectors/track, each zone comprising half the tracks. For 7200 RPM and 4 KiB sectors, compute the average sequential throughput across the whole surface, assuming uniform data distribution across zones.

---

## Linux Connection
Linux exposes HDD geometry and performance through the **block layer**, **sysfs**, and a suite of observability tools.

### Sysfs Interface
Each block device appears under `/sys/block/<dev>/`. Key attributes:
- `/sys/block/sda/queue/rotational` – `1` for HDD, `0` for SSD.  
- `/sys/block/sda/queue/scheduler` – current I/O elevator (e.g., `mq-deadline`, `bfq`, `none`).  
- `/sys/block/sda/device/model` – vendor/model string.  
- `/sys/block/sda/size` – number of 512‑byte sectors (use to compute capacity).  

You can change the scheduler at runtime:
```bash
# Switch to deadline scheduler for reduced latency on random workloads
echo deadline > /sys/block/sda/queue/scheduler
```

### Block Layer Statistics
The kernel exports per‑device statistics via `/proc/diskstats` and the more detailed `/sys/block/<dev>/stat`. Fields include:
- `reads completed`, `sectors read`, `time spent reading (ms)`  
- `writes completed`, `sectors written`, `time spent writing (ms)`  

A quick summary:
```bash
iostat -dx 1 5   # display extended stats every second, 5 samples
```
Output columns:
- `r/s`, `w/s` – read/write IOPS  
- `rkB/s`, `wkB/s` – throughput in KiB/s  
- `await` – average time (ms) for I/O to be issued and completed  
- `svctm` – average service time (time the drive actually spends on the I/O)  
- `%util` – percentage of CPU time the device was busy  

### Tuning via sysctl
The block layer’s **nomerges**, **nr_requests**, and **read_ahead_kb** can be adjusted:
```bash
# Increase read-ahead for sequential workloads
echo 256 > /sys/block/sda/queue/read_ahead_kb

# Limit queue depth to reduce latency under heavy load
echo 128 > /sys/block/sda/queue/nr_requests
```

### Tools for Deeper Analysis
- **`blktrace` / `blkparse`** – capture low-level I/O traces; useful for measuring seek distance distribution:
  ```bash
  blktrace -d /dev/sda -o - | blkparse -i -
  ```
- **`hdparm`** – query drive timings and perform cache flushes:
  ```bash
  hdparm -Tt /dev/sda   # cached and buffered read timings
  hdparm -C /dev/sda    # check power mode
  ```
- **`perf record -e block:block_rq_issue`** – count I/O submissions with call‑stacks to see which processes generate traffic.  
- **`dmsetup status`** – if using LVM or device‑mapper, view underlying device statistics.

### Example: Measuring Seek‑Intensive Workload
Create a random‑read workload with `fio` and observe latency:
```bash
cat > randread.fio <<EOF
[global]
ioengine=libaio
direct=1
rw=randread
bs=4k
size=1G
numjobs=4
runtime=60
group_reporting

[job1]
EOF

fio randread.fio
```
`fio` reports `lat (ns): min, avg, max` and `clat (ns): completion latency`, which can be correlated with the `await` column from `iostat` to verify that observed latency matches the theoretical \(L_{\text{seek}} + L_{\text{rot}}\).

---

## Why This Matters
Understanding the physics of magnetic recording and the mechanical timing of HDDs lets you predict performance beyond raw spec sheets. By modeling seek distance, rotational latency, and transfer time, you can:

- **Size storage arrays correctly** – choose spindle speed and platter density to meet IOPS targets for databases or virtualization.  
- **Tune the I/O scheduler** – match elevator algorithms (deadline for low‑latency random, bfq for fairness) to the dominant seek pattern revealed by `blktrace`.  
- **Interpret monitoring data** – distinguish whether high `await` stems from mechanical latency (high `svctm`) or software queuing (high `qtime`).  
- **Plan workload placement** – place sequential workloads (backups, media streaming) on outer zones where ZBR yields higher transfer rates, and keep random workloads on inner zones where seek distances are shorter on average.  
- **Make informed hardware decisions** – when SSD prices fall, compare the derived HDD IOPS (often < 200 ops/s for random 4 KiB) against SSD service times (< 0.1 ms → > 10 k ops/s) to justify tiering or migration.

Mastering these principles equips you to diagnose bottlenecks, optimize kernel tunables, and design storage hierarchies that balance capacity, cost, and performance—skills that are indispensable for any Linux systems engineer or performance‑focused developer.
