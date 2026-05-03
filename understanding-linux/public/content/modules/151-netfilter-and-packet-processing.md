---
id: 151
title: "Netfilter and packet processing"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Why This Matters

Every packet touching a Linux system forces a kernel decision: deliver it locally, forward it, rewrite it, or discard it. Without a structured interception framework, none of the following are possible: stateful firewalling, NAT-based internet sharing, Docker's per-container network isolation, or Kubernetes's `kube-proxy` service load balancing. Netfilter provides that framework by embedding five callback points directly into the IPv4/IPv6 forwarding path. The overhead when no hooks are registered is a single null-pointer check per packet — essentially zero. That design choice is why Netfilter became the universal substrate rather than a niche add-on.

## Core Concepts

### Stateless vs. Stateful Filtering

A stateless firewall matches on header fields only: source IP, destination IP, protocol, ports, TCP flags. It treats each packet as independent, which forces symmetric rules. To allow an outbound TCP connection, a stateless ruleset needs one rule permitting the outbound SYN and a separate rule permitting inbound packets with `ACK` set — and that second rule also permits unsolicited inbound `ACK` packets, which is a security hole.

A stateful firewall solves this by tracking connection state through the *connection tracking* subsystem (`conntrack`, implemented in `net/netfilter/nf_conntrack_core.c`). The ruleset needs only one rule: allow `ESTABLISHED,RELATED` traffic. The kernel's conntrack table records the 5-tuple $(src_{ip}, dst_{ip}, proto, src_{port}, dst_{port})$ for every active connection, so the return traffic is recognized without opening broad holes.

The memory cost of stateful tracking is proportional to the number of concurrent connections. Each conntrack entry consumes roughly 300–400 bytes. With the default table size:

$$N_{max} = \left\lfloor \frac{RAM_{bytes} / 8}{352} \right\rfloor$$

which on a 1 GB machine yields approximately 375,000 entries. You can inspect and tune this:

```bash
# Current table size limit
sysctl net.netfilter.nf_conntrack_max

# Current number of tracked connections
sysctl net.netfilter.nf_conntrack_count

# Raise the limit (survives until reboot)
sysctl -w net.netfilter.nf_conntrack_max=524288

# Make it persistent
echo "net.netfilter.nf_conntrack_max = 524288" >> /etc/sysctl.d/99-conntrack.conf
```

Exceeding `nf_conntrack_max` causes new connections to be dropped with the kernel message `nf_conntrack: table full, dropping packet`. On high-traffic systems this is a real failure mode, not a theoretical one.

### Hooks: Where the Code Runs

Netfilter hooks are not poll points or copy-to-userspace mechanisms. They are direct function-pointer calls inserted into the kernel's packet processing path. When a packet reaches a hook point, the kernel walks a sorted list of registered `nf_hook_ops` structures (sorted by `.priority`) and calls each handler in order, passing a pointer to the `sk_buff`. Each handler returns a verdict; a `NF_DROP` verdict terminates the walk immediately and frees the buffer.

The five IPv4 hooks (defined in `include/uapi/linux/netfilter_ipv4.h`):

| Hook Constant | Position in Path | Typical Use |
|---|---|---|
| `NF_INET_PRE_ROUTING` | After checksum validation, before routing decision | DNAT, conntrack lookup |
| `NF_INET_LOCAL_IN` | After routing confirms local delivery | Inbound filtering |
| `NF_INET_FORWARD` | After routing confirms forwarding | Forward filtering |
| `NF_INET_LOCAL_OUT` | Locally generated packet, before routing | Outbound filtering, DNAT |
| `NF_INET_POST_ROUTING` | After routing, before driver transmission | SNAT, MASQUERADE |

DNAT must happen at `PRE_ROUTING` (or `LOCAL_OUT` for locally generated traffic) because it rewrites the destination address, which changes the routing decision. If DNAT ran after the routing decision, the kernel would have already committed to the wrong path. This ordering constraint is not configurable — it is baked into which chains each table registers.

### NAT: Rewriting Addresses in Transit

SNAT rewrites the source address/port of outgoing packets so that many private hosts share one public IP. DNAT rewrites the destination address/port of incoming packets to redirect them to an internal host. Both operations break the IP end-to-end invariant, which is why they require conntrack: the kernel must remember the original tuple to reverse the translation when the reply arrives.

The nat table processes only the *first* packet of a connection. The translation decision is stored in the conntrack entry and applied automatically to all subsequent packets of that connection by the conntrack fast-path, without re-evaluating nat table rules. This is why changing a nat rule does not affect existing connections — the rule was only consulted once.

Port collision is a real constraint for SNAT. If two internal hosts both have an outbound connection from source port $p$, the kernel must remap one of them to a different external port $p'$ chosen from the ephemeral range $[1024, 65535]$. The number of simultaneous SNAT connections through a single public IP is bounded by:

$$|C_{max}| = (65535 - 1024) \times |dst_{unique}|$$

since the kernel tracks translations per $(external\_port, destination)$ pair, not just per port.

### Tables, Chains, and Evaluation Order

`iptables` organizes rules by *function* (table) and *hook point* (chain). The four main tables and their registered chains:

| Table | Chains | Purpose |
|---|---|---|
| `raw` | PREROUTING, OUTPUT | Bypass conntrack with `NOTRACK` |
| `mangle` | All five | Modify headers: TTL, DSCP, fwmark |
| `nat` | PREROUTING, INPUT, OUTPUT, POSTROUTING | Address/port rewriting |
| `filter` | INPUT, FORWARD, OUTPUT | Accept/drop decisions |

At each hook, tables are evaluated in a fixed order: `raw` → `mangle` → `nat` → `filter`. Within a chain, rules are evaluated top-to-bottom; the first matching rule's target is applied and evaluation stops. A chain with no matching rule falls through to the chain's default policy (`ACCEPT` or `DROP`).

`nftables` (the successor, in `net/netfilter/nf_tables_core.c`) replaces this with a single unified table-and-chain model where you declare which hook and priority each chain sits at. There are no hardcoded table names:

```bash
# nftables equivalent of a basic filter table
nft add table inet my_filter
nft add chain inet my_filter input { type filter hook input priority 0 \; policy drop \; }
nft add rule inet my_filter input ct state established,related accept
nft add rule inet my_filter input tcp dport 22 accept
```

## How It Works

### Packet Traversal Path

The routing decision (`ip_route_input()` for ingress, `ip_route_output()` for egress, in `net/ipv4/route.c`) is not a Netfilter hook. It is the kernel's FIB lookup. Netfilter wraps around it.

**Packet destined for the local host:**

```
NIC → PRE_ROUTING (raw→mangle→nat:DNAT) → ip_route_input()
    → LOCAL_IN (mangle→filter) → socket receive queue
```

**Forwarded packet:**

```
NIC → PRE_ROUTING (raw→mangle→nat:DNAT) → ip_route_input()
    → FORWARD (mangle→filter) → POST_ROUTING (mangle→nat:SNAT) → NIC
```

**Locally generated packet:**

```
socket → LOCAL_OUT (raw→mangle→nat:DNAT→filter) → ip_route_output()
       → POST_ROUTING (mangle→nat:SNAT) → NIC
```

A critical consequence: a packet that is DNAT'd at `PRE_ROUTING` to a local address will follow the "destined for local host" path through `LOCAL_IN`, not the `FORWARD` path. If you port-forward to an external host, you must enable `net.ipv4.ip_forward=1` so the routing decision sends it through `FORWARD`.

### Connection Tracking State Machine

Conntrack assigns each packet a state used by filtering rules:

- `NEW` — first packet of a connection; conntrack entry created
- `ESTABLISHED` — packet belongs to a bidirectional flow (reply seen)
- `RELATED` — new connection associated with an existing one (e.g., FTP data channel opened after the control channel parses a `PORT` command; handled by helper modules like `nf_conntrack_ftp`)
- `INVALID` — no matching conntrack entry and does not qualify as NEW; indicates spoofed, out-of-window, or mangled packets

TCP state transitions in conntrack are more granular internally (`SYN_SENT`, `SYN_RECV`, `FIN_WAIT`, etc.) but these four states are what filtering rules see via `-m conntrack --ctstate`.

Inspect the live conntrack table:

```bash
# Requires conntrack-tools
conntrack -L

# Watch connection events in real time
conntrack -E

# Show only ESTABLISHED TCP connections
conntrack -L -p tcp --state ESTABLISHED

# Manually delete a stuck entry (forces re-handshake)
conntrack -D -s 192.168.1.5 -d 93.184.216.34
```

The conntrack table is stored in `net/netfilter/nf_conntrack_core.c` as a hash table. The hash function takes the 5-tuple; bucket count is set at module load time based on `nf_conntrack_max`.

### SNAT Example: Masquerade

A host at `10.0.0.5` opens a connection to `93.184.216.34:80`. The router's public interface is `203.0.113.1`.

1. Outbound packet: `src=10.0.0.5:
