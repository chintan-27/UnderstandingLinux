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

## Why This Matters

Every system automation task — rotating logs, deploying configs, monitoring processes — requires coordinating processes, file descriptors, signals, and environment variables. Scripts break not because the language failed, but because the author misunderstood what the kernel does when they write `|` or `&` or `$(...)`. Understanding scripting from first principles means understanding which kernel primitives the interpreter is invoking, what those primitives cost, and what guarantees they do and do not provide.

---

## Core Concepts

### The Shell as a Process Orchestrator

The shell is a userspace process that parses text into commands and implements orchestration using five kernel primitives: `fork()`, `exec()`, `pipe()`, `dup2()`, and `wait()`. Every shell construct maps to some combination of these.

When you write:

```bash
cat /etc/passwd | grep root
```

The shell calls `pipe()` to create an `(r, w)` fd pair, `fork()`s twice, uses `dup2(w, STDOUT_FILENO)` in the `cat` child and `dup2(r, STDIN_FILENO)` in the `grep` child, closes the original pipe fds in both children, then calls `exec()` in each. The shell itself calls `waitpid()` on both children. There is no other mechanism — the shell is not doing anything the kernel does not expose to every other process.

The cost matters: each `fork()` copies the parent's page table (copy-on-write, but still $O(v)$ in the number of virtual memory areas $v$), and each `exec()` loads a new ELF image. A loop like:

```bash
for i in $(seq 1 1000); do
    result=$(date +%s%N)
done
```

creates approximately $2000$ processes — one `fork`/`exec` for the command substitution subshell and one for `date` — plus the initial `fork`/`exec` for `seq`. At even $1\,\text{ms}$ per fork-exec pair, that loop takes $\geq 2\,\text{s}$ just in process creation overhead, before `date` does any work.

### The Shebang Line

When `execve()` is called on a file, the kernel reads the first two bytes. If they are `0x23 0x21` (`#!`), the kernel's `binfmt_script` handler in `fs/binfmt_script.c` extracts the interpreter path and reconstructs the argument vector before re-entering `exec`:

```
execve("./script.sh", ["./script.sh"], envp)
  → kernel rewrites to:
execve("/bin/bash", ["/bin/bash", "./script.sh"], envp)
```

This is a kernel feature, not a shell feature. The script never runs directly — the kernel hands it to the interpreter.

Using `env` as the interpreter:

```bash
#!/usr/bin/env python3
```

causes the kernel to call `execve("/usr/bin/env", ["env", "python3", "./script.py"], envp)`. The `env` binary searches `PATH` and execs the first `python3` it finds. This is the correct idiom when Python may live in `/usr/bin`, `/usr/local/bin`, or a virtualenv — hardcoding `/usr/bin/python3` breaks on systems where the interpreter is elsewhere.

One subtlety: on Linux, the entire text after the interpreter path is passed as a single argument — not word-split. `#!/usr/bin/awk -f` passes `"-f"` as one string to `awk`. This is intentional and defined by `binfmt_script`, but it means you cannot pass multiple arguments to the interpreter via the shebang line on Linux (unlike on some BSDs).

### Environment Variables as Inherited Process State

Every process has an environment: a contiguous block of `KEY=VALUE\0` strings, terminated by a null pointer, passed as the third argument to `execve()`. The shell exposes this as variables. When you `export MYVAR=hello`, the shell writes into its own environment block. Any subsequent child created with `fork()`+`exec()` inherits a copy of that block.

```bash
export DATABASE_URL=postgres://localhost/mydb
./deploy.py    # receives DATABASE_URL in its environ
```

The critical constraint: environment inheritance is one-way. The child gets a copy; the parent's environment is unaffected by anything the child does. This is why `cd` must be a shell builtin — if `cd` were an external process, it would change its own working directory and exit, leaving the parent shell's cwd unchanged. The same logic applies to `export`, `set`, `umask`, and `ulimit`.

If a script must communicate a computed value back to its invoking shell, the only options are: write a file, use a pipe, or encode the value in the exit status. There is no other mechanism.

You can inspect what a process actually receives:

```bash
cat /proc/$$/environ | tr '\0' '\n' | grep PATH
```

The `/proc/<pid>/environ` file is the live environment block of the named process, with entries separated by null bytes.

### Exit Status and Error Propagation

Every process exits with a status in $[0, 255]$. The convention is $0$ for success, nonzero for failure — but the specific nonzero value carries meaning. `grep` exits $1$ when no lines match and $2$ on error. `diff` exits $1$ when files differ and $2$ on error. Scripts that ignore this distinction produce incorrect conditional logic.

The shell stores the last exit status in `$?`. The naive pattern:

```bash
cp /src/file /dst/file
if [ $? -ne 0 ]; then
    echo "copy failed" >&2
    exit 1
fi
```

is fragile because any command between `cp` and the `if` — including a subshell or even a function call — will overwrite `$?`. The idiomatic form avoids this:

```bash
cp /src/file /dst/file || { echo "copy failed" >&2; exit 1; }
```

`set -e` instructs the shell to exit immediately when any simple command returns nonzero, preventing silent failure cascades. Combine it with `set -u` (treat unset variables as errors) and `set -o pipefail` (a pipeline fails if any stage fails, not just the last):

```bash
#!/bin/bash
set -euo pipefail
```

Without `pipefail`, this silently succeeds even if `cat` fails:

```bash
cat /nonexistent/file | grep pattern
echo "exit: $?"    # prints 0 — grep found nothing, exited 0
```

With `pipefail`, the pipeline exit status is the rightmost nonzero exit status among all stages — $\max_{\text{nonzero}}$ of the stage exit codes, where ties are broken by rightmost position.

### Job Control, Process Groups, and Signals

The terminal driver delivers signals to a *process group*, not to an individual process. When you press `Ctrl-C`, the kernel sends `SIGINT` to every process in the foreground process group. A pipeline runs in its own process group — all stages receive the signal simultaneously.

Background jobs (`&`) are placed in a separate process group and do not receive `SIGHUP` when the controlling terminal closes. But the *shell* does receive `SIGHUP`, and by default many shells forward it to their child process groups before exiting. Whether your background job survives a terminal disconnect depends on which shell you are using and its configuration.

`nohup` works by setting `SIGHUP` to `SIG_IGN` before calling `exec()`:

```bash
nohup ./long_running_job.sh > /var/log/job.log 2>&1 &
```

Because signal dispositions marked `SIG_IGN` are preserved across `exec()` (unlike caught signals, which are reset to `SIG_DFL`), the script starts with `SIGHUP` permanently ignored for its lifetime. You can verify:

```bash
# In another terminal, send SIGHUP manually:
kill -HUP <pid>
# Process ignores it.
```

The alternative — `setsid` — disconnects from the controlling terminal entirely by creating a new session:

```bash
setsid ./job.sh > /var/log/job.log 2>&1 &
```

With no controlling terminal, there is no source of `SIGHUP` from terminal disconnect at all.

---

## How It Works

### Script Execution Through the Kernel

Running `./myscript.sh` triggers this kernel path:

1. `execve("./myscript.sh", ...)` enters the kernel
2. `fs/binfmt_script.c:load_script()` reads the first line, extracts `/bin/bash`
3. Kernel calls `execve("/bin/bash", ["/bin/bash", "./myscript.sh"], envp)` internally
4. `fs/binfmt_elf.c` loads the bash ELF image, maps segments, sets up the stack
5. Bash opens `myscript.sh`, reads it line by line with its own parser

Builtin commands (`cd`, `export`, `read`, `echo`) execute directly inside the bash process — no fork. External commands (`grep`, `awk`, `curl`) always fork. You can check whether a command is builtin:

```bash
type -a echo
# echo is a shell builtin
# echo is /usr/bin/echo
```

Calling `/usr/bin/echo` instead of the builtin forks a process to print a string. In a tight loop this is measurable:

```bash
time for i in $(seq 1 10000); do echo x > /dev/null; done        # builtin
time for i in $(seq 1 10000); do /usr/bin/echo x > /dev/null; done  # external
```

The external version is typically $5\text{–}10\times$ slower due to fork-exec overhead.

### Pipelines and File Descriptor Wiring

A three-stage pipeline:

```bash
ps aux | grep python | awk '{print $2}'
```

requires two `pipe()` calls, producing fd pairs $(r_1, w_1)$ and $(r_2, w_2)$, and three forks:

| Process | stdin  | stdout |
|---------|--------|--------|
| `ps`    | terminal | $w_1$ |
|
