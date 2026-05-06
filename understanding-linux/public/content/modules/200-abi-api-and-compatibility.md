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

## Core Concepts
### ABI vs API: Definitions and Distinctions
The **Application Binary Interface (ABI)** is a contract that specifies how binary objects (executables, shared libraries) interact at the machine‑code level. It covers:
- Executable file format (ELF on Linux)
- Data type sizes, alignment, and padding rules
- Calling convention: register usage, stack layout, return value conventions
- System‑call interface: numbers, argument passing, and kernel‑user transition mechanism
- Symbol versioning and version scripts in shared objects

The **Application Programming Interface (API)** is a source‑level contract: the set of declarations, macros, and inline functions that a programmer includes via headers. It guarantees that recompiling against a newer header yields compatible source, *provided* the underlying ABI remains unchanged.

**Why the distinction matters:** A program can be source‑compatible (same API) yet binary‑incompatible if the ABI changes (e.g., a change in struct packing or calling convention). Conversely, a stable ABI lets you run an existing binary against a newer library without recompilation.

### Versioning and Syscall Stability
**Syscall stability** is the guarantee that the kernel’s system‑call numbers and their semantics remain unchanged for a given architecture. This enables binaries built against an older kernel to run on newer kernels without modification.

The Linux kernel maintains syscall stability by:
1. Never reassigning a syscall number once it has been released.
2. Adding new syscalls with higher numbers (e.g., `clone3` got number 435 on x86_64).
3. Providing a *vdso* (virtual dynamic shared object) that offers fast user‑space implementations of certain syscalls (e.g., `gettimeofday`, `clock_gettime`) while preserving the same numbering.

**Versioning** in user‑space libraries (most notably glibc) complements kernel stability. Symbol versioning lets a library expose multiple implementations of the same function under different version tags (e.g., `GLIBC_2.2.5`, `GLIBC_2.14`). A binary links against the oldest version it needs, ensuring forward compatibility.

### Library Compatibility and the ELF Model
A shared object (`.so`) exported by glibc follows the **System V ABI** for ELF. Key compatibility mechanisms:
- **DT_NEEDED** entries list required libraries.
- **DT_SYMBOLIC** and **DT_VERSION** sections encode version dependencies.
- The **linker** (`ld.so`) resolves symbols by scanning the version graph, preferring the highest version that satisfies the binary’s request.

If a program requires a symbol introduced in glibc 2.28 but runs on a system with glibc 2.27, the dynamic loader will fail with:
```
./prog: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.28' not found
```
This failure is *by design*: it prevents silent misuse of absent ABI guarantees.

---

## How It Works
### From Source to Binary: The Role of the ABI
Consider a simple C function:
```c
int add(int a, int b) {
    return a + b;
}
```
When compiled for x86_64 Linux with the System V ABI:
1. **Argument passing:** The first two integer arguments are placed in registers `%edi` and `%esi`.
2. **Return value:** The result is returned in `%eax`.
3. **Stack alignment:** The caller must ensure the stack is 16‑byte aligned at the point of the `call` instruction (`%rsp % 16 == 8` after the push of the return address).

If the ABI changed such that the return value were placed in `%rax` instead of `%eax`, existing binaries would break because the caller would read the wrong register.

Mathematically, the address of a stack‑allocated local variable `x` at offset `k` from the base pointer `%rbp` is:
$$
\text{addr}(x) = \%rbp - k
$$
where `k` is a multiple of the variable’s alignment (e.g., 4 for `int`). The compiler computes `k` during layout; any change in alignment rules shifts all subsequent offsets, breaking binaries that hard‑coded those offsets.

### System Calls: Kernel‑User Transition
On x86_64, a syscall is invoked via the `syscall` instruction. The kernel expects:
- `%rax` – syscall number
- `%rdi`, `%rsi`, `%rdx`, `%r10`, `%r8`, `%r9` – up to six arguments
- Return value in `%rax`; error indicated by a negative value (the negated `errno`).

**Why `syscall` and not `int 0x80`?**  
The `int 0x80` interface uses a different calling convention (arguments in `%ebx`, `%ecx`, `%edx`, `%esi`, `%edi`, `%ebp`) and incurs a slower transition due to the older interrupt gate. The `syscall` instruction uses a faster *sysenter*‑like mechanism, reducing overhead from ~1000 cycles to ~200 cycles on modern CPUs.

The kernel stores the syscall table in `arch/x86/entry/syscalls/syscall_64.tbl`. Each line maps a number to a function pointer; adding a new syscall appends a line, preserving existing numbers.

### Dynamic Linking and Symbol Versioning
When linking against glibc, the linker records not only the symbol name but also the **version node** it was resolved against. Example readelf output:
```
0x0000000000000006  VERNEED        0x00000000000001d8
    Version: 1
        0x00000000000001d9:   GLIBC_2.2.5
```
A binary that calls `malloc` will have a `VERNEED` entry for `GLIBC_2.2.5`. If the program is run on a system with glibc 2.2.4, the dynamic loader cannot satisfy the version requirement and aborts.

**Derivation of version requirement:**  
Suppose a source file includes `<stdlib.h>` and calls `malloc`. The header contains:
```c
extern void *malloc(size_t size) __asm__("malloc");
```
The actual definition in glibc is:
```c
__malloc_initialize_hook, malloc = __libc_malloc@@GLIBC_2.2.5
```
The `@@` syntax tells the linker to bind the reference to the versioned symbol `malloc@@GLIBC_2.2.5`. The linker then writes a `VERNEED` entry requiring at least that version.

---

## Worked Examples
### Example 1: Inspecting the ABI of a Simple Program
```c
/* hello.c */
#include <stdio.h>
int main(void) {
    puts("Hello, ABI!");
    return 0;
}
```
Compile and examine:
```bash
gcc -O0 -o hello hello.c
readelf -h hello        # ELF header
readelf -l hello        # Program headers (segments)
readelf -S hello        # Section headers
objdump -d hello        # Disassemble main
```
**Step‑by‑step reasoning:**
1. The ELF header (`e_type=ET_EXEC`, `e_machine=EM_X86_64`) tells the loader this is a 64‑bit executable.
2. The program header shows two loadable segments: a read‑only code segment (`PF_R|PF_X`) and a read‑write data segment (`PF_R|PF_W`). Their `p_vaddr` and `p_offset` values satisfy the ABI’s requirement that the text segment start at a page‑aligned address (typically `0x400000`).
3. In the disassembly of `main` we see:
   ```asm
   0000000000400536 <main>:
     400536:   55                      push   %rbp
     400537:   48 89 e5                mov    %rsp,%rbp
     400539:   bf 84 05 40 00          mov    $0x400584,%edi   # address of string
     40053e:   e8 cd fe ff ff          call   400410 <puts@plt>
     400543:   b8 00 00 00 00          mov    $0x0,%eax
     400548:   5d                      pop    %rbp
     400549:   c3                      ret
   ```
   - The prologue follows the System V ABI: save `%rbp`, set `%rbp=%rsp`.
   - The argument for `puts` (the pointer to the string) is placed in `%edi` per the ABI.
   - The call goes through the PLT (`puts@plt`), which will later resolve to the glibc `puts` symbol with version `GLIBC_2.2.5`.

### Example 2: Making a Raw System Call
```c
/* write_raw.c */
#define _GNU_SOURCE
#include <unistd.h>
#include <sys/syscall.h>
#include <string.h>

int main(void) {
    const char *msg = "Hello via syscall\n";
    /* syscall number for write on x86_64 is __NR_write = 1 */
    syscall(SYS_write, STDOUT_FILENO, msg, strlen(msg));
    return 0;
}
```
Compile and trace:
```bash
gcc -O0 -o write_raw write_raw.c
strace -e write ./write_raw
```
**Explanation:**
- `strace` shows:
  ```
  write(1, "Hello via syscall\n", 18) = 18
  ```
- The `syscall` wrapper in glibc eventually executes the `syscall` instruction with `%rax=1`, `%rdi=1`, `%rsi=msg`, `%rdx=18`. The kernel copies the bytes from user space to kernel space using the address in `%rsi` and writes them to file descriptor 1 (stdout).  
- The return value (number of bytes written) ends up in `%rax`, which the wrapper copies back to the C `int` return.

### Example 3: Symbol Versioning in Practice
```c
/* versioned_malloc.c */
#include <stdlib.h>
#include <stdio.h>

int main(void) {
    void *p = malloc(64);
    if (!p) return 1;
    free(p);
    return 0;
}
```
Check version dependencies:
```bash
gcc -O0 -o vmalloc versioned_malloc.c
readelf -V vmalloc | grep malloc
```
Output (excerpt):
```
0x000000000000000c  VERNEED        0x00000000000001d8
    Version: 1
        0x00000000000001d9:   GLIBC_2.2.5
        0x00000000000001da:   GLIBC_2.3
```
The binary records a requirement for at least `GLIBC_2.2.5`. If we try to run it on a system with glibc 2.1.2 (which lacks that version), the loader fails:
```
./vmalloc: /lib/i386-linux-gnu/libc.so.6: version `GLIBC_2.2.5' not found (required by ./vmalloc)
```

---

## Common Mistakes
| # | Mistake | Why It’s Wrong | Consequence |
|---|---------|----------------|-------------|
| 1 | **Assuming syscall numbers are portable across architectures** | Syscall numbers are defined per‑ABI (e.g., `__NR_write` = 1 on x86_64, but = 4 on ARM64). | A binary compiled for x86_64 will trigger an invalid syscall (`SYS_syscall`) when run on ARM64, usually resulting in `SIGSYS`. |
| 2 | **Believing static linking eliminates ABI concerns** | Static linking only freezes the *user‑space* code; it does not lock the kernel ABI (syscall numbers, vdso layout) or hardware‑dependent details like structure padding dictated by the CPU’s ABI. | A statically linked binary built on a new kernel may fail on an older kernel if it uses a newer syscall or relies on a changed vdso layout. |
| 3 | **Ignoring structure padding and alignment when sharing binary data** | The System V ABI requires natural alignment (e.g., `alignof(double) = 8`). If two compilers use different packing (`#pragma pack`) or different default alignment rules, the layout of a struct diverges. | Data serialized via `write(fd, &s, sizeof(s))` becomes unreadable on the other side, leading to silent corruption. |
| 4 | **Assuming that a program built against glibc 2.31 will run on glibc 2.28 if it only uses “old” functions** | Even if the source calls only old symbols, the linker may still pull in newer versioned symbols due to internal dependencies (e.g., `calloc` may reference `malloc@@GLIBC_2.14`). | The dynamic loader reports missing version (`GLIBC_2.14`) even though the source never referenced it explicitly. |
| 5 | **Using `int 0x80` on x86_64 for performance‑critical code** | The `int 0x80` interface uses a slower interrupt‑gate path and a different register layout, requiring extra moves to conform to the kernel’s expectations. | Measured syscall latency can be 2–3× higher than using the `syscall` instruction, hurting throughput in tight loops. |

---

## Exercises
### Easy
1. **Hello world with strace**  
   Write a C program that calls `printf("Linux\n");`. Compile with `gcc -o hello hello.c`. Run `strace -e trace=write ./hello` and verify that the underlying syscall is `write(1, ...)`.
2. **Check ELF class**  
   Compile a program for both `-m32` and `-m64`. Use `readelf -h` to confirm `e_ident[EI_CLASS]` equals `ELFCLASS32` and `ELFCLASS64` respectively.

### Medium
3. **Syscall number inspection**  
   Write a program that invokes `getpid()` via the `syscall(2)` wrapper (`syscall(SYS_getpid)`). Compile and run. Then use `grep __NR_getpid /usr/include/asm/unistd_64.h` to show the matching number. Change the wrapper to use the raw number and confirm it still works.
4. **Versioned symbol audit**  
   Build a small program that uses `malloc` and `printf`. Run `readelf -V a.out | grep -E 'GLIBC_'`. Identify the highest glibc version required. Then try to run the binary on an older glibc version (e.g., using a Docker container with `glibc:2.27`) and observe the failure.

### Hard
5. **Create a versioned shared library**  
   Write a library `libfoo.so` exposing two functions: `foo_v1` (simple) and `foo_v2` (adds an extra parameter). Use a version script:
   ```
   VERS_1.1 {
       global: foo_v1;
   };
   VERS_1.2 {
       global: foo_v2;
   };
   ```
   Compile with `gcc -shared -fPIC -Wl,--version-script,foo.map -o libfoo.so foo.c`. Write a test program that links against `libfoo.so` and calls only `foo_v1`. Verify with `objdump -T` that the binary needs `VERS_1.1`. Then replace the library with a newer version that only provides `VERS_1.2` and confirm the test program fails to start.
6. **Measuring syscall overhead**  
   Using `rdtsc` (or `clock_gettime(CLOCK_MONOTONIC, ...)`), measure the time to perform 10⁶ iterations of `syscall(SYS_getpid)` versus the library wrapper `getpid()`. Report the average cycles per call and discuss the contribution of the vdso versus the kernel entry.

---

## Linux Connection
### Concrete Subsystems and Files
| Concept | Linux Artifact | Path / Command | What It Shows |
|---------|----------------|----------------|---------------|
| Executable format | ELF header | `readelf -h /bin/ls` | `e_type`, `e_machine`, entry point |
| Program layout | PT_LOAD segments | `readelf -l /bin/ls` | Separate code (R‑X) and data (R‑W) segments |
| Dynamic dependencies | NEEDED entries | `readelf -d /bin/ls` | Lists `libc.so.6`, `ld-linux-x86-64.so.6` |
| Symbol versions | VERNEED/VERSION sections | `readelf -V /bin/ls` | Minimum glibc versions required |
| System call table | Kernel source | `grep -E '^ *[0-9]+' /boot/System.map-$(uname -r) | head -5` | Shows numbers → function pointers |
| VDSO object | ELF note | `ldd /bin/ls | grep linux-vdso` → `cat /proc/self/maps | grep vdso` | Provides fast gettimeofday, clock_gettime |
| Loader configuration | `/etc/ld.so.conf`, `ld.so.cache` | `ldconfig -v` | Directs `ld.so` where to search for libraries |
| Kernel‑user boundary | `syscall` instruction | `objdump -d /lib/x86_64-linux-gnu/libc.so.6 | grep syscall` | Shows glibc’s wrapper using `syscall` |

### Runnable Commands
```bash
# 1. Show the ELF class of the running shell
readelf -h /proc/$$/exe | grep Class

# 2. List all PT_LOAD segments of ls
readelf -l /bin/ls | grep LOAD

# 3. Examine the version requirements of libc
readelf -V /lib/x86_64-linux-gnu/libc.so.6 | grep -A2 -B2 'GLIBC_'

# 4. Find the syscall number for read on x86_64
grep -w __NR_read /usr/include/asm/unistd_64.h

# 5. Measure vdso presence
cat /proc/self/maps | grep vdso

# 6. Run a program under strace and count syscalls
strace -c -o trace.out ./hello
cat trace.out
```

---

## Why This Matters
Understanding the ABI and API is not academic trivia; it is the *foundation* that lets a binary produced today run unchanged on a Linux system years from now—or fail spectacularly if the contract is violated.  

- **API stability** lets developers write portable source code without constantly revisiting headers.  
- **ABI stability** (enforced by the ELF format, calling conventions, and syscall numbering) guarantees that the *machine code* emitted by the compiler remains meaningful to the kernel and dynamic loader across kernel releases and glibc updates.  
- **Versioning** bridges the gap: it allows the user‑space ABI to evolve (new functions, improved implementations) while preserving a mechanism for older binaries to express exactly which version they need.  

When you ignore these layers—by assuming syscall numbers never change, by neglecting structure alignment, or by linking against a newer glibc without checking version symbols—you introduce fragile dependencies that surface as cryptic “version not found” errors, silent data corruption, or performance regressions.  

Conversely, mastery of the ABI/API enables you to:
- Debug failures with `readelf`, `ldd`, and `strace`.  
- Design shared libraries that safely evolve using version scripts.  
- Write high‑performance system‑call wrappers that exploit the vdso.  
- Port software between architectures by knowing where the ABI diverges (e.g., ILP32 vs LP64, ARM vs x86).  

In the Linux ecosystem, the kernel’s promise of syscall stability, glibc’s disciplined symbol versioning, and the toolchain’s adherence to the System V ABI together form a *reliable contract* that underpins everything from a simple “hello world” to massive, long‑running services. Grasping this contract transforms you from a programmer who merely compiles code into one who engineers software that is truly portable, maintainable, and resilient across time and hardware.
