---
id: 113
title: "Character device infrastructure"
supermoduleId: 9
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Kernel Development (Love)"
  - type: book
    title: "Understanding the Linux Kernel (Bovet)"
---

## Core Concepts
A character device transfers data as a raw byte stream without any notion of blocks or fixed-size records. Unlike block devices, which expose an addressable array of sectors that the kernel can cache and reorder, character devices are accessed strictly sequentially; the hardware typically produces or consumes bytes one at a time (e.g., UART, keyboard scanner, USB audio). Because there is no block abstraction, the VFS does not implement caching, read‑ahead, or write‑behind for character devices, and the `llseek` operation is undefined (it returns `-ESPIPE`).  

Each character device is represented in the filesystem by a **device node** (a special file) whose inode stores a `dev_t` consisting of a major and minor number. The major number identifies the driver that handles the device; the minor number distinguishes individual instances of that driver (e.g., different serial ports). When a process opens `/dev/ttyS0`, the VFS looks up the inode, extracts the dev_t, finds the associated `struct cdev` registered by the driver, and binds the file’s `f_op` pointer to the driver’s `file_operations` table.  

The driver supplies a set of methods in `struct file_operations`: `open`, `release`, `read`, `write`, `llseek`, `ioctl` (or `unlocked_ioctl`), and optionally `poll`. For character devices `llseek` is usually set to `noop_llseek_seek_end` or a function that returns `-ESPIPE`, signalling non‑seekability. The `ioctl` method provides a extensible, driver‑specific control path that avoids proliferating new system calls; its command encoding uses bit‑fields to convey direction, type, number, and size (see the math in *How It Works*).  

## How It Works
When a process invokes `open("/dev/ttyS0", O_RDWR)`, the VFS performs the following steps:  

1. **Inode lookup** – the dentry for `/dev/ttyS0` yields an `struct inode` whose `i_rdev` encodes the device number (`MKDEV(major,minor)`).  
2. **Driver binding** – the VFS calls `cdev_get` on the `struct cdev` attached to that inode (found via `inode->i_cdev`). This increments the driver’s module reference count (`try_module_get`).  
3. **File allocation** – a new `struct file` is allocated, its `f_op` set to `cdev->ops`, and `f_mode`/`f_flags` initialized from the open flags.  
4. **Open method** – if the driver defined `open`, it is called now; it may allocate per‑open data structures, enable hardware, or check permissions.  

Subsequent `read` or `write` syscalls are dispatched straight to the driver’s methods via `file->f_op->read`/`write`. The driver typically:  

- Allocates kernel memory with `kmalloc(size, GFP_KERNEL)` (or uses a pre‑allocated buffer).  
- Copies data from/to user space using `copy_to_user`/`copy_from_user`. These functions return the number of bytes **not** copied; a non‑zero result means the user buffer was faulted or inaccessible, and the driver must return `-EFAULT`.  
- Performs any hardware interaction (e.g., reading a UART data register, writing to a USB endpoint).  

Because user and kernel address spaces are separate, direct pointer dereference would cause a page fault; the copy functions safely handle atomic page faults and enforce access checks.  

The `ioctl` path works similarly: the driver’s `ioctl` (or `unlocked_ioctl`) receives an encoded command `unsigned long cmd` and argument `unsigned long arg`. The encoding is defined by the `_IOC` macros:  

```
#define _IOC_NRBITS   8
#define _IOC_TYPEBITS 8
#define _IOC_SIZEBITS 14
#define _IOC_DIRBITS  2

#define _IOC_NRSHIFT   0
#define _IOC_TYPEBSHIFT (_IOC_NRSHIFT+_IOC_NRBITS)
#define _IOC_SIZESSHIFT (_IOC_TYPEBSHIFT+_IOC_TYPEBITS)
#define _IOC_DIRSSHIFT  (_IOC_SIZESSHIFT+_IOC_SIZEBITS)

#define _IOC(dir,type,nr,size) \
    (((dir)  << _IOC_DIRSSHIFT) | \
     ((type) << _IOC_TYPEBSHIFT) | \
     ((nr)   << _IOC_NRSHIFT)   | \
     ((size) << _IOC_SIZESSHIFT))
```

Direction bits are `_IOC_NONE=0`, `_IOC_WRITE=1`, `_IOC_READ=2`. For example, `TIOCSERIAL` (used to configure a serial port) is defined as  

```
#define TIOCSERIAL   _IOW('T', 0, struct serial_struct)
```

which expands to a value where the direction bit indicates write (`_IOC_WRITE`), the type is `'T'`, the number is `0`, and the size is `sizeof(struct serial_struct)`. The driver decodes the command with `_IOC_TYPE(cmd)`, `_IOC_NR(cmd)`, `_IOC_DIR(cmd)`, and `_IOC_SIZE(cmd)` to determine how to interpret `arg`.  

**Timing example** – UART transmission at baud rate `B` bits per second with 8N1 framing (1 start, 8 data, 1 stop) takes  

$$
t_{\text{byte}} = \frac{1+8+1}{B} = \frac{10}{B}\;\text{seconds}.
$$  

At `B = 115200` baud, `t_byte ≈ 86.8 µs`. This calculation explains why a driver may need to busy‑wait or use a timer when transmitting at high rates.  

**Lifecycle** – on `close`, the VFS calls the driver’s `release` method, which frees per‑open data and calls `module_put` to decrement the module’s reference count. If the count reaches zero, the module can be unloaded.  

## Worked Examples
### Example 1: Reading a key press from the evdev interface
Modern keyboards appear as `/dev/input/event*` (evdev). Each `read` returns a `struct input_event`:

```c
struct input_event {
    struct timeval time;
    __u16 type;
    __u16 code;
    __s32 value;
};
```

**Step‑by‑step** (numbers are illustrative):

1. Open the device:  
   ```c
   int fd = open("/dev/input/event0", O_RDONLY | O_NONBLOCK);
   if (fd < 0) { perror("open"); exit(EXIT_FAILURE); }
   ```
2. Allocate a buffer on the stack (size known at compile time):  
   ```c
   struct input_event ev;
   ```
3. Attempt to read one event (size = `sizeof(ev)` = 16 bytes on 64‑bit kernels):  
   ```c
   ssize_t r = read(fd, &ev, sizeof(ev));
   if (r != sizeof(ev)) {
       if (r == -EAGAIN) /* no data ready */;
       else { perror("read"); close(fd); exit(EXIT_FAILURE); }
   }
   ```
4. Interpret fields (assume little‑endian):  
   - `ev.type == EV_KEY (0x01)` indicates a key event.  
   - `ev.code == KEY_A (0x1e)` is the scan code for the ‘A’ key.  
   - `ev.value == 1` means key‑press; `0` means release.  
   - `ev.time` holds a timestamp with microsecond resolution.  

A full program would loop, printing timestamps and key symbols until `Ctrl+C`. Note the use of `O_NONBLOCK` to avoid blocking indefinitely; in a real application you would use `poll` or `select` to wait for readability.  

### Example 2: Sending raw PCL to a USB printer
Many USB printers appear as `/dev/usb/lp0`. The driver accepts arbitrary bytes; common printer languages (PCL, ESC/P) are transmitted as raw streams.  

Reset the printer to a known state (PCL reset command `\033E`), then print a line:  

```bash
# Reset printer
printf '\033E' > /dev/usb/lp0
# Print "Hello World" followed by a carriage return and line feed
printf 'Hello World\r\n' > /dev/usb/lp0
```

Explanation:  
- `printf '\033E'` writes the two bytes `0x1B` (`ESC`) and `0x45` (`E`).  
- The printer interprets `ESC E` as “reset to factory defaults”.  
- The subsequent string ends with `\r\n` (CR = 0x0D, LF = 0x0A) which tells the printer to advance to the next line.  

If the printer expects ESC/P instead of PCL, replace the reset with `\033@` (ESC @). The driver does not perform any translation; it simply queues the bytes for the USB endpoint.  

### Example 3: Setting a custom baud rate on a serial port (16550 UART)
The legacy way to change baud rate uses the `serial_struct` ioctls; the modern way uses `termios`. Both are shown for completeness.  

**Using termios (preferred):**  

```c
#include <termios.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/ioctl.h>

int main(void) {
    int fd = open("/dev/ttyS0", O_RDWR | O_NOCTTY);
    if (fd < 0) { perror("open"); return 1; }

    struct termios t;
    if (tcgetattr(fd, &t) == -1) { perror("tcgetattr"); close(fd); return 1; }

    cfsetospeed(&t, B9600);   // output speed
    cfsetispeed(&t, B9600);   // input speed
    // 8N1, no parity, 1 stop bit, no flow control
    t.c_cflag &= ~(PARENB | CSTOPB | CSIZE);
    t.c_cflag |= CS8;
    t.c_iflag &= ~(IXON | IXOFF | IXANY); // disable software flow control
    t.c_lflag &= ~(ICANON | ECHO | ECHOE | ISIG); // raw input
    t.c_oflag &= ~OPOST; // raw output

    if (tcsetattr(fd, TCSANOW, &t) == -1) { perror("tcsetattr"); close(fd); return 1; }

    close(fd);
    return 0;
}
```

**Explanation of the math:** The UART’s baud rate generator derives the transmitter clock from the system clock (`clk`) via a divisor `D`:  

$$
\text{baud} = \frac{\text{clk}}{16 \times D}
$$  

For a standard 115200 baud base clock (`clk = 115200 × 16 = 1843200` Hz), setting `B9600` selects a divisor  

$$
D = \frac{\text{clk}}{16 \times 9600} = \frac{1843200}{153600} = 12.
$$  

The kernel programs the UART’s divisor latch registers with `D`.  

**Using the legacy `serial_struct` ioctl (illustrative):**  

```c
#include <linux/serial.h>
#include <sys/ioctl.h>
#include <fcntl.h>
#include <unistd.h>

int main(void) {
    int fd = open("/dev/ttyS0", O_RDWR);
    if (fd < 0) { perror("open"); return 1; }

    struct serial_struct ser;
    if (ioctl(fd, TIOCGSERIAL, &ser) == -1) { perror("TIOCGSERIAL"); close(fd); return 1; }

    // Want 230400 baud on a device whose base is 115200
    ser.baud_base = 115200;
    ser.custom_divisor = ser.baud_base / (230400 * 16); // = 3
    ser.flags &= ~ASYNC_SPD_MASK;
    ser.flags |= ASYNC_SPD_CUST;

    if (ioctl(fd, TIOCSSERIAL, &ser) == -1) { perror("TIOCSSERIAL"); close(fd); return 1; }

    close(fd);
    return 0;
}
```

Here the divisor is calculated from the desired baud:  

$$
\text{custom\_divisor} = \frac{\text{baud\_base}}{\text{desired\_baud} \times 16}.
$$  

For 230400 baud on a 115200 base clock, `custom_divisor = 115200 / (230400 × 16) = 0.03125` → the hardware uses a fractional divisor; the kernel instead enables the `ASYNC_SPD_CUST` flag and lets the UART’s divisor latch hold the integer part (`3`) while the UART’s internal scaling yields the correct rate. This demonstrates why the ioctl path is needed for non‑standard rates.  

## Common Mistakes
| # | Mistake | Why it’s Wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | **Assuming `lseek` works on character devices** (e.g., `lseek(fd, 0, SEEK_SET)`). | Character devices have no block layout; the VFS defines `llseek` to return `-ESPIPE` for non‑seekable devices. Using `lseek` ignores this contract and may succeed only if the driver erroneously implements a seekable `llseek`. | Non‑portable code; on hardware that truly lacks seek capability you’ll get `ESPIPE` and break the application. |
| 2 | **Neglecting to check the return value of `copy_to_user` / `copy_from_user`**. | These functions return the number of bytes **not** copied; a non‑zero result means the user buffer was not accessible (e.g., not mapped, or a fault occurred). Ignoring it writes to an invalid address or silently drops data. | Kernel oops (`BAD_ADDR`) or security vulnerability (information leak) if the driver continues as if the copy succeeded. |
| 3 | **Performing a blocking `read` inside interrupt context or while holding a spinlock**. | Blocking operations may sleep; sleeping while holding a spinlock leads to deadlock because the scheduler cannot run other tasks to release the lock. | System lock‑up; watchdog timeout; hard‑to‑debug crashes. |
| 4 | **Failing to call `cdev_add` after `cdev_init`**. | `cdev_init` only fills the `file_operations` pointer and links the `cdev` to the kernel object; `cdev_add` registers the device with the kobject hierarchy, creates the sysfs entry, and makes the devt visible to udev. Without it, the device node exists but no driver backs it. | Reads/writes return `-ENODEV`; the device appears “missing” even though the node is present. |
| 5 | **Misusing ioctl direction macros** (e.g., using `_IOW` for a read‑only command). | The direction bit determines whether the kernel attempts to copy data from or to user space. Using the wrong direction causes the kernel to ignore the user buffer or to copy garbage, leading to silent failures. | The driver never sees the intended argument; userspace thinks the ioctl succeeded but the device state is unchanged. |

## Exercises
### Easy – User‑space evdev reader
Write a program that:  
1. Opens `/dev/input/event0` (or the first event node found via `ls /dev/input/event*`).  
2. Sets the file descriptor to non‑blocking mode.  
3. Reads a single `struct input_event`.  
4. If `type == EV_KEY` and `value == 1`, prints the timestamp (`time.tv_sec.time.tv_usec`) and the symbolic key name (you may map `code` to a string using a static table or `libevdev`).  
5. Exits after printing one key press.  

*Goal:* Practice open/read, structure layout, and error handling.  

### Medium – Minimal character device module
Create a kernel module `simplechar.c` that:  
1. Allocates a dynamic major number with `alloc_chrdev_region`.  
2. Initializes a `struct cdev` with `cdev_init` and sets its `ops` to a structure providing:  
   - `open`: increments a per‑device open counter (use `atomic_t`).  
   - `release`: decrements the counter.  
   - `read`: returns the string `"Hello, chardev!\n"` (up to `count` bytes) using `simple_read_from_buffer`.  
   - `write`: discards data but returns `count` (pretend write succeeded).  
3. Registers the device with `cdev_add`.  
4. Creates a class and device via `device_create` so that udev automatically creates `/dev/simplechar`.  
5. Provides a clean `module_exit` that destroys the device, deletes the cdev, and unregisters the region.  

Test with:  
```bash
sudo insmod simplechar.ko
cat /
