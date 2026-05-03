---
id: 95
title: "Shared libraries and libc"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Why This Matters

Every C program calls functions like `printf`, `malloc`, and `read`. Without shared libraries, every binary would contain its own private copy of those implementations. A security patch to `malloc` would require recompiling every binary on the machine. A 10-line program would carry hundreds of kilobytes of I/O and memory code it shares with nothing.

Shared libraries solve this by letting many processes map the same physical pages of library code into their separate virtual address spaces simultaneously. The hard part: the library and the program are compiled independently, possibly years apart, and the program must still call into the library correctly at runtime — with no knowledge of where in memory the library will land, and no guarantee the library hasn't changed since the binary was built. This module is about how that coordination is engineered.

---

## Core Concepts

### libc: Syscall Wrapper and Userspace Utility Layer

`libc` (provided on Linux by `glibc`) lives entirely in userspace. It serves two distinct and separable purposes:

**1. Syscall wrappers.** The kernel exposes functionality through numbered syscalls invoked via the `syscall` instruction on x86-64. `libc` provides C-callable wrappers. When you call `write(fd, buf, n)`, `glibc`'s wrapper loads `fd` into `%rdi`, `buf` into `%rsi`, `n` into `%rdx`, the syscall number (`1` for `write`) into `%rax`, and executes `syscall`. On return, if `%rax` holds a value in $[-4095, -1]$, the wrapper negates it, stores it in `errno`, and returns `-1`. Without this wrapper you would do all of that manually for every syscall.

```c
// What glibc's write() wrapper does, conceptually:
ssize_t write(int fd, const void *buf, size_t count) {
    long ret;
    asm volatile (
        "syscall"
        : "=a"(ret)
        : "0"(SYS_write), "D"(fd), "S"(buf), "d"(count)
        : "rcx", "r11", "memory"
    );
    if (ret < 0) {
        errno = -ret;
        return -1;
    }
    return ret;
}
```

**2. Pure-userspace functionality.** Functions like `strlen`, `memcpy`, and `sprintf` never enter the kernel. They are optimized userspace code — on x86-64, `glibc`'s `memcpy` dispatches at runtime to AVX-512 or SSE2 variants depending on CPU features detected via `CPUID`. `libc` is not a thin syscall shim; it is a substantial, CPU-tuned library.

The separation matters: if you want to write code without `glibc`, you can invoke syscalls directly with inline assembly or `syscall(2)` — but you lose all the userspace utilities and the errno translation.

---

### API vs ABI: Two Different Contracts

**API (Application Programming Interface)** is the source-level contract: function names, argument types, return types, and header declarations. API compatibility means your code compiles against the new version without modification.

**ABI (Application Binary Interface)** is the binary-level contract:
- Which registers carry which arguments (the calling convention — on x86-64: `%rdi`, `%rsi`, `%rdx`, `%rcx`, `%r8`, `%r9` for integer args)
- How structs are padded and aligned
- The sizes of fundamental types (`sizeof(long)` is 8 on LP64, 4 on ILP32)
- Symbol names as they appear in the object file (C++ mangles them; C does not)

ABI compatibility means a binary compiled against version 2.0 of a library runs correctly against version 2.1 — **without recompilation**. Two libraries can be API-compatible but ABI-incompatible: same function signatures in the headers, but a changed struct layout means the compiled binary reads the wrong bytes at runtime. It compiles cleanly and crashes silently.

This is why `glibc` treats ABI stability as a hard constraint. Breaking it would silently corrupt running programs on every Linux system.

---

### Soname: Versioning Through Indirection

When you link a program against a shared library, the linker does not embed the library's filename. It embeds the library's **soname** — a name encoding only the major version. The real file on disk might be `libdemo.so.2.0.1`; the soname embedded in the binary is `libdemo.so.2`. A symlink connects them. The dynamic linker resolves the soname at runtime by following that symlink.

The consequence is precise:

- A **patch release** (`libdemo.so.2.0.0` → `libdemo.so.2.0.1`) retargets the soname symlink. Every already-running process that next `dlopen`s the library, and every new process, gets the fixed version. No binary needs to be relinked.
- A **breaking ABI change** requires a new major version (`libdemo.so.3`) with a new soname. Old binaries continue resolving `libdemo.so.2`. Both `.so.2` and `.so.3` coexist on disk.

The naming convention: `lib<name>.so.<major>.<minor>.<patch>`

```bash
# Inspect the soname embedded in a library
readelf -d /lib/x86_64-linux-gnu/libz.so.1.2.11 | grep SONAME
#  0x000000000000000e (SONAME) Library soname: [libz.so.1]
```

The linker name (`libdemo.so`), soname (`libdemo.so.2`), and real name (`libdemo.so.2.0.1`) form a three-level indirection:

```
libdemo.so       ->  libdemo.so.2         (used by linker at compile time)
libdemo.so.2     ->  libdemo.so.2.0.1     (embedded in ELF; followed at runtime)
libdemo.so.2.0.1                          (the actual file with code and data)
```

```bash
ls -la /lib/x86_64-linux-gnu/libc*
# lrwxrwxrwx libc.so.6 -> libc-2.35.so
# -rwxr-xr-x libc-2.35.so
```

`libc` has no unversioned linker symlink because you never link against it by hand — `gcc` passes `-lc` automatically and knows where to find it.

---

### The Dynamic Linker

`ld-linux-x86-64.so.2` (the dynamic linker) is itself an ELF shared object, but it is special: the kernel loads it directly, without going through another dynamic linker. Its path is embedded in the executable's `PT_INTERP` ELF segment. When the kernel `execve`s a dynamically linked binary, it maps the binary and then maps the dynamic linker, transferring control there — not to `main`, not to `_start`, but to the dynamic linker's own entry point.

The dynamic linker then executes, in order:

1. Reads the executable's `DT_NEEDED` entries to enumerate required libraries.
2. Locates each library by searching, in priority order: `DT_RPATH` embedded in the binary, `LD_LIBRARY_PATH` environment variable, `/etc/ld.so.cache` (built from `/etc/ld.so.conf`), then `/lib` and `/usr/lib`.
3. Maps each library into the process's virtual address space via `mmap(2)`.
4. Performs **relocations**: patches addresses in the GOT and PLT that could not be resolved at static link time.
5. Runs each library's constructors (functions listed in `.init_array`, or tagged `__attribute__((constructor))`).
6. Jumps to the executable's `_start` symbol (provided by `glibc`'s `crt1.o`), which calls `__libc_start_main`, which calls `main`.

Steps 1–5 are invisible to your program. They complete before the first line of `main` runs.

```bash
# Watch the dynamic linker's library search live
LD_DEBUG=libs /bin/ls 2>&1 | head -20
# Shows each library search path tried and which file was found

# See all dynamic linker debug categories
LD_DEBUG=help /bin/true
```

---

## How It Works

### From Source to Running Process

```bash
# Full pipeline, explicit stages
gcc -c hello.c -o hello.o           # compile: produces relocatable object
gcc hello.o -o hello                # link: produces ELF, adds DT_NEEDED for libc
# At execve("./hello"):
#   kernel reads PT_INTERP -> /lib64/ld-linux-x86-64.so.2
#   kernel maps ld-linux, transfers control to it
#   ld-linux reads DT_NEEDED, maps libc.so.6
#   ld-linux resolves PLT/GOT entries
#   ld-linux calls .init_array constructors
#   control passes to _start -> __libc_start_main -> main
```

### Inspecting a Binary's Dependencies

```bash
# DT_NEEDED tags: what the binary demands at runtime
readelf -d /bin/ls | grep -E 'NEEDED|RPATH|RUNPATH'
# (NEEDED) Shared library: [libselinux.so.1]
# (NEEDED) Shared library: [libc.so.6]

# PT_INTERP: which dynamic linker the kernel will load
readelf -l /bin/ls | grep interpreter
#       [Requesting program interpreter: /lib64/ld-linux-x86-64.so.2]

# Higher-level view: resolved library paths
ldd /bin/ls
# libselinux.so.1 => /lib/x86_64-linux-gnu/libselinux.so.1
# libc.so.6       => /lib/x86_64-linux-gnu/libc-2.35.so
```

`ldd` works by setting
