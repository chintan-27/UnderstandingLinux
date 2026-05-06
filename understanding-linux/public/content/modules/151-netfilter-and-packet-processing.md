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

## Core Concepts
### Netfilter as a Kernel Hooking Framework
Netfilter is not a monolithic firewall; it is a set of **well‑defined points (hooks)** in the Linux networking stack where kernel modules can register callbacks to inspect or alter `struct sk_buff` (socket buffer) objects.  
Each hook corresponds to a precise moment in packet processing:

| Hook          | When it runs (relative to the stack)                                 |
|---------------|-----------------------------------------------------------------------|
| `NF_INET_PRE_ROUTING`   | Immediately after the NIC DMA, before any routing decision.          |
| `NF_INET_LOCAL_IN`      | After routing, if the packet is destined for a local socket.          |
| `NF_INET_FORWARD`       | After routing, if the packet is to be forwarded to another interface. |
| `NF_INET_LOCAL_OUT`     | Just before a locally generated packet leaves the stack.              |
| `NF_INET_POST_ROUTING`  | After routing, just before the packet is handed back to the NIC.      |

**Why hooks?**  
The networking stack is layered and performance‑critical. By exposing only five invariant points, Netfilter lets extensions (e.g., `iptables`, `nft`, `ebpf`) intercept packets **without** having to rewrite the core stack or sacrifice cache locality. The hook mechanism is implemented via `nf_hook_ops` structures; the kernel walks a per‑hook list of callbacks, invoking each until a verdict (`NF_ACCEPT`, `NF_DROP`, `NF_STOLEN`, `NF_QUEUE`, `NF_REPEAT`) is returned.

### Tables, Chains, and Rules
A **table** groups related functionality. The kernel provides three main tables for IPv4 (and analogous ones for IPv6):

| Table   | Primary purpose                               | Built‑in chains (hook → chain)                               |
|---------|-----------------------------------------------|--------------------------------------------------------------|
| `filter`| Packet filtering (accept/drop)               | `INPUT` → `NF_INET_LOCAL_IN`, `FORWARD` → `NF_INET_FORWARD`, `OUTPUT` → `NF_INET_LOCAL_OUT` |
| `nat`   | Network Address Translation (src/dst)        | `PREROUTING` → `NF_INET_PRE_ROUTING`, `POSTROUTING` → `NF_INET_POST_ROUTING`, `OUTPUT` → `NF_INET_LOCAL_OUT` |
| `mangle`| Specialized packet alteration (TTL, MARK, etc.)| All five hooks have a corresponding chain (`PREROUTING`, `INPUT`, `FORWARD`, `OUTPUT`, `POSTROUTING`) |
| `raw`   | Exemption from connection tracking            | `PREROUTING`, `OUTPUT`                                        |
| `security`| MAC/Policy labeling (SELinux)              | `INPUT`, `OUTPUT`, `FORWARD`                                 |

A **chain** is an ordered list of **rules** attached to a hook. When a packet reaches a hook, Netfilter walks the chain **sequentially** until a rule matches; the rule’s *target* then decides the next step.

A **rule** consists of:
1. **Match criteria** (source/dest IP, ports, protocol, connection state, etc.) – expressed via *match extensions* (`-m`).
2. **Target** (`-j`) – what to do if all matches succeed (`ACCEPT`, `DROP`, `RETURN`, another chain, or an extended target like `SNAT`, `DNAT`, `TTL`).

**Causal explanation:**  
The linear walk guarantees deterministic policy evaluation: the first matching rule wins. This design avoids the need for complex conflict‑resolution algorithms and makes it easy to reason about rule ordering—a cornerstone of firewall administration.

### Packet Traversal Intuition (with Queuing Model)
Consider a packet arriving on interface `eth0`. Its journey can be modeled as a series of service stations (the hooks). If we denote the average processing time at hook *h* as $τ_h$ and the average number of rule evaluations per hook as $E_h$, the expected latency $L$ is:

$$
L = \sum_{h \in \{PRE,IN,FWD,OUT,POST\}} \bigl( τ_h + E_h·t_{match} \bigr)
$$

where $t_{match}$ is the average time to evaluate a single match (often $O(1)$ for simple IP/mask checks, $O(\log M)$ for trie‑based matches like `-m string`).  
This formula shows why adding many complex matches (e.g., deep packet inspection) can dominate latency, while simple ACLs add only a constant overhead.

---

## How It Works
### Table‑Specific Chain Traversal
When a packet hits a hook, Netfilter does **not** examine all tables at once. Instead, it processes tables in a fixed order defined by the hook:

| Hook                | Table order (first → last) |
|---------------------|----------------------------|
| `NF_INET_PRE_ROUTING`   | `raw`, `mangle`, `nat` |
| `NF_INET_LOCAL_IN`      | `mangle`, `filter` |
| `NF_INET_FORWARD`       | `mangle`, `filter` |
| `NF_INET_LOCAL_OUT`     | `raw`, `mangle`, `nat`, `filter` |
| `NF_INET_POST_ROUTING`  | `mangle`, `nat` |

Within each table, the corresponding chain is walked. This ordering explains why, for example, a `RAW` rule can **prevent** connection tracking from ever seeing a packet, while a `MANGLE` rule in `POSTROUTING` can alter a packet after NAT has already been applied.

### Rule Evaluation Mechanics
Internally, each rule is compiled into a **bytecode‑like** structure (`struct xt_target_param` + match structs). The kernel executes:

```c
for (each rule r in chain) {
    if (xt_match_all(r->matches, skb)) {
        int verdict = xt_target(r->target, skb);
        if (verdict != XT_CONTINUE) return verdict;
    }
}
return chain->policy;   /* ACCEPT/DROP/RETURN */
```

*Why this matters:*  
- **Short‑circuit evaluation** saves CPU: once a match fails, the rest of the rule is skipped.  
- **Policy fallback** ensures a deterministic default (set via `-P`).

### Match Extensions and Complexity
Simple matches (`-s`, `-d`, `-p`, `--sport`, `--dport`) are implemented as bitmask checks – $O(1)$.  
More complex matches use data structures:
- **`hashlimit`** – a hash table with per‑bucket counters; lookup $O(1)$ average, worst‑case $O(B)$ where $B$ is bucket length.
- **`string`** – Boyer‑Moore or Wu‑Manber search; average $O(n)$ where $n$ is payload length.
- **`connbytes`** – consults the connection tracking cache; $O(1)$ hash lookup.

Understanding these helps predict performance impact.

### Verdict Flowchart (textual)
```
HOOK ENTER
   │
   ▼
[Table 1 Chain] ──► (rule match?) ──► Yes ──► [Target]
   │                         │
   │ No                      │
   ▼                         ▼
[Next Table] …               │
   │                         ▼
   ▼                ACCEPT/DROP/RETURN/QUEUE/etc.
[HOOK EXIT] ◄───────────────────────
```
If the target is `RETURN`, control returns to the invoking chain; if it is another chain (user‑defined), a **jump** occurs and evaluation continues there.

---

## Worked Examples
### Example 1: Drop Incoming SSH from a Specific Subnet
**Goal:** Block any TCP SYN packet destined for port 22 from `10.0.0.0/24`.

**Step‑by‑step reasoning**
1. Packet arrives → `PRE_ROUTING` (raw/mangle/nat) – no alteration needed.
2. Routing decides packet is for local host → `LOCAL_IN` hook.
3. At `LOCAL_IN` the `filter` table’s `INPUT` chain is traversed.
4. We insert a rule that matches:
   - `-p tcp` (protocol TCP)
   - `--dport 22` (destination port)
   - `-s 10.0.0.0/24` (source subnet)
   - `--syn` (TCP SYN flag, using `-m tcp --tcp-flags SYN,FIN,RST,ACK SYN`)
5. Target `-j DROP` tells Netfilter to `NF_DROP` the packet; no further chains are consulted.

**Command:**
```bash
# Insert at top of INPUT so it is evaluated before any ACCEPT rules
sudo iptables -I INPUT -p tcp -s 10.0.0.0/24 --dport 22 -m tcp \
    --tcp-flags SYN,FIN,RST,ACK SYN -j DROP
```
**Verification:**
```bash
sudo iptables -L INPUT -v -n | grep '^DROP'
# Output shows packet and byte counters incrementing for matching traffic
```

### Example 2: Source NAT (MASQUERADE) for Outbound Traffic
**Goal:** Translate the source address of all packets leaving via `eth0` to the interface’s IP, preserving original source ports.

**Why MASQUERADE?**  
Unlike static `SNAT --to <IP>`, MASQUERADE automatically uses the primary address of the outgoing interface, which is essential when the IP is obtained via DHCP or PPP and may change.

**Chain selection:**  
Outbound locally generated packets traverse `LOCAL_OUT` → `POSTROUTING`. The `nat` table’s `POSTROUTING` chain is the last chance to alter the source address before the NIC transmits.

**Rule:**
```bash
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```
**Explanation of each flag:**
- `-t nat` – select the nat table.
- `-A POSTROUTING` – append to the POSTROUTING chain.
- `-o eth0` – match only packets exiting via eth0 (avoids double‑NAT on other interfaces).
- `-j MASQUERADE` – target that rewrites the source IP to the interface’s primary address and adjusts the IPv4 checksum and, if needed, the pseudo‑header for TCP/UDP.

**Effect on checksum:**  
When the source IP changes, the IP header checksum must be recomputed. Netfilter updates it in place; for TCP/UDP, it also adjusts the checksum using the one’s‑difference property:
```
Δ = ~(old_ip) + ~(new_ip)   (one’s complement)
new_csum = old_csum + Δ
```
This avoids a full pseudo‑header re‑calculation, keeping the operation $O(1)$.

**Verification:**
```bash
# Before MASQUERADE, source = 192.168.1.50
# After MASQUERADE, source = 203.0.113.10 (eth0 address)
sudo iptables -t nat -L POSTROUTING -v -n
```

### Example 3: TTL Mangling to Prevent TTL‑Based OS Fingerprinting
**Goal:** Set the TTL of all outgoing TCP packets to a constant 64, regardless of the original value.

**Why TTL matters:**  
Some OS fingerprinting tools infer the initial TTL (e.g., 64 for Linux, 128 for Windows). By normalizing TTL we reduce information leakage.

**Chain:**  
Locally generated TCP packets hit `LOCAL_OUT` → `POSTROUTING`. The `mangle` table’s `POSTROUTING` chain is appropriate because we want to alter the packet after routing but before transmission, ensuring the change is seen on the wire.

**Rule:**
```bash
sudo iptables -t mangle -A POSTROUTING -p tcp -j TTL --ttl-set 64
```
**What the target does:**  
The `TTL` target modifies the `ttl` field in the IPv4 header (`skb->nh.iph->ttl = 64`) and then updates the IPv4 header checksum:
```
new_checksum = old_checksum - old_ttl + new_ttl   (one’s complement arithmetic)
```
Because only one byte changes, the update is constant‑time.

**Verification:**
```bash
# Generate a TCP SYN packet with scroot or hping3
sudo hping3 -S -c 1 -p 80 93.184.216.34   # example.com
# Capture with tcpdump and inspect TTL
sudo tcpdump -i any -c 1 -nn 'tcp[tcpflags] == tcp-syn' -vv
# Look for ttl 64 in the IP header
```

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Breaks |
|---|---------|--------------|---------------|
| 1 | **Using `-i eth0` in the `OUTPUT` chain** | `-i` matches the *incoming* interface; `OUTPUT` sees locally generated packets, which have no incoming interface yet. | The rule never matches, so traffic is unintentionally allowed or blocked depending on the default policy. |
| 2 | **Applying `SNAT` in the `PREROUTING` chain** | `PREROUTING` occurs before routing; the packet’s destination may still be altered by NAT (DNAT) later, causing the source translation to be applied to the wrong flow. | Results in asymmetric routing or packets being dropped because the source address no longer matches the routing table’s expectations. |
| 3 | **Forgetting to load `nf_nat_ftp` when FTP control connection is NATed** | FTP uses dynamic data ports; without the helper, NAT cannot rewrite the PORT/PASV commands inside the payload. | Data connections fail, appearing as “ftp: connect: Connection timed out”. |
| 4 | **Mixing IPv4 and IPv6 tables (`iptables` vs `ip6tables`)** | Adding a rule to block `fd00::/64` with `iptables` has no effect on IPv6 traffic. | The administrator believes the firewall is active, while IPv6 traffic flows unfiltered. |
| 5 | **Setting a default policy of `ACCEPT` on the `FORWARD` chain while intending a whitelist** | With `ACCEPT` as default, any packet not explicitly dropped passes; a missing rule unintentionally opens a path. | Leads to accidental exposure of internal services to the internet. |
| 6 | **Using `-j LOG` without a preceding `-j ACCEPT` or `-j DROP`** | `LOG` is a non‑terminating target; after logging, traversal continues to the next rule. | If the next rule is `DROP`, logging works; if it’s `ACCEPT`, the packet is both logged and allowed, which may be intended, but if the admin expects LOG to stop processing, they miss subsequent rules. |
| 7 | **Assuming `-m state --state ESTABLISHED,RELATED` works without `nf_conntrack` loaded** | The match relies on the connection tracking subsystem; if the module is absent, the match always fails. | Intended “allow return traffic” rule never matches, breaking established connections. |
| 8 | **Overlooking the need for `net.ipv4.ip_forward=1` when using FORWARD or NAT** | The kernel drops forwarded packets by default unless forwarding is enabled. | NAT or routing appears to fail silently; packets are dropped before reaching the POSTROUTING hook. |

Each mistake stems from a misunderstanding of **where** in the packet walk a condition is evaluated or **which** subsystem must be active for a match to succeed.

---

## Exercises
### Easy
1. **Block all inbound ICMP echo‑requests (ping) from any source.**  
   ```bash
   sudo iptables -A INPUT -p icmp --icmp-type echo-request -j DROP
   ```
2. **Log and drop outgoing traffic to port 25 (SMTP) from the host.**  
   ```bash
   sudo iptables -A OUTPUT -p tcp --dport 25 -j LOG --log-prefix "SMTP_OUT: "
   sudo iptables -A OUTPUT -p tcp --dport 25 -j DROP
   ```

### Medium
3. **Redirect HTTP (port 80) requests arriving on `eth0` to a local transparent proxy listening on `127.0.0.1:3128`.**  
   *DNAT in PREROUTING, then allow forwarding to the proxy.*  
   ```bash
   sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j DNAT --to-destination 127.0.0.1:3128
   sudo iptables -A FORWARD -d 127.0.0.1 -p tcp --dport 3128 -j ACCEPT
   sudo iptables -t nat -A POSTROUTING -s 127.0.0.1 -o eth0 -j MASQUERADE
   ```
4. **Limit new TCP connections to port 22 to 4 per minute per source IP, using the `hashlimit` module.**  
   ```bash
   sudo iptables -A INPUT -p tcp --dport 22 -m state --state NEW \
       -m hashlimit --hashlimit 4/min --hashlimit-mode srcip \
       --hashlimit-name ssh_limit -j ACCEPT
   sudo iptables -A INPUT -p tcp --dport 22 -j DROP
   ```

### Hard
5. **Implement a simple QoS policy: mark (`MARK`) outgoing TCP packets with DSCP EF (0x2e) for ports 80 and 443, and AF11 (0x1a) for all other traffic.**  
   ```bash
   # EF for web traffic
   sudo iptables -t mangle -A OUTPUT -p tcp -m multiport --dports 80,443 \
       -j MARK --set-mark 0x2e
   # AF11 for everything else
   sudo iptables -t mangle -A OUTPUT -j MARK --set-mark 0x1a
   # Then configure tc to use these marks (outside scope of Netfilter)
   ```
6. **Create a user‑defined chain `BLACKLIST` that drops packets from a set of IP ranges loaded from a file `/etc/blacklist.txt` (one CIDR per line). Use `-m set` with an `ipset` for efficient lookup.**  
   ```bash
   sudo ipset create blacklist hash:net
   while read cidr; do sudo ipset add blacklist "$cidr"; done < /etc/blacklist.txt
   sudo iptables -N BLACKLIST
   sudo iptables -A BLACKLIST -m set --match-set blacklist src -j DROP
   sudo iptables -I INPUT -j BLACKLIST
   sudo iptables -I FORWARD -j BLACKLIST
   ```

---

## Linux Connection
### Subsystem Locations
| Component | Path (kernel source) | Description |
|-----------|----------------------|-------------|
| Netfilter core | `net/netfilter/` | `nf_hook_ops`, `nf_hook_thunk`, verdict handling |
| IPv4 hooks | `net/ipv4/netfilter/` | IPv4‑specific implementations of the five hooks |
| IPv6 hooks | `net/ipv6/netfilter/` | Analogous IPv6 hooks |
| Tables (filter, nat, mangle) | `net/ipv4/netfilter/ipt_*.c` | e.g., `iptable_filter.c`, `iptable_nat.c`, `iptable_mangle.c` |
| Match extensions | `net/netfilter/` (e.g., `xt_limit.c`, `xt_conntrack.c`) | Shared across IPv4/IPv6 |
| Target extensions | `net/netfilter/` (e.g., `xt_MASQUERADE.c`, `xt_TTL.c`) | NAT, TTL, MARK, etc. |
| Userspace tools | `/usr/sbin/iptables`, `/usr/sbin/ip6tables`, `/usr/sbin/nft` | Front‑ends to add/delete/list rules |
| Library modules | `/lib/x86_64-linux-gnu/xtables/` (`.so` files) | Dynamically loaded matches/targets (e.g., `libxt_conntrack.so`) |
| Procfs info | `/proc/net/ip_tables_names`, `/proc/net/ip_tables_match`, `/proc/net/ip_tables_target` | Lists registered tables/matches/targets |
| Sysctl knobs | `/proc/sys/net/ipv4/conf/*/rp_filter`, `/proc/sys/net/ipv4/ip_forward` | Controls that affect Netfilter behavior |
| Debugfs (if configured) | `/sys/kernel/debug/netfilter/` | Trace hooks, show packet counters per rule |

### Runnable Commands (illustrating the concepts)
```bash
# 1. Show current filter table rules with packet/byte counters
sudo iptables -L -v -n

# 2. Display the nat table (useful for verifying MASQUERADE/SNAT)
sudo iptables -t nat -L -v -n

# 3. List all loaded Netfilter modules
lsmod | grep '^nf_' | awk '{print $1}'

# 4. Verify connection tracking is active
sudo cat /proc/sys/net/ipv4/netfilter/ip_conntrack_count
sudo cat /proc/sys/net/ipv4/netfilter/ip_conntrack_max

# 5. Flush all rules (use with caution on production)
sudo iptables -F
sudo iptables -t nat -F
sudo iptables -t mangle -F

# 6. Save current IPv4 rules to a file (Debian/Ubuntu)
sudo iptables-save > /etc/iptables/rules.v4

# 7. Load rules from a file
sudo iptables-restore < /etc/iptables/rules.v4

# 8. Using nft (the newer framework) to list the equivalent ruleset
sudo nft list ruleset

# 9. Insert a raw rule to drop all traffic from a bogon prefix before connection tracking
sudo iptables -t raw -A PREROUTING -s 224.0.0.0/3 -j DROP

#10. Enable IP forwarding (required for NAT/forwarding)
sudo sysctl -
