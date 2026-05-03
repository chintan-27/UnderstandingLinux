---
id: 90
title: "Shells"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Why This Matters

A shell is a process orchestrator built on `fork`, `exec`, `pipe`, `dup2`, and signal delivery. Every piece of shell syntax maps onto a specific sequence of these syscalls. Without that mapping, you cannot reason about why `grep foo | head -1` terminates early, why `cat > file &` immediately stops when job control is active, why closing a terminal kills foreground jobs but not always background ones, or why `nohup` and `disown` solve different problems. The shell is the most accessible lens through which to understand the Unix process model.

---

## Core Concepts

### Parsing and Word Splitting

The shell applies transformations to input text in a fixed order before any process is launched. The order is not arbitrary — later steps depend on the output of earlier ones:

1. **Tokenization** — split input into words and operators (`|`, `>`, `<`, `>>`, `&`, `;`, `(`, `)`)
2. **Parameter expansion** — replace `$VAR`, `${VAR:-default}`, `${#VAR}`, `$@`, `$*`
3. **Command substitution** — replace `$(cmd)` or `` `cmd` `` with the command's stdout (trailing newlines stripped)
4. **Arithmetic expansion** — evaluate `$(( expr ))` using integer arithmetic
5. **Word splitting** — split expansion results on characters in `$IFS` (default: space `\x20`, tab `\x09`, newline `\x0a`)
6. **Pathname expansion (globbing)** — expand `*`, `?`, `[...]` against the filesystem via `glob(3)`
7. **Quote removal** — strip unquoted `\`, `'`, `"` that were not consumed by earlier steps

Globbing runs *after* variable expansion, which means:

```bash
PATTERN="*.c"
ls $PATTERN     # glob fires: expands to matching filenames
ls "$PATTERN"   # glob suppressed: literal string "*.c" passed to ls
```

The quotes survive to step 7 because they are not consumed during parameter expansion. This is also why `for f in $@` splits on `$IFS` but `for f in "$@"` preserves each argument as a unit — `"$@"` is a special form that expands to individually quoted words.

Word splitting on `$IFS` has a subtle rule: leading and trailing IFS whitespace characters are consumed without generating empty tokens, but non-whitespace IFS characters (e.g., `:`) do generate empty tokens. This matters when parsing colon-delimited data like `$PATH`.

### Redirection

A redirection is a file descriptor manipulation in the child process after `fork()` but before `exec()`. The parent's file descriptor table is unaffected. Each redirection operator translates to a `dup2()` call, and they execute left to right, which means the order changes semantics:

```bash
command > file 2>&1   # (1) stdout → file; (2) stderr → dup of stdout → file
command 2>&1 > file   # (1) stderr → dup of stdout → terminal; (2) stdout → file
```

In the second form, `2>&1` duplicates fd 1 *at that moment* (the terminal), then `> file` redirects fd 1 to the file. Since fd 2 was already duplicated before the reassignment, stderr still points to the terminal. This is not a shell quirk — it is the semantics of `dup2(oldfd, newfd)` operating on the instantaneous state of the file descriptor table.

The `>` operator translates to:

```c
int fd = open("file", O_WRONLY | O_CREAT | O_TRUNC, 0666);
dup2(fd, STDOUT_FILENO);
close(fd);
```

The `>>` operator uses `O_APPEND` instead of `O_TRUNC`. The `O_APPEND` flag makes each `write()` atomic with respect to the file offset update, which is why multiple processes appending to the same log file do not corrupt each other's lines (as long as each write is smaller than `PIPE_BUF`, which is at least 512 bytes per POSIX and 4096 bytes on Linux).

Here documents (`<<EOF`) are implemented by writing the body to a temporary file (or a pipe in some shells), then redirecting stdin from that file.

### Pipelines

A pipeline `A | B | C` results in two `pipe()` calls (one per `|`), three `fork()` calls, and six `dup2()` calls (two per stage: wire the read end to stdin or the write end to stdout). The kernel creates an anonymous pipe with a circular buffer. On Linux the default pipe capacity is 65,536 bytes (64 KiB), configurable via `fcntl(fd, F_SETPIPE_SZ, size)` up to `/proc/sys/fs/pipe-max-size` (default 1 MiB).

The buffer capacity governs blocking behavior:

- When the buffer is full, `write()` on the write end blocks until the reader consumes data.
- When the write end is closed and the buffer is empty, `read()` on the read end returns 0 (EOF).
- When the read end is closed and a process writes to the write end, the kernel delivers `SIGPIPE` to the writer (default action: terminate). If `SIGPIPE` is ignored or blocked, `write()` returns `-1` with `errno = EPIPE`.

This explains `yes | head -1`: `head` reads one line and exits, closing the read end of the pipe. The next `write()` by `yes` triggers `SIGPIPE`, terminating it. Without that signal mechanism, `yes` would spin indefinitely.

Throughput across a pipe is bounded by the copy cost. The kernel uses `copy_page_to_iter` internally; with `splice(2)` or `vmsplice(2)`, you can move pages without copying, but standard pipelines pay the copy. For a naive pipe loop, throughput is approximately:

$$T = \frac{C_{\text{pipe}}}{t_{\text{write}} + t_{\text{read}}}$$

where $C_{\text{pipe}}$ is the pipe buffer capacity and the denominator is the round-trip scheduling latency. This is why large `dd` block sizes improve throughput over a pipe — fewer context switches per byte transferred.

### Job Control

A **session** is the top-level grouping: all processes sharing the same session ID (SID). A **process group** is a subset of a session. A **job** is the shell's abstraction over one process group. The shell assigns each pipeline its own process group.

```
Session (SID = shell's PID, set by setsid())
├── Process Group: shell (PGID = shell PID)
├── Process Group: [ grep foo file | sort | head ]  ← foreground job
└── Process Group: [ make -j8 ]                     ← background job
```

The terminal driver (in the kernel's `drivers/tty/` subsystem) tracks a single **foreground PGID** per terminal. `tcsetpgrp(fd, pgid)` updates this value. Only the foreground process group may read from the terminal; a background process that calls `read()` on the terminal receives `SIGTTIN` (default: stop).

Keyboard-generated signals are delivered by the terminal driver to the entire foreground process group simultaneously:

| Key | Signal | Default action |
|---|---|---|
| `Ctrl-C` | `SIGINT` | Terminate |
| `Ctrl-Z` | `SIGTSTP` | Stop |
| `Ctrl-\` | `SIGQUIT` | Terminate + core dump |

This is why `Ctrl-C` on a pipeline kills all stages at once — they share the foreground PGID, and the kernel iterates the process group sending the signal to each member.

---

## How It Works

### Fork-Exec-Pipe: Building a Pipeline

For `ls | wc -l`, the shell executes:

```c
int pipefd[2];
pipe(pipefd);            // pipefd[0] = read end, pipefd[1] = write end

pid_t pid1 = fork();
if (pid1 == 0) {
    dup2(pipefd[1], STDOUT_FILENO);  // ls writes to pipe
    close(pipefd[0]);
    close(pipefd[1]);
    execvp("ls", (char *[]){"ls", NULL});
    _exit(127);
}

pid_t pid2 = fork();
if (pid2 == 0) {
    dup2(pipefd[0], STDIN_FILENO);   // wc reads from pipe
    close(pipefd[0]);
    close(pipefd[1]);
    execvp("wc", (char *[]){"wc", "-l", NULL});
    _exit(127);
}

// Parent must close both ends.
// If pipefd[1] stays open in the parent, wc never sees EOF
// because the write end's reference count never reaches zero.
close(pipefd[0]);
close(pipefd[1]);

waitpid(pid1, NULL, 0);
waitpid(pid2, NULL, 0);
```

The EOF condition on a pipe is triggered when the reference count of the write end reaches zero. After both forks, the write end (`pipefd[1]`) is open in three processes: the parent, child 1, and child 2. Child 2 closes it immediately (it only reads). Child 1 closes it after `exec`. But the parent's copy persists until `close(pipefd[1])`. If the parent omits that close, `wc` blocks forever waiting for EOF that never arrives.

### Setting Up a Process Group

The shell calls `setpgid()` in both parent and child after each `fork()` to avoid a race condition: the shell may need to call `tcsetpgrp()` before the child has had a chance to run, so both sides perform the assignment:

```c
pid_t pid = fork();
if (pid == 0) {
    setpgid(0, 0);   // child: set PGID = own PID (new process group)
    // exec...
}
// Parent also calls setpgid in case it wins the scheduling race.
setp
