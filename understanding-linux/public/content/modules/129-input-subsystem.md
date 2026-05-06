---
id: 129
title: "Input subsystem"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Input Subsystem Architecture
The Linux input subsystem is not a monolithic driver but a layered framework that decouples **hardware detection**, **event generation**, and **event consumption**.  
- **Device layer**: Low‑level bus drivers (USB, HID, I²C, platform) probe hardware and allocate an `struct input_dev`.  
- **Core layer**: `input_register_device()` registers the device with the input core, which assigns a minor number, creates `/dev/input/eventX`, and publishes sysfs attributes under `/sys/class/input/inputX/`.  
- **Handler layer**: Generic handlers (evdev, keyboard, mouse, joystick, tablet) bind to devices via `input_register_handler()`. Each handler receives events through its `event()` callback.  
- **Client layer**: User‑space programs open `/dev/input/eventX` (or use libevdev) and read `struct input_event` packets.

### Event Flow (First‑Principles View)
1. **Hardware interrupt** → bus driver’s ISR fills an `input_event` (timestamp, type, code, value).  
2. Driver calls an input‑core helper (`input_event()`, `input_report_key()`, `input_report_rel()`, …).  
3. Input core **validates** the event against the device’s capability bitmaps (`evbit`, `keybit`, …) and **injects** it into the handler’s wait queue.  
4. Handler’s `event()` callback runs in process context (often a kernel thread) and may:  
   - Transform the raw event (e.g., apply acceleration).  
   - Forward it to another handler (evdev → uinput).  
   - Update internal state (LED, repeat).  
5. Handler may invoke `input_event()` on a *virtual* device (e.g., uinput) to synthesize events for other consumers.  

The **causal chain** is therefore:  
`hardware → bus driver → input core → handler → client`.

### Capability Bitmaps
Each `input_dev` contains six bitmap arrays (each `BITS_TO_LONGS(EVENT_TYPE_MAX)` bits):
- `evbit` – which event *types* the device can generate (`EV_KEY`, `EV_REL`, …).  
- `keybit`, `relbit`, `absbit`, `mscbit`, `ledbit`, `sndbit` – which *codes* within a type are supported.  
Setting a bit tells the input core to allocate space for that event class and to reject unsupported events early (preventing bogus values from reaching handlers).

### Hotplugging via the Driver Model
When a USB HID device is plugged:
1. `usbcore` calls the HID driver’s `probe()`.  
2. HID driver allocates `input_dev`, fills capability bitmaps, registers it.  
3. `input_register_device()` triggers a **uevent** (`INPUT_DEVICE_ADD`) that udev receives, creating persistent symlinks (`/dev/input/by-id/…`, `/dev/input/by-path/…`).  
4. On removal, the driver’s `disconnect()` calls `input_unregister_device()`, which sends `INPUT_DEVICE_REMOVE` and tears down the character device and sysfs entries.

### Why the Subsystem Exists (Design Rationale)
- **Standardization**: All input devices present the same `input_event` ABI, so a single evdev handler can serve keyboards, touchscreens, and gamepads.  
- **Decoupling**: Bus drivers need not know about policies (key repeat, acceleration, multi‑touch); those live in handlers.  
- **Hotplug safety**: The input core holds a reference to `struct input_dev`; handlers get a `struct input_handle` that remains valid even if the underlying device disappears (they receive a `EVIOCGRAB`‑style disconnect event).  
- **Security**: Access to `/dev/input/event*` is governed by file‑system permissions and udev rules, preventing unprivileged clients from sniffing keystrokes unless explicitly allowed.

---

## How It Works
### Device Registration – Step‑by‑Step
```c
/* 1. Allocate device structure */
struct input_dev *dev = input_allocate_device();
if (!dev)
    return -ENOMEM;

/* 2. Set basic info */
dev->name = "Example Keyboard";
dev->phys = "example/keyboard0";
dev->id.bustype = BUS_USB;
dev->id.vendor  = 0x1234;
dev->id.product = 0xabcd;
dev->id.version = 0x0100;

/* 3. Define capabilities */
__set_bit(EV_KEY, dev->evbit);
__set_bit(KEY_A,  dev->keybit);
__set_bit(KEY_B,  dev->keybit);
/* … add more keys as needed */

/* 4. Register with core */
int ret = input_register_device(dev);
if (ret) {
    input_free_device(dev);
    return ret;
}
/* dev is now visible under /sys/class/input/inputX and /dev/input/eventX */
```
**Key points**  
- `input_allocate_device()` zeroes the structure and increments a global `input_dev_count`.  
- `__set_bit()` manipulates the bitmap in `dev->evbit` etc.; the core checks these before queuing events.  
- `input_register_device()` performs:  
  1. `minor = input_allocate_minor()` → creates char device with major `INPUT_MAJOR (13)`.  
  2. `device_add()` → registers with driver model, creates sysfs dir.  
  3. Calls `input_handler_connect()` for all existing handlers that match the device’s capabilities (via `input_match_device()`).  

### Event Reporting – Core Helpers
| Helper | Typical Use | Underlying Action |
|--------|-------------|-------------------|
| `input_event(dev, type, code, value)` | Generic event (e.g., MSC_SCAN) | `dev->event(dev, type, code, value)` → handler callback |
| `input_report_key(dev, code, value)` | Key press/release (`EV_KEY`) | Calls `input_event(dev, EV_KEY, code, value?1:0)` |
| `input_report_rel(dev, axis, value)` | Relative motion (`EV_REL`) | Calls `input_event(dev, EV_REL, axis, value)` |
| `input_report_abs(dev, axis, value)` | Absolute position (`EV_ABS`) | Calls `input_event(dev, EV_ABS, axis, value)` |
| `input_sync(dev)` | Marks end of a **event set** | Guarantees handlers see a consistent state; internally calls `input_event(dev, EV_SYN, SYN_REPORT, 0)` |

**Why `input_sync()` is mandatory**  
Handlers often accumulate multiple sub‑events (e.g., `REL_X`, `REL_Y`, `BTN_LEFT`) before acting. Without a `SYN_REPORT`, a handler could process a partial set, leading to jerky cursor motion or missed button states. The sync event tells the handler: “all preceding values belong to the same logical instant.”

### Timing and Timestamp Generation
```c
struct input_event {
    struct timeval time;   /* seconds, microseconds */
    __u16          type;
    __u16          code;
    __s32          value;
};
```
- The input core fills `time` with `ktime_get_boottime()` → converted to `timespec64` then `timeval`.  
- Resolution is **1 µs** (limited by `getnstimeofday()`).  
- **Event rate calculation**: If a mouse reports at 125 Hz, the inter‑event interval is  
  $$\Delta t = \frac{1}{125\text{ Hz}} = 8\text{ ms}$$  
  To debounce a noisy switch with a 2 ms window, the driver must ignore any `EV_KEY` transition occurring less than 2 ms after the previous stable state:
  ```c
  static ktime_t last_change;
  if (ktime_to_ms(ktime_sub(ktime_get(), last_change)) < 2)
      return;   /* discard bounce */
  last_change = ktime_get();
  ```

### Memory Layout Math
On a 64‑bit kernel:
- `struct timeval` = `__kernel_long_t tv_sec` (8 bytes) + `__kernel_suseconds_t tv_usec` (8 bytes) → 16 bytes (packed, no padding because both members are 8‑byte aligned).  
- `type` (2 bytes) + `code` (2 bytes) + `value` (4 bytes) = 8 bytes.  
- Total size = **24 bytes** (the kernel adds 8 bytes of padding after `value` to align the structure to an 8‑byte boundary for array allocation).  
Thus an array of 100 events occupies 2400 bytes, easily fitting in a single page.

### Handler Registration Example (evdev)
```c
static int evdev_connect(struct input_handler *handler,
                         struct input_dev *dev,
                         const struct input_device_id *id)
{
    struct evdev *evdev;
    int err;

    evdev = kzalloc(sizeof(*evdev), GFP_KERNEL);
    if (!evdev)
        return -ENOMEM;

    evdev->dev = input_get_device(dev);
    evdev->handle.dev = dev;
    evdev->handle.name = "evdev";
    evdev->handle.handler = handler;
    evdev->handle private = evdev;

    err = input_register_handle(&evdev->handle);
    if (err)
        goto err_free;

    /* Create /dev/input/eventX */
    evdev->dev = input_allocate_device();
    /* set evdev-specific capabilities … */
    err = input_register_device(evdev->dev);
    if (err)
        goto err_unreg_handle;

    return 0;
/* error handling omitted for brevity */
}
```
The handler’s `event()` callback simply copies the incoming `input_event` to its own virtual device’s queue, allowing any user‑space client to read it via `/dev/input/event*`.

---

## Worked Examples
### Example 1: Minimal USB Keyboard Driver (Step‑by‑Step)
**Goal**: Register a device that reports only `KEY_A` and `KEY_B`.  
**Assumptions**: USB HID driver already provides `usb_int->dev` and an interrupt endpoint delivering 8‑byte reports where bit 0 = KEY_A, bit 1 = KEY_B.

```c
/*--- probe() -----------------------------------------------------------*/
static int kb_probe(struct usb_interface *intf,
                    const struct usb_device_id *id)
{
    struct usb_device *udev = interface_to_usbdev(intf);
    struct input_dev *input;
    int err;

    input = input_allocate_device();
    if (!input)
        return -ENOMEM;

    input->name = "USB Mini Keyboard";
    input->phys = "usb-*/input0";
    usb_to_input_id(udev, &input->id);

    /* Capabilities */
    __set_bit(EV_KEY, input->evbit);
    __set_bit(KEY_A,  input->keybit);
    __set_bit(KEY_B,  input->keybit);

    /* Register */
    err = input_register_device(input);
    if (err) {
        input_free_device(input);
        return err;
    }
    usb_set_intfdata(intf, input);
    return 0;
}

/*--- interrupt callback ------------------------------------------------*/
static void kb_irq(struct urb *urb)
{
    struct usb_interface *intf = urb->context;
    struct input_dev *input = usb_get_intfdata(intf);
    unsigned char *data = urb->transfer_buffer;
    bool a, b;

    a = data[0] & 0x01;
    b = data[0] & 0x02;

    /* Report changes only – prevents flooding */
    static bool last_a, last_b;
    if (a != last_a)
        input_report_key(input, KEY_A, a);
    if (b != last_b)
        input_report_key(input, KEY_B, b);
    last_a = a;
    last_b = b;

    input_sync(input);   /* end of this event set */
    usb_submit_urb(urb, GFP_ATOMIC);
}

/*--- disconnect --------------------------------------------------------*/
static void kb_disconnect(struct usb_interface *intf)
{
    struct input_dev *input = usb_get_intfdata(intf);
    usb_set_intfdata(intf, NULL);
    input_unregister_device(input);
}
```
**Why each step matters**  
- Setting only the needed bits in `keybit` prevents the core from accepting spurious codes (e.g., `KEY_C`) that the hardware never sends.  
- Reporting only on change (`if (a != last_a)`) reduces bus traffic and avoids generating duplicate key events that would confuse the keyboard handler’s autorepeat logic.  
- `input_sync()` guarantees that the two key events (if both changed) are seen as a simultaneous set; without it, the handler could process `KEY_A` then `KEY_B` as two separate instants, breaking chorded‑key semantics.  

### Example 2: Relative Mouse with Basic Acceleration
**Goal**: Convert raw `REL_X/Y` from a device reporting at 100 Hz into accelerated cursor motion for the evdev handler.

```c
static void mouse_report(struct input_dev *dev,
                         int dx, int dy, bool left, bool right)
{
    static const int threshold = 10;   /* pixels */
    static const float accel = 1.5f;   /* factor above threshold */

    /* Apply simple piecewise‑linear acceleration */
    if (abs(dx) > threshold)
        dx = threshold + (dx - threshold) * accel;
    if (abs(dy) > threshold)
        dy = threshold + (dy - threshold) * accel;

    input_report_rel(dev, REL_X, dx);
    input_report_rel(dev, REL_Y, dy);
    input_report_key(dev, BTN_LEFT,  left);
    input_report_key(dev, BTN_RIGHT, right);
    input_sync(dev);
}
```
**Derivation of acceleration formula**  
For small movements (`|dx| ≤ threshold`) we keep 1:1 mapping (preserves precision).  
For larger movements we add a linear gain:  
$$\text{output} = \text{threshold} + (\text{input} - \text{threshold}) \times \alpha$$  
where $\alpha = 1.5$. This yields a smooth curve without a discontinuity at the threshold because both sides evaluate to `threshold` when `input = threshold`.

**Usage in driver’s interrupt**  
```c
static void mouse_irq(struct urb *urb)
{
    struct usb_interface *intf = urb->context;
    struct input_dev *dev = usb_get_intfdata(intf);
    unsigned char *buf = urb->transfer_buffer;
    /* Assuming 3‑byte Microsoft mouse protocol: button, dx, dy */
    bool left  = buf[0] & 0x01;
    bool right = buf[0] & 0x02;
    signed char dx = (signed char)buf[1];
    signed char dy = (signed char)buf[2];

    mouse_report(dev, dx, dy, left, right);
    usb_submit_urb(urb, GFP_ATOMIC);
}
```

### Example 3: Multi‑Touch Slot Handling (Advanced)
**Goal**: Support a touchscreen that reports contact slots via ABS_MT_* axes.

```c
static int mt_probe(struct platform_device *pdev)
{
    struct input_dev *input = input_allocate_device();
    if (!input)
        return -ENOMEM;

    input->name = "Example MT Touchscreen";
    input->phys = "mt-touchscreen0";

    /* Tell core we will use MT protocol B */
    __set_bit(EV_ABS, input->evbit);
    __set_bit(ABS_X,    input->absbit);
    __set_bit(ABS_Y,    input->absbit);
    __set_bit(ABS_MT_TRACKING_ID, input->absbit);
    __set_bit(ABS_MT_POSITION_X, input->absbit);
    __set_bit(ABS_MT_POSITION_Y, input->absbit);
    __set_bit(ABS_MT_TOUCH_MAJOR, input->absbit);
    __set_bit(ABS_MT_TOUCH_MINOR, input->absbit);

    /* Initialize MT slots – we expect up to 10 contacts */
    input_mt_init_slots(input, 10, INPUT_MT_DIRECT);
    /* Optional: set resolution if known */
    input_set_abs_params(input, ABS_X, 0, 800, 0, 0);
    input_set_abs_params(input, ABS_Y, 0, 480, 0, 0);
    input_set_abs_params(input, ABS_MT_TRACKING_ID, 0, 0xFFFF, 0, 0);
    input_set_abs_params(input, ABS_MT_POSITION_X, 0, 800, 0, 0);
    input_set_abs_params(input, ABS_MT_POSITION_Y, 0, 480, 0, 0);
    /* Pressure/major/minor ranges … */

    return input_register_device(input);
}

/* In the ISR, for each contact i: */
static void mt_report_contact(struct input_dev *dev,
                              int slot, int tracking_id,
                              int x, int y, int major, int minor)
{
    input_mt_slot(dev, slot);
    input_mt_report_slot_state(dev, MT_TOOL_FINGER, tracking_id >= 0);
    if (tracking_id >= 0) {
        input_report_abs(dev, ABS_MT_TRACKING_ID, tracking_id);
        input_report_abs(dev, ABS_MT_POSITION_X, x);
        input_report_abs(dev, ABS_MT_POSITION_Y, y);
        input_report_abs(dev, ABS_MT_TOUCH_MAJOR, major);
        input_report_abs(dev, ABS_MT_TOUCH_MINOR, minor);
    }
    /* after processing all slots */
    input_mt_sync(dev);
    input_sync(dev);
}
```
**Why `input_mt_*` helpers are required**  
The MT protocol expects the core to see a **slot‑synchronised** stream: each slot’s ABS_MT_* values must be grouped, followed by an `INPUT_MT_SYNC` (implemented by `input_mt_sync()`). Without this, the evdev handler would interleave values from different contacts, producing impossible coordinate jumps.

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Breaks |
|---|---------|--------------|---------------|
| 1 | **Omitting `input_sync()` after a batch of events** | Handler receives a partial set (e.g., only `REL_X` but not `REL_Y`). | Cursor jumps on one axis only; evdev may drop the unsynced packet, causing lost motion. |
| 2 | **Setting a capability bit but never reporting that event type** | Driver declares `EV_REL` and `REL_X` but only ever calls `input_report_key()`. | The input core will still accept the device, but handlers expecting relative motion (e.g., mouse) will never move the pointer; users report a “dead” mouse. |
| 3 | **Failing to release `input_dev` on disconnect** | `input_unregister_device()` omitted in `.disconnect()`. | The device struct stays registered; subsequent hotplug attempts fail with `-EBUSY` because the minor number is still in use. Leads to “input: unable to register device” kernel messages. |
| 4 | **Using `input_event()` directly for key events without checking `keybit`** | Driver calls `input_event(dev, EV_KEY, KEY_Z, 1)` but never set `KEY_Z` in `keybit`. | Core validates the event; if the bit is missing, it discards the event silently (or prints `input: unknown key event`). The driver wonders why keys don’t appear. |
| 5 | **Not handling `INPUT_MT_SYNC` in MT drivers** | Calls `input_report_abs()` for each slot but omits `input_mt_sync()`. | Evdev receives interleaved ABS_MT_* values from different slots, corrupting tracking ID assignment; multitouch gestures become jittery or are interpreted as single‑touch with wild jumps. |
| 6 | **Assuming `struct timeval` microsecond resolution equals jitter‑free timing** | Driver uses `event->time.tv_usec` for debounce without converting to monotonic time. | If the system clock is adjusted (NTP step), timestamps can jump backward, causing false debounce triggers or missed events. Proper debounce uses `ktime_get()` and compares monotonic intervals. |
| 7 | **Registering a device with `input_allocate_device()` but never setting `name` or `phys`** | Leaves those fields `NULL`. | Sysfs shows empty strings; udev rules that rely on `ENV{ID_INPUT_NAME}` fail to match, resulting in missing `/dev/input/by-*` symlinks. Users see the device in `lsinput` but no convenient symlinks. |

---

## Exercises
### Easy
1. **Single‑key poller** – Write a platform driver that allocates an `input_dev`, sets only `EV_KEY`/`KEY_A`, and toggles the key state every 500 ms using a timer. Verify with `evtest /dev/input/event*` that you see a repeating key press/release.  
2. **lsinfo wrapper** – Create a Bash script that parses `/sys/class/input/input*/device/name` and prints a table matching the output of `lsinput`.  

### Medium
3. **Mouse with acceleration** – Implement a USB mouse driver (as in Worked Example 2) that applies a piecewise‑linear acceleration curve. Tune the threshold and factor until cursor motion feels subjectively linear on your test hardware. Use `xinput --list-props "Device Name"` to verify the reported acceleration property (if using Xorg) or `libinput debug-events` for Wayland.  
4. **Hot‑plug detection** – Add a `udev` rule that symlinks `/dev/input/my-keyboard` to the appropriate `/dev/input/eventX` when a device with a specific `idVendor`/`idProduct` appears. Test by unplugging/replugging the device and checking the symlink target.  

### Hard
5. **Multi‑touch slot manager** – Write a driver for a touchscreen that provides raw contact points (x, y, pressure) via an IIO buffer. Convert each buffer packet into MT slots using `input_mt_init_slots()`, `input_mt_report_slot_state()`, and `input_m
