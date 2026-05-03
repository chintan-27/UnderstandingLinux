---
id: 69
title: "Loaders and runtime startup"
supermoduleId: 6
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Systems A Programmers Perspective (Bryant)"
  - type: book
    title: "The C Programming Language (K&R)"
---

## Why This Matters

When you type `./hello`, the kernel executes `execve()` — a syscall that destroys the current process image and begins constructing a new one. The kernel cannot call `main()` directly because the binary may reference symbols in `libc.so` that don't exist anywhere in memory yet. Addresses in the `.text` segment are placeholders. The stack doesn't exist. The dynamic loader exists precisely to bridge the gap between an ELF file on disk and a runnable process image in memory. Understanding this pipeline explains why segfaults can occur before `main()`, why `LD_PRELOAD` can intercept any library call, why stripping a binary doesn't affect runtime behavior, and what the kernel actually hands to user space on `execve()`.

---

## Core Concepts

### The Process Image and Virtual Memory Areas

The kernel represents each contiguous, permission-uniform region of virtual memory as a **VMA** (Virtual Memory Area), implemented in the kernel as `struct vm_area_struct` in `mm/mmap.c`. You can inspect them at runtime:

```bash
cat /proc/self/maps
```

A typical dynamically linked process shows entries like:

```
555555554000-555555555000 r--p 00000000 fd:01 1234  /usr/bin/cat
555555555000-555555556000 r-xp 00001000 fd:01 1234  /usr/bin/cat
7ffff7dc0000-7ffff7de5000 r--p 00000000 fd:01 5678  /lib/x86_64-linux-gnu/libc.so.6
7ffff7de5000-7ffff7f5a000 r-xp 00025000 fd:01 5678  /lib/x86_64-linux-gnu/libc.so.6
7ffffffde000-7ffffffff000 rwxp 00000000 00:00 0     [stack]
```

Each line is one VMA: `start-end permissions offset device inode path`. The same physical `libc.so` file backs the `r-xp` VMA in every process that uses it — the kernel maps the same physical pages into multiple address spaces. This is why shared libraries save memory: a single copy of `libc`'s `.text` pages sits in the page cache and is mapped read-only into every process.

The canonical layout on x86-64 Linux (with ASLR) places segments at base addresses that are randomized within a range. The entropy is configurable:

```bash
cat /proc/sys/kernel/randomize_va_space   # 0=off, 1=stack/mmap, 2=full
```

With full ASLR, the mmap base for shared libraries is randomized by up to $2^{28}$ bytes (256 MiB) on x86-64. The stack base is randomized by up to $2^{23}$ bytes (8 MiB). The executable base (for PIE binaries) is randomized by up to $2^{17}$ pages. You can measure this:

```bash
# Run twice and compare addresses
ldd /bin/ls
ldd /bin/ls
```

### The ELF File: Segments vs. Sections

The distinction between segments and sections is load-time vs. link-time:

- **Sections** (`.text`, `.data`, `.bss`, `.symtab`, …) are for the linker and debugger. They can be stripped with `strip --strip-all` without affecting execution.
- **Segments** (program headers with type `PT_LOAD`, `PT_INTERP`, `PT_DYNAMIC`, …) are for the loader. They cannot be stripped.

Inspect them separately:

```bash
readelf -l /bin/ls        # program headers (segments) — what the loader reads
readelf -S /bin/ls        # section headers — what the linker/debugger reads
readelf -d /bin/ls        # .dynamic section — DT_NEEDED, DT_RPATH, DT_FLAGS
```

A `PT_LOAD` segment specifies:
- `p_vaddr`: where to map it in virtual memory
- `p_offset`: byte offset in the file to read from
- `p_filesz`: bytes to copy from file
- `p_memsz`: bytes to reserve in memory (`p_memsz - p_filesz` is zero-filled — this is how `.bss` works without occupying disk space)
- `p_flags`: `PF_R`, `PF_W`, `PF_X` permissions

The `PT_INTERP` segment contains the path of the dynamic loader, typically `/lib64/ld-linux-x86-64.so.2`. Its presence is what makes an executable "dynamically linked":

```bash
readelf -l /bin/ls | grep interpreter
# [Requesting program interpreter: /lib64/ld-linux-x86-64.so.2]

readelf -l /bin/busybox | grep interpreter   # static binary — no output
```

The ELF header field `e_entry` is the address where execution begins — but for dynamically linked binaries, this address lies inside `ld-linux.so`, not in your program:

```bash
readelf -h /bin/ls | grep "Entry point"
# Entry point address: 0x6aa0
# That's an offset within ld-linux.so, not main()
```

### What `execve()` Does in the Kernel

The kernel's `execve()` handler is `fs/exec.c:do_execve()`. Its work:

1. Opens the file, reads the first 128 bytes (the "binfmt" probe), identifies it as ELF via magic `\x7fELF`.
2. Calls the ELF binary handler (`fs/binfmt_elf.c:load_elf_binary()`).
3. Flushes the current process's entire address space: all existing VMAs are destroyed. After this point, there is no going back — this is why `execve` on failure must return an error *before* this step, not after.
4. Maps each `PT_LOAD` segment via `mmap()` with `MAP_FIXED`.
5. If `PT_INTERP` exists, maps the loader into the address space as well (as additional `PT_LOAD` segments from the loader's own ELF).
6. Allocates and maps a new stack.
7. Pushes the **auxiliary vector**, `envp`, `argv`, and `argc` onto the stack in a defined layout.
8. Sets `%rip` to the loader's entry point (or `e_entry` for static binaries) and returns to user space.

The entire kernel-side work is a series of `mmap()` calls — no data is copied into RAM yet. Pages are faulted in on first access. The cost of `execve()` is therefore mostly proportional to the number of segments, not their size:

$$T_{\text{execve}} \approx T_{\text{setup}} + N_{\text{segments}} \cdot T_{\text{mmap}} + T_{\text{stack}}$$

where $T_{\text{mmap}}$ is the cost of inserting a VMA into the kernel's red-black tree, $O(\log N_{\text{vma}})$.

### The Initial Stack Layout

The kernel constructs the stack in a precise format that `_start` depends on. `%rsp` points to:

```
High addresses
┌──────────────────────────┐
│  env strings (raw bytes) │  "HOME=/root\0PATH=/usr/bin\0..."
│  arg strings (raw bytes) │  "./hello\0-v\0"
├──────────────────────────┤
│  0                       │  auxv terminator (AT_NULL)
│  auxv[n].a_un.a_val      │
│  auxv[n].a_type          │
│  ...                     │
│  auxv[0].a_un.a_val      │
│  auxv[0].a_type          │
├──────────────────────────┤
│  NULL                    │  envp terminator
│  envp[m-1]               │  pointer into env strings above
│  ...                     │
│  envp[0]                 │
├──────────────────────────┤
│  NULL                    │  argv terminator
│  argv[argc-1]            │  pointer into arg strings above
│  ...                     │
│  argv[0]                 │
├──────────────────────────┤  ← %rsp
│  argc                    │  (8 bytes, not a pointer)
└──────────────────────────┘
```

`_start` in `crt1.o` (glibc source: `sysdeps/x86_64/start.S`) reads this directly:

```asm
_start:
    xor    %rbp, %rbp            ; mark outermost frame (ABI requirement)
    mov    (%rsp), %rdi          ; argc
    lea    8(%rsp), %rsi         ; argv = &stack[1]
    lea    16(%rsp,%rdi,8), %rdx ; envp = &stack[1+argc+1]
    call   __libc_start_main
```

The auxiliary vector entries of primary interest:

| `a_type` constant | Value | Purpose |
|---|---|---|
| `AT_PHDR` | 3 | VA of program headers (loader finds its own metadata) |
| `AT_PHNUM` | 5 | Number of program headers |
| `AT_ENTRY` | 9 | `e_entry` of the executable (loader uses this to call `_start`) |
| `AT_RANDOM` | 25 | VA of 16 kernel-generated random bytes (used for stack canary seed) |
| `AT_SYSINFO_EHDR` | 33 | VA of vDSO (virtual dynamic shared object) |

Read the live auxv:

```bash
LD_SHOW_AUXV=1 /bin/true
```

```bash
# Or inspect it via /proc:
xxd /proc/self/auxv | head
```

### The Dynamic Loader's Work

The loader (`ld-linux-
