---
id: 9
title: "Information theory"
supermoduleId: 1
estimatedMinutes: 45
resources:
  - type: book
    title: "Concrete Mathematics (Knuth)"
  - type: book
    title: "Introduction to Linear Algebra (Strang)"
---

## Core Concepts
### Entropy as Expected Self‑Information
For a discrete random variable \(X\) with probability mass function \(p(x)=\Pr[X=x]\), the **self‑information** of an outcome \(x\) is  
\[
I(x)=-\log_2 p(x) \quad\text{[bits]}.
\]  
Entropy is the expectation of self‑information:
\[
H(X)=\mathbb{E}[I(X)]=-\sum_{x} p(x)\log_2 p(x).
\]  
*Why this form?*  
- If an outcome is certain (\(p=1\)), \(I=0\) bits – no surprise.  
- If an outcome is rare (\(p\to0\)), \(I\to\infty\) – conveying it requires many bits.  
Thus \(H(X)\) measures the average number of bits needed to encode \(X\) when we can exploit the distribution.

### Source Coding Theorem (Compression Limit)
Let \(L\) be the average length (in bits per symbol) of any uniquely decodable code for i.i.d. copies of \(X\). Then  
\[
H(X)\le L < H(X)+\frac{1}{n}
\]  
for block length \(n\). In the limit \(n\to\infty\), the optimal average length approaches \(H(X)\) from above.  
*Consequence:* No lossless compressor can beat the entropy; practical algorithms (gzip, bzip2, xz) approach it by exploiting block‑wise redundancies.

### Channel Capacity for an AWGN Channel
Consider a continuous‑time channel with bandwidth \(B\) Hz, additive white Gaussian noise of power spectral density \(N_0/2\), and signal power \(S\). The signal‑to‑noise ratio is \(\text{SNR}=S/(N_0B)\). Shannon’s **Hartley‑Shannon law** gives the maximum reliable transmission rate:
\[
C = B\log_2\!\bigl(1+\text{SNR}\bigr) \quad\text{[bits/s]}.
\]  
*Derivation sketch:*  
1. Discretise the channel at the Nyquist rate \(2B\) real dimensions per second → \(B\) complex dimensions.  
2. Each dimension behaves like a scalar Gaussian channel with variance \(N_0/2\).  
3. The capacity per dimension is \(\frac12\log_2(1+\text{SNR})\) bits; multiplying by \(2B\) yields the formula.  
*Why it matters:* \(C\) is a hard ceiling; attempting to exceed it forces non‑zero error probability no matter how sophisticated the coding.

### Noise, Redundancy, and Error‑Correcting Codes
Noise introduces uncertainty that turns transmitted symbols into random variables at the receiver. **Redundancy** adds controlled dependence among transmitted symbols so that the receiver can infer the original message despite corruption.  
- **Detection:** A redundancy scheme can guarantee detection of up to \(t\) errors if the minimum Hamming distance \(d_{\min}\ge t+1\).  
- **Correction:** If \(d_{\min}\ge 2t+1\), the receiver can uniquely identify the transmitted codeword among all possibilities within Hamming radius \(t\).  
Thus redundancy trades increased bandwidth (or time) for reliability, exactly the trade‑off quantified by the channel coding theorem: rates below \(C\) can be achieved with arbitrarily low error probability using sufficiently long block codes.

### Compression Intuition via Entropy
Compression algorithms work by **removing statistical redundancy**.  
- **Statistical redundancy**: unequal symbol probabilities or dependencies (e.g., frequent bigrams).  
- **Algorithmic redundancy**: repeated patterns (captured by LZ77/78).  
When the algorithm’s output length approaches the entropy of the source, further compression would require discarding information (lossy).  

---

## How It Works
### 1. Source Encoding (Compression)
The source encoder maps sequences of source symbols to bitstrings.  
- **Goal:** Minimize average length while preserving decodability.  
- **Mechanism:** Exploit known \(p(x)\) (e.g., Huffman coding) or learn patterns adaptively (LZ‑based).  
- **Linux example:** `gzip` applies LZ77 followed by Huffman coding; `bzip2` uses Burrows‑Wheeler transform + move‑to‑front + Huffman.

### 2. Channel Encoding (Error Correction)
The channel encoder adds systematic redundancy:  
\[
\text{codeword}= G\cdot \text{message} \pmod{2},
\]  
where \(G\) is a generator matrix of a linear block code (e.g., Hamming, Reed‑Solomon, LDPC).  
- **Goal:** Increase minimum distance \(d_{\min}\) to combat noise.  
- **Trade‑off:** Code rate \(R = k/n\) (k info bits, n transmitted bits) reduces effective payload rate to \(R\cdot C_{\text{raw}}\).

### 3. Transmission
The modulated signal occupies bandwidth \(B\). Thermal noise sets the noise floor \(N_0B\). The received signal‑to‑noise ratio determines the achievable SNR term in the capacity formula.

### 4. Decoding
- **Channel decoder**: Uses syndrome decoding (linear codes) or belief propagation (LDPC) to find the most likely transmitted codeword.  
- **Source decoder**: Inverts the compression mapping (e.g., Huffman tree traversal) to recover the original symbol sequence.  

### Performance Metrics
- **Bit Error Rate (BER)**: \(\displaystyle \text{BER}= \frac{\#\text{incorrect bits}}{\#\text{transmitted bits}}\). For BPSK over AWGN, \(\displaystyle \text{BER}=Q\!\bigl(\sqrt{2\,\text{SNR}}\bigr)\) where \(Q\) is the Gaussian tail.  
- **Signal‑to‑Noise Ratio (SNR)**: Linear ratio \(S/N\); often expressed in dB: \(\text{SNR}_{\text{dB}}=10\log_{10}(S/N)\).  
- **Channel Capacity**: As above; used to check whether a chosen modulation and coding scheme (MCS) can support a target net bitrate \(R_{\text{net}}=R\cdot\log_2(M)\) (M‑ary modulation).

---

## Worked Examples
### Example 1: Entropy of a Four‑Symbol Source
Let \(X\in\{0,1,2,3\}\) with pmf  

| \(x\) | \(p(x)\) |
|------|----------|
| 0    | 0.15 |
| 1    | 0.25 |
| 2    | 0.30 |
| 3    | 0.30 |

Compute \(H(X)\):
\[
\begin{aligned}
H(X) &= -\bigl[0.15\log_2 0.15 + 0.25\log_2 0.25 \\
     &\qquad\quad +0.30\log_2 0.30 + 0.30\log_2 0.30\bigr] \\[4pt]
     &= -\bigl[0.15(-2.736) + 0.25(-2) + 0.30(-1.737) + 0.30(-1.737)\bigr] \\[4pt]
     &= 0.410 + 0.500 + 0.521 + 0.521 \\[4pt]
     &= \mathbf{1.952\ \text{bits}}.
\end{aligned}
\]  
*Interpretation:* Any lossless code for i.i.d. draws from this source needs ≥ 1.952 bits/symbol on average. A Huffman code for this distribution yields an average length of exactly 1.95 bits/symbol, meeting the bound.

### Example 2: Channel Capacity Calculation
A wireless link occupies \(B=5\ \text{MHz}\). The measured signal power is \(S=-70\ \text{dBm}\) and noise floor is \(N_0=-174\ \text{dBm/Hz}\).  

1. Convert to watts:  
   \[
   S = 10^{\frac{-70}{10}}\ \text{mW}=10^{-10}\ \text{W}=1\times10^{-10}\ \text{W},
   \]  
   \[
   N_0 = 10^{\frac{-174}{10}}\ \text{mW/Hz}=10^{-20.4}\ \text{W/Hz}\approx 3.98\times10^{-21}\ \text{W/Hz}.
   \]  
2. Noise power over the band:  
   \[
   N = N_0 B = 3.98\times10^{-21}\times5\times10^{6}=1.99\times10^{-14}\ \text{W}.
   \]  
3. Linear SNR:  
   \[
   \text{SNR}= \frac{S}{N}= \frac{1\times10^{-10}}{1.99\times10^{-14}}\approx 5.02\times10^{3}.
   \]  
4. Capacity:  
   \[
   \begin{aligned}
   C &= B\log_2(1+\text{SNR})\\
     &= 5\times10^{6}\,\log_2(1+5.02\times10^{3})\\
     &= 5\times10^{6}\,\log_2(5.03\times10^{3})\\
     &= 5\times10^{6}\,\bigl(\log_2 5.03 + \log_2 10^{3}\bigr)\\
     &= 5\times10^{6}\,(2.33 + 9.97)\\
     &= 5\times10^{6}\times12.30\\
     &= \mathbf{61.5\ \text{Mbps}}.
   \end{aligned}
   \]  
If we employ QPSK (2 bits/symbol) with a code rate \(R=3/4\), the net payload is  
\[
R\log_2 M \cdot B = \frac34 \times 2 \times 5\ \text{MHz}=7.5\ \text{Mbps},
\]  
well below the Shannon limit, leaving ample margin for coding gain.

---

## Common Mistakes
| # | Misconception | Why It’s Wrong |
|---|----------------|----------------|
| 1 | **“Entropy equals the information content of a single message.”** | Entropy is an *expectation* over the distribution; a particular outcome may have self‑information \(-\log p(x)\) that is far above or below \(H(X)\). Only the average over many symbols converges to \(H(X)\). |
| 2 | **“You can transmit at any rate below capacity with zero error using a fixed‑length block code.”** | The channel coding theorem guarantees arbitrarily low error probability *as block length → ∞*. Fixed‑length codes have a non‑zero error floor; to approach zero error you must increase block size (or use iterative decoding). |
| 3 | **“Adding more repetition (e.g., sending each bit three times) always improves reliability.”** | Simple repetition increases redundancy but does not maximize \(d_{\min}\) for a given overhead. A (3,1) repetition code has \(d_{\min}=3\); a (7,4) Hamming code achieves the same rate 1/3 with \(d_{\min}=3\) *and* detects 2 errors, correcting 1, using the same overhead more efficiently. |
| 4 | **“SNR in dB can be inserted directly into the capacity formula.”** | The formula requires linear SNR: \(\text{SNR}_{\text{lin}}=10^{\text{SNR}_{\text{dB}}/10}\). Using dB directly underestimates capacity by a factor of \(\log_2(1+10^{\text{SNR}_{\text{dB}}/10})\) vs. \(\log_2(1+\text{SNR}_{\text{dB}})\). |
| 5 | **“Compression ratio can exceed 1 / entropy for lossless compressors.”** | By the source coding theorem, no lossless compressor can have average length < entropy. Apparent ratios > 1/\(H\) arise only when the test file is not representative of the source distribution or when the compressor discards data (lossy). |

---

## Exercises
### 1. Entropy (Easy)
A source emits symbols \(\{A,B,C,D\}\) with probabilities \(\{0.1,0.2,0.3,0.4\}\).  
**(a)** Compute \(H(X)\) in bits.  
**(b)** Construct a binary Huffman code for this distribution and report its average length.  
**(c)** Compare the average length to the entropy and comment on the gap.

### 2. Run‑Length Encoding (Medium)
You have a binary file consisting of the byte pattern `00 00 00 FF FF 00 00 00 00 00`.  
**(a)** Apply run‑length encoding (RLE) where each run is stored as a pair \(\langle\text{length},\text{value}\rangle\) using a single byte for length (max 255) and a byte for value. Show the encoded byte sequence.  
**(b)** Calculate the compression ratio (original size / encoded size).  
**(c)** Discuss why RLE works poorly on data with low‑frequency runs and suggest a simple preprocessing step that could improve performance.

### 3. Channel Capacity & Design (Hard)
A wired Ethernet link has a usable bandwidth of \(B=125\ \text{MHz}\) (1000BASE‑T uses 4 pairs at 125 MHz each, but assume a single‑pair scenario). The measured noise power spectral density is \(N_0 = 4\times10^{-21}\ \text{W/Hz}\).  
**(a)** If the transmitted signal power is limited to \(P_t = 1\ \text{mW}\), compute the achievable Shannon capacity \(C\).  
**(b)** Suppose you need to reliably transmit a video stream at \(R_{\text{video}} = 50\ \text{Mbps}\). Determine the minimum required \(E_b/N_0\) (energy per bit to noise density) and express it in dB.  
**(c)** Recommend a practical modulation and coding scheme (e.g., 64‑QAM with LDPC rate 5/6) that meets the video rate with a margin of at least 3 dB. Show the calculations that lead to your choice.

---

## Linux Connection
### Data Compression Subsystems
| Tool | Algorithm | Typical Use | Example Command |
|------|-----------|-------------|-----------------|
| `gzip` | LZ77 + Huffman | Generic file compression | ```bash\n# compress a log file, keep original\ngzip -c /var/log/syslog > /var/log/syslog.gz\n``` |
| `bzip2` | Burrows‑Wheeler + MTF + Huffman | Higher compression, slower | ```bash\nbzip2 -dk /usr/share/doc/linux-firmware/LICENSE.bz2\n``` |
| `xz` | LZMA2 | Best compression ratio (used for kernel & deb packages) | ```bash\nxz -9e -c /boot/vmlinuz-$(uname -r) > /boot/vmlinuz.lzma\n``` |
| `zstd` | Fast LZ + FSE | Real‑time compression (used in btrfs, systemd) | ```bash\nzstd -T0 -19 -c /etc/passwd > /tmp/passwd.zst\n``` |

*Why it matters:* The compression ratio achieved by these tools approaches the entropy of the file; inspecting the output with ` entropy ` (see below) shows how close they get.

### Estimating Empirical Entropy of a File
```bash
# byte‑frequency histogram
hist=$(od -An -t x1 /bin/bash | tr -s ' ' '\n' | sort | uniq -c | awk '{print $1}')
# convert to probabilities and compute -∑p log2 p
entropy=$(echo "$hist" | awk '
{
    sum+=$1
}
END {
    for (i=1;i<=NR;i++) {
        p=$i/sum;
        if(p>0) ent-=p*log(p)/log(2);
    }
    print ent
}')
echo "Empirical entropy (bits/byte): $entropy"
```
Typical values: `/bin/bash` ≈ 7.9 bits/byte (near‑random), a text file ≈ 4.5 bits/byte.

### Error‑Detecting & Correcting Codes in the Kernel
* **EDAC (Error Detection and Correction)** subsystem – reports correctable/uncorrectable memory errors.  
```bash
# Show current EDAC counters
cat /sys/devices/system/edac/mc/mc0/ce_count   # correctable errors
cat /sys/devices/system/edac/mc/mc0/ue_count   # uncorrectable errors
```
* **CRC32** – used by many network packets and filesystems. Userspace utility:  
```bash
# Compute CRC32 of a file (from util-linux)
crc32 /boot/initrd.img-$(uname -r)
```
* **Reed‑Solomon** – underlying the `par2` utility for parity volumes and the RAID‑6 erasure coding in the md driver.  
```bash
# Create a RAID‑6 array with mdadm (two parity disks)
mdadm --create /dev/md0 --level=6 --raid-devices=4 \
      /dev/sdb1 /dev/sdc1 /dev/sdd1 /dev/sde1
```
* **LDPC** – used in the `dvb` kernel drivers for satellite TV; not directly exposed but illustrates modern capacity‑approaching codes.

### Network Protocol Analysis
```bash
# Capture TCP traffic on eth0, limit to 1000 packets, write to pcap
sudo tcpdump -i eth0 -c 1000 -w /tmp/trace.pcap
# Inspect retransmissions (indicator of bit errors or congestion)
tcpdump -r /tmp/trace.pcap 'tcp[tcpflags] & tcp-syn != 0 and tcp[tcpflags] & tcp-ack != 0'
```
High retransmission rates suggest the link is operating close to its Shannon limit or suffers from bursty noise.

### Cryptographic Primitives (Information‑Theoretic Security)
*One‑time pad* achieves perfect secrecy because the ciphertext entropy equals the key entropy. In practice, Linux provides AES‑256‑GCM (authenticated encryption) via `openssl` or the kernel’s `af_alg` interface.  
```bash
# Encrypt a file with AES‑256‑GCM, storing a 16‑byte nonce
openssl enc -aes-256-gcm -salt -in plaintext.txt -out cipher.bin \
    -pbkdf2 -iter 100000 -pass pass:strongsecret
```
The confidentiality bound relies on the key’s entropy (≥ 256 bits); if the key were predictable, the mutual information between plaintext and ciphertext would increase, violating Shannon’s secrecy theorem.

---

## Why This Matters
Information theory gives us **quantitative limits**—entropy for compression, channel capacity for reliable transmission—and constructive schemes (Huffman, LZ, Hamming, LDPC, Turbo codes) that approach those limits. In a Linux environment these limits manifest every day:

* **Storage:** Choosing `xz` over `gzip` is a trade‑off between compression ratio (approaching entropy) and CPU time; knowing the entropy of your data predicts the best possible gain.
* **Reliability:** Kernel EDAC counters let you measure real‑world bit‑flip rates; comparing them to the theoretical BER from SNR tells you whether your ECC DIMMs are providing the expected coding gain.
* **Networking:** When a TCP link shows frequent retransmissions, you can compute the link’s SNR from interface statistics (`ethtool -S eth0`) and compare the achieved throughput to the Shannon bound to decide whether to upgrade cabling, adjust modulation, or enable stronger FEC.
* **Security:** Understanding that perfect secrecy requires key entropy ≥ message entropy guides the selection of sufficiently long random keys (`/dev/urandom`) and warns against reusing nonces in AES‑GCM.

By grounding system‑tuning decisions in these theoretical bounds, administrators and developers move from folklore (“compress more”) to engineering (“we are within 0.3 bits/symbol of entropy; further gains require a different model of the data”). This shift from intuition to principled design is the payoff of mastering information theory.
