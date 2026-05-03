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

## Why This Matters

Every network connection starts with name resolution, and the kernel cannot route a packet to a name — only to an IP address. Before 1983, the entire internet shared a single `HOSTS.TXT` file maintained by SRI International, distributed via FTP, and updated by hand. DNS replaced that with a distributed, hierarchical, cacheable database precisely because centralized distribution cannot scale: update latency, single-point-of-failure, and administrative bottleneck all become fatal at internet scale.

When DNS breaks, applications stall at connection setup because `getaddrinfo(3)` blocks synchronously by default — your process is stuck in the resolver library waiting for a UDP response that may never come. TLS handshakes fail because certificate validation requires resolving OCSP responder hostnames. Email bounces because SMTP agents cannot look up MX records. Service meshes fall apart because health check endpoints cannot be reached. The network itself is healthy throughout. Knowing DNS at the wire level means you can distinguish "DNS is slow" from "DNS is returning wrong answers" from "DNS is not being consulted at all" — three entirely different failure modes with entirely different fixes.

---

## Core Concepts

### The Hierarchy and Delegation

DNS is a tree rooted at `.`. The root delegates to top-level domains (`.com`, `.org`, `.uk`), which delegate to second-level domains (`github.com`), and so on. Each node is managed by an **authoritative nameserver** — a server that holds the actual records for that zone and sets the AA (Authoritative Answer) bit in responses. The hierarchy exists because no single server can hold all records, serve all queries, or be trusted by all parties.

Delegation is the operational mechanism. A parent zone encodes delegation in **NS records**: "for `github.com`, ask `ns1.p16.dynect.net`." The parent also includes **glue records** — A/AAAA records for those nameservers — in the Additional section of its response. Without glue, reaching `ns1.p16.dynect.net` would require resolving `dynect.net` first, which might require `ns1.p16.dynect.net`, creating a bootstrapping cycle.

### Resource Records

Everything in DNS is a **Resource Record (RR)**. The wire format is:

```
Name    TTL     Class   Type    RDLENGTH    RDATA
```

- **Name**: owner of this record, encoded as a label sequence (see below)
- **TTL**: seconds this record may be cached; after expiry, it must be re-queried
- **Class**: `IN` (1) for all practical purposes; `CH` (3) and `HS` (4) are historical
- **Type**: determines how RDATA is parsed
- **RDLENGTH**: byte count of RDATA field
- **RDATA**: type-dependent payload

An **RRSet** is the set of all RRs sharing the same Name, Class, and Type. An RRSet is the atomic unit of DNS — you cannot return half of one, and TTLs within an RRSet must be identical (RFC 2181 §5.2).

Key record types:

| Type | Code | RDATA |
|------|------|-------|
| A | 1 | 32-bit IPv4 address |
| AAAA | 28 | 128-bit IPv6 address |
| NS | 2 | Authoritative nameserver hostname |
| MX | 15 | 16-bit preference + mail exchanger hostname |
| CNAME | 5 | Canonical name (alias target) |
| PTR | 12 | Reverse lookup: IP → name |
| SOA | 6 | Zone authority metadata + negative-cache TTL |
| TXT | 16 | Arbitrary octet strings (SPF, DKIM, ACME challenges) |

### TTL and Caching

TTL is a contract between zone operator and the caching internet. When a recursive resolver stores a record, it starts decrementing the TTL immediately. A client that hits a warm cache sees the **remaining** TTL, not the original. If the authoritative server advertises TTL $T_0$ and the resolver cached it $\Delta t$ seconds ago, the client observes:

$$T_{\text{client}} = T_0 - \Delta t$$

This is why `dig` against your local resolver may show TTL 47 while `dig @8.8.8.8` shows TTL 212 — different resolvers cached the record at different times.

Setting TTL too low forces every client to query frequently. If $q$ is the query rate (queries/second) and $N$ is the number of clients behind a resolver, the authoritative server load scales as $q \propto N / T_0$ as TTL decreases. Setting TTL too high means stale answers persist after IP changes. The engineering tradeoff is most visible during failover: operators typically lower TTL to 60 seconds hours before a planned migration, wait for the old high TTL to expire everywhere, perform the cutover, then restore the TTL.

The SOA record's `MINIMUM` field (last field in SOA RDATA) sets the **negative cache TTL** — how long resolvers cache NXDOMAIN and NODATA responses (RFC 2308). This is frequently misconfigured and causes extended outages when records are added: clients cache the NXDOMAIN for the full negative TTL and do not re-query.

### Recursive vs. Stub Resolvers

A **stub resolver** is the code inside `glibc` that your application calls via `getaddrinfo(3)` or `res_query(3)`. It does almost no DNS work — it reads `/etc/resolv.conf` for a recursive resolver address and forwards the query there, setting the RD (Recursion Desired) flag. It has no cache of its own (unless `nscd` or `systemd-resolved` is intercepting).

A **recursive resolver** (also called a full-service resolver or caching resolver) traverses the DNS tree, caches results, and returns the final answer. It is the entity that actually contacts root servers, TLD servers, and authoritative servers. Your system's configured resolver is typically either your router (which forwards upstream), an ISP resolver, a public resolver like `8.8.8.8`, or a local daemon like `systemd-resolved` (listening on `127.0.0.53`).

An **authoritative nameserver** answers only for zones it is configured to serve. It does not recurse. It does not cache. When you see AA=1 in a response, you are talking to an authoritative server.

### MX Records and Preference

MX RDATA is a 16-bit preference value followed by a hostname. Lower preference = higher priority. A sending MTA queries MX records, sorts ascending by preference, and attempts delivery in order. Multiple MX records provide redundancy — if the lowest-preference exchanger is unreachable, the sender tries the next. Equal-preference MX records are tried in random order.

```
example.com.  3600  IN  MX  10  mail1.example.com.
example.com.  3600  IN  MX  10  mail2.example.com.
example.com.  3600  IN  MX  20  mail-backup.example.com.
```

Here `mail1` and `mail2` are tried in random order (equal preference), and `mail-backup` is only used if both fail.

---

## How It Works

### Recursive Resolution: Step by Step

When you run `ssh user@api.example.com` with no cached answer:

```
application
  → getaddrinfo("api.example.com") in glibc
    → stub resolver reads /etc/resolv.conf, sends UDP query to recursive resolver
      → recursive resolver checks its cache: miss
        → queries root servers: "api.example.com, type A?"
          ← referral: "ask .com TLD servers at [addresses]"
        → queries .com TLD servers
          ← referral: "ask example.com NS servers at [addresses]" + glue records
        → queries example.com authoritative server
          ← answer: api.example.com A 93.184.216.34, TTL 3600, AA=1
      ← recursive resolver caches answer, returns to stub with TTL 3600
    ← stub returns to getaddrinfo
  ← getaddrinfo returns struct addrinfo* to application
```

Each referral is not a redirect — the recursive resolver makes each hop itself, on behalf of the client. The client makes exactly one query and blocks until the recursion completes.

The total latency is bounded by:

$$t_{\text{total}} \approx \sum_{i=1}^{k} \text{RTT}_i$$

where $k$ is the number of delegation steps and each $\text{RTT}_i$ is the round-trip to that tier's server. In practice, root and TLD servers are anycast and widely distributed, so $k=3$ with typical RTTs of 5–30 ms per hop. A cold resolution from scratch takes 20–100 ms; a warm cache hit takes < 1 ms.

### Wire Format of a DNS Message

DNS messages use UDP port 53 (with fallback to TCP when responses exceed 512 bytes, or always with DNS-over-TCP/DoT/DoH). Every message — query and response — uses the same 12-byte header:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|           Transaction ID      |QR|Opcode |AA|TC|RD|RA| Z|RCODE|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|            QDCOUNT            |           ANCOUNT             |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|            NSCOUNT            |           ARCOUNT             |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

Flag breakdown (second
