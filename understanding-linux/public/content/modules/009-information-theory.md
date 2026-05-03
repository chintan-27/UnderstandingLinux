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

## Why This Matters

Every time Linux writes a file, sends a packet, or stores a log, it faces the same fundamental problem: how much space does this data actually require, and how do you detect when it's been corrupted in transit? Without a mathematical theory of information, you'd be guessing — compressing data that can't be compressed, adding redundancy that doesn't catch errors, or saturating a network channel without knowing how close you are to its theoretical limit. Shannon's information theory, developed in 1948, gives precise answers to all three questions. It explains why `gzip` can compress your C source code by 70% but barely touches a JPEG, why TCP checksums catch most corruption but not all, and why there is a hard ceiling on how fast you can push bits through any channel.

---

## Core Concepts

### Surprise and Self-Information

Information is not about meaning — it's about surprise. The self-information of an event with probability $p$ is:

$$I(x) = -\log_2 p$$

The unit is **bits**. If a fair coin lands heads ($p = 1/2$), that's $-\log_2(1/2) = 1$ bit. If a biased coin lands heads with $p = 1/8$, that's $3$ bits — it's rarer, so observing it eliminates more uncertainty.

Why $-\log_2 p$ specifically? Because information must be **additive across independent events**. If two independent events occur with probabilities $p_1$ and $p_2$, the joint probability is $p_1 p_2$, but the information should be $I_1 + I_2$. Logarithms are the unique family of functions that map multiplication to addition: $-\log(p_1 p_2) = -\log p_1 + (-\log p_2)$. The base-2 logarithm is chosen so that one fair binary choice equals exactly one bit.

### Shannon Entropy

Entropy $H$ is the **expected** self-information over a source that produces symbols from a distribution. For a discrete random variable $X$ with outcomes $x_1, \ldots, x_n$ and probabilities $p_1, \ldots, p_n$:

$$H(X) = -\sum_{i=1}^{n} p_i \log_2 p_i$$

Entropy is maximized when all outcomes are equally likely — a uniform distribution over $n$ symbols gives $H = \log_2 n$ bits — and is zero when one outcome has probability 1. For a fair coin: $H = -(0.5 \log_2 0.5 + 0.5 \log_2 0.5) = 1$ bit. For a two-headed coin: $H = 0$.

This is not just abstract. Shannon's **source coding theorem** states that $H(X)$ is the minimum average number of bits per symbol required to represent a source losslessly. No compression scheme can do better on average; the best any scheme can do is approach $H(X)$.

To see why, consider that a lossless compressor must map every distinct input sequence to a distinct output. With $k$ bits you can represent at most $2^k$ distinct sequences. For a source producing $n$-symbol messages, the number of *likely* sequences (those whose probability is within a factor of $\epsilon$ of the maximum) concentrates near $2^{nH(X)}$ as $n \to \infty$ — the **asymptotic equipartition property**. You need roughly $nH(X)$ bits to index them. Fewer bits means collisions; collisions mean losses.

### Redundancy

Real sources are not uniform. English text has heavily unequal letter frequencies — 'e' appears ~13% of the time, 'z' ~0.07%. A non-uniform source over an $n$-symbol alphabet has entropy strictly less than $\log_2 n$. **Redundancy** quantifies the gap:

$$R = \log_2 n - H(X)$$

For English, $n = 26$ gives $\log_2 26 \approx 4.7$ bits, but the actual entropy of English is roughly 1.0–1.5 bits per character when long-range correlations are included. That leaves 3.2–3.7 bits/character of redundancy. With 8-bit ASCII encoding, the gap is even larger. This is exactly what `gzip` exploits via LZ77 + Huffman coding.

Redundancy can also be **introduced deliberately** — adding structured repetition so errors can be detected or corrected. These two uses (natural redundancy to be removed, engineered redundancy to be added) are the same mathematical phenomenon in opposite directions. A compressor minimizes $R$; an error-correcting code maximizes it in a controlled way.

### Noise and Channel Capacity

A **channel** is anything that transmits symbols: a network link, a disk sector, a RAM cell. Noise is any process that randomly corrupts symbols in transit. Shannon's **channel coding theorem** gives the capacity $C$: the maximum rate at which information can be transmitted with arbitrarily low error probability.

For the **binary symmetric channel** (BSC) — which flips each bit independently with probability $p$ — capacity is:

$$C = 1 - H(p) = 1 + p \log_2 p + (1-p) \log_2(1-p) \text{ bits per channel use}$$

When $p = 0$ (no noise), $C = 1$: every bit transmitted carries one bit of information. When $p = 0.5$ (pure noise), $C = 0$: the output is useless. At $p = 0.1$, $C \approx 0.531$ bits per use — you can still communicate reliably, but you must spend nearly half your bandwidth on error-correction structure.

The theorem says: for any rate $R < C$, there *exists* a coding scheme achieving error probability approaching zero as block length grows. For $R > C$, *no* scheme achieves this. This is a mathematical bound, not an engineering challenge. The bandwidth of a physical Ethernet or PCIe link is a Shannon limit in disguise.

---

## How It Works

### Building a Huffman Code

Huffman coding is the canonical implementation of entropy coding. Assign shorter bit strings to more probable symbols, longer strings to rare ones, such that no codeword is a prefix of another (prefix-free). The result has an average length $\bar{L}$ satisfying:

$$H(X) \leq \bar{L} < H(X) + 1$$

Consider a source with four symbols:

| Symbol | Probability | Self-information |
|--------|-------------|-----------------|
| A      | 0.5         | 1 bit           |
| B      | 0.25        | 2 bits          |
| C      | 0.125       | 3 bits          |
| D      | 0.125       | 3 bits          |

Entropy: $H = 0.5(1) + 0.25(2) + 0.125(3) + 0.125(3) = 1.75$ bits/symbol.

Tree construction (greedy, always merge two lowest-weight nodes):
1. Merge C (0.125) and D (0.125) → node CD (0.25)
2. Merge CD (0.25) and B (0.25) → node BCD (0.5)
3. Merge BCD (0.5) and A (0.5) → root (1.0)

Resulting code: A → `0`, B → `10`, C → `110`, D → `111`.

Average length: $0.5(1) + 0.25(2) + 0.125(3) + 0.125(3) = 1.75$ bits/symbol — exactly $H$ here because all probabilities are powers of $\frac{1}{2}$. When probabilities are not powers of 2, the $+1$ slack in the bound is unavoidable with symbol-at-a-time Huffman; arithmetic coding can approach $H$ arbitrarily closely by coding sequences rather than individual symbols.

```python
import heapq
from collections import Counter

def huffman_codes(text):
    freq = Counter(text)
    # Each heap entry: [weight, [[symbol, codeword], ...]]
    heap = [[w, [[sym, ""]]] for sym, w in freq.items()]
    heapq.heapify(heap)
    while len(heap) > 1:
        lo = heapq.heappop(heap)
        hi = heapq.heappop(heap)
        for pair in lo[1:][0]: pair[1] = '0' + pair[1]
        for pair in hi[1:][0]: pair[1] = '1' + pair[1]
        heapq.heappush(heap, [lo[0] + hi[0]] + [lo[1] + hi[1]])
    codes = {sym: code for sym, code in heap[0][1]}
    return codes

text = "aaaabbbccddddeeee"
freq = Counter(text)
codes = huffman_codes(text)
H = -sum((c/len(text)) * (c/len(text)).bit_length()  # rough
         for c in freq.values())

for sym in sorted(codes):
    p = freq[sym] / len(text)
    print(f"  {sym!r}: {codes[sym]:<6} len={len(codes[sym])}  p={p:.3f}")
```

The key insight driving `gzip`, `bzip2`, and `zstd` is that they all reduce to entropy coding after a modeling step: LZ77 (in gzip) extracts repeated substrings and encodes back-references, whose frequencies are then Huffman-coded. The modeling step reduces entropy; the entropy coder then compresses to that reduced $H$.

### Error Detection: CRC

Introduced redundancy for error detection exploits a different property: instead of minimizing code length, you choose codes where any corrupted message is unlikely to collide with a valid one.

A **cyclic redundancy check (CRC)** treats the message as a polynomial $M(x)$ over $\text{GF}(2)$ — the field with two elements where addition is XOR and multiplication has no carry. The transmitter computes the remainder:

$$R(x
