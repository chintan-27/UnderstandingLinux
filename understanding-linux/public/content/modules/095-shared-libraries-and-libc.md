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

## Core Concepts
### Shared Libraries and Position‑Independent Code  
A shared library (`.so`) is an ELF object that contains **position‑independent code (PIC)**: its instructions use only relative addressing or indirect registers so that the same binary can be loaded at any virtual address without modification. PIC is required because the dynamic loader may map the library at a different base address in each process’s address space (ASLR).  

**Why PIC matters:**  
If a library were not PIC, the loader would have to apply **text relocations**—modifying read‑only code pages—which defeats the purpose of sharing (pages become private, waste memory, and introduce security risks).  

### ELF Metadata that Governs Sharing  
Key ELF sections for a shared object:  

| Section | Purpose | Example content |
|---------|---------|-----------------|
| `.dynsym` | Dynamic symbol table (exported/imported symbols) | `int add(int,int)` |
| `.dynstr` | String table for `.dynsym` | `"add"` |
| `.got` / `.got.plt` | Global Offset Table & Procedure Linkage Table – hold resolved addresses | entries filled by lazy binding |
| `.rel.plt` / `.rela.plt` | Relocation entries for PLT slots | `R_X86_64_JUMP_SLOT` |
| `.interp` | Path to the dynamic loader (usually `/lib64/ld-linux-x86-64.so.2`) | – |
| `.dynamic` | Array of `Elf64_Dyn` tags (e.g., `DT_NEEDED`, `DT_SONAME`, `DT_RPATH`) | – |
| `DT_SONAME` | **Shared Object Name** used for versioning (e.g., `libmylib.so.1`) | – |

The **Application Binary Interface (ABI)** dictates the layout of these structures, calling conventions, and system‑call numbers. The **Application Programming Interface (API)** is the set of symbols (functions, variables) the library promises to expose. A shared library must satisfy the system ABI; otherwise the loader cannot relocate it correctly.

### Dynamic Linking Mechanics  
When the loader maps a shared object, it performs **relocation**: for each relocation entry it computes  

$$
\text{addr}_{\text{runtime}} = \text{base}_{\text{load}} + \text{addend} + \text{symbol\_value}
$$

where `base_load` is the mmap‑ed start address of the library, `addend` comes from the relocation type, and `symbol_value` is the offset of the referenced symbol within the library (or zero for external symbols). The result is written into the appropriate GOT entry (or directly into code for non‑PIC, which we avoid).

**Lazy binding** (default) defers PLT resolution until the first call: the first jump goes through a resolver stub that updates the GOT entry, after which subsequent calls jump directly to the target. This trades a one‑time cost (~200 ns on modern x86‑64) for zero overhead thereafter.

---

## How It Works
### 1. Compilation – Producing PIC  
```bash
gcc -fPIC -Wall -c mylib.c -o mylib.o
```
*`-fPIC`* forces the compiler to generate RIP‑relative addressing (`call *%rax`) instead of absolute addresses.

### 2. Linking – Creating the Shared Object  
```bash
gcc -shared -Wl,-soname,libmylib.so.1 -o libmylib.so.1.0.0 mylib.o
```
*`-shared`* tells the linker to emit a DSO.  
*`-Wl,-soname,...`* sets the `DT_SONAME` field, enabling version‑safe upgrades.  
The linker also emits a `.dynamic` section with `DT_NEEDED` entries for any dependencies (e.g., `libc.so.6`).

### 3. Installation & Cache Update  
```bash
sudo cp libmylib.so.1.0.0 /usr/local/lib/
sudo ln -sf libmylib.so.1.0.0 /usr/local/lib/libmylib.so.1
sudo ldconfig   # rebuilds /etc/ld.so.cache from /etc/ld.so.conf and trusted dirs
```
`ldconfig` scans directories, reads each ELF’s `DT_SONAME`, and creates a hash map `soname → path` used by the loader.

### 4. Compiling a Consumer  
```bash
gcc -Wall -c myprog.c -o myprog.o
gcc -o myprog myprog.o -L/usr/local/lib -lmylib   # -lmylib finds libmylib.so via DT_SONAME
```
The linker records a `DT_NEEDED` entry for `libmylib.so.1` in `myprog`.

### 5. Runtime Resolution  
When `./myprog` starts, the kernel loads the interpreter specified in its `.interp` section (`/lib64/ld-linux-x86-64.so.2`). The interpreter:

1. Reads `myprog`’s `.dynamic` section → sees `DT_NEEDED: libmylib.so.1`.  
2. Looks up the soname in `/etc/ld.so.cache` → finds `/usr/local/lib/libmylib.so.1 → libmylib.so.1.0.0`.  
3. `mmap`s the library at a random base (ASLR).  
4. Applies relocations: for each `R_X86_64_JUMP_SLOT` in `.rel.plt`, computes the final address and writes it into the corresponding GOT slot.  
5. Transfers control to `myprog`’s entry point; the first call to `add` triggers the PLT resolver, which updates the GOT and then jumps to the real function.

**Address‑calculation example** (x86‑64):  
Suppose the library is loaded at `0x7f3c20000000`, the symbol `add` has `st_value = 0x410` (offset from the library’s start), and the relocation addend is `0`. The GOT entry becomes  

$$
\text{GOT[add]} = 0x7f3c20000000 + 0x410 = 0x7f3c20000410
$$

The first PLT stub executes `jmp *GOT[add]`; after resolution the GOT holds the absolute address of `add`.

### 6. Verifying the Process  
```bash
ldd ./myprog          # shows which libraries were found and their load addresses
readelf -d libmylib.so.1.0.0 | grep NEEDED
objdump -T libmylib.so.1.0.0 | grep add   # lists exported symbols
LD_DEBUG=libs ./myprog 2&1 | head -20   # traces loader activity
```

---

## Worked Examples
### Example 1: Building a Simple Math Library  
**mylib.c**  
```c
/* mylib.c */
int add(int a, int b) { return a + b; }
int mul(int a, int b) { return a * b; }
```

**Build**  
```bash
gcc -fPIC -c mylib.c -o mylib.o
gcc -shared -Wl,-soname,libmylib.so.1 -o libmylib.so.1.0.0 mylib.o
sudo cp libmylib.so.1.0.0 /usr/local/lib/
sudo ln -sf libmylib.so.1.0.0 /usr/local/lib/libmylib.so.1
sudo ldconfig
```

**Consumer – main.c**  
```c
/* main.c */
extern int add(int, int);
extern int mul(int, int);
#include <stdio.h>
int main(void) {
    printf("2+3 = %d\n", add(2, 3));
    printf("2*3 = %d\n", mul(2, 3));
    return 0;
}
```
**Link & Run**  
```bash
gcc -o main main.c -L/usr/local/lib -lmylib
./main
# Output:
# 2+3 = 5
# 2*3 = 6
```

**Inspection**  
```bash
ldd ./main
#        libmylib.so.1 => /usr/local/lib/libmylib.so.1 (0x7f3c20000000)
readelf -d libmylib.so.1.0.0 | grep SONAME
# 0x000000000000000e (SONAME)             Library soname: [libmylib.so.1]
objdump -T libmylib.so.1.0.0 | grep add
# 0000000000000410 g    DF .text  0000000000000007  Base   add
```
The GOT entry for `add` resides at offset `0x410` from the load base, confirming the relocation formula.

### Example 2: Versioning and Symbol Visibility  
Suppose we release `libmylib.so.2` with an additional function `sub` while keeping the old ABI for `add`.  

**mylib_v2.c**  
```c
/* same as before */
int add(int a, int b) { return a + b; }
int mul(int a, int b) { return a * b; }
int sub(int a, int b) { return a - b; }
```

**Build with new SONAME**  
```bash
gcc -fPIC -c mylib_v2.c -o mylib_v2.o
gcc -shared -Wl,-soname,libmylib.so.2 -o libmylib.so.2.0.0 mylib_v2.o
sudo cp libmylib.so.2.0.0 /usr/local/lib/
sudo ln -sf libmylib.so.2.0.0 /usr/local/lib/libmylib.so.2
sudo ldconfig
```

**Old program (linked against libmylib.so.1) continues to work** because its `DT_NEEDED` requests `libmylib.so.1`, which still exists (we keep the old file).  
**New program** can be linked with `-lmylib` and will pick up `libmylib.so.2` (the newer SONAME) if we update the symlink or adjust `-L` ordering.

**Checking symbol version** (if we added GNU version script) would show `GLIBC_2.34`‑style tags; here we rely on SONAME changes.

### Example 3: Measuring Lazy‑Binding Overhead  
**bench.c**  
```c
extern int add(int, int);
#include <time.h>
#include <stdio.h>
#define N 1000000
int main(void) {
    struct timespec ts0, ts1;
    clock_gettime(CLOCK_MONOTONIC, &ts0);
    volatile int s = 0;
    for (int i = 0; i < N; ++i)
        s += add(i, i+1);
    clock_gettime(CLOCK_MONOTONIC, &ts1);
    double elapsed = (ts1.tv_sec - ts0.tv_sec) +
                     (ts1.tv_nsec - ts0.tv_nsec) * 1e-9;
    printf("sum=%d time=%.6f sec (%.0f ns/call)\n",
           s, elapsed, elapsed*1e9/N);
    return 0;
}
```
Compile and run:  

```bash
gcc -O2 -o bench bench.c -L/usr/local/lib -lmylib
./bench
# Example output on a 3 GHz Xeon:
# sum=333333000000 time=0.018423 sec (18 ns/call)
```
The first call incurs the resolver cost (~200 ns); the amortized cost drops to a few nanoseconds thereafter, demonstrating the benefit of lazy binding.

---

## Common Mistakes
| # | Mistake | Why it’s Wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | **Omitting `-fPIC`** when building a `.so` | The compiler generates absolute addresses; the loader must apply **text relocations**, making code pages non‑shared and potentially triggering segmentation faults if the page is marked read‑only. | Increased memory usage, slower start‑up, possible `SEGV` on systems with strict W^X enforcement. |
| 2 | **Assuming `-lmylib` finds the library in the current directory** | The linker only searches `-L` directories and the default system paths; `LD_LIBRARY_PATH` is consulted *only* by the runtime loader, not the linker. | Linker error “cannot find -lmylib” even though `libmylib.so` sits beside the source. |
| 3 | **Neglecting to run `ldconfig` after installing a new library** | The loader’s cache (`/etc/ld.so.cache`) is stale; it continues to map the old SONAME or fails to find the new one. | Programs fail at runtime with “cannot open shared object file: No such file or directory”. |
| 4 | **Using `RTLD_LOCAL` (default) when a library expects to expose its symbols to other DSOs loaded via `dlopen`** | Symbols remain hidden; secondary libraries cannot resolve references, leading to `dlsym` failures. | Plugins that depend on symbols from the main library break silently. |
| 5 | **Relying on the load order of `DT_NEEDED` symbols without explicit versioning** | If two libraries define the same symbol with different semantics, the first loaded satisfies the reference, causing subtle bugs. | Heisenbugs that appear only after updating a seemingly unrelated package. |
| 6 | **Forgetting to add `-Wl,--no-as-needed` when linking a program that `dlopen`s a library only conditionally** | Newer linkers drop unused `DT_NEEDED` entries; the program may later fail to find the library when `dlopen` is called. | Runtime `dlopen` error “cannot open shared object file”. |

---

## Exercises
### Easy  
1. **Create a shared library** `libhello.so` that exports `void hello(const char *name);` printing `Hello, <name>!\n`. Write a test program that calls it with three different names. Verify with `ldd` and `objdump -T`.  

### Medium  
2. **Versioning practice**:  
   - Release `libhello.so.1` with the above function.  
   - Later add `void goodbye(const char *name);` and bump the SONAME to `libhello.so.2`.  
   - Keep the old `.so.1` file present.  
   - Build two programs: one linked against `libhello.so.1` (should run without modification) and one linked against `libhello.so.2` that uses both functions. Demonstrate that both binaries work simultaneously.  

3. **Lazy‑binding measurement**: Write a program that calls a library function 10⁷ times, timing the first call separately (e.g., by calling it once before the loop). Report the overhead of the resolver versus the steady‑state cost.  

### Hard  
4. **Interposition with `LD_PRELOAD`**: Write a library `libinterpose.so` that overrides `malloc` and `free` to log allocation sizes to a file. Preload it (`LD_PRELOAD=./libinterpose.so ./anyprog`) and verify that the log reflects the program’s allocations. Discuss how this technique can be used for debugging memory leaks or for security sandboxing.  

5. **Manual dynamic loading**: Replace the link‑time `-lmylib` with `dlopen`/`dlsym`. Write a program that loads `libmylib.so` at runtime, resolves `add` and `mul` via `dlsym`, and calls them. Handle errors (`dlerror`) and show how to close the handle with `dlclose`. Explain why you must use `RTLD_GLOBAL` if the loaded library needs to satisfy undefined symbols in subsequently loaded libraries.  

---

## Linux Connection
The dynamic linker on Linux is **`ld-linux.so.2`** (the ELF interpreter). Key files and tools:

| Path / Tool | Purpose |
|-------------|---------|
| `/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2` | The actual interpreter invoked by the kernel for ET_DYN executables. |
| `/etc/ld.so.conf` | Directories searched by `ldconfig` (e.g., `/usr/lib`, `/lib`, `/usr/local/lib`). |
| `/etc/ld.so.cache` | Binary hash map produced by `ldconfig`; accelerates `DT_NEEDED` look‑ups. |
| `/usr/lib`, `/lib`, `/usr/local/lib` | Standard locations for shared objects; `ldconfig` scans them by default. |
| `ldconfig` | Rebuilds the cache; must be run after installing new libraries in trusted directories. |
| `LD_LIBRARY_PATH` | Colon‑separated list overriding the cache for a single process (useful for testing, discouraged in production). |
| `LD_PRELOAD` | Forces the loader to interpose given shared objects before all others; used for debugging, profiling, or security wrappers. |
| `LD_DEBUG=libs|symbols|files` | Prints verbose loader activity to stderr. |
| `readelf -a <file>` | Displays ELF headers, sections, program headers, dynamic tags. |
| `objdump -T <file>` | Lists dynamic symbols (exported/imported). |
| `nm -D <file>` | Same as `objdump -T` but with different formatting. |
| `ldd <prog>` | Shows which shared objects are needed and their resolved load addresses (runs the loader in a special mode). |
| `strace -e trace=open,openat,execve,mmaps,munmap` | Observes system calls made by the loader (e.g., opening `.so` files, `mmap` of libraries). |
| `pcp` / `perf` / `valgrind --tool=massif` | Can measure memory‑saving impact of shared libraries vs. static linking. |

### Runnable Demonstration  
```bash
# 1. Build and install a test library
gcc -fPIC -c demo.c -o demo.o
gcc -shared -Wl,-soname,libdemo.so.1 -o libdemo.so.1.0.0 demo.o
sudo cp libdemo.so.1.0.0 /usr/local/lib/
sudo ln -sf libdemo.so.1.0.0 /usr/local/lib/libdemo.so.1
sudo ldconfig

# 2. Build a program that uses it
gcc -o demo_prog demo_prog.c -L/usr/local/lib -ldemo

# 3. Inspect the dynamic section
readelf -d libdemo.so.1.0.0 | grep -E 'NEEDED|SONAME|RPATH|RUNPATH'

# 4. See which objects the program needs and where they are found
ldd ./demo_prog
# Output example:
#   linux-vdso.so.1 (0x00007ffc6e5f7000)
#   libdemo.so.1 => /usr/local/lib/libdemo.so.1 (0x00007f3c20000000)
#   libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f3c1fb80000)
#   /lib64/ld-linux-x86-64.so.2 (0x00007f3c203c0000)

# 5. Trace loader activity
LD_DEBUG=libs ./demo_prog 2&1 | head -15
```

The above shows the concrete paths, the role of `ldconfig`, the interpreter, and how the loader resolves dependencies.

---

## Why This Matters
Shared libraries are the backbone of modern Linux systems: they let **hundreds of processes reuse a single copy of code**, cutting RAM usage by roughly  

$$
\text{Savings} \approx N \times S_{\text{obj}} - S_{\text{shared}}
$$

where $N$ is the number of processes and $S_{\text{obj}}$ is the size of the object code that would be duplicated with static linking. On a typical desktop with 50 GUI apps each linking against `libc.so.6` (~2 MiB), the saving exceeds 100 MiB—critical for low‑memory devices and containers.

Beyond memory, shared libraries enable **secure, upgradable systems**: a security patch to `libssl.so` instantly benefits every executable without recompilation, provided the SONAME remains compatible. The dynamic linker’s lazy binding and PLT/GOT mechanisms keep the per‑call overhead negligible after the first resolution, making the abstraction practically free.

Understanding the ELF format, relocation mathematics, loader environment variables, and tooling (`ldconfig`, `ldd`, `readelf`, `strace`) empowers you to:

* Diagnose startup failures caused by missing or mismatched libraries.  
* Optimize build links (e.g., using `-Wl,--as-needed` to avoid unnecessary DT_NEEDED entries).  
* Leverage `LD_PRELOAD` for runtime instrumentation, debugging, or sandboxing.  
* Design libraries with proper versioning (`DT_SONAME`, symbol visibility) to avoid the “dependency hell” that plagues statically linked ecosystems.  

Mastering these concepts transforms you from a user who merely runs programs into a developer who can shape the very way Linux assembles and executes software—an essential skill for systems programming, performance tuning, and secure software deployment.
