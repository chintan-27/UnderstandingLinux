---
id: 160
title: "Flash storage and SSDs"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Flash Cell Physics and Technology Scaling
A NAND flash cell stores data as the presence or absence of electrons in a floating‑gate transistor. Programming (write) injects electrons via Fowler‑Nordheim tunneling; erasing removes them by applying a high reverse bias. Each program‑erase (P/E) cycle causes oxide trapping and interface‑state generation, limiting endurance.  
- **SLC** (Single‑Level Cell): 1 bit/cell, ~100 k P/E cycles.  
- **MLC** (Multi‑Level Cell, 2 bits): ~3–5 k cycles.  
- **TLC** (3 bits): ~1 k cycles.  
- **QLC** (4 bits): ~100–300 cycles.  

Endurance scales inversely with the number of stored bits because the voltage windows shrink, making charge distinction more sensitive to trapped charge.

### Pages, Blocks, and the Erase‑Before‑Write Constraint
- **Page**: smallest unit that can be programmed, typically $P = 8\text{ KiB}$ or $16\text{ KiB}$ for modern NAND.  
- **Block**: collection of pages that must be erased together, $B = \text{pages per block} \times P$. Common values: $64\text{ pages} \Rightarrow B = 512\text{ KiB}$ (for $P=8\text{ KiB}$) or $128\text{ KiB}$ (for $P=16\text{ KiB}$ with 8 pages/block).  
Because a page cannot be overwritten without first erasing its entire block, any update triggers a **read‑modify‑write** cycle: valid pages in the source block are copied to a fresh block, the source block is erased, and the updated page is written.

### Wear Leveling
Wear leveling spreads P/E cycles uniformly across blocks to avoid early failure of heavily used blocks. Two main classes:  
- **Dynamic (or greedy) wear leveling**: selects the block with the lowest erase count for each new write.  
- **Static wear leveling**: periodically moves cold (infrequently updated) data from low‑usage blocks to high‑usage blocks, raising the erase count of cold data to match hot data.  

Mathematically, if total host writes over the drive lifetime are $W_{\text{host}}$ bytes and the drive has $N_{\text{blocks}}$ erasable units each of size $B$, the average erase count per block is  
$$\overline{E} = \frac{W_{\text{host}}}{N_{\text{blocks}} \cdot B} \cdot \text{WA}$$  
where $\text{WA}$ (write amplification) accounts for extra flashes due to GC and wear leveling.

### Garbage Collection (GC) and Write Amplification
GC reclaims space by erasing blocks containing only invalid pages. The process introduces **write amplification**: for each host write, additional bytes are flashed to relocate valid data.  
If a block has $v$ valid pages and $i$ invalid pages ($v+i = \text{pages per block}$), reclaiming that block requires copying $v \cdot P$ bytes of valid data plus the host write $P$. The amplification factor for that reclamation is  
$$\text{WA}_{\text{block}} = \frac{v \cdot P + P}{P} = v+1.$$  
Averaged over the drive, $\text{WA} = 1 + \frac{\text{valid pages copied}}{\text{host pages written}}$. High GC aggression (frequent reclamation) reduces free space but raises WA; low GC aggression delays reclamation, increasing the risk of out‑of‑space stalls.

### Flash Translation Layer (FTL)
The FTL presents a uniform logical block address (LBA) space to the host while managing the underlying NAND geometry. Core functions:  
1. **Address translation** – maps LBA → (block, page).  
2. **Garbage collection scheduling** – decides when and which blocks to reclaim.  
3. **Wear leveling** – selects target blocks based on erase counts.  
4. **Bad block management** – retires blocks that fail program/erase verification.  

Mapping granularity determines metadata size:  
- **Block‑level FTL**: one entry per logical block → low RAM, high write amplification (entire block moved on any update).  
- **Page‑level FTL**: one entry per logical page → high RAM ($\frac{\text{capacity}}{P} \times 4\text{ bytes}$), low WA.  
- **Hybrid / log‑structured FTL**: combines a small block‑level map with a log (journal) of recent page updates, achieving moderate RAM and WA.

---

## How It Works
### Address Translation Mechanisms
Consider a page‑level FTL with a direct-mapped page table stored in RAM, cached partially in a **translation cache** (TLB‑like). Each entry contains:  
```c
struct ftl_entry {
    uint32_t ppa;   /* physical page address (block<<bits_per_page | page_offset) */
    uint8   valid;  /* 1 if mapping is current, 0 if stale */
    uint16  erase_count; /* optional, used for wear leveling */
};
```
When the host issues a write to LBA $L$, the FTL computes the logical page number  
$$\text{lpn} = \left\lfloor \frac{L \cdot \text{sector\_size}}{P} \right\rfloor$$  
and looks up `ftl_entry[lpn]`. If `valid == 1`, the write goes to the cached PPA (often a spare page in the current write block). If `valid == 0` or the target page is already programmed, the FTL must:
1. Allocate a fresh page from the **write buffer** (a block reserved for incoming writes).  
2. Update the mapping entry with the new PPA and set the old entry’s `valid` to 0 (creating an invalid page).  
3. If the write buffer fills, trigger **garbage collection** to erase its source block and make it available for reuse.

### Garbage Collection Algorithm (Greedy)
A simple GC picks the block with the lowest **valid page ratio** $v / (\text{pages per block})$:  
```c
int select_victim_block(void) {
    int best = -1;
    float min_ratio = 2.0;   /* >1 means impossible */
    for (int b = 0; b < nr_blocks; ++b) {
        int valid = count_valid_pages(b);
        float ratio = (float)valid / pages_per_block;
        if (ratio < min_ratio) {
            min_ratio = ratio;
            best = b;
        }
    }
    return best;
}
```
After selection, the FTL:
1. Reads all valid pages from the victim block into RAM.  
2. Writes them to the current write buffer (or a new free block).  
3. Erases the victim block.  
4. Updates all affected `ftl_entry` PPAs to point to the new locations.  

The **amortized cost** of GC per host write can be modeled as  
$$\text{GC\_cost} = \frac{\text{valid pages moved}}{\text{host writes}} \cdot P$$  
which contributes directly to WA.

### Wear Leveling Integration
Wear leveling influences block selection for both new writes and GC victims. A common approach: maintain an **erase‑count array** `ec[block]`. When choosing a target block for a write, compute a weighted score:  
$$\text{score}(b) = \alpha \cdot \frac{ec[b]}{\overline{E}} + (1-\alpha) \cdot \frac{v(b)}{\text{pages per block}}$$  
with $0 \le \alpha \le 1$. Higher $\alpha$ favors low‑erase blocks (wear leveling), lower $\alpha$ favors blocks with few valid pages (GC efficiency). Tuning $\alpha$ balances endurance versus performance.

### Example: NVMe Command Flow
When an application issues `pwrite(fd, buf, len, offset)`, the Linux block layer:
1. Converts `offset`/`len` to a series of **bio** structures.  
2. Sends each bio to the NVMe driver (`nvme_submit_io`).  
3. The driver builds an NVMe **command** (opcode `0x01` for Write) containing:
   - **Namespace ID** (usually 1).  
   - **Starting LBA** = `offset / sector_size`.  
   - **Length** = `len / sector_size - 1` (zero‑based count).  
   - **PRP entries** pointing to the host buffer pages.  
4. The NVMe controller receives the command, places the data in its internal **submission queue**, and signals completion via the **completion queue**.  
The FTL inside the controller then performs the steps described above.

---

## Worked Examples
### Example 1: Block Erasures from a Given Write Volume
**Problem**: SSD with page size $P = 8\text{ KiB}$, block size $B = 128\text{ KiB}$ (thus $16$ pages/block). Host writes $10$ pages of data. How many block erasures occur, assuming no wear leveling or GC optimization?  

**Solution**:  
- Each page write targets a fresh page (worst case: each write goes to a different block, forcing an erase before programming).  
- Since a block holds $16$ pages, after $10$ writes we have filled at most $\lceil 10/16 \rceil = 1$ block partially.  
- If writes are to distinct blocks, we would need $10$ separate blocks, each requiring an erase before the first page. Realistic SSDs allocate a **write buffer block** and fill it sequentially, so only when the buffer fills ($16$ writes) do we erase.  
- Therefore, with $10 < 16$ writes, **zero block erasures** occur; the data resides in the write buffer.  
- If the write buffer were disabled (e.g., random overwrites), each write would trigger an erase: $10$ erasures.  

### Example 2: Perfect Wear Leveling Distribution
**Problem**: Same SSD ($P=8\text{ KiB}$, $B=128\text{ KiB}$). Host writes $W = 1000$ pages. With ideal wear leveling, how many erasures per block?  

**Solution**:  
- Total blocks $N_B = \frac{\text{capacity}}{B}$. Assume a $128\text{ GiB}$ SSD:  
  $$N_B = \frac{128 \times 2^{20}}{128 \times 2^{10}} = 2^{10} = 1024 \text{ blocks}.$$  
- Each block holds $16$ pages, so total page capacity $= N_B \times 16 = 16384$ pages.  
- Host writes $1000$ pages $\Rightarrow$ fraction of capacity used $= 1000/16384 \approx 0.061$.  
- Perfect wear leveling spreads writes uniformly, so each block receives $1000 / 1024 \approx 0.9766$ writes on average.  
- Since a block can accept $16$ writes before needing an erase, the expected number of erasures per block is  
  $$E = \frac{0.9766}{16} \approx 0.061 \text{ erasures per block}.$$  
- Equivalently, total erasures $= \frac{1000}{16} = 62.5$, distributed over $1024$ blocks gives the same per‑block value.

### Example 3: FTL Handling an Invalid‑Page Write
**Problem**: A logical page $L$ is currently mapped to physical page $ppa_{\text{old}} = (block=42, page=7)$. The entry’s `valid` flag is `0` (stale). Host writes new data to $L$. Describe the FTL steps.  

**Solution**:  
1. **Lookup**: `ftl_entry[lpn(L)]` yields `ppa_old`, `valid=0`.  
2. **Allocate**: Choose a free page in the current write buffer block, say `(block=58, page=3)`.  
3. **Program**: Flash the new data to `(58,3)`.  
4. **Update Mapping**: Set `ftl_entry[lpn(L)].ppa = (58,3)`, `valid=1`.  
5. **Invalidate Old**: The old mapping entry (if any) for `(42,7)` is left stale; its `valid` remains `0`.  
6. **GC Trigger Check**: If the write buffer block (block 58) now has $k$ programmed pages, check if $k = \text{pages per block}$. If full, invoke GC on its source block (the block that originally held those pages before they were moved to the buffer).  
Thus, the write completes without erasing the source block; reclamation occurs later when the buffer fills.

---

## Common Mistakes
| # | Misconception | Why It’s Wrong | Correct Understanding |
|---|----------------|----------------|-----------------------|
| 1 | “Wear leveling means the SSD never wears out.” | Wear leveling only *distributes* erase cycles; the total number of P/E cycles is still limited by the cell physics. | Endurance is finite; wear leveling prolongs lifetime by preventing early‑failure hotspots, but eventual wear‑out still occurs after the rated TBW (Terabytes Written). |
| 2 | “Garbage collection is the same as the TRIM/discard command.” | GC reclaims *invalid* pages inside the SSD; TRIM informs the SSD which LBAs are no longer needed, allowing it to mark pages as invalid *earlier*. | TRIM reduces GC workload by providing advance notice of free space; without TRIM, the SSD must rely on stale‑detect heuristics, increasing WA. |
| 3 | “FTL mapping is static and can be read directly from the host.” | The FTL resides inside the SSD controller; its tables are volatile (RAM) and often compressed or cached. Host cannot access them without vendor‑specific commands. | Host sees only the logical block interface; mapping details are opaque, though some SSDs expose limited statistics via SMART/NVMe log pages. |
| 4 | “Write amplification is always close to 1 for sequential writes.” | Even sequential writes suffer WA due to GC: when the write buffer fills, the entire block must be erased, and if the block contains any valid data from prior random writes, those must be relocated. | Sequential workloads lower WA but do not eliminate it; WA depends on the proportion of valid data in victim blocks, which is influenced by prior randomness and over‑provisioning. |
| 5 | “A larger block size always improves performance.” | Larger blocks increase the amount of data that must be relocated during GC, raising WA and latency for random updates. | Optimal block size balances write amplification (smaller blocks) versus erase overhead (larger blocks); modern SSDs use 128 KiB–256 KiB blocks as a compromise. |

---

## Exercises
### Easy
1. **Page/Block Count** – Write a script that, given SSD capacity $C$ (GiB), page size $P$ (KiB), and block size $B$ (KiB), prints total pages, total blocks, and pages per block. Verify with a real device using `lsblk -o NAME,SIZE` and `cat /sys/block/<dev>/queue/optimal_io_size`.  
2. **Wear‑Leveling Simulation** – Implement a circular array of $N$ blocks, each with an erase counter. For $M$ random writes, select the block with the smallest counter, increment its counter, and repeat. Plot the histogram of counters after $M=10^6$ writes (use Python/Matplotlib).  

### Moderate
3. **Basic FTL** – In C, implement a page‑level FTL for a simulated SSD with $64$ blocks, $32$ pages/block, page size $4096$ B. Provide functions:  
   - `ftl_init()` – allocates mapping table and sets all entries invalid.  
   - `ftl_write(lpn, data)` – follows the algorithm from Worked Example 3, using a write‑buffer block that triggers GC when full.  
   - `ftl_gc(victim_block)` – copies valid pages, erases block, updates mapping.  
   Include a simple test that writes random LPNs and verifies read‑back consistency.  
4. **Write Amplification Measurement** – Using `blktrace` on a Linux system, capture the number of bytes issued by the host (`blkparse -i <dev> -a issue`) and the number of bytes flashed to the SSD (obtainable via NVMe smart-log `nvme smart-log /dev/nvme0n1` → `data_units_written`). Compute WA = flashed / host. Run sequentially and randomly, compare results.  

### Hard
5. **Hybrid FTL Design** – Extend the basic FTL to a log‑structured design: maintain a small block‑level map (one entry per 64‑page segment) and a log of recent page updates in a dedicated RAM buffer. When the log fills, flush it to NAND using segment‑level cleaning. Implement in C and evaluate WA under a zipfian workload (skew factor 0.9).  
6. **Endurance Prediction** – Given a datasheet specifying $TBW = 300$ TB for a $1$ TB TLC SSD, page size $16$ KiB, block size $256$ KiB, and a workload with write amplification $WA = 2.5$, calculate the expected lifetime in days if the host writes $50$ GiB/day. Show derivation:  
   $$\text{Lifetime (days)} = \frac{TBW \times 10^{12}}{\text{host\_write\_per\_day} \times WA}$$  

---

## Linux Connection
### Subsystems and Interfaces
- **Block Layer**: All SSDs appear as block devices (`/dev/sdX`, `/dev/nvmeXnY`). The generic block layer (`/drivers/block/`) handles request queuing, merging, and scheduling (`cfq`, `deadline`, `none`, `mq-deadline`, `kyber`).  
- **NVMe Driver**: For PCIe/NVMe SSDs, driver `nvme` (`/drivers/nvme/host/`). Exposes admin and I/O queues via `ioctl(NVME_ADMIN_CMD)` and `ioctl(NVME_IOCTL_IO_CMD)`.  
- **ATA/SATA Driver**: `ata_piix` or `ahci` for SATA SSDs; uses `ATA_CMD_WRITE_DMA_EXT` etc.  
- **Sysfs Attributes**:  
  - `/sys/block/<dev>/device/model` – vendor/model.  
  - `/sys/block/<dev>/device/state` – link power management.  
  - `/sys/block/<dev>/queue/optimal_io_size` – suggested I/O size (often equals erase block size).  
  - `/sys/block/<dev>/queue/physical_block_size` – NAND page size (or sector size for logical).  
  - For NVMe: `/sys/block/nvme0n1/device/nvme/` contains SMART log pages (`smart_log`, `temperature`, `critical_warning`).  

### Commands to Probe SSD Geometry
```bash
# Show logical block size (usually 512 B) and physical block size (NAND page)
sudo blockdev --getss /dev/sda          # logical sector size
sudo blockdev --getpbsz /dev/sda        # physical block size (often page size)

# For NVMe, read Identify Controller data (page size = LBADS*2^LBADS)
sudo nvme id-ctrl /dev/nvme0n1 | grep -i lbaformat
```
Example output:
```
LBAF[0]: Ms=0 LBA_size=4096 ...
```
indicating a 4 KiB logical block size; the physical page size may be larger (reported via `nvme id-ns`).

### Issuing Discard/TRIM
```bash
# Discard entire device (dangerous – erases all data)
sudo blkdiscard -f /dev/sda

# Trim a mounted filesystem (e.g., ext4)
sudo fstrim -v /mnt/myssd
```
`ftrimb` sends a `DISCARD` request; the block layer translates it to a `WRITE SAME` with the `DISCARD` bit set for ATA, or an NVMe `Dataset Management` command.

### Monitoring Wear
```bash
# SATA: smartctl
sudo smartctl -a /dev/sda | grep -i "wear_leveling_count\|media_wearout_indicator"

# NVMe: nvme smart-log
sudo nvme smart-log /dev/nvme0n1 | grep -i "percentage_used"
```
`percentage_used` approximates endurance consumed (0 % = new, 100 % = rated TBW exhausted).

### Example C Program: Querying NVMe SMART and Issuing a Trim
```c
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <linux/nvme_ioctl.h>
#include <sys/ioctl.h>
#include <string.h>
#include <errno.h>

int main(void) {
    int fd = open("/dev/nvme0n1", O_RDWR);
    if (fd < 0) { perror("open"); return 1; }

    /* Get SMART/log page 0x02 (Smart/Health Information) */
    struct nvme_pt_command pt = {
        .opcode   = NVME_ADMIN_GET_LOG_PAGE,
        .nsid     = 0,
        .cdw10    = 0x02 << 16,   /* LOG_ID = 2, NUMD = 0 */
        .cdw11    = 0,
        .addr     = (unsigned long)malloc(512),
        .data_len = 512,
        .cdw12    = 0,
        .cdw13    = 0,
        .cdw14    = 0,
        .cdw15    = 0,
    };
    if (ioctl(fd, NVME_IOCTL_ADMIN_CMD, &pt) < 0) {
        perror("ioctl SMART");
        close(fd);
        return 1;
    }
    uint8_t *log = (uint8_t*)pt.addr;
    uint8_t percent_used = log[304];   /* byte 304 = Percentage Used */
    printf("SMART Percentage Used: %u%%\n", percent_used);
    free((void*)pt.addr);

    /* Issue Dataset Management (Trim) for LBA range [0, 10000) */
    struct nvme_pt_command trim = {
        .opcode   = NVME_ADMIN_DATASET_MGMT,
        .nsid     = 1,
        .addr     = (unsigned long)malloc(8*2),   /* 2 entries: start LBA, length */
        .data_len = 16,
        .cdw10    = 0, /* attributes = 0 (Deallocate) */
        .cdw11    = 0,
        .cdw12    = 0,
        .cdw13    = 0,
        .
