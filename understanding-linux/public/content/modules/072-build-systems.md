---
id: 72
title: "Build systems"
supermoduleId: 6
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Systems A Programmers Perspective (Bryant)"
  - type: book
    title: "The C Programming Language (K&R)"
---

## Why This Matters

When a project spans hundreds of source files, recompiling everything from scratch on every change is prohibitively slow — but recompiling too little leaves stale object files linked against changed headers, producing binaries that silently misbehave. A build system solves this by modeling the project as a dependency graph, performing a topological sort, and firing only the rules whose outputs are older than their inputs. Without this, cross-compilation becomes a manual flag-juggling exercise, reproducible builds are impossible, and CI pipelines fossilize around one engineer's `~/.bashrc`.

## Core Concepts

### Dependency Graphs

A build system models a project as a directed acyclic graph (DAG). Each node is a file — source, object, binary, or generated artifact. A directed edge $u \to v$ means "building $u$ requires $v$ to be current first." The system topologically sorts this graph, then walks it, rebuilding any node whose output is older than any input.

The staleness predicate is a timestamp comparison against every declared dependency:

$$\text{rebuild}(u) = \exists\, v \in \text{deps}(u) : t_v > t_u$$

where $t_x$ is the `mtime` of file $x$ in seconds since the Unix epoch. This is why touching a header — even without changing its content — triggers a rebuild: `mtime` records *when the file was last written*, not *whether the content changed*. Content-addressed build systems like Bazel use a cryptographic hash instead, so a no-op edit to a header does not cascade.

A cycle in the graph ($u \to v \to u$) is a fatal error because no valid topological ordering exists. `make` aborts immediately with "circular dependency dropped."

### Make and Makefiles

`make` encodes the DAG as *rules*:

```makefile
target: dependency1 dependency2
	recipe_command
```

The recipe line **must** be indented with a hardware tab character (`\t`), not spaces. This is not stylistic — `make` uses the tab as a parser sentinel to distinguish recipe lines from dependency lines. Spaces produce the error `missing separator`.

`make` provides two assignment operators whose difference matters for variable expansion:

- `:=` (simply expanded): the right-hand side is expanded **once**, at assignment time. Use this for variables that call `$(shell ...)` or depend on the current state of other variables — you want the value frozen.
- `=` (recursively expanded): the right-hand side is expanded **every time the variable is used**. This enables forward references but causes `$(shell ...)` calls to re-execute on every use, which is usually wrong.

Automatic variables resolve within a rule's recipe:

| Variable | Meaning |
|---|---|
| `$@` | The target name |
| `$<` | The first prerequisite |
| `$^` | All prerequisites (deduplicated) |
| `$*` | The stem matched by a `%` pattern |

### Reproducible Builds

A build is reproducible if identical source inputs produce bit-for-bit identical outputs regardless of build machine, time, or username. This matters for two concrete reasons: (1) binary transparency — you can verify that a distributed binary was compiled from the published source; (2) caching — a remote cache can serve a prebuilt artifact only if it can trust the hash of the output.

The most common sources of non-determinism are:

- **Embedded timestamps**: GCC embeds `__DATE__` and `__TIME__` macros; archive tools embed `mtime` in `.a` file headers.
- **`readdir` ordering**: filesystem directory iteration order is not guaranteed; if you glob source files and iterate them, the link order varies between filesystems (ext4 vs. tmpfs vs. APFS).
- **Host paths in debug info**: DWARF debug sections contain absolute source paths, so `/home/alice/project` and `/home/bob/project` produce different binaries.

### Cross-Compilation

Cross-compilation means the *host* (the machine running the compiler) differs from the *target* (the machine that will run the binary). The compiler itself is a native binary on the host that emits code for a foreign ISA.

The GNU toolchain triple `arch-vendor-os-abi` uniquely identifies the target. For example, `aarch64-linux-gnu` means: 64-bit ARM, no specific vendor, Linux kernel ABI, GNU userspace (`glibc`). The triple is not just a naming convention — the compiler is configured at build time with this triple, which determines which code generator backend is active and which default linker scripts are used.

A *sysroot* is a directory tree that mirrors the root filesystem of the target. It contains the target's headers (e.g., `sysroot/usr/include/`) and libraries (e.g., `sysroot/usr/lib/aarch64-linux-gnu/libc.so`). Without a sysroot, the linker falls back to the host's `/usr/lib`, silently linking against the host's `libc` — which is the wrong ISA and will produce a broken binary or a linker error about incompatible ELF classes.

## How It Works

### Make Execution Model

Given this source tree:

```
main.c  util.c  util.h
```

A correct `Makefile`:

```makefile
CC      := gcc
CFLAGS  := -Wall -O2

program: main.o util.o
	$(CC) $(CFLAGS) -o $@ $^

main.o: main.c util.h
	$(CC) $(CFLAGS) -c -o $@ $<

util.o: util.c util.h
	$(CC) $(CFLAGS) -c -o $@ $<

.PHONY: clean
clean:
	rm -f *.o program
```

When you edit `util.h`, `make` evaluates the staleness predicate for every node reachable from the default target:

$$t_{\texttt{util.h}} > t_{\texttt{main.o}} \implies \text{rebuild } \texttt{main.o}$$
$$t_{\texttt{util.h}} > t_{\texttt{util.o}} \implies \text{rebuild } \texttt{util.o}$$
$$t_{\texttt{util.o}} > t_{\texttt{program}} \implies \text{relink } \texttt{program}$$

`main.c` was not modified, but `main.o` is rebuilt because the dependency edge `main.o: util.h` was explicitly declared. This is the correctness guarantee of the build system: changes propagate to every output that could be affected, and no further.

The `.PHONY` declaration tells `make` that `clean` is not a real file. Without it, if a file named `clean` exists in the directory, `make clean` does nothing — the "target" appears up to date because the file exists and has no dependencies that are newer.

### Automatic Dependency Generation

Hand-maintaining header dependencies is the most common source of build correctness bugs. GCC's `-MMD -MP` flags solve this. `-MMD` writes a `.d` file containing a `make` rule listing all headers the translation unit actually includes. `-MP` adds a phony target for each header, preventing errors when a header is deleted (otherwise `make` aborts because a listed dependency no longer exists).

```bash
gcc -MMD -MP -c main.c -o main.o
cat main.d
```

```makefile
# main.d (generated):
main.o: main.c util.h
util.h:
```

Include these in the `Makefile` with:

```makefile
SRCS := $(wildcard *.c)
OBJS := $(SRCS:.c=.o)
DEPS := $(OBJS:.o=.d)

-include $(DEPS)
```

The leading `-` suppresses errors on the first build, when no `.d` files exist yet. On subsequent builds, the included `.d` files add header dependencies automatically, so the main `Makefile` never needs manual updates when `#include` directives change.

### Pattern Rules

Instead of a rule per translation unit:

```makefile
SRCS := $(wildcard *.c)
OBJS := $(SRCS:.c=.o)

%.o: %.c
	$(CC) $(CFLAGS) -MMD -MP -c -o $@ $<
```

`$(SRCS:.c=.o)` is a substitution reference — for each word in `SRCS` ending in `.c`, it produces the same word ending in `.o`. The `%` in a pattern rule is a stem wildcard: `%.o: %.c` means "for any target ending in `.o`, if a file with the same stem ending in `.c` exists, apply this recipe." `$*` in the recipe expands to the matched stem.

### Cross-Compilation with a Sysroot

```bash
# Install the cross toolchain on Debian/Ubuntu
sudo apt install gcc-aarch64-linux-gnu binutils-aarch64-linux-gnu

# Compile a standalone program (links against cross libc automatically)
aarch64-linux-gnu-gcc -o hello_arm hello.c

# Confirm the ELF target architecture
file hello_arm
# hello_arm: ELF 64-bit LSB pie executable, ARM aarch64, ...

# Inspect which dynamic linker the binary expects
readelf -l hello_arm | grep interpreter
# [Requesting program interpreter: /lib/ld-linux-aarch64.so.1]
```

That interpreter path is the AArch64 dynamic linker. If you copy this binary to an x86 host and attempt to run it without QEMU or binfmt_misc, the kernel's `execve` path will locate the interpreter, fail to execute it (wrong ISA), and return `ENOEXEC`.

For a project with library dependencies, provide a sysroot so the linker resolves symbols against target libraries, not host libraries:

```bash
aarch64-linux-gnu-gcc \
  --sysroot=/path/to/aarch64-sysroot \
  -o myapp main.c -lm
```

Parameterize the toolchain in `make` so the same `Makefile` serves both native and cross builds:

```makefile
CROSS   ?=
CC      := $(CROSS)gcc
AR      := $(CROSS)ar
OBJDUMP := $(CROSS)objdump
STRIP   := $(CROSS)strip
