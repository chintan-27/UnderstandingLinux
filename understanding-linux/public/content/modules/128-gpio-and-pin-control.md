---
id: 128
title: "GPIO and pin control"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### GPIO as a Programmable Interface
A General Purpose Input/Output (GPIO) pin is a physical line on an IC whose electrical function is not fixed in silicon. The pin’s behavior is controlled by software‑accessible registers that determine:
* **Direction** – whether the pin drives an output or senses an input.
* **Output value** – the logic level driven when configured as output.
* **Input value** – the logic level sensed when configured as input.
* **Alternate function** – through pin multiplexing, the same pin can be routed to internal peripherals (UART, SPI, PWM, etc.).

The need for programmability arises from **pin count constraints**. Adding a dedicated pin for every possible function would increase die size, cost, and power. By sharing pins, designers trade silicon area for runtime configurability. The kernel therefore provides an abstraction layer that hides the register‑level details while preserving the ability to change direction, value, or routing at any time.

### Pin Multiplexing (Pinmux)
Pin multiplexing routes a silicon pin to one of several internal signal lines via a **pin‑mux controller**. The controller typically contains a set of multiplexers whose select lines are controlled by registers in the **pinctrl** subsystem.  

*Why it matters*: Enabling a peripheral (e.g., UART) consumes the pin; disabling it frees the pin for GPIO use. The selection is usually performed at boot via the device tree, but can also be changed at runtime if the hardware supports dynamic reconfiguration.

Mathematically, if a pin has *n* possible functions, the multiplexer requires ⌈log₂ n⌉ select bits. For a typical pin with 4 functions (GPIO, UART_TX, SPI_MISO, PWM0) we need 2 bits:  
$$ \text{select} = b_1b_2 \in \{00,01,10,11\} $$

### Interrupts from GPIO
An interrupt is a mechanism that lets the CPU react to an asynchronous event without polling. When a GPIO pin experiences a transition (edge) or holds a level that meets a configured condition, the pin‑mux controller can assert a line to the interrupt controller (e.g., GIC, APIC).  

*Why interrupts are essential*: Polling consumes CPU cycles and introduces latency proportional to the poll interval. An interrupt reduces latency to the hardware‑propagation delay plus the interrupt‑handling overhead, which is often < 10 µs on modern SoCs.

The kernel represents a GPIO‑triggered interrupt as an **IRQ number** obtained via `gpiod_to_irq()` (legacy: `gpio_to_irq()`). The interrupt handler runs in interrupt context, so it must be short; lengthy work is deferred to a workqueue or tasklet.

---

## How It Works
### Kernel GPIO Subsystem (gpiolib)
Linux abstracts GPIO handling through **gpiolib**. Each GPIO controller is represented by a `struct gpio_chip`, which provides operations for getting, setting, direction, and IRQ translation. User‑space and drivers interact with a `struct gpio_desc*` obtained via `gpiod_get()` (or the legacy `gpio_request()`).

#### Requesting a GPIO
```c
#include <linux/gpio/consumer.h>

struct gpio_desc *desc;

/* Acquire the GPIO named "my_gpio" from device tree or board file */
desc = gpiod_get(&pdev->dev, "my_gpio", GPIOD_ASIS);
if (IS_ERR(desc))
    return PTR_ERR(desc);
```
*`gpiod_get()` performs:*
1. Lookup of the GPIO chip and offset from the device tree.
2. Increment of the module’s reference count.
3. Optional automatic configuration (direction, pull‑up/down) if flags are provided.

#### Setting Direction
Direction is changed by writing to the controller’s **direction register**. For a memory‑mapped GPIO bank, the register layout might be:
| Offset | Register | Meaning |
|--------|----------|---------|
| 0x00   | GPFSEL0  | Function select (bits per pin) |
| 0x04   | GPFSEL1  | … |
| 0x1C   | GPSET0   | Set output high (write‑1) |
| 0x28   | GPCLR0   | Set output low (write‑1) |
| 0x34   | GPLEV0   | Input level (read‑only) |

Setting a pin as output typically involves clearing the corresponding function‑select bits and then writing to the **direction** register (if separate) or relying on the fact that writing to GPSET/GPCLR only affects pins configured as output.

```c
/* Set as output */
gpiod_direction_output(desc, 0);   /* initial low */

/* Set as input */
gpiod_direction_input(desc);
```
Internally, `gpiod_direction_output()` may:
* Write to the chip’s `direction` register: `reg |= (1 << offset)` for output, `reg &= ~(1 << offset)` for input.
* Apply any required debounce or pull‑configuration via the pinctrl subsystem.

#### Reading/Writing Values
```c
int val = gpiod_get_value(desc);   /* returns 0 or 1 */
gpiod_set_value(desc, 1);          /* drive high */
```
At the register level, reading is a simple load from `GPLEV0` masked by the pin’s bit; writing uses `GPSET0` or `GPCLR0`.

#### Interrupt Handling
1. **Translate GPIO to IRQ**: `irq = gpiod_to_irq(desc);`
2. **Request the IRQ**:
```c
static irqreturn_t my_gpio_irq(int irq, void *dev_id)
{
    /* Minimal work: schedule a tasklet or wake a wait queue */
    wake_up_interruptible(&my_waitq);
    return IRQ_HANDLED;
}

/* Request, triggering on falling edge */
ret = request_irq(irq, my_gpio_irq,
                  IRQF_TRIGGER_FALLING | IRQF_ONESHOT,
                  "my_gpio", NULL);
if (ret)
    /* handle error */
```
*Why `IRQF_ONESHOT`?*  
The handler runs in a threaded context; the core masks the line until the threaded handler finishes, preventing interrupt storms from bouncing contacts.

The interrupt controller stores the pending bit in its **IRQ status register**; writing a 1 to the corresponding bit in the **IRQ clear** register acknowledges the interrupt.

#### Memory‑Mapped Example (BCM2835)
Base address of GPIO peripheral: `0x3F200000` (Raspberry Pi 3).  
For pin 17 (offset within bank 0):
* Function select register: `GPFSEL1` at `0x3F200004`. Bits `[23:21]` control pin 17.
* To set as output:
```c
void __iomem *gpio_base = ioremap(0x3F200000, 0xB0);
u32 fsel = __raw_readl(gpio_base + 0x04);   /* GPFSEL1 */
fsel &= ~(0x7 << 21);                       /* clear function bits */
fsel |= (0x1 << 21);                        /* 001 = GP output */
__raw_writel(fsel, gpio_base + 0x04);
iounmap(gpio_base);
```

---

## Worked Examples
### Example 1: Debounced Button Poll (sysfs)
**Goal**: Detect a press on a mechanical button attached to GPIO 17, with software debounce of 20 ms.

**Why debounce?** Mechanical contacts bounce for ≈ 1–5 ms; sampling faster than this yields multiple false edges.

**Steps**:
1. Export the pin via sysfs (requires root or appropriate udev rule).
2. Configure as input.
3. In a loop, read the value, apply a simple moving‑average filter, and report a stable state change.

```bash
# Export pin 17
echo 17 > /sys/class/gpio/export

# Set direction
echo in > /sys/class/gpio/gpio17/direction

# Simple debounce loop (bash)
DEBOUNCE_MS=20
SAMPLE_INTERVAL_MS=5
LAST=0
STABLE_COUNT=0
while true; do
    VAL=$(cat /sys/class/gpio/gpio17/value)
    if [ "$VAL" -eq "$LAST" ]; then
        ((STABLE_COUNT++))
    else
        STABLE_COUNT=0
        LAST=$VAL
    fi
    # Consider stable after N samples
    if [ $STABLE_COUNT -ge $((DEBOUNCE_MS / SAMPLE_INTERVAL_MS)) ]; then
        if [ "$VAL" -eq 0 ]; then
            echo "Button pressed"
        else
            echo "Button released"
        fi
        STABLE_COUNT=0
    fi
    sleep $((SAMPLE_INTERVAL_MS/1000))
done
```

**Explanation**:
* Each iteration samples every 5 ms → 4 samples per 20 ms window.
* The counter ensures the value has been unchanged for the full debounce period before acting.

### Example 2: Edge‑Triggered Interrupt (kernel module)
**Goal**: Toggle an LED on GPIO 27 each time a button on GPIO 17 is pressed (falling edge).

**Why use an interrupt?** Eliminates CPU waste; reaction time < 10 µs vs. poll‑loop latency.

**Module outline** (with error checking and cleanup):
```c
#include <linux/module.h>
#include <linux/gpio/consumer.h>
#include <linux/interrupt.h>
#include <linux/workqueue.h>

static struct gpio_desc *button_desc;
static struct gpio_desc *led_desc;
static struct work_struct led_work;

static void led_worker(struct work_struct *work)
{
    bool val = gpiod_get_value(led_desc);
    gpiod_set_value(led_desc, !val);
}

static irqreturn_t button_isr(int irq, void *dev_id)
{
    schedule_work(&led_work);
    return IRQ_HANDLED;
}

static int __init btnled_init(void)
{
    int ret, irq;

    button_desc = gpiod_get(NULL, "button", GPIOD_ASIS_IN);
    if (IS_ERR(button_desc))
        return PTR_ERR(button_desc);

    led_desc = gpiod_get(NULL, "led", GPIOD_ASIS_OUT_LOW);
    if (IS_ERR(led_desc)) {
        ret = PTR_ERR(led_desc);
        goto put_button;
    }

    irq = gpiod_to_irq(button_desc);
    if (irq < 0) {
        ret = irq;
        goto put_led;
    }

    INIT_WORK(&led_work, led_worker);
    ret = request_irq(irq, button_isr,
                      IRQF_TRIGGER_FALLING | IRQF_ONESHOT,
                      "btnled", NULL);
    if (ret)
        goto put_led;

    pr_info("btnled: button IRQ %d requested\n", irq);
    return 0;

put_led:
    gpiod_put(led_desc);
put_button:
    gpiod_put(button_desc);
    return ret;
}

static void __exit btnled_exit(void)
{
    int irq = gpiod_to_irq(button_desc);
    free_irq(irq, NULL);
    cancel_work_sync(&led_work);
    gpiod_put(led_desc);
    gpiod_put(button_desc);
}

module_init(btnled_init);
module_exit(btnled_exit);
MODULE_LICENSE("GPL");
```
**Key points**:
* `gpiod_get()` with `GPIOD_ASIS_IN/OUT` lets the core infer direction from the flag.
* `IRQF_ONESHOT` creates a threaded handler, safe for sleeping work (`schedule_work`).
* The workqueue toggles the LED, keeping the ISR short (< 5 µs).

### Example 3: Runtime Pinmux Switch (GPIO ↔ PWM)
**Goal**: Use the same physical pin (e.g., BCM2835 GPIO 18) as either a GPIO output or a PWM channel, switching at runtime.

**Why runtime mux?** Enables sharing a pin between a diagnostic GPIO and a peripheral (e.g., motor control) without reboot.

**Device Tree snippet** (pinctrl state):
```dts
&gpio {
    pinctrl-names = "default", "gpio18", "pwm18";
    pinctrl-0 = <&pinctrl_default>;
    pinctrl-gpio18 = <&gpio18_out>;
    pinctrl-pwm18  = <&pwm18_out>;
};

gpio18_out: pin@18 {
    function = "gpio";
    bias-pull-up;
};

pwm18_out: pin@18 {
    function = "pwm0";
};
```

**Runtime switch via sysfs (pinctrl)**:
```bash
# Select GPIO function
echo gpio18 > /sys/devices/platform/soc/20200000.pinctrl/pinctrl/pinmux/select

# Use as GPIO (toggle)
echo 18 > /sys/class/gpio/export
echo out > /sys/class/gpio/gpio18/direction
echo 1 > /sys/class/gpio/gpio18/value

# Switch to PWM function
echo pwm18 > /sys/devices/platform/soc/20200000.pinctrl/pinctrl/pinmux/select

# Now PWM controller can drive the pin (requires pwm config)
```
**Explanation**:
* The pinctrl driver holds multiple **pin configurations** (states). Writing a state name to the `select` file programs the multiplexer registers accordingly.
* No kernel recompilation is needed; the change takes effect immediately (typically < 1 µs).

---

## Common Mistakes
| Mistake | What’s wrong | Why it matters |
|---------|--------------|----------------|
| **Neglecting return‑value checks** after `gpiod_get()` or `request_irq()` | Assuming success leads to `NULL` descriptor or invalid IRQ number. | Subsequent dereference causes OOPS or kernel panic. |
| **Using `gpio_request()` without `gpio_free()`** in error paths | Leaks the GPIO descriptor, preventing other drivers from acquiring the pin. | Resource exhaustion; later probes fail with `-EBUSY`. |
| **Configuring edge trigger on a level‑sensitive pin** (e.g., setting `IRQF_TRIGGER_RISING` on an open‑drain output) | The interrupt controller never sees the defined edge, so the IRQ never fires. | Driver appears “dead”; debugging time wasted. |
| **Performing lengthy work in the IRQ handler** (e.g., `msleep()` or complex calculations) | Keeps interrupts disabled (or masks the line) for too long. | Increases interrupt latency, can cause lost events or watchdog triggers. |
| **Assuming a GPIO is push‑pull when it is open‑drain** | Driving high creates a contention or damages the pin. | Hardware damage or undefined logic levels. |
| **Failing to set pull‑up/down before using an input** | Floating input picks up noise, causing spurious interrupts. | False events, erratic behavior. |
| **Using the legacy sysfs interface (`/sys/class/gpio`) on kernels where it is disabled** | sysfs returns `ENOENT`; driver fails silently on newer distributions. | Portability break; the preferred `libgpiod`/`gpio‑dev` API should be used. |

---

## Exercises
### Easy
1. **Sysfs toggle** – Export GPIO 22, set as output, blink an LED at 2 Hz using a shell loop (`echo 1` / `echo 0` with `sleep 0.25`).  
   *Measure the actual period with an oscilloscope or a logic analyzer and compute the error.*

### Medium
2. **Kernel module poll‑driver** – Write a module that:
   * Requests GPIO 17 as input with pull‑up.
   * Polls the pin every 10 ms using a timer (`hrtimer`).
   * Upon detecting a stable low for 30 ms, prints a kernel message (“Button pressed”) and toggles GPIO 27 (LED) using `gpiod_set_value`.
   * Properly frees resources on `remove`.  
   *Include `pr_debug()` statements to show the debounce state machine.*

### Hard
3. **Dynamic pinmux driver** – Create a platform driver that:
   * Registers two pinctrl states: `gpio_mode` and `pwm_mode`.
   * Provides a sysfs attribute (`mode`) that writes either “gpio” or “pwm” to switch the pin (e.g., BCM2835 GPIO 18) between GPIO output and PWM output.
   * In `gpio_mode`, exports the pin as a GPIO and allows toggling via another sysfs attribute (`value`).
   * In `pwm_mode`, configures the PWM subsystem (period = 20 µs, duty = 50 %) to drive a servo.
   * Demonstrates switching back and forth without reboot, verifying with an oscilloscope that the signal changes from a square wave (GPIO toggling) to a PWM waveform.

---

## Linux Connection
### Subsystems and Tools
| Subsystem | Purpose | Typical interface |
|-----------|---------|-------------------|
| **gpiolib** (`<linux/gpio/consumer.h>`) | Core GPIO descriptor API (`gpiod_get`, `gpiod_set_value`, `gpiod_to_irq`). | Used by device drivers. |
| **pinctrl** (`<linux/pinctrl/consumer.h>`) | Pin multiplexing and configuration (bias, drive strength). | `pinctrl_get`, `pinctrl_select_state`. |
| **gpio‑dev** (`/dev/gpiochip0`, `/dev/gpiochip1`) | Character device allowing userspace IOCTLs (`GPIO_GET_LINEHANDLE_IOCTL`, etc.). | Accessed via `libgpiod` tools. |
| **sysfs** (`/sys/class/gpio`) | Legacy filesystem for exporting, direction, value. | Deprecated; still present on many distros. |
| **libgpiod** userspace tools | `gpiodetect`, `gpioinfo`, `gpioset`, `gpioget`, `gpiodmon`. | Preferred over raw sysfs. |

### Concrete Commands (run on a Raspberry Pi or any SBC with libgpiod installed)
```bash
# List all GPIO chips and lines
gpiodetect

# Show details of chip 0 (usually the main SoC GPIO)
gpioinfo 0

# Set line 17 (chip0, line 17) as output and drive high
gpioset --mode=time 0 17=1 1s   # drive high for 1 second, then release

# Read line 22 as input
gpioget 0 22

# Monitor line 27 for both edges, timestamp each event
gpiodmon --num-events 5 0 27 both
```

### Memory‑Mapped Access Example (userspace via `/dev/mem`)
```c
#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <stdio.h>

#define BCM2835_GPIO_BASE 0x3F200000
#define GPFSEL1   0x04
#define GPSET0    0x1C
#define GPCLR0    0x28
#define GPLEV0    0x34

int main(void) {
    int mem_fd = open("/dev/mem", O_RDWR | O_SYNC);
    void *gpio_map = mmap(NULL, 0xB0, PROT_READ|PROT_WRITE,
                          MAP_SHARED, mem_fd, BCM2835_GPIO_BASE);
    volatile unsigned int *gpio = gpio_map;

    /* Set GPIO 18 as output */
    unsigned int fsel = gpio[GPFSEL1/4];
    fsel &= ~(0x7 << ((18%10)*3));   /* clear bits for pin 18 */
    fsel |= (0x1 << ((18%10)*3));    /* 001 = output */
    gpio[GPFSEL1/4] = fsel;

    /* Blink */
    for (int i = 0; i < 5; ++i) {
        gpio[GPSET0/4] = 1 << 18;   /* set high */
        usleep(500000);
        gpio[GPCLR0/4] = 1 << 18;   /* set low */
        usleep(500000);
    }

    munmap(gpio_map, 0xB0);
    close(mem_fd);
    return 0;
}
```
*Derivation of offset*: Each pin’s function select occupies 3 bits. For pin 18 (`pin % 10 = 8`), the shift is `8*3 = 24` bits within `GPFSEL1`. The register address is base + `GPFSEL1`.

---

## Why This Matters
GPIO is the lingua franca between software and the physical world. Mastering its Linux implementation lets you:

* **Drive peripherals reliably** – by configuring direction, pull‑settings, and multiplexing through the kernel’s pin‑control stack, you avoid electrical mishaps such as bus contention or floating inputs.
* **Respond to events with minimal latency** – using the IRQ path (`gpiod_to_irq` → `request_irq`) replaces wasteful polling with deterministic sub‑10 µs reaction times, essential for real‑time control loops.
* **Share scarce pins safely** – runtime pinmux via the pinctrl subsystem lets a single pin alternate between GPIO, UART, SPI, or PWM, reducing board cost and enabling dynamic reconfiguration without reboot.
* **Diagnose and prototype quickly** – userspace tools (`gpiodetect`, `gpioset`, `gpioget`) and the sysfs interface provide immediate feedback during bring‑up, while the same C APIs scale to production drivers.
* **Build layered abstractions** – once you grasp how a `struct gpio_desc` maps to a memory‑mapped register, you can extend the knowledge to other subsystems (e.g., regulator, DMA) that follow the same pattern of descriptor‑based resource management.

In short, GPIO is not merely “a pin you can toggle”; it is a gateway that, when understood through the kernel’s architecture, enables efficient, safe, and flexible interaction with any external device—from a simple tactile switch to a complex sensor array—forming a foundational skill for any Linux‑based embedded or systems developer.
