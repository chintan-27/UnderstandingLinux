---
id: 204
title: "FFI and language interoperability"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Foreign Function Interface (FFI) Fundamentals
FFI is the mechanism by which a program invokes code whose definition resides in a separate binary object, typically a shared library (.so). The need arises because:
* **Code reuse** – avoiding duplication of widely used routines (e.g., `libc`, `libm`).  
* **Performance** – moving hot paths to native code while keeping high‑level logic in a safer language.  
* **Policy separation** – plug‑in architectures let third parties extend functionality without recompiling the host.

From first principles, a process’s virtual address space is divided into segments (text, data, heap, stack). A shared library contributes its own text and data segments that are **mapped** into the caller’s address space at runtime. The loader must therefore:
1. **Locate** the library file on disk (searching `LD_LIBRARY_PATH`, `/etc/ld.so.cache`, etc.).  
2. **Map** its ELF sections with appropriate permissions (`PROT_EXEC` for text, `PROT_READ|PROT_WRITE` for data).  
3. **Resolve** each undefined symbol in the caller to a concrete address inside the mapped region.

### Calling Conventions and the System V ABI
On x86‑64 Linux the dominant ABI is the **System V AMD64 ABI**. It dictates:
* **Argument passing** – first six integer/pointer arguments in registers `RDI, RSI, RDX, RCX, R8, R9`; subsequent arguments on the stack, 8‑byte aligned.  
* **Return values** – `RAX` (and `RDX` for a second 64‑bit value).  
* **Callee‑saved registers** – `RBX, RBP, R12‑R15` must be preserved across calls.  
* **Stack layout** – the caller pushes a return address; the callee may allocate a red zone of 128 bytes below `RSP` without adjusting `RSP`.

Why does this matter for FFI? If the caller and callee assume different conventions, registers will be clobbered, stack misaligned, or arguments interpreted incorrectly → **segmentation fault** or silent data corruption. The dynamic linker generates **Procedure Linkage Table (PLT)** entries that enforce the ABI by moving arguments into the correct registers before jumping to the actual function address.

### Shared Libraries and ELF
A Linux shared library is an **ELF** object with type `ET_DYN`. Key sections:
| Section | Purpose | Flags |
|---------|---------|-------|
| `.text` | executable code | `AX` |
| `.rodata` | read‑only constants | `A` |
| `.data` | writable initialized globals | `WA` |
| `.bss` | writable zero‑filled globals | `WA` |
| `.dynsym` | dynamic symbol table (exported/imported) | none |
| `.dynstr` | string table for `.dynsym` | none |
| `.rel.plt` / `.rela.plt` | relocation entries for PLT slots | none |
| `.got` / `.got.plt` | Global Offset Table (addresses of globals & functions) | `WA` |

When the library is built, the compiler emits **relocations** (e.g., `R_X86_64_JUMP_SLOT`) that tell the linker: “at runtime, fill this slot with the address of symbol X”. The dynamic loader (`ld-linux.so.2`) performs these relocations either **eagerly** (`RTLD_NOW`) or **lazily** (`RTLD_LAZY`), the latter filling PLT slots on first use.

### Symbol Interfaces
A symbol interface is simply the pair **(name, address)** exported by a library’s dynamic symbol table. The loader resolves a reference by:
1. Computing a hash (GNU `hash` or SysV `elfhash`) of the symbol name.  
2. Looking up the hash in the library’s `.hash`/` .gnu.hash` bucket to find the symbol table index.  
3. Verifying the string match (to resolve collisions).  
4. Returning the **st_value** field, which is the offset from the library’s load base; the final address is `load_base + st_value`.

If the symbol is **weak** (`STB_WEAK`) and undefined, the loader substitutes zero instead of failing, allowing optional overrides.

---

## How It Works
### Step‑by‑Step Dynamic Loading
1. **`dlopen(const char *filename, int flag)`**  
   * Internally calls `dlopen_doit` in `ld-linux.so.2`.  
   * Checks `filename` for an absolute path; otherwise searches the **library search path** (colon‑separated list from `LD_LIBRARY_PATH`, then `/etc/ld.so.cache`, then `/lib/x86_64-linux-gnu`, `/usr/lib/x86_64-linux-gnu`).  
   * Maps the ELF file with `mmap`. The **load base** is chosen to avoid collisions (typically page‑aligned, randomized via ASLR).  
   * Increments the library’s reference count; returns an opaque `void *` handle.

2. **`dlsym(void *handle, const char *symbol)`**  
   * Looks up `symbol` in the handle’s **global scope** (the library itself plus any dependencies, depending on `RTLD_GLOBAL` vs `RTLD_LOCAL`).  
   * Uses the same hash lookup described above.  
   * If the symbol resides in a PLT slot that hasn’t been resolved yet (lazy binding), the loader fixes the corresponding GOT entry and returns the actual function address.  
   * On failure returns `NULL`; diagnostic available via `dlerror()`.

3. **Calling the resolved function**  
   * The caller invokes the function pointer using the System V ABI.  
   * If the function was resolved via the PLT, the first indirect jump goes through the GOT entry, which after relocation points directly to the final implementation.

4. **`dlclose(void *handle)`**  
   * Decrements the reference count; when it reaches zero, the library’s memory mappings are `munmap`ed.  
   * Any **destructors** (`.fini_array`, `-z initfirst`) are executed before unloading.

### Relocation Types Relevant to FFI
| Relocation | Meaning | Formula (final address) |
|------------|---------|--------------------------|
| `R_X86_64_64` | Direct 64‑bit absolute | `S + A` |
| `R_X86_64_PLT32` | PC‑relative PLT call | `L + A - P` |
| `R_X86_64_JUMP_SLOT` | PLT slot for a function | `L + A` (where `L` is link‑time address of the symbol) |
| `R_X86_64_GLOB_DAT` | GOT entry for a variable | `L + A` |

*`S`* = symbol value, *`A`* = addend, *`P`* = place (offset of storage), *`L`* = link‑time address of the symbol in the object.

---

## Worked Examples
### Example 1: Calling a Function in `libm.so.6` (sin)
**Source (`libm_sin.c`):**
```c
#define _GNU_SOURCE
#include <stdio.h>
#include <dlfcn.h>
#include <math.h>

int main(void) {
    void *handle = dlopen("libm.so.6", RTLD_LAZY);
    if (!handle) {
        fprintf(stderr, "dlopen: %s\n", dlerror());
        return 1;
    }

    /* Clear any existing error */
    dlerror();

    double (*sin_ptr)(double) = dlsym(handle, "sin");
    const char *err = dlerror();
    if (err) {
        fprintf(stderr, "dlsym: %s\n", err);
        dlclose(handle);
        return 1;
    }

    double x = 0.5;                     /* radians */
    double y = sin_ptr(x);              /* call via FFI */
    printf("sin(%g) = %g (expected %g)\n", x, y, sin(x));

    dlclose(handle);
    return 0;
}
```
**Build & run:**
```bash
$ gcc -Wall -O2 libm_sin.c -ldl -o libm_sin
$ ./libm_sin
sin(0.5) = 0.479425538604203 (expected 0.479425538604203)
```
*The call matches the libm implementation because both obey the System V ABI; the PLT entry for `sin` resolves on first use, incurring a one‑time lookup cost of roughly 200 ns on a modern CPU.*

### Example 2: Interposing `malloc` with `LD_PRELOAD`
**Interposer (`malloc_interpose.c`):**
```c
#define _GNU_SOURCE
#include <stdio.h>
#include <dlfcn.h>
#include <stdlib.h>

static void * (*real_malloc)(size_t) = NULL;

void *malloc(size_t size) {
    if (!real_malloc) {
        real_malloc = dlsym(RTLD_NEXT, "malloc");
        if (!real_malloc) {
            fprintf(stderr, "dlsym RTLD_NEXT malloc: %s\n", dlerror());
            exit(1);
        }
    }
    void *ptr = real_malloc(size);
    fprintf(stderr, "[interpose] malloc(%zu) = %p\n", size, ptr);
    return ptr;
}
```
**Build & use:**
```bash
$ gcc -fPIC -shared -O2 malloc_interpose.c -ldl -o malloc_interpose.so
$ LD_PRELOAD=$PWD/malloc_interpose.so ls -l
[interpose] malloc(1024) = 0x55a1b2c3d010
[interpose] malloc(256)  = 0x55a1b2c3d420
...
```
*Why `RTLD_NEXT`?* It tells the resolver to skip the current object and find the next definition of `malloc` in the search order (normally the one in `libc.so.6`). This demonstrates how FFI enables **runtime interposition**, a powerful technique for profiling, debugging, or security hardening.

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Matters |
|---|---------|--------------|----------------|
| 1 | Assuming `dlopen("libfoo.so", RTLD_LAZY)` will always succeed without checking `dlerror()` | If the library is missing, `dlopen` returns `NULL`; the program proceeds to call `dlsym` on a null handle → **SIGSEGV** | The error is often latent; checking early prevents crashes in production. |
| 2 | Using `RTLD_LOCAL` when a dependency expects global symbols | Symbols loaded with `RTLD_LOCAL` are not visible to subsequently loaded libraries → unresolved symbol errors at `dlsym` time | Many plugins rely on exposing their own dependencies; wrong scope breaks composability. |
| 3 | Forgetting to clear the error buffer before `dlsym` | `dlerror()` returns the *last* error; a previous failed `dlopen` will masquerade as a `dlsym` failure | Leads to misleading diagnostics and wasted debugging time. |
| 4 | Assuming the address returned by `dlsym` is constant across runs | ASLR randomizes the load base each execution → absolute address changes | Storing the address persistently (e.g., in a config file) breaks across restarts. |
| 5 | Mixing `dlopen` with `RTLD_NOLOAD` and expecting symbol resolution | `RTLD_NOLOAD` only returns a handle if the library is already loaded; if not, it returns `NULL` | Using it to “test” presence without loading can give false negatives. |
| 6 | Not respecting the ABI when writing hand‑crafted assembly shims | Misaligned stack or wrong register usage corrupts caller state | Results in undefined behavior that is hard to reproduce because it depends on call‑site context. |

---

## Exercises
### Easy
1. **Load libz and call `crc32`.** Write a program that opens `libz.so.1`, resolves `crc32`, computes the CRC of the string `"hello"`, and prints the result. Verify against `zlib.h`’s macro.  
2. **Environment variable inspection.** Use `dlopen(NULL, RTLD_NEXT)` to obtain the handle of the executable itself, then `dlsym` to find the symbol `__libc_start_main`. Print its address and explain why it appears in the executable’s symbol table.

### Medium
3. **Lazy vs eager binding timing.** Write a benchmark that calls a trivial function (`int nop(void){return 42;}`) from a shared library 10⁶ times under `RTLD_LAZY` and `RTLD_NOW`. Measure elapsed time with `clock_gettime(CLOCK_MONOTONIC, …)`. Report the overhead of the first call under lazy binding.  
4. **Versioned symbols.** Create a library with two versions of a symbol (`foo@VERS_1.0` and `foo@VERS_2.0`) using a mapfile. Load the library with `dlopen` and retrieve each version via `dlsym(handle, "foo@@VERS_1.0")` and `dlsym(handle, "foo@@VERS_2.0")`. Print the returned pointers to show they differ.

### Hard
5. **Plugin dispatcher.** Design a plugin system where each plugin exports `init(void **table)` and `process(int (*callback)(int))`. The host loads all `.so` files from a directory, calls `init` to receive a vtable, then invokes `process` with a host‑provided callback. Ensure unloading with `dlclose` runs each plugin’s `.fini` section.  
6. **LD_PRELOAD security audit.** Write a preloaded library that intercepts `openat` and logs every pathname opened by a child process. Then run a privileged program (e.g., `sudo ls`) under your preload and verify that the log captures the paths. Discuss why this technique can be abused and how distributions mitigate it (e.g., `secure_process_execution_mode`).

---

## Linux Connection
### Subsystems & Tools
* **Dynamic loader** – `ld-linux.so.2` (the ELF interpreter). Its source lives in `glibc/elf/rtld.c`.  
* **Library cache** – `/etc/ld.so.conf` and `/etc/ld.so.cache` (updated by `ldconfig`).  
* **Inspection utilities**  
  * `ldd ./a.out` – lists dynamic dependencies and their load addresses.  
  * `readelf -s libfoo.so` – displays the dynamic symbol table (`.dynsym`).  
  * `objdump -T libfoo.so` – shows exported symbols and their version info.  
  * `pmap $PID` – shows the memory map of a running process, confirming where shared libraries are mapped.  
* **Environment variables** – `LD_LIBRARY_PATH`, `LD_PRELOAD`, `LD_DEBUG` (e.g., `LD_DEBUG=files,bindings ./a.out` prints loader actions).  
* **Security features** – `AT_RANDOM` (ASLR entropy), `DL_AUDIT` interface (`libaudit.so`) for interposing on loader events, and `DT_FLAGS_1` flag `DF_1_NOW` to force eager binding.

### Commands in Context
```bash
# Show where libc is mapped in a running shell
$ pmap $$ | grep libc
7f3b2c000000-7f3b2c1b0000 r-xp 00000000 fd:00 123456 /lib/x86_64-linux-gnu/libc-2.31.so
7f3b2c1b0000-7f3b2c3af000 ---p 001b0000 fd:00 123456 /lib/x86_64-linux-gnu/libc-2.31.so
7f3b2c3af000-7f3b2c3b0000 r--p 001af000 fd:00 123456 /lib/x86_64-linux-gnu/libc-2.31.so
7f3b2c3b0000-7f3b2c3b2000 rw-p 001b0000 fd:00 123456 /lib/x86_64-linux-gnu/libc-2.31.so

# List all symbols exported by libstdc++.so.6 with version info
$ objdump -T /usr/lib/x86_64-linux-gnu/libstdc++.so.6 | head -20

# Use LD_DEBUG to see the binding steps for our libm_sin example
$ LD_DEBUG=bindings ./libm_sin 2>&1 | grep -E 'bind|symbol'
```
*These commands demonstrate how the concepts appear in the actual Linux toolchain and runtime environment.*

---

## Why This Matters
Understanding FFI on Linux is not merely academic; it is the connective tissue that lets:
* **Systems software** (e.g., systemd, container runtimes) invoke plug‑ins written in any language without recompiling the core.  
* **Performance‑critical applications** (video codecs, cryptographic libraries) keep hot loops in hand‑optimized assembly or C while exposing a higher‑level API via `dlopen`.  
* **Debugging and observability tools** (strace, valgrind, LTTng) interpose on libc functions using `LD_PRELOAD` to inject tracing or fault injection.  
* **Security hardening** (SELinux, AppArmor, sandboxing) relies on the loader’s ability to enforce `DL_OPEN` restrictions and to audit symbol resolution via `dtrace`/`eBPF` hooks.  

By mastering the ELF symbol resolution process, the System V ABI, and the Linux loader’s behavior, you gain the ability to:
* Predict and measure the cost of dynamic calls (PLT indirection, relocation latency).  
* Design robust plug‑in architectures that survive ASLR, versioning, and symbol visibility nuances.  
* Diagnose failures that stem from mismatched calling conventions or missing dependencies—errors that would otherwise appear as obscure segmentation faults.  

In short, FFI turns the operating system from a static execution environment into a **modular, extensible platform**—the very property that makes Linux the backbone of everything from embedded devices to cloud infrastructure.
