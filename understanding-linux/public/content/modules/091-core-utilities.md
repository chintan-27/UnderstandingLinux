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

## Core Concepts
### Introduction to Core Utilities
Core utilities are the user‑space programs that implement the Unix philosophy of *small, sharp tools* that communicate via plain text streams and file descriptors. Each utility performs a single, well‑defined operation (search, transform, select, aggregate) and can be composed with others using pipes (`|`), redirections (`<`, `>`, `>>`), and subshells. This composability lets complex system‑administration tasks be expressed as short shell pipelines rather than monolithic programs.

The utilities discussed here—`grep`, `sed`, `awk`, `find`, `xargs`, `sort`, `cut`, `tr`, `ps`, and `top`—are all specified by POSIX and are present in every standard Linux distribution. Their implementations rely on a common set of system calls (`open`, `read`, `write`, `lstat`, `execve`, `wait4`) and on shared libraries (GNU Regex, PCRE2, libproc). Understanding their internal mechanics explains why they are fast, predictable, and safe to use in scripts that run as root or in confined containers.

---

## How It Works
### grep – Pattern Matching at the Kernel‑User Boundary
`grep` does not examine the file byte‑by‑byte in user space; instead it issues a series of `read(2)` calls that fill a buffer (typically 8 KiB). The GNU implementation compiles the user‑supplied pattern to either:
* a **fixed‑string Boyer‑Moore‑Horspool** matcher (average case ≈ O(N/M) where N = input length, M = pattern length) when the pattern contains no metacharacters, or  
* an **NFA** (Thompson construction) that is simulated on the fly when metacharacters are present (worst‑case O(N·M) but with early‑exit optimisations).

The matcher works on the buffer; when a match is found the entire line (delimited by `\n`) is written to stdout via `write(2)`. If the pattern is anchored (`^` or `$`) the engine can skip to the next newline immediately, reducing work.

*Why this matters:* By keeping the matching loop tight and using vectorizable character comparisons, `grep` can search multi‑gigabyte log files at > 300 MiB/s on a modern SSD.

### sed – Stream Editing with Pattern and Hold Spaces
`sed` operates in a **read‑transform‑write** cycle:
1. Read one line (delimited by `\n`) into the **pattern space**.
2. Apply the editing script address‑by‑address; each command may modify the pattern space, copy it to the **hold space**, or exchange the two.
3. Output the (possibly modified) pattern space (unless suppressed by `-n`).
4. Repeat until EOF.

The editing commands are essentially a tiny imperative language: `s/regexp/replacement/flags` substitutes using the same regex engine as `grep`; `b label` branches; `t label` branches on successful substitution; `y/charlist1/charlist2/` performs per‑character translation via a 256‑byte lookup table.

*Why this matters:* Because the algorithm never stores more than two lines in memory, `sed` can edit arbitrarily large files in constant space, making it safe for pipeline use in init scripts.

### awk – Pattern‑Action Language with Associative Arrays
`awk` reads input records (default: lines) and splits each record into fields (`$1`, `$2`, …) using either a single‑character delimiter (`-F`) or a regular expression (`-F` regex). For each record it evaluates a series of **pattern { action }** rules:
* If the pattern matches (or is omitted, meaning “always”), the associated action is executed.
* Actions may update variables, arrays, or call built‑in functions (`match`, `substr`, `system`, `printf`).

Internally, `awk` maintains a hash table (open addressing, linear probing) for associative arrays; look‑ups are amortized O(1). The field‑splitting step uses `memchr` for fixed delimiters or the regex engine for regex delimiters.

*Why this matters:* The combination of linear‑time scanning, constant‑time hash updates, and built‑in formatting makes `awk` ideal for rapid column‑wise summarisation of CSV or log files without writing a full program.

### find – Depth‑First Tree Walk with Boolean Expression Evaluation
`find` performs a **pre‑order depth‑first traversal** of the directory tree starting at each path argument. For each directory entry it obtains a `struct stat` via `lstat(2)` (to avoid following symlinks unless `-L` is given). The resulting metadata feeds a **postfix Boolean expression** built from primaries (`-name`, `-type`, `-size`, `-perm`, …) and operators (`-and`, `-or`, `-not`, `(`, `)`).

Expression evaluation follows short‑circuit rules: as soon as the final truth value is known, traversal of that subtree may be pruned (e.g., `-prune`). The complexity is Θ(N) where N is the number of visited filesystem objects; each `lstat` costs O(1) system‑call overhead.

*Why this matters:* By coupling the walk with early pruning, `find` can locate a single file among millions in sub‑second time when the criteria are selective (e.g., `-type f -name '*.conf'`).

### xargs – Safe Argument‑List Construction Under `ARG_MAX`
The kernel imposes a limit on the total size of an argument list and environment (`ARG_MAX`, typically 2 MiB on x86_64). `xargs` avoids exceeding this limit by:
1. Reading delimited items from stdin (default: whitespace; `-0` uses NUL for safety with weird filenames).
2. Accumulating items into an internal buffer until adding the next item would exceed `ARG_MAX - envsize`.
3. Invoking the target command with `execve(2)` on the buffered argument vector.
4. Repeating until stdin is exhausted.

If the command returns a non‑zero status, `xargs` can terminate (`-r`) or continue (`-i`). The `-P` flag spawns up to N parallel processes, each with its own argument buffer.

*Why this matters:* `xargs` turns a stream of filenames into a minimal number of `execve` calls, drastically reducing fork‑exec overhead when deleting or processing thousands of files.

### sort – External Merge Sort with Runtime‑Generated Keys
`sort` implements a **k‑way external merge sort**:
1. **Run generation:** Read chunks of size `-S` (default ~10% of RAM) into memory, sort them with `quicksort` (introsort) using a key extraction function, and write each sorted run to a temporary file (`mkstemp` under `$TMPDIR`).
2. **Merge phase:** Open all run files, maintain a min‑heap of the current smallest key from each run, repeatedly extract the minimum, write it to output, and refill the heap from the originating run.

The key extraction can be a simple byte comparison (`-n` converts strings to `long double` via `strtold`) or a user‑provided `-k` spec that defines field numbers and delimiters. Complexity: O(N log N) comparisons; I/O cost is O(N · log_{M} N) where M is the number of runs that fit in memory.

*Why this matters:* Even when the input exceeds RAM, `sort` guarantees O(N log N) time with bounded temporary‑disk usage, crucial for processing large datasets in batch jobs.

### cut – Field/Column Extraction with Multibyte Awareness
`cut` operates on three modes:
* **`-b`** (bytes): direct index into the raw byte array.
* **`-c`** (characters): converts the input to wide characters via `mbrtowc` (respecting `LC_CTYPE`), then indexes.
* **`-f`** (fields): splits each line by a delimiter (`-d`, default tab) using `strsep`; fields are counted starting at 1.

If the delimiter is a multibyte character, `cut` first translates the line to wide characters, splits, then optionally converts back to UTF‑8 for output. The algorithm is linear in input size with a small constant factor (single pass).

*Why this matters:* Correct handling of UTF‑8 prevents data corruption when extracting columns from localisation files or JSON‑pretty‑printed output.

### tr – Character Translation via Lookup Table
`tr` builds a 256‑entry table `trans[256]` initialized to `trans[i] = i`. For each command line argument:
* `tr SET1 SET2`: for each `c` in SET1, set `trans[c] = corresponding character from SET2` (padding/truncating as per POSIX).
* `tr -d SET1`: marks `trans[c] = 256` (a sentinel meaning “delete”).
* `tr -s SET1`: after translation, squeezes consecutive repeats of any character that appears in SET1.

During processing, each input byte `b` is replaced by `trans[b]` if `trans[b] < 256`; otherwise the byte is omitted. The operation is a single `read`/`transform`/`write` loop, O(N) time, O(1) space.

*Why this matters:* The constant‑time table makes `tr` ideal for high‑throughput tasks like normalising line endings (`tr '\r' '\n'`) or preparing data for legacy tools that expect ASCII only.

### ps – Process Information Extraction from `/proc`
`ps` does not invoke a special syscall; instead it walks the **process table** exposed via the `/proc` filesystem:
* Each PID appears as a directory `/proc/[pid]`.
* The file `/proc/[pid]/stat` contains whitespace‑separated fields: pid, comm, state, ppid, …, utime, stime, cutime, cstime, …
* The file `/proc/[pid]/status` provides formatted fields (VmSize, VoluntaryCtxtSwitch, etc.) and is easier to parse for numeric values.

`ps` reads these files with `open(2)`/`read(2)`, parses the ASCII decimal values into integers, and formats output according to the chosen format specifiers (e.g., `pid:user:%cpu:etime:args`). CPU utilisation percentages are calculated as:

$$
\text{\%CPU} = 100 \times \frac{(\Delta\text{utime} + \Delta\text{stime})}{\Delta\text{real\_time}} \times \frac{1}{N_{\text{online\_cpus}}}
$$

where Δ values are differences between two reads spaced by the polling interval.

*Why this matters:* By relying on the virtual `/proc` interface, `ps` works uniformly across architectures and container namespaces, providing low‑overhead monitoring without requiring ptrace privileges.

### top – Periodic Sampling with Incremental CPU Accounting
`top` is essentially `ps` wrapped in a **curses‑based UI** that refreshes every `delay` seconds (default 3.0). On each refresh it:
1. Reads `/proc/stat` to obtain global CPU times (user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice).
2. Reads `/proc/[pid]/stat` for each process (or a subset limited by `-p` or user filters).
3. Computes per‑process Δutime and Δstime since the last sample, then derives `%CPU` using the formula above.
4. Calculates memory usage from `/proc/[pid]/status` (`VmRSS`, `VmSize`).
5. Updates the display, sorts the process list according to the current sort key (default `%CPU`), and highlights the running process.

The UI uses the `ncurses` library for non‑blocking input and efficient screen redraws.

*Why this matters:* The incremental algorithm avoids re‑scanning the entire `/proc` tree for each metric; only the changed counters need to be read, giving `top` sub‑second responsiveness even on systems with > 10 k threads.

---

## Worked Examples
### Example 1 – Precise IPv4 Address Extraction with `grep -P`
Goal: Extract lines containing an IPv4 address **without** leading zeros (e.g., `192.168.01.5` should be rejected).

```bash
$ cat > ips.txt <<'EOF'
10.0.0.1
192.168.001.5
172.16.254.1
256.0.0.1
EOF
$ grep -P '(?<!\d)(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?!\d)' ips.txt
10.0.0.1
172.16.254.1
```
*Explanation*: The PCRE pattern uses negative look‑behind/‑ahead `(?<!\d)`/`(?!\d)` to ensure the address is not part of a longer digit string. Each octet is `(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`, which rejects leading zeros because the alternatives `[1-9]?\d` allow a single digit or a two‑digit number that does not start with `0`. The `-P` flag activates PCRE2 (more expressive than basic or extended regex).  

### Example 2 – In‑Place Log Rotation with `sed -i` and Backup
Goal: Rename all occurrences of `ERROR` to `WARN` in a rotating log, preserving the original in case of rollback.

```bash
$ cp app.log app.log.bak   # safety copy
$ sed -i.bak 's/\<ERROR\>/WARN/g' app.log
$ diff -u app.log.bak app.log   # view changes
```
*Explanation*: `\<` and `\>` are word‑boundary anchors in basic regex, preventing partial matches like `ERRORS`. The `-i.bak` flag tells GNU `sed` to edit the file in place, moving the original to `app.log.bak` before writing the new content. If the substitution fails (e.g., due to a permission error), the original file remains untouched because `sed` only renames the backup after successfully creating the temporary output.

### Example 3 – Summarising CSV Columns with `awk`
Goal: Compute the average response time (third column) for each unique endpoint (second column) from a CSV log `access.csv` where fields are comma‑separated and may contain quoted commas.

```bash
$ cat access.csv
"GET","/api/users",12.4
"POST","/api/login",45.2
"GET","/api/users",8.1
"GET","/api/login",30.0
$ awk -F', *' '
{
    gsub(/^"|"$/, "", $2)          # strip surrounding quotes from endpoint
    gsub(/^"|"$/, "", $1)          # strip quotes from method (optional)
    sum[$2] += $3
    cnt[$2]++
}
END {
    for (ep in sum)
        printf "%s: avg = %.2f ms\n", ep, sum[ep]/cnt[ep]
}' access.csv
/PI/users: avg = 10.25 ms
/api/login: avg = 37.60 ms
```
*Explanation*: `-F', *' ` tells `awk` to split on a comma followed by optional spaces, handling the CSV spacing. The `gsub` calls remove the double quotes that quote‑encapsulate each field. Two associative arrays, `sum` and `cnt`, accumulate totals and counts; the final `printf` prints averages with two‑decimal precision. The algorithm runs in O(N) time and O(U) memory, where U is the number of unique endpoints.

### Example 4 – Finding Large Files and Deleting Them Safely with `find` + `xargs`
Goal: Delete all regular files larger than 100 MiB under `/var/log`, but first show what will be removed.

```bash
$ find /var/log -type f -size +100M -print0 | xargs -0 -r ls -lh
/var/log/journal/XXXXXXXX/user-1000.journal: 124M
/var/log/apache2/access_log.1.gzs: 108M
$ # If the list looks correct, proceed to deletion:
$ find /var/log -type f -size +100M -print0 | xargs -0 -r rm -v --
```
*Explanation*: `-print0` and `xargs -0` use NUL as delimiter, guaranteeing correctness even when filenames contain spaces, newlines, or `-` characters. The `-r` flag prevents `xargs` from invoking `rm` with an empty argument list if `find` yields no matches. The `ls -lh` dry‑run shows human‑readable sizes; the final `rm -v` removes each file verbosely.

### Example 5 – Sorting by Multiple Keys with `sort`
Goal: Sort a table of employees first by department (ascending), then by salary (descending), finally by name (ascending). Input `employees.tsv` is tab‑separated.

```bash
$ cat employees.tsv
Sales   Alice   55000
Engineering   Bob   72000
Engineering   Alice   68000
Sales   Frank   61000
$ sort -t$'\t' -k1,1 -k3,3nr -k2,2 employees.tsv
Engineering   Bob   72000
Engineering   Alice   68000
Sales   Frank   61000
Sales   Alice   55000
```
*Explanation*: `-t$'\t'` sets the delimiter to a literal tab. `-k1,1` sorts on the first field (department) using the default ascending order. `-k3,3nr` sorts on the third field (salary) numerically (`n`) and in reverse (`r`). `-k2,2` sorts on the second field (name) ascending as a tie‑breaker. The sort algorithm is stable, so later keys only reorder elements that compare equal on earlier keys.

### Example 6 – Translating Newlines to Spaces with `tr`
Goal: Convert a paragraph where sentences are separated by double newlines into a single line with spaces between sentences.

```bash
$ cat paragraph.txt
Lorem ipsum dolor sit amet.

Consectetur adipiscing elit.

Sed do eiusmod tempor incididunt.
$ tr '\n' ' ' < paragraph.txt | tr -s ' '
Lorem ipsum dolor sit amet. Consectetur adipiscing elit. Sed do eiusmod tempor incididunt.
```
*Explanation*: The first `tr` turns every newline into a space. The second `tr -s ' '` squeezes consecutive spaces into a single one, eliminating the extra spaces that resulted from blank lines. The pipeline uses only two passes, each O(N) time and O(1) extra memory.

### Example 7 – Monitoring a Specific Process with `ps` and Watching Its Thread Count
Goal: Observe how the thread count of a Java application (`java -jar app.jar`) evolves over time.

```bash
$ # Start the app in background
$ java -jar app.jar &
$ # Repeatedly query its thread count (field 30 in /proc/[pid]/stat)
$ while true; do
      pid=$(pgrep -f app.jar)
      if [[ -n $pid ]]; then
          tcount=$(awk '{print $30}' /proc/$pid/stat)
          ts=$(date +%T)
          echo "$ts pid=$pid threads=$tcount"
      fi
      sleep 2
  done
```
*Explanation*: Field 30 of `/proc/[pid]/stat` is `num_threads` (the number of light‑weight processes). The loop uses `pgrep` to find the PID, then extracts the field with `awk`. This provides low‑overhead visibility without pulling in heavyweight tools like `top`.

### Example 8 – Calculating CPU Usage from `/proc` with `top` Batch Mode
Goal: Capture a one‑second snapshot of total CPU utilisation for capacity planning.

```bash
$ top -bn1 | grep "Cpu(s)" | sed -e 's/.*, *\([0-9.]*\)%* id.*/\1/' | awk '{print 100 - $1"%"}'
42.3%
```
*Explanation*: `-b` runs `top` in batch mode (no curses); `-n1` limits to a single iteration. The line containing `Cpu(s)` holds percentages of user, nice, system, idle, iowait, irq, softirq, steal. Extracting the idle percentage and subtracting from 100 yields the total non‑idle CPU usage. This technique is useful in cron jobs that log system load over time.

---

## Common Mistakes
### Mistake 1 – Assuming `grep` Treats the Dot `.` as Literal Without Escaping
**Wrong:**  
```bash
$ grep "version.2" notes.txt   # intends to match "version.2"
```
**Why it fails:** In basic and extended regular expressions, `.` matches *any* character. The pattern will also match `versionX2`, `version_2`, etc., producing false positives.  
**Fix:** Escape the dot or use fixed‑string search:  
```bash
$ grep "version\.2" notes.txt      # BRE/ERE
$ grep -F "version.2" notes.txt    # treat pattern as literal string
```

### Mistake 2 – Using `sed -i` Without a Backup on a Shared File
**Wrong:**  
```bash
$ sed -i 's/foo/bar/'
