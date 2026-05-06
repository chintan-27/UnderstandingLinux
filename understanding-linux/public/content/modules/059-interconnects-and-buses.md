---
id: 59
title: "Interconnects and buses"
supermoduleId: 5
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Organization and Design (Patterson and Hennessy)"
  - type: book
    title: "Computer Architecture A Quantitative Approach (Hennessy)"
---

## Core Concepts
### Interconnects vs. Buses – a hierarchical view
A computer system moves data through a hierarchy of communication layers:  

* **On‑chip interconnects** (e.g., AXI, NoC) sit inside a silicon die and connect cores, caches, accelerators, and memory controllers.  
* **Package‑level interconnects** (e.g., EMIB, silicon interposers, PCIe‑based CCIX) bind multiple dies together.  
* **Board‑level buses** (e.g., DDR memory bus, PCIe expansion slots, SATA, USB) link the CPU/package to peripheral cards and DIMMs.  
* **System‑level fabrics** (e.g., HyperTransport, Intel UPI, CCIX) connect multiple sockets or nodes in a chassis.

Each layer trades off **bandwidth**, **latency**, **cost**, and **scalability**. A bus is a *shared* medium where many devices contend for the same physical wires; an interconnect is often *point‑to‑point* or *switched*, reducing contention but requiring more routing logic.

### Bandwidth and latency from first principles
Consider a serial link of raw line rate $R$ bits/s. If each transmitted frame contains $H$ bits of header/footer (protocol overhead) and $P$ bits of payload, the *useful* bandwidth is  

$$
B_{\text{useful}} = R \times \frac{P}{P+H}.
$$

Latency $L$ for a single transaction consists of:
1. **Serialization delay** $t_{\text{ser}} = \frac{P+H}{R}$ – time to push the frame onto the wire.  
2. **Propagation delay** $t_{\text{prop}} = \frac{d}{v}$ – distance $d$ divided by signal velocity $v\approx 2\times10^8$ m/s in PCB.  
3. **Switching/arbitration delay** $t_{\text{arb}}$ – time for arbitration logic to grant access.  
4. **Processing delay** $t_{\text{proc}}$ – time for the receiver to decode header, check CRC, and buffer the payload.

Thus  
$$
L = t_{\text{ser}} + t_{\text{prop}} + t_{\text{arb}} + t_{\text{proc}}.
$$

Increasing line rate $R$ reduces $t_{\text{ser}}$ but does not affect $t_{\text{prop}}$ or $t_{\text{arb}}$; therefore, beyond a certain point latency is dominated by fixed components.

### Arbitration and flow control
When multiple agents share a medium, an arbiter grants the right to transmit. Common policies:
* **Fixed priority** – deterministic but can starve low‑priority agents.  
* **Round‑robin** – fair but adds latency proportional to number of contenders.  
* **Credit‑based flow control** (used in PCIe, AXI) – the receiver advertises how many buffers it has free; the sender may transmit only while credits > 0, preventing overflow and guaranteeing deadlock‑free operation.

### Error detection and recovery
Physical layer errors (bit flips) are caught with CRC or parity. Link‑level protocols may:
* **Retry** the frame (PCIe) if CRC fails.  
* **NaCK** and request retransmission (USB).  
* **Forward error correction (FEC)** (e.g., 2‑parity in PCIe 5.0) to correct single‑bit errors without latency penalty.

---

## How It Works
### Generic transaction lifecycle
We model a transaction as three phases that any bus/interconnect must implement, regardless of technology:

| Phase | Purpose | Typical signals |
|-------|---------|-----------------|
| **Request** | Initiator places address, command, and optionally write data on the bus; asserts a request line. | `ADDR`, `CMD`, `REQ#` |
| **Arbitration** | Arbiter selects one requestor; grants access via `GNT#` or similar. | `GNT#`, arbitration state machine |
| **Response** | Target returns data (for reads) or acknowledgment (for writes); may assert `READY#` or `IRQ`. | `DATA`, `RDY#`, `ACK#` |

The initiator must wait for the grant before driving the bus; otherwise bus contention occurs. After the response, the bus returns to idle.

### PCIe – a concrete instance
PCIe replaces the shared parallel PCI bus with a packet‑switched, point‑to‑point serial link. Key concepts:

* **Link training** – during reset, two ends exchange TS1/TS2 ordered sets to negotiate lane count and speed (e.g., x8 Gen4 → 8 × 16 GT/s = 128 GT/s raw).  
* **Transaction Layer Packet (TLP)** – the payload unit. A typical Memory Write TLP:  
  * 12‑byte header (includes type, length, address, requester ID)  
  * 0‑256 bytes payload (DWORD‑aligned)  
  * 4‑byte ECRC (optional)  
  * Total encapsulated in a 64/65b or 128/130b block depending on generation.  

* **Data Link Layer** – adds a 2‑byte sequence number and 4‑byte LCRC; provides ACK/NACK DLLPs.  
* **Physical Layer** – 8b/10b encoding for ≤ Gen2, 128b/130b for Gen3+.  

**Effective bandwidth per lane** (Gen3):  
Raw rate = 8 GT/s. After 128b/130b overhead → $8 \times \frac{128}{130} \approx 7.877$ GT/s.  
Convert to bytes: $7.877/8 \approx 0.984$ GB/s per lane.  
An x16 link → $15.8$ GB/s (theoretical).  

**Latency components** (typical endpoint‑to‑endpoint):  
* Serialization of a 256‑byte TLP: $256\text{ B} \times 8 / 8\text{ GT/s} = 0.256\ \mu s$ (Gen3).  
* Link training & latency through a switch: ~0.5 µs per hop.  
* TLPC processing: ~0.1 µs.  
Total ≈ 0.8–1.2 µs for a single TLP.

### Memory bus – DDR4 SDRAM
The DDR bus is a **source‑synchronous, double‑data‑rate** parallel bus. Key timing parameters (from JEDEC spec):

| Symbol | Meaning | Typical DDR4‑3200 value |
|--------|---------|------------------------|
| $t_{CK}$ | Clock period | 0.625 ns (800 MHz DDR clock → 1600 MT/s) |
| $t_{CAS}$ | Column Access Strobe latency | 14 CK |
| $t_{RCD}$ | RAS# to CAS# delay | 14 CK |
| $t_{RP}$ | Row Precharge | 14 CK |
| $t_{BL}$ | Burst Length (in transfers) | 8 (4 ns at DDR4‑3200) |

A **burst read** of 64 bytes (cache line) proceeds as:
1. Activate row ($t_{RCD}$).  
2. Send CAS with column address ($t_{CAS}$).  
3. Transfer 8 × 64‑bit beats = 64 bytes over $t_{BL} \times t_{CK}=8 \times 0.625\text{ ns}=5\text{ ns}$.  
4. Precharge ($t_{RP}$) if closing page.

Total latency (ignoring bus turn‑around) ≈ $t_{RCD}+t_{CAS}+t_{BL}\cdot t_{CK}+t_{RP} = (14+14+8+14)\times0.625\text{ ns}=31.25\text{ ns}$.

Effective bandwidth for sustained streaming:  
Each transfer moves 8 bytes per data strobe edge; DDR transfers on both edges → 16 bytes per clock cycle.  
Thus peak bandwidth = $\frac{16\text{ B}}{t_{CK}} = \frac{16}{0.625\text{ ns}} = 25.6\text{ GB/s}$ per 64‑bit channel.  
Realizable throughput after command overhead ≈ 90 % → ~23 GB/s.

### On‑chip Network‑on‑Chip (NoC) – wormhole routing
A typical NoC router pipeline has stages: **Route Computation (RC)**, **Virtual Channel Allocation (VC)**, **Switch Allocation (SA)**, **Switch Traversal (ST)**, **Link Traversal (LT)**. Assume each stage takes one clock cycle $T_{clk}$.

*Flit size*: 32 bits (4 bytes).  
*Packet*: header flit + $N$ body flits + tail flit.

Latency for a packet traversing $H$ hops:
$$
L = H \times (ST + LT) + (RC+VC+SA) \times 2 + \frac{(N+2)\times \text{flit size}}{\text{link bandwidth}}.
$$
The first term accounts for per‑hop switch and link traversal; the second term is the pipeline fill/flush overhead (header and tail need to pass through all stages); the third term is serialization of the flits.

If $T_{clk}=0.5\text{ ns}$ (2 GHz), link bandwidth = 25 Gb/s (≈3.125 GB/s per direction), and we send a 64‑byte packet (16 flits) over 4 hops:
* Serialization per flit = $4\text{ B} \times 8 / 25\text{ Gb/s}=1.28\text{ ns}$ → ≈ 2.6 cycles.  
* Pipeline overhead ≈ 3 cycles.  
* Hop latency = $4 \times (ST+LT) = 4 \times 2 = 8$ cycles.  
Total ≈ $8 + 3 + 16 \times 2.6 \text{ cycles} ≈ 8 + 3 + 41.6 ≈ 52.6$ cycles → $26.3\text{ ns}$.

---

## Worked Examples
### Example 1: PCIe Gen3 x4 effective transfer time
**Problem**: Transfer a 2 MiB file from an SSD to GPU memory over a PCIe Gen3 x4 link. Account for protocol overhead (128b/130b) and TLP header (12 bytes) assuming maximum payload size (256 bytes).  

**Solution**:
1. Raw lane rate = 8 GT/s → per lane useful bandwidth = $8 \times \frac{128}{130} /8 = 0.984\text{ GB/s}$.  
2. x4 link → $B_{\text{raw}} = 4 \times 0.984 = 3.936\text{ GB/s}$.  
3. Each TLP carries 256 B payload + 12 B header = 268 B on‑wire.  
   Useful fraction = $\frac{256}{268} = 0.955$.  
   Effective bandwidth = $3.936 \times 0.955 = 3.76\text{ GB/s}$.  
4. Transfer time $t = \frac{2\text{ MiB}}{3.76\text{ GB/s}} = \frac{2 \times 2^{20}}{3.76 \times 10^{9}} \approx 0.00056\text{ s} = 560\ \mu s$.  

**Interpretation**: Protocol overhead adds ~4.5 % latency; the dominant factor is the link width.

### Example 2: DDR4 random access latency vs. streaming bandwidth
**Problem**: Compute average latency for a 64‑byte random read and the sustainable bandwidth for sequential 4 KiB reads on a DDR4‑3200 channel.  

**Solution**:
*Random read* (as derived above):  
$L_{\text{rand}} = t_{RCD}+t_{CAS}+t_{BL}\cdot t_{CK}+t_{RP}=31.25\text{ ns}$.  

*Sequential stream*: With burst length 8, each burst transfers 64 B in $5\text{ ns}$. The controller can issue a new CAS every $t_{CCD}=4$ CK (2.5 ns) for back‑to‑back reads. Thus effective throughput = $\frac{64\text{ B}}{2.5\text{ ns}} = 25.6\text{ GB/s}$, matching the peak.  

If we instead issue 4 KiB (64 bursts) sequentially, total time ≈ $64 \times 2.5\text{ ns}=160\text{ ns}$ → bandwidth = $\frac{4096\text{ B}}{160\text{ ns}}=25.6\text{ GB/s}$ (no penalty).  

**Takeaway**: Random accesses suffer the full row activation latency; streaming hides it.

### Example 3: NoC design for a 64‑core mesh
**Problem**: Design a 2‑D mesh NoC (8 × 8) to support each core injecting 1 GiB/s uniformly. Assume wormhole routing, 2 GHz router clock, and flit size 32 bits. Determine required link bandwidth per direction and resulting average packet latency for 64‑byte packets (16 flits) under uniform traffic.  

**Solution**:
*Injection rate per core*: $1\text{ GiB/s}=2^{30}\text{ B/s}=1.074\text{ GB/s}$.  
Each injection must be sent out on one of the four links (N,S,E,W) with equal probability → average load per link = $\frac{1}{4}$ of injection rate = $0.2685\text{ GB/s}$.  
Because traffic is uniform, each link also carries forwarding traffic. In an 8 × 8 mesh with uniform traffic, the average hop count ≈ $\frac{2}{3}(N-1)=\frac{2}{3}\times7≈4.67$.  
Total flit flux on a link = injection flux × (1 + average hops) = $0.2685 \times (1+4.67) ≈ 1.52\text{ GB/s}$.  
Convert to bits: $1.52 \times 8 = 12.16\text{ Gb/s}$.  
Provide a 2‑bit serial lane (e.g., 2 × 6.25 Gb/s SERDES) or a single 12.5 Gb/s lane (e.g., PCIe Gen3).  

*Latency*: Using the formula from How It Works:  
$T_{clk}=0.5\text{ ns}$, pipeline stages = 4 (RC,VC,SA,ST) + LT (1) = 5 cycles per hop.  
Header flit traverses 5 stages per hop → $5 \times H \times T_{clk}$.  
Body/tail flits experience only SA+ST+LT after VC is granted (assume VC allocated on header). Approximate per‑flit hop latency = 3 cycles.  
For $H=4.67$, header latency ≈ $5 \times 4.67 \times 0.5\text{ ns}=11.7\text{ ns}$.  
Payload (15 flits) adds $15 \times 3 \times 0.5\text{ ns}=22.5\text{ ns}$.  
Serialization per flit = $4\text{ B}\times8 / 12.5\text{ Gb/s}=2.56\text{ ns}=5.1\text{ cycles}$.  
Add serialization: $16 \text{ flits} \times 2.56\text{ ns}=40.96\text{ ns}$.  
Total latency ≈ $11.7+22.5+40.96 \approx 75\text{ ns}$.  

Thus a 12.5 Gb/s serial link per direction meets the bandwidth target and yields ~75 ns average latency for 64‑byte packets under uniform load.

---

## Common Mistakes
| # | Mistake | Why it’s wrong | Correct understanding |
|---|---------|----------------|-----------------------|
| 1 | **“Bandwidth = throughput”** | Ignores protocol headers, encoding overhead, and packetization latency. A PCIe x16 Gen3 link advertises ~32 GB/s raw, but usable bandwidth for 256‑byte TLPs is ~15.8 GB/s. | Always compute useful bandwidth: $B_{\text{useful}} = R \times \frac{\text{payload}}{\text{payload+header}} \times \text{encoding efficiency}$. |
| 2 | **“Latency is independent of packet size”** | For store‑and‑forward or cut‑through switches, serialization delay scales with size. In DDR, a random 64‑byte read still pays the full row activation latency regardless of payload. | Latency = fixed overhead (arbitration, row activation) + serialization ($\frac{\text{size}}{\text{rate}}$). |
| 3 | **“Arbitration is always fair”** | Fixed‑priority arbiters can starve low‑priority agents; round‑robin adds latency proportional to contention. Real systems often use credit‑based or weighted schemes to balance QoS. | Examine the arbiter policy in the spec; configure priority or QoS registers if available. |
| 4 | **“Point‑to‑point eliminates contention”** | Contention moves to switches or shared links upstream/downstream (e.g., PCIe root complex, memory controller). | Model the entire path; measure link utilization with tools like `lspci -vv` or `perf stat -e bus_cycles`. |
| 5 | **“Increasing link width always improves latency”** | Wider links increase serialization time per flit only if the data width increases; otherwise latency dominated by fixed switch hop delay. | Use narrow high‑speed serial links (SerDes) for low latency; width helps bandwidth, not latency. |
| 6 | **“ECC on memory fixes all reliability issues”** | ECC corrects single-bit errors but does not protect against multi‑bit upsets, address line faults, or protocol‑level errors (e.g., TLP CRC). | Combine ECC with link-level CRC, retry mechanisms, and periodic scrubbing. |

---

## Exercises
### Easy
1. **PCIe raw bandwidth** – A PCIe Gen2 x1 link runs at 5 GT/s with 8b/10b encoding. Compute its raw bandwidth in MB/s.  
2. **DDR4 burst time** – Using DDR4‑3200 timings ($t_{CK}=0.625$ ns, $t_{BL}=8$), how many nanoseconds does a 64‑byte burst take on the data bus?  

### Medium
3. **Effective PCIe transfer** – A NVMe drive connected via a PCIe Gen3 x2 link delivers 250 k IOPS of 4 KiB random reads. Assuming each read command requires a 12‑byte TLP header and a 4‑byte completion TLP, estimate the sustained bandwidth consumed by protocol overhead.  
4. **Memory latency budget** – A system has DDR4‑3200 with $t_{RCD}=14$ CK, $t_{CAS}=14$ CK, $t_{RP}=14$ CK. If the memory controller adds an extra 10 ns of queueing delay, what is the average latency for a random 64‑byte read?  

### Hard
5. **NoC link sizing** – You must support a 4 GiB/s aggregate injection rate on a 16‑core 2‑D mesh (4 × 4). Each core injects uniformly, and the average hop count is 2.5 hops. Determine the minimum per‑direction link bandwidth (in Gb/s) required assuming flit size 64 bits and a router pipeline of 4 cycles, with a 2 GHz clock. Show the derivation.  
6. **PCIe error budget** – A PCIe Gen4 x16 link has a raw bit error rate (BER) of $10^{-12}$. With 128b/130b encoding and a 256‑byte TLP, compute the probability that a given TLP suffers an uncorrectable error (assuming the link layer CRC catches all single‑bit errors).  

---

## Linux Connection
### PCIe subsystem
* **Kernel**: drivers/pci/ – `pci_bus.c`, `pci.c`.  
* **Sysfs**: `/sys/bus/pci/devices/<domain>:<bus>:<dev>.<fn>/`  
  * `current_link_speed` – negotiated speed (e.g., `2.5 GT/s`, `5.0 GT/s`, `8.0 GT/s`, `16.0 GT/s`).  
  * `current_link_width` – negotiated lane count (`x1`, `x2`, `x4`, `x8`, `x16`).  
  * `config` – binary dump of the PCI configuration space (readable via `setpci` or `lspci -xxxx`).  
* **Tools**:  
  ```bash
  # Show detailed link info for device 00:02.0
  sudo lspci -vv -s 00:02.0

  # Read the Link Control register (offset 0x10)
  sudo setpci -s 00:02.0 10.w

  # Force a link retrain (requires root, dangerous on production)
  echo 1 > /sys/bus/pci/devices/0000:00:02.0/link/reset
  ```
* **Performance monitoring**:  
  ```bash
  # Count PCIe transactions via perf
  sudo perf stat -e r8169:tx_packets,r8169:rx_packets sleep 5   # replace with your NIC driver
  # Or use the PCIe core tracepoints
  sudo perf trace -e pcie:* sleep 5
  ```
* **Error handling**:  
  ```bash
  # Correctable/uncorrectable error counters
  cat /sys/bus/pci/devices/0000:00:02.0/aei/correctable_errors
  cat /sys/bus/pci/devices/0000:00:02.0/aei/uncorrectable_errors
  ```

### Memory bus (DDR)
* **Kernel**: drivers/ddr/ (platform‑specific) and `edac` (Error Detection and Correction) subsystem.
