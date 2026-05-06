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

## Core Concepts
### USB Architecture Layers
A USB system consists of three layers that map directly to Linux kernel subsystems:  

1. **Host Controller Hardware** – the silicon that generates and receives electrical signals on the bus (OHCI, UHCI, EHCI, xHCI).  
2. **USB Core (`drivers/usb/core`)** – implements the USB 2.0/3.0 protocol state machine, manages device address assignment, configuration, and provides the URB abstraction to drivers.  
3. **USB Device Drivers** – register with the USB core via `struct usb_driver` and receive callbacks when a matching device is present.  

The host controller exposes **endpoint descriptors** to the core; the core translates them into **endpoint data structures** (`struct usb_host_endpoint`) that hold the max‑packet size, interval, and transfer type. Drivers never program the controller directly; they fill URBs that the core hands to the appropriate host‑controller driver (HCD).

### Endpoint Descriptor and Transfer Types
Each endpoint is described by 7 bytes in the device’s configuration descriptor:

| Field | Size | Meaning |
|-------|------|---------|
| bLength | 1 | descriptor length (=7) |
| bDescriptorType | 1 | 0x05 (ENDPOINT) |
| bEndpointAddress | 1 | bit 3‑0 = endpoint number (0‑15), bit 7 = direction (0=OUT,1=IN) |
| bmAttributes | 1 | bits 1‑0 = transfer type (00=control,01=iso,10=bulk,11=interrupt) |
| wMaxPacketSize | 2 | maximum payload (bytes) per transaction |
| bInterval | 1 | polling interval (frames for iso/interrupt, ignored for bulk/control) |

**Why these fields matter**  
* The direction bit lets the host know whether to send an IN token (device→host) or OUT token (host→device).  
* `wMaxPacketSize` determines the maximum payload that can be moved without splitting; exceeding it forces the core to split the transfer into multiple USB transactions, each incurring token‑PID, CRC, and bit‑stuffing overhead.  
* For interrupt and iso endpoints, `bInterval` (in frames, 1 ms for FS/HS, 125 µs for HS microframes) defines the maximum latency the host guarantees; the core will not issue more than one transaction per interval.

### USB Transfer Mechanism (URB)
The **USB Request Block** (`struct usb_device *dev; unsigned int pipe; …`) is the sole vehicle for moving data. Its life‑cycle:

1. **Allocation** – `usb_alloc_urb(num_isoc_packets, GFP_KERNEL)` returns a zero‑filled URB; the core pre‑allocates a DMA‑safe buffer if `transfer_buffer` is NULL and `URB_NO_SETUP_DMA_MAPPING` is not set.  
2. **Filling** – helper macros (`usb_fill_control_urb`, `usb_fill_bulk_urb`, `usb_fill_int_urb`) set `pipe`, `transfer_buffer`, `transfer_buffer_length`, and attach a `complete` callback.  
3. **Submission** – `usb_submit_urb(urb, GFP_KERNEL)` hands the URB to the HCD; the core increments the URB’s reference count and, if needed, creates a DMA mapping (`usb_buffer_map`).  
4. **Completion** – when the transaction finishes (success, error, or timeout), the HCD calls the URB’s `complete` callback in **softirq context** (or tasklet for iso). The driver must not sleep or call blocking APIs here.  
5. **Reuse/Free** – after the callback returns, the driver may resubmit the same URB (common for streaming) or call `usb_free_urb(urb)`, which decrements the reference count and frees the DMA mapping.

**Why a separate struct is needed**  
The USB protocol is packet‑based and asynchronous; the host controller may defer a transaction for many microframes (e.g., NAK retry on bulk). A single struct that carries the data buffer, endpoint info, and completion pointer lets the core decouple the submission point from the actual hardware event, enabling zero‑copy DMA and proper synchronization with the kernel’s concurrency model.

### USB Class Drivers vs. Vendor‑Specific Drivers
The kernel matches a device to a driver using `struct usb_device_id`:

```c
struct usb_device_id {
    __u16 match_flags;   /* which fields are valid */
    __u16 idVendor;
    __u16 idProduct;
    /* … optional: bDeviceClass, bSubClass, bProtocol … */
};
```

* `match_flags` tells the core which fields to compare (e.g., `USB_DEVICE_ID_MATCH_VENDOR | USB_DEVICE_ID_MATCH_PRODUCT`).  
* If a driver only provides `idVendor`/`idProduct`, it is a **vendor‑specific** driver.  
* If it provides class/subclass/protocol fields, it is a **class driver** (e.g., `usb-storage` uses `USB_DEVICE_ID_MATCH_INT_CLASS` for mass‑storage class 0x08).  

The core walks the list of IDs in registration order; the first match wins. This allows a single driver to support many devices that share the same protocol (e.g., all HID keyboards) while still permitting a vendor to override with a more specific ID.

### Hotplug and Device Lifetime
When a device is attached, the hub driver calls `usb_new_device()`, which allocates a `struct usb_device` and increments its **reference count** (`kref_get`). The core then:

1. Sends a `GET_DESCRIPTOR(device, 0)` to read the first 8 bytes (to learn max packet size of endpoint 0).  
2. Assigns a unique address via `SET_ADDRESS`.  
3. Retrieves the full configuration descriptor (`GET_DESCRIPTOR(CONFIG)`).  
4. Selects a configuration (`SET_CONFIGURATION`).  

During this enumeration the device’s `dev->state` progresses through `USB_STATE_NOTATTACHED → USB_STATE_ATTACHED → USB_STATE_POWERED → USB_STATE_DEFAULT → USB_STATE_ADDRESS → USB_STATE_CONFIGURED`.  

When the device is removed, the hub driver calls `usb_disconnect(&udev)` which:

* Calls each bound driver’s `disconnect` callback.  
* Decrements the reference count (`usb_put_dev`).  
* Frees the `usb_device` when the count hits zero.  

Drivers must **never** hold a raw pointer to `struct usb_device` after `disconnect` returns; instead they should increase the count with `usb_get_dev(udev)` if they need to keep the device alive across asynchronous operations (e.g., a pending URB).

---

## How It Works
### Detection and Enumeration (First Principles)
The root hub’s status change interrupt notifies the host‑controller driver when a port’s **connect‑change** flag toggles. The HCD schedules a hub‑worker that:

1. **Resets** the port (`USB_PORT_FEAT_RESET`) for ≥10 ms (low‑speed/full‑speed) or ≥50 ms (high‑speed).  
2. **Reads** the port speed via `USB_PORT_STAT_SPEED` (encoded in the port status register).  
3. **Reports** a new device to the USB core via `hub_port_connect_change`.  

The core then begins the **control‑transfer enumeration** described above. Each standard request is a **control transaction** on endpoint 0, consisting of a SETUP packet (8 bytes), an optional DATA phase, and a STATUS packet. The host must wait for the ACK handshake before proceeding; this guarantees that the device has processed the request.

### Why Control Transfers Use a Separate Pipe
Endpoint 0 is mandatory and has a fixed max‑packet size (8, 16, 32, or 64 bytes depending on speed). Because all devices must accept standard requests before any other endpoint can be used, the core reserves pipe 0 (`usb_sndctrlpipe(dev,0)` / `usb_rcvctrlpipe(dev,0)`) exclusively for control. This simplifies the host‑controller scheduler: it can guarantee that a SETUP packet will never be pre‑empted by a bulk or interrupt transaction on the same pipe.

### Bulk Transfer Reliability
Bulk endpoints use **NAK handshakes** to flow‑control. If the device’s buffer is full, it returns NAK; the host retries after a short hardware‑defined delay (typically ≤ 1 ms). The core implements a **NAK limit** (`urb->transfer_flags & URB_NO_FSBR`) to avoid endless retries; exceeding the limit causes the URB to complete with `-ETIMEDOUT`.  

**Effective throughput calculation** (high‑speed bulk, 512 B max payload):

* Packet overhead: PID (8 b) + ADDR+ENDP (8 b) + CRC16 (16 b) = 32 b ≈ 4 B.  
* Bit‑stuffing worst‑case adds ≈ 6 % of the transmitted bits.  
* Gross bus time per packet = (payload + overhead) × 8 bits / 480 Mbps.  
* Net payload fraction:  

$$
\eta = \frac{512}{512 + 4} \times \frac{1}{1 + 0.06}
      \approx 0.962 \times 0.943 \approx 0.907
$$

Thus ~90.7 % of the raw 480 Mbps is usable payload → ≈ 435 Mbps. The same formula can be adapted for full‑speed (12 Mbps) or low‑speed (1.5 Mbps) by changing the bus speed and max‑packet size.

### Isochronous Timing Guarantees
Isochronous endpoints reserve a fixed number of microframes per period (`bInterval`). The host controller guarantees that a transaction will start within the allocated microframe, but **no error retry** is performed. If a packet is corrupted, the device receives bad data; the driver must implement higher‑level recovery (e.g., double buffering, checksums).  

The **frame length** is 1 ms for FS/HS, subdivided into 8 microframes of 125 µs for HS. An iso URB with `num_isoc_packets = 8` describes one transaction per microframe; the `offset` field in each packet descriptor tells the core where to place the payload in the transfer buffer.

### Concurrency Rules for URB Completion
The completion callback runs in **softirq** (or tasklet) context, which means:

* No sleeping (`msleep`, `wait_event`, `mutex_lock`).  
* No calling APIs that may acquire a spinlock held by the caller (risk of deadlock).  
* Safe to queue work (`schedule_work`) or complete a `completion` struct.  

Drivers that need context that can sleep must defer work to a workqueue (`INIT_WORK(&work, work_fn); schedule_work(&work)`).

---

## Worked Examples
### Example 1: Device Probe – Matching and Initialization
**Goal:** Print vendor/product info and claim the first bulk‑OUT endpoint.

```c
/* myusb.c */
#include <linux/module.h>
#include <linux/usb.h>

static struct usb_device_id myusb_id_table[] = {
    { USB_DEVICE(0x03eb, 0x6124) }, /* Atmel ATmega32U4 DFU */
    {} /* terminating entry */
};
MODULE_DEVICE_TABLE(usb, myusb_id_table);

static int myusb_probe(struct usb_interface *intf,
                       const struct usb_device_id *id)
{
    struct usb_device *udev = interface_to_usbdev(intf);
    struct usb_host_endpoint *ep_out;
    int retval;

    dev_info(&intf->dev,
             "Device %04x:%04x (vendor %04x, product %04x) attached\n",
             le16_to_cpu(id->idVendor),
             le16_to_cpu(id->idProduct),
             le16_to_cpu(udev->descriptor.idVendor),
             le16_to_cpu(udev->descriptor.idProduct));

    /* Find the first bulk‑OUT endpoint */
    ep_out = usb_find_endpoint(intf->cur_altsetting,
                               USB_ENDPOINT_NUM_MASK | USB_ENDPOINT_DIR_MASK,
                               USB_ENDPOINT_XFER_BULK | USB_ENDPOINT_OUT);
    if (!ep_out) {
        dev_err(&intf->dev, "No bulk‑OUT endpoint found\n");
        return -ENODEV;
    }

    /* Save endpoint address for later use */
    intf->dev.driver_data = (void *)(unsigned long)usb_endpoint_num(&ep_out->desc);
    return 0;
}

static void myusb_disconnect(struct usb_interface *intf)
{
    dev_info(&intf->dev, "Device removed\n");
}

static struct usb_driver myusb_driver = {
    .name          = "myusb",
    .id_table      = myusb_id_table,
    .probe         = myusb_probe,
    .disconnect    = myusb_disconnect,
};
module_usb_driver(myusb_driver);

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Student");
MODULE_DESCRIPTION("Simple USB bulk‑OUT probe driver");
```

**Step‑by‑step reasoning**

1. **ID table** – only matches vendor 0x03eb, product 0x6124; `USB_DEVICE` macro expands to a `struct usb_device_id` with `match_flags = USB_DEVICE_ID_MATCH_VENDOR | USB_DEVICE_ID_MATCH_PRODUCT`.  
2. In `probe`, `interface_to_usbdev(intf)` obtains the parent `usb_device`.  
3. `dev_info` prints the **descriptor** fields (little‑endian) using `le16_to_cpu`.  
4. `usb_find_endpoint` walks the endpoint array of the current alternate setting, applying a mask that selects only bits 3‑0 (endpoint number) and bit 7 (direction) and matching the transfer type and direction we want.  
5. If none is found we abort with `-ENODEV`; otherwise we store the endpoint number in the interface’s `driver_data` field for later use.  
6. `disconnect` merely logs removal; the core will automatically decrement the device’s reference count after we return.

### Example 2: Synchronous‑Like Bulk Transfer Using URBs
**Goal:** Transfer 1 KiB from host to device (OUT) and then read 1 KiB back (IN) using a pair of URBs. We demonstrate proper DMA mapping, error handling, and reuse.

```c
/* bulk_io.c – part of the same driver */
#include <linux/slab.h>
#include <linux/usb.h>

#define BUF_SIZE 1024

static int myusb_bulk_rw(struct usb_interface *intf,
                         unsigned char ep_out,
                         unsigned char ep_in)
{
    struct usb_device *udev = interface_to_usbdev(intf);
    struct urb *out_urb, *in_urb;
    void *out_buf, *in_buf;
    int rc, pipe_out, pipe_in;

    /* Allocate DMA‑safe buffers */
    out_buf = kmalloc(BUF_SIZE, GFP_KERNEL | GFP_DMA);
    in_buf  = kmalloc(BUF_SIZE, GFP_KERNEL | GFP_DMA);
    if (!out_buf || !in_buf) {
        rc = -ENOMEM;
        goto free_bufs;
    }

    /* Initialize OUT buffer with a known pattern */
    memset(out_buf, 0xA5, BUF_SIZE);
    memset(in_buf, 0x00, BUF_SIZE);

    /* Allocate URBs (no iso packets) */
    out_urb = usb_alloc_urb(0, GFP_KERNEL);
    in_urb  = usb_alloc_urb(0, GFP_KERNEL);
    if (!out_urb || !in_urb) {
        rc = -ENOMEM;
        goto free_urbs;
    }

    /* Build pipe descriptors */
    pipe_out = usb_sndbulkpipe(udev, ep_out);
    pipe_in  = usb_rcvbulkpipe(udev, ep_in);

    /* Fill OUT URB */
    usb_fill_bulk_urb(out_urb, udev, pipe_out,
                      out_buf, BUF_SIZE,
                      myusb_bulk_out_complete, NULL);
    out_urb->transfer_flags |= URB_NO_TRANSFER_DMA_MAP; /* we will map ourselves */

    /* Fill IN URB */
    usb_fill_bulk_urb(in_urb, udev, pipe_in,
                      in_buf, BUF_SIZE,
                      myusb_bulk_in_complete, NULL);
    in_urb->transfer_flags |= URB_NO_TRANSFER_DMA_MAP;

    /* Map buffers for DMA (required when URB_NO_TRANSFER_DMA_MAP set) */
    out_urb->transfer_dma = usb_buffer_map(udev, out_buf, BUF_SIZE,
                                           USB_DIR_OUT);
    if (out_urb->transfer_dma == DMA_ADDR_INVALID) {
        rc = -ENOMEM;
        goto unmap;
    }
    in_urb->transfer_dma = usb_buffer_map(udev, in_buf, BUF_SIZE,
                                          USB_DIR_IN);
    if (in_urb->transfer_dma == DMA_ADDR_INVALID) {
        rc = -ENOMEM;
        goto unmap_in;
    }

    /* Submit OUT first */
    rc = usb_submit_urb(out_urb, GFP_KERNEL);
    if (rc) {
        dev_err(&intf->dev, "OUT submit failed: %d\n", rc);
        goto unmap_in;
    }

    /* Wait for OUT completion (simple busy‑wait for demo) */
    wait_event_timeout(out_urb->complete ? : init_completion(&out_urb->complete),
                       out_urb->status != -EINPROGRESS,
                       msecs_to_jiffies(500));
    if (out_urb->status) {
        dev_err(&intf->dev, "OUT transfer error: %d\n", out_urb->status);
        usb_kill_urb(in_urb); /* cancel pending IN */
        goto unmap_in;
    }

    /* Submit IN */
    rc = usb_submit_urb(in_urb, GFP_KERNEL);
    if (rc) {
        dev_err(&intf->dev, "IN submit failed: %d\n", rc);
        goto unmap_in;
    }

    wait_event_timeout(in_urb->complete ? : init_completion(&in_urb->complete),
                       in_urb->status != -EINPROGRESS,
                       msecs_to_jiffies(500));
    if (in_urb->status) {
        dev_err(&intf->dev, "IN transfer error: %d\n", in_urb->status);
        goto unmap_in;
    }

    /* Verify round‑trip */
    if (memcmp(out_buf, in_buf, BUF_SIZE) != 0) {
        dev_err(&intf->dev, "Data mismatch!\n");
        rc = -EILSEQ;
    } else {
        dev_info(&intf->dev, "Bulk round‑trip OK\n");
    }

unmap_in:
    usb_buffer_unmap(udev, in_buf, BUF_SIZE, in_urb->transfer_dma);
unmap:
    usb_buffer_unmap(udev, out_buf, BUF_SIZE, out_urb->transfer_dma);
free_urbs:
    usb_free_urb(out_urb);
    usb_free_urb(in_urb);
free_bufs:
    kfree(out_buf);
    kfree(in_buf);
    return rc;
}

/* Completion callbacks – simply wake up the waiting thread */
static void myusb_bulk_out_complete(struct urb *urb)
{
    complete(&urb->complete);
}
static void myusb_bulk_in_complete(struct urb *urb)
{
    complete(&urb->complete);
}
```

**Why each step matters**

* **DMA‑safe allocation** (`GFP_DMA`) guarantees the buffer lives in memory accessible by the host controller’s DMA engine; otherwise the controller could write to an inaccessible physical address, causing silent data corruption.  
* Setting `URB_NO_TRANSFER_DMA_MAP` tells the core *not* to create a second DMA mapping; we provide our own via `usb_buffer_map`. This avoids double mapping overhead and lets us control the direction (`USB_DIR_OUT`/`_IN`).  
* The completion callbacks merely call `complete()` on a stack‑allocated `struct completion`; this is safe in softirq context because `complete()` only wakes a waiting task.  
* We use `wait_event_timeout` instead of `usb_bulk_msg` (which sleeps) to illustrate that the driver can block *only* after submitting the URB and waiting for its completion, a pattern used in many real drivers when a synchronous‑like API is needed.  
* Error paths unmap DMA buffers and kill any pending URB to prevent the controller from completing after we freed memory.

### Example 3: Interrupt Transfer – HID Keyboard Polling
**Goal:** Set up an interrupt IN endpoint to receive 8‑byte key reports every 10 ms (typical for low‑speed HID).

```c
/* hid_intr.c */
#include <linux/hid.h>
#include <linux/usb.h>

#define INT_EP_ADDR 0x81   /* ENDPOINT 1, IN */
#define INT_INTERVAL 10    /* ms */

static int hid_setup_intr(struct usb_interface *intf,
                          struct usb_device *udev)
{
    struct urb *urb;
    unsigned char *buf;
    int pipe, len, rc;

    len = 8; /* standard HID report size */
    buf = kmalloc(len, GFP_KERNEL);
    if (!buf)
        return -ENOMEM;

    urb = usb_alloc_urb(0, GFP_KERNEL);
    if (!urb) {
        kfree(buf);
        return -ENOMEM;
    }

    pipe = usb_rcvintpipe(udev, USB_ENDPOINT_NUM(INT_EP_ADDR));
    usb_fill_int_urb(urb, udev, pipe,
                     buf, len,
                     hid_intr_complete, NULL,
                     INT_INTERVAL);   /* interval in frames (ms for LS/FS) */

    urb->transfer_flags |= URB_NO_SETUP_DMA_MAPPING; /* no setup packet */
    rc = usb_submit_urb(urb, GFP_K
