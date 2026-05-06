---
id: 201
title: "Runtime systems"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Runtime System Definition
A runtime system is the software layer that sits between a program’s machine code and the kernel, providing the abstractions the program expects: a process address space, stack, heap, thread library, signal handling, dynamic linking, and memory management. Unlike a library, the runtime is invoked automatically by the kernel before the program’s entry point (`_start`) runs.

### Process Startup in Linux
When the kernel executes an ELF binary it performs the following deterministic steps:

1. **Load ELF headers** – verify `e_ident`, program header table (`phdr`), and segment permissions.
2. **Create memory map** – for each `PT_LOAD` segment, `mmap` the corresponding file pages with `PROT_READ|PROT_EXEC|PROT_WRITE` as indicated by `p_flags`. The kernel sets the initial `brk` after the data segment.
3. **Set up the stack** – copy `argc`, `argv[]`, `envp[]`, and the auxiliary vector (`auxv`) onto the user stack. The auxiliary vector contains entries such as `AT_PHDR`, `AT_PHENT`, `AT_PHNUM`, `AT_ENTRY`, `AT_UID`, `AT_GID`, `AT_PAGESZ`, and `AT_RANDOM`.  
   The layout (high to low addresses) is:  
   ```
   [argc] [argv pointers] [envp pointers] [auxv] [alignment padding] [user‑provided data]
   ```
4. **Transfer control** to the entry point `_start` found in the crt0 object (usually part of glibc). `_start` prepares registers, aligns the stack to a 16‑byte boundary (required by the SysV ABI), and calls `__libc_start_main`.

### Stack vs. Heap Organization
- **Stack**: a contiguous region that grows toward lower addresses on x86‑64 (default size 8 MiB, adjustable via `ulimit -s`). Each function call pushes a **stack frame** containing:
  - Return address (8 bytes)
  - Saved base pointer (`rbp`) – optional if frame‑pointer omission (`-fomit-frame-pointer`) is used
  - Saved callee‑saved registers (`rbx`, `r12‑r15`)
  - Local variables and temporaries
  - Space for outgoing arguments (the “red zone” of 128 bytes below `rsp` is reserved for leaf functions)

  The compiler emits `sub $N, %rsp` to allocate `N` bytes; the stack pointer (`rsp`) is always kept 16‑byte aligned at a call site (`%rsp % 16 == 8` after the push of the return address).

- **Heap**: a region managed by the runtime’s allocator, initially located just above the data segment (`_end`). The kernel provides two primitives for growing/shrinking it:
  - `brk(addr)` – sets the program break to `addr`; returns the previous break or `-1` on failure (`ENOMEM`).
  - `mmap(NULL, length, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0)` – creates a new anonymous mapping; used by modern allocators for large allocations (> MMAP_THRESHOLD, default 128 KiB in glibc).

  The allocator maintains **metadata** alongside each allocated chunk. In ptmalloc2 (glibc’s default) a chunk looks like:

  ```
  | prev_size (if PREV_INUSE=0) | size|prev_inuse_flag | user data ... |
  ```

  The `size` field includes the chunk’s total size and the lowest three bits encode flags (`PREV_INUSE`, `IS_MAPPED`, `NON_MAIN_ARENA`). The usable user size is `chunk_size - 2*SIZE_SZ` (where `SIZE_SZ = sizeof(size_t)`).

### Allocators
An allocator’s job is to turn a request `malloc(n)` into a pointer to a region of at least `n` usable bytes, while keeping fragmentation low and operation time bounded.

- **Boundary Tags (implicit free list)** – each free chunk stores its size in both the header and the footer (`prev_size` field of the next chunk). Coalescing with neighbors is O(1) by checking the `PREV_INUSE` bit of the next chunk and the footer of the previous chunk.
- **First‑Fit** – scan the free list from the beginning; returns the first chunk whose size ≥ request. Expected number of inspected chunks is proportional to the fraction of free memory.
- **Best‑Fit** – scan the entire list to find the smallest sufficient chunk; reduces external fragmentation but increases search time O(F) where F is number of free chunks.
- **Segregated Free Lists** – maintain separate lists for size classes (often powers of two). Allocation becomes O(1) by indexing the appropriate list; splitting and coalescing are still needed when a class is empty.
- **Buddy System** – splits blocks only into halves; internal fragmentation ≤ 50 % but merging is fast (O(log N)). Used by the kernel for page‑level allocation (`__get_free_pages`).

**Allocation cost model** (dlmalloc/ptmalloc2):
```
request = n
aligned = (n + MALLOC_ALIGN_MASK) & ~MALLOC_ALIGN_MASK   // MALLOC_ALIGN_MASK = 0xF on 64‑bit
chunk_size = aligned + 2*SIZE_SZ                         // header + footer
if chunk_size < MINSIZE: chunk_size = MINSIZE
```
The allocator then searches for a free chunk with `size ≥ chunk_size`. If found and the excess ≥ `MINSIZE`, it splits the chunk; otherwise it returns the whole chunk.

### Garbage Collection
A garbage collector (GC) reclaims memory that the program can no longer reach. The essential invariant is **reachability**: an object is live iff there exists a path from a **root** (stack registers, global data, thread‑local storage) to the object following pointer fields.

- **Reference Counting** – each object stores a count of incoming pointers; decrement on pointer overwrite, free when count reaches zero. Fails on cyclic structures; requires atomic updates for threads (costly).
- **Tracing Collectors** – periodically pause the program (stop‑the‑world) and traverse the object graph:
  1. **Mark** – start from roots, perform depth‑first or breadth‑first traversal, marking each visited object (setting a mark bit).
  2. **Sweep** – scan the heap; unmarked objects are freed, their memory returned to the free list; marked objects have their mark cleared.
- **Tri‑Color Invariant** (used by incremental/concurrent collectors):
  - White: unvisited (potentially garbage)
  - Gray: visited but children not yet processed
  - Black: visited and children processed
  The collector guarantees that no black object points to a white object; new pointers from black to gray are recorded via a **write barrier**.

Generational GC exploits the **weak generational hypothesis**: most objects die young. The heap is split into generations (e.g., nursery and tenured). Minor collections scan only the nursery and a remembered set of older→younger pointers; major collections occasionally tenured.

## How It Works
### From `execve` to `main`
1. **Kernel load** – as described in Core Concepts, the ELF program headers are mapped.
2. **Entry point `_start`** (provided by `crt1.o`):
   ```asm
   _start:
       xor %ebp, %rbp          // clear frame pointer
       pop %rdi                // argc
       lea (%rsp), %rsi        // argv
       lea 8(%rsp,%rdi,8), %rdx // envp
       and $-16, %rsp          // align stack
       call __libc_start_main
   ```
3. **`__libc_start_main`** (glibc):
   - Calls `init` functions from `.init` and `.init_array` sections (C++ static constructors, GCC `__attribute__((constructor))`).
   - Parses `auxv` to obtain page size, execution flags, etc.
   - Calls `main(argc, argv, envp)`.
   - After `main` returns, calls `exit` handlers (`.fini`, `atexit`).

### Memory Layout Example
Run the following to see the layout of a simple program:
```bash
$ cat > showmaps.c <<'EOF'
#include <stdio.h>
#include <unistd.h>
int main() {
    printf("pid=%d\n", getpid());
    fflush(stdout);
    sleep(30);   // give time to inspect
    return 0;
}
$ gcc -Wall -O0 -o showmaps showmaps.c
$ ./showmaps &
[1] 12345
pid=12345
$ cat /proc/12345/maps
00400000-00401000 r-xp 00000000 08:02 1234567 /home/user/showmaps
00600000-00601000 r--p 00000000 08:02 1234567 /home/user/showmaps
00601000-00602000 rw-p 00000000 08:02 1234567 /home/user/showmaps
00602000-00623000 rw-p 00000000 00:00 0      [heap]
7ffdda123000-7ffdda144000 rw-p 00000000 00:00 0      [stack]
...
```
- The **heap** starts at `0x602000` (just after the BSS) and grows upward via `brk` or `mmap`.
- The **stack** resides near the top of the address space and grows downward.

### Allocator Walk‑through (ptmalloc2)
Suppose we call `malloc(100)` on a fresh heap where the current break is `0x602000`.

1. **Request rounding**:  
   `aligned = (100 + 0xF) & ~0xF = 112`  
   `chunk_size = 112 + 2*8 = 128` bytes (`SIZE_SZ = 8` on 64‑bit).
2. **Find free chunk** – the initial top chunk (`av->top`) spans from `0x602000` to the current break. Its size is `break - 0x602000`. Since it’s large enough, we split:
   - Allocated chunk header at `0x602000`: size field = `128 | PREV_INUSE`.
   - User pointer returned = `0x602000 + 2*SIZE_SZ = 0x602010`.
   - Remainder top chunk becomes `0x602080` with size reduced by 128.
3. **Free** (`free(ptr)`):
   - Load chunk header, clear `PREV_INUSE` bit in the next chunk’s header.
   - If next chunk is also free, coalesce forward; similarly check previous chunk via its footer.
   - Insert the resulting free chunk into the appropriate bin (unsorted, small, or large) based on its size.

### Garbage Collector Walk‑through (mark‑sweep)
Consider a heap with objects laid out as contiguous cells, each with a header:
```
| size | mark bit (1) | payload ...
```
Roots are known (stack pointers, global variables). The collector proceeds:

**Mark Phase** (depth‑first using an explicit stack to avoid recursion):
```
mark_stack = push_all_roots()
while !mark_stack.empty():
    obj = mark_stack.pop()
    if obj.mark == 0:
        obj.mark = 1
        for each field f in obj.pointers:
            mark_stack.push(*f)
```
The work is proportional to the number of reachable objects **R** and the total number of pointer fields **P**.

**Sweep Phase**:
```
heap_ptr = heap_start
while heap_ptr < heap_end:
    size = heap_ptr->size & ~1   // clear mark bit
    if heap_ptr->mark == 0:
        // free: return to freelist
        insert_into_freelist(heap_ptr, size)
    else:
        heap_ptr->mark = 0       // prepare for next cycle
    heap_ptr += size
```
Overall time: **O(H)** where H is heap size in bytes; space overhead is one bit per object plus the mark stack (worst‑case O(R)).

## Worked Examples
### Example 1: Process Creation – `fork` + `execve`
We trace the creation of a child that runs `/bin/ls`.

```c
#include <stdio.h>
#include <unistd.h>
#include <sys/wait.h>
int main(void) {
    pid_t pid = fork();
    if (pid == 0) {                 // child
        execlp("ls", "ls", "-l", NULL);
        _exit(127);                 // only if exec fails
    }
    // parent
    int status;
    waitpid(pid, &status, 0);
    printf("child exited with %d\n", WEXITSTATUS(status));
    return 0;
}
```

**Step‑by‑step (numbers on a typical x86‑64 Linux 5.15 kernel, page size 4096):**

| Step | Action | Kernel/Data Structure | Approx. Cost |
|------|--------|-----------------------|--------------|
| 1    | `fork()` → `clone(SIGCHLD, ...)` | allocates new `task_struct`, copies parent’s mm (copy‑on‑write). Creates new `vm_area_struct` tree (VMA) covering same regions. | ~O(number of VMAs) ~ few µs |
| 2    | Child returns 0, parent gets PID. | `task_struct->pid` set. | – |
| 3    | Child calls `execlp("ls", …)` → `execve("/bin/ls", argv, envp)` | Kernel searches `$PATH`, opens ELF file, validates headers. Allocates new `mm_struct`, releases old one via `exit_mmap`. Maps ELF segments (`PT_LOAD`) with `mmap`. Sets `brk` after data segment. Copies `argc`, `argv`, `envp`, `auxv` onto new stack (size ~PAGE_SIZE). Sets `rip` to ELF entry point. | ~tens of µs (dominated by disk I/O if not cached). |
| 4    | ELF entry `_start` runs, calls `__libc_start_main`, then `main` of `ls`. | – | – |
| 5    | Parent `waitpid` puts thread into `TASK_WAKEKILL` until child exits, then reclaims child’s `task_struct`. | – | – |

**Observation via `/proc`:**  
Before exec, `/proc/<child>/maps` shows the parent’s memory regions (stack, heap, libc). After exec, the regions are replaced by those of `/bin/ls`.

### Example 2: Memory Allocation – `malloc(100)` inside a loop
```c
#include <stdlib.h>
#include <stdio.h>
int main(void) {
    for (int i = 0; i < 1e6; ++i) {
        volatile int *p = malloc(100 * sizeof int);
        if (!p) { perror("malloc"); return 1; }
        p[0] = i;            // touch to ensure allocation is real
        free(p);
    }
    return 0;
}
```

**Instrumentation with `jemalloc` stats (or glibc `malloc_stats`):**
```c
#define MALLOC_STATS
#include <malloc.h>
int main(void) {
    malloc_stats();   // before loop
    for (int i = 0; i < 1000; ++i) {
        int *p = malloc(100);
        free(p);
    }
    malloc_stats();   // after loop
    return 0;
}
```
Sample output (glibc 2.31):
```
Arena 0:
system bytes    = 131072
in use bytes    = 112640
...
```
*Explanation:*  
- Each request of 100 int = 400 bytes → aligned to 416 → chunk size = 416 + 16 = 432 bytes.  
- The allocator serves from the **top chunk** until it needs to request more memory from the kernel via `sbrk` or `mmap`.  
- After 1000 allocations, `system bytes` grew by ~432 KB (rounded up to page multiples). The `in use bytes` stays near zero because each block is immediately freed and returned to the **unsorted bin**, which is quickly reused.

### Example 3: Simple Mark‑Sweep GC in Python (educational)
```python
import gc, sys, weakref

class Obj:
    def __init__(self, val):
        self.val = val
        self.refs = []   # list of references to other Obj

    def add(self, other):
        self.refs.append(other)

roots = []   # simulate global roots

def make_chain(n):
    head = Obj(0)
    roots.append(head)
    prev = head
    for i in range(1, n):
        cur = Obj(i)
        prev.add(cur)
        prev = cur
    return head

def mark(obj, visited):
    if id(obj) in visited:
        return
    visited.add(id(obj))
    for f in obj.refs:
        mark(f, visited)

def sweep(heap, visited):
    to_free = [o for o in heap if id(o) not in visited]
    for o in to_free:
        heap.remove(o)
    return len(to_free)

def gc_collect():
    visited = set()
    for r in roots:
        mark(r, visited)
    freed = sweep(gc.get_objects(), visited)
    return freed

# Build a structure, break a link, collect
head = make_chain(10000)
# make a cycle that is not reachable from roots
a = Obj(1); b = Obj(2)
a.refs.append(b); b.refs.append(a)   # isolated cycle
# now collect
collected = gc_collect()
print("collected", collected)   # should be 2 (the isolated cycle)
```

**Explanation of cost:**  
- Mark traverses each reachable object once → O(R).  
- Sweep scans the entire heap → O(H).  
- In CPython’s actual GC, generations reduce H for minor collections.

## Common Mistakes
### Mistake 1: Assuming `malloc` Returns Zero‑filled Memory
```c
int *p = malloc(10 * sizeof int);
p[5] = 42;   // OK
// later, without re‑initializing:
for (int i = 0; i < 10; ++i)   // reads garbage unless previously set
    if (p[i] == 0) ...        // bug
```
**Why it’s wrong:** The C standard only guarantees that the returned pointer points to suitably aligned storage; the contents are indeterminate. Relying on zeroes leads to nondeterministic bugs, especially after `free`/`malloc` reuse where the heap may retain previous values.

### Mistake 2: Freeing a Pointer Not Obtained from `malloc`/`calloc`/`realloc`
```c
int arr[10];
free(arr);   // undefined behavior
```
**Why it’s wrong:** The heap manager validates that the pointer lies within a managed chunk and that the chunk’s size field matches expectations. Passing a stack or global address corrupts the heap’s bookkeeping, often causing immediate crashes or delayed heap corruption.

### Mistake 3: Double Free Without Intermediate Reallocation
```c
void *p = malloc(200);
free(p);
free(p);   // second free
```
**Why it’s wrong:** The first `free` inserts the chunk into a free list and may clear its size field. The second free sees the chunk as “already free” and attempts to unlink it again, corrupting the free list’s forward/backward pointers. Modern glibc detects this and aborts with `malloc(): memory corruption (fast)` but older versions could silently corrupt the heap leading to exploitable vulnerabilities.

### Mistake 4: Ignoring the Return Value of `brk`/`sbrk` on Failure
```c
void *old = sbrk(0);
if (sbrk(1024) == (void *)-1) {
    /* handle ENOMEM */
}
```
**Why it’s wrong:** On systems with strict overcommit (`/proc/sys/vm/overcommit_memory = 2`), `sbrk` can fail even though virtual address space is available, returning `(void *)-1` and setting `errno` to `ENOMEM`. Continuing to use the new break leads to writes into unmapped pages → SIGSEGV.

### Mistake 5: Assuming a Garbage Collector Runs Immediately After Reference Loss
```python
def f():
    x = [0]*1000000   # large list
    # x goes out of scope here
# expect immediate memory return
```
**Why it’s wrong:** Most tracing collectors run only when allocation triggers a threshold or during a safepoint. Memory may stay occupied until the next GC cycle, causing apparent “memory leaks” in long‑running loops. Developers must either call `gc.collect()` explicitly (Python) or tune GC thresholds.

## Exercises
### Easy – First‑Fit Allocator with Boundary Tags
Implement `my_malloc`/`my_free` using an implicit free list. Provide functions:
```c
void *my_malloc(size_t size);
void   my_free(void *ptr);
```
Include header/footer coalescing, splitting when the remainder ≥ `MINSIZE` (2*size_t). Test with a simple harness that allocates/frees random sizes and checks for overlaps using a bitmap.

### Medium – Generational Mark‑Sweep GC for a Toy Language
Design a language with only integer fields and object references. Implement:
- Object layout: `[mark:1][size:30][payload...]`.
- Nursery (copying) and tenured (mark‑sweep) spaces.
- Write barrier that
