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

## Why This Matters

I2C and SPI exist because of a fundamental constraint: GPIO pins are stateless and dumb. You can bit-bang a temperature sensor over raw GPIOs, but the kernel has no way to arbitrate bus access, retry collisions, or express the concept of a register read. The I2C and SPI subsystems solve this by defining **typed transactions** — structured transfers that multiple drivers can issue against a shared bus without stepping on each other. The split into controller driver and device driver is not an abstraction for elegance's sake; it is what allows a BME280 driver written for a Raspberry Pi to run unmodified on an i.MX8, because neither board's peculiarities leak into the device-level code.

## Core Concepts

### The Two-Layer Split and Why It Exists

Controller drivers live under `drivers/i2c/busses/` (e.g., `i2c-bcm2835.c`, `i2c-imx.c`) and know only how to toggle physical pins on one specific piece of silicon. Device drivers live under `drivers/iio/`, `drivers/hwmon/`, `drivers/input/`, etc., and know only what register sequences a specific chip expects. The glue between them is a small set of shared structs.

The same pattern appears in every Linux bus: a `struct bus_type` owns a match function and a probe dispatch, adapter objects represent controller instances, and client/device objects represent chips. The match is by name string, device tree compatible string, or ACPI ID — not by memory address or interrupt number, which are controller-specific and therefore invisible to device drivers.

### I2C: Protocol Mechanics

I2C uses two open-drain lines: **SDA** (data) and **SCL** (clock). Open-drain means any participant can pull a line low by turning on a transistor to ground, but no one drives it high — the line floats high via a pull-up resistor to $V_{CC}$. This is what allows bus sharing without tri-state buffers and what makes pull-up resistor selection non-trivial.

The rise time of the bus is an RC problem. If $R_p$ is the pull-up resistance and $C_b$ is the total bus capacitance (sum of all device input capacitances plus PCB trace capacitance):

$$t_r \approx 0.8473 \cdot R_p \cdot C_b$$

The I2C specification requires $t_r < 1000\,\text{ns}$ for standard mode (100 kHz) and $t_r < 300\,\text{ns}$ for fast mode (400 kHz). If your bus has $C_b = 100\,\text{pF}$, the maximum pull-up for fast mode is:

$$R_p < \frac{300\,\text{ns}}{0.8473 \cdot 100\,\text{pF}} \approx 3.5\,\text{k}\Omega$$

Too large a pull-up and the bus cannot switch fast enough. Too small and the current draw increases — the minimum pull-up is bounded by the maximum source current each device can sink, typically $3\,\text{mA}$, giving $R_{p,\min} = V_{CC}/3\,\text{mA}$.

Every transaction has the form:

```
START | ADDR[6:0] | R/W | ACK | DATA[0] | ACK | ... | DATA[n] | ACK | STOP
```

A **repeated START** (Sr) issues a new START without a preceding STOP. This is mandatory for register-read sequences: write the register address in one direction, then read data back in the other, without releasing bus ownership between the two phases. Any driver that issues a STOP between write and read allows another master to interpose — a race condition that corrupts the read on multi-master buses.

### SPI: Protocol Mechanics

SPI uses four lines: **SCLK** (clock), **MOSI** (master-out slave-in), **MISO** (master-in slave-out), and **CS** (chip select, active-low, one per device). There is no addressing on the bus — CS assertion is the entire addressing mechanism. Full-duplex means that on every clock edge the master shifts one bit out on MOSI and simultaneously shifts one bit in on MISO, even if the device has nothing meaningful to return.

The four SPI modes are defined by two bits in the device's datasheet:

| Mode | CPOL | CPHA | Clock idle | Sample edge |
|------|------|------|------------|-------------|
| 0    | 0    | 0    | Low        | Rising      |
| 1    | 0    | 1    | Low        | Falling     |
| 2    | 1    | 0    | High       | Rising      |
| 3    | 1    | 1    | High       | Falling     |

**CPOL** sets the idle state of the clock. **CPHA** sets which edge latches data. Picking the wrong mode produces a bit stream that is shifted by one bit or inverted — the device will appear to respond but return garbage.

Adding $n$ SPI devices to a bus requires $n$ CS lines, each a dedicated GPIO. For $n$ devices, the wiring cost grows as $O(n)$ in GPIO pins. I2C's addressing allows up to 112 usable devices (out of 128 7-bit addresses, with 16 reserved) on two wires regardless of $n$.

### Device Tree Binding

Neither I2C nor SPI devices are discoverable at runtime — there is no equivalent of PCI's configuration space. The kernel learns about them from the device tree (or ACPI on x86). A typical I2C binding in a `.dts` file:

```
&i2c1 {
    clock-frequency = <400000>;

    bme280: pressure@76 {
        compatible = "bosch,bme280";
        reg = <0x76>;      /* 7-bit I2C address */
    };
};
```

The `reg` property is the 7-bit address. The `compatible` string drives the match against `i2c_driver.driver.of_match_table`. For SPI:

```
&spi0 {
    mpu6000: imu@0 {
        compatible = "invensense,mpu6000";
        reg = <0>;                  /* chip select index */
        spi-max-frequency = <1000000>;
    };
};
```

Here `reg` is the CS index, not an address. The controller driver maps the index to a GPIO.

## How It Works

### I2C Kernel Structures

```c
/* drivers/i2c/i2c-core.h and include/linux/i2c.h */

/* One hardware I2C controller */
struct i2c_adapter {
    struct i2c_algorithm  *algo;       /* vtable for xfer */
    void                  *algo_data;  /* controller private state */
    struct device          dev;
    int                    nr;         /* /dev/i2c-N index */
    struct mutex           bus_lock;   /* serializes transfers */
    /* ... */
};

/* Function pointers implemented by the controller driver */
struct i2c_algorithm {
    /* Returns number of messages transferred, or negative errno */
    int (*master_xfer)(struct i2c_adapter *adap,
                       struct i2c_msg *msgs, int num);
    /* Bitmask: I2C_FUNC_I2C, I2C_FUNC_SMBUS_*, etc. */
    u32 (*functionality)(struct i2c_adapter *adap);
};

/* One device on the bus */
struct i2c_client {
    unsigned short   addr;       /* 7-bit address, left-justified */
    struct i2c_adapter *adapter; /* the bus it lives on */
    struct device    dev;
    int              irq;
    /* ... */
};

/* One message segment — multiple form a transaction */
struct i2c_msg {
    __u16 addr;   /* slave address */
    __u16 flags;  /* I2C_M_RD, I2C_M_TEN, I2C_M_NOSTART, ... */
    __u16 len;
    __u8 *buf;
};
```

`i2c_transfer()` acquires `adapter->bus_lock`, then calls `adapter->algo->master_xfer()`. The lock is a mutex, so callers must not be in interrupt context. Between messages in the same call, the controller issues a repeated START; between calls from different drivers, the mutex ensures serialization. The abstraction overhead is one mutex acquisition plus one indirect function call per transaction — at 400 kHz, transactions take microseconds, so this cost is irrelevant.

### Writing a Minimal I2C Device Driver

```c
#include <linux/i2c.h>
#include <linux/module.h>
#include <linux/of.h>

struct mysensor_data {
    struct i2c_client *client;
};

static int mysensor_probe(struct i2c_client *client)
{
    struct mysensor_data *data;
    struct i2c_msg msgs[2];
    u8 reg_addr = 0x00;
    u8 val;
    int ret;

    /* Fail fast if the controller can't do raw I2C transfers */
    if (!i2c_check_functionality(client->adapter, I2C_FUNC_I2C))
        return -EOPNOTSUPP;

    data = devm_kzalloc(&client->dev, sizeof(*data), GFP_KERNEL);
    if (!data)
        return -ENOMEM;
    data->client = client;
    i2c_set_clientdata(client, data);

    /*
     * Register read: write register address, repeated START, read value.
     * Two msgs in one i2c_transfer() call → no STOP between them.
     */
    msgs[0].addr  = client->addr;
    msgs[0].flags = 0;              /* write */
    msgs[0].len   = 1;
    msgs[0].buf   = &reg_addr;

    msgs[1].addr  = client->addr;
    msgs[1].flags = I2C_M_RD;      /* read,
