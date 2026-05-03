---
id: 200
title: "ABI, API, and compatibility"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

When you compile a program against a library today and run it two years from now on a newer kernel, something has to guarantee that the binary still works. The Linux kernel makes an explicit, enforceable promise: syscall interfaces are never broken for userspace — not because it's convenient, but because the asymmetry of cost makes anything else untenable. A single kernel change could silently corrupt data in millions of deployed binaries; absorbing the maintenance cost in the kernel once is cheaper than forcing every userspace program to adapt. Libraries make weaker, versioned promises. Understanding where these contracts live, what they guarantee, and precisely how they break tells you why a binary built on Ubuntu 18.04 runs on Ubuntu 22.04 without recompilation, why `strace` output means the same thing on a kernel from 2012 and 2024, and why the first thing to check when a deployment fails on a new host is the dynamic linker's version requirements.

## Core Concepts

### API vs. ABI

An **API** is a source-level contract: function signatures, argument types, return values, and semantics as expressed in header files. An **ABI** is the same contract at the binary level: which registers carry which arguments, how structs are laid out in memory (including padding and alignment), how symbol names are encoded in object files, and what calling convention governs stack frame construction. Two pieces of code can share an API and still break on an ABI mismatch.

The canonical example: a struct gains a field between the version the caller was compiled against and the version of the library loaded at runtime. The source still compiles — the API is unchanged — but the caller writes into memory assuming the old layout, corrupting fields in the new one. The ABI broke while the API did not.

Struct layout is governed by alignment rules. A field of type $T$ with size $s$ bytes is placed at the lowest offset that is a multiple of $\min(s, \text{platform\_alignment})$. On x86-64, the platform alignment for most types equals the type size, capped at 8 bytes. The total struct size is padded to a multiple of its largest member's alignment:

$$\text{sizeof}(\text{struct}) = \left\lceil \frac{\sum_i (\text{offset}_i + \text{size}_i)}{\text{align}_{\max}} \right\rceil \times \text{align}_{\max}$$

This means inserting a field anywhere but the end — or inserting a wider-aligned field at the end — changes every subsequent field's offset and the total size, breaking all compiled code that accesses those fields by offset.

### Syscall Stability

Each architecture maintains a syscall table mapping integers to kernel entry points. The number assigned to a syscall when it is first merged is permanent. On x86-64, `read` is syscall 0, `write` is 1, `open` is 2 — these have been stable since the architecture was introduced. The calling convention is equally stable: arguments in `rdi`, `rsi`, `rdx`, `r10`, `r8`, `r9`; syscall number in `rax`; return value (or negated errno on error) in `rax` after the `syscall` instruction returns.

This stability is enforced by policy, not by accident. Linus Torvalds has explicitly rejected patches that break userspace syscall behavior. New functionality gets new syscall numbers or new flags in existing arguments; old behavior is never removed.

### Library Versioning: soname and Symbol Versioning

Shared libraries use two independent mechanisms to manage compatibility:

**soname** encodes the major version in the library filename (e.g., `libfoo.so.2`). Your binary records the soname it was linked against; the dynamic linker resolves it at runtime. Two major versions can coexist on the same system because they have different filenames.

**GNU symbol versioning** goes further: a single `.so` file exports the same function name at multiple version labels (`read@GLIBC_2.2.5`, `read@GLIBC_2.35`). The linker records both the symbol name and the version label when building your binary. At runtime, `ld.so` verifies the loaded library provides a matching versioned symbol — not just the name. This lets a binary compiled against glibc 2.17 load correctly on a system running glibc 2.35 without recompilation, because glibc 2.35 still exports all symbols at their original version labels.

### Semantic Versioning and ABI Contracts

The dominant convention is `MAJOR.MINOR.PATCH`. The ABI compatibility contract:

- Same MAJOR, higher MINOR: backward compatible — new symbols added, old ones kept, no struct layout changes
- Same MAJOR, higher PATCH: bug fixes only — no interface changes of any kind
- Higher MAJOR: ABI break is explicitly permitted; dependent binaries must be relinked

The kernel uses `MAJOR.MINOR.PATCH` with different semantics: MAJOR changes are rare and largely political (2→3→4→5→6), and the version number carries no ABI guarantee for userspace. The actual guarantee lives in the syscall table, not in the version number.

## How It Works

### The Syscall Table

The x86-64 syscall table lives in `arch/x86/entry/syscalls/syscall_64.tbl` in the kernel source. Each entry maps a number to an ABI label and a kernel function:

```c
// arch/x86/entry/syscalls/syscall_64.tbl (excerpt)
// number  abi     name            entry point
0          64      read            __x64_sys_read
1          64      write           __x64_sys_write
2          64      open            __x64_sys_open
3          64      close           __x64_sys_close
9          64      mmap            __x64_sys_mmap
```

Userspace programs invoke a syscall by loading the number into `rax` and executing the `syscall` instruction. The CPU transfers control to the kernel's syscall entry point, which dispatches through the table and returns the result in `rax`. Errors are returned as $-\text{errno}$, so a return value $r < 0$ means $\text{errno} = -r$.

```asm
; x86-64: read(fd=0, buf, count=16)
mov     rax, 0          ; __NR_read
mov     rdi, 0          ; fd = stdin
mov     rsi, rbx        ; buf pointer
mov     rdx, 16         ; count
syscall
; rax now contains bytes read, or -errno on error
```

Verify the numbers on any running Linux system:

```bash
grep -E '__NR_(read|write|open|close|mmap) ' \
    /usr/include/x86_64-linux-gnu/asm/unistd_64.h
```

```
#define __NR_read                0
#define __NR_write               1
#define __NR_open                2
#define __NR_close               3
#define __NR_mmap                9
```

The same file exists on any x86-64 Linux installation. The numbers will be identical.

### How Struct Layout Breaks ABIs

```c
// libfoo v1.0 — layout your binary was compiled against
typedef struct {
    int   type;     // offset 0, size 4
    int   flags;    // offset 4, size 4
} foo_event_t;      // sizeof = 8

// libfoo v2.0 — layout in the library loaded at runtime
typedef struct {
    int   type;       // offset 0, size 4
    int   priority;   // offset 4, size 4  ← inserted here
    int   flags;      // offset 8, size 4  ← displaced by 4 bytes
} foo_event_t;        // sizeof = 12
```

Code compiled against v1.0 writes `flags` at byte offset $4$. Under v2.0, offset $4$ is `priority`. The binary corrupts `priority` on every write and reads stale data from `flags` — silently, with no linker or runtime error, because the ABI mismatch is invisible to `ld.so`.

The kernel avoids this by requiring callers to declare the struct size explicitly. `struct epoll_event` and `struct sigaction` follow the pattern of embedding a size or using reserved padding:

```c
// From <sys/epoll.h> — padding ensures stable binary size across architectures
typedef union epoll_data {
    void        *ptr;
    int          fd;
    uint32_t     u32;
    uint64_t     u64;
} epoll_data_t;

struct epoll_event {
    uint32_t     events;   // offset 0
    epoll_data_t data;     // offset 4 (but 8 on some ABIs due to alignment)
} __attribute__((packed)); // packed to suppress platform-dependent padding
```

The `__attribute__((packed))` and explicit alignment annotations in kernel UAPI headers are not style choices — they are ABI contracts expressed in C.

### Symbol Versioning in glibc

glibc uses version scripts at build time to assign version labels to every exported symbol. The version script syntax:

```
GLIBC_2.2.5 {
    global:
        read; write; open; close;
};

GLIBC_2.17 {
    global:
        clock_gettime;     # moved from librt into libc in 2.17
} GLIBC_2.2.5;             # GLIBC_2.17 depends on GLIBC_2.2.5

GLIBC_2.33 {
    global:
        pthread_attr_setaffinity_np;
} GLIBC_2.17;
```

The chained dependency means a binary requiring `clock_gettime@GLIBC_2.17` implicitly requires everything in `GLIBC_2.2.5` as well.

Inspect what version labels a binary was compiled against:

```bash
# Show all versioned symbol requirements for /bin/ls
objdump -p /bin/ls | grep -A 40 'Version References'

# Show all version definitions exported by glibc
readelf --syms --wide /lib/x86_64-linux-gnu/libc.so.6 | grep GLIBC_ | \
    awk '{print $NF}' | sort -u
