---
id: 126
title: "I2C and SPI drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### I2C Physical Layer and Protocol Details
I2C is a **wired‑AND, open‑drain** bus. Both SCL (clock) and SDA (data) are pulled up to VDD by resistors; devices can only drive the lines low. This yields a **wired‑AND** logic: the line is high only when *all* devices release it. Consequently:

* **Bus capacitance** limits speed. The total capacitance \(C_{bus}\) (sum of PCB trace, device pin, and connector capacitance) must stay below the spec (usually 400 pF for Fast‑mode, 550 pF for Fast‑mode Plus).  
* **Pull‑up resistor value** is chosen from the rise‑time requirement:  
  \[
  t_{rise} = 0.847\,R_{p}\,C_{bus} \le t_{rise}^{max}
  \]
  where \(t_{rise}^{max}\) is 1 µs for Standard‑mode (100 kHz), 300 ns for Fast‑mode (400 kHz), and 120 ns for Fast‑mode Plus (1 MHz). Solving for \(R_{p}\) gives the maximum allowable resistance; too large a resistor slows the bus, too small wastes power and may exceed device sink‑current limits.

* **Clock stretching**: a slave may hold SCL low to indicate it is not ready. The master must detect this and wait; otherwise data bits are sampled while the line is still changing, causing corruption.

* **Addressing**: 7‑bit addressing is dominant; the transmitted byte is \(\texttt{A6..A0}R/W\). The LSB indicates direction (0=write, 1=read). 10‑bit addressing uses two bytes: first byte `11110xx0` (where `xx` are the two MSBs of the 10‑bit address), second byte contains the remaining 8 bits.

* **Repeated START (Sr)**: allows a master to change transfer direction without releasing the bus, essential for register‑read operations (write register address, Sr, read data).

### SPI Physical Layer and Protocol Details
SPI uses **push‑pull** drivers for all four lines, giving full‑duplex operation with deterministic timing. Key points:

* **Clock polarity (CPOL)** and **clock phase (CPHA)** define the sampling edge.  
  * CPOL=0 → SCK idles low; CPOL=1 → idles high.  
  * CPHA=0 → data sampled on the **first** clock edge; CPHA=1 → sampled on the **second** edge.  
  The four possible modes (0‑3) must match master and slave; mismatched modes cause bit‑shifts.

* **Clock frequency**: derived from the peripheral clock \(f_{clk}\) via a prescaler:  
  \[
  f_{SCK} = \frac{f_{clk}}{2\,(SCBR+1)}
  \]
  where \(SCBR\) is the serial clock baud rate register value. Many SoCs allow \(f_{SCK}\) up to half the peripheral clock.

* **Chip Select (SS/CS)**: active‑low; the master must assert CS before the first clock edge and deassert after the last edge. Some controllers support **hardware CS** (automatic toggling) while others require software‑driven GPIO.

* **No built‑in addressing**: the slave select line implicitly addresses the device. Multiple slaves share MOSI, MISO, SCK; each needs a unique CS line.

* **Data framing**: most controllers support 8‑bit frames, but many allow variable frame widths (4‑16 bits) via a `bits_per_word` field.

### Why Both Matter in Linux
Linux abstracts the electrical details into **adapter** objects (`i2c_adapter`, `spi_master`) that expose a uniform message‑passing API to drivers. The adapter handles timing generation, clock stretching detection (I2C), CS toggling, and mode configuration (SPI). This lets a driver focus on protocol semantics (register maps, command sequences) rather than bit‑banging.

---

## How It Works
### I2C Core Subsystem
1. **Adapter registration** (`i2c_add_numbered_adapter()` or via device tree) creates an `i2c_adapter` struct containing:
   * `struct i2c_algorithm *algo` – pointers to `master_xfer` (handles `i2c_transfer`) and `functionality` (flags like `I2C_FUNC_I2C`, `I2C_FUNC_SMBUS_EMUL`).
   * `nr` – the bus number that appears as `/dev/i2c-<nr>` when `i2c-dev` is loaded.
2. **Client binding** (`i2c_new_device()` or OF) creates an `i2c_client` with:
   * `addr` – 7‑bit (or 10‑bit) address.
   * `irq` – optional interrupt line.
   * `driver` – matched via `i2c_driver`’s `probe()`.
3. **Transfer API**:  
   ```c
   int i2c_transfer(struct i2c_adapter *adap,
                    struct i2c_msg *msgs,
                    int num);
   ```
   * Each `struct i2c_msg` holds:
     * `uint16_t addr` – slave address.
     * `uint16_t flags` – `I2C_M_RD` for read, `I2C_M_NOSTART`/`I2C_M_REV_DIR_ADDR` for advanced uses.
     * `size_t len` – buffer length.
     * `void *buf` – data pointer.
   * The adapter’s `algo->master_xfer` builds the appropriate SCL/SDA timing, honors clock stretching, and returns the number of successfully transferred messages (or a negative errno).

### SPI Core Subsystem
1. **Master registration** (`spi_register_master()` or OF) creates a `struct spi_master`:
   * `struct spi_device *dev` – per‑slave instance.
   * `int (*transfer)(struct spi_device *, struct spi_message *)` – usually `spi_sync` or `spi_async`.
   * `u16 bus_num`, `u16 chip_select` – map to `/dev/spidev<bus>.<cs>`.
2. **Device binding** (`spi_alloc_device()`) populates:
   * `uint16_t mode` – bits for `SPI_CPOL`, `SPI_CPHA`, `SPI_CS_HIGH`, `SPI_LOOP`, `SPI_3WIRE`, `SPI_NO_CS`, `SPI_READY`.
   * `u8 bits_per_word`.
   * `u32 max_speed_hz`.
   * `void *controller_data` – board‑specific info.
3. **Message API**:  
   ```c
   int spi_sync(struct spi_device *spi, struct spi_message *msg);
   ```
   * `struct spi_message` is a list of `struct spi_transfer`:
     * `const void *tx_buf` / `void *rx_buf`.
     * `size_t len`.
     * `u8 bits_per_word` (overrides device default).
     * `u16 speed_hz` (overrides device max).
     * `u16 cs_change` – toggle CS between transfers.
     * `u32 delay_usecs` / `u16 delay_usecs` – inter‑transfer delay.
   * The master’s driver builds the appropriate SCK edges, asserts/deasserts CS per `cs_change`, and shifts data according to `mode` and `bits_per_word`.

### Bus Arbitration & Error Handling
* **I2C**: multi‑master arbitration occurs when two masters simultaneously drive SDA. The master that drives SDA low while the other releases it wins; the loser backs off and sets `I2C_M_STOP` flag if needed. Drivers must check the return value of `i2c_transfer`; a negative value indicates arbitration loss (`-EAGAIN`) or NACK (`-EREMOTEIO`).
* **SPI**: no arbitration; errors arise from timeout (if controller uses timeout), DMA completion errors, or mode mismatches (detected via `spi_device->mode` mismatch).

---

## Worked Examples
### Example 1: Reading a TMP102 Temperature Sensor (I2C)
The TMP102 (default address 0x48) stores temperature in a 12‑bit register at pointer 0x00. The format:  
\[
\text{Temperature[°C]} = \frac{(\text{raw} >> 4)}{16}
\]
where `raw` is a 16‑bit signed value (two’s complement).

**Step‑by‑step transaction** (write pointer, repeated start, read 2 bytes):
```c
#include <linux/i2c.h>
#include <linux/types.h>
#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>

int main(void)
{
    int fd = open("/dev/i2c-1", O_RDWR);
    if (fd < 0) { perror("open"); return 1; }

    /* Set slave address (7‑bit) */
    if (ioctl(fd, I2C_SLAVE, 0x48) < 0) {
        perror("ioctl I2C_SLAVE"); close(fd); return 1;
    }

    /* 1. Write register pointer = 0x00 */
    uint8_t ptr = 0x00;
    if (write(fd, &ptr, 1) != 1) {
        perror("write pointer"); close(fd); return 1;
    }

    /* 2. Repeated start + read 2 bytes */
    uint8_t raw[2];
    if (read(fd, raw, 2) != 2) {
        perror("read data"); close(fd); return 1;
    }
    close(fd);

    int16_t t_raw = (int16_t)((raw[0] << 8) | raw[1]);
    float temperature = t_raw / 16.0f;   // 12‑bit fraction
    printf("Temperature: %.2f °C\n", temperature);
    return 0;
}
```
*Why this works*: The first `write` performs a master‑transmit (address+W, ACK, pointer byte, ACK, STOP). The subsequent `read` triggers a master‑receive after a repeated START (address+R, ACK, data0, ACK, data1, NACK, STOP). The TMP102 automatically increments its internal pointer after each read, so two bytes give the temperature register.

### Example 2: SPI Flash – Read JEDEC ID and Page Program (AT25DF641)
Assume SPI bus 0, CS 0 (`/dev/spidev0.0`). The flash expects:
* **JEDEC ID**: command `0x9F` → 3‑byte ID.
* **Page Program** (256‑byte page): command `0x02`, 3‑byte address (MSB first), then data bytes.

**Implementation using `spi_message` with three transfers**:
```c
#include <linux/spi/spi.h>
#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <string.h>
#include <stdint.h>

int main(void)
{
    int fd = open("/dev/spidev0.0", O_RDWR);
    if (fd < 0) { perror("open spi"); return 1; }

    /* Set mode and speed (match flash datasheet) */
    uint8_t mode = SPI_MODE_0;          // CPOL=0, CPHA=0
    uint8_t bits = 8;
    uint32_t speed = 5000000;           // 5 MHz
    ioctl(fd, SPI_IOC_WR_MODE32, &mode);
    ioctl(fd, SPI_IOC_WR_BITS_PER_WORD, &bits);
    ioctl(fd, SPI_IOC_WR_MAX_SPEED_HZ, &speed);

    /* ---------- JEDEC ID ---------- */
    uint8_t tx_id[] = { 0x9F };
    uint8_t rx_id[3] = {0};
    struct spi_ioc_transfer xfer_id = {
        .tx_buf = (unsigned long)tx_id,
        .rx_buf = (unsigned long)rx_id,
        .len    = sizeof(tx_id),
        .delay_usecs = 0,
        .speed_hz = speed,
        .bits_per_word = bits,
    };
    if (ioctl(fd, SPI_IOC_MESSAGE(1), &xfer_id) < 0) {
        perror("spi message id"); close(fd); return 1;
    }
    printf("JEDEC ID: %02X %02X %02X\n",
           rx_id[0], rx_id[1], rx_id[2]);

    /* ---------- Page Program (address 0x000000, 4 bytes) ---------- */
    uint8_t tx_pp[1 + 3 + 4] = { 0x02,          // CMD
                                 0x00, 0x00, 0x00, // addr
                                 0xAA, 0x55, 0x33, 0x77 }; // data
    struct spi_ioc_transfer xfer_pp = {
        .tx_buf = (unsigned long)tx_pp,
        .rx_buf = 0,
        .len    = sizeof(tx_pp),
        .delay_usecs = 0,
        .speed_hz = speed,
        .bits_per_word = bits,
    };
    if (ioctl(fd, SPI_IOC_MESSAGE(1), &xfer_pp) < 0) {
        perror("spi message pp"); close(fd); return 1;
    }
    /* Flash now internally programs the page; check WIP bit if needed */
    close(fd);
    return 0;
}
```
*Why this works*:  
* The first transfer sends only the `0x9F` command; the slave clocks out three ID bytes on MISO while MOSI is held low (or previously sent command).  
* The second transfer concatenates command, address, and data into a single buffer; the master keeps CS asserted (`cs_change=0` by default) so the flash sees a continuous stream: `0x02` <addr> <data>. The flash shifts in bits on MOSI on each SCK edge (according to CPOL/CPHA) and stores the data into the internal address latch, then initiates the internal programming sequence after the final clock edge.

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Fails |
|---|---------|--------------|--------------|
| 1 | **Missing pull‑up resistors** on I2C SDA/SCL | Bus lines float high; rise time limited only by parasitic capacitance → severely degraded speed or permanent bus lock‑up. | Without a defined RC time constant, the bus cannot meet the \(t_{rise}\) spec; slaves may never see a valid high level, causing perpetual NACK or bus contention. |
| 2 | **Ignoring clock stretching** (I2C) | Master assumes SCL toggles at programmed frequency; slave holds SCL low to slow down. | Sampling occurs while data is still changing → bit errors, CRC failures, or lost acknowledgments. The master must either use a controller that automatically detects stretch or implement a timeout‑based retry. |
| 3 | **Wrong SPI mode (CPOL/CPHA)** | Master and slave disagree on which edge samples data. | The first bit is sampled on the wrong clock edge, shifting the entire word by one bit; subsequent bytes are also offset, resulting in garbage data. |
| 4 | **Failing to deassert CS between SPI transfers** when required | Slave remains selected while master sends unrelated data (e.g., to another device). | The slave interprets the stray bytes as part of its protocol, possibly entering an undefined state or corrupting its internal registers. |
| 5 | **Not checking return values** of `i2c_transfer` or `spi_sync` | Errors such as `-EREMOTEIO` (NACK) or `-ETIMEDOUT` are ignored. | Silent failures lead to stale data being used; debugging becomes nearly impossible without inspecting error codes. |
| 6 | **Using incorrect address width** (e.g., treating a 10‑bit address as 7‑bit) | The transmitted address byte is malformed. | Slave never acknowledges; master sees NACK on address byte, often mistaken for a bus fault. |
| 7 | **Configuring SPI speed beyond peripheral limits** | `f_{SCK}` exceeds the flash/sensor’s maximum frequency. | Setup/hold time violations cause bit errors; at worst the slave may latch incorrect data, leading to corrupted flashes or sensor misreads. |
| 8 | **Sharing a CS line without proper software arbitration** | Two drivers toggle the same GPIO without locking. | Simultaneous activation creates bus contention (two masters driving MISO) → signal integrity loss and possible device damage. |

---

## Exercises
### Easy
1. **Bus enumeration**  
   ```bash
   sudo modprobe i2c-dev
   i2cdetect -y 1      # shows all responsive addresses on bus 1
   ls -l /dev/spidev*  # lists SPI device nodes
   ```
   *Goal*: Verify that the expected devices appear.

2. **Read a known register via command line**  
   ```bash
   i2cget -y 1 0x48 0x00 w   # read word (2 bytes) from TMP102 pointer 0
   spidev_test -D /dev/spidev0.0 -s 1000000 -p     # basic SPI loopback test
   ```

### Medium
3. **Write a character driver that reads the TMP102 temperature**  
   - Use `i2c_get_adapter()` to obtain adapter 1.  
   - Allocate two `struct i2c_msg` (write pointer, read data).  
   - Call `i2c_transfer()` and convert the raw value to Celsius in the driver’s `read()` method.  
   - Export `/sys/class/hwmon/hwmon0/temp1_input`.  

4. **Implement SPI flash page‑program with verification**  
   - Open `/dev/spidev0.0`, set mode 0, 8‑bit, 5 MHz.  
   - Send JEDEC ID command to confirm device.  
   - Program a known pattern (e.g., incrementing bytes) to page 0x000000.  
   - Read back the page and compare with the pattern; report any mismatches.  

### Hard
5. **Bit‑bang I2C on GPIOs and measure timing**  
   - Export two GPIOs (e.g., `echo 465 > /sys/class/gpio/export`, `echo 466 > ...`).  
   - Software‑generate SCL at 100 kHz using `nanosleep` loops, obeying open‑drain by setting GPIO to input for high and output low for low.  
   - Use an oscilloscope or a logic analyser to verify rise/fall times meet the I2C spec; adjust pull‑up resistor values in software (by toggling drive strength if available).  

6. **DMA‑assisted SPI transfer on a SoC that supports it**  
   - Identify the SPI controller’s DMA channels in the SoC manual.  
   - Request a DMA channel via `dma_request_chan()`.  
   - Prepare a descriptor table for a multi‑segment transfer (command + address + data).  
   - Submit with `dmaengine_prep_slave_single()` and wait for completion.  
   - Compare CPU utilization vs. pure‑PIO transfer using `top` or `perf stat`.  

---

## Linux Connection
### Subsystems and Filesystem Nodes
| Subsystem | Core kernel struct | Device‑tree binding | Userspace node | Typical utilities |
|-----------|--------------------|---------------------|----------------|-------------------|
| I2C core | `i2c_adapter` (`drivers/i2c/i2c-core.c`) | `compatible = "i2c-gpio"` or `i2c-mux` | `/dev/i2c-<nr>` (created by `i2c-dev` driver) | `i2cdetect`, `i2cget`, `i2cset`, `i2cdump` |
| SMP / SMBus (optional) | same adapter, extended functionality flags | – | same node | `i2c-smbus` commands |
| SPI core | `spi_master` (`drivers/spi/spi.c`) | `compatible = "spi-gpio"` or controller‑specific | `/dev/spidev<bus>.<cs>` (created by `spi-dev` driver) | `spidev_test`, `flashrom`, `spi‑tool` |

**Loading the userspace drivers** (once per boot):
```bash
sudo modprobe i2c-dev      # creates /dev/i2c-*
sudo modprobe spi-dev      # creates /dev/spidev*
```

### Example: Accessing I2C bus 2 via sysfs
```bash
# Show adapter details
cat /sys/bus/i2c/devices/i2c-2/name
cat /sys/bus/i2c/devices/i2c-2/of_node/name   # if DT bound

# Bind a device manually (e.g., TMP102 at 0x48)
echo tmp102 0x48 > /sys/bus/i2c/devices/i2c-2/new_device
# The kernel creates /sys/bus/i2c/devices/2-0048/
cat /sys/bus/i2c/devices/2-0048/hwmon/hwmon0/temp1_input
```

### Example: SPI device configuration via sysfs
```bash
# Set mode and speed for spidev0.0
echo 0 > /sys/devices/platform/spi_spidev/spi0.0/mode   # 0 = SPI_MODE_0
echo 8 > /sys/devices/platform/spi_spidev/spi0.0/bits_per_word
echo 5000000 > /sys/devices/platform/spi_spidev/spi0.0/max_speed_hz

# Raw transfer using the spidev interface (no kernel driver needed)
printf "\x9F\x00\x00\x00" | dd of=/dev/spidev0.0 bs=1 count=4
hexdump -
