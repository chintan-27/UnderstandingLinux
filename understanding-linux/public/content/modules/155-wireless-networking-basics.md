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

## Why This Matters

Wired Ethernet is a point-to-point medium: a frame either arrives intact or it doesn't arrive. Wireless removes that determinism. Every station within range shares the same physical medium — radio — and if two stations transmit simultaneously their signals superimpose destructively. Any receiver in range can decode your frames passively. Regulatory bodies partition spectrum into channels to prevent industrial equipment from drowning consumer devices. 802.11 (the IEEE standard behind Wi-Fi) is an engineering solution to three independent hard problems at once: contention on a shared medium, privacy on a broadcast medium, and coordination across a partitioned spectrum. Every mechanism in this module exists because of one of those three constraints.

## Core Concepts

### The 802.11 Architecture: BSS and ESS

A **Basic Service Set (BSS)** is one **Access Point (AP)** plus all **stations (STAs)** currently associated with it. All inter-station traffic flows *through* the AP — two laptops 30 cm apart still exchange frames via the AP. This is not an inefficiency; it is deliberate. The AP is the coordinator for channel access, power-save buffering, and the distribution system uplink. Bypassing it would break the coordination model.

The AP announces itself via a **BSSID** (its 48-bit MAC address) and an **SSID** (the human-readable name). Your kernel tracks the BSSID, not the SSID; two APs with the same SSID are distinct BSSes. An **Extended Service Set (ESS)** is multiple APs sharing the same SSID and connected via a distribution system (typically 802.3 Ethernet). The kernel's roaming logic decides when to reassociate to a different BSSID within the same ESS based on signal metrics, not the SSID string.

### Association: The State Machine

Joining a network is a four-phase state machine. Understanding each transition matters because failures at different phases produce different symptoms.

**Phase 1 — Scanning.** In *passive scanning*, the station listens for **beacon frames** broadcast by the AP every 102.4 ms (the nominal interval is 100 TUs; 1 TU = 1024 µs, so $100 \times 1024\,\mu\text{s} = 102.4\,\text{ms}$). In *active scanning*, the station broadcasts a **Probe Request** and waits for **Probe Responses**. Active scanning is faster but reveals the station's MAC address even before association. The beacon carries the SSID, supported rates, channel, capability flags, and the RSN IE (Robust Security Network Information Element) advertising which cipher suites the AP supports.

**Phase 2 — Authentication.** Open System Authentication is a two-frame exchange that always succeeds. It exists only to preserve the legacy state machine structure; it provides zero security. Real credential verification happens in Phase 4.

**Phase 3 — Association.** The station sends an **Association Request** listing its supported rates, HT/VHT/HE capabilities, and which cipher suites from the RSN IE it will use. The AP responds with an **Association Response** containing an **Association ID (AID)**, a 14-bit integer in $[1, 2007]$. The AID is not cosmetic: it maps to a bit in the AP's **Traffic Indication Map (TIM)**, broadcast in every beacon, telling power-saving stations whether the AP has buffered frames for them. A station in power-save mode wakes up, reads the TIM, and polls for its frames only if its AID bit is set.

**Phase 4 — 4-Way Handshake (WPA2/WPA3).** Derives per-session encryption keys. Covered below under Encryption.

### Channels and Frequency Bands

Radio spectrum is divided into **channels** — named frequency ranges with defined center frequencies and bandwidths. The allocation matters because regulations determine what you can legally transmit, and overlap determines what interferes with you.

| Band | Typical Standards | Channel Width |
|------|-------------------|---------------|
| 2.4 GHz (ISM) | 802.11b/g/n | 20 MHz (40 MHz with HT) |
| 5 GHz (U-NII) | 802.11a/n/ac | 20 / 40 / 80 / 160 MHz |
| 6 GHz (U-NII-5–8) | 802.11ax (Wi-Fi 6E) | 20 / 40 / 80 / 160 MHz |

The 2.4 GHz band spans 2.401–2.495 GHz with 14 channels spaced 5 MHz apart, but each channel is 22 MHz wide. Channels therefore overlap — transmitting on channel 3 partially occupies channel 1's spectrum. The center frequency of channel $n$ is:

$$f_n = 2407 + 5n \;\text{MHz}, \quad n \in \{1, \ldots, 13\}$$

Channel 14 (Japan only) is fixed at 2484 MHz, not following this formula. For channels 1, 6, and 11: $f_1 = 2412$, $f_6 = 2437$, $f_{11} = 2462$ MHz. The gap between centers is 25 MHz but channel bandwidth is 22 MHz, leaving 3 MHz guard on each side — enough to be considered non-overlapping. This is why 2.4 GHz deployments with multiple APs use *only* channels 1, 6, and 11.

The 5 GHz band has non-overlapping 20 MHz channels spaced 20 MHz apart (e.g., 36, 40, 44, 48, ...) with no inherent overlap, which is the primary reason 5 GHz performs better in dense environments, not the higher frequency per se.

### Medium Access: CSMA/CA and DCF

Ethernet uses CSMA/**CD** (Collision *Detection*): a transmitter detects its own collision by measuring the wire voltage while transmitting. A wireless transmitter cannot do this — its own transmitted signal is orders of magnitude stronger than any received signal, so the receive path is effectively deaf during transmission. The protocol must therefore *prevent* collisions rather than detect them.

The **Distributed Coordination Function (DCF)** operates as follows:

1. **Carrier sense**: sample the channel. If the measured energy exceeds the Clear Channel Assessment (CCA) threshold (typically −62 dBm for 802.11g), the channel is busy.
2. **DIFS wait**: after the channel becomes idle, wait one **DCF Interframe Space** ($\text{DIFS} = \text{SIFS} + 2 \times t_{slot}$; for 802.11g: $16\,\mu\text{s} + 2 \times 9\,\mu\text{s} = 34\,\mu\text{s}$).
3. **Backoff**: draw a random integer $k$ uniformly from $[0, CW]$ and count down $k$ slots, pausing whenever the channel is sensed busy.
4. **Transmit** when the counter reaches 0. The receiver responds with an **ACK** after one **SIFS** ($16\,\mu\text{s}$). If the ACK does not arrive, the sender assumes a collision, doubles $CW$ (binary exponential backoff), and retries.

The contention window starts at $CW_{min} = 15$ and grows to $CW_{max} = 1023$ on repeated failures, resetting to $CW_{min}$ after a successful ACK. The expected backoff before any given attempt is:

$$E[\text{backoff}] = \frac{CW}{2} \times t_{slot}$$

For the first attempt with 802.11g: $E = 7.5 \times 9\,\mu\text{s} = 67.5\,\mu\text{s}$. For the worst case (seventh retry, $CW = 1023$): $E = 511.5 \times 9\,\mu\text{s} \approx 4.6\,\text{ms}$.

The **hidden terminal problem** exposes a fundamental limitation of carrier sense: station A and station C can both hear the AP but not each other. A senses an idle channel, C senses an idle channel, both transmit simultaneously, their frames collide at the AP, and neither detects it. **RTS/CTS** addresses this: station A sends a short Request-To-Send; the AP broadcasts a Clear-To-Send heard by all stations including C, which then defer. RTS/CTS adds overhead and is typically enabled only for large frames.

### Encryption: WEP → WPA → WPA2 → WPA3

**WEP** encrypts using RC4 with a keystream seeded by a concatenation of a 24-bit IV and the static key. The keystream is XOR'd with the plaintext: $C = P \oplus \text{RC4}(\text{IV} \| K)$. With $2^{24} = 16{,}777{,}216$ possible IVs, collisions are inevitable on a busy network. When two frames share the same IV, $C_1 \oplus C_2 = P_1 \oplus P_2$, and known-plaintext attacks recover the keystream directly. The FMS attack (Fluhrer, Mantin, Shamir) exploits weak RC4 key scheduling with specific IV patterns to recover $K$ with roughly 40,000–85,000 captured frames. WEP is broken at the algorithmic level; no implementation can fix it.

**WPA-TKIP** was a firmware-upgradable patch: it added per-packet key mixing (defeating the FMS IV weakness) and a Michael MIC (Message Integrity Code) to detect forgery. It still used RC4. TKIP has since been deprecated; 802.11-2012 removes it.

**WPA2-CCMP** replaces RC4 with AES in **CCM mode** (Counter Mode + CBC-MAC), providing both confidentiality and integrity in a single pass. The key hierarchy for WPA2-Personal:

```
Passphrase + SSID → PBKDF2-SHA1 (4096 iterations) → PSK (256 bits)
PSK + ANonce + SNonce + AP MAC + STA MAC → PRF-512 →
