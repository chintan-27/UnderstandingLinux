---
id: 125
title: "USB drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Without a unified bus abstraction, every peripheral would need a custom physical connector, a custom protocol, and a custom kernel driver negotiated at boot time. USB solves this by defining a single electrical and logical contract that lets the kernel discover, configure, and communicate with arbitrary devices at runtime — without a reboot, without pre-provisioned addresses, without vendor negotiation baked into firmware.

The consequences of getting this wrong are specific: if the host controller driver is absent, no USB device works because the CPU has no path to the bus. If you use a bulk endpoint where an interrupt endpoint belongs, your HID device will have unbounded latency — bulk transfers yield to other traffic, interrupt transfers get a guaranteed polling slot. If you mishandle isochronous bandwidth reservation, the kernel will refuse the URB submission entirely at `usb_submit_urb` time, not silently degrade. These are not theoretical edge cases; they are the failure modes you will debug.

---

## Core Concepts

### Host Controllers

The CPU never addresses USB devices directly. It writes to memory-mapped registers on the **host controller**, which owns the bus and serializes transactions onto the wire at the correct voltage levels and timing. Linux provides three HCI driver families:

| Driver | Standard | Speed |
|---|---|---|
| `uhci-hcd` | UHCI (Intel) | USB 1.1, 12 Mbps |
| `ohci-hcd` | OHCI (Compaq/others) | USB 1.1, 12 Mbps |
| `ehci-hcd` | EHCI | USB 2.0, 480 Mbps |
| `xhci-hcd` | xHCI | USB 3.x, 5/10/20 Gbps |

Above all of them sits `usbcore`, which provides a single API so device drivers never touch HCI-specific register layouts. The HCI driver handles frame scheduling, FIFO management, and DMA to host memory. `usbcore` handles enumeration, descriptor parsing, driver matching, and URB routing. A device driver calls `usb_submit_urb`; `usbcore` decides which HCI to hand it to.

### Endpoints

An endpoint is a **unidirectional** communication channel with a fixed address on the device. Every endpoint is identified by a 4-bit number (0–15) and a direction bit. The full address fits in one byte: `bEndpointAddress = (dir << 7) | number`. Endpoint 0 is the only exception — it is bidirectional and mandatory on every device, used exclusively for control transfers during enumeration.

The four transfer types are not stylistic choices — they encode different bus scheduling contracts:

| Type | Delivery | Timing | Retransmit | Bandwidth |
|---|---|---|---|---|
| Control | Guaranteed | None | Yes | Reserved per-setup |
| Bulk | Guaranteed | None | Yes | Best-effort |
| Interrupt | Guaranteed | Bounded polling interval | Yes | Reserved slot |
| Isochronous | Best-effort | Guaranteed interval | **No** | Reserved per-frame |

Isochronous endpoints reserve bandwidth at `SET_INTERFACE` time. A late audio sample is worse than a dropped one — a late sample causes a buffer underrun that corrupts timing for all subsequent samples. Dropping one sample produces a click; a late one desynchronizes the stream. The no-retransmit policy follows from that tradeoff, not from a desire to save bandwidth.

Bulk endpoints consume whatever bandwidth remains after scheduled transfers. This is why USB storage is fast when the bus is idle and slow when audio is streaming — the audio isochronous reservation takes priority.

### Transfers and Transactions

The kernel's unit of USB I/O is the **URB** (`struct urb`). One URB maps to one logical transfer. The HCI driver decomposes the transfer into **transactions**, each of which follows a three-phase protocol on the wire:

1. **Token packet** — host announces direction, device address, endpoint number
2. **Data packet** — payload in either direction
3. **Handshake packet** — device ACKs, NAKs, or STALLs

A NAK means the device is not ready (its buffer is full or empty). The HCI retries automatically. A STALL means a protocol error; the driver must issue a `CLEAR_FEATURE` control request to recover the endpoint before it can be used again.

### Classes

A USB class driver matches on `bDeviceClass`, `bInterfaceClass`, or both. The kernel ships with:

| Class | Driver module | Covers |
|---|---|---|
| HID (0x03) | `usbhid` | Keyboards, mice, gamepads |
| MSC (0x08) | `usb-storage` | Flash drives, external disks |
| CDC (0x02) | `cdc_ether`, `cdc_acm` | Network adapters, modems |
| UAC (0x01) | `snd-usb-audio` | Audio devices |

A device that does not implement a class announces `bDeviceClass = 0xFF` (vendor-specific) and must be matched by `idVendor`/`idProduct`. This is why plugging a generic USB keyboard into a machine with no network access works, but plugging in a USB-to-serial adapter for a proprietary industrial device requires a vendor driver.

### Hotplug and udev

When the USB core enumerates a new device, it calls `device_add` on the device's kobject, which emits a `uevent` over a netlink socket. `udevd` receives this event and evaluates rules in `/etc/udev/rules.d/` and `/lib/udev/rules.d/`. The rules can load firmware with `RUN+="firmware_loader"`, set permissions, create symlinks under `/dev/`, or start systemd services. The driver binding happens in the kernel; the `/dev` node creation and firmware loading happen in userspace via udev. These are separate concerns and fail independently.

---

## How It Works

### Enumeration

Enumeration is the sequence of control transfers that bootstraps a device from a bare electrical connection to a fully configured, driver-bound state. Each step is mandatory; skipping or reordering them puts the device into an undefined state.

1. The hub detects a voltage rise on D+ or D− (device attach). Full-speed devices pull D+ high; low-speed devices pull D− high. The hub reports this via its own interrupt endpoint.
2. `usbcore` issues a port reset (SE0 for ≥ 10 ms), placing the device in the **Default** state at address 0.
3. The host reads the first 8 bytes of the device descriptor via `GET_DESCRIPTOR(Device)` to endpoint 0, address 0. Those 8 bytes always include `bMaxPacketSize0`, which the host needs before it can read anything larger.
4. The host issues `SET_ADDRESS(n)`, where $n \in [1, 127]$. The device moves to the **Address** state. All subsequent transfers use address $n$.
5. The host reads the full device descriptor, then the configuration descriptor (which is a concatenation of the configuration, all interface, and all endpoint descriptors in a single transfer).
6. The host issues `SET_CONFIGURATION(1)` (almost always configuration 1). The device moves to the **Configured** state and its endpoints become active.
7. `usbcore` calls `usb_bus_add_device`, walks registered `usb_driver` entries, finds a match, and calls the driver's `probe` function.

The 7-bit address field constrains the bus:

$$N_{\text{max}} = 2^7 - 1 = 127 \text{ devices per bus}$$

Address 0 is reserved for the Default state. If you have more than 127 devices, you need a second host controller — a second bus.

### URBs

Every I/O operation is an asynchronous URB submission. The synchronous wrappers (`usb_bulk_msg`, `usb_control_msg`) are implemented on top of URBs with an internal completion that wakes a sleeping process; they are not a separate I/O path.

```c
/* Allocate a URB with 0 isochronous packets (bulk/interrupt/control) */
struct urb *urb = usb_alloc_urb(0, GFP_KERNEL);
if (!urb)
    return -ENOMEM;

/* Build an OUT bulk transfer to endpoint 2 */
usb_fill_bulk_urb(
    urb,
    udev,                              /* struct usb_device * */
    usb_sndbulkpipe(udev, 2),          /* pipe: bulk, ep 2, OUT */
    transfer_buffer,                   /* DMA-able kernel buffer */
    transfer_buffer_length,
    my_completion,                     /* called in interrupt context */
    context_ptr);                      /* passed to my_completion */

int ret = usb_submit_urb(urb, GFP_KERNEL);
if (ret)
    usb_free_urb(urb);
```

The pipe encoding (`usb_sndbulkpipe`) is a bitmask that encodes device address, endpoint number, direction, and transfer type into a single `unsigned int`. The macro `usb_sndbulkpipe(dev, ep)` expands to:

```c
((PIPE_BULK << 30) | (dev->devnum << 8) | (ep << 15) | USB_DIR_OUT)
```

The completion callback runs in **interrupt context** — no sleeping, no mutexes, no memory allocation with `GFP_KERNEL`. Use `GFP_ATOMIC` if you must allocate, or defer work to a tasklet/workqueue:

```c
static void my_completion(struct urb *urb)
{
    if (urb->status == 0) {
        /* Success: urb->actual_length bytes transferred */
    } else if (urb->status == -ENOENT || urb->status == -ECONNRESET) {
        /* URB was cancelled by usb_kill_urb / usb_unlink_urb */
    } else if (urb->status == -EPIPE) {
        /* Endpoint STALLED — must CLEAR_FEATURE before reuse */
        usb_clear_halt(urb->dev, urb->pipe);
    }
    usb_free_urb(
