---
id: 127
title: "UART and serial subsystems"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When a kernel panic dumps its backtrace over a serial cable at 3 AM, or when `pppd` turns a raw UART into a network link, or when SSH multiplexes dozens of interactive sessions through pseudoterminals — all of that runs through the TTY subsystem. The reason this layer exists isn't abstraction for its own sake: without a swappable line discipline, every protocol that uses serial hardware (PPP, SLIP, Bluetooth HCI, HDLC) would have to be reimplemented inside every UART driver. Without the TTY core managing `termios` state, every application would negotiate baud rates and echo behavior directly with hardware. The TTY layer enforces a contract: drivers speak bytes, line disciplines speak protocol, and applications speak POSIX.

---

## Core Concepts

### The Three-Layer Stack

Data between a user process and serial hardware passes through three layers with strict boundaries:

```
User process  (read/write on /dev/ttyS0)
      ↕
  TTY Core          — file descriptor ownership, session management, signal delivery
      ↕
Line Discipline     — data transformation: echo, erase, newline cooking, framing
      ↕
  TTY Driver        — hardware register I/O, DMA, interrupt handling
```

The driver's only job is byte transport. It pushes received bytes into the flip buffer via `tty_insert_flip_char()` and gets bytes to transmit via its `write()` op. It never calls line discipline functions directly — that boundary is enforced by the core. The line discipline never touches hardware — that's enforced by the fact that it only has access to the `tty_struct`, not the driver's private data.

This matters concretely: when `pppd` opens `/dev/ttyS0` and issues:

```c
int disc = N_PPP;
ioctl(fd, TIOCSETD, &disc);
```

…the PPP line discipline replaces `N_TTY` on that UART. The driver doesn't change. The hardware doesn't change. Only the byte-processing layer changes. The same mechanism works for `N_HDLC`, `N_SLIP`, `N_GSM` (multiplexed GSM modems), and `N_BLUETOOTH_HCI`.

### Why Line Disciplines Are Swappable

Line disciplines exist as a separate layer specifically because the set of protocols that run over serial hardware is open-ended. If the discipline were compiled into the driver, adding PPP support would require modifying every UART driver. Instead, a discipline registers itself:

```c
static struct tty_ldisc_ops ppp_ldisc = {
    .owner      = THIS_MODULE,
    .magic      = TTY_LDISC_MAGIC,
    .name       = "ppp",
    .open       = ppp_asynctty_open,
    .close      = ppp_asynctty_close,
    .read       = ppp_asynctty_read,
    .write      = ppp_asynctty_write,
    .receive_buf = ppp_async_input,
    .write_wakeup = ppp_async_wakeup,
};

tty_register_ldisc(N_PPP, &ppp_ldisc);
```

The `receive_buf` hook is what the TTY core calls when the driver delivers bytes upward. The discipline owns all interpretation from that point forward.

You can inspect which discipline is active on a TTY:

```bash
# Read current line discipline number (0 = N_TTY, 3 = N_PPP, etc.)
cat /proc/tty/ldiscs

# Or via ldattach — attach a discipline to a serial port from userspace
ldattach --debug --speed 115200 SLIP /dev/ttyS0
```

Discipline numbers are defined in `include/uapi/linux/tty.h`.

### UART Hardware: Registers and Timing

A UART converts parallel bus data to a serial bit stream using an agreed timing contract. Both ends configure the same baud rate; the receiver samples each bit at its center. The bit duration is:

$$T_{bit} = \frac{1}{B}$$

where $B$ is the baud rate in bits/s. At 115200 baud:

$$T_{bit} = \frac{1}{115200} \approx 8.68\ \mu s$$

A full 8N1 frame (8 data bits, no parity, 1 stop bit) requires 10 bit-times including the start bit, so each byte takes:

$$T_{frame} = \frac{10}{B}$$

At 115200 baud, that's $\approx 86.8\ \mu s$ per byte, yielding a maximum throughput of $115200 / 10 = 11520$ bytes/s — not 115200. This distinction matters when sizing receive buffers and interrupt latency budgets.

The 16550 UART's register map (base address $A$, 1-byte stride) illustrates how software controls framing:

| Offset | Name | Function |
|--------|------|----------|
| +0 | RBR/THR | Receive Buffer / Transmit Holding |
| +1 | IER | Interrupt Enable |
| +2 | IIR/FCR | Interrupt ID / FIFO Control |
| +3 | LCR | Line Control (word length, parity, stop bits) |
| +4 | MCR | Modem Control (DTR, RTS, loopback) |
| +5 | LSR | Line Status (data ready, overrun, framing errors) |
| +6 | MSR | Modem Status (CTS, DCD, DSR, RI) |

The LCR format directly encodes `c_cflag` bits. For 8N1, bits [1:0] = `11` (8 data bits), bit 2 = 0 (1 stop bit), bits [5:3] = `000` (no parity):

$$\text{LCR} = 0b00000011 = 0x03$$

For 7E1 (7 data bits, even parity, 1 stop bit): bits [1:0] = `10`, bit 3 = 1 (parity enable), bit 4 = 1 (even parity):

$$\text{LCR} = 0b00011010 = 0x1A$$

**Modem control lines** are managed through MCR and MSR. The CPU drives DTR and RTS via MCR writes; the remote device drives CTS, DCD, DSR, and RI, which appear in the MSR:

| Line | Register | Direction (DTE perspective) | Meaning |
|------|-----------|-----------------------------|---------|
| DTR  | MCR[0]   | Output | Terminal is powered and ready |
| RTS  | MCR[1]   | Output | Terminal's receive buffer has space |
| CTS  | MSR[4]   | Input  | Remote permits transmission |
| DCD  | MSR[7]   | Input  | Modem has established carrier |
| DSR  | MSR[5]   | Input  | Modem is powered and ready |

Hardware flow control works by the driver checking CTS before writing to THR, and asserting/deasserting RTS based on how full the receive FIFO is. USB-to-serial adapters (FTDI, CP210x, CH341) emulate these registers in firmware; the driver maintains shadow copies because the USB protocol adds latency that makes polling MSR directly impractical.

### TTY Drivers vs. Console Drivers

These are separate registration paths, not separate hardware abstractions. A TTY driver registers via `tty_register_driver()` and is used for process I/O after the VFS is up. A console driver registers via `register_console()` and must be functional during early boot — before `initcalls`, before `/dev` exists, before the scheduler is running in its final form.

The same UART can serve both. The console side uses a stripped-down `write()` callback that spins on the transmit-holding-register-empty bit (LSR[5]) rather than using interrupts, because interrupt infrastructure may not be fully initialized yet:

```c
static void my_console_write(struct console *co, const char *s, unsigned count)
{
    struct uart_port *port = &my_ports[co->index];
    /* Spin-wait: no interrupts, no DMA */
    uart_console_write(port, s, count, my_putchar);
}

static struct console my_console = {
    .name   = "ttyS",
    .write  = my_console_write,
    .device = uart_console_device,
    .setup  = my_console_setup,
    .flags  = CON_PRINTBUFFER | CON_ENABLED,
    .index  = -1,
};
```

`CON_PRINTBUFFER` causes the console to replay the kernel log ring buffer once it comes up, which is how you see early boot messages on a serial console even though it registered after some of them were emitted.

To configure the early serial console from the kernel command line:

```bash
# In bootloader (GRUB, U-Boot, etc.)
console=ttyS0,115200n8

# Inspect active consoles at runtime
cat /sys/class/tty/console/active   # e.g., "ttyS0 tty0"
```

---

## How It Works

### Registering a TTY Driver

`struct tty_driver` is allocated with `tty_alloc_driver()` (the modern replacement for `alloc_tty_driver()`). Each field has a non-obvious consequence:

```c
static struct tty_driver *tiny_tty_driver;

static int __init tiny_init(void)
{
    int retval;

    /*
     * TINY_TTY_MINORS: how many device nodes to create (/dev/ttty0 .. tttyN-1).
     * Each minor gets its own tty_port, open count, and termios state.
     */
    tiny_tty_driver = tty_alloc_driver(TINY_TTY_MINORS,
                                       TTY_DRIVER_REAL_RAW |
                                       TTY_DRIVER_DYNAMIC_
