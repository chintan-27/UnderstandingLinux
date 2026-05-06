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

## Core Concepts
### The Loader as a Memory Manager
A loader is the part of the operating system that transforms an executable file on disk into a **process image** in virtual memory. Its job is not merely to copy bytes; it must:
* **Create address spaces** that match the program’s ELF program headers (`PT_LOAD` segments).
* **Apply relocations** so that absolute addresses in the code and data match the actual load address.
* **Initialize the process’ auxiliary vector** (`auxv`) with kernel‑provided values (page size, entry point, hardware capabilities, etc.).
* **Transfer control** to the program’s entry point (`e_entry`) after setting `%rip`/`eip` and a properly aligned stack.

The distinction between *linker* and *loader* is fundamental:
* The **linker** (`ld`) resolves symbols among object files and produces a single executable or shared object, performing **static relocations** that are independent of the final load address.
* The **loader** performs **dynamic relocations** at runtime, because the load address may vary due to ASLR, shared library mapping, or position‑independent code (PIC).

### Process Image Layout (ELF‑64)
An ELF executable contains several segment types; the loader maps each `PT_LOAD` segment according to its `p_vaddr` (virtual address) and `p_offset` (file offset). The relevant segments are:

| Segment | Purpose | Typical Flags |
|---------|---------|---------------|
| `PT_LOAD` (code) | `.text`, read‑only execution | `PF_R | PF_X` |
| `PT_LOAD` (data) | `.data`, `.bss`, read‑write data | `PF_R | PF_W` |
| `PT_GNU_STACK` | Stack permissions (often `PF_R | PF_W`) | — |
| `PT_GNU_RELRO` | Read‑only relocations after lazy binding | `PF_R` |

If the executable is **position‑independent** (`ET_DYN`), the loader chooses a **load bias** `B` such that the first `PT_LOAD` segment is mapped at an address satisfying ASLR constraints. The bias is computed as:

$$ B = \text{chosen\_base} - p_{vaddr}^{(0)} $$

where $p_{vaddr}^{(0)}$ is the virtual address of the first `PT_LOAD` segment in the file. All subsequent virtual addresses are obtained by adding $B$.

### Runtime Initialization
Before transferring to `main`, the loader (via the **dynamic linker/loader** `ld-linux.so`) performs:
1. **Stack construction**: pushes `argc`, `argv[]`, `envp[]`, and the auxiliary vector onto the stack in that order (high addresses → low addresses, because the stack grows downward).
2. **Thread‑local storage (TLS)**: allocates the TLS block pointed to by `%fs`/`%gs` and copies the initial TLS image from the `.tdata` section.
3. **Initialization arrays**: walks the `.init` and `.init_array` sections (including constructors from shared objects) and calls each function pointer.
4. **Setting up `errno` location** for thread‑specific error reporting.

Only after these steps does the loader jump to the executable’s entry point, which for a typical C program is `__libc_start_main`. That function eventually calls `main` after setting up `stdin/stdout/stderr` and processing `atexit` handlers.

### Dynamic Loader (ld-linux.so)
When an executable has an `PT_INTERP` segment (e.g., `/lib64/ld-linux-x86-64.so.2`), the kernel transfers control to that interpreter after mapping the executable’s segments. The dynamic loader then:
* **Scans `DT_NEEDED` entries** to locate required shared objects.
* **Maps each shared object** using the same `PT_LOAD` logic, computing its own bias.
* **Performs relocations** marked `DT_REL` or `DT_RELA` (including `R_X86_64_GLOB_DAT`, `R_X86_64_JUMP_SLOT`, `R_X86_64_RELATIVE`).
* **Resolves symbols** via hash tables (`DT_HASH` or `DT_GNU_HASH`) and, if lazy binding (`RTLD_LAZY`), fills PLT entries with a resolver stub that updates the GOT on first use.
* **Runs initialization** (`.init`, `.init_array`) of each loaded object.
* **Returns** to the executable’s entry point.

---

## How It Works
### Step‑by‑Step Execution of `execve`
When a program invokes `execve("/bin/ls", argv, envp)`, the kernel follows this sequence (simplified from `fs/exec.c`):

1. **Binary format selection** – `search_binary_handler` iterates over registered `linux_binfmt` handlers; for ELF it finds `elf_binfmt`.
2. **Load ELF headers** – reads `e_ident`, `e_type`, `e_machine`, `e_entry`, `e_phoff`, `e_phentsize`, `e_phnum`.
3. **Clear current memory** – `flush_old_exec` releases the old mm, VMAs, and page tables; obtains a fresh `mm_struct`.
4. **Map PT_LOAD segments** – for each program header with `p_type == PT_LOAD`:
   * Compute file offset aligned to page size:  
     $$ \text{file\_off} = p\_offset \& ~(PAGE\_SIZE-1) $$
   * Compute memory address aligned:  
     $$ \text{mem\_addr} = (p\_vaddr + B) \& ~(PAGE\_SIZE-1) $$
   * Determine mapping length:  
     $$ \text{map\_len} = ((p\_filesz + p\_offset - \text{file\_off}) + PAGE\_SIZE-1) \& ~(PAGE\_SIZE-1) $$
   * Call `do_mmap` with `prot = PF_R?PROT_READ:0 | PF_W?PROT_WRITE:0 | PF_X?PROT_EXEC:0`, `flags = MAP_PRIVATE|MAP_DENYWRITE`, `fd`, and `file_off`.
   * If `p_memsz > p_filesz`, zero‑fill the remainder (`.bss`).
5. **Set up stack** – allocate `STACK_SIZE` (default 8 MiB) via `vm_area_struct` with `VM_GROWSDOWN`. Copy `argc`, `argv`, `envp`, and construct `auxv`:
   * `AT_PHDR` → address of program headers
   * `AT_PHENT` → size of each program header
   * `AT_PHNUM` → number of program headers
   * `AT_PAGESZ` → `PAGE_SIZE`
   * `AT_BASE` → bias `B`
   * `AT_ENTRY` → entry point (`e_entry + B`)
   * `AT_UID`, `AT_EUID`, `AT_GID`, `AT_EGID` → credentials
   * `AT_RANDOM` → 16‑byte random bytes for ASLR
6. **Set registers** – `start_thread` sets `%rip` to `e_entry + B`, `%rsp` to the top of the stack, clears `%rbp`, and clears `%fs.base`/`%gs.base` (to be set by TLS later).
7. **Transfer to interpreter** – if `PT_INTERP` present, `start_thread` jumps to the interpreter’s entry point instead of the executable’s; the interpreter then repeats steps 4‑6 for itself before finally transferring to the executable’s entry point.

### Dynamic Loader Internals
The dynamic loader (`ld-linux.so`) is itself an ELF shared object that is mapped **before** the executable’s entry point runs. Its key data structures:

* **Link map** (`struct link_map`) – one per loaded object, forming a doubly‑linked list via `l_next`/`l_prev`.
* **Relocation tables** – `.rel.plt` (lazy) and `.rel.dyn` (eager).
* **Global Offset Table (GOT)** – holds absolute addresses; initially points to the resolver stub for lazy PLT entries.
* **Procedure Linkage Table (PLT)** – stubs that jump via GOT entries.

When the loader processes a `DT_NEEDED` entry for `libfoo.so`:
1. It searches library directories (`LD_LIBRARY_PATH`, `/etc/ld.so.cache`, `/lib`, `/usr/lib`).
2. It opens the file, validates its ELF header, and maps its `PT_LOAD` segments using the same bias calculation as above.
3. It adds a new `link_map` entry and stores the bias.
4. For each relocation of type `R_X86_64_GLOB_DAT` or `R_X86_64_JUMP_SLOT`, it resolves the symbol:
   * Looks up the symbol in the global symbol table (built from the executable and all already‑loaded objects, ordered by breadth‑first search).
   * If found, writes the symbol’s address (`sym->st_value + sym_obj_bias`) into the relocation location.
   * If lazy binding (`PLT`), writes the address of the **dynamic resolver** (`_dl_runtime_resolve`) into the GOT entry; the first call to the PLT stub pushes the relocation index and jumps to the resolver, which then performs the lookup and updates the GOT.

Mathematically, the final address of a resolved symbol `s` in object `O` is:

$$ \text{addr}(s) = B_O + s.st\_value $$

where $B_O$ is the load bias of object $O$.

---

## Worked Examples
### Example 1: Loading a Statically Linked Executable
Consider a simple static program compiled with `gcc -static -o hello hello.c`. Its ELF header shows one `PT_LOAD` segment covering both code and data.

```bash
$ gcc -static -o hello hello.c
$ readelf -l hello
Elf file type is EXEC (Executable file)
Entry point 0x401000
There are 2 program headers:
  PT_LOAD    off 0x00000000 vaddr 0x0000000000400000 paddr 0x0000000000400000
              filesz 0x000000000009b000 memsz 0x000000000009b000 flags r-x
  PT_LOAD    off 0x00000009b000 vaddr 0x000000000049b000 paddr 0x000000000049b000
              filesz 0x000000000000c000 memsz 0x000000000001c000 flags rw-
```

**Loader actions (with page size 4096):**

1. **First segment** (`PT_LOAD`, `r-x`):
   * `file_off = 0 & ~0xfff = 0`
   * `mem_addr = (0x400000 + B) & ~0xfff`. Since it’s an executable (`ET_EXEC`), the kernel uses the **link‑address** directly (`B = 0`). So `mem_addr = 0x400000`.
   * `map_len = align_up(0x9b000, 0x1000) = 0x9b000`.
   * `mmap(NULL, 0x9b000, PROT_READ|PROT_EXEC, MAP_PRIVATE|MAP_DENYWRITE, fd, 0)` → maps at `0x400000`.

2. **Second segment** (`PT_LOAD`, `rw-`):
   * `file_off = 0x9b000 & ~0xfff = 0x9b000`
   * `mem_addr = (0x49b000 + B) & ~0xfff = 0x49b000`
   * `map_len = align_up(0xc000 + (0x9b000 - 0x9b000), 0x1000) = 0xc000` (file part) + zero‑fill up to `0x1c000` for `.bss`.

3. **Stack**: allocated 8 MiB at a random address (due to ASLR). Suppose the kernel picks `0x7fffe0000000` as the top; the stack grows down.

4. **Registers**: `%rip = 0x401000`, `%rsp = 0x7fffe0000000 - 0x100` (space for `auxv`, `envp`, `argv`, `argc`).

The program then starts at `0x401000`, which is the `_start` routine supplied by crt0, eventually calling `__libc_start_main` → `main`.

### Example 2: Dynamic Loading with `dlopen`
Suppose we have:

```c
// libvector.c
#include <stdio.h>
void vector_add(double *a, double *b, double *res, int n) {
    for (int i = 0; i < n; ++i)
        res[i] = a[i] + b[i];
}
```

Compile as a shared object:

```bash
$ gcc -fPIC -shared -o libvector.so libvector.c
```

Now a loader program:

```c
// loader.c
#define _GNU_SOURCE
#include <stdio.h>
#include <dlfcn.h>

int main(void) {
    void *handle = dlopen("./libvector.so", RTLD_LAZY);
    if (!handle) { fprintf(stderr, "%s\n", dlerror()); return 1; }

    typedef void (*vec_add_t)(double*,double*,double*,int);
    vec_add_t vec_add = (vec_add_t)dlsym(handle, "vector_add");
    const char *err = dlerror();
    if (err) { fprintf(stderr, "%s\n", err); return 1; }

    double a[3] = {1.0, 2.0, 3.0};
    double b[3] = {4.0, 5.0, 6.0};
    double c[3];
    vec_add(a, b, c, 3);
    printf("result: %f %f %f\n", c[0], c[1], c[2]);

    dlclose(handle);
    return 0;
}
```

Compile and run:

```bash
$ gcc -o loader loader.c -ldl
$ ./loader
result: 5.000000 7.000000 9.000000
```

**What the dynamic loader does:**

1. `dlopen` maps `libvector.so` using the same `PT_LOAD` logic as the kernel, computing a bias `B_lib` (often non‑zero due to ASLR).
2. It builds a link map for `libvector.so` and adds it to the global list.
3. It processes `DT_RELA` entries: the only relocation is a `R_X86_64_GLOB_DAT` for the symbol `_GLOBAL_OFFSET_TABLE_` (already resolved) and possibly a `R_X86_64_RELATIVE` for the GOT.
4. `dlsym` looks up `"vector_add"` in the global symbol table (executable + loaded objects). It finds the definition in `libvector.so` at offset `0x800` from the object's base, returns `B_lib + 0x800`.
5. The call jumps to that address; the function executes and returns.

If we run with `LD_DEBUG=libs,reloc ./loader`, we see the exact sequence of library loads and relocations, confirming the bias calculations.

### Example 3: Runtime Initialization (`.init_array`)
Consider:

```c
// init.c
#include <stdio.h>
static int x __attribute__((constructor(101))) = 10;
static void __attribute__((constructor)) init_y(void) { printf("y init\n"); }
static void __attribute__((destructor)) fini_y(void) { printf("y fini\n"); }

int main(void) {
    printf("x = %d\n", x);
    return 0;
}
```

Compile:

```bash
$ gcc -o init init.c
```

**Loader steps:**

* After mapping the executable’s segments, the dynamic loader (still part of the same process because the executable is dynamically linked by default) scans the `.init_array` section.
* It finds two entries: the address of `init_y` and the address of the constructor for `x` (priority 101).
* It calls them **in order of increasing priority**: first `init_y` (prints “y init”), then the constructor for `x` (sets `x = 10`).
* Control then transfers to `__libc_start_main` → `main`, which prints `x = 10`.
* At exit, the destructor `fini_y` runs.

We can verify with `readelf -S init`:

```bash
$ readelf -S init | grep -A2 '\.init_array'
  [14] .init_array       INIT_ARRAY        0000000000400ff0  0000ff0
       0000000000000010  0000000000000000  WA  0     0     8
```

The section holds two 8‑byte pointers (function addresses).

---

## Common Mistakes
| Mistake | Why It’s Wrong | Correct Understanding |
|---------|----------------|-----------------------|
| **“The loader just copies the file into memory.”** | Ignores relocation, protection bits, stack/auxv creation, and interpreter handling. | The loader must **relocate** addresses, set proper `PROT_*` flags, create the stack with `argc/argv/envp/auxv`, and, for dynamically linked binaries, transfer control to the interpreter. |
| **“Static linking eliminates the need for a loader.”** | Even a statically linked binary still needs the kernel loader to create VMAs, set up the stack, and transfer to `_start`. | Static linking only removes the **dynamic loader** step; the **exec loader** is still required. |
| **“The stack grows upward on x86‑64.”** | The architecture defines the stack to grow toward **lower** addresses; confusing this leads to buffer‑overflow misunderstandings. | On x86‑64, `%rsp` decreases on `push`; the kernel maps the stack as a `VM_GROWSDOWN` VMA. |
| **“ASLR only randomizes the stack.”** | ASLR also randomizes the base of the executable, libraries, vDSO, and the heap (via `brk`/`mmap`). | The loader computes a bias `B` for the executable and each shared object; the kernel also randomizes `mmap_base` for anonymous mappings. |
| **“`dlopen` with `RTLD_LAZY` means no relocations are performed.”** | Lazy binding only defers **PLT** relocations (`JUMP_SLOT`); **data** relocations (`GLOB_DAT`, `RELATIVE`, `COPY`) are still resolved immediately. | The loader processes all `DT_REL`/`DT_RELA` entries except those in `.rel.plt` when `RTLD_LAZY` is used; those are resolved on first PLT call. |
| **“The entry point of a program is always `main`.”** | The entry point is `_start` (or the interpreter’s entry point); `main` is invoked via `__libc_start_main`. | Confusing these leads to missing initialization of TLS, constructors, and auxiliary vector. |

---

## Exercises
### Easy
1. **Inspect an executable’s layout**  
   ```bash
   $ gcc -o hello hello.c
   $ readelf -l hello   # note PT_LOAD segments
   $ readelf -S hello   # note .init_array size
   $ objdump -x hello | grep NEEDED   # see shared library dependencies
   ```

2. **Print the auxiliary vector**  
   ```c
   // auxv.c
   #include <stdio.h>
   #include <sys/auxv.h>
   int main(void) {
       unsigned long val = getauxval(AT_BASE);
       printf("AT_BASE (bias) = 0x%lx\n", val);
       val = getauxval(AT_ENTRY);
       printf("AT_ENTRY = 0x%lx\n", val);
       return 0;
   }
   ```
   ```bash
   $ gcc -o auxv auxv.c
   $ ./auxv
   ```

### Medium
3. **Implement a minimal loader using `execve`**  
   Write a program that forks, the child calls `execve("/bin/ls", argv, envp)`, and the parent waits and then prints the child’s exit status. Use `execve` directly (no `execlp` wrappers) to see the raw interface.

4. **Interpose on `dlopen` with `LD_PRELOAD`**  
   Create a library that logs every `dlopen` call, then run a dynamically linked program with `LD_PRELOAD=./logdlopen.so ./prog`. Observe the order of library loading.

### Hard
5. **Write a POSIX‑compliant dynamic loader for ET_DN objects**  
   Using only `mmap`, `memcpy`, and basic ELF parsing, load a simple shared object (with only `.text` and `.data` segments) into memory, apply `R_X86_64_RELATIVE` relocations, and call its exported function via a function pointer. No `dlopen` allowed. Test on a small hand‑crafted `.so` you generate with `ld -shared`.

6. **Measure the cost of lazy binding**  
   Write a benchmark that calls a function via the PLT many times, first with `RTLD_NOW` (set via `LD_BIND_NOW=1`) and once with default lazy binding. Use `rdtsc` or `clock_gettime(CLOCK_MONOTONIC)` to quantify the overhead of the resolver on the first call versus subsequent calls.

---

## Linux Connection
The Linux kernel’s ELF loader lives in **`fs/binfmt_elf.c`** (the `elf_binfmt` structure). Key functions:

| Function | Purpose |
|----------|---------|
| `load_elf_binary` | Main entry point from `do_execve`; processes PT_LOAD segments, sets up stack, auxiliary vector. |
| `load_elf_interp` | Loads the PT_INTERP program (usually `/lib64/ld-linux-x86-64.so.2`). |
| `flush_old_exec` | Clears the previous process’s memory structures. |
| `setup_arg_pages` | Builds the stack layout (argv, envp, auxv). |
| `start_thread` | Sets `%rip`, `%rsp`, and clears `%rbp`/`%fs.base`/`%gs.base`. |

### Demonstration Commands
```bash
# Show the interpreter used by a binary
$ readelf
