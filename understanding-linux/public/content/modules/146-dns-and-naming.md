---
id: 146
title: "DNS and naming"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
The Domain Name System (DNS) is a **hierarchical, distributed database** that maps domain names to resource records (RRs). Its hierarchy mirrors administrative delegation: each label in a name corresponds to a zone cut, and the authority for that zone is delegated to a set of name servers. This delegation solves two fundamental problems:

1. **Scalability** – No single server must hold the entire name space; authority is spread across millions of zones.  
2. **Autonomy** – Organizations can manage their own sub‑domains without coordinating a central registry.

A DNS query carries a **question section** (QNAME, QTYPE, QCLASS) and expects an answer composed of up to four sections: Answer, Authority, Additional. The most common classes are `IN` (Internet); rare classes like `CH` (Chaos) exist for diagnostic purposes.

Key RR types and their purpose:

| Type | Meaning | Wire format (simplified) |
|------|---------|--------------------------|
| A    | IPv4 address | 4‑octet IPv4 |
| AAAA | IPv6 address | 16‑octet IPv6 |
| CNAME| Canonical name (alias) | QNAME of target |
| MX   | Mail exchange | 16‑bit preference + target name |
| NS   | Authoritative name server | Name server hostname |
| PTR  | Pointer (reverse map) | QNAME of hostname |
| TXT  | Arbitrary text | <length‑prefixed> character data |
| SRV  | Service location | priority, weight, port, target |

Each RR carries a **TTL** (time‑to‑live) field, an unsigned 32‑bit integer expressing the maximum seconds the RR may be cached. The TTL is **not** a guarantee of expiry; it is an upper bound. Caching reduces query traffic and improves latency, but it also introduces *staleness*: a resolver may serve an answer whose true TTL has elapsed if it has not refreshed the cache.

A **stub resolver** (the client side in applications) does not perform recursion; it forwards queries to a **recursive resolver** (often provided by the ISP or a local forwarding cache). The recursive resolver either answers from its cache or performs an **iterative query** chain: it contacts a root server, receives a referral to a TLD server, then to the authoritative server for the zone, following NS delegations until it obtains an answer with the AA (authoritative answer) bit set.

## How It Works
### Query Flow (Iterative Model)
1. **Stub → Recursive**: The application calls `getaddrinfo()` (or the older `gethostbyname()`). The stub resolver builds a DNS query packet and sends it via UDP (port 53) to the address(es) listed in `/etc/resolv.conf` (or the systemd‑resolved stub at `127.0.0.53`).  
2. **Recursive → Root**: If the answer is not cached, the recursive resolver selects a root server from its *root hints* file (typically `/usr/share/dns/root.hints`). It sends a query for the QNAME with the RD (recursion desired) flag cleared (iterative query).  
3. **Root → Referral**: The root server responds with a referral: the Authority section contains NS records for the TLD (e.g., `.com`), and the Additional section may contain glue A/AAAA records for those NS hosts.  
4. **Recursive → TLD**: The resolver queries one of the TLD NS servers for the next label (e.g., `example.com`). The TLD replies with a referral to the authoritative NS for `example.com`.  
5. **Recursive → Authoritative**: Finally, the resolver queries the authoritative NS for `example.com`. If the zone contains the requested RR, the response carries the AA bit and the answer in the Answer section.  
6. **Cache Update**: The resolver stores each RR received (Answer, Authority, Additional) with a timestamp. The effective TTL for caching is `min(original TTL, elapsed time since receipt)`.  

### Timing and Retransmission
DNS primarily uses UDP because a single query/response typically fits within one packet. However, if the response exceeds the UDP payload limit (default 512 bytes, extensible via EDNS0 to 4096 bytes), the resolver sets the TC (truncated) flag and retries over TCP.  

Let $RTT_n$ be the measured round‑trip time for query $n$. A common estimator is the **exponential weighted moving average**:

$$
\text{SRTT}_{n+1} = (1-\alpha)\,\text{SRTT}_n + \alpha \cdot RTT_n,
\qquad
\text{RTTVAR}_{n+1} = (1-\beta)\,\text{RTTVAR}_n + \beta \cdot |RTT_n - \text{SRTT}_n|
$$

with typical $\alpha = 0.125$, $\beta = 0.25$. The retransmission timeout (RTO) is then

$$
\text{RTO} = \text{SRTT} + 4 \cdot \text{RTTVAR}.
$$

If no response is received within RTO, the resolver retransmits (up to a retry limit) and may try alternative servers or switch to TCP.

### Caching Mathematics
Assume queries for a given name arrive as a Poisson process with rate $\lambda$ (queries/second). The probability that an arriving query finds a *valid* cached entry (i.e., the entry has not expired) is:

$$
P_{\text{hit}} = 1 - e^{-\lambda \cdot \text{TTL}}.
$$

Derivation: the inter‑arrival time $T\sim\text{Exp}(\lambda)$. A hit occurs if $T < \text{TTL}$; thus $P(T<\text{TTL}) = \int_0^{\text{TTL}} \lambda e^{-\lambda t}\,dt = 1 - e^{-\lambda \text{TTL}}$.

For example, with $\lambda = 2$ qps and TTL = 300 s, $P_{\text{hit}} = 1 - e^{-600} \approx 1$, showing why heavily used names benefit greatly from caching. Conversely, a low‑traffic internal name with $\lambda = 0.001$ qps and TTL = 300 s yields $P_{\text{hit}} \approx 0.26$, indicating frequent cache misses.

## Worked Examples
### Example 1: Simple A‑record lookup with timing
```bash
$ time dig +short example.com
93.184.216.34
```
Output shows the IPv4 address. To see the full packet exchange, enable `+trace` and `+stats`:
```bash
$ dig +trace +stats example.com
; <<>> DiG 9.18.12 <<>> +trace +stats example.com
;; global options: +cmd
.			518400	IN	NS	a.root-servers.net.
...
example.com.		300	IN	A	93.184.216.34
;; Query time: 42 msec
;; SERVER: 192.0.2.53#53(192.0.2.53)
;; WHEN: Tue Nov 03 10:15:00 UTC 2025
;; MSG SIZE  rcvd: 112
```
*Interpretation*: The resolver contacted a root server, received a referral to `.com` NS, then to the authoritative NS for `example.com`, and finally obtained the A record. The query time (RTT) was 42 ms; the answer includes a TTL of 300 s.

### Example 2: Caching TTL decrement
First query (fresh cache):
```bash
$ dig +noall +answer example.com
example.com.		300	IN	A	93.184.216.34
```
Second query after 5 s (still cached):
```bash
$ dig +noall +answer example.com
example.com.		295	IN	A	93.184.216.34
```
The TTL decreased by 5 seconds, reflecting the cache’s internal age counter. If we wait beyond 300 s, the resolver will treat the record as expired and issue a new query.

### Example 3: MX record lookup and additional section
```bash
$ dig MX example.com +short
0 ASPMX.L.GOOGLE.com.
5 ALT1.ASPMX.L.GOOGLE.com.
5 ALT2.ASPMX.L.GOOGLE.com.
10 ALT3.ASPMX.L.GOOGLE.com.
10 ALT4.ASPMX.L.GOOGLE.com.
```
To view the full response, including the additional A/AAAA records for those hosts:
```bash
$ dig MX example.com +noall +answer +additional
example.com.		3600	IN	MX	0 ASPMX.L.GOOGLE.com.
example.com.		3600	IN	MX	5 ALT1.ASPMX.L.GOOGLE.com.
example.com.		3600	IN	MX	5 ALT2.ASPMX.L.GOOGLE.com.
example.com.		3600	IN	MX	10 ALT3.ASPMX.L.GOOGLE.com.
example.com.		3600	IN	MX	10 ALT4.ASPMX.L.GOOGLE.com.
ASPMX.L.GOOGLE.com.	3600	IN	A	64.233.160.27
ASPMX.L.GOOGLE.com.	3600	IN	AAAA	2607:f8b0:4006:80b::200e
...
```
The additional section prevents a second round‑trip to resolve the mail host names.

### Example 4: Reverse DNS (PTR) for an IP
```bash
$ dig -x 93.184.216.34 +short
www.example.com.
```
The query name is constructed by reversing the octets and appending `in-addr.arpa.`:
```
34.216.184.93.in-addr.arpa.   IN   PTR   www.example.com.
```
If the zone is not delegated, the response will contain a *referral* to the ISP’s reverse‑zone servers.

## Common Mistakes
| # | Mistake | Why It’s Wrong |
|---|---------|----------------|
| 1 | **“DNS only uses UDP.”** | DNS messages >512 bytes (or >EDNS0‑advertised UDP payload) trigger truncation (TC=1) and a TCP retry. DNSSEC, large TXT records, or zone transfers (AXFR) frequently exceed this limit, making TCP essential. |
| 2 | **“TTL is an exact expiry time.”** | TTL is a *maximum* cache duration. Respectful implementations may discard entries earlier (e.g., due to memory pressure) or serve stale data if `stale-while-revalidate` is configured (RFC 8198). |
| 3 | **“The resolver library (`getaddrinfo`) performs recursion.”** | `getaddrinfo` is a *stub* resolver: it formats a query and sends it to the recursive resolver listed in `/etc/resolv.conf`. Recursion happens only in the external daemon (e.g., `systemd-resolved`, `dnsmasq`, BIND). |
| 4 | **“Negative answers are not cached.”** | Negative caching (NXDOMAIN, NODATA) is explicit in RFC 2308. The SOA’s `MINTTL` field (or the server’s `negcache_policy`) defines how long a negative answer may be stored, preventing repeated queries for non‑existent names. |
| 5 | **“All DNS traffic is port 53.”** | While clients query port 53, servers may send responses from any ephemeral source port (UDP/TCP). Firewalls that only allow incoming traffic to port 53 break DNS because the reply’s source port is not 53. |

## Exercises
### Easy
1. `dig +short A example.com` – verify the IPv4 address.  
2. `dig +short MX example.com` – list mail exchangers.  
3. `dig +short TXT _spf.example.com` – retrieve an SPF record (if present).  

### Medium
4. `dig +trace +stats www.example.com` – measure query time for each delegation level; compute the cumulative RTT.  
5. Use `tcpdump -nn -s0 -l -i any port 53` to capture a DNS exchange, then extract the query ID and compare it with the response ID to confirm matching.  
6. Query a non‑existent name: `dig +short nonexistent.example.com` and note the `STATUS: NXDOMAIN` and the TTL of the SOA in the Authority section.  

### Hard
7. Configure a local caching resolver:  
   ```bash
   sudo apt-get install -y dnsmasq   # or enable systemd-resolved
   sudo systemctl restart dnsmasq
   dig @127.0.0.1 example.com
   ```  
   Then, using `dig @127.0.0.1 example.com +stats`, verify that the query time drops from ~30 ms (remote) to <1 ms (cached) after the first request.  
8. Send a large TXT record (>4 KB) via `dig +bufsize=4096 TXT txt.example.com` and observe the switch to TCP (look for `TCP` in the `;; QUESTION SECTION:` line or use `Wireshark`/`tcpdump` to see the TCP handshake).  
9. Write a small C program that calls `getaddrinfo()` and prints the returned `addrinfo` list; run it against both an IPv4‑only and an IPv6‑only name to see the protocol family selection.  

```c
/* dns_lookup.c */
#include <stdio.h>
#include <stdlib.h>
#include <netdb.h>
#include <arpa/inet.h>

int main(int argc, char *argv[]) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <hostname>\n", argv[0]);
        return 1;
    }
    struct addrinfo hints = {0}, *res, *p;
    hints.ai_family   = AF_UNSPEC;    // IPv4 or IPv6
    hints.ai_socktype = SOCK_STREAM;
    int s = getaddrinfo(argv[1], NULL, &hints, &res);
    if (s != 0) {
        fprintf(stderr, "getaddrinfo: %s\n", gai_strerror(s));
        return 2;
    }
    for (p = res; p != NULL; p = p->ai_next) {
        char ip[INET6_ADDRSTRLEN];
        void *addr;
        if (p->ai_family == AF_INET) {
            struct sockaddr_in *ipv4 = (struct sockaddr_in *)p->ai_addr;
            addr = &(ipv4->sin_addr);
        } else {
            struct sockaddr_in6 *ipv6 = (struct sockaddr_in6 *)p->ai_addr;
            addr = &(ipv6->sin6_addr);
        }
        inet_ntop(p->ai_family, addr, ip, sizeof ip);
        printf("%s\n", ip);
    }
    freeaddrinfo(res);
    return 0;
}
```
Compile with `gcc -Wall dns_lookup.c -o dns_lookup` and run `./dns_lookup example.com`.

## Linux Connection
### Resolver Stack
| Layer | Component | Configuration / Path | Role |
|-------|-----------|----------------------|------|
| Application | `glibc` resolver (`getaddrinfo`, `gethostbyname`) | – | Stub resolver; builds DNS packet, sends to nameservers from `/etc/resolv.conf`. |
| Daemon | `systemd-resolved` | `/run/systemd/resolve/resolv.conf` (symlinked from `/etc/resolv.conf` when active) | Provides DBus API (`org.freedesktop.resolve1.Resolve2`), DNSSEC validation, LLMNR/mDNS, and a local caching stub at `127.0.0.53`. |
| Daemon | `dnsmasq` | `/etc/dnsmasq.conf`, `/var/lib/misc/dnsmasq.leases` | Lightweight DNS forwarder + DHCP; can serve local `/etc/hosts` as DNS. |
| Daemon | `BIND` (`named`) | `/etc/bind/named.conf`, `/var/cache/bind/` | Full authoritative/recursive server; supports DNSSEC, RPZ, AXFR/IXFR. |
| NSS | `/etc/nsswitch.conf` (line `hosts: files dns`) | – | Orders sources: first check `/etc/hosts`, then DNS. |
| Cache | `nscd` (Name Service Cache Daemon) | `/etc/nscd.conf` | Caches NSS lookups (including `hosts`) for the lifetime defined by `positive-time-to-live` and `negative-time-to-live`. |

### Practical Commands
```bash
# View current stub resolver configuration
resolvectl status

# Query via systemd-resolved's stub (uses DBus internally)
resolvectl query example.com

# Force use of UDP only (disable EDNS0)
dig +nocookie +noedns example.com

# Show the glibc resolver's current state (including nscd)
getsockopt $(pidof nscd) SOL_SOCKET SO_KEEPALIVE  # illustrative; actual inspection via /proc/<pid>/fd

# Flush nscd host cache
sudo nscd -i hosts

# Check if systemd-resolved is doing DNSSEC validation
resolvectl show-example.com | grep DNSSEC
```

### Example: Using `getaddrinfo` from a container
```bash
# Inside a minimal Alpine container
apk add --no-cache bind-tools  # provides dig, but we test glibc directly
cat > test.c <<'EOF'
#include <stdio.h>
#include <netdb.h>
#include <arpa/inet.h>
int main() {
    struct addrinfo hints = {0}, *res;
    hints.ai_family = AF_UNSPEC;
    getaddrinfo("www.google.com", NULL, &hints, &res);
    for (struct addrinfo *p = res; p; p = p->ai_next) {
        char ip[INET6_MAX];
        void *addr;
        if (p->ai_family == AF_INET) {
            addr = &((struct sockaddr_in *)p->ai_addr)->sin_addr;
        } else {
            addr = &((struct sockaddr_in6 *)p->ai_addr)->sin6_addr;
        }
        inet_ntop(p->ai_family, addr, ip, sizeof ip);
        puts(ip);
    }
    freeaddrinfo(res);
}
EOF
gcc -static test.c -o test
./test
```
The static build shows that the glibc resolver performs the DNS exchange without any external daemon (it reads `/etc/resolv.conf` and contacts the nameservers directly via UDP/TCP).

### Kernel‑level Interaction
The Linux kernel does **not** implement DNS protocol logic; it merely provides socket APIs. However, the kernel’s **UDP/GSO** and **TCP fast‑open** features affect DNS performance. One can tune the UDP receive socket buffer to reduce packet loss under high query rates:
```bash
# Increase UDP receive buffer (default often too small)
sudo sysctl -w net.core.rmem_max=2500000
sudo sysctl -w net.core.rmem_default=2500000
```

## Why This Matters
Understanding DNS is not academic; it directly influences the reliability, latency, and security of every networked service:

* **Performance** – Proper TTL tuning and caching (e.g., via `systemd-resolved`’s `Cache=` or a local `dnsmasq`) can cut average name‑resolution latency from tens of milliseconds to sub‑millisecond, dramatically improving page‑load times and API call throughput.  
* **Scalability** – Hierarchical delegation lets organizations manage millions of names without a central bottleneck; cloud providers rely on this to serve global CDN endpoints.  
* **Security** – DNS amplification attacks exploit the UDP‑only, small‑query/large‑response pattern; knowing when TCP is forced (large payloads, DNSSEC) helps design appropriate firewall rules. DNSSEC validation, performed by `systemd-resolved` or BIND, mitigates cache‑poisoning by verifying RRSIG chains.  
* **Observability** – Tools like `dig +trace`, `dnstop`, and `systemd-resolved`'s journal expose where resolution stalls (e.g., a lame delegation or a mis‑configured forwarder).  
* **Integration** – Modern orchestration platforms (Kubernetes CoreDNS, Consul, Envoy) treat DNS as a dynamic service‑discovery substrate; grasping the underlying RR types (SRV, TXT, NAPTR) enables correct configuration of service mesh and load‑balancing policies.  
* **Programming** – Knowing the exact behavior of `getaddrinfo` (AI_ADDRCONFIG, AI_V4MAPPED, AI_ALL) prevents subtle bugs when applications run in dual‑stack environments or containers with overridden `/etc/resolv.conf`.

By mastering the protocol’s mechanics, the Linux implementation details, and the operational trade‑offs, you can design systems that resolve names swiftly, securely, and at scale.
