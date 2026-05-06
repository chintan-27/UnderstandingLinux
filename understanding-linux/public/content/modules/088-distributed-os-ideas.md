---
id: 88
title: "Distributed OS ideas"
supermoduleId: 7
estimatedMinutes: 45
resources:
  - type: book
    title: "Operating Systems Three Easy Pieces (Arpaci-Dusseau)"
  - type: book
    title: "Modern Operating Systems (Tanenbaum)"
---

## Core Concepts
### Introduction to Distributed Systems
A distributed system consists of *n* autonomous nodes connected by a network that cooperate to present a single system image. The cooperation is mediated by *distributed algorithms* that solve problems such as consensus, resource allocation, and fault detection. The primary motivation is to achieve **scalability** (adding nodes increases capacity) and **fault tolerance** (the system continues despite node or link failures) while hiding heterogeneity from users.

### Naming and Location Transparency
* **Naming** assigns a immutable identifier to a resource (file, service, process). In Linux, a file’s *inode number* uniquely identifies it within a filesystem; a service may be identified by a *UUID* or a DNS name.  
* **Location transparency** means the identifier does not encode physical location. Resolution maps the identifier to a node‑specific address (IP:port) via a *name service* (DNS, etcd, Consul).  
* **Why it matters**: If a client hard‑coded an IP address, node replacement would break the system. Transparency allows *rehoming* without client changes.  
* **Resolution cost**: Let *L* be the latency of a name lookup (typically one UDP round‑trip). The total access latency is  
$$T_{access}=L+T_{local}+T_{net}$$  
where *T_local* is local processing and *T_net* is network transfer time.

### Failures and Consistency
*Failure types* (by effect on communication):
| Type          | Symptom                              | Detection mechanism                     |
|---------------|--------------------------------------|------------------------------------------|
| Crash‑stop    | Node stops sending/receiving         | Missing heartbeats (timeout > 2·RTT)    |
| Omission      | Messages lost                        | Retransmission + ACK timeout            |
| Timing        | Message delayed beyond bound         | Adaptive timeout (e.g., TCP retransmission) |
| Byzantine     | Arbitrary (malicious) behavior       | Cryptographic signatures, quorum checks |

*Consistency models* define the ordering guarantees visible to clients:
* **Linearizability (strong)**: each operation appears instantaneously at some point between its invocation and response. Formally, for any two operations *op₁*, *op₂* if *op₁* finishes before *op₂* starts, then *op₁* precedes *op₂* in the total order.  
* **Sequential**: operations of each node appear in program order, but interleaving across nodes is arbitrary.  
* **Causal**: only causally related operations must be ordered; concurrent operations may be seen in any order.  
* **Eventual**: if no new updates, all replicas converge to the same value after an unbounded but finite time.

*Why we need models*: Without explicit guarantees, concurrent updates can diverge (e.g., two clients increment a counter simultaneously → lost update). The model chosen dictates the coordination overhead (e.g., linearizability requires a consensus protocol like Paxos/Raft, adding ≈2·RTT per operation).

## How It Works
### Distributed Shared Memory (DSM)
DSM provides the illusion of a single address space across nodes. The implementation relies on the MMU: each node maps pages with read‑only or invalid protections. A page fault triggers a software handler that fetches the page from the owner node and installs it with appropriate permissions.

**Page fault flow**
1. Process accesses virtual address *v* → MMU translates to physical frame *f*; protection bits cause a fault if *f* is invalid or read‑only while a write is attempted.  
2. Kernel invokes the DSM page‑fault handler (registered via `sigaction(SIGSEGV,…)`).  
3. Handler checks a *home location table* (hash map from page → owning node).  
4. If owner ≠ self, send a **request message** (RPC) to owner; owner replies with page contents (or grants write permission via an invalidation protocol).  
5. Upon reply, handler updates the page table entry (`pte`) and retries the instruction.

**Coherence protocol example – Lazy Release Consistency**
* Writers acquire a lock, modify pages locally, and on unlock send *invalidation* messages to all nodes that hold a copy. Readers fault on first access after invalidation, fetching the latest version. This reduces network traffic for read‑mostly workloads.

**C implementation sketch**
```c
/* dsm.h – simplified interface */
#include <signal.h>
#include <sys/mman.h>
#include <stddef.h>

typedef struct {
    void *addr;          /* base of mapped region */
    size_t length;       /* size in bytes */
    int   owner;         /* node id that currently owns the page */
} dsm_region_t;

extern dsm_region_t dsm_reg[];   /* populated at init */

/* Page fault handler – called on SIGSEGV */
static void dsm_page_fault(int sig, siginfo_t *si, void *uc)
{
    void *fault_addr = si->si_addr;
    size_t page_sz = sysconf(_SC_PAGESIZE);
    void *page_start = (void *)((uintptr_t)fault_addr & ~(page_sz-1));

    /* Find region containing fault_addr */
    dsm_region_t *r = NULL;
    for (int i=0; dsm_reg[i].addr; ++i)
        if (fault_addr >= dsm_reg[i].addr &&
            fault_addr <  (char*)dsm_reg[i].addr + dsm_reg[i].length)
            { r = &dsm_reg[i]; break; }

    if (!r) { /* not a DSM page */  raise(SIGSEGV); return; }

    int page_id = ((uintptr_t)page_start - (uintptr_t)r->addr) / page_sz;
    int owner   = r->owner;   /* simplified: whole region has one owner */

    if (owner == get_my_node_id()) {
        /* local page – just fix protection */
        mprotect(page_start, page_sz, PROT_READ|PROT_WRITE);
        return;
    }

    /* Request page from owner */
    void *buf = malloc(page_sz);
    rpc_request(owner, DSM_READ_PAGE, r, page_id, buf, page_sz);
    /* Install received page */
    memcpy(page_start, buf, page_sz);
    free(buf);
    mprotect(page_start, page_sz, PROT_READ|PROT_WRITE);
}

/* Install handler at startup */
void dsm_init(void)
{
    struct sigaction sa = { .sa_sigaction = dsm_page_fault,
                            .sa_flags = SA_SIGINFO };
    sigemptyset(&sa.sa_mask);
    sigaction(SIGSEGV, &sa, NULL);
}
```
*Note*: Real DSM systems (e.g., TreadMarks, Ivy) use more sophisticated home‑location tables and batch invalidations; the sketch shows the principle.

### Remote Procedure Calls (RPC)
RPC abstracts network communication as a local function call. The implementation involves:
* **Stub generation** (client & server) from an Interface Definition Language (IDL).  
* **Marshalling**: converting in‑memory arguments to a byte stream (e.g., XDR, Protocol Buffers).  
* **Transport**: usually TCP (reliable, ordered) or UDP (best‑effort, used for idempotent calls).  
* **Server dispatcher**: demarshals, invokes the real function, marshals the result, and sends it back.  

**Why exactly‑once is hard**: Network retransmissions may cause the server to execute the same call twice. Solutions:
* Make the procedure **idempotent** (e.g., `set(key, value)`).  
* Use a **request ID** and duplicate detection table at the server (stateful, sized by recent request window).  

**Timing model**  
Let *c* be serialization cost per byte, *s* the request size, *r* the response size, *L* one‑way network latency.  
$$T_{rpc}=2L + c·(s+r) + T_{proc}$$  
where *T_proc* is server execution time. For a 1 KB argument/response over a 0.5 ms LAN, with *c*≈0.1 µs/byte, we get ≈1 ms + *T_proc*.

**C example using SunRPC (rpcgen)**
```c
/* add.x – IDL */
program ADD_PROG {
    version ADD_VERS {
        int ADD(int, int) = 1;
    } = 1;
} = 0x20000001;

/* Generated stub (client side) – simplified */
#include <rpc/rpc.h>
#include "add.h"

int main(void)
{
    CLIENT *cl = clnt_create("localhost", ADD_PROG, ADD_VERS, "tcp");
    if (!cl) { clnt_pcreateerror("clnt_create"); exit(1); }

    int a=2, b=3, *result;
    result = add_1(&a, &b, cl);   /* calls server procedure */
    if (result == NULL)
        clnt_perror(cl, "RPC failed");
    else
        printf("2+3=%d\n", *result);

    clnt_destroy(cl);
    return 0;
}
```
Server side would implement `add_1_svc` returning the sum. The generated code handles XDR marshalling, socket I/O, and retransmission timeout (default 25 s, configurable via `clnt_control`).

## Worked Examples
### Example 1: NFSv4 Distributed File System
**Scenario**: Three machines (client A, B, C) mount an exported directory from server S. We trace a read of file `/proj/data.bin` (size 1 MiB) from client A.

**Steps**
1. **PATHLOOKUP** – client sends LOOKUP request for each component (`/`, `proj`, `data.bin`). Each LOOKUP is a single RPC (≈2·RTT + server processing). Assuming LAN RTT = 0.2 ms, three lookups → ~1.2 ms + processing.
2. **GETATTR** – fetch file size, change‑time. One RPC.
3. **READ** – client issues READ(offset=0, count=1MiB). Server may split into multiple READs if exceeding `wtmax` (default 1 MiB). Assume one READ RPC.
4. **Data transfer** – server reads from local disk (≈0.1 ms SSD) and sends 1MiB over 1 GbE (≈8 ms).  
5. **Reply** – client ACKs receipt.

**Total latency estimate**  
$$T_{total}= (3·LOOKUP + GETATTR + READ)·(2·RTT + T_{proc}) + T_{disk} + T_{net}$$  
Assuming *T_proc*≈0.05 ms per RPC, we get:  
$$T_{total}=5·(0.4+0.05) + 0.1 + 8 ≈ 5·0.45 + 8.1 ≈ 10.35\text{ ms}$$

**Cache consistency** – NFSv4 introduces *delegations*: server grants a client a delegation (read or write) on a file, promising not to revoke it without notification. While held, the client can cache reads/writes locally without contacting the server, reducing latency for successive accesses.

**Linux commands**
```bash
# On server S: export /srv/nfs with read‑write for clients A,B,C
sudo sh -c 'echo "/srv/nfs *(rw,sync,no_subtree_check)" >> /etc/exports'
sudo exportfs -ra
sudo systemctl restart nfs-server

# On each client: mount using NFSv4 over TCP
sudo mount -t nfs4 -o proto=tcp,port=2049 S:/srv/nfs /mnt/nfs

# Verify delegation status (kernel tracks in /proc/fs/nfsd/...)
cat /proc/fs/nfsd/delegations
```

### Example 2: Two‑Phase Commit (2PC) in a Distributed DB
**Scenario**: Two PostgreSQL replicas (node A primary, node B standby) participate in a distributed transaction that inserts a row into `accounts` on both nodes.

**Phases**
1. **Prepare** – Coordinator (node A) sends `PREPARE` to each participant. Each participant writes undo/redo log to stable storage, locks affected rows, and replies `YES` (if ready) or `NO`.  
2. **Commit** – If all votes `YES`, coordinator writes `COMMIT` record to its log and sends `COMMIT` to participants; each participant writes commit record, releases locks, and acknowledges. If any `NO`, coordinator writes `ABORT` and sends `ABORT`.

**Message count**  
With *n* participants, 2PC uses  
$$N_{msg}= n\;(PREPARE) + n\;(VOTE) + 1\;(COMMIT/ABORT) + n\;(ACK) = 3n+1$$  
For *n*=2 → 7 messages.

**Latency**  
Assume each message incurs one network round‑trip (RTT).  
$$T_{2PC}= (3n+1)·RTT + T_{log}$$  
where *T_log* is synchronous disk write time (≈0.5 ms per SSD). With RTT=0.2 ms, *n*=2:  
$$T_{2PC}=7·0.2 + 0.5 = 1.9\text{ ms}$$

**Linux‑specific notes**
* PostgreSQL implements its own two‑phase commit via `pg_prepare_xact`/`pg_commit_prepared`.  
* The underlying write‑ahead log (WAL) is flushed using `fsync`; on Linux this translates to the `sync_file_range` system call or `fdatasync`.  
* Kernel’s `flock`/`fcntl` locks protect rows during the prepare phase.

**SQL demonstration**
```sql
-- On coordinator (node A)
BEGIN;
PREPARE TRANSACTION 'txn_42';

-- On each participant (including A itself)
BEGIN;
PREPARE TRANSACTION 'txn_42';
INSERT INTO accounts (id, balance) VALUES (101, 500);
-- Ensure WAL is flushed before voting yes
COMMIT PREPARED 'txn_42';

-- Back on coordinator after receiving all YES votes
COMMIT PREPARED 'txn_42';
```
If any participant fails to prepare, the coordinator runs:
```sql
ROLLBACK PREPARED 'txn_42';
```
and participants abort similarly.

## Common Mistakes
### Mistake 1: Assuming Transparency Eliminates Performance Costs
**What’s wrong**: Believing that a remote file access via NFS costs the same as a local disk read.  
**Why**: Transparency hides *where* the data lives, not *how long* it takes. A remote read incurs at least one network round‑trip plus server processing; typical LAN RTT (0.2‑0.5 ms) dominates over local SSD latency (~0.05 ms). Ignoring this leads to under‑provisioned bandwidth and unsatisfactory response times.

### Mistake 2: Treating Eventual Consistency as Strong
**What’s wrong**: Assuming that after a write, subsequent reads will see the new value.  
**Why**: Eventual consistency only guarantees convergence *if* no further writes occur. Concurrent writes can cause *divergent* versions that only later reconcile (e.g., Amazon Dynamo’s “conflict resolution”). Applications that rely on immediate visibility (e.g., banking transfers) will experience lost updates or stale reads under this model.

### Mistake 3: Ignoring Network Partitions Leading to Split‑Brain
**What’s wrong**: Deploying a replicated service without a partition‑handling policy, assuming the network is reliable.  
**Why**: When the network splits, each partition may continue to serve clients, believing it is the sole survivor. Without a quorum or fencing mechanism, two partitions can diverge, causing irrecoverable inconsistency when the partition heals (the classic split‑brain problem). Proper solutions require a *majority quorum* (reads/writes need > N/2 nodes) and a *fencing* method (e.g., SCSI reserve, power‑off via IPMI) to eject the minority side.

## Exercises
### Easy – Measure RPC Overhead
1. Write a simple **echo** service using SunRPC (definition: `string ECHO(string) = 1;`).  
2. Implement a client that calls `ECHO` with payloads of 0 B, 64 B, 1 KiB, 64 KiB.  
3. Use `clock_gettime(CLOCK_MONOTONIC, …)` before and after each call to compute RTT.  
4. Plot latency vs. payload size and verify the linear term predicted by $T_{rpc}=2L + c·(s+r)$.  
*Goal*: Observe the fixed overhead (2L) and per‑byte cost.

### Medium – Software DSM with Invalidations
1. Use `mmap` to create a shared memory region backed by a file on each node.  
2. Protect pages with `mprotect(..., PROT_NONE)`; catch `SIGSEGV` to implement a page‑fault handler.  
3. On a write fault, send an **invalidation** message (via UDP multicast) to all other nodes; they respond with an **ACK** after setting protection to `PROT_NONE`.  
4. The faulting node then upgrades its page to `PROT_READ|PROT_WRITE`, performs the write, and on `munmap` or explicit unlock sends a **release** message that grants read‑only copies back.  
5. Test with two concurrent threads on different nodes incrementing a shared counter; verify correctness under the lazy release consistency model.  
*Goal*: Experience coherence protocol implementation and measure fault‑handling latency.

### Hard – Lease‑Based Distributed Lock (Chubby‑style)
1. Implement a lock service using the **Raft** consensus algorithm (you may reuse a library like `etcd`’s raft).  
2. Clients acquire a lock by proposing a `LockRequest(lease_id, timeout)` entry; the leader replicates it to a majority.  
3. The lock is granted when the entry is committed; the leader sends a `Grant(lease_id, timeout)` response.  
4. Clients must **renew** the lease before half the timeout expires by sending a `Renew(lease_id)` entry; failure to renew leads to automatic release.  
5. Provide a simple CLI: `lock acquire <name>`, `lock renew <name>`, `lock release <name>`.  
6. Evaluate behavior under network partitions: verify that only the partition with a majority can grant locks, and that the minority side rejects requests (returning error).  
*Goal*: Apply consensus, leasing, and failure detection to build a practical primitive used in real distributed systems.

## Linux Connection
### Subsystems & Frameworks
| Subsystem | Purpose | Relevant paths / files |
|-----------|---------|------------------------|
| **SunRPC** (kernel implementation of RPC) | Provides transport, authentication, and dispatch for NFS, NIS, etc. | `/net/sunrpc/`, `/proc/sys/sunrpc/` (tunables: `udp_slot_table_entries`, `tcp_max_slot_table_entries`) |
| **NFS client/server** | Remote file sharing (v2/v3/v4) | Client: `mount -t nfs4`; Server: `/etc/exports`, `/var/lib/nfs/etab`, `/proc/fs/nfsd/` |
| **9P (Plan 9) protocol** | Used by containers (`libvirt`, `lxc`) for sharing host directories | Kernel: `net/9p/`, mount with `-t 9p` |
| **RPCSEC_GSS** | Security layer for RPC (Kerberos) | `/usr/include/gssrpc/` |
| **Futex** | Fast userspace locking (building blocks for distributed lock services) | `futex(2)` syscall, `/proc/sys/kernel/futex` |
| **Epoll** | Scalable I/O event notification for RPC servers handling many connections | `epoll_create1`, `epoll_ctl`, `epoll_wait` |
| **Netlink** | Kernel‑userspace communication (e.g., routing tables, `rpcbind` notifications) | `NETLINK_ROUTE`, `NETLINK_GENERIC` |
| **RDMA (iWARP, RoCE)** | Zero‑copy, low‑latency transport for high‑performance DSM or RPC | `/sys/kernel/config/rdma_cm/` |

### Concrete Commands
```bash
# 1. Show active RPC services (portmapper)
rpcinfo -p localhost   # lists program, version, protocol, port

# 2. Monitor NFS traffic
nfsstat -c   # client statistics
nfsstat -s   # server statistics

# 3. Inspect SunRPC tunables
sysctl -n sunrpc.tcp_max_slot_table_entries
sysctl -n sunrpc.udp_slot_table_entries

# 4. Check current NFSv4 delegations (kernel exports info)
cat /proc/fs/nfsd/delegations   # shows delegations per client/file

# 5. Demonstrate a futex-based lock (userspace)
# compile with: gcc -pthread futex_lock.c -o futex_lock
# (code omitted for brevity – see man futex(2) for example)

# 6. Use rdma_cm to create a reliable connected queue pair (RC QP) for low‑latency RPC
rdma_cm_id=$(rdma_cm_id_create)
rdma_bind_addr $rdma_cm_id $(hostname -I | awk '{print $1}') 18515
rdma_listen $rdma_cm_id 8
rdma_accept $rdma_cm_id $(rdma_get_client_addr)   # simplified
```

These interfaces illustrate how the concepts from earlier sections are realized in the Linux kernel and user‑space toolchain.

## Why This Matters
Distributed systems are the backbone of modern infrastructure: micro‑services, cloud storage, container orchestration, and big‑data analytics all rely on the primitives we examined. Understanding **naming transparency** lets you design services that survive node migrations without client reconfiguration. Grasping **failure models** and **consistency guarantees** enables you to choose the right protocol—whether you need linearizable updates for financial transactions or eventual consistency for social feeds—thus avoiding costly anomalies. The detailed look at **DSM** and **RPC** shows how the MMU, signal handling, and kernel RPC subsystems turn network messages into familiar memory accesses or function
