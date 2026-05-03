---
id: 91
title: "Core utilities"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Module 91: Core Utilities — `grep`, `sed`, `awk`, `find`, `xargs`, `sort`, `cut`, `tr`, `ps`, `top`

## Why This Matters

The kernel exposes its internal state as text: `/proc/net/tcp` lists every TCP socket with local/remote addresses and connection state; `/proc/$PID/maps` shows a process's entire virtual memory layout; `/proc/$PID/fd/` lists open file descriptors as symlinks. None of this is useful until you can filter it by field, join it with other output, and feed it into the next tool. These utilities are the query language for that data. When a process holds a deleted file open and is filling your disk, `lsof` is not always available — but `find /proc/*/fd -ls | grep deleted` is. Knowing the mechanics of each tool means you can compose them precisely, not just copy incantations from the internet.

---

## Core Concepts

### Text as the Universal Interface

Unix tools operate on streams of bytes organized as newline-delimited records. This design is enforced by the kernel: `pipe(2)` connects stdout to stdin entirely in memory via a kernel buffer (default 64 KB on Linux), with no disk I/O. Because the wire format is just bytes with newlines as record separators, any tool that writes to stdout can pipe into any tool that reads from stdin, with no shared schema negotiated in advance.

The kernel buffer size matters when you have a fast producer and slow consumer: if the producer fills the pipe buffer, it blocks on `write(2)` until the consumer drains it. This is why `xargs` batching and `sort`'s external merge strategy exist — they manage throughput, not just correctness.

### Regular Expressions and Engine Complexity

`grep`, `sed`, and `awk` all compile a regex into a finite automaton. The two flavors matter in practice:

- **BRE (Basic Regular Expressions)**: default in `grep`, `sed`. Grouping and alternation require escaping: `\(group\)`, `\|`.
- **ERE (Extended Regular Expressions)**: `grep -E`, `awk`. Unescaped: `(group)`, `|`, `+`, `?`.

An NFA-based engine (which GNU grep uses via the `libtre`/Henry Spencer engine path) matches a regex of length $m$ against a string of length $n$ in $O(mn)$ time. PCRE's backtracking engine can degrade to $O(2^n)$ on inputs crafted to cause catastrophic backtracking. Concretely: filtering a 1 GB log file with a pathological PCRE pattern can hang; the same pattern as an NFA-compiled ERE terminates in seconds.

GNU `grep` has a fast-path: when the pattern contains no regex metacharacters, it uses Boyer-Moore string search, which runs in $O(n/m)$ average time — sublinear because it skips characters. This is why `grep 'literal-string' bigfile` is faster than `grep -E 'literal.string' bigfile`.

### Field-Oriented vs. Stream-Oriented Processing

| Tool | Model | Unit of work | State across lines |
|------|-------|-------------|-------------------|
| `grep` | Filter | Whole line | None |
| `sed` | Stream editor | Line → pattern space | Hold space (one line) |
| `awk` | Field processor | Record → fields | Arbitrary variables |
| `cut` | Column extractor | Fields by delimiter or byte offset | None |
| `tr` | Byte mapper | Individual bytes | None |

The "state across lines" column explains capability limits. `sed` can join two lines using its hold space (`H`, `G`, `x` commands), but accumulating 1000 lines requires `awk` because `awk` can maintain arbitrary arrays across records.

### Process Observation: `/proc` as the Real Source

`ps` and `top` do not query a daemon. They open files under `/proc`, which is a virtual filesystem (`procfs`) the kernel populates on-demand when the files are opened. Every field in `ps aux` output maps to a specific field in `/proc/$PID/stat` or `/proc/$PID/status`.

```bash
# What ps reads to show CPU and memory for PID 1234:
cat /proc/1234/stat    # field 14 = utime, 15 = stime (in clock ticks)
cat /proc/1234/status  # VmRSS = resident set size in kB
cat /proc/1234/cmdline # argv[0..n] separated by NUL bytes
```

CPU percentage shown by `ps` is computed as:

$$\text{CPU\%} = \frac{(u_{\text{time}} + s_{\text{time}}) / \text{CLK\_TCK}}{\text{elapsed wall time}} \times 100$$

where `CLK_TCK` is typically 100 Hz (verify with `getconf CLK_TCK`). `top` repeats this calculation at each poll interval, which is why its percentages represent recent utilization rather than lifetime average.

---

## How It Works

### `grep` — Pattern Matching with Engine Awareness

```bash
grep -n 'pattern' file                        # matching lines with line numbers
grep -E '^[0-9a-f]+\s' /proc/net/tcp         # ERE: lines starting with hex field
grep -r --include='*.c' 'open(' /usr/src/    # recursive, filename-filtered
grep -v 'DEBUG' app.log                      # invert: lines NOT matching
grep -c 'ERROR' /var/log/syslog              # count of matching lines
grep -l 'OOM' /var/log/*.log                 # filenames only (for xargs)
```

`-l` exists because when you pipe `find | xargs grep -l`, you want filenames to act on, not the matching lines themselves. `grep` compiles the regex once and applies the automaton to each line; the per-line cost is $O(m \cdot L)$ where $L$ is the line length and $m$ is the regex length.

To see which regex engine path `grep` chose, `GREP_OPTIONS` and `strace -e trace=open grep ...` will show library calls. On GNU systems, `grep --version` reports if PCRE is linked.

### `sed` — Addresses, Pattern Space, Hold Space

`sed` maintains a *pattern space* (the current line) and a *hold space* (one persistent buffer). Commands are applied to lines matching an address. The address can be a line number, a regex, or a range.

```bash
sed -n '10,20p' file                          # print lines 10–20; -n suppresses default print
sed 's/foo/bar/g' file                        # substitute all per line
sed '/^#/d' config                            # delete lines matching regex
sed -i.bak 's/localhost/127.0.0.1/g' app.conf # in-place with .bak backup
sed -n '/START/,/END/p' file                  # print between two markers
sed -E 's/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/[REDACTED]/g' access.log  # ERE capture
```

`-i` rewrites the file by creating a temp file and renaming it — it is `rename(2)`, not an in-place byte overwrite. The `.bak` suffix names the backup. Without a suffix (`-i ''`), the original is unrecoverable.

The substitution syntax `s/regex/replacement/flags`: replacement uses `&` for the whole match, `\1` for group 1 (BRE: `\(group\)`; ERE with `-E`: `(group)`). Flag `g` replaces all occurrences; `I` (GNU extension) makes it case-insensitive.

**`sed` processing loop — what actually happens:**

```
open file
while read_next_line into pattern_space:
    for each command:
        if address matches:
            execute command (may modify pattern space, jump, branch)
    unless -n: write pattern_space to stdout
    clear pattern_space
```

This loop explains why `sed` cannot natively sort: it sees one line at a time with only one extra buffer. Multi-line operations require explicit `N` (append next line to pattern space) or `H`/`G` (copy to/from hold space).

### `awk` — Record Processing with Persistent State

`awk` is a small programming language. Each input line is a *record*, split into fields by `FS` (default: contiguous whitespace). The runtime is:

```
execute BEGIN block
for each record:
    split into $1..$NF
    for each rule: if pattern matches, execute action
execute END block
```

```bash
awk '{print $1, $3}' file                            # fields 1 and 3
awk -F: '{print $1, $3}' /etc/passwd                 # colon delimiter; username and UID
awk -F: '$3 > 999 {print $1, $3}' /etc/passwd        # regular users (UID ≥ 1000)
awk 'NR==1{next} {sum += $2} END{print sum}' data.txt # skip header, sum column 2
awk '$9 == 404 {count++} END{print count}' access.log # count HTTP 404s
awk '{bytes[$1] += $10} END{for (ip in bytes) print ip, bytes[ip]}' access.log  # per-IP byte sum
```

The last example accumulates an associative array across all records — impossible in `grep` or `sed`, trivial in `awk`. `awk` arrays are hash maps; access and insertion are $O(1)$ average.

**Diagnosing a device file with `awk` field filtering:**

From TLPI's inode examples: `ls -li /dev/sda1` shows fields including major and minor device numbers. `awk` applies positional logic that `grep` cannot:

```bash
ls -li /dev/ | awk '$6 == "8," && $7 == 1 {print $0}'
# $6 is major number (with comma), $7 is minor; selects /dev/sda1
```

`grep '8,\s*
