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

## Core Concepts
### UART as a State Machine
A UART converts parallel data from the CPU into a serial bit‑stream and vice‑versa. The transmitter holds a **shift register** that is loaded with a byte (plus start/stop bits) and then shifts it out at the programmed baud rate. The receiver samples the incoming line at a rate 16× the baud rate, detects the falling edge of the start bit, and then shifts bits into a register until the expected number of data bits, parity bit, and stop bits have been sampled. If the stop bit is not high, a **framing error** is flagged. This deterministic timing makes the UART a simple synchronous‑looking state machine despite the asynchronous line.

### Serial Communication Fundamentals
Asynchronous serial link requires explicit framing because there is no separate clock line. Each character begins with a **start bit** (logic 0) that synchronizes the receiver, followed by 5‑8 data bits, an optional parity bit, and 1‑2 stop bits (logic 1). The line returns to the idle state (logic 1) between characters. The probability of a sampling error grows with baud rate; therefore UARTs typically use 16× oversampling to allow the receiver to locate the bit centre within ±1/32 of a bit‑time, giving a tolerance of about ±3 % before framing errors appear.

### TTY Layer Abstraction
The Linux **TTY (Teletype) layer** is a character‑device subsystem that presents a uniform interface (`struct tty_operations`) to drivers, line disciplines, and user‑space programs. It decouples hardware specifics (UART registers, DMA, IRQs) from higher‑level semantics (canonical input, echo, signal generation). A `struct tty_struct` aggregates:
* a pointer to the **tty driver** (e.g., 8250 UART driver),
* a **line discipline** (e.g., `n_tty` for canonical processing),
* termios configuration,
* read/write buffers,
* wait queues for blocking I/O.

When a UART driver receives a byte, it places it in the tty’s **receive buffer**; the line discipline then processes the buffer (e.g., stripping start/stop bits, applying parity checks) before making data available to `read()` system calls.

### Consoles as TTY Devices
A Linux console is simply a TTY device bound to the **virtual console driver** (`vt_driver`). The console registers itself as a tty driver (`/dev/tty0` is the current VT, `/dev/tty1`‑`/dev/tty63` are specific VTs). Output from `printk` is directed to the current console tty via `tty_put_char()`. Input from the keyboard passes through the keyboard driver, then the `n_tty` line discipline (which handles Ctrl‑C, Ctrl‑Z, etc.), and finally appears on the tty’s read queue. Because the console implements the same tty interface as a UART, the same termios settings and ioctls apply.

## How It Works
### UART Internal Workings
#### Transmitter
1. **Load**: CPU writes a byte to the UART’s **THR** (Transmit Holding Register).  
2. **Shift**: The UART moves the byte to the **TSR** (Transmit Shift Register) and adds a start bit (0), parity (if enabled), and stop bits (1 or 2).  
3. **Shift‑out**: At each **baud tick** (`T_bit = 1/baud`), the TSR shifts one bit out onto the TX line.  
4. **Idle**: After the stop bit(s), the line stays high until the next THR load.

#### Receiver
1. **Idle detection**: Line high = idle.  
2. **Start detection**: A falling edge triggers a **start bit search**; the UART waits ½ bit‑time then samples to confirm a low.  
3. **Bit sampling**: Using a 16× clock, the UART samples the line at multiples of `T_bit/16`. The ideal sample point is at 8/16 (the middle of the bit).  
4. **Assembly**: Each sampled bit is shifted into the **RSR** (Receive Shift Register). After the programmed number of data bits, parity, and stop bits are collected, the UART checks the stop bit. If it is not high, a framing error (FE) flag is set.  
5. **Transfer**: The assembled byte (with error flags) is moved to the **RBR** (Receive Buffer Register) and the **data ready** interrupt is raised.

#### Timing Math
The UART’s internal baud‑rate generator divides the reference clock (`UART_CLK`) by a programmable divisor. Most 16550‑compatible UARTs use 16× oversampling:

$$
\text{Divisor} = \frac{UART\_CLK}{16 \times \text{Desired Baud}}
$$

*Example*: With a 1.8432 MHz crystal and a target of 115 200 baud,
$$
\text{Divisor} = \frac{1\,843\,200}{16 \times 115\,200} = 1.0
$$
The exact divisor yields zero error. For a 24 MHz clock:
$$
\text{Divisor} = \frac{24\,000\,000}{16 \times 115\,200} = 13.02 \rightarrow 13
$$
Actual baud:
$$
\text{Baud}_{actual} = \frac{24\,000\,000}{16 \times 13} = 115\,384.6\ \text{baud}
$$
Relative error:
$$
\frac{115\,384.6 - 115\,200}{115\,200} \approx +0.16\%
$$
Well within the typical ±3 % tolerance, so communication succeeds.

### TTY Layer Mechanism
When a process opens `/dev/ttyS0`, the VFS routes the request to the **8250 UART driver** (`serial8250_open()`). The driver:
* allocates a `struct uart_port`,
* registers an IRQ handler,
* initializes the UART’s divisors and line control register (LCR) based on the termios settings stored in the attached `struct tty_struct`.

Data flow:
1. **User → Kernel**: `write(fd, buf, n)` calls the tty’s `write()` method, which copies data to the UART’s THR via the driver’s `transmit_chars()`.
2. **Kernel → Hardware**: The UART transmitter shifts bits out as described above.
3. **Hardware → Kernel**: Receive interrupt invokes the driver’s `receive_chars()`, which moves bytes from RSR to the tty’s **receive buffer**.
4. **Kernel → User**: The line discipline (e.g., `n_tty`) processes the buffer (echo, canonical editing, signal generation) and then makes data available for `read()`.

Key termios flags (bitwise):
* `CBAUD` (bits in `c_cflag`) encode the baud rate via `B0…B4000000`.
* `CSIZE` (`CS5`‑`CS8`) sets data bits.
* `PARENB` enables parity; `PARODD` selects odd parity.
* `CSTOPB` selects 2 stop bits (else 1).
* `CREAD` enables receiver; `CLOCAL` ignores modem control lines.
* `IXON`, `IXOFF` enable software flow control (start/stop characters).

Changing these flags requires a **read‑modify‑write** of `c_cflag` followed by `tcsetattr(fd, TCSAFLUSH, &tty)`.

### Serial Port Configuration
Configuration proceeds through the POSIX termios API. The steps are:
1. Open the device with `O_RDWR | O_NOCTTY` (avoid becoming controlling terminal unintentionally).
2. Fetch current state: `tcgetattr(fd, &tty)`.
3. Mask undesired bits, set desired bits.
4. Commit: `tcsetattr(fd, TCSAFLUSH, &tty)` (waits for output to drain and then applies changes immediately).

Example: setting 115 200 baud, 8N1, no flow control.
```c
#include <termios.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>

int configure_uart(int fd)
{
    struct termios tty;
    if (tcgetattr(fd, &tty) != 0) {
        perror("tcgetattr");
        return -1;
    }

    /* Clear previous settings, possibly unaware of the driver's state. */
    tty.c_cflag &= ~(CSIZE | PARENB | CSTOPB | CRTSCTS);   /* mask */
    /* 8 data bits, no parity, 1 stop bit */
    tty.c_cflag |= CS8 | CREAD | CLOCAL;                  /* enable receiver, ignore modem lines */
    /* Input flags: ignore break, no parity check, no strip */
    tty.c_iflag &= ~(IGNBRK | PARMRK | INPCK | ISTRIP | IXON | IXOFF | IXANY);
    /* Raw output */
    tty.c_oflag &= ~(OPOST);
    /* Non‑canonical input */
    tty.c_lflag &= ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN);
    tty.c_cc[VMIN]  = 0;   /* read returns immediately */
    tty.c_cc[VTIME] = 10;  /* 1 second timeout (tenths of sec) */

    /* Baud rate */
    cfsetispeed(&tty, B115200);
    cfsetospeed(&tty, B115200);

    if (tcsetattr(fd, TCSAFLUSH, &tty) != 0) {
        perror("tcsetattr");
        return -1;
    }
    return 0;
}
```
The call to `cfsetispeed()/cfsetospeed()` writes the appropriate divisor into the UART’s **DLAB** (Divisor Latch Access Baud) registers via the driver’s `set_termios()` method.

## Worked Examples
### Example 1: Configuring a Serial Port (9600 8N1)
Goal: Open `/dev/ttyS1`, set 9600 baud, 8 data bits, no parity, 1 stop bit, enable receiver, ignore modem lines, and use canonical input (line‑editing) with echo.

**Step‑by‑step**
1. **Open** the device. `O_NOCTTY` prevents the port from becoming the controlling terminal (important for background daemons).
```c
int fd = open("/dev/ttyS1", O_RDWR | O_NOCTTY);
if (fd < 0) {
    perror("open");
    exit(EXIT_FAILURE);
}
```
2. **Get** current termios.
```c
struct termios tty;
if (tcgetattr(fd, &tty) < 0) { perror("tcgetattr"); close(fd); exit(EXIT_FAILURE); }
```
3. **Clear** flags we will set.
```c
tty.c_cflag &= ~(CSIZE | PARENB | CSTOPB | CRTSCTS);
tty.c_iflag &= ~(IGNBRK | PARMRK | INPCK | ISTRIP | IXON | IXOFF | IXANY);
tty.c_lflag &= ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN);
tty.c_oflag &= ~(OPOST);
```
4. **Set** desired bits.
```c
tty.c_cflag |= CS8 | CREAD | CLOCAL;   /* 8‑bit, enable receiver, ignore modem lines */
tty.c_iflag |= IGNBRK;                 /* ignore break condition */
tty.c_lflag |= ECHO | ICANON;          /* enable echo and canonical input */
```
5. **Set** baud rate via convenience functions.
```c
cfsetispeed(&tty, B9600);
cfsetospeed(&tty, B9600);
```
6. **Apply** changes, waiting for output to finish.
```c
if (tcsetattr(fd, TCSAFLUSH, &tty) < 0) {
    perror("tcsetattr");
    close(fd);
    exit(EXIT_FAILURE);
}
```
7. **Use** the port (e.g., `write(fd, "AT\r\n", 4);`) then `close(fd)` when done.

**Why each step matters**
* Clearing before setting avoids inheriting stale flags that could enable parity or hardware flow control unintentionally.
* `CREAD` must be set; otherwise the receiver circuitry is disabled and no data will appear in the buffer.
* `CLOCAL` tells the driver to ignore modem status lines (CTS, DSR, DCD, RI). Without it, the driver may wait for DSR to assert before allowing transmission, causing apparent hangs.
* `ICANON` enables line‑editing (erase, kill, re‑print) and makes `read()` return only when a newline (`\n`) is seen, which is convenient for interactive commands.
* `ECHO` causes input characters to be retransmitted; omitting it yields a silent terminal.

### Example 2: Simple Serial Driver (Transmit & Receive)
This example demonstrates a minimal program that sends a known byte pattern over a loopback connector (TX tied to RX) and verifies reception.

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <termios.h>
#include <errno.h>
#include <string.h>

#define LOOPBACK_DEV "/dev/ttyS2"
#define TEST_PATTERN 0xA5   /* 10100101b – easy to spot on a scope */

static int configure_port(int fd)
{
    struct termios tty;
    if (tcgetattr(fd, &tty) < 0) { perror("tcgetattr"); return -1; }

    /* 8N1, 115200 baud, no flow control */
    tty.c_cflag &= ~(CSIZE | PARENB | CSTOPB | CRTSCTS);
    tty.c_cflag |= CS8 | CREAD | CLOCAL;
    tty.c_iflag &= ~(IGNBRK | PARMRK | INPCK | ISTRIP | IXON | IXOFF | IXANY);
    tty.c_oflag &= ~(OPOST);
    tty.c_lflag &= ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN);
    tty.c_cc[VMIN] = 1;   /* block until at least 1 byte received */
    tty.c_cc[VTIME] = 0;

    cfsetispeed(&tty, B115200);
    cfsetospeed(&tty, B115200);

    return tcsetattr(fd, TCSAFLUSH, &tty);
}

int main(void)
{
    int fd = open(LOOPBACK_DEV, O_RDWR | O_NOCTTY);
    if (fd < 0) {
        perror("open LOOPBACK_DEV");
        return EXIT_FAILURE;
    }
    if (configure_port(fd) < 0) { close(fd); return EXIT_FAILURE; }

    unsigned char tx = TEST_PATTERN;
    ssize_t w = write(fd, &tx, 1);
    if (w != 1) {
        perror("write");
        close(fd);
        return EXIT_FAILURE;
    }

    unsigned char rx;
    ssize_t r = read(fd, &rx, 1);
    if (r != 1) {
        perror("read");
        close(fd);
        return EXIT_FAILURE;
    }

    if (rx == tx) {
        printf("Loopback test PASSED: sent 0x%02X, received 0x%02X\n", tx, rx);
    } else {
        printf("Loopback test FAILED: sent 0x%02X, received 0x%02X\n", tx, rx);
    }
    close(fd);
    return EXIT_SUCCESS;
}
```
**Explanation**
* `VMIN=1, VTIME=0` makes `read()` block until a byte arrives, simplifying the test.
* The loopback connector guarantees that what we transmit is immediately received, letting us verify UART configuration without external equipment.
* If the test fails, likely causes are baud‑rate mismatch, incorrect parity/stop‑bit settings, or the port being held reset by modem control lines (missing `CLOCAL`).

### Example 3: Using the TTY Layer to Implement a Console‑Like Output
A program that writes directly to the system console (`/dev/tty0`) to display messages even when no foreground shell is attached. This mimics what `printk` does, but from user space.

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/ioctl.h>
#include <linux/vt.h>
#include <errno.h>

int main(void)
{
    int fd = open("/dev/tty0", O_WRONLY);
    if (fd < 0) {
        perror("open /dev/tty0");
        return EXIT_FAILURE;
    }

    /* Ensure we have control of the VT (optional, but useful if switching VTs). */
    if (ioctl(fd, VT_GETACTIVE, &(int){0}) < 0) {
        perror("VT_GETACTIVE");
        /* Not fatal; we can still write to the current VT. */
    }

    const char *msg = "Hello from user‑space console\\n";
    if (write(fd, msg, strlen(msg)) < 0) {
        perror("write");
        close(fd);
        return EXIT_FAILURE;
    }

    /* Switch to VT 2 (if available) to demonstrate VT control. */
    int target = 2;
    if (ioctl(fd, VT_ACTIVATE, target) < 0) {
        perror("VT_ACTIVATE");
    }
    /* The kernel will automatically wait for the VT switch to complete. */
    close(fd);
    return EXIT_SUCCESS;
}
```
**Why this works**
* `/dev/tty0` is a special alias for the currently active virtual terminal. Writing to it goes through the VT driver’s `write()` implementation, which ultimately calls the underlying tty’s `write()` (same path as a UART).
* The `VT_GETACTIVE`/`VT_ACTIVATE` ioctls manipulate the VT scheduler; they are part of the TTY layer’s console functionality.
* No termios configuration is needed because the console defaults to a sane state (115200 baud‑equivalent, 8N1, echo off) for kernel messages; user‑space can change it with `tcsetattr` if desired.

## Common Mistakes
### Mistake 1: Incorrect Baud‑Rate Divisor Leading to >3 % Error
**What’s wrong**: Using a divisor that yields a baud rate outside the receiver’s tolerance causes frequent framing errors (FE).  
**Why it matters**: The UART receiver samples each bit at the centre of the bit‑time. If the transmitter’s bit period deviates by more than ~3 %, the sampling point drifts into the transition zone, and the receiver interprets the bit incorrectly, setting FE and possibly OE (overrun) flags.  
**How to avoid**: Compute the divisor with the exact formula, round
