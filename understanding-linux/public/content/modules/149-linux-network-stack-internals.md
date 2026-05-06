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

## Core Concepts
### sk_buff Structure – the packet’s in‑kernel representation  
The `struct sk_buff` (SKB) is not a generic buffer; it is a carefully laid‑out, reference‑counted descriptor that enables zero‑copy processing, checksum offload, and scatter‑gather I/O. Its layout (simplified) is:

```c
/* include/linux/skbuff.h */
struct sk_buff {
    /* These two members must be first. */
    struct sk_buff *next;
    struct sk_buff *prev;

    union {
        struct {
            /* These two members must be first in this union. */
            struct net_device *dev;
            unsigned long   _skb_refdst;
        };
        struct {
            unsigned long   _skb_refdst;
            union {
                struct net_device *dev;
                void               *rbnode;   /* used in UDP gro */
            };
        };
    };

    /* Packet data area */
    unsigned char *head;   /* start of allocated buffer */
    unsigned char *data;   /* start of used data   */
    unsigned char *tail;   /* end of used data     */
    unsigned char *end;    /* end of allocated buffer */
    unsigned int   len;    /* data length */
    unsigned int   data_len;/* length of non‑linear (frag) part */
    __u16          mac_len;/* length of MAC header */
    __u16          hdr_len;/* writable header length */
    __u16          clone;  /* clone count */
    __u32          users;  /* reference count */
    /* … many more fields for checksum, offload, timestamps, etc. … */
};
```

*Why this layout?*  
- `head` … `end` describe the **owned** memory region allocated by the slab allocator (`kmalloc`/`__alloc_skb`).  
- `data` points to the first byte of the packet payload; `headroom = data - head` is reserved for protocol headers that may be pushed later (`skb_push`).  
- `tail` points just past the last used byte; `tailroom = end - tail` is space for pulling data (`skb_pull`) or appending (`skb_put`).  
- When a packet needs more space than `tailroom` provides, the SKB can reference **fragments** (`skb_shinfo(skb)->frags[]`), each a page‑sized fragment, enabling zero‑copy scatter‑gather for Jumbo frames or GSO/GRO.  
- Reference counting (`users`) allows the same SKB to be queued on multiple consumer queues (e.g., netfilter, tc, socket receive queue) without copying.  
- The `dev` pointer back‑references the net_device that received or will transmit the packet, letting the stack demultiplex to the correct driver without extra look‑ups.

### Receive Path – from wire to socket  
1. **DMA reception** – NIC writes Ethernet frame into a pre‑allocated ring descriptor; hardware raises an interrupt (or NAPI poll).  
2. **NAPI poll** – driver’s `poll()` fetches one or more descriptors, **dma_unmap_single**, and calls `netif_receive_skb(skb)`.  
3. **SKB allocation** – driver either reuses the SKB attached to the descriptor (if using `SKB_ALLOC_RX`) or allocates a new one with `alloc_skb(size, GFP_ATOMIC)`. The driver sets `skb->head`, `skb->data`, `skb->tail`, `skb->end` to match the DMA buffer and fills `skb->len`.  
4. **Header extraction** – `skb->data` points to the start of the Ethernet header; the driver sets `skb->mac_header = skb->data` and `skb->protocol = eth_type_trans(skb, dev)`.  
5. **Netfilter PRE_ROUTING hook** – `nf_hook(NF_INET_PRE_ROUTING, …)` may modify the packet (e.g., NAT).  
6. **Routing lookup** – `ip_rcv` calls `fib_lookup(&net->ipv4.fib_table, …)` to obtain the output `net_device` and neighbour. The result is stored in `skb->dst`.  
7. **Netfilter LOCAL_IN hook** – `nf_hook(NF_INET_LOCAL_IN, …)` decides whether the packet is for a local socket or to be forwarded.  
8. **Socket demultiplex** – `inet_rcv_sock` looks up the listening socket via the TCP/UDP hash tables (`inet_hashinfo`). If a match is found, the SKB is queued to the socket’s receive queue (`skb_queue_tail(&sk->sk_receive_queue, skb)`); otherwise it is forwarded or dropped.

### Transmit Path – from socket to wire  
1. **Application send** – `sendmsg()` eventually calls `sock_sendmsg()` → `inet_sendmsg()` → `__udp_sendmsg()` or `tcp_sendmsg()`.  
2. **SKB allocation** – `sock_alloc_send_skb(skb, size, nonblock, &alloc)` reserves headroom (`skb_reserve(skb, LL_RESERVED_SPACE(dev))`) and tailroom for possible fragmentation.  
3. **Data copy** – `skb_put(skb, n)` advances `tail` and `len`; the caller copies payload into `skb->data` via `memcpy_fromiovec` or `skb_copy_from_iovec`.  
4. **Protocol headers** – transport layer pushes its header (`skb_push(skb, tcp_hdr_len)`) and fills fields (seq, ack, checksum).  
5. **Netfilter LOCAL_OUT hook** – `nf_hook(NF_INET_LOCAL_OUT, …)` may alter the packet (e.g., OUTNAT).  
6. **Routing lookup** – `__ip_local_out` calls `fib_lookup` to decide the outgoing `net_device` and neighbour; the result is cached in `skb->dst`.  
7. **Traffic control (TC) enqueue** – `dev_queue_xmit(skb)` puts the SKB onto the device’s qdisc (`sch_direct_xmit` or `qdisc_enqueue`). The qdisc may split, delay, or reorder packets (e.g., HFSC, fq_codel).  
8. **Driver transmit** – `dev_hard_start_xmit(skb, dev)` invokes the NDIS `net_device_ops->ndo_start_xmit`. The driver maps the SKB for DMA (`dma_map_single`), fills a descriptor, and kicks the NIC.  
9. **Completion** – NIC signals transmit complete via interrupt or poll; driver `dma_unmap_single` and consumes the SKB (`dev_consume_skb_irq(skb)` or `kfree_skb(skb)`).  

### Routing Lookup – longest‑prefix match in a trie  
IPv4 routing uses a **binary trie** (Patricia/FIB) stored in `struct fib_table`. Lookup complexity is **O(W)** where *W* = address width (32 bits), but path compression makes average steps ≈ number of hops in the trie (typically < 8 for a full table).  

Key functions:  
```c
int fib_lookup(struct net *net, struct flowi4 *flp,
               struct fib_result *res, unsigned int flags);
```
- `flp->daddr` holds the destination IP.  
- The walk starts at the root node (`fib_table->tb_id == RT_TABLE_MAIN`).  
- At each level, the corresponding bit of the address selects left/right child; if a node contains a `fib_nh` (next hop) it is a candidate route.  
- The most specific match (deepest node with a valid `fib_nh`) is returned in `res->prefixlen` and `res->fi`.  

For IPv6, a **radix tree** (`struct rt6_info`) is used; lookup is similarly O(128) worst‑case but heavily compressed.

### Socket Buffers – queueing mechanism  
The kernel re‑uses the same `struct sk_buff` for socket queues. Two fundamental queue types exist:

```c
struct sk_buff_head {
    struct sk_buff *next;
    struct sk_buff *prev;
    __u32           qlen;
    spinlock_t      lock;
};
```

- **Receive queue** (`sk->sk_receive_queue`) holds packets that have been accepted by the stack but not yet read by the application.  
- **Write queue** (`sk->sk_write_queue`) holds packets awaiting transmission (used by TCP for retransmission, by UDP for UDP‑SEGMENT offload).  

Operations are lock‑protected (`spin_lock_bh(&list->lock)`) for SMP safety, but the lock is held only for the short enqueue/dequeue critical section; the bulk of packet processing runs lock‑free in softirq context.

---

## How It Works
The Linux network stack is a **pipeline** where each stage performs a well‑defined transformation on an `skb`. The pipeline is driven by **softirqs** (`NET_RX_SOFTIRQ` and `NET_TX_SOFTIRQ`) to avoid blocking hardware interrupt handlers.

### Packet Flow Diagram (simplified)

```
NIC DMA --> netif_rx() --> __netif_receive_skb()
        --> netfilter PRE_ROUTING
        --> ip_rcv() --> fib_lookup()
        --> netfilter LOCAL_IN
        --> { local socket ? inet_rcv_sock() : ip_forward() }
        --> (if local) skb_queue_tail(&sk->sk_receive_queue)
        --> application recvmsg()
```

```
application sendmsg()
        --> inet_sendmsg()
        --> sock_alloc_send_skb()
        --> transport header push
        --> netfilter LOCAL_OUT
        --> __ip_local_out() --> fib_lookup()
        --> traffic control (qdisc_enqueue)
        --> dev_queue_xmit()
        --> driver ndo_start_xmit()
        --> NIC DMA
```

**Why softirqs?**  
Hardware interrupts must finish quickly (< 10 µs). Offloading the bulk of SKB handling to softirq allows the CPU to service other interrupts and keeps interrupt latency bounded. The NAPI policy (`weight`) limits the amount of work per softirq invocation to prevent starvation.

### Memory Overhead Calculation  
For a standard Ethernet MTU of 1500 bytes:

- Allocation size (`alloc_skb`) = `SKB_DATA_ALIGN(sizeof(struct sk_buff)) + LL_RESERVED_SPACE(dev) + MTU + TRAILER`.  
- `SKB_DATA_ALIGN` rounds up to the nearest word (typically 8 bytes on 64‑bit).  
- `LL_RESERVED_SPACE(dev)` = `NET_IP_ALIGN` (2) + `dev->hard_header_len` (14) + `dev->needed_headroom` (often 0 for Ethernet).  
- Typical allocation: `sizeof(struct sk_buff) ≈ 224` → aligned 224; `LL_RESERVED_SPACE ≈ 16`; MTU=1500; TRAILER=0 → **≈1740 bytes**.  
- The slab allocator rounds up to the next power‑of‑two kmem cache size (2 KB), so each SKB consumes **2 KB** of kernel memory, regardless of actual payload size. This explains why high‑packet‑rate workloads (e.g., 10 Gbps with 64‑byte packets) can consume several gigabytes of SKB memory.

### Checksum Offload – mathematical basis  
The Internet checksum is the **one’s complement** of the one’s complement sum of 16‑bit words:

```
C = ~( Σ_{i=0}^{n-1} w_i )   (mod 2^16)
```

Where `w_i` are 16‑bit words; if the payload length is odd, a padding zero byte is added.  
Hardware can compute `Σ w_i` directly from the DMA buffer; the kernel only needs to adjust for any pseudo‑header (IP src/dst, protocol, length) that is not covered by the NIC.  
If the NIC reports `CHECKSUM_UNNECESSARY`, the kernel trusts the hardware and skips the software sum, saving ~200 ns per packet on a modern Xeon.

---

## Worked Examples
### Example 1: Ethernet Frame Reception (1500‑byte TCP packet)
**Given**  
- NIC: Intel I210, MTU=1500, NAPI weight=64.  
- Received frame: Ethernet II, src=00:11:22:33:44:55, dst=66:77:88:99:aa:bb, EtherType=0x0800 (IPv4).  
- IPv4 header: src=10.0.0.5, dst=10.0.0.20, protocol=TCP (6), total length=1500.  
- TCP header: srcport=54321, dstport=80, seq=12345678, ack=0, flags=SYN, window=14600.

**Step‑by‑step**

| Step | Action | Kernel function / data change | Reason |
|------|--------|------------------------------|--------|
| 1 | NIC DMA writes frame into Rx ring descriptor `rx_desc[3]`. | `dma_unmap_addr(rx_desc, addr) = phys_addr_of_skb->head` | Zero‑copy: NIC owns the buffer. |
| 2 | NIC asserts interrupt → NAPI scheduled. | `napi_schedule(&dev->napi)` | Defer heavy work to softirq. |
| 3 | NAPI poll (`igc_poll`) extracts up to 64 descriptors. | `skb = napi_get_frags(&dev->napi);` | `napi_get_frags` returns an SKB pointing at the DMA buffer (`skb->head = virtual_addr`). |
| 4 | Driver sets pointers: `skb->data = skb->head + NET_IP_ALIGN (2)`; `skb->tail = skb->data + eth_hdr_len + ip_hdr_len + tcp_hdr_len + payload_len`. | `skb_reset_mac_header(skb); skb_set_network_header(skb, skb->data - skb->head); skb_set_transport_header(skb, skb->network_header + sizeof(struct iphdr));` | Offsets enable later header pushes/pulls without copying. |
| 5 | `netif_receive_skb(skb)` → `__netif_receive_skb(skb)`. | Calls `ptype_head` handlers (e.g., `eth_type_trans`). | Determines L3 protocol (`skb->protocol = htons(ETH_P_IP)`). |
| 6 | Netfilter PRE_ROUTING: `nf_hook(NF_INET_PRE_ROUTING, ...)`. | May alter `skb->dst` (DNAT) – unchanged in this example. | Allows userspace iptables/nftables to intervene. |
| 7 | `ip_rcv()` → `fib_lookup(&net->ipv4.fib_table, flowi4, &res, 0)`. | Trie walk: bits `[31:0]` of `10.0.0.20` → leaf node with `fib_nh` pointing to `dev=lo` (local). | Longest‑prefix match yields `res->prefixlen=32`, `res->fi->fib_nh=lo`. |
| 8 | Netfilter LOCAL_IN: `nf_hook(NF_INET_LOCAL_IN, ...)`. | Packet accepted for local delivery (`NF_ACCEPT`). | Determines if packet should be forwarded or delivered locally. |
| 9 | `inet_rcv_sock()` performs TCP hash lookup: `inet_lookup_listener(&tcp_hashinfo, ...)` finds listening socket on port 80. | Socket found → `skb_orphan(skb); skb->sk = sk_listener;`. | Associates SKB with the socket that will consume it. |
|10| `skb_queue_tail(&sk->sk_receive_queue, skb)`. | Increments `sk->sk_rcvbuf` usage; wakes any blocked `recvmsg()` via `wake_up_interruptible(&sk->sk_sleep)`. | Packet queued for application. |
|11| Application calls `recvmsg(fd, ...)`. | `skb = skb_dequeue(&sk->sk_receive_queue);` → data copied to user buffer via `skb_copy_datagram_iovec`. | Consumes packet; `kfree_skb(skb)` frees the SKB. |

**Numbers**  
- Headroom reserved: `LL_RESERVED_SPACE = NET_IP_ALIGN (2) + dev->hard_header_len (14) = 16` bytes.  
- Tailroom after allocation: `end - tail = 2048 - (2 + 14 + 20 + 20 + 1460) = 532` bytes (enough for VLAN tagging or TCP options).  
- Processing time (measured with `perf stat -e cycles:u -a sleep 1` on an idle core) ≈ **800 ns** per packet for the receive path (excluding NIC DMA).  

---

### Example 2: TCP SYN Transmission (client → server)
**Given**  
- Application: `connect(fd, (struct sockaddr *)&addr, sizeof(addr))` where `addr.sin_addr = 10.0.0.20`, `addr.sin_port = htons(80)`.  
- Local address: `10.0.0.5`, port `54321`.  

**Step‑by‑step**

| Step | Action | Kernel function / data change | Reason |
|------|--------|------------------------------|--------|
| 1 | `sys_connect()` → `sock_sendmsg()` → `inet_sendmsg()` → `tcp_sendmsg()`. | `tcp_sendmsg()` checks socket state (`TCP_SYN_SENT`). | Initiates active open. |
| 2 | `sock_alloc_send_skb(sk, size, MSG_DONTWAIT, &alloc)` allocates SKB with headroom = `LL_RESERVED_SPACE(dev) + sizeof(struct tcphdr) + sizeof(struct iphdr)`. | For Ethernet: headroom = 16 + 20 + 20 = 56 bytes. | Guarantees space for L2/L3/L4 headers to be pushed later. |
| 3 | `skb_reserve(skb, headroom);` moves `skb->data` forward by 56 bytes. | `skb->data = skb->head + 56`. | Leaves headroom untouched for later `skb_push`. |
| 4 | `skb_put(skb, tcp_hdr_len + payload_len)` advances `tail` and `len`. | No payload (`len=0`) → `skb_put(skb, sizeof(struct tcphdr))`. | Reserves space for TCP header. |
| 5 | TCP fills header: `th->source = htons(54321)`, `th->dest = htons(80)`, `th->seq = htonl(iss)`, `th->doff = 5`, `th->syn = 1`, `th->window = htons(14600)`, checksum = 0 (to be filled). | Header built in SKB data area. | Prepares segment for transmission. |
| 6 | `tcp_v4_send_check(skb, inet->inet_saddr, inet->inet_daddr)` computes pseudo‑header checksum and stores in `th->check`. | Uses `csum_tcpudp_nofold(saddr, daddr, len, IPPROTO_TCP, 0)`. | Offloads checksum to NIC if `dev->features & NETIF_F_TXCSUM`. |
| 7 | Netfilter LOCAL_OUT: `nf_hook(NF_INET_LOCAL_OUT, ...)`. | Packet unchanged (`NF_ACCEPT`). | Allows OUTNAT/mangle. |
| 8 | `__ip_local_out()` calls `fib_lookup(&net->ipv4.fib_table, flowi4, &res, 0)`. | Lookup yields output `dev=eth0`, neighbour `10.0.0.1` (gateway). | Determines egress interface and next‑hop MAC. |
| 9 | `dst_neigh_output(dst, skb)` → ` neigh->output(neigh, skb)` (usually `dev_queue_xmit`). | Calls `dev_queue_xmit(skb)`. | Hands SKB to traffic control layer. |
|10| `qdisc_enqueue(root, skb)` (default `pfifo_fast`). | If queue length < `txqueuelen`, SKB is appended; else it may be dropped. | Implements shaping/policing. |
|11| `dev_hard_start_xmit(skb, dev)` → driver’s `ndo_start_xmit`. | Driver maps SKB for DMA: `dma_map_single(dev, skb->data, skb->len, DMA_TO_DEVICE)`. | Prepares NIC for transmission. |
|12| NIC transmits frame; transmit complete interrupt fires. | Driver `igc_tx_cleanup()` → `dma_unmap_single`, `dev_consume_skb_irq(skb)`, `kfree_skb(skb)`. | Releases resources. |

**Timing**  
- SKB allocation (`alloc_skb`) ≈ 150 ns (slab cache hit).  
- Header build + checksum ≈ 200 ns.  
- Fib lookup (trie) ≈ 80 ns (cached in `dst` after first lookup).  
- Qdisc enqueue ≈ 50 ns.  
- Driver mapping + doorbell ≈ 120 ns.  
- Total softirq time ≈ **600 ns** per SYN on a 3 GHz Xeon.  

---

### Example 3: Routing Lookup for Destination 10.0.0.100/24
**Routing table (IPv4)**  
```
default via 192.168.1.1 dev eth0
10.0.0.0/24 dev eth1  proto kernel  scope link  src 10.0.0.1
192.168.1.0/24 dev eth0  proto kernel  scope link  src 192.168.1.2
```
**Lookup procedure** (simplified C‑like pseud
