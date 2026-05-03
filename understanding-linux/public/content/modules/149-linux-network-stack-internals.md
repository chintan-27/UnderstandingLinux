---
id: 149
title: "Linux network stack internals"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Why This Matters

When a packet arrives at a NIC, the kernel must transform raw bytes into data your application can `read()` — and when you call `send()`, it must do the reverse. The naive approach — each layer allocates its own buffer and copies the relevant portion — would make networking $O(n)$ in the number of layers per byte transmitted. Linux avoids this by separating the *control structure* (`sk_buff`) from the *data buffer* it describes. Layers manipulate header pointers, not bytes. Understanding this path explains why `tcp_wmem` tuning changes throughput, why packets are dropped under softirq load, and how `tcpdump` intercepts traffic without disrupting the stack.

---

## Core Concepts

### `sk_buff`: The Packet Carrier

Every in-flight packet in the Linux kernel is described by a `struct sk_buff` (socket buffer, universally abbreviated `skb`). It is a control structure that *points to* packet data rather than containing it, plus metadata: which interface received the packet, which socket owns it, protocol header offsets, queue linkage, and checksum state.

The critical property: as a packet moves up the receive path (driver → IP → TCP), **no payload bytes are copied**. Header pointers (`network_header`, `transport_header`, `mac_header`) are offsets into the same underlying buffer. Moving down the transmit path, headers are *prepended* into reserved headroom — again without copying. Each header add/remove operation is $O(1)$ regardless of payload size.

### Socket Receive and Send Buffers

Each TCP socket has two kernel-managed byte-count limits:

- **`sk_rcvbuf`**: Maximum bytes the kernel will buffer for data received but not yet consumed by `read()`. Controlled by `net.ipv4.tcp_rmem`.
- **`sk_sndbuf`**: Maximum bytes the kernel will buffer for data passed to `send()` but not yet acknowledged by the peer. Controlled by `net.ipv4.tcp_wmem`.

These limits directly gate throughput on high-latency links. To keep a pipe fully utilized, enough data must be in flight to cover the round-trip time while waiting for ACKs. The minimum buffer needed is the bandwidth-delay product:

$$BDP = \text{bandwidth (bytes/s)} \times RTT \text{ (s)}$$

For a 10 Gbps link with 50 ms RTT:

$$BDP = \frac{10 \times 10^9}{8} \times 0.05 = 62{,}500{,}000 \text{ bytes} \approx 60 \text{ MB}$$

If `sk_sndbuf` is smaller than the BDP, `send()` will block or return short before the pipe is saturated — the sender stalls waiting for ACKs before it can inject more data. Linux auto-tunes buffer sizes at runtime up to `tcp_wmem[2]` / `tcp_rmem[2]`, which default to 4–6 MB — far below what a 10 Gbps long-haul path requires. This is the most common reason bulk transfer benchmarks underperform on fast, high-latency networks.

### The Receive Path

When a NIC receives a frame:

1. **Driver** allocates an `sk_buff`, maps frame data into it (via DMA or copy depending on driver), and calls `netif_receive_skb()`. NAPI drivers batch this to reduce interrupt overhead.
2. **`net_rx_action`** (softirq `NET_RX_SOFTIRQ`) drains the per-CPU input queue and dispatches each `sk_buff` to the appropriate `packet_type` handler.
3. **`ip_rcv()`** (`net/ipv4/ip_input.c`) validates the IP header checksum, trims any Ethernet padding, sets `network_header`, and passes the `sk_buff` through the Netfilter `PREROUTING` hook.
4. **`ip_local_deliver()`** calls `tcp_v4_rcv()` or `udp_rcv()` based on the IP protocol field.
5. For TCP, `tcp_v4_rcv()` finds the owning socket, runs the TCP state machine, and enqueues data onto `sk->sk_receive_queue`. The application's `read()` drains that queue.

If the socket's receive queue is full (bytes enqueued ≥ `sk_rcvbuf`), the kernel drops the segment and relies on TCP retransmit — it does not block the softirq. You can observe this with `ss -tm` (the `Recv-Q` column) or `/proc/net/sockstat`.

### The Transmit Path

1. Application calls `send()` → `tcp_sendmsg()` copies data into `sk_buff`s and accounts against `sk_sndbuf`. If the buffer is full, `send()` blocks (or returns `EAGAIN` if `O_NONBLOCK`).
2. `tcp_write_xmit()` applies windowing, congestion control, and Nagle's algorithm to decide what to send now. Unsent `sk_buff`s wait in `sk->sk_write_queue`.
3. **`ip_queue_xmit()`** (`net/ipv4/ip_output.c`) prepends the IP header, performs a routing lookup, and passes through the Netfilter `OUTPUT` hook.
4. **`dev_queue_xmit()`** enqueues the `sk_buff` into the device's traffic control queue (`qdisc`). The default is `pfifo_fast`; `tc` commands configure alternatives.
5. The driver's `ndo_start_xmit()` dequeues from the `qdisc` and hands the frame to the NIC.

Sent-but-unacknowledged `sk_buff`s are held in the **retransmit queue** (`sk->sk_write_queue` minus what TCP has moved past). They are freed only when the ACK covers their sequence range.

### Routing Lookup

Before an outgoing packet can leave the IP layer, the kernel performs a FIB (Forwarding Information Base) lookup to determine: which output interface, and what next-hop address. The result is a `struct rtable` (a resolved route cache entry) that is attached to the `sk_buff` via `skb_dst_set()`. The next-hop IP is then resolved to a MAC address via ARP (stored in the neighbor subsystem, `struct neighbour`). Routing tables live in `/proc/net/fib_trie` and are inspectable with `ip route`.

---

## How It Works

### `sk_buff` Memory Layout

```c
struct sk_buff {
    /* intrusive doubly-linked list for queues */
    struct sk_buff      *next;
    struct sk_buff      *prev;

    struct sock         *sk;       /* owning socket, NULL for forwarded packets */
    struct net_device   *dev;      /* interface this skb arrived on / will leave via */

    unsigned int        len;       /* total data length (linear + paged fragments) */
    unsigned int        data_len;  /* bytes in page fragments (non-linear portion) */

    /* header offsets — relative to head, not absolute pointers */
    sk_buff_data_t      transport_header;
    sk_buff_data_t      network_header;
    sk_buff_data_t      mac_header;

    /* buffer boundaries */
    unsigned char       *head;     /* start of allocated buffer */
    unsigned char       *data;     /* first byte visible to the current layer */
    sk_buff_data_t      tail;      /* one past the last data byte */
    sk_buff_data_t      end;       /* one past the allocated buffer */

    /* ... timestamps, GSO/GRO state, checksum fields, priority marks, etc. */
};
```

The memory regions and their purposes:

```
head                data               tail              end
 |<-- headroom -------->|<-- payload -->|<-- tailroom -->|
```

- **Headroom** (`data - head`): Reserved space for prepending headers on transmit. Drivers and `alloc_skb()` callers specify headroom at allocation time via `skb_reserve()`.
- **Payload** (`data` to `tail`): Bytes visible to the current layer.
- **Tailroom** (`end - tail`): Space for appending data (e.g., trailers, padding).

The headroom needed for a typical outgoing packet:

$$\text{headroom} \geq \text{sizeof(ethhdr)} + \text{sizeof(iphdr)} + \text{sizeof(tcphdr)} = 14 + 20 + 20 = 54 \text{ bytes}$$

Drivers typically reserve `NET_SKB_PAD + NET_IP_ALIGN` bytes beyond this to ensure DMA alignment.

### Pointer Manipulation: No-Copy Header Operations

Adding an IP header to an outgoing `sk_buff`:

```c
/* moves skb->data backward by sizeof(struct iphdr) bytes into headroom */
struct iphdr *iph = (struct iphdr *)skb_push(skb, sizeof(struct iphdr));
skb_reset_network_header(skb);   /* network_header = data - head */

iph->version  = 4;
iph->ihl      = 5;
iph->tot_len  = htons(skb->len);
iph->protocol = IPPROTO_TCP;
/* ... fill remaining fields ... */
```

`skb_push()` is simply:

```c
skb->data -= len;
skb->len  += len;
return skb->data;
```

Consuming the IP header on the receive path:

```c
/* ip_rcv() has validated the header; hand off to transport layer */
skb_pull(skb, ip_hdrlen(skb));    /* data += ip_hdrlen; len -= ip_hdrlen */
skb_reset_transport_header(skb);  /* transport_header = data - head */
```

The IP header bytes still exist between `head` and the new `data`. They are accessible via `ip_hdr(skb)` — which returns `head + network_header` — at any point. Nothing is overwritten or zeroed.

### The Sliding Window and Buffer Sizing

TCP's instantaneous usable send window is:
