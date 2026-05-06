---
id: 64
title: "C language at systems depth"
supermoduleId: 6
estimatedMinutes: 45
resources:
  - type: book
    title: "Computer Systems A Programmers Perspective (Bryant)"
  - type: book
    title: "The C Programming Language (K&R)"
---

## Core Concepts  

### Memory Layout of a C Process  
When a program is loaded, the kernel creates a virtual address space divided into regions with distinct permissions and lifetimes. The layout follows the ELF specification and the System V AMD64 ABI (the same on x86‑32 with minor differences).  

| Region | Contents | Permissions | Lifetime | Typical Source |
|--------|----------|-------------|----------|----------------|
| **Text** (`[text]`) | Machine code, read‑only constants (`const`) | `r-x` | Exec lifetime | `.text`, `.rodata` ELF sections |
| **Data** (`[data]`) | Initialized global & static variables | `rw-` | Exec lifetime | `.data` |
| **BSS** (`[bss]`) | Zero‑initialized global & static variables | `rw-` | Exec lifetime | `.bss` (allocated zero‑filled by loader) |
| **Heap** (`[heap]`) | Dynamically allocated memory (`malloc`, `mmap`) | `rw-` | Until `free`/`munmap` or process exit | Grows upward via `brk`/`sbrk` or via `mmap` |
| **Stack** (`[stack]`) | Function call frames, local variables, spill slots, return address | `rw-` | Per‑thread, LIFO | Grows downward; size limited by `ulimit -s` |

The **stack pointer** (`%rsp` on x86‑64) always points to the *lowest* address of the current frame. A `call` instruction pushes the return address (8 bytes) and decrements `%rsp`; `ret` pops it and increments `%rsp`.  

#### Storage Duration  
C’s storage duration maps directly to these regions:

* **Automatic** → stack (allocated by decrementing `%rsp`, destroyed on block exit).  
* **Static** → data/bss (allocated by the loader, lives for the whole program).  
* **Dynamic** → heap (explicit lifetime via `malloc`/`free`).  

There is no separate “allocated storage duration”; the standard’s term is just a synonym for dynamic duration.

### Pointers, Arrays, and Address Arithmetic  
A pointer holds a *virtual address*. The C standard defines pointer arithmetic only within a single allocated object (or one past its last element). The result of `p + i` is:

$$
\text{addr}(p+i) = \text{addr}(p) + i \times \text{sizeof}(\text{pointed\_type})
$$

If `p` points to an element of an array `T[N]`, the valid `i` range is `[0, N]`. The “one‑past” pointer is legal for comparison but dereferencing it yields UB.

### Structs, Unions, and Padding  
The compiler lays out struct members in declaration order, inserting **padding** to satisfy each member’s alignment requirement. For a type `T` with alignment `a_T`, the offset of the next member must be a multiple of `a_T`. The overall struct size is rounded up to a multiple of its **strictest alignment** (the maximum of its members’ alignments).  

Formally, if members have offsets `o_0=0`, `o_{k+1} = \text{align\_up}(o_k + \text{size}_k, a_{k+1})`, then  

$$
\text{sizeof}(\text{struct}) = \text{align\_up}(o_{n} + \text{size}_n, a_{\max})
$$

where `\text{align\_up}(x, a) = ((x + a - 1) / a) * a`.  

A union’s size is `max(sizeof(members))` and its alignment is the maximum of its members’ alignments; all members start at offset 0.

### Volatile  
`volatile` tells the compiler **not** to assume the value is unchanged between accesses and to emit *every* load/store exactly as written. It does **not** guarantee atomicity or ordering; for those you need `stdatomic.h` or memory barriers. The keyword inhibits optimizations such as:

* Caching a variable in a register across a loop.  
* Removing a load/store deemed “dead” because the value appears unused.  

It is essential for memory‑mapped I/O where the hardware can change the location independently of the CPU.

### Undefined Behavior (UB)  
UB arises when the C standard imposes no requirement on the outcome. The compiler may then assume the premise is false and optimize accordingly. Typical sources:

* Out‑of‑bounds array access (`a[N]` where `N≥size`).  
* Dereferencing null or dangling pointers.  
* Signed integer overflow.  
* Violating the *effective type* rule (strict aliasing).  
* Using an uninitialized automatic variable.  

Because the compiler can assume UB never happens, it may remove code that *seems* essential (e.g., bounds checks) leading to security vulnerabilities.

---

## How It Works  

### Virtual Memory and the Page Table  
The CPU translates a virtual address `va` to a physical address `pa` via a multi‑level page table. On x86‑64 with 4‑KB pages:

$$
\text{offset} = va \bmod 2^{12} \\
\text{PT\_index}_i = (va \gg (12 + 9i)) \bmod 2^{9} \quad (i=0..3)
$$

Each level yields a 64‑bit page‑table entry (PTE). If the *present* bit is clear, a page fault occurs; the kernel’s fault handler loads the page from swap or a memory‑mapped file, updates the PTE, and retries the instruction.  

The **TLB** caches recent translations; a miss incurs a walk cost of ~100 ns on modern CPUs.

### Stack Mechanics  
When `func(a,b)` is called under the System V ABI:

1. Arguments `a`,`b` (if ≤ 6) are placed in registers `%rdi`, `%rsi`, `%rdx`, `%rcx`, `%r8`, `%r9`.  
2. The caller pushes any remaining arguments onto the stack (right‑to‑left).  
3. `call` pushes the return address (`%rip` after the call) and decrements `%rsp` by 8.  
4. The prologue typically does:  

```asm
push   %rbp          ; save old frame pointer
mov    %rsp, %rbp    ; establish new frame pointer
sub    $0x20, %rsp   ; allocate space for locals + spill area
```

Locals are accessed at negative offsets from `%rbp` (`-8(%rbp)` for the first 8‑byte local). When `ret` executes, the saved `%rbp` is restored, `%rsp` is set to the saved `%rbp`+8, and the return address is popped into `%rip`.  

Thus, a function’s stack frame is a contiguous block whose size is known at compile time (sum of local sizes + saved registers + spill area, rounded to 16‑byte alignment for SSE).

### Heap Allocation (glibc’s ptmalloc2)  
`malloc(size)` first rounds `size` up to a multiple of the **chunk alignment** (16 bytes on 64‑bit) and adds `sizeof(struct malloc_chunk)` (16 bytes) for metadata. The request becomes a *chunk* size `C`.  

* If `C` ≤ `MMAP_THRESHOLD` (default 128 KB), the allocator searches the **free list** of the appropriate *bin* (fastbin, smallbin, largebin) using a best‑fit strategy.  
* If no suitable free chunk exists, it calls `sbrk()` to increase the program break (`brk`) or, for larger requests, directly `mmap()`s a private anonymous page.  

`free(ptr)` marks the chunk as free and may coalesce with adjacent free chunks (forward/backward consolidation) to reduce fragmentation.  

The **break** (`brk`) is the first address after the heap; `sbrk(0)` returns it. The heap grows only upward; returning memory to the OS occurs only when the topmost chunk becomes free and `sbrk(-size)` is invoked (or via `M_MMAP_THRESHOLD`/`M_TRIM_THRESHOLD` tunables).

### Pointer Representation  
On a flat virtual memory system, a pointer is simply the virtual address. The C standard permits converting a pointer to an integer type large enough to hold it (`uintptr_t`) and back, preserving the value. This enables low‑level tricks such as:

```c
uintptr_t addr = (uintptr_t)ptr;
ptr = (void *)(addr + offset);
```

However, pointer‑to‑integer casts are *implementation‑defined* if the pointer does not point to an object or function; the result may be trap‑representations on exotic architectures (e.g., segmented machines).

### Struct Layout Example (Derivation)  

```c
struct S {
    char   c;   // offset 0, size 1, alignment 1
    int    x;   // offset ? , size 4, alignment 4
    short  s;   // offset ? , size 2, alignment 2
    double d;   // offset ? , size 8, alignment 8
};
```

* `c` at 0 → next offset = 1. Align up to 4 → `x` at 4.  
* `x` ends at 8 → next offset = 8. Align up to 2 → `s` at 8 (already aligned).  
* `s` ends at 10 → next offset = 10. Align up to 8 → `d` at 16.  
* `d` ends at 24 → struct size must be multiple of max alignment (8) → already 24 → no tail padding.

Thus `sizeof(struct S) = 24`. If we reorder members to `{double d; int x; short s; char c;}` we get:

* `d` at 0 (size 8)  
* `x` at 8 (size 4)  
* `s` at 12 (size 2) → next offset 14, align up to 1 → `c` at 14  
* Tail padding to 8‑byte boundary → size 16.

Reordering can halve the size, a critical optimization in cache‑sensitive code.

### Volatile and Compiler Barriers  
Consider:

```c
volatile int flag;
while (!flag) { /* spin */ }
```

Without `volatile`, the compiler might hoist the load out of the loop:

```c
int tmp = flag;
while (!tmp) { /* infinite loop */ }
```

With `volatile`, each iteration emits a load (`mov    (%rip),%eax`) preventing the optimization. On x86, this load also acts as a *load‑acquire* barrier (though not a full memory barrier); for stronger ordering use `__asm__ volatile("" ::: "memory")` or `stdatomic.h`.

### Detecting UB at Runtime  
Tools like **AddressSanitizer (ASan)** compile with `-fsanitize=address` and insert *red zones* around allocations and *shadow memory* to detect:

* Out‑of‑bounds reads/writes (detected via inaccessible shadow).  
* Use‑after‑free (poisoned freed memory).  
* Stack‑buffer overflow (red zone before/after each stack frame).  

When a violation occurs, the runtime prints a detailed stack trace and aborts.

---

## Worked Examples  

### Example 1: Computing the Address of an Array Element  
Given:

```c
int a[20];
int *p = a + 5;      // points to a[5]
```

Assume the base address of `a` is `0x7ffeefbff4c0` (as seen in GDB). `sizeof(int) = 4`.  

The address of `a[i]` is `base + i * 4`.  

For `i = 5`:

$$
\text{addr} = 0x7ffeefbff4c0 + 5 \times 4 = 0x7ffeefbff4c0 + 0x14 = 0x7ffeefbff4d4
$$

GDB confirms:

```bash
(gdb) p/a &a[5]
$1 = (int *) 0x7ffeefbff4d4
```

### Example 2: Pointer Arithmetic Across Struct Members  
```c
struct Node {
    int   id;
    double value;
    struct Node *next;
};
```

Assume an instance `n` resides at `0x602000`. Layout (system V AMD64):

* `id` at offset 0 (size 4) → next offset 4, align up to 8 → padding 4 bytes.  
* `value` at offset 8 (size 8).  
* `next` at offset 16 (size 8).  

Thus `sizeof(struct Node) = 24`.  

To get a pointer to `value` from `n`:

```c
double *vptr = &n.value;               // compiler emits: lea 0x8(%rdi),%rax
```

Or via pointer arithmetic:

```c
double *vptr = (double *)((char *)&n + 8);
```

The cast to `char *` is necessary because pointer arithmetic on `struct Node *` would scale by `sizeof(struct Node) = 24`.

### Example 3: Volatile Prevents Loop Optimization  
```c
volatile int ready = 0;
while (!ready) {
    // wait for interrupt handler to set ready
}
```

Compiled with `-O2` (no volatile) yields:

```asm
.L2:
    jmp .L2          # infinite loop, ready never reloaded
```

With `volatile`:

```asm
.L3:
    mov    0x2009c2(%rip),%eax   # load ready each iteration
    test   %eax,%eax
    jne    .L4
    jmp    .L3
```

The extra load guarantees the loop observes changes made by the handler.

### Example 4: Detecting a Use‑After‑Free with ASan  
Compile:

```bash
gcc -g -O0 -fsanitize=address -fno-omit-frame-pointer uaf.c -o uaf
```

```c
#include <stdlib.h>
int main(void) {
    int *p = malloc(sizeof(int));
    free(p);
    *p = 42;          // ASan reports heap-use-after-free
    return 0;
}
```

Running `./uaf` produces:

```
==12345==ERROR: AddressSanitizer: heap-use-after-free on address 0x602000000010
    #0 0x5555555551ab in main uaf.c:5
    ...
```

The shadow byte for `0x602000000010` is `0xfa` (freed region), triggering the abort.

---

## Common Mistakes  

| Mistake | Why It’s Wrong | Fix & Reasoning |
|---------|----------------|-----------------|
| **1. Assuming `malloc` returns zero‑filled memory** | The C standard only guarantees suitably aligned storage; contents are indeterminate. Using it as zero‑filled leads to logic bugs. | Call `memset(ptr, 0, size)` or use `calloc`. |
| **2. Using `sizeof` on a pointer to determine array length** | `sizeof(p)` yields pointer size (8 bytes on x86‑64), not the number of elements. | Keep a separate length variable or pass it with the pointer. |
| **3. Returning the address of a local variable** | The variable lives in the current stack frame; after return the frame is destroyed, leaving a dangling pointer. | Allocate with `static`, `malloc`, or return a struct by value. |
| **4. Writing `if (x = 10) …` (assignment instead of equality)** | The assignment expression evaluates to `10` (true), so the branch is always taken, masking the intended comparison. | Enable `-Wparentheses` or `-Werror=parentheses`; use `if (x == 10)`. |
| **5. Ignoring padding when memcpy‑ing structs to a buffer** | Padding bytes may contain indeterminate values; copying them can leak stack data or violate protocol specs. | Use `memcpy(&buf[offset], &struct.member, sizeof(struct.member))` for each field, or pack the struct with `#pragma pack` and document the layout. |
| **6. Assuming `volatile` makes a variable atomic** | `volatile` only prevents compiler caching; concurrent reads/writes still race. | Use `stdatomic.h` (`atomic_int`) or proper locking/memory barriers. |
| **7. Signed integer overflow (`INT_MAX + 1`)** | Signed overflow is UB; the compiler may assume it never happens and optimize away checks. | Use unsigned arithmetic or check with `if (a > INT_MAX - b)` before adding. |
| **8. Misaligned access (e.g., dereferencing `int *` pointing to an odd address)** | On many CPUs, misaligned loads fault or are slower; C permits it only if the type’s alignment requirement is satisfied. | Ensure pointers are properly aligned (`uintptr_t ptr % alignof(T) == 0`) or use `memcpy` to copy into a correctly aligned variable. |

Each mistake stems from a misunderstanding of the underlying memory model or translation rules; correcting it requires aligning the code with the hardware‑visible guarantees.

---

## Exercises  

### Easy  
1. **Address calculation** – Write a program that prints the address of `arr[7]` for `int arr[15];` using both `&arr[7]` and pointer arithmetic. Verify the addresses match.  
2. **Struct packing** – Define two structs, one with natural ordering and one reordered for minimal size. Print `sizeof` each and explain the difference using the alignment formula.  

### Medium  
3. **Manual heap growth** – Implement a simple allocator that only uses `sbrk`. Provide `my_malloc(size)` and `my_free(ptr)` that manage a free‑list using the first‑fit strategy. Test with a loop of allocations/frees and compare throughput to `glibc malloc`.  
4. **Volatile spinlock** – Write a producer‑consumer pair where the producer sets a `volatile int flag = 1;` and the consumer busy‑waits on it. Compile with `-O2` and `-O0`; observe the generated assembly to confirm the load is not hoisted.  

### Hard  
5. **ASan‑style red zone** – Allocate a buffer with `malloc`, manually place a 16‑byte red zone after it (using `mmap` with `PROT_NONE`), and write a detector that triggers `SIGSEGV` on overflow. Demonstrate detection of a one‑byte overrun.  
6. **Linker script inspection** – Write a linker script that places a custom `.mydata` section at address `0x600000`. Define a variable `__attribute__((section(".mydata"))) int x;` and verify its address with `readelf -S` and `gdb`. Explain how the script influences the memory map.  

---

## Linux Connection  

### Observing the Memory Map  
```bash
# Show the process’s virtual memory regions
cat /proc/self/maps
```
Sample output (addresses are per‑run):
```
00400000-0040b000 r-xp 00000000 08:02 1234567 /home/user/demo
0060a000-0060b000 r--p 00000000 08:02 1234567 /home/user/demo
0060b000-0060c000 rw-p 00000000 08:02 1234567 /home/user/demo
01e00000-01e21000 rw-p 00000000 00:00 0      [heap]
7ffdfbdda000-7ffdfbddc000 rw-p 00000000 00:00 0      [stack]
```
* The **heap** appears as `[heap]` with `rw-p` permissions.  
* The **stack** grows downward (high addresses → lower addresses).  

### Inspecting ELF Sections  
```bash
# List sections and their virtual addresses
readelf -S demo
```
Typical output includes:
```
[Nr] Name              Type            Addr     Off    Size   ES Flg Lk Inf Al
[ 1] .text             PROGBITS        00400000 001000 000b00 00  AX  0   0 16
[ 2] .rodata           PROGBITS        0040b000 001b00 000200 00  A   0   0 16
[ 3] .data             PROGBITS        0060a000 001d00 000018 00  WA  0   0  8
[ 4] .bss              NOBITS          0060b000 001d18 000008 00  WA  0   0  8
```
The **BSS** section is marked `NOBITS` (no file space) because the loader zero‑fills it at startup.

### Changing the Break (`brk`)  
```c
#include <unistd.h>
#include <stdio.h>
int main(void) {
    void *old = sbrk(0);
    printf("Initial break: %p\n", old);
    void *new = sbrk(4096);   // ask for one page
    if (new == (void *)-1) perror("sbrk");
    printf("New break: %p\n", sbrk(0));
    return 0;
}
```
Compile and run:
```bash
gcc -O0 -Wall brk_demo.c -o brk_demo
./brk_demo
```
You will see the break increase by exactly 4096 bytes (one page). This is the primitive underlying `malloc` for small allocations.

### Using `valgrind` to Detect Errors  
```bash
valgrind --tool=memcheck --leak-check=full ./your_program
```
Valgrind intercepts `malloc`, `free`, `brk`, `mmap`, etc., and tracks each byte’s state (valid, uninitialized, freed). It prints errors such as:
```
Invalid read of size 4
    at 0x4005F2: main (example.c:10)
    Address 0x4c09040 is 0 bytes after a block of size 4 alloc'd
```
### Measuring Cache Effects of Struct Padding  
```bash
perf stat -e cache-references,cache-misses ./struct_test
```
By comparing two struct layouts (packed vs. natural) you can see the impact on cache‑miss rate, illustrating why padding matters for performance.

---

## Why This Matters  

Understanding the C memory model is not academic trivia; it is the foundation upon which reliable systems software is built.  

* **Correctness** – Knowing which storage duration applies to each variable prevents dangling pointers, use‑after‑free, and uninitialized‑value bugs, which are the leading causes of CVEs in C code.  
* **Performance** – Awareness of alignment, padding, and locality lets you arrange data structures to minimize cache misses and false sharing, directly improving throughput in high‑frequency networking, databases, or kernels.  
* **Debugging** – Tools like `gdb`, `valgrind`, `perf`, and `ASan` operate by interpreting the same memory regions the kernel manages; being able to read `/proc/self/maps` or decode a page‑fault address turns a cryptic crash into a diagnosable problem.  
* **Portability** – The C standard deliberately leaves many layout details implementation‑defined. By grounding your expectations in the actual Linux/AMD64 ABI (stack growth direction, page size, alignment rules) you write code that behaves predictably when ported to other UNIX‑like systems or when changing compiler versions.  
* **Systems Programming** – Linux kernel modules, device drivers, and low‑level utilities routinely manipulate hardware registers via `volatile` pointers, allocate memory with `vmalloc`/`kmalloc`, and rely on precise struct overlays to match device‑specified layouts. Mastering the user‑space
