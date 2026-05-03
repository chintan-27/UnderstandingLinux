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

## Why This Matters

Every keypress must travel from a hardware interrupt to a userspace file descriptor through a path that is completely device-agnostic. The mechanism that makes this possible is a strict separation of concerns: the code that understands a PS/2 scancode sequence has no knowledge of what `evdev` or X11 will do with it, and `evdev` has no knowledge of PS/2. Without this split, every new input device would require changes in every application that handles input — a combinatorial problem that scales as $O(D \times A)$ where $D$ is the number of device types and $A$ is the number of applications. The input subsystem reduces this to $O(D + A)$ by inserting a single, stable abstraction layer between them.

The cost of getting this wrong is visible in pre-subsystem history: X11's xf86-input drivers were essentially per-device application-layer shims because no kernel abstraction existed. The input subsystem, introduced in 2.4, moved that complexity into the kernel where it belongs.

## Core Concepts

### The Two-Layer Split

The input subsystem enforces a clean separation:

- **Input drivers** own hardware protocol knowledge. A PS/2 driver (`drivers/input/keyboard/atkbd.c`) decodes scancodes from the 8042 controller. A USB HID driver parses HID report descriptors. Neither knows what happens to the events it produces.
- **Input handlers** own event consumption policy. `evdev` buffers events and exposes them via file descriptors. `kbd` translates keycodes to UTF-8 for the VT console. `mousedev` synthesizes a legacy `/dev/input/mouseX` interface for programs that still use it.

The connection between a driver and handler is established at **registration time**, not at open time. When a driver calls `input_register_device()`, the kernel immediately evaluates every registered handler against the new device's declared capabilities. If they match, the handler's `connect()` is called. This means a handler that was registered before the device existed will still connect correctly — and it means device capability declarations are binding, not advisory.

### Event Types and Codes

Every input event is a triple $(t, c, v)$: a *type*, a *code*, and a *value*. Types are broad categories:

| Type | Meaning |
|------|---------|
| `EV_KEY` | Key or button state: press, release, repeat |
| `EV_REL` | Relative axis displacement (signed delta) |
| `EV_ABS` | Absolute axis position (raw coordinate) |
| `EV_MSC` | Miscellaneous: raw scancodes, LED states |
| `EV_SYN` | Synchronization boundary |

The code refines the type. For `EV_KEY`, the code is a key identifier like `KEY_A` (30) or `BTN_LEFT` (272). For `EV_REL`, it is an axis like `REL_X` (0) or `REL_WHEEL` (8). The value encodes state: for `EV_KEY`, 0 = release, 1 = press, 2 = autorepeat; for `EV_REL`, a signed displacement; for `EV_ABS`, a raw integer coordinate.

The triple is sufficient to represent every input event from every device class in a hardware-independent form. Everything else in the subsystem is bookkeeping around this fact.

`EV_SYN / SYN_REPORT` events deserve special attention: they are not optional punctuation. They tell the consumer that all events before this point belong to the same logical moment. A mouse motion generates `EV_REL/REL_X` and `EV_REL/REL_Y` as separate events, but they are causally linked — both came from one hardware report. The `EV_SYN` after them lets userspace treat them atomically. A program that processes events without waiting for `EV_SYN` will see motion on one axis at a time and compute incorrect deltas.

### The `input_dev` Structure

A driver's sole obligation to the input core is to allocate, populate, and register an `input_dev`. The structure's capability bitmaps are what the matching logic reads:

```c
struct input_dev {
    const char *name;          /* human-readable, appears in /proc/bus/input/devices */
    const char *phys;          /* stable physical path, e.g. "usb-0000:00:14.0-1/input0" */
    const char *uniq;          /* serial number if available */

    unsigned long evbit[BITS_TO_LONGS(EV_CNT)];    /* which event types */
    unsigned long keybit[BITS_TO_LONGS(KEY_CNT)];  /* which key codes */
    unsigned long relbit[BITS_TO_LONGS(REL_CNT)];  /* which relative axes */
    unsigned long absbit[BITS_TO_LONGS(ABS_CNT)];  /* which absolute axes */
    unsigned long mscbit[BITS_TO_LONGS(MSC_CNT)];
    unsigned long ledbit[BITS_TO_LONGS(LED_CNT)];
    unsigned long sndbit[BITS_TO_LONGS(SND_CNT)];

    struct input_absinfo *absinfo;  /* min/max/fuzz/flat/res per ABS axis */

    int  (*open)(struct input_dev *dev);   /* called when first handler connects */
    void (*close)(struct input_dev *dev);  /* called when last handler disconnects */
    int  (*event)(struct input_dev *dev, unsigned int type,
                  unsigned int code, int value); /* for output events (LEDs, force-feedback) */

    /* ... */
};
```

Each `*bit` field is a bitmap. Setting bit $n$ in `evbit` declares that this device produces event type $n$. Setting bit $k$ in `keybit` declares that it produces `EV_KEY` events with code $k$.

The array length for each bitmap is:

$$\text{len} = \left\lceil \frac{N}{\text{BITS\_PER\_LONG}} \right\rceil$$

On a 64-bit system, `BITS_PER_LONG = 64`. With `KEY_CNT = 768`:

$$\text{len(keybit)} = \left\lceil \frac{768}{64} \right\rceil = 12 \text{ unsigned longs} = 96 \text{ bytes}$$

With `EV_CNT = 32` (there are fewer event types than keys):

$$\text{len(evbit)} = \left\lceil \frac{32}{64} \right\rceil = 1 \text{ unsigned long} = 8 \text{ bytes}$$

This is why `set_bit(EV_KEY, mydev->evbit)` and `set_bit(KEY_A, mydev->keybit)` are separate calls — they address separate bitmaps. Forgetting to set `EV_KEY` in `evbit` while setting `KEY_A` in `keybit` produces a device that declares it can emit specific keys but never declared it emits key events at all. Handlers that check `evbit` first will not connect.

### `evdev`: The Universal Handler

`evdev` (`drivers/input/evdev.c`) matches every device and exposes each as `/dev/input/eventN`. It is the handler that Xorg, Wayland compositors, SDL, and virtually all modern userspace use. The others (`mousedev`, `joydev`) exist for legacy compatibility.

Reading from an `evdev` file descriptor yields a stream of:

```c
struct input_event {
    struct timeval time;  /* kernel timestamp at event generation */
    __u16 type;
    __u16 code;
    __s32 value;
};
```

The struct is 24 bytes on 64-bit (`struct timeval` is 16 bytes: two 64-bit fields). On 32-bit kernels it is 16 bytes. This mismatch is a real portability issue — 32-bit userspace running on a 64-bit kernel via `compat` mode uses a different struct layout, which is why `libevdev` exists: it handles this transparently. Writing `read(fd, &ev, sizeof(ev))` directly in a cross-architecture program is a latent bug.

Querying device capabilities without opening the event stream uses ioctls:

```c
/* Get the evbit bitmap */
unsigned long evbits[BITS_TO_LONGS(EV_CNT)];
ioctl(fd, EVIOCGBIT(0, sizeof(evbits)), evbits);

/* Get key state (which keys are currently pressed) */
unsigned long keystates[BITS_TO_LONGS(KEY_CNT)];
ioctl(fd, EVIOCGKEY(sizeof(keystates)), keystates);

/* Get axis info for ABS_X */
struct input_absinfo absinfo;
ioctl(fd, EVIOCGABS(ABS_X), &absinfo);
```

## How It Works

### Driver Registration Walk-Through

A minimal keyboard driver that reports a single key:

```c
static struct input_dev *mykey_dev;

static int __init mykey_init(void)
{
    int err;

    mykey_dev = input_allocate_device();
    if (!mykey_dev)
        return -ENOMEM;

    mykey_dev->name = "My Keyboard";
    mykey_dev->phys = "isa0060/serio0/input0";
    mykey_dev->id.bustype = BUS_ISA;
    mykey_dev->id.vendor  = 0x0001;
    mykey_dev->id.product = 0x0001;
    mykey_dev->id.version = 0x0100;

    /* Must set the type bit before the code bits, or matching breaks */
    set_bit(EV_KEY, mykey_dev->evbit);
    set_bit(KEY_A,  mykey_dev->keybit);

    err = input_register_device(mykey_dev);
    if (err) {
        input_free_device(mykey_dev);
        return err;
    }
    return
