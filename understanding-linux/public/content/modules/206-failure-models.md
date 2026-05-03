---
id: 206
title: "Failure models"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Why This Matters

Distributed systems fail non-uniformly. A process can crash cleanly, silently stop responding, lose network reachability while remaining healthy, or fail in one subsystem while others continue. Treating these as equivalent produces software that either hangs indefinitely on a dead peer, tears down connections that would have recovered, or holds connections whose intermediate path has been silently invalidated. TCP is built around specific assumptions about which failure modes it can detect — and the gap between what TCP *believes* and what *is* explains a large class of production incidents.

---

## Core Concepts

### Crash Failure

A process or host stops executing and produces no further output. From a remote peer, a crash is initially **indistinguishable from silence**: TCP has no out-of-band channel through which the kernel learns that a peer has crashed. The only signal available is the *absence* of responses over time, which is epistemologically identical to the network being slow or partitioned.

A clean crash on a local machine does produce a signal: the kernel sends a `FIN` on behalf of the dying process as it closes the socket during process teardown. What it cannot do is send a `FIN` after a power failure, kernel panic, or OOM kill that happens before the socket is closed — in those cases, the remote peer receives nothing.

### Omission Failure

A process or network element fails to deliver some messages but keeps running. A lossy link is an omission failure. TCP's retransmission machinery tolerates transient omission: a lost segment triggers a retransmit and is not treated as fatal. The problem is *sustained total omission* — at some retransmission threshold, TCP cannot distinguish "segment lost, retransmit" from "peer gone." The retransmission backoff schedule is what defines that threshold in practice.

### Partition Failure (Network Partition)

Both endpoints are healthy and running, but the network path between them is severed. Neither side can reach the other. This is the most dangerous failure mode for distributed state because both sides retain what they believe to be a valid, `ESTABLISHED` connection — the state at the two endpoints becomes **inconsistent**. A partition is invisible to TCP unless something generates traffic. A partition that resolves within the idle timeout leaves no trace.

### Partial Failure

A system fails in a way that affects some components but not others: a NIC that passes traffic asymmetrically, a server reachable on one port but not another, a userspace daemon that has crashed while the kernel is running, or a NAT router that has silently expired a flow entry while both endpoints believe the connection is alive. Partial failures are the most common class of real-world failure and the hardest to detect, because neither endpoint's health checks report a problem.

---

## How It Works

### What TCP Can and Cannot Detect

By default, TCP has no heartbeat. A connection can remain `ESTABLISHED` in the kernel socket table indefinitely with no data exchanged, consuming a file descriptor, memory for send/receive buffers, and an entry in the conntrack table — while the peer is dead and has been for hours.

When a keepalive probe is sent, exactly four states are distinguishable:

| State | What happens |
|---|---|
| Peer alive, path intact | Probe is ACKed; connection confirmed live |
| Peer crashed | No response; a dead machine cannot send RST |
| Peer crashed, rebooted, lost state | Reboot causes peer's stack to RST the probe (unknown connection) |
| Peer alive, path partitioned | No response arrives |

**States 2 and 4 are identical from TCP's perspective.** This is not a bug — it is a fundamental epistemological limit. TCP operates on segment exchange; if no segment arrives, it cannot determine *why*. Any keepalive scheme inherits this limit.

### Keepalive Mechanics

When `SO_KEEPALIVE` is set, the kernel sends probe segments after the connection has been idle for `tcp_keepalive_time` seconds. The probe uses a sequence number equal to `SND.NXT - 1` — one below the current send window. This is deliberately outside the valid window: a live peer's TCP stack must respond with an ACK (to correct the sequence number), but the probe consumes no sequence space and delivers no data.

If the peer does not ACK, the kernel retransmits at `tcp_keepalive_intvl` intervals up to `tcp_keepalive_probes` times, then closes the connection and delivers `ETIMEDOUT` to the application.

The total failure detection time is:

$$t_{\text{fail}} = t_{\text{idle}} + (n_{\text{probes}} \times t_{\text{interval}})$$

With Linux defaults — `tcp_keepalive_time` = 7200 s, `tcp_keepalive_probes` = 9, `tcp_keepalive_intvl` = 75 s:

$$t_{\text{fail}} = 7200 + (9 \times 75) = 7875\text{ s} \approx 2.19\text{ hours}$$

This means a connection to a crashed peer holds a file descriptor, socket buffers, and any associated application state for over two hours before the kernel gives up.

### The Partition Hazard

Keepalives solve crash detection but introduce a new failure sensitivity. Suppose a router between client and server crashes and reboots in 45 seconds. If keepalive probes are in flight during that window, the client receives no ACKs. After $n_{\text{probes}}$ failures, TCP closes the connection and delivers `ETIMEDOUT` — even though the server is alive and the network has recovered.

This is a **false positive**: keepalives distinguish "dead peer" from "alive peer" only when the network is stable. When the network itself is the thing that failed transiently, keepalives incorrectly classify a live peer as dead. Stevens (TCP/IP Illustrated, Vol. 1, §23.5) notes explicitly that the keepalive feature *can cause an otherwise good connection to be terminated because of a temporary loss of connectivity*. The tradeoff is: shorter keepalive timers detect crashes faster and produce more false positives on flaky networks; longer timers tolerate partitions better and hold dead connections longer.

### Partial Failure: NAT State Expiry

A client opens an SSH session through a NAT router, works, then leaves the terminal idle. The NAT router maintains a state table mapping `(client_ip, client_port, server_ip, server_port)` to the router's external address. That entry has an idle timeout — commonly 5–30 minutes for TCP, often shorter in cloud environments and home routers.

After the timeout, the NAT entry is silently deleted. Now:

- Client kernel: socket is `ESTABLISHED`
- Server kernel: socket is `ESTABLISHED`
- NAT router: **no record of this connection**

Any packet from either end traverses the router and is either dropped or generates an ICMP port-unreachable. Neither TCP stack knows anything is wrong until it sends data — at which point the sender gets no ACK and begins retransmitting. If the NAT entry is truly gone, it will never recover unless the client initiates a new connection. SSH's `ServerAliveInterval` and TCP keepalives both exist to force periodic traffic through the NAT before the state entry expires — they keep the NAT table alive as a side effect of crash detection.

The keepalive must fire before the NAT timeout. If $t_{\text{idle}} > t_{\text{NAT}}$, the NAT drops the entry before the first probe is sent, and the keepalive accomplishes nothing. This is why cloud deployments often require $t_{\text{idle}} \leq 60\text{ s}$ regardless of other considerations.

---

## Linux Connection

### Kernel Parameters

Keepalive defaults live in the IPv4 sysctl namespace under `/proc/sys/net/ipv4/` and are managed by the kernel's TCP stack in `net/ipv4/tcp.c` and `net/ipv4/tcp_timer.c`.

```bash
# Inspect current values
sysctl net.ipv4.tcp_keepalive_time    # default: 7200
sysctl net.ipv4.tcp_keepalive_probes  # default: 9
sysctl net.ipv4.tcp_keepalive_intvl   # default: 75

# Equivalent reads via procfs
cat /proc/sys/net/ipv4/tcp_keepalive_time
cat /proc/sys/net/ipv4/tcp_keepalive_probes
cat /proc/sys/net/ipv4/tcp_keepalive_intvl

# Apply more aggressive values for fast failure detection (runtime, not persistent)
sudo sysctl -w net.ipv4.tcp_keepalive_time=60
sudo sysctl -w net.ipv4.tcp_keepalive_probes=3
sudo sysctl -w net.ipv4.tcp_keepalive_intvl=10

# To persist across reboots, write to /etc/sysctl.d/
echo "net.ipv4.tcp_keepalive_time = 60"    | sudo tee /etc/sysctl.d/99-keepalive.conf
echo "net.ipv4.tcp_keepalive_probes = 3"   | sudo tee -a /etc/sysctl.d/99-keepalive.conf
echo "net.ipv4.tcp_keepalive_intvl = 10"   | sudo tee -a /etc/sysctl.d/99-keepalive.conf
sudo sysctl -p /etc/sysctl.d/99-keepalive.conf
```

With these values: $t_{\text{fail}} = 60 + (3 \times 10) = 90\text{ s}$.

These are system-wide defaults that apply to every new socket with `SO_KEEPALIVE` set. Existing sockets are unaffected by sysctl changes.

### Per-Socket Keepalive Configuration

The Linux-specific options `TCP_KEEPIDLE`, `TCP_KEEPINTVL`, and `TCP_KEEPCNT` (defined in `<netinet/tcp.h>`, available since Linux 2.4) override the sysctl defaults on a per-socket basis. The `SOL_SOCKET`-level `SO_KEEPALIVE` must be set first; the `IPPROTO_TCP`-level options only control timing.

```c
#include <sys/socket.h>
#include <netinet/tcp
