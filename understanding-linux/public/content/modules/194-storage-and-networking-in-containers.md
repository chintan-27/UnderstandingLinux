---
id: 194
title: "Storage and networking in containers"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Isolation Mechanisms in Containers
Containers achieve isolation primarily through **Linux namespaces** (pid, net, mnt, uts, ipc, user) and **control groups** (cgroups). A container’s root filesystem is not a full disk image; it is a **union mount** that presents a layered view of read‑only base image layers plus a mutable top layer. This design lets many containers share unchanged files while giving each a private writeable view, dramatically reducing storage footprint and startup time.

### Why Overlay Filesystems?
A naïve copy‑on‑write (CoW) approach would duplicate entire files on the first write, wasting I/O and space. OverlayFS instead stacks directories: a **lowerdir** (read‑only image layers), an **upperdir** (container‑specific writes), and a **workdir** (required for internal metadata). When a file is read, the kernel searches the upperdir first; if absent, it falls back to lowerdir. Writes always go to upperdir, and if the file existed in lowerdir a **whiteout** (character device 0/0) is created there to hide the original. This yields:
- **Read path:** O(number of layers) directory lookups, but each lookup stops at the first hit.
- **Write path:** O(1) – a single `creat`/`open` in upperdir plus possible whiteout creation.
Thus the cost scales with the number of layers only for reads, not writes.

### Why Bridge Networking?
Containers need to exchange packets as if they were on a traditional LAN, yet each resides in its own network namespace. A **Linux bridge** behaves like a hardware switch: it learns MAC addresses, forwards frames based on its forwarding database (FDB), and can flood unknown destinations. By attaching each container’s veth peer to the bridge, we get:
- **Isolation:** traffic stays on the bridge unless explicitly routed.
- **Scalability:** the bridge can host thousands of interfaces; its FDB is a hash table with expected O(1) lookup.
- **Policy hooks:** netfilter (`iptables`, `ebtables`) can inspect/alter frames at PRE_ROUTING, FORWARD, POST_ROUTING.

### Why CNI?
The Container Network Interface (CNI) spec decouples network configuration from container runtimes. A runtime executes a CNI plugin (a binary) inside the container’s network namespace, passing a JSON config via stdin. The plugin returns a JSON result describing the created interfaces, IPs, routes, etc. This standardization lets:
- **Swap plugins** (bridge, macvlan, ipvlan, VLAN) without changing runtime code.
- **Reuse IPAM** plugins (host-local, dhcp, static) across networks.
- **Inspect and debug** via the same JSON contract.

---

## How It Works
### Overlay Filesystem Mechanism (First‑Principles)
1. **Mount call**:  
   ```c
   int mount(const char *source, const char *target,
             const char *filesystemtype, unsigned long mountflags,
             const void *data);
   ```
   For overlay: `source="overlay"`, `filesystemtype="overlay"`,
   `data="lowerdir=/lower,upperdir=/upper,workdir=/work"`.
2. **Kernel superblock**: The overlay filesystem registers a superblock that holds pointers to three dentry trees (lower, upper, work).  
3. **Lookup algorithm (simplified)**:  
   ```
   dentry *ovl_lookup(struct inode *dir, struct dentry *dentry, unsigned int flags) {
       struct dentry *upper = lookup_upper(dir, dentry);
       if (upper) return upper;               // found in upperdir
       struct dentry *lower = lookup_lower(dir, dentry);
       if (lower) {
           if (is_whiteout(lower)) return create_whiteout_upper(dir, dentry);
           return lower;                     // fall‑through to lower
       }
       return ERR_PTR(-ENOENT);
   }
   ```
   The workdir is used only for transient rename‑exchange operations (`renameat2`) needed to atomically replace a file with a whiteout.
4. **Copy‑on‑write trigger**: When a process opens a file with `O_WRONLY|O_CREAT|O_TRUNC`, the VFS calls `ovl_open`. If the file originates from lowerdir, `ovl_open` copies the entire file to upperdir (using `copy_up`) before granting write access, preserving the lower layer’s immutability.
5. **Whiteout and opaque fields**:  
   - Whiteout: a char device (0/0) in upperdir signals deletion of a same‑named lower file.  
   - Opaque flag (`xattr trusted.overlay.opaque=y`) on a lower directory tells overlay to ignore any upperdir entries for that directory, useful for preserving mount points.

**Quantitative example**: Suppose a base image has 10 000 regular files, each 4 KiB. Upperdir adds 100 new files and modifies 10 existing ones.  
- **Read cost**: For an unmodified file, one lookup in upperdir (miss) + one in lowerdir (hit) ≈ 2 dentry lookups.  
- **Write cost for a modified file**: copy‑up of 4 KiB (one page) + allocation of new inode + possible whiteout creation ≈ 1 page write + metadata updates.  
Thus total I/O ≈ (10 000‑10)*0 + 10*4 KiB = 40 KiB written, vs. copying the whole 40 MiB if a full CoW snapshot were used.

### Bridge Networking Mechanism (First‑Principles)
1. **Bridge device creation**:  
   ```bash
   ip link add name br0 type bridge
   ip link set dev br0 up
   ```
   The kernel allocates a `net_device` (`br0`) and registers it with the bridge subsystem (`net/bridge/br_device.c`).  
2. **Port addition**: Each veth peer is added as a bridge port:  
   ```bash
   ip link set dev veth1 master br0
   ip link set dev veth2 master br0
   ```
   The bridge calls `br_add_if`, which:
   - Increments the port count.
   - Programs the underlying NIC’s MAC VLAN filtering (if enabled) to accept all frames.
   - Sets the port’s `state` to `BR_STATE_LISTENING` then `BR_STATE_LEARNING`.
3. **Learning process**: Upon receiving a frame, the bridge executes `br_handle_frame`:
   - If the destination MAC is known (look up in FDB hash), forward to the specific port.
   - If unknown, flood to all ports except the ingress port.
   - Learn the source MAC: `br_fdb_update` inserts `<src_mac, port, timestamp>` into the FDB (a simple hash table with aging).  
4. **Forwarding decision math**: With `N` ports, the FDB size grows O(N). Lookup is expected O(1) due to hashing; worst case O(N) if many collisions (mitigated by randomizing hash seed).  
5. **Netfilter hooks**: Frames traverse `NF_BR_PRE_ROUTING → NF_BR_FORWARD → NF_BR_POST_ROUTING`, allowing `ebtables`/`iptables` to filter based on MAC/IP.

**Example calculation**: A bridge with 1000 ports, each seeing 10 pps (packets per second) average, yields 10 000 pps total. Assuming a 64‑byte Ethernet frame, bandwidth ≈ 640 kbps, well within a 1 Gbps link. The FDB holds at most 1000 entries → ~16 KB (each entry ~16 bytes), negligible.

### CNI Mechanism (First‑Principles)
1. **Invocation flow** (runtime → plugin):
   - Runtime creates a new network namespace (`unshare(CLONE_NEWNET)` or `setns`).  
   - Runtime reads the CNI config file (e.g., `/etc/cni/net.d/10-mynet.conf`).  
   - Runtime executes the plugin binary (`/usr/lib/cni/bridge`) with:
     - `CNI_COMMAND=ADD` (or DEL)  
     - `CNI_CONTAINERID=<id>`  
     - `CNI_NETNS=<ns-path>`  
     - `CNI_IFNAME=eth0` (desired name inside namespace)  
     - stdin: JSON config.
2. **Plugin responsibilities**:
   - Parse config (bridge name, IPAM type, subnet).  
   - Ensure the bridge exists (`ip link show <bridge>`); create if missing.  
   - Allocate IP address via IPAM plugin (e.g., host-local returns JSON with `ip4`: `{address: "10.0.0.2/24", gateway: "10.0.0.1"}`).  
   - Create a veth pair, move one end into the container namespace (`setns`), rename to `CNI_IFNAME`.  
   - Bring up both ends, assign IP/gateway, add default route.  
   - Add the host‑side veth to the bridge (`ip link set dev veth-host master br0`).  
   - Optionally enable proxy ARP or hairpin mode.  
3. **Result JSON** returned to runtime (used for logging or cleanup).  
4. **Teardown** (`CNI_COMMAND=DEL`) reverses steps: delete IPAM allocation, remove veth from bridge, delete veth pair, release namespace.

**Math in IPAM** (host‑local): Given subnet `a.b.c.d/prefix`, usable host count = $2^{32-\text{prefix}} - 2$. For `/24`: $2^{8} - 2 = 254$ addresses. The plugin maintains a local lease file (`/var/lib/cni/networks/<name>/<last_reserved>.json`) to avoid collisions across sequential ADD calls.

---

## Worked Examples
### Example 1: Building an OverlayFS with Metadata Inspection
```bash
# 1. Prepare directories
sudo mkdir -p /tmp/overlay/{lower,upper,work,merged}

# 2. Populate lowerdir (read‑only base)
sudo mkdir -p /tmp/overlay/lower/etc
echo "Hello base" | sudo tee /tmp/overlay/lower/etc/greeting > /dev/null
sudo touch /tmp/overlay/lower/etc/unchanged

# 3. Populate upperdir (writes)
sudo mkdir -p /tmp/overlay/upper/etc
echo "Hello overridden" | sudo tee /tmp/overlay/upper/etc/greeting > /dev/null
sudo touch /tmp/overlay/upper/etc/newfile

# 4. Mount overlay
sudo mount -t overlay overlay \
    -o lowerdir=/tmp/overlay/lower,upperdir=/tmp/overlay/upper,workdir=/tmp/overlay/work \
    /tmp/overlay/merged

# 5. Inspect view
ls -l /tmp/overlay/merged/etc
# Output:
# -rw-r--r-- 1 root root 15 Sep 25 12:34 greeting   # from upperdir
# -rw-r--r-- 1 root root  0 Sep 25 12:34 unchanged   # from lowerdir
# -rw-r--r-- 1 root root  0 Sep 25 12:34 newfile    # from upperdir

# 6. Verify whiteout creation (remove a lower file)
sudo rm /tmp/overlay/merged/etc/unchanged
ls -la /tmp/overlay/upper/etc
# You will see a char device:
# ---rw------- 1 root root 0, 0 Sep 25 12:40 unchanged

# 7. Check copy‑on‑write for a modified file
sudo dd if=/dev/zero of=/tmp/overlay/merged/etc/greeting bs=4K count=1 oflag=direct
# The file in upperdir now occupies a new 4K block; lowerdir greeting unchanged.
sudo stat -c "%i %n" /tmp/overlay/lower/etc/greeting \
            /tmp/overlay/upper/etc/greeting
# Different inode numbers → copy‑up occurred.
```
**Explanation**:  
- The overlay presents a unified view where writes go to upperdir.  
- Removing a file that existed only in lowerdir creates a whiteout (character device 0/0) in upperdir, hiding the lower file.  
- Modifying a file triggers copy‑up: the kernel allocates a new inode in upperdir and copies the data, leaving the lower layer intact.  

### Example 2: Bridging Two Containers via Veth Pairs
```bash
# 1. Create bridge
sudo ip link add name br0 type bridge
sudo ip link set dev br0 up

# 2. Create first container (namespace only)
sudo unshare --net --fork --pid --mount-proc bash -c "
    echo 'Container 1 PID:' $$
    export CON1_PID=$$
    # Keep shell alive
    while true; do sleep 1; done
" &
CON1_PID=$!

# 3. Create second container
sudo unshare --net --fork --pid --mount-proc bash -c "
    echo 'Container 2 PID:' $$
    export CON2_PID=$$
    while true; do sleep 1; done
" &
CON2_PID=$!

# 4. Create veth pair for container 1
sudo ip link add veth1a type veth peer name veth1b
sudo ip link set veth1a master br0
sudo ip link set veth1a up
sudo ip link set veth1b netns $CON1_PID
sudo nsenter -t $CON1_PID -n ip link set dev veth1b name eth0
sudo nsenter -t $CON1_PID -n ip addr add 10.0.0.1/24 dev eth0
sudo nsenter -t $CON1_PID -n ip link set dev eth0 up
sudo nsenter -t $CON1_PID -n ip route add default via 10.0.0.1

# 5. Create veth pair for container 2
sudo ip link add veth2a type veth peer name veth2b
sudo ip link set veth2a master br0
sudo ip link set veth2a up
sudo ip link set veth2b netns $CON2_PID
sudo nsenter -t $CON2_PID -n ip link set dev veth2b name eth0
sudo nsenter -t $CON2_PID -n ip addr add 10.0.0.2/24 dev eth0
sudo nsenter -t $CON2_PID -n ip link set dev eth0 up
sudo nsenter -t $CON2_PID -n ip route add default via 10.0.0.1

# 6. Verify connectivity
sudo nsenter -t $CON1_PID -n ping -c 3 10.0.0.2
# Expected: 0% packet loss
```
**Explanation**:  
- The bridge `br0` learns MAC addresses: after the first ping, its FDB contains `{MAC(veth1b) → port veth1a, MAC(veth2b) → port veth2a}`.  
- Frames are forwarded based on this table; no flooding after learning.  
- Each container sees a point‑to‑point link (`eth0`) with its own IP, while the bridge handles L2 switching.

### Example 3: CNI Bridge Plugin Configuration and Execution
```bash
# 1. Install CNI plugins (if not present)
sudo apt-get install -y cnibridge

# 2. Write network config (CNI version 0.4.0)
sudo mkdir -p /etc/cni/net.d
sudo tee /etc/cni/net.d/10-mynet.conf > /dev/null <<'EOF'
{
  "cniVersion": "0.4.0",
  "name": "mynet",
  "type": "bridge",
  "bridge": "cni-br0",
  "isGateway": true,
  "ipMasq": true,
  "hairpinMode": true,
  "ipam": {
    "type": "host-local",
    "subnet": "10.10.0.0/16",
    "routes": [{"dst":"0.0.0.0/0"}]
  }
}
EOF

# 3. Ensure the bridge exists (plugin will create if missing)
sudo ip link add name cni-br0 type bridge || true
sudo ip link set dev cni-br0 up

# 4. Run a container using the CNI network (docker example)
sudo docker run -d --name cnitool --network none alpine sleep infinity
# Retrieve container's PID
CON_PID=$(sudo docker inspect -f '{{.State.Pid}}' cnitool)

# 5. Execute the CNI ADD command manually to see what happens
sudo CNI_COMMAND=ADD \
     CNI_CONTAINERID=cnitool \
     CNI_NETNS=/proc/$CON_PID/ns/net \
     CNI_IFNAME=eth0 \
     /usr/lib/cni/bridge < /etc/cni/net.d/10-mynet.conf \
     | jq .
# Expected output (pretty‑printed):
# {
#   "cniVersion":"0.4.0",
#   "name":"mynet",
#   "type":"bridge",
#   "ifName":"eth0",
#   "mac":"...",
#   "ip4":{
#       "ip":"10.10.0.2/16",
#       "gateway":"10.10.0.1"
#   },
#   "routes":[{"dst":"0.0.0.0/0"}]
# }

# 6. Verify inside container
sudo nsenter -t $CON_PID -n ip addr show eth0
# Should list 10.10.0.2/16 with gateway 10.10.0.1

# 7. Cleanup (optional)
sudo docker rm -f cnitool
sudo ip link delete dev cni-br0
```
**Explanation**:  
- The CNI plugin reads the JSON, ensures `cni-br0` exists, allocates the next free IP from the host-local store (`/var/lib/cni/networks/mynet/`).  
- It creates a veth pair, moves the container end into the namespace, renames to `eth0`, assigns the IP/gateway, adds a default route, and attaches the host end to the bridge.  
- The returned JSON confirms the allocated address and routes, which the runtime can use for logging or further configuration.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Happens | How to Avoid |
|---------|--------------|----------------|--------------|
| **Omitting `workdir` when mounting overlay** | `mount: wrong fs type, bad option, bad superblock on overlay, missing codepage or helper program, or other error` (typically `EINVAL`). | The overlay driver needs a workdir for internal rename‑exchange operations; without it the kernel cannot guarantee atomic whiteout creation. | Always specify `workdir=` on a dedicated empty directory (can be same filesystem as upperdir). |
| **Reusing the same `lowerdir` for multiple overlapping overlays** | Corrupted view: files appear missing or duplicated; `overlayfs: lowerdir '/' is shared with another mount` warnings. | Overlay expects lowerdir to be read‑only; concurrent writes via different uppers can cause race conditions on inode metadata (e.g., nlink). | Use distinct lowerdirs (or snapshots) per overlay, or mount the same lowerdir with `ro,bind` and ensure no writes via bind mounts. |
| **Forgetting to enable `net.ipv4.ip_forward`** | Containers can ping each other but cannot reach external networks; `tcpdump` shows packets dropped at host. | The bridge forwards L2 frames, but IP routing requires the host to act as a router; without forwarding, the kernel treats incoming packets as destined for itself and drops them if not local. | Set `sysctl -w net.ipv4.ip_forward=1` (or persist in `/etc/sysctl.d/99-forward.conf`). |
| **Assuming bridge learning works without putting ports in `UP` state** | Ping fails; `brctl showmacs br0` shows empty FDB. | The bridge only learns when a port is in `BR_STATE_FORWARDING` (requires the port to be `UP` and not blocked by STP). | Ensure `ip link set dev <veth> up` before attaching to bridge, or disable STP: `ip link set dev br0 type bridge stp_state 0`. |
| **Using CNI plugin version older than the runtime’s expected `cniVersion`** | Plugin returns `{"cniVersion":"0.3.0","code":...}` but runtime expects `0.4.0`; runtime may discard result or treat as error. | CNI runtime validates that the plugin’s returned `cniVersion` matches the config’s `cniVersion` (or is newer). Mismatch leads to rejection. | Keep plugins updated; check `/usr/lib/cni/ --version` or look at the plugin’s source for supported versions. |
| **IPAM subnet overlap between two CNI networks** | Containers from different networks get the same IP, causing ARP conflicts and intermittent connectivity. | Host-local IPAM stores allocations per network name; if two networks share the same subnet, the plugin’s allocation logic does not cross‑check. | Use distinct subnets (e.g., `10.0.0.0/24` vs `10.0.1.0/24`) or delegate IPAM to a centralized plugin (dhcp, where‑abouts). |
| **Neglecting to set `hairpinMode` on the bridge when containers need to talk to each other via the bridge’s IP** | A container trying to reach its own gateway (bridge IP) gets no reply; `arp -n` shows incomplete. | Without hairpin mode, the bridge does not forward a frame back out the same port it arrived on (to prevent loops). Containers sending to the bridge’s IP must have the frame hairpinned. | In CNI config set `"hairpinMode": true`, or manually: `ip link set dev <veth> hairpin on`. |

---

## Exercises
### Easy
1. **OverlayFS basics**  
   - Create a lowerdir with a file `lower.txt`.  
   - Create an empty upperdir and workdir.  
   - Mount overlay and verify you can read `lower.txt`.  
   - Write to `upper.txt` and confirm it appears only in the merged view.  
   - *Goal*: Understand read‑through and write‑to‑upper behavior.

2. **Bridge with two veth peers**  
   - Create a bridge `br0`.  
   - Create two veth pairs, move one end of each into a fresh network namespace (`unshare --net`).  
   - Assign IPs `10.0.0.1/24` and `10.0.0.2/24`.  
   - Ping between the namespaces.  
   - *Goal*: See L2 learning in action.

### Medium
3. **OverlayFS copy‑on‑write measurement**  
   - Populate lowerdir with a 10 MiB file (`dd if=/dev/zero of=lower/bigfile bs=1M count=10`).  
   - Mount overlay, open the file for write (`O_WRONLY|O_TRUNC`) and write a single byte at offset 0.  
   - Before and after, run `du
