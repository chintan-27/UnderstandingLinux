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

## Why This Matters

A processor in a polling loop wastes cycles proportional to how long nothing is happening — which is almost always. At 3 GHz with a button pressed once per second, the CPU executes roughly $3 \times 10^9$ wasted iterations per event. Interrupts invert this: the hardware asserts a line only when state changes, and the CPU acts only then. The cost drops from $O(\text{poll rate})$ to $O(\text{event rate})$.

GPIO pins are the physical entry point for this signal path. Pin multiplexing controls what function a physical pad serves. The interrupt subsystem controls what the kernel does when that function fires. A mistake at any layer — wrong mux register, missing `SA_SHIRQ`, sleeping in an ISR — produces failures that range from silent data loss to kernel panics that appear unrelated to the root cause.

---

## Core Concepts

### General Purpose I/O

A GPIO pin is a physical pad on a die that software can configure as input or output at runtime. As an input, the kernel reads its logic level: high ($\approx V_{cc}$) or low ($\approx 0\,\text{V}$). As an output, the kernel drives that level. The word "general purpose" means the pad has no fixed function — the same physical pad on a SoC can be UART TX, SPI CLK, or a plain digital input depending on what the pin controller's mux register selects.

The kernel represents each GPIO as an unsigned integer offset within a `gpio_chip`. The mapping from that offset to a physical pin is chip-specific and declared in the device tree or ACPI tables. User space sees the abstraction through `/sys/class/gpio/` or the newer `gpio-cdev` interface at `/dev/gpiochipN`.

### Pin Multiplexing

A SoC typically has 50–200 physical pads and 400–1000 internal peripheral signals. Each pad is wired to a small set of internal functions; a mux register field (often 3–4 bits per pin) selects which one is active. Only one function can drive the pad at a time — selecting a second function electrically disconnects the first.

The kernel's `pinctrl` subsystem owns these registers. Drivers do not write mux registers directly. Instead, device tree nodes declare pin states:

```
&uart0 {
    pinctrl-names = "default";
    pinctrl-0 = <&uart0_pins>;
};

&pinctrl {
    uart0_pins: uart0-pins {
        pins = "PA4", "PA5";
        function = "uart0";
        bias-pull-up;
    };
};
```

At probe time, the driver framework calls `pinctrl_select_state()`, which resolves these declarations and writes the hardware mux registers. If two drivers claim the same pin in incompatible modes, `pinctrl_select_state()` returns `-EBUSY` and the second driver fails to probe. Without `pinctrl` enforcement, the second write silently wins — the first peripheral stops working with no error logged.

The pinctrl driver for a given SoC lives under `drivers/pinctrl/`. For example, the Raspberry Pi 4's BCM2711 controller is in `drivers/pinctrl/bcm/pinctrl-bcm2835.c`.

### Interrupts

An interrupt is an asynchronous CPU exception triggered by hardware. The causal chain is precise:

1. A voltage transition on a pin meets the interrupt controller's trigger threshold (rising edge, falling edge, or level, depending on configuration).
2. The interrupt controller (APIC on x86, GIC on ARM) latches the event and asserts the CPU's `INTR` pin.
3. The CPU completes the current instruction — not the current cache line, not the current function — then checks the interrupt flag.
4. If interrupts are enabled (`IF=1` on x86), the CPU saves `%eip`/`%rip` and `%eflags` to the current stack, looks up the handler address in the IDT (x86) or vector table (ARM), and jumps to it.
5. The kernel's entry stub saves the remaining registers, builds a `pt_regs` frame, and calls `do_IRQ()`.

The interrupt arrives at step 3 regardless of what the kernel was doing — inside a spinlock, inside another interrupt handler (if nested interrupts are enabled), or between two instructions of a `cmpxchg`. This is why interrupt handlers cannot assume any kernel state is consistent.

### Top Half vs. Bottom Half

The interrupt controller holds the IRQ line asserted until the CPU acknowledges it. On an 8259A-style PIC, a new interrupt of the same priority cannot be delivered until `EOI` (End of Interrupt) is written. On a GIC, similar masking applies. The time between interrupt assertion and EOI is the *interrupt latency window* — during it, other interrupts at equal or lower priority are blocked.

This creates the top-half/bottom-half split:

- **Top half** (the ISR): runs immediately, with hard latency requirements. Must acknowledge the hardware (write EOI, clear the device's interrupt status register), snapshot any time-critical state, and schedule deferred work. Must not sleep, must not call any function that can block.
- **Bottom half**: runs once the top half returns and the CPU exits interrupt context. Can do arbitrary kernel work. Three mechanisms exist, in order of increasing capability and overhead:

| Mechanism | Runs in | Can sleep? | Use when |
|---|---|---|---|
| Softirq | Softirq context | No | High-frequency, fixed number of types |
| Tasklet | Softirq context | No | Per-device, dynamic, still no sleeping |
| Workqueue | Process context | Yes | Needs `kmalloc`, file I/O, or any blocking op |

The split is not optional for non-trivial drivers. Copying a full Ethernet frame, formatting a USB packet, or waking a process through a wait queue — all of these involve operations that can block or take unbounded time, and none of them belong in the top half.

---

## How It Works

### IRQ Numbers and GPIO Numbers Are Different Namespaces

A GPIO number (e.g., GPIO 17 on a Raspberry Pi) is an offset in the GPIO chip's domain. An IRQ number is assigned by the interrupt controller and lives in a completely separate namespace. To use a GPIO pin as an interrupt source, you must convert:

```c
int gpio = 17;
int irq  = gpio_to_irq(gpio);   /* returns IRQ number, or negative errno */
```

`gpio_to_irq()` queries the GPIO chip's `irq_domain`, which maps GPIO offsets to IRQ numbers via a lookup table populated at boot from the device tree. The reverse — `irq_to_gpio()` — existed in older kernels but was removed because the mapping is not always 1:1.

### Registering an Interrupt Handler

```c
int request_irq(unsigned int irq,
                irq_handler_t handler,   /* irqreturn_t (*)(int, void *) */
                unsigned long flags,
                const char *name,
                void *dev_id);
```

The modern prototype drops `struct pt_regs *` from the handler signature — register state is accessible via `get_irq_regs()` if needed, but passing it directly was removed in 2.6.19 to decouple the ABI.

Flags that matter:

| Flag | Effect |
|---|---|
| `IRQF_SHARED` | Allows multiple handlers on this IRQ; requires non-NULL `dev_id` |
| `IRQF_TRIGGER_RISING` | Trigger on rising edge |
| `IRQF_TRIGGER_FALLING` | Trigger on falling edge |
| `IRQF_TRIGGER_HIGH` | Trigger while level is high (level-sensitive) |
| `IRQF_DISABLED` | *Removed in 3.1* — do not use; all handlers now run with local IRQs disabled by default on x86 |

`dev_id` is not decoration. On a shared IRQ line, it is the *only* thing distinguishing your handler from another driver's handler — both at dispatch (the kernel passes `dev_id` back to your handler so you can cast it to your device struct) and at cleanup (`free_irq(irq, dev_id)` matches by `dev_id`, not by handler pointer). Passing `NULL` on a shared line causes `free_irq` to either fail with `-EINVAL` or remove the wrong entry.

A complete registration sequence in a platform driver:

```c
static irqreturn_t mydrv_isr(int irq, void *dev_id)
{
    struct mydrv_dev *dev = dev_id;

    if (!(readl(dev->base + STATUS_REG) & IRQ_PENDING))
        return IRQ_NONE;   /* not our device; another handler on shared line will claim it */

    writel(IRQ_CLEAR, dev->base + STATUS_REG);   /* acknowledge before reading data */
    dev->pending_count++;
    tasklet_schedule(&dev->tasklet);

    return IRQ_HANDLED;
}

static int mydrv_probe(struct platform_device *pdev)
{
    struct mydrv_dev *dev;
    int irq, ret;

    dev = devm_kzalloc(&pdev->dev, sizeof(*dev), GFP_KERNEL);
    if (!dev) return -ENOMEM;

    irq = platform_get_irq(pdev, 0);   /* reads IRQ from device tree */
    if (irq < 0) return irq;

    ret = devm_request_irq(&pdev->dev, irq, mydrv_isr,
                           IRQF_SHARED, "mydrv", dev);
    if (ret) return ret;

    platform_set_drvdata(pdev, dev);
    return 0;
}
```

`devm_request_irq` ties the IRQ lifetime to the device — the kernel automatically calls `free_irq` when the device is removed, eliminating a common resource leak in error paths.

### The x86 Interrupt Entry Path

In `arch/x86/entry/entry_64.S`, a macro generates a stub for each vector:

```asm
/* simplified; actual macro in entry_64.S */
SYM
