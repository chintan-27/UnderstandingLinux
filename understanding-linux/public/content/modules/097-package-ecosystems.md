---
id: 97
title: "Package ecosystems"
supermoduleId: 8
estimatedMinutes: 45
resources:
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
  - type: book
    title: "The Linux Command Line (Shotts)"
---

## Why This Matters

When the dynamic linker loads a binary, it walks the binary's `DT_NEEDED` entries and attempts to map each required soname to a file on the filesystem. If the file is absent, the version symbol is wrong, or the ABI has changed underneath, the process dies before `main()` is ever called. Package managers exist to prevent this class of failure across an entire system simultaneously — they model the installed system as a constraint satisfaction problem and refuse to apply changes that would leave it inconsistent. Without that model, every installation is a manual audit of `ldd` output and symbol tables, and "dependency hell" is not a metaphor but a literal SAT problem you are solving by hand.

## Core Concepts

### Packages

A package is an archive plus metadata. The archive contains the files to be placed on the filesystem. The metadata records the package name, version, architecture, and dependency declarations. The metadata is what distinguishes a package from a tarball — it gives the package manager enough information to reason about system-wide consistency without reading the binaries themselves.

### Dependencies and the Resolution Problem

A dependency declaration constrains which version of another package must be present. These constraints form a directed acyclic graph (DAG); the transitive closure of a package's dependency DAG is the full set of packages that must be present for it to run.

Finding a consistent version assignment across that graph is NP-complete in the general case. If there are $n$ packages each available in $k$ versions, the search space is:

$$k^n$$

In practice, real solvers prune this space aggressively using unit propagation and conflict-driven clause learning — Nix's resolver and newer versions of `apt` use SAT-based approaches for this reason. Older greedy resolvers (early `apt`) could produce locally consistent but globally suboptimal solutions, requiring manual intervention.

Version constraints are intersection problems. If package $A$ requires $v_B \in [2.0, 3.0)$ and package $C$ requires $v_B \in [2.5, 4.0)$, the feasible set for $B$ is:

$$[2.0, 3.0) \cap [2.5, 4.0) = [2.5, 3.0)$$

If that intersection is empty, the two packages cannot be co-installed. The package manager must report this as a conflict, not silently pick a version that satisfies only one side.

### Repositories and Index Signing

A repository is a server hosting packages and a signed index describing them. The index is fetched first; all dependency resolution happens against the local copy of the index, not by querying the server per-package. This is why `apt update` must precede `apt install` after a repository change — without it, the local index is stale and the resolver is working with outdated metadata.

The index is signed with a detached GPG signature. On Debian systems, the chain is:

1. The distribution ships a keyring in `/usr/share/keyrings/`.
2. Each repository's `.list` entry (or `.sources` entry) references a key via `signed-by`.
3. `apt` verifies the `InRelease` file signature against that key before trusting any package metadata from that repository.

If the signature check fails, `apt` refuses to use the index — not because it is being cautious, but because an unsigned index is indistinguishable from a MITM-injected one.

### Binary vs. Source Packaging

Binary packages distribute pre-compiled ELF objects. The binaries are built against a specific glibc version and a specific set of compile-time flags. Installation is fast — `dpkg` unpacks the archive and runs hooks — but the binary is immutable: you cannot change compile flags, enable disabled features, or optimize for your CPU without rebuilding.

Source packages distribute the original source plus distribution-specific build instructions. The package manager compiles locally, which means the resulting binary is ABI-consistent with your installed libraries by construction, and you can patch the source or alter build flags before building. Gentoo's Portage and FreeBSD's ports are source-based. Debian ships `.dsc` + `.orig.tar.xz` + `.debian.tar.xz` trios alongside its binary packages for this purpose.

The concrete tradeoff: installing a pre-built `nginx` binary takes under a second. Building it from a source package on a modest machine takes 30–90 seconds and produces a binary that links only the modules you enable.

### Package Manager vs. Package Format

These are separate layers:

| Layer | Debian | Red Hat |
|---|---|---|
| Format | `.deb` (`ar` archive) | `.rpm` (RPM archive) |
| Low-level tool | `dpkg` | `rpm` |
| High-level resolver | `apt` | `dnf` |

`dpkg` installs a single `.deb` unconditionally — it does not resolve dependencies, it does not fetch anything. `apt` constructs a full install plan by running the SAT resolver against the repository index, then calls `dpkg` to execute that plan. When `dpkg` reports a broken state and `apt` refuses to proceed, the fix is often to call `dpkg` directly to force a specific operation, then let `apt` reconcile — because `apt` refuses to act on a broken database, but `dpkg` will.

## How It Works

### What a `.deb` Contains

A `.deb` is an `ar(1)` archive, not a tarball. You can inspect it directly:

```bash
ar t ./libssl3_3.0.11-1_amd64.deb
# debian-binary
# control.tar.xz
# data.tar.xz
```

The three members:

- `debian-binary`: a text file containing `2.0\n` — the format version. The package manager checks this first.
- `control.tar.xz`: metadata, pre/post-install scripts, md5sums, conffiles list.
- `data.tar.xz`: the actual filesystem tree, rooted so files unpack relative to `/`.

Extract and read the control file without installing:

```bash
ar x ./libssl3_3.0.11-1_amd64.deb control.tar.xz
tar xf control.tar.xz ./control
cat control
```

```
Package: libssl3
Version: 3.0.11-1
Architecture: amd64
Depends: libc6 (>= 2.34)
Description: Secure Sockets Layer toolkit - shared libraries
```

The `Depends` line is what the resolver reads. The binary inside `data.tar.xz` is irrelevant to resolution — the resolver never opens it.

### Shared Libraries, Sonames, and ABI Coupling

ELF binaries record their library dependencies not as filenames but as sonames, embedded in the `DT_SONAME` dynamic section entry. Sonames encode the ABI version:

```bash
objdump -p /usr/bin/ssh | grep NEEDED
#   NEEDED               libssl.so.3
#   NEEDED               libcrypto.so.3
#   NEEDED               libc.so.6
```

The filesystem uses a symlink chain to map soname to real file:

```
libssl.so        ->  libssl.so.3          (used at compile time by -lssl)
libssl.so.3      ->  libssl.so.3.0.11     (soname, used by dynamic linker)
libssl.so.3.0.11                          (actual shared object)
```

Incrementing the soname (`.so.3` → `.so.4`) signals a breaking ABI change. Incrementing only the patch version (`3.0.11` → `3.0.12`) preserves ABI — only the terminal symlink target changes. This is why package managers can upgrade OpenSSL's patch release without relinking any dependent binary: the soname the binary was linked against still resolves.

When glibc adds a new versioned symbol — say, `GLIBC_2.38` — a binary compiled against it encodes that version requirement in its `.gnu.version_r` section. On a system with glibc 2.34, the dynamic linker finds `libc.so.6` but cannot satisfy the version requirement, producing:

```
/lib/x86_64-linux-gnu/libc.so.6: version 'GLIBC_2.38' not found (required by ./myprog)
```

This is not a missing file — `libc.so.6` is present. It is an ABI version mismatch, which is why the error says "not found" for a symbol version, not for a file. This distinction matters when debugging.

### glibc Symbol Versioning in C

You can inspect exactly which versioned symbols a binary requires:

```bash
readelf -V /usr/bin/ssh | grep -A5 "Version needs"
```

And you can query which glibc version introduced a specific symbol:

```bash
objdump -T /lib/x86_64-linux-gnu/libc.so.6 | grep " getaddrinfo"
# 0000... g    DF .text  ... GLIBC_2.2.5 getaddrinfo
```

If you compile code that calls `getaddrinfo`, the minimum glibc version your binary requires is `GLIBC_2.2.5` — which is why old binaries still run on modern glibc: they only require old versioned symbols that remain present.

### The dpkg State Machine

`dpkg` tracks every package through a state machine. The states are stored in `/var/lib/dpkg/status` as plain text:

```bash
grep -A 12 "^Package: libc6$" /var/lib/dpkg/status
```

```
Package: libc6
Status: install ok installed
Priority: required
Architecture: amd64
Version: 2.37-15
Depends: libgcc-s1
Conffiles:
 /etc/ld.so.conf.d/x86_64-linux-gnu.conf 729a7a...
```

The `Status` field is three words: *want* (`install`/`hold`/`deinstall`/`purge`), *flag* (`ok`/`reinstreq`/`hold`/`hold-reinstreq`), and *status* (`installed`/`unpacked`/`half-configured`/`config-files`/`half-installed`/`triggers-awaited`/`triggers-pending`). A package in `half-installed` state means `dpkg` was interrupted mid-
