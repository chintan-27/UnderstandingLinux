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

## Core Concepts
### Dependency Graphs and Build Order
A build system must determine a **valid linearization** of the partial order defined by file dependencies. If we model each source or intermediate file as a node *v* and a directed edge *u → v* when *v* needs *u* (e.g., an object file depends on its header), the graph is a **directed acyclic graph (DAG)**. A topological sort yields an order that respects all edges; any deviation would cause a component to be built before its prerequisite, leading to missing symbols or stale objects.

The complexity of a topological sort is **Θ(|V| + |E|)**. In large projects |V| can be tens of thousands (source files, headers, generated files) and |E| grows with each `#include`. Incremental builds reuse the previous topological order and only re‑sort the affected sub‑graph, which is why tools like `make` cache timestamps: if a node’s timestamp is newer than all its predecessors, the node and its descendants can be skipped.

### Reproducible Builds: Bit‑Exact Output
Two builds are **bit‑identical** when every byte of the produced artifact matches. Sources of nondeterminism include:

* Timestamps embedded in object files (`.o`, `.a`) – eliminated with `gcc -Wl,--build-id=none` or `strip --strip-all`.
* `__DATE__` and `__TIME__` macros – replaced by `-D__DATE__=\"\" -D__TIME__=\"\"` or by setting `SOURCE_DATE_EPOCH`.
* Order of symbols in archives – controlled by `ar rcs` (deterministic) vs. older `ar` implementations.
* Randomized layout (ASLR, PIE) – disabled for reproducibility with `-no-pie` or `-fno-pic`.

If we denote the set of all *input* bits as *I* and the build toolchain as a deterministic function *B*, reproducibility means **B(I) = O** for every execution, where *O* is the output bit‑string. Any variation in *I* (e.g., a changed header) must propagate deterministically to *O*.

### Cross‑Compilation Toolchains
Cross‑compiling separates the **build platform** (where the compiler runs) from the **target platform** (where the binary executes). A toolchain is prefixed, e.g., `aarch64-linux-gnu-`. The prefix influences:

* **Compiler driver** – `aarch64-linux-gnu-gcc` invokes the correct backend and searches `/usr/aarch64-linux-gnu/lib` for libraries.
* **Sysroot** – a directory containing target headers and libraries (`/usr/aarch64-linux-gnu/`). The compiler flag `--sysroot=$SYSROOT` tells the driver where to find `stddef.h`, `libc.so`, etc.
* **Binary format** – ELF machine field `e_machine` set to `EM_AARCH64` (0xB7).

If the host is *x86_64* and the target is *armv7l*, the command:

```bash
arm-linux-gnueabihf-gcc --sysroot=/usr/arm-linux-gnueabihf -march=armv7-a -mfpu=vfpv3 -mfloat-abi=hard -O2 -o hello hello.c
```

produces an ELF binary recognizable by `readelf -h hello` as `Machine: ARM`.

---

## How It Works
### Phase 1: Parsing and Dependency Extraction
The build system reads **makefiles** (or equivalent DSLs) and constructs an internal representation:

1. **Tokenization** – split input into words, recognizing `:=`, `+=`, `:`, etc.
2. **Grammar parsing** – produce an AST of rules, variables, and directives.
3. **Secondary expansion** (in GNU Make) – variables referenced in prerequisites are expanded after the initial pass, enabling pattern‑dependent prerequisites.

The result is a set of **rules** of the form:

```
target: prerequisites …
    recipe
```

Each rule contributes edges from each prerequisite to the target in the dependency graph.

### Phase 2: Dependency Resolution (Topological Sort + Pruning)
Given the graph *G = (V, E)*, the scheduler repeatedly:

* Selects a node *v* with **in‑degree zero** (no unmet prerequisites).
* Marks *v* as *ready*.
* Executes its recipe (if the node is out‑of‑date).
* Removes *v* from the graph, decreasing the in‑degree of its outgoing neighbours.

If parallelism is requested (`-j N`), up to *N* ready nodes may be dispatched concurrently, provided they do not share exclusive resources (e.g., the same output file). The scheduler thus implements a **work‑conserving** parallel topological sort.

### Phase 3: Command Execution
Each recipe line is fed to `sh -c` (or directly `execve`) after variable expansion. For example, the rule:

```
%.o: %.c
    $(CC) $(CFLAGS) -c $< -o $@
```

expands `$<` to the prerequisite stem (`foo.c`) and `$@` to the target (`foo.o`). The resulting `execve` call looks like:

```c
execve("/usr/bin/gcc",
       ["gcc","-Wall","-O2","-c","foo.c","-o","foo.o"],
       environ);
```

The compiler then performs its own phases (preprocessing, compilation, assembly), emitting a **.o** file whose contents are a function of the input bytes and the compiler’s deterministic options.

### Phase 4: Incrementality via Timestamp or Content Hashing
*Timestamp‑based* invalidation compares file *mtime*s: if any prerequisite’s mtime > target’s mtime, the target is stale. This is **O(1)** per edge but vulnerable to clock skew or filesystem changes that do not modify content.

*Content‑based* invalidation (used by `ninja`, `tup`, `bazel`) computes a hash (e.g., BLAKE2b) of each file’s contents. The target’s hash is a function of the concatenation of prerequisite hashes and the recipe’s command line:

$$
H_{\text{target}} = \mathcal{H}\bigl(\, \text{cmd} \,\|\, H_{p_1} \,\|\, \dots \,\|\, H_{p_k} \,\bigr)
$$

If any input hash changes, the target hash changes, guaranteeing correct invalidation even when mtimes are preserved (e.g., after a checkout that restores timestamps).

---

## Worked Examples
### Example 1: Building a Multi‑File C Program with Automatic Header Dependencies
Suppose we have:

```
src/
  main.c
  util.c
  util.h
```

`main.c` includes `util.h`. We want a Makefile that rebuilds any `.o` when its corresponding `.c` **or any included header** changes, without manually listing headers.

```makefile
# Variables
CC      := gcc
CFLAGS  := -Wall -O2 -MMD -MP   # -MMD generates .d files; -MP adds phony targets
SRC     := $(wildcard src/*.c)
OBJ     := $(patsubst src/%.c,build/%.o,$(SRC))
DEP     := $(OBJ:.o=.d)        # one .d per .o
TARGET  := bin/app

# Phony targets
.PHONY: all clean

all: $(TARGET)

# Link step
$(TARGET): $(OBJ) | bin
    $(CC) $(CFLAGS) -o $@ $^

# Compile step – pattern rule with automatic dependency inclusion
build/%.o: src/%.c
    @mkdir -p $(dir $@)
    $(CC) $(CFLAGS) -c $< -o $@

# Include generated dependency files
-include $(DEP)

# Ensure output directories exist
bin:
    mkdir -p bin

clean:
    rm -rf build bin
```

**Step‑by‑step reasoning**

1. `-MMD -MP` tells GCC to, while compiling `src/util.c`, write `build/util.d` containing:
   ```
   build/util.o: src/util.c src/util.h
   ```
   The `-MP` adds a phony target for each header to avoid errors if the header is removed.

2. After the first compile, `make` reads all `.d` files via `-include`, adding edges from each header to its object file.

3. If `util.h` changes, its mtime updates → the `.d` file is stale → on next `make`, the header’s phony target triggers recompilation of both `util.o` and `main.o` (because `main.o`’s `.d` also lists `util.h`).

4. The order‑only prerequisite `| bin` ensures the output directory exists without causing rebuilds when the directory timestamp changes.

**Timing illustration** (on a typical laptop, `gcc -O2`):

| Action               | Time (ms) |
|----------------------|-----------|
| Preprocess `util.c`  | 0.45      |
| Compile to asm       | 1.10      |
| Assemble to `util.o` | 0.30      |
| Generate `util.d`    | 0.05      |
| **Total per file**   | **~1.9 ms** |
| Link 2 objects → app | 0.8 ms    |

With `-j2` the two compilations overlap, giving ≈ 2.7 ms total vs. 3.8 ms serial.

### Example 2: Building a Static Library with Versioned Symbols
We create `libmath.a` that exports `add` and `multiply` with a version script to control ABI.

`math.h`:
```c
#ifndef MATH_H
#define MATH_H
int add(int a, int b);
int multiply(int a, int b);
#endif
```

`math.c`:
```c
#include "math.h"
int add(int a, int b) { return a + b; }
int multiply(int a, int b) { return a * b; }
```

`math.ver`:
```ld
{
    global:
        add;
        multiply;
    local:
        *;
};
```

Makefile:

```makefile
CC      := gcc
CFLAGS  := -Wall -O2 -fPIC
SRC     := math.c
OBJ     := $(SRC:.c=.o)
LIB     := libmath.a
VERS    := math.ver

.PHONY: all clean

all: $(LIB)

$(LIB): $(OBJ) $(VERS)
    ar rcs $@ $(OBJ)
    # Embed version info into the archive (optional)
    objcopy --add-section .gnu.version=$(VERS) $@ $@

%.o: %.c
    $(CC) $(CFLAGS) -c $< -o $@

clean:
    rm -f $(OBJ) $(LIB)
```

**Why the version script matters**  
When linking an executable against `libmath.a`, the linker copies the version script into the final binary’s `.gnu.version` section, allowing runtime symbol resolution to verify that the expected version of `add`/`multiply` is present. If a future version of the library changes the signature of `multiply` but keeps the same name, the version script can assign a new version node, preventing silent ABI breaks.

**Size calculation**  
Assume each object file contains:

* `.text`: 32 bytes (add) + 32 bytes (multiply) = 64 B
* `.data`: 0 B
* `.debug_info` (if `-g`): ~200 B

Thus `math.o` ≈ 264 B (debug stripped → 64 B). The archive header per member is 60 B, so `libmath.a` ≈ 60 + 64 ≈ 124 B (stripped).  

Linking an executable that uses only `add` will pull in the whole object because archives are resolved at symbol granularity; the final `.text` contribution remains 64 B.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Breaks the Build |
|---------|--------------|------------------------|
| **Missing `.PHONY` for `clean`** | Treating `clean` as a file target. | If a file named `clean` appears, `make clean` will consider it up‑to‑date and do nothing, leaving stale artifacts. |
| **Using wildcard (`*`) in prerequisites** | e.g., `obj: *.c` expands once at read‑time. | New source files added after the Makefile is read are *not* discovered, causing silent omission from the build. |
| **Not declaring `-MMD`/`-MP`** | Manual header lists. | Header changes won’t trigger recompilation, leading to stale object files and link‑time undefined reference errors. |
| **Running parallel jobs without output‑directory guards** | Multiple `make -j` instances trying to `mkdir -p` the same directory concurrently. | Race condition: one process may see the directory missing, another may try to create it while the first is still creating it, resulting in “File exists” errors. |
| **Hard‑coding compiler paths** | `CC=/usr/local/bin/gcc`. | Breaks when the toolchain is relocated or when cross‑compiling; the build becomes non‑portable. |
| **Ignoring `LDFLAGS` in archive creation** | Using `ar rcs lib.a obj.o` without `-static` when linking against shared libs. | The resulting archive may omit needed `-l` flags, causing link failures when consumers try to link against it. |
| **Using `-O0` with `-g` for release builds** | Debug info retained but no optimization. | Binary size bloats unnecessarily; performance suffers, and the build may not reflect the intended release configuration. |
| **Not setting `SOURCE_DATE_EPOCH` for reproducible builds** | Timestamps embedded in `.o` files vary each build. | Binary checksums change even though source is identical, defeating verification and complicating signing/packaging pipelines. |

---

## Exercises
### Easy
1. **Basic Makefile** – Write a Makefile that compiles `hello.c` (as in the draft) into `hello` using `CFLAGS=-Wall -O2`. Add a `clean` target and declare it `.PHONY`.  
2. **Library from a single source** – Create a static library `libhello.a` from `hello.c` that provides a function `void greet(void)`. Write a test program `test.c` that calls `greet()` and links against the library. Show the exact commands and the resulting file sizes (`size hello`, `size libhello.a`).

### Medium
3. **Automatic header dependencies** – Extend the Makefile from Exercise 1 to generate `.d` files with `-MMD -MP` and include them. Verify that touching a header triggers recompilation of all dependent `.o` files.  
4. **Parallel build measurement** – Create a project with 4 independent source files (`a.c … d.c`), each taking ~10 ms to compile (you can insert a dummy loop). Build with `make -j1` and `make -j4`, reporting the real time via `time`. Compute the observed speedup and compare to the ideal speedup given by Amdahl’s law assuming 90 % parallelizable work.

### Hard
5. **Cross‑compilation toolchain** – Install `gcc-aarch64-linux-gnu` (or similar). Write a Makefile that builds the same `hello` program for `aarch64` using the prefix `aarch64-linux-gnu-`. Use `readelf -h` to confirm the ELF class and machine. Run the binary under `qemu-aarch64` to verify it executes.  
6. **Reproducible static library** – Produce `libmath.a` (as in Worked Example 2) with `SOURCE_DATE_EPOCH=1234567890` and `CPPFLAGS=-D__DATE__=\"\" -D__TIME__=\"\"`. Generate two builds in separate directories, compute `sha256sum` of the archives, and show they are identical. Then modify a source file, rebuild, and confirm the hash changes.  
7. **Kernel module with Kbuild** – Write a simple “hello‑world” Linux kernel module (`hello.c`) that prints via `pr_info`. Provide a Makefile that uses the kernel’s Kbuild system:

   ```makefile
   obj-m += hello.o
   all:
       make -C /lib/modules/$(shell uname -r)/build M=$(pwd) modules
   clean:
       make -C /lib/modules/$(shell uname -r)/build M=$(pwd) clean
   ```

   Build the module (`make`), insert it (`sudo insmod hello.ko`), view the kernel message (`dmesg | tail`), and remove it (`sudo rmmod hello`). Explain why the `-C` flag is necessary and how Kbuild locates the kernel source.

---

## Linux Connection
### The Kernel’s Build System: Kbuild
The Linux kernel does **not** use a generic Makefile hierarchy; it employs **Kbuild**, a layered system consisting of:

* **Kconfig** – defines configuration options (`CONFIG_*` symbols) stored in `.config`.
* **Makefiles** in each directory that are parsed by the top‑level `Makefile`.
* **Scripts** (`scripts/Makefile.build`, `scripts/Makefile.lib`, etc.) that provide reusable rules and variable expansions.
* **The `make` command line** that invokes the top‑level Makefile, which descends into subdirectories, passing down variables like `CC`, `LDFLAGS`, and `SUBDIRS`.

Key concepts:

| Concept | File / Variable | Purpose |
|---------|----------------|---------|
| `obj-y` / `obj-m` | Directory Makefile | Lists built‑in (`y`) or modular (`m`) objects. |
| `extra-y` | Directory Makefile | Additional files to compile (e.g., linker scripts). |
| `ccflags-y` | Directory Makefile | Flags appended to `CC` for objects in that directory. |
| `LDFLAGS_final` | Top‑level | Flags for the final `vmlinux` link. |
| `make -jN` | Command line | Parallel build across independent sub‑directories. |

#### Building a Kernel Module (real example)
```bash
# 1. Create source
cat > hello.c <<'EOF'
#include <linux/module.h>
#include <linux/kernel.h>

static int __init hello_init(void)
{
    pr_info("Hello, Linux kernel!\n");
    return 0;
}

static void __exit hello_exit(void)
{
    pr_info("Goodbye, Linux kernel!\n");
}

module_init(hello_init);
module_exit(hello_exit);
MODULE_LICENSE("GPL");
MODULE_AUTHOR("Student");
EOF

# 2. Makefile that delegates to Kbuild
cat > Makefile <<'EOF'
obj-m += hello.o
all:
    make -C /lib/modules/$(shell uname -r)/build M=$(pwd) modules
clean:
    make -C /lib/modules/$(shell uname -r)/build M=$(pwd) clean
EOF

# 3. Build
make -j$(nproc)          # uses all available CPUs
# 4. Insert
sudo insmod hello.ko
# 5. Verify
dmesg | tail -n 2
# 6. Remove
sudo rmmod hello
```

**Why the `-C` flag matters**  
The top‑level kernel Makefile expects to be run *inside* the kernel source tree. By invoking `make -C /lib/modules/$(shell uname -r)/build`, we change the working directory to the kernel’s build directory (usually a symlink to `/usr/src/linux-headers-$(uname -r)/`). The `M=$(pwd)` variable tells Kbuild to treat the current directory as an external module source, allowing it to apply its standard rules (`obj-m`, `ccflags-y`, etc.) while keeping the kernel’s own configuration intact.

#### Cross‑Compiling the Kernel
```bash
# Install cross toolchain for ARM64
sudo apt-get install gcc-aarch64-linux-gnu

# Fetch kernel source (example version)
wget https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.6.tar.xz
tar xf linux-6.6.tar.xz
cd linux-6.6

# Configure for ARM64 (defconfig)
make ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- defconfig

# Build with 8 parallel jobs
make -j8 ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu-

# Result: arch/arm64/boot/Image (kernel) and arch/arm64/boot/dts/*.dtb
```

**Explanation**  
* `ARCH=arm64` sets the kernel’s internal architecture macros.  
* `CROSS_COMPILE=aarch64-linux-gnu-` prefixes every tool invocation (`gcc`, `ld`, `as`, etc.).  
* The build output lands under `arch/arm64/`, preserving the source tree’s separation between architecture‑specific and generic code.

### Reproducible Kernel Builds
The kernel supports reproducible builds via:

```bash
make -j$(nproc) \
    ARCH=arm64 \
    CROSS_COMPILE=aarch64-linux-gnu- \
    KBUILD_BUILD_TIMESTAMP="" \
    KBUILD_BUILD_USER="" \
    KBUILD_BUILD_HOST="" \
    HOSTCC=gcc HOSTCXX=g++ \
    LC_ALL=C
```

Setting `KBUILD_BUILD_TIMESTAMP=` removes the compile‑time stamp from `utsname.h`, ensuring that `uname -r` does not vary between builds. Clearing `KBUILD_BUILD_USER` and `HOST` eliminates user/host strings embedded in the ELF note section. The result is a **bit‑identical** `Image` given the same `.config` and source tree.

---

## Why This Matters
Understanding the **mechanisms** behind build systems transforms a developer from a user of `make` into a designer of reliable, secure, and efficient software pipelines.

* **Correctness** – By grasping dependency graphs and topological ordering, you can avoid subtle bugs where a change in a header fails to trigger recompilation, which otherwise leads to link‑time mismatches or runtime crashes.
* **Performance** – Knowledge of parallel scheduling, Amdahl’s law, and incremental hashing lets you tune `-j` values, structure directories to maximize independent sub‑tasks, and pick the right tool (Make vs. Ninja vs. Bazel) for a project’s scale.
* **Security & Integrity** – Reproducible builds guarantee that the binary you ship is exactly the one you verified. This foundation underpins supply‑chain security practices such as signed artifacts, SBOMs, and deterministic Docker images.
* **Portability** – Mastery of cross‑compilation toolchains, sysroots, and architecture‑specific flags enables you to target everything from embedded MCUs to cloud‑native containers without rewriting your build logic.
* **Kernel‑level insight** – The Linux kernel’s Kbuild showcases how a large, heterogeneous project separates configuration, architecture, and modularity. Applying those patterns (e.g., `obj-y`, `ccflags-y`, external module builds) scales your own projects to hundreds of source files with clear boundaries.
* **Practical payoff** – The exercises move you from writing a trivial Makefile to constructing a reproducible cross‑compiled kernel module, a capability directly applicable to device drivers, system utilities, and performance‑critical services.

In short, a deep comprehension of build systems equips you to **engineer** the build process itself—turning a mundane, error‑prone step into a **strategic asset** that accelerates development, ensures correctness, and fortifies the software you deliver.
