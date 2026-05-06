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

## Core Concepts
### Introduction to Power Management in Drivers
Power management reduces energy consumption by aligning a device’s power draw with its actual workload. Energy E = ∫P(t) dt, where instantaneous power P(t) = P_dyn + P_stat. Dynamic power follows the well‑known formula  

$$P_{\text{dyn}} = \alpha C V^{2} f$$  

with switching activity α, load capacitance C, supply voltage V, and clock frequency f. Static (leakage) power grows exponentially with temperature and roughly linearly with V. Lowering V or f therefore yields quadratic (V) or linear (f) savings, while turning off clocks eliminates P_dyn entirely. The Linux kernel exposes these levers through three interlocking subsystems: the **power management (PM) core**, the **clock framework**, and the **regulator framework**. Drivers hook into them via standard callbacks so that the kernel can coordinate transitions without needing to know device‑specific details.

### Power Management Core
The PM core lives in `drivers/base/power/` and tracks each device’s power state via `struct dev_pm_info` embedded in `struct device`. Key fields:

- `power.state` – current PM state (`PM_ON`, `PM_SUSPEND`, etc.).
- `power.runtime_status` – `RPM_ACTIVE`, `RPM_SUSPENDED`, `RPM_IDLE`.
- `power.autosuspend_delay_ms` – threshold after which the core may auto‑suspend an idle device.
- `power.use_autosuspend` – enables autosuspend logic.
- `power.skip_sysfs` – if set, the device will not appear under `/sys/devices/.../power`.

The core defines a set of **PM callbacks** that drivers implement in `struct dev_pm_ops`:

| Callback            | When invoked                                   | Typical driver work                              |
|---------------------|-----------------------------------------------|--------------------------------------------------|
| `prepare`           | Before any PM transition (suspend, runtime)   | Quiesce I/O, stop submitting new requests        |
| `suspend`           | System‑wide suspend (e.g., `echo mem > /sys/power/state`) | Save hardware context, put clocks/regulators low |
| `suspend_noirq`     | After interrupts are disabled                 | Disable IRQs, final power‑gate if safe          |
| `resume_noirq`      | Before IRQs are re‑enabled                    | Restore minimal hardware state                  |
| `resume`            | After IRQs are re‑enabled                     | Full re‑initialization, resume normal operation |
| `runtime_suspend`   | Device idle, autosuspend triggered            | Put device into low‑power state, gate clocks    |
| `runtime_resume`    | Device needed again                           | Restore clocks, bring out of low‑power state    |
| `runtime_idle`      | No pending runtime PM requests, autosuspend delay elapsed | Decide whether to suspend (`return -EAGAIN` to let core autosuspend) |
| `complete`          | After any PM operation finishes               | Cleanup, re‑enable wake‑up sources              |

Each callback receives a `struct device *dev` pointer; drivers retrieve private data via `dev_get_drvdata(dev)`. Returning a non‑zero value aborts the transition and leaves the device in its previous state.

### Runtime Power Management (RPM)
RPM lets the kernel manage power **while the system is fully awake**. The core maintains a **reference count** for each device:

- `pm_runtime_get(dev)` increments the count; if the count transitions from 0→1, the core calls `runtime_resume`.
- `pm_runtime_put(dev)` decrements; if the count transitions from 1→0, the core may call `runtime_suspend` after `autosuspend_delay_ms` of idle time.
- Variants `_sync` block until the operation completes; `_get_noresume` increments without forcing a resume (used in interrupt context).

The **autosuspend delay** is a tunable trade‑off: too short → frequent wake‑up overhead; too long → wasted energy. The optimal delay can be derived from an energy‑balance model:

Let  
- $P_{a}$ = active power (device executing workload)  
- $P_{s}$ = suspended power (deep‑sleep)  
- $E_{w}$ = fixed energy cost of a wake‑up/suspend cycle (save/restore overhead)  

If the device remains idle for a time $t$, the energy if we **stay active** is $E_{a}=P_{a}t$.  
If we **suspend after a delay d**, the energy is  

$$E_{s}=P_{a}d + P_{s}(t-d) + E_{w}$$

Suspending is worthwhile when $E_{s} < E_{a}$, i.e.

$$t > d + \frac{E_{w}}{P_{a}-P_{s}}$$  

The kernel uses this inequality implicitly: after the autosuspend delay elapses, the core checks whether the device has any pending I/O; if not, it proceeds to suspend.

### Clock Framework
Clocks are hierarchical; each `struct clk` represents a signal source with operations:

- `clk_prepare_enable(clk)` – ensures the clock’s parents are prepared, then enables the gate.
- `clk_disable_unprepare(clk)` – reverses the sequence.
- `clk_set_rate(clk, rate)` – attempts to reprogram the hardware to the requested frequency (returns `-EINVAL` if unsupported).
- `clk_get_rate(clk)` – reads the current programmed rate.

Power scales with $f$ (see $P_{\text{dyn}}$ formula). Drivers typically:

1. Obtain a clock via `devm_clk_get(dev, "core")`.
2. In `probe`, call `clk_prepare_enable(clk)`.
3. In `runtime_suspend`, call `clk_disable_unprepare(clk)`.
4. Optionally adjust rate based on load (DVFS) using `clk_set_rate`.

Regulators often gate clocks; changing a clock’s rate may require voltage scaling via the regulator framework.

### Regulator Framework
Regulators supply controllable voltages (and sometimes currents) to devices. The core API (`drivers/regulator/`) provides:

- `regulator_get(dev, "vdd")` – obtain a regulator reference.
- `regulator_enable(r)` / `regulator_disable(r)` – toggle output.
- `regulator_set_voltage(r, min_uV, max_uV)` – request a voltage window; the regulator chooses the lowest feasible voltage ≥ `min_uV`.
- `regulator_get_voltage(r)` – read actual output.
- `regulator_set_mode(r, mode)` – e.g., `REGULATOR_MODE_FAST` vs `REGULATOR_MODE_IDLE` for efficiency.

Power saved by lowering voltage follows the quadratic term in $P_{\text{dyn}}$. A typical sequence for a device that supports DVFS:

1. Enable regulator (`regulator_enable`).
2. Set initial voltage (`regulator_set_voltage`).
3. Enable and set clock rate.
4. On load increase: request higher voltage → set higher clock rate.
5. On load decrease: lower clock rate → lower voltage → disable if idle.

## How It Works
### Power Management Core Internals
When the kernel initiates a system suspend (e.g., via `/sys/power/state`), it walks the device tree depth‑first, invoking each device’s `prepare` → `suspend` → `suspend_noirq`. The **noirq** phase runs after `local_irq_disable()`, guaranteeing that no interrupt handlers will run while the device is being powered down. Conversely, resume walks upward, invoking `resume_noirq` → `resume`. This ordering ensures that parent buses (e.g., PCI, I²C) are still functional when child devices need to save/restore state that depends on bus traffic.

Runtime PM uses a **workqueue** (`pm_runtime_work_t`) to defer autosuspend decisions. When `pm_runtime_put_autosuspend` drops the refcount to zero, the core schedules a delayed work item that fires after `autosuspend_delay_ms`. If another `pm_runtime_get` occurs before the work runs, the work is cancelled, preventing unnecessary suspend/resume cycles.

### Clock Control Details
The clock framework isolates hardware-specific enabling/disabling in **clock drivers** (found in `drivers/clk/`). A clock node in device‑tree may look like:

```dts
clocks {
    osc: oscillator {
        #address-cells = <0>;
        #size-cells = <0>;
        compatible = "fixed-clock";
        clock-frequency = <24000000>;
    };
    pll: pll-clock {
        compatible = "fixed-factor-clock";
        clocks = <&osc>;
        clock-div = <1>;
        clock-mult = <20>;
    };
};
```

The core resolves `&osc` and `&pll` at probe time, constructing a graph where enabling the PLL automatically enables its parent oscillator. Power savings come from disabling unused branches; the core tracks **prepare counts** to avoid disabling a clock still needed by another consumer.

### Regulator Coordination
Regulators expose **constraints** via regulator‑driver `struct regulator_constraints` (often supplied through device‑tree). These constraints tell the core the permissible voltage range, startup delay, and whether the regulator can be turned off. When a driver calls `regulator_set_voltage`, the core checks the constraints and may need to wait for the regulator’s internal settling time (exposed via `regulator_get_enable_time`/`regulator_get_disable_time`). Ignoring these times can cause the device to see an unstable supply, leading to brown‑outs or corrupted registers.

### Interplay Example: DVFS Sequence
Consider a CPU core that must scale from 800 MHz/0.9 V to 1.2 GHz/1.1 VF. The driver executes:

```c
/* 1. Raise voltage first (to avoid frequency over‑voltage) */
regulator_set_voltage(vdd_reg, 900000, 1100000); /* request 0.9‑1.1 V */
regulator_enable(vdd_reg);

/* 2. Wait for voltage to stabilize (optional, regulator driver may expose a callback) */
usleep_range(10, 20);

/* 3. Increase clock */
clk_set_rate(cpu_clk, 1200000000);

/* 4. Update governor statistics */
```

Reversing the order (clock then voltage) risks transient over‑frequency operation, which can cause timing violations or electromigration. The kernel’s **devfreq** subsystem encapsulates this pattern, but drivers that bypass it must respect the voltage‑first rule.

## Worked Examples
### Example 1: System Suspend/Resume Driver (Platform Bus)
We implement a minimal platform driver for a hypothetical sensor that needs to save its register state during suspend.

```c
/* file: sensor_pm.c */
#include <linux/module.h>
#include <linux/platform_device.h>
#include <linux/pm.h>
#include <linux/io.h>

struct sensor_dev {
	void __iomem *base;
	u32 saved_ctrl;   /* register to preserve */
};

static int sensor_prepare(struct device *dev)
{
	struct sensor_dev *sdev = dev_get_drvdata(dev);
	/* Stop any ongoing conversions */
	iowrite32(0, sdev->base + SENSOR_CTRL);
	return 0;
}

static int sensor_suspend(struct device *dev)
{
	struct sensor_dev *sdev = dev_get_drvdata(dev);
	/* Save critical register */
	sdev->saved_ctrl = ioread32(sdev->base + SENSOR_CTRL);
	/* Put hardware in low‑power state */
	iowrite32(SENSOR_CTRL_LOWPOWER, sdev->base + SENSOR_CTRL);
	dev_dbg(dev, "sensor suspended, ctrl saved=%08x\n", sdev->saved_ctrl);
	return 0;
}

static int sensor_resume(struct device *dev)
{
	struct sensor_dev *sdev = dev_get_drvdata(dev);
	/* Restore saved state */
	iowrite32(sdev->saved_ctrl, sdev->base + SENSOR_CTRL);
	/* Re‑enable normal operation */
	iowrite32(SENSOR_CTRL_NORMAL, sdev->base + SENSOR_CTRL);
	dev_dbg(dev, "sensor resumed\n");
	return 0;
}

static const struct dev_pm_ops sensor_pm_ops = {
	.prepare = sensor_prepare,
	.suspend = sensor_suspend,
	.resume  = sensor_resume,
};

static int sensor_probe(struct platform_device *pdev)
{
	struct sensor_dev *sdev;
	struct resource *res;

	sdev = devm_kzalloc(&pdev->dev, sizeof(*sdev), GFP_KERNEL);
	if (!sdev)
		return -ENOMEM;

	res = platform_get_resource(pdev, IORESOURCE_MEM, 0);
	sdev->base = devm_ioremap_resource(&pdev->dev, res);
	if (IS_ERR(sdev->base))
		return PTR_ERR(sdev->base);

	dev_set_drvdata(&pdev->dev, sdev);

	/* Register PM ops */
	pdev->dev.pm = &sensor_pm_ops;

	return 0;
}

static int sensor_remove(struct platform_device *pdev)
{
	return 0;
}

static const struct of_device_id sensor_of_match[] = {
	{ .compatible = "vendor,sensor-pm" },
	{}
};
MODULE_DEVICE_TABLE(of, sensor_of_match);

static struct platform_driver sensor_driver = {
	.probe  = sensor_probe,
	.remove = sensor_remove,
	.driver = {
		.name           = "sensor-pm",
		.of_match_table = sensor_of_match,
		.pm             = &sensor_pm_ops,
	},
};
module_platform_driver(sensor_driver);
MODULE_LICENSE("GPL");
```

**Explanation of steps**

1. **prepare** halts new sensor conversions to avoid dangling DMA.
2. **suspend** reads the control register (`SENSOR_CTRL`) and saves it in driver‑private memory, then writes a low‑power setting.
3. **resume** restores the saved register and re‑enables normal mode.
4. The driver registers its `dev_pm_ops` via the device’s `pm` pointer; the core will invoke these callbacks during system suspend/resume.

### Example 2: Runtime Power Management with Autosuspend
A USB‑like peripheral that processes packets intermittently.

```c
/* file: rpm_dev.c */
#include <linux/module.h>
#include <linux/usb.h>
#include <linux/pm_runtime.h>
#include <linux/delay.h>

struct rpm_dev {
	struct usb_device *udev;
	u8 bulk_in_ep;
	u8 bulk_out_ep;
};

static int rpm_runtime_suspend(struct device *dev)
{
	struct rpm_dev *rdev = dev_get_drvdata(dev);
	/* Issue a vendor command to put the device into low power */
	usb_control_msg(rdev->udev, usb_sndctrlpipe(rdev->udev, 0),
	                0x01, /* vendor request: enter low power */
	                USB_TYPE_VENDOR | USB_RECIP_DEVICE | USB_DIR_OUT,
	                0, 0, NULL, 0, USB_CTRL_SET_TIMEOUT);
	dev_dbg(dev, "runtime suspend issued\n");
	return 0;
}

static int rpm_runtime_resume(struct device *dev)
{
	struct rpm_dev *rdev = dev_get_drvdata(dev);
	/* Wake the device */
	usb_control_msg(rdev->udev, usb_rcntrlpipes(rdev->udev, 0),
	                0x02, /* vendor request: exit low power */
	                USB_TYPE_VENDOR | USB_RECIP_DEVICE | USB_DIR_IN |
	                USB_RECIP_DEVICE,
	                0, 0, NULL, 0, USB_CTRL_SET_TIMEOUT);
	dev_dbg(dev, "runtime resume issued\n");
	return 0;
}

/* Called whenever we have a packet to process */
static void rpm_process_packet(struct rpm_dev *rdev)
{
	/* Ensure runtime PM reference is held */
	pm_runtime_get_sync(&rdev->udev->dev);
	/* Submit URB, wait for completion … */
	/* ... */
	/* Release reference; autosuspend will trigger after delay */
	pm_runtime_mark_last_busy(&rdev->udev->dev);
	pm_runtime_put_autosuspend(&rdev->udev->dev);
}

static int rpm_probe(struct usb_interface *intf, const struct usb_device_id *id)
{
	struct rpm_dev *rdev;
	struct usb_endpoint_descriptor *ep;

	rdev = devm_kzalloc(&intf->dev, sizeof(*rdev), GFP_KERNEL);
	if (!rdev)
		return -ENOMEM;

	rdev->udev = interface_to_usbdev(intf);
	/* Find bulk-in/out endpoints */
	usb_endpoint_foreach(ep, &intf->altsetting->endpoint) {
		if (usb_endpoint_is_bulk_in(ep))
			rdev->bulk_in_ep = ep->bEndpointAddress;
		if (usb_endpoint_is_bulk_out(ep))
			rdev->bulk_out_ep = ep->bEndpointAddress;
	}

	dev_set_drvdata(&intf->dev, rdev);

	/* Enable runtime PM */
	pm_runtime_use_autosuspend(&intf->dev);
	pm_runtime_set_autosuspend_delay(&intf->dev, 100); /* 100 ms */
	pm_runtime_get_noresume(&intf->dev);  /* start with refcount=1, no resume */
	pm_runtime_put_autosuspend(&intf->dev); /* now let autosuspend logic work */

	return 0;
}

static void rpm_disconnect(struct usb_interface *intf)
{
	pm_runtime_get_sync(&intf->dev);   /* ensure we are resumed before removal */
	pm_runtime_put_noidle(&intf->dev);
	pm_runtime_disable(&intf->dev);
	usb_set_intfdata(intf, NULL);
}

static struct usb_driver rpm_driver = {
	.name          = "rpm-dev",
	.id_table      = rpm_ids,
	.probe         = rpm_probe,
	.disconnect    = rpm_disconnect,
};
module_usb_driver(rpm_driver);
MODULE_LICENSE("GPL");
```

**Key points**

- `pm_runtime_get_noresume` followed by `pm_runtime_put_autosuspend` seeds the reference count at 1 without forcing a resume; the core will resume on the first `get_sync`.
- After processing a packet we call `pm_runtime_mark_last_busy` (updates the internal idle timer) then `pm_runtime_put_autosuspend`. If no further packets arrive within the autosuspend delay (here 100 ms), the core will invoke `runtime_suspend`.
- The driver uses vendor‑specific control commands to actually put the hardware into a low‑power state; the PM core only manages the reference counting and timing.

### Example 3: Clock Scaling and Regulator Coordination (DVFS)
A simple driver that adjusts CPU‑like frequency based on a load metric.

```c
/* file: dvfs_demo.c */
#include <linux/module.h>
#include <linux/platform_device.h>
#include <linux/clk.h>
#include <linux/regulator/driver.h>
#include <linux/delay.h>

struct dvfs_dev {
	struct clk *clk;
	struct regulator *vdd;
	unsigned long cur_rate;   /* current clock rate (Hz) */
	int cur_uv;               /* current voltage (µV) */
};

static int dvfs_set_rate(struct dvfs_dev *d, unsigned long target_rate)
{
	int ret;
	unsigned long min_uv, max_uv;
	/* 1. Determine required voltage for target rate (simplified V/f curve) */
	/* Assume Vmin = 600 mV + (rate/1GHz)*400 mV */
	min_uv = 600000 + (target_rate / 2500000) * 40000; /* 40 mV per 250 MHz */
	max_uv = min_uv + 50000; /* allow 50 mV tolerance */

	/* 2. Scale voltage first */
	ret = regulator_set_voltage(d->vdd, min_uv, max_uv);
	if (ret)
		return ret;
	ret = regulator_enable(d->vdd);
	if (ret)
		return ret;

	/* 3. Wait for regulator to settle (use regulator_get_enable_time if available) */
	usleep_range(100, 200);

	/* 4. Set clock */
	ret = clk_set_rate(d->clk, target_rate);
	if (ret) {
		/* If clock fails, revert voltage to previous safe value */
		regulator_set_voltage(d->vdd, d->cur_uv, d->cur_uv);
		return ret;
	}
	d->cur_rate = target_rate;
	d->cur_uv   = min_uv;
	return 0;
}

static int dvfs_probe(struct platform_device *pdev)
{
	struct dvfs_dev *d;
	struct device *dev = &pdev->dev;
	int ret;

	d = devm_kzalloc(dev, sizeof(*d), GFP_KERNEL);
	if (!d)
		return -ENOMEM;

	d->clk = devm_clk_get(dev, "core");
	if (IS_ERR(d->clk))
		return PTR_ERR(d->clk);

	d->vdd = devm_regulator_get(dev, "vdd");
	if (IS_ERR(d->vdd))
		return PTR_ERR(d->vdd);

	dev_set_drvdata(dev, d);

	/* Enable clock and regulator at a safe baseline */
	ret = clk_prepare_enable(d->clk);
	if (ret)
		return ret;
	ret = regulator_enable(d->vdd);
	if (ret) {
		clk_disable_unprepare(d->clk);
		return ret;
	}
	/* Assume initial state: 800 MHz, 0.9 V */
	d->cur_rate = 800000000;
	d->cur_uv   = 900000;

	return 0;
}

static void dvfs_remove(struct platform_device *pdev)
{
	struct dvfs_dev *d = dev_get_drvdata(&pdev->dev);
	regulator_disable(d->vdd);
	clk_disable_unprepare(d->clk);
}

/* Example sysfs attribute
