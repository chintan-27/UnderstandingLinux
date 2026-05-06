---
id: 99
title: "Scripting"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Core Concepts
### Shell as a Language Processor
A shell script is a program interpreted by a shell process. Unlike compiled languages, the shell performs **lexical analysis, parsing, and expansion** on each line before invoking any external program. The order of expansions is fixed (POSIX‑spec):

1. Brace expansion (`{a,b}` → `a b`)  
2. Tilde expansion (`~/bin` → `/home/user/bin`)  
3. Parameter and variable expansion (`$USER`, `${VAR:-default}`)  
4. Arithmetic expansion (`$((5+3))`)  
5. Command substitution (`$(date)` or backticks)  
6. Word splitting (according to `$IFS`)  
7. Pathname expansion (globbing)  
8. Quote removal  

Understanding this sequence explains why quoting matters and why certain constructs behave unexpectedly.

### Variables, Scoping, and Types
* **Shell variables** exist only in the current shell process.  
* **Environment variables** are exported to child processes via the `execve` environment vector (`char *envp[]`).  
* Assignment syntax: `VAR=value` (no spaces). Export: `export VAR` or `VAR=value command`.  
* All shell values are **byte strings**; arithmetic contexts (`$((…))`, `let`, `[[$VAR -gt 0]]`) interpret the string as a signed long using C integer arithmetic.  
* The kernel limits the total size of the argument and environment vectors passed to `execve` by `ARG_MAX` (typically 2 MiB). If the combined length of `argv`+`envp` exceeds this limit, `execve` fails with `E2BIG`.  
  $$
  \text{MAX\_VARS} \approx \frac{\text{ARG\_MAX}}{\overline{\text{len}(VAR)} + \overline{\text{len}(value)} + 1}
  $$  
  where the “+1” accounts for the terminating NUL byte per string.

### Control Structures
Control flow relies on the **exit status** of a command (0‑255).  
* `if`, `while`, `until` test the exit status of the *last* command in their condition.  
* `[` is a shell builtin (or `/usr/bin/[`) that evaluates its arguments and returns 0/1.  
* `[[ … ]]` is a Bash keyword that performs pattern matching, regex matching (`=~`), and logical operators without word splitting or globbing.  
* `for name in list; do … done` iterates over the *result of word splitting and pathname expansion* on `list` unless the list is quoted.  
* `select` generates a simple menu from a list, printing to stderr and reading input from stdin.

### Functions
Declared as `name() { compound-command; }` or `function name { … }`.  
* Functions create a **new execution context** for local variables (`local`) but share the same process as the caller.  
* Return status: `return N` (0‑255) becomes the function’s exit status; the function can also emit data on stdout/stderr for the caller to capture.  
* Because they run in the same process, functions can modify shell options (`set -e`), traps, and the working directory (`cd`)—something external commands cannot do.

---

## How It Works
### From Shebang to Process Creation
1. The kernel examines the first two bytes of the executable file. If they are `#!`, it runs the interpreter named after them, passing the script path as an argument (`argv[0]` = interpreter, `argv[1]` = script).  
2. The interpreter (e.g., `/bin/bash`) then:
   * Opens the script file for reading.  
   * Performs the expansion sequence described above on each line.  
   * For each **simple command**, it:
     1. **Forks** a child process (`fork()` system call).  
     2. In the child, applies redirections (`>`, `<`, `>>`, `2>&1`, etc.) via `dup2()`.  
     3. If the command is a **builtin** (`cd`, `export`, `alias`, `break`, `continue`, `return`, `exit`, `source/.`), it executes it in the **parent** shell (no fork) to allow state changes.  
     4. Otherwise, it calls `execve()` with the resolved command path and the current environment.  
     5. The parent waits (`waitpid()`) unless the command is backgrounded (`&`).  

   This fork‑exec model preserves file descriptors, signal dispositions, and environment while allowing the child to overlay a new program image.

### Variable Expansion Mechanics
When the shell encounters `$VAR` or `${VAR}`:
* It looks up `VAR` in the **shell variable table** (local) or, if not found, in the **environment** (exported variables).  
* The retrieved string is substituted **in‑place** before any further expansions (word splitting, globbing).  
* If the substitution occurs within double quotes (`"$VAR"`), the resulting string is treated as a single word; word splitting and globbing are suppressed.  
* Within single quotes (`'$VAR'`), no expansion occurs at all—the characters are literal.

### Command Substitution and Arithmetic
* `$(cmd)` runs `cmd` in a **subshell** (forked child), captures its **stdout**, strips trailing newline characters, and substitutes the result.  
* Arithmetic expansion `$((expr))` is evaluated by the shell’s internal arithmetic parser (C‑like precedence, 64‑bit signed on Linux). Example:
  ```bash
  $(( 2 * (3 + 4) ))   # → 14
  ```

### Exit Status Propagation
* Every command returns an 8‑bit status via `waitpid`.  
* Conventions:
  * `0` – success.  
  * `1‑125` – generic error.  
  * `126` – command found but not executable (permission denied or not a regular file).  
  * `127` – command not found in `$PATH`.  
  * `128+N` – terminated by signal N (e.g., `130` = SIGINT).  
* In a pipeline `cmd1 | cmd2 | cmd3`, the pipeline’s status is that of the **last** command unless `set -o pipefail` is enabled, in which case it is the **rightmost non‑zero** status. Bash provides the array `PIPESTATUS` to inspect each stage:
  ```bash
  false | true | false
  echo "${PIPESTATUS[@]}"   # outputs "1 0 1"
  ```

---

## Worked Examples
### Example 1: Safe Greeting with Parameter Expansion
```bash
#!/usr/bin/env bash
# Print a greeting; if NAME is unset or empty, use "World".
: "${NAME:=World}"
printf 'Hello, %s!\n' "$NAME"
```
**Step‑by‑step:**
1. `: "${NAME:=World}"` is a **null command** (`:`) that performs expansion only.  
   * Parameter expansion `${NAME:=World}` assigns `"World"` to `NAME` if `NAME` is unset or empty, then expands to the (possibly new) value.  
2. The assignment persists for the rest of the script because `:` runs in the current shell.  
3. `printf` receives two arguments: the format string and the value of `$NAME`.  
   * Because `$NAME` is quoted, word splitting and globbing are prevented—critical if `NAME` contains spaces or `*`.  
4. Output example with `unset NAME`:  
   ```
   Hello, World!
   ```

### Example 2: Summing Numeric Arguments with Validation
```bash
#!/usr/bin/env bash
# Usage: sum.sh 1 2 3
total=0
for arg; do                     # short for "for arg in \"$@\""
    if [[ ! $arg =~ ^-?[0-9]+$ ]]; then
        printf 'Error: "%s" is not an integer\n' "$arg" >&2
        exit 1
    fi
    (( total += arg ))
done
printf 'Sum: %d\n' "$total"
```
**Reasoning:**
* `for arg;` iterates over each positional parameter after word splitting (none occurs because `"$@"` is quoted implicitly).  
* The regular expression `^-?[0-9]+$` matches optional leading minus followed by one or more digits—ensuring the argument is a valid base‑10 integer.  
* Arithmetic assignment `(( total += arg ))` uses Bash’s arithmetic context; overflow wraps according to two’s‑complement 64‑bit arithmetic (the same as C `long long`).  
* If any argument fails validation, the script prints to **stderr** (`>&2`) and exits with status `1`.  
* Example run:
  ```bash
  $ ./sum.sh 10 20 -5
  Sum: 25
  $ ./sum.sh 10 abc
  Error: "abc" is not an integer
  ```

### Example 3: Logging System Uptime Every Minute via a Background Loop
```bash
#!/usr/bin/env bash
# uptime-logger.sh – appends a timestamped uptime line to /var/log/uptime.log
LOGFILE=/var/log/uptime.log
INTERVAL=60   # seconds

trap 'printf "Stopping uptime logger at %s\n" "$(date +%s)" >>"$LOGFILE"; exit' SIGTERM

while :; do
    ts=$(date +%s)                # epoch seconds
    up=$(cut -d' ' -f1 /proc/uptime)   # seconds since boot as float
    printf '%d %.2f\n' "$ts" "$up" >>"$LOGFILE"
    sleep "$INTERVAL"
done
```
**Explanation:**
* `/proc/uptime` contains two numbers: uptime in seconds and idle time; we extract the first field with `cut`.  
* The loop runs indefinitely (`while :; do`) until a `SIGTERM` is received (e.g., when the service is stopped).  
* `trap` installs a handler that writes a shutdown notice before exiting—demonstrating how scripts can clean up resources.  
* Each iteration writes a line like `1730784000 12345.67` (epoch, uptime).  
* To run as a system service, copy the script to `/usr/local/sbin/uptime-logger.sh`, make it executable, and create a systemd unit:
  ```ini
  # /etc/systemd/system/uptime-logger.service
  [Unit]
  Description=Periodic uptime logger

  [Service]
  Type=simple
  ExecStart=/usr/local/sbin/uptime-logger.sh
  Restart=on-failure

  [Install]
  WantedBy=multi-user.target
  ```
  Then `systemctl enable --now uptime-logger.service`.  

---

## Common Mistakes
| Mistake | Why It’s Wrong | Fix |
|---------|----------------|-----|
| **Unquoted variable expansion**<br>`rm $FILES` | After expansion, the shell performs **word splitting** and **globbing**. If `$FILES` contains `*` or spaces, unintended files may be removed. | Always quote: `rm -- "$FILES"` (or use an array). |
| **Using `[` without quoting**<br>`if [ $VAR = value ]; then` | If `$VAR` is empty or contains spaces, `[` sees malformed arguments (`[ = value ]`) → syntax error. | Quote both sides: `if [ "$VAR" = "value" ]; then` or prefer `[[ $VAR == value ]]`. |
| **Ignoring pipeline exit status**<br>`cmd1 | cmd2; if [ $? -eq 0 ]; then …` | `$?` reflects only the **last** command (`cmd2`). A failure in `cmd1` is hidden unless `pipefail` is set. | Use `set -o pipefail` or inspect `PIPESTATUS`: `if [[ ${PIPESTATUS[0]} -eq 0 && ${PIPESTATUS[1]} -eq 0 ]]; then`. |
| **Assuming backticks nest easily**<br>`output=`cmd1 \`cmd2\` `` | Backticks require escaping with a backslash for nesting; readability suffers. | Use `$()`: `output=$(cmd1 $(cmd2))`. |
| **Exporting to affect parent**<br>`export VAR=value; ./child.sh; echo $VAR` | `export` only affects **child processes**; the parent shell sees no change after the child exits. | Source the child (`source child.sh`) if you need to modify the parent, or redesign to avoid needing parent mutation. |

---

## Exercises
### Easy
1. **Date & Epoch** – Write a script `now.sh` that prints the current epoch time and an ISO‑8601 timestamp (`date -u +"%Y-%m-%dT%H:%M:%SZ"`).  
2. **File existence checker** – `exists.sh <path>` returns `0` if the file exists, `1` otherwise, using `test -e`.  

### Medium
3. **Sum with validation** – Extend Example 2 to accept numbers in **hexadecimal** (`0xFF`) or **octal** (`0755`) by detecting prefixes and using `$(( 0x$num ))` or `$(( 0$num ))`.  
4. **Passwd parser** – `userhomes.sh` reads `/etc/passwd`, splits each line on `:`, and prints `username → home-dir` pairs, one per line. Use `IFS=:` and `while read -r`.  

### Hard
5. **Log watcher with alert** – Create `watchlog.sh <logfile> <pattern> <email>` that:
   * Uses `inotifywait -m -e close_write --format '%f' "$logfile"` to detect appends.  
   * For each new line, if it matches `$pattern` (using `[[ $line =~ $pattern ]]`), sends an email via `mail -s "Alert" "$email" <<<"$line"`.  
   * Handles log rotation by reopening the file when its inode changes (compare `stat -c %i "$logfile"`).  
   * Cleans up the inotifywait process on `SIGTERM` via a trap.  
6. **Self‑building C program** – `buildrun.sh <source.c>`:
   * Creates a temporary directory with `mktemp -d`.  
   * Copies the source there, compiles with `gcc -Wall -Wextra -O2 source.c -o prog`.  
   * Runs `./prog`, captures its exit status, prints it, then removes the temporary directory on exit (`trap 'rm -rf "$tmpdir"' EXIT`).  

---

## Linux Connection
### Real‑World Locations Where Shell Scripts Appear
| Subsystem | Typical Path | Example Content |
|-----------|--------------|-----------------|
| **SysV init** | `/etc/init.d/` (scripts) <br> `/etc/rc*.d/` (S##name, K##name symlinks) | `/etc/init.d/cron` – starts/stops the cron daemon. |
| **Systemd** | `/etc/systemd/system/` (admin units) <br> `/usr/lib/systemd/system/` (distro units) | `ExecStart=/usr/sbin/sshd -D` in `sshd.service`. |
| **Cron** | User crontabs: `/var/spool/cron/crontabs/<user>` <br> System crontabs: `/etc/crontab`, `/etc/cron.d/*` | `0 2 * * * root /usr/local/sbin/cleanup.sh` – runs cleanup daily at 02:00. |
| **Logrotate** | `/etc/logrotate.conf` (main) <br> `/etc/logrotate.d/` (per‑app configs) | `/etc/logrotate.d/apache2` – rotates `/var/log/apache2/*log`. |
| **PAM** | `/etc/pam.d/` (service‑specific auth stacks) | `/etc/pam.d/sshd` – includes `auth required pam_unix.so`. |
| **Shell startup** | `/etc/profile` (login, interactive) <br> `/etc/bash.bashrc` (interactive non‑login) <br> `~/.bashrc`, `~/.bash_profile` | `/etc/profile` sets `PATH`, `umask`, and loads `/etc/profile.d/*` scripts. |
| **Environment** | `/etc/environment` (key=value pairs, no export) | `PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"` |
| **Kernel interfaces** | `/proc/` (process & system info) <br> `/sys/` (device tree) | `cat /proc/meminfo` → memory stats; `echo 1 > /proc/sys/net
