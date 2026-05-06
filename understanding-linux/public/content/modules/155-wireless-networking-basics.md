---
id: 155
title: "Wireless networking basics"
supermoduleId: 11
estimatedMinutes: 45
resources:
  - type: book
    title: "TCP/IP Illustrated Vol 1 (Stevens)"
  - type: book
    title: "Unix Network Programming (Stevens)"
---

## Core Concepts
### Physical Layer Foundations
Wireless networking in the 802.11 family relies on electromagnetic waves in the ISM bands. The choice of 2.4 GHz (2400–2483.5 MHz) and 5 GHz (5150–5850 MHz) is not arbitrary: lower frequencies propagate farther and penetrate obstacles better, while higher frequencies offer wider channels and thus higher raw data rates.  

The **channel spacing** in the 2.4 GHz band is 5 MHz. Channel 1 starts at 2401 MHz (actually 2400 MHz + 1 MHz offset) and each subsequent channel adds 5 MHz:  

\[
f_c(n) = 2400 + 1 + 5\times(n-1)\ \text{MHz},\qquad n=1,\dots,13
\]

(Channels 14 exists only in Japan at 2484 MHz.)  

In the 5 GHz band the spacing is also 5 MHz, but many channels are grouped into 20 MHz, 40 MHz, 80 MHz, or 160 MHz **channel widths** for HT/VHT/HE modes. The centre frequency of a 20 MHz channel indexed by *k* is  

\[
f_c(k) = 5000 + 5\times k\ \text{MHz},
\]

with *k* ranging from 0 to 199 (subject to regulatory restrictions).  

A symbol in OFDM (used by 802.11a/g/n/ac/ax) occupies a **subcarrier spacing** of  

\[
\Delta f = \frac{1}{T_{\text{FFT}}} = \frac{1}{3.2\ \mu\text{s}} = 312.5\ \text{kHz},
\]

where the FFT size is 64 samples, giving a useful symbol duration of 3.2 µs and a guard interval (GI) of either 0.8 µs (short GI) or 1.6 µs (long GI).  

### Channel Allocation and Modulation
Each 20 MHz channel comprises 64 subcarriers: 52 data + 4 pilot (used for channel estimation) + 8 null (DC guard). With **BPSK** (1 bit/symbol), **QPSK** (2 bits/symbol), 16‑QAM (4 bits/symbol), 64‑QAM (6 bits/symbol), 256‑QAM (8 bits/symbol), and 1024‑QAM (10 bits/symbol) in HE (802.11ax), the **raw PHY rate** is  

\[
R_{\text{raw}} = N_{\text{data}} \times \frac{\text{bits per symbol}}{\text{symbol time}} \times \text{coding rate},
\]

where symbol time = \(T_{\text{FFT}} + T_{\text{GI}}\). For example, a VHT80 (80 MHz) link with 256‑QAM, 5/6 coding, and short GI:

\[
\begin{aligned}
N_{\text{data}} &= 52 \times 4 = 208\ (\text{four 20 MHz sub‑channels})\\
\text{bits/symbol} &= 8\\
T_{\text{sym}} &= 3.2\ \mu\text{s} + 0.8\ \mu\text{s} = 4.0\ \mu\text{s}\\
R_{\text{raw}} &= 208 \times \frac{8}{4.0\ \mu\text{s}} \times \frac{5}{6}
               \approx 346.7\ \text{Mbps}.
\end{aligned}
\]

### MAC Architecture
The 802.11 MAC divides time into **slots**. A slot time (\(\sigma\)) is the time needed to sense the medium and detect a transmission; it is 9 µs in 2.4 GHz DSSS and 20 µs in OFDM modes. Two key intervals are:

* **SIFS** (Short Inter‑Frame Space): fixed, e.g., 10 µs (802.11a/g) or 16 µs (802.11n/ac/ax).  
* **DIFS** (DCF Inter‑Frame Space): \(\text{DIFS} = \text{SIFS} + 2\sigma\).

A station must wait for DIFS before attempting to transmit; after a frame it waits SIFS before sending an ACK. This hierarchy guarantees that acknowledgments have higher priority than new data frames, reducing collisions.

The MAC distinguishes three frame types:

| Type   | Subtype Examples            | Purpose |
|--------|-----------------------------|---------|
| Management | Beacon, Probe Request/Response, Association Request/Response, Authentication | Network discovery & connection |
| Control  | RTS, CTS, ACK               | Medium access coordination |
| Data     | Data, Null, QoS Data        | Carries higher‑layer payload |

Each frame carries a **Frame Control** field (2 bytes) specifying protocol version, type, subtype, To/From DS flags, power management, etc., followed by Duration/ID, addresses (up to 4), Sequence Control, and optional payload/FCS.

---

## How It Works
### Discovery and Scanning
A station in **inactive** state performs either **passive scanning** (listening for Beacon frames) or **active scanning** (transmitting Probe Requests on each channel). Passive scanning avoids causing interference but may miss hidden networks; active scanning yields faster discovery at the cost of extra traffic.

When a Beacon is received, the station extracts:

* SSID (0–32 bytes)
* Supported rates (IE #1)
* DS Parameter Set (current channel, IE #3)
* RSN Information (IE #48) indicating WPA2/WPA3 capabilities
* HT/VHT/HE capabilities (IEs #45, #191, #235)

### Association Procedure
After selecting an AP (typically the one with strongest RSSI and matching security capabilities), the station sends an **Association Request** frame containing:

* Capability Information (ESS, IBSS, CF‑Pollable, etc.)
* Listen Interval (how many beacon periods the station will sleep before waking)
* Supported Rates IE
* HT/VHT/HE Capability IEs (if applicable)

The AP replies with an **Association Response** frame that includes an Association ID (AID) allocated to the station (AID = 0 reserved, 1–2000 typical). Successful association binds the station’s MAC address to the AP’s forwarding table and enables the AP to buffer frames for the station while it dozes.

### Authentication and Key Management
**Authentication** in modern WLANs is almost always performed via an **Extensible Authentication Protocol (EAP)** exchange encapsulated in EAPOL (EAP over LAN) frames, as defined by 802.1X. For personal (PSK) networks the exchange is simplified:

1. **AP → Station**: EAPOL‑Start (optional)  
2. **Station → AP**: EAPOL‑Logoff (if terminating) or EAPOL‑Key (Message 1/4) containing the **ANonce** (AP nonce) and a MIC (Message Integrity Check) computed with the Pairwise Master Key (PMK).  
3. **AP → Station**: EAPOL‑Key (Message 2/4) with **SNonce**, the AP’s MIC, and the RSN IE.  
4. **Station → AP**: EAPOL‑Key (Message 3/4) with the station’s MIC and optionally the GTK (Group Temporal Key) if using WPA2‑Enterprise.  
5. **AP → Station**: EAPOL‑Key (Message 4/4) confirming GTK receipt.

The **PMK** for PSK is derived from the passphrase and SSID using PBKDF2‑HMAC‑SHA1 with 4096 iterations:

\[
\text{PMK} = \text{PBKDF2-HMAC-SHA1}(\text{passphrase},\ \text{SSID},\ 4096,\ 256\text{ bits}).
\]

From the PMK, the **PTK** (Pairwise Transient Key) is generated via a pseudo‑random function (PRF‑384) mixing the two nonces and the MAC addresses:

\[
\text{PTK} = \text{PRF-384}(\text{PMK},\ \text{"Pairwise key expansion"},\ \text{MinMAC} \parallel \text{MaxMAC} \parallel \text{MinNonce} \parallel \text{MaxNonce}).
\]

The first 128 bits of PTK become the **Temporal Key (TK)** used by CCMP (AES‑CCM) for confidentiality and integrity.

### Data Transfer Mechanisms
Once the PTK is installed, data frames are protected by **CCMP**:

1. **MIC generation** (CBC‑MAC) over the MPDU header (excluding FCS) and payload.  
2. **Encryption** of the payload + MIC using AES in Counter mode with a 48‑bit packet number (PN) as the nonce.  
3. **Transmission** of the encrypted MPDU plus a 8‑byte MIC and the PN in the IEEE 802.11 header’s **Queue Control** field (QoS Data frames).  

The receiver reverses the process: decrypts, verifies MIC, increments its replay‑check PN, and forwards the decrypted frame to the LLC layer.

---

## Worked Examples
### Example 1: Computing a 5 GHz Channel Centre Frequency
*Problem*: Find the centre frequency of 80 MHz channel 42 (as reported by `iwlist wlan0 channel`).  

*Solution*: In the 5 GHz band each 20 MHz channel is numbered sequentially. Channel 42 corresponds to the 20 MHz channel whose lower edge is at  

\[
f_{\text{low}} = 5000 + 5\times(42-1) = 5000 + 205 = 5205\ \text{MHz}.
\]

An 80 MHz channel occupies four adjacent 20 MHz channels, so its centre is the average of the lower edge of the first and the upper edge of the fourth:

\[
\begin{aligned}
f_{\text{high}} &= f_{\text{low}} + 4\times20\ \text{MHz} - 5\ \text{MHz} \\
                &= 5205 + 80 - 5 = 5280\ \text{MHz} \\
f_c &= \frac{f_{\text{low}} + f_{\text{high}}}{2}
     = \frac{5205 + 5280}{2}
     = 5242.5\ \text{MHz}.
\end{aligned}
\]

Thus the channel centre is **5.2425 GHz**, which matches the output of `iwlist wlan0 channel | grep 42`.

### Example 2: Associating with `wpa_supplicant` (PSK)
*Goal*: Connect to an SSID “HomeNet” with passphrase “S3cure!2025” using WPA2‑PSK.  

*Steps*:

1. **Create a configuration file** (`/etc/wpa_supplicant/wpa_supplicant.conf`):

```bash
cat <<EOF | sudo tee /etc/wpa_supplicant/wpa_supplicant.conf
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=US

network={
    ssid="HomeNet"
    psk="S3cure!2025"
    key_mgmt=WPA-PSK
    proto=RSN
    pairwise=CCMP
    group=CCMP
}
EOF
```

2. **Start wpa_supplicant** (assuming the wireless interface is `wlan0`):

```bash
sudo wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf
```

   *`-B` runs it in the background; `-i` selects the interface; `-c` points to the config.*

3. **Obtain an IP address** via DHCP:

```bash
sudo dhcpcd wlan0
```

   *Alternatively, use `sudo dhclient wlan0`.*

4. **Verify the link**:

```bash
iw dev wlan0 link
```

   Expected output shows `SSID: HomeNet`, `freq: 5240`, `txpower: 20.00 dBm`, and `signal: -45 dBm`.

### Example 3: Estimating Throughput of an 802.11ac Link
*Assumptions*: 80 MHz channel, 256‑QAM, 5/6 coding, short GI (0.8 µs), 1 spatial stream.  

*Computation* (same as in Core Concepts, repeated for clarity):

\[
\begin{aligned}
N_{\text{data}} &= 52 \times 4 = 208\\
\text{bits/symbol} &= 8\\
T_{\text{sym}} &= 3.2\ \mu\text{s} + 0.8\ \mu\text{s} = 4.0\ \mu\text{s}\\
R_{\text{raw}} &= 208 \times \frac{8}{4.0\ \mu\text{s}} \times \frac{5}{6}
               \approx 346.7\ \text{Mbps}.
\end{aligned}
\]

*Effective throughput* after MAC overhead (ACK, IFS, contention) is roughly 60 % of raw:

\[
\text{Goodput} \approx 0.6 \times 346.7 \approx 208\ \text{Mbps}.
\]

This matches typical `iperf3` results seen on a clean 802.11ac link.

---

## Common Mistakes
### 1. Assuming Non‑Overlapping Channels in 2.4 GHz
*What’s wrong*: Many administrators set APs to channels 1, 6, 11 and believe they are completely isolated.  
*Why it matters*: The 2.4 GHz channel mask is 22 MHz wide (for DSSS/HR/DSSS) or 20 MHz (for OFDM). Channels 1 and 5 overlap significantly; only 1, 6, 11 are non‑overlapping **in the US** because the band allows 11 channels. In Europe/Japan where channel 13 is allowed, the set {1, 5, 9, 13} is non‑overlapping. Using the wrong set causes co‑channel interference and reduces throughput.

### 2. Using WEP or TKIP in Production
*What’s wrong*: Configuring `key_mgmt=WEP` or `pairwise=TKIP` in `wpa_supplicant.conf`.  
*Why it matters*: WEP’s RC4 stream cipher is trivially broken (key recovery in < 1 minute with modern tools). TKIP was designed as a stopgap; it re‑uses the RC4 core and is vulnerable to packet‑injection attacks (e.g., Beck–Tews). Both expose the network to trivial eavesdropping and frame forgery. The correct choice is `pairwise=CCMP` (AES‑CCM) with `proto=RSN` (WPA2) or `proto=WPA` for WPA3‑Personal (SAE).

### 3. Ignoring the Regulatory Domain (`country` setting)
*What’s wrong*: Leaving `country=00` (world) or omitting the line entirely.  
*Why it matters*: The `cfg80211` subsystem enforces maximum transmit power, allowed channels, and DFS (Dynamic Frequency Selection) rules based on the country code. Without a correct code, the kernel may:
* Disable 5 GHz channels that are actually legal, forcing the device to fall back to 2.4 GHz and losing throughput.
* Allow transmission on a DFS channel without performing the required radar detection, which can cause illegal interference and potential fines.

### 4. Disabling Power Save Without Understanding Latency Trade‑offs
*What’s wrong*: Setting `iwconfig wlan0 power off` on a battery‑powered device to maximize throughput.  
*Why it matters*: Power save mode allows the station to doze between beacons, waking only to listen for buffered traffic. Disabling it keeps the receiver continuously active, increasing power consumption by 2–3× and raising temperature. For latency‑sensitive applications (VoIP, gaming) the trade‑off may be worthwhile, but for IoT sensors it drastically reduces battery life. The correct approach is to tune the `listen_interval` in `wpa_supplicant.conf` (e.g., `listen_interval=3`) to balance wake latency and power draw.

---

## Exercises
### Easy
1. **Scan and list**: Run `sudo iw dev wlan0 scan | grep SSID` and record the SSIDs and signal strengths of all visible APs.  
2. **Check regulatory domain**: Execute `sudo iw reg get` and verify that the reported country matches your location. If not, set it with `sudo iw reg set <CC>` (e.g., `US`).

### Medium
3. **Configure WPA2‑PSK manually**:  
   a. Generate a PSK from a passphrase and SSID using `wpa_passphrase "MySSID" "myPassphrase"`.  
   b. Insert the resulting `psk=` line into `/etc/wpa_supplicant/wpa_supplicant.conf`.  
   c. Bring up the interface with `wpa_supplicant` and `dhcpcd` as shown in Worked Example 2, then verify connectivity with `ping -c 3 8.8.8.8`.  

4. **Measure channel utilization**: Install `airmon-ng` (from the `aircrack-ng` suite) and run `sudo airodump-ng wlan0mon --output-format csv -w capture --band bg`. After 30 seconds, examine the CSV to compute the percentage of time the channel was busy (`RX`+`TX` frames vs. total slots).

### Hard
5. **Capture and analyze a WPA2‑PSK handshake**:  
   a. Put the interface in monitor mode: `sudo ip link set wlan0 down; sudo iw dev wlan0 set type monitor; sudo ip link set wlan0 up`.  
   b. Run `sudo airodump-ng --bssid <AP MAC> --channel <CH> -w handshake wlan0mon`.  
   c. From another machine, associate to the AP (using the correct passphrase) to trigger the 4‑way handshake.  
   d. Stop capture, then attempt to crack the PSK with `aircrack-ng -w <wordlist> handshake-01.cap`. Report the success/failure and discuss the time complexity relative to wordlist size.  
   *Note: Perform this only on a network you own or have explicit authorization to test.*

6. **Implement a basic 802.11 frame sniffer in C**: Using the `libnl-3` and `libnl-genl-3` libraries, write a program that subscribes to the `NL80211_CMD_FRAME` message, extracts the Frame Control field, and prints the subtype (e.g., “Association Request”) and the source MAC. Compile with `gcc sniffer.c -lnl-3 -lnl-genl-3 -o sniffer`. Run as root and verify output matches frames seen in `tcpdump -i wlan0 -e`.

---

## Linux Connection
### Kernel Subsystems
* **cfg80211** – the configuration API for 802.11 devices; exports `/sys/class/ieee80211/`.  
* **mac80211** – the generic MAC layer that drivers (e.g., `iwlwifi`, `ath9k`, `rtw88`) plug into; handles frame transmission/reception, power save, and mesh.  
* **nl80211** – the Netlink family used by user‑space tools (`iw`, `wpa_supplicant`, `NetworkManager`) to communicate with cfg80211/mac80211.  

Relevant sysfs entries (for interface `wlan0`):
```
/sys/class/net/wlan0/device/ieee80211/phy0/
/sys/class/net/wlan0/device/ieee80211/phy0/wifi_channels/
/sys/class/net/wlan0/device/ieee80211/phy0/wifi_bands/
```
These directories list supported frequencies, maximum TX power, and HT/VHT/HE capabilities.

### User‑Space Tools
| Tool | Purpose | Example Invocation |
|------|---------|---------------------|
| `iw` | Low‑level configuration (channel, TX power, interface type) | `sudo iw dev wlan0 set freq 5240` |
| `wpa_supplicant` | WPA/WPA2/WPA3 authentication, key management | `sudo wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf` |
| `iwlist` (legacy) | Scanning, frequency/bitrate listing | `sudo iwlist wlan0 scan` |
| `nmcli` (NetworkManager) | High‑level network control | `nmcli device wifi list`<br>`nmcli device wifi connect "HomeNet" password "S3cure!2025"` |
| `hostapd` | Soft‑AP / AP mode (for creating your own AP) | `sudo hostapd /etc/hostapd/hostapd.conf` |
| `tcpdump` / `wireshark` | Frame capture (requires monitor mode) | `sudo tcpdump -i wlan0mon -w capture.pcap` |

### Configuration Files
* **`/etc/wpa_supplicant/wpa_supplicant.conf`** – stores network blocks (SSID, PSK, key_mgmt, proto, pairwise, group).  
* **`/etc/NetworkManager/NetworkManager.conf`** – controls whether NM manages Wi‑Fi devices (`[device] wifi.scan-rand-mac-address=no`).  
* **`/etc/modprobe.d/`** – options for specific drivers (e.g., `options iwlwifi power_save=1`).
