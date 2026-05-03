---
id: 135
title: "Power management in drivers"
supermoduleId: 10
estimatedMinutes: 45
resources:
  - type: book
    title: "Linux Device Drivers (Corbet)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

Every peripheral on a system has a power budget. A clock line toggling at $f$ Hz dissipates $$P_{dynamic} = \alpha C V^2 f$$ where $\alpha$ is the switching activity factor, $C$ is the total switched capacitance, and $V$ is the supply voltage. Even at idle, that clock is running unless the driver explicitly gates it. Multiply this across a SoC with dozens of peripherals and you get the difference between 8 hours of battery life and 4. When the system suspends, every driver must save whatever register state the hardware loses in power-off and quiesce any in-flight DMA — if a single driver skips the quiesce step, a DMA engine can write to memory after the CPU has already snapshotted it for hibernation, producing silent corruption that only manifests on the next boot.

Runtime PM adds a finer dimension: a device can power down between uses within a single session, without user intervention, and power back up transparently before the next operation. The correctness constraint is the same — you cannot access hardware registers with the clock gated or the supply rail down — but now the window where that matters is milliseconds rather than hours.

---

## Core Concepts

### The System Sleep Lifecycle

`systemctl suspend` invokes the kernel's `PM_SUSPEND_MEM` path. Userspace tasks are frozen first (via `SIGSTOP` delivered by the freezer), then drivers are suspended in reverse-probe order — children before parents — because a child cannot save state through a bus that is already powered down. The call chain ends in a platform-specific low-power entry: on x86 this calls `acpi_suspend_enter()`, which executes the `\_S3` method from the ACPI DSDT table and cuts power to DRAM's self-refresh support circuitry while keeping DRAM itself alive.

On resume, the order reverses. The kernel calls each driver's `.resume` callback in forward-probe order. A driver that fails to restore its hardware state — by writing back saved registers, re-enabling DMA — will appear to work until the first operation hits a register that reset to its power-on default.

The four callbacks a driver registers for system sleep are:

```c
static const struct dev_pm_ops my_pm_ops = {
    .suspend  = my_suspend,   /* system going to sleep              */
    .resume   = my_resume,    /* system waking from sleep           */
    .freeze   = my_freeze,    /* hibernation: snapshot state to RAM */
    .restore  = my_restore,   /* hibernation: reload from snapshot  */
};
```

`.freeze` and `.restore` are the hibernation (S4) variants. The hardware loses power during S4, so `.restore` must bring the device to a fully operational state as if it were just probed. The distinction from `.resume` matters: after S3, the hardware retains state you didn't explicitly destroy; after S4, it does not.

### Runtime PM

System suspend is all-or-nothing. Runtime PM is per-device. The kernel maintains a usage count per device. When `pm_runtime_get_sync()` increments it from zero, the runtime resume callback fires synchronously before the call returns — the caller gets a powered device. When `pm_runtime_put_autosuspend()` decrements it to zero, the kernel sets a timer for the autosuspend delay; if the count is still zero when the timer fires, the runtime suspend callback runs. If `pm_runtime_get_sync()` is called during that window, the timer is cancelled.

The reference count is what makes this race-free: a DMA transfer that calls `pm_runtime_get_sync()` before starting and `pm_runtime_put()` after completion holds the device awake for exactly as long as needed. There is no separate timer polling device activity.

The autosuspend delay $t_{auto}$ must be long enough that the cost of powering down and back up — regulator ramp time $t_{ramp}$, PLL lock time $t_{pll}$, and firmware re-initialization time $t_{fw}$ — does not exceed the power saved:

$$P_{saved} \cdot t_{idle} > E_{transition} = P_{peak} \cdot (t_{ramp} + t_{pll} + t_{fw})$$

If $t_{idle} < E_{transition} / P_{saved}$, runtime PM wastes energy on transitions. This is why USB input devices use 5-second autosuspend delays rather than 100 ms.

### Clock Control

The Common Clock Framework (CCF) abstracts clock hardware behind a uniform API. A clock has two operations that must happen in order: `clk_prepare()`, which performs slow work such as waiting for a PLL to lock (may sleep, never call from atomic context), and `clk_enable()`, which gates the clock on atomically (cannot sleep). The split exists because PLL lock times are $O(100\,\mu s)$ to $O(1\,ms)$ — holding a spinlock for that duration would be illegal. The paired teardown calls are `clk_disable()` and `clk_unprepare()`, in that order. The convenience wrappers `clk_prepare_enable()` and `clk_disable_unprepare()` call both in sequence and cover the common non-atomic case.

The device tree names the clocks a device consumes:

```dts
my_device: device@40010000 {
    clocks = <&ccu CLK_BUS_UART0>, <&ccu CLK_UART0>;
    clock-names = "bus", "mod";
};
```

The driver requests them by the names declared in `clock-names`.

### Voltage Regulators

A clock gate eliminates $P_{dynamic}$ but not $P_{static}$ (leakage). To eliminate leakage, you must power off the supply rail. The regulator framework manages this. Like clocks, regulators are reference-counted: `regulator_enable()` increments the count and `regulator_disable()` decrements it; the rail only drops when the count reaches zero, so shared rails are safe.

After `regulator_enable()` returns, the voltage is not necessarily stable. The regulator has a ramp rate $r$ (V/µs) and a target voltage $V_{target}$, giving a settling time:

$$t_{ramp} = \frac{V_{target}}{r}$$

For a 1.8 V rail ramping at 0.1 V/µs, $t_{ramp} = 18\,\mu s$. Hardware clocks propagating signals before $t_{ramp}$ elapses can sample undefined voltages, corrupting the device's internal state machine. You must delay by $t_{ramp}$ between enabling the regulator and enabling the clock.

---

## How It Works

### Suspend/Resume in Practice

```c
static int my_suspend(struct device *dev)
{
    struct my_priv *priv = dev_get_drvdata(dev);

    /*
     * Quiesce DMA before saving registers. An in-flight DMA burst
     * may modify the same registers we are about to snapshot.
     */
    my_hw_stop_dma(priv);

    /*
     * Save registers while the clock is still running. Reading a
     * register with the clock gated returns 0xdeadbeef or hangs the
     * bus depending on the interconnect.
     */
    priv->saved_ctrl = readl(priv->base + CTRL_REG);
    priv->saved_cfg  = readl(priv->base + CFG_REG);
    priv->saved_irq  = readl(priv->base + IRQ_MASK_REG);

    /* Gate clock after save, before power removal. */
    clk_disable_unprepare(priv->clk);

    /* Drop supply rail. Regulator framework handles shared rails. */
    regulator_disable(priv->reg);

    return 0;
}

static int my_resume(struct device *dev)
{
    struct my_priv *priv = dev_get_drvdata(dev);
    int ret;

    /* Rail first. */
    ret = regulator_enable(priv->reg);
    if (ret)
        return ret;

    /*
     * Wait for voltage to stabilize. t_ramp is device-specific;
     * read it from the regulator's "regulator-ramp-delay" property
     * or from the datasheet. Here we use a fixed conservative value.
     */
    usleep_range(20, 30);   /* 20–30 µs for a typical 1.8 V rail */

    /* Clock after rail. */
    ret = clk_prepare_enable(priv->clk);
    if (ret) {
        regulator_disable(priv->reg);
        return ret;
    }

    /* Restore state. Hardware is now clocked and supplied. */
    writel(priv->saved_irq,  priv->base + IRQ_MASK_REG);
    writel(priv->saved_cfg,  priv->base + CFG_REG);
    writel(priv->saved_ctrl, priv->base + CTRL_REG);

    return 0;
}
```

The restore order within resume matters independently of the clock/rail ordering. If `CTRL_REG` initiates DMA when written, you must restore `CFG_REG` (which configures the DMA target address) before `CTRL_REG`. Read the hardware manual to determine which registers have side effects on write.

Wire the ops into the driver:

```c
static const struct dev_pm_ops my_pm_ops = {
    .suspend = my_suspend,
    .resume  = my_resume,
};

static struct platform_driver my_driver = {
    .driver = {
        .name   = "my_device",
        .pm     = &my_pm_ops,
    },
    .probe  = my_probe,
    .remove = my_remove,
};
```

### Runtime PM Lifecycle

Configure autosuspend in `probe`, after the device is operational:

```c
static int my_probe(struct platform_device *pdev)
{
    struct my_priv *priv;
    int ret;

    /* ... resource acquisition, clock and regulator setup ... */

    pm_runtime_set_active(&pdev->dev);   /* mark as active before enabling */
