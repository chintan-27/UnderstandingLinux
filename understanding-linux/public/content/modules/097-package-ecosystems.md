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

## Core Concepts
### Package Managers
A package manager is a program that implements **dependency‑aware installation** by treating the set of available packages as a directed graph **G = (V, E)** where each vertex *v* ∈ V is a package and each directed edge *(v → w)* ∈ E means “*v* depends on *w*”. Installing a target package *t* requires finding a **superset S ⊆ V** such that:
- *t* ∈ S,
- ∀ (v → w) ∈ E, if v ∈ S then w ∈ S (closure under dependencies),
- S is minimal w.r.t. inclusion (no superfluous packages).

The manager solves this closure problem via a topological sort of the sub‑graph reachable from *t*. The algorithm runs in **O(|V| + |E|)** time because each vertex and edge is examined at most once.  
Why this matters: without explicit dependency resolution, users would manually track libraries, leading to “dependency hell” where missing or incompatible shared objects cause runtime failures.

### Repositories
A repository is a **static HTTP/HTTPS/FTP tree** that mirrors the package index and the package payloads. Its layout follows the Debian `Packages.gz` or RPM `repodata/` convention:

```
repo/
  dists/
    stable/
      main/
        binary-amd64/
          Packages.gz          # index file
          Release              # signed metadata
  pool/
    main/
      e/
        emacs/
          emacs_28.2+1-3_amd64.deb
```

The index file contains, per package, fields such as `Package`, `Version`, `Architecture`, `Depends`, `SHA256`, and `Description`. The `Release` file is signed with the repository’s GPG key; verifying this signature ensures the index has not been tampered with (integrity check).  

### Dependencies
Dependencies are declared in the control metadata:
- **Depends**: hard requirements; installation aborts if unsatisfied.
- **Recommends**: optional but strongly suggested; installed by default unless `--no-install-recommends` is used.
- **Suggests**: weak hints; never pulled automatically.
- **Pre-Depends**: must be fully configured *before* the dependent package’s `preinst` script runs.

Formally, a package *p* is installable iff the Boolean formula  

\[
\bigwedge_{d \in \text{Depends}(p)} \text{Installed}(d) \;\land\;
\bigwedge_{r \in \text{Recommends}(p)} (\text{Installed}(r) \lor \text{UserOptOut})
\]

evaluates to true. This makes dependency resolution a **Horn‑SAT** problem, solvable in linear time.

### Source vs Binary Packaging
Source packages ship the upstream tarball plus a **debian/** (or `rpm/`) directory containing:
- `control` / `spec` file (metadata),
- `rules` / `%build` section (build instructions),
- `preinst`, `postinst`, `prerm`, `postrm` scripts,
- `changelog`.

Binary packages are the result of running the build process in a clean chroot (or mock environment) and archiving the installed files into a `.deb` or `.rpm` payload.  
Binary distribution eliminates the need for a toolchain on the target, reduces installation time from *T_compile* ≈ *O(N·log N)* (where *N* is lines of code) to *T_extract* ≈ *O(size/bandwidth)*, and provides reproducibility via deterministic builds (e.g., `SOURCE_DATE_EPOCH`).

## How It Works
### 1. Package Creation
A maintainer executes:
```bash
# Debian example
dh_make -s -e maintainer@example.com -p hello_1.0
cd hello-1.0
# edit debian/control, debian/rules, etc.
dpkg-buildpackage -us -uc   # builds ..hello_1.0_amd64.deb
```
The `dpkg-buildpackage` script:
1. Invokes `debian/rules clean` → removes previous build artefacts.
2. Runs `debian/rules build` → invokes `make` (or other build system) inside `debian/tmp`.
3. Calls `fakeroot debian/rules binary` → stages files into `debian/hello/` then packs them with `ar` and `tar`, compressing with `xz` (default compression level 6).
4. Generates a `.changes` file and signs it with the maintainer’s GPG key (`gpg --clearsign`).

### 2. Repository Update
The newly built `.deb` is copied into the pool hierarchy and the index is regenerated:
```bash
 reprepro includedist stable ../hello_1.0_amd64.changes
```
`reprepro` updates `dists/stable/main/binary-amd64/Packages.gz` by:
- Parsing the `.changes` file to extract package fields.
- Adding an entry:
  ```
  Package: hello
  Version: 1.0-1
  Architecture: amd64
  Maintainer: maintainer@example.com
  Installed-Size: 42
  Depends: libc6 (>= 2.14)
  Filename: pool/main/h/hello/hello_1.0_amd64.deb
  SHA256: 3a5f… (computed over the .deb)
  Description: …
  ```
- Re‑compressing the file with `gzip -9`.
- Optionally generating a new `Release` file and signing it:
  ```bash
  gpg --absorb-release -o Release.gpg Release
  ```

### 3. Package Installation (User Side)
When a user runs `apt-get install hello`, APT performs:
1. **Index load** – reads `/var/lib/apt/lists/*_Packages` into memory.
2. **Dependency resolution** – constructs the reachable sub‑graph from `hello` and solves the closure problem (see Core Concepts).  
   Example: if `hello` depends on `libc6 (≥2.14)` and `libncursesw6`, and those depend on `base-files`, the closure yields `{hello, libc6, libncursesw6, base-files}`.
3. **Fetch** – downloads each `.deb` from the mirror URLs listed in the `Release` file, verifying the SHA256 hash against the index.
4. **Authenticity check** – validates the GPG signature of the `Release` file (`gpg --verify Release.gpg Release`). If the key is trusted, the index is trusted.
5. **Installation** – invokes `dpkg -i` for each package in topological order:
   - Runs `preinst` script (if any).
   - Unpacks files into `/` while recording divergences in `/var/lib/dpkg/status`.
   - Executes `postinst` script (often runs `ldconfig`, updates alternatives, etc.).
6. **Triggers** – processes package‑triggers (e.g., `man-db`, `glibc`) to rebuild caches without invoking each maintainer script individually.

### 4. Package Verification
Beyond SHA256, Debian supports **signed `.deb` files** via `dpkg-sig`:
```bash
dpkg-sig --sign builder hello_1.0_amd64.deb
```
During install, `dpkg` checks the embedded signature against the keyring in `/etc/apt/trusted.gpg.d/`. This mitigates attacks where an attacker compromises a mirror but cannot forge the signature.

## Worked Examples
### Example 1: Installing `emacs` on Debian
Assume a fresh Debian 12 (bookworm) system with default `/etc/apt/sources.list`.

```bash
# 1. Update index (downloads ~4.5 MB)
sudo apt-get update
# Output snippet:
# Hit:1 http://deb.debian.org/bookworm InRelease
# Get:2 http://deb.debian.org/bookworm-updates InRelease [11.2 kB]
# Fetched 4,512 kB in 2s (2,256 kB/s)

# 2. Examine dependencies before install
apt-cache show emacs | grep -E '^Depends:|^Recommends:'
# Depends: emacs-bin (= 1:28.2+1-3), emacs-common (= 1:28.2+1-3), …
# Recommends: emacs-goodies-el, …

# 3. Install (downloads ~45 MB, installs ~150 MB)
sudo apt-get install emacs
# APT resolves: emacs → emacs-bin, emacs-common, libgif7, libgtk-3-0, …
# Download progress shows each .deb size and SHA256 verification.
# Post‑install triggers: processing triggers for man-db (2.9.3-2), …
```
**Numbers**:  
- Index size: 4.5 MB (≈ 1500 packages).  
- `emacs` meta‑package pulls in 12 binary packages; total downloaded payload ≈ 45 MB; installed size ≈ 150 MB (including locale data, icons, etc.).  
- Time to download on a 20 Mbps link: ~ 18 s; installation + trigger execution ~ 12 s.

### Example 2: Building a `.deb` for a Simple C Program
Source (`hello.c`):
```c
/* hello.c */
#include <stdio.h>
int main(void) {
    puts("Hello, Linux package world!");
    return 0;
}
```

**Step‑by‑step**:

1. Create packaging skeleton:
   ```bash
   mkdir -p hello-1.0/debian
   cd hello-1.0
   dh_make -s -e dev@example.com -p hello_1.0
   # Choose “single binary” when prompted.
   ```
2. Edit `debian/control`:
   ```
   Source: hello
   Section: utils
   Priority: optional
   Maintainer: dev@example.com
   Build-Depends: debhelper (>= 13), gcc
   Standards-Version: 4.6.2
   Homepage: https://example.com/hello

   Package: hello
   Architecture: any
   Depends: ${shlibs:Depends}, ${misc:Depends}
   Description: Simple greeting program
    Prints a friendly message.
   ```
3. Edit `debian/rules` (use debhelper defaults):
   ```make
   #!/usr/bin/make -f
   %:
           dh $@
   ```
4. Build:
   ```bash
   dpkg-buildpackage -us -uc
   # Output includes:
   #   dpkg-deb: building package 'hello' in '../hello_1.0_amd64.deb'.
   ```
5. Verify the package:
   ```bash
   dpkg-deb -I ../hello_1.0_amd64.deb
   # Shows Package, Version, Installed-Size, etc.
   dpkg -c ../hello_1.0_amd64.deb
   # Lists: ./usr/bin/hello
   ```
6. Install locally:
   ```bash
   sudo dpkg -i ../hello_1.0_amd64.deb
   # dpkg triggers ldconfig if needed.
   hello   # → prints the message
   ```

### Example 3: Creating an RPM Package (Fedora)
Source: same `hello.c`.

1. Prepare spec file (`hello.spec`):
   ```
   Name:           hello
   Version:        1.0
   Release:        1%{dist}
   Summary:        Simple greeting program
   License:        MIT
   URL:            https://example.com/hello
   Source0:        %{name}-%{version}.tar.gz

   BuildRequires:  gcc
   %description
   A tiny program that prints a greeting.

   %prep
   %setup -q

   %build
   %{__make} %{?_smp_mflags} CFLAGS="%{optflags}" LDFLAGS="%{__ldldflags}"

   %install
   rm -rf %{buildroot}
   make install DESTDIR=%{buildroot} PREFIX=/usr

   %files
   %license LICENSE
   %{_bindir}/hello

   %changelog
   * Mon Nov 03 2025 dev@example.com - 1.0-1
   - Initial packaging
   ```
2. Build:
   ```bash
   rpmbuild -ba hello.spec
   # Produces RPMS/x86_64/hello-1.0-1.fc42.x86_64.rpm
   ```
3. Install and test:
   ```bash
   sudo dnf install RPMS/x86_64/hello-1.0-1.fc42.x86_64.rpm
   hello   # → greeting
   ```

## Common Mistakes
| Mistake | What’s Wrong | Why It Fails |
|---------|--------------|--------------|
| **Running `apt-get upgrade` without `apt-get update`** | The package index is stale; `upgrade` may miss newer versions or attempt to install versions that no longer exist in the repository. | APT relies on the index to know available versions; outdated index leads to incorrect dependency resolution, potentially leaving the system partially upgraded. |
| **Using `--force-overwrite` or `--force-all` with `dpkg`** | Forces installation even when a file would clash with another package’s file. | Overwrites can break the other package’s expected files, causing missing binraries or corrupt configurations; the package database (`/var/lib/dpkg/status`) becomes inconsistent, and later `apt-get install -f` may be required. |
| **Installing third‑party `.deb` without checking its `Depends`** | The package may require a library version not present, leading to unsatisfied dependencies. | `dpkg -i` will succeed but mark the package as “unconfigured”; subsequent `apt-get install -f` may pull in unwanted dependencies or fail, leaving the system in a broken state. |
| **Neglecting to verify repository signatures** | An attacker could serve a modified `Packages.gz` with malicious dependencies. | Without GPG verification, APT cannot detect index tampering; malicious packages could be installed with elevated privileges via `postinst` scripts. |
| **Assuming `apt-get autoremove` is safe after a manual `dpkg -i`** | Packages installed via `dpkg` are not tracked as “automatically installed” by APT, so `autoremove` may remove dependencies that were actually needed. | The autoremove logic only considers packages installed via APT; manual installs bypass this tracking, leading to premature removal of shared libraries. |

## Exercises
### Easy
1. **Update and install**  
   ```bash
   sudo apt-get update
   sudo apt-get install -y htop
   ```
   Verify the installed version with `htop --version` and list its files: `dpkg -L htop`.

2. **Check dependencies**  
   Run `apt-cache depends emacs` and `apt-cache rdepends emacs | head -5`. Explain why `emacs-common` appears in both lists.

### Medium
3. **Create a local `.deb` repository**  
   ```bash
   mkdir -p ~/localrepo/{dists,pool}
   cp hello_1.0_amd64.deb ~/localrepo/pool/main/h/hello/
   cd ~/localrepo
   reprepro includedist stable ../hello_1.0_amd64.changes
   echo "deb [trusted=yes] file://$HOME/localrepo stable main" | sudo tee /etc/apt/sources.list.d/localrepo.list
   sudo apt-get update
   sudo apt-get install hello
   ```
   Confirm that `apt-cache policy hello` shows the local repository as the source.

4. **Write a post‑install script**  
   Modify the `hello` Debian package to include a `debian/hello.postinst` that creates a symlink `/usr/local/bin/hello-greeting → /usr/bin/hello`. Rebuild the package and test that the symlink appears after installation.

### Hard
5. **Implement a dependency‑resolver helper**  
   Write a Bash script that, given a package name, prints the minimal closure of its dependencies using only `apt-cache show` and standard Unix tools:
   ```bash
   #!/usr/bin/env bash
   pkg=$1
   declared=()
   to_check=("$pkg")
   while [[ ${#to_check[@]} -gt 0 ]]; do
       cur=${to_check.pop()}
       if [[ " ${declared[*]} " =~ " ${cur} " ]]; then continue; fi
       declared+=("$cur")
       deps=$(apt-cache show "$cur" | awk -F: '/^Depends:/ {gsub(/[,()]/," ",$2); print $2}')
       for d in $deps; do
           [[ -z $d ]] && continue
           to_check+=("$d")
       done
   done
   printf '%s\n' "${declared[@]}"
   ```
   Test it on `gnome-shell` and compare the output length with `apt-get install -s gnome-shell | grep ^Inst`.

6. **Create a signed repository**  
   Generate a GPG key (`gpg --full-generate-key`), then use `apt-ftparchive` to produce a signed `Release` file:
   ```bash
   gpg --armor --export <keyid> > ~/localrepo/pubkey.gpg
   apt-ftparchive release ./dists/stable/ > ./dists/stable/Release
   gpg --absorb-release -o ./dists/stable/Release.gpg ./dists/stable/Release
   ```
   Add the public key to the APT keyring (`sudo apt-key add ~/localrepo/pubkey.gq`) and repeat the installation from exercise 3, noting that `apt-get update` now reports “Get:… InRelease” with a “Signed by” line.

## Linux Connection
Package managers sit atop several kernel‑userspace subsystems:

- **dpkg / rpm database** – stored in Berkeley DB format (`/var/lib/dpkg/` and `/var/lib/rpm/`). Each file installation updates the `status` file, which records `State: installed`, `Config-files`, and `Triggers-Awaiting`.  
  ```bash
  sudo stat /var/lib/dpkg/status   # shows size ~ few MB after a desktop install
  sudo db_stat -d /var/lib/rpm/Packages   # shows number of records (~ 50k on Fedora)
  ```

- **APT’s cache** – keeps downloaded `.deb`s in `/var/cache/apt/archives/`; the `apt-get clean` command removes them, freeing space (often several hundred MB after a dist‑upgrade).  
  ```bash
  du -sh /var/cache/apt/archives/
  ```

- **Trigger mechanism** – implemented via `/var/lib/dpkg/triggers/`; when a package declares a trigger (e.g., `libc6` triggers `ldconfig`), dpkg records interest and later runs `/usr/share/initramfs-tools/hooks` or `/usr/lib/packagekit` helpers asynchronously, avoiding serial execution of dozens of `postinst` scripts.

- **File‑conflict detection** – before unpacking, `dpkg` checks each target pathname against the database using a hash table (`/var/lib/dpkg/info/*.list`). If a collision is found, the install is aborted unless `--force-overwrite` is used.  
  ```bash
  grep -E '^/usr/bin/hello$' /var/lib/dpkg/info/hello.list   # shows the file owned by hello
  ```

- **SELinux/AppArmor integration** – package scripts often call `restorecon` or `apparmor_parser` to set security contexts on newly installed binaries; the policy is loaded from `/etc/selinux/targeted/` or `/etc/apparmor.d/`.  
  ```bash
  sudo restorecon -v /usr/bin/hello   # after installing a binary in a confined domain
  ```

- **Systemd integration** – many packages ship `*.service` units in `/usr/lib/systemd/system/`; `deb-systemd-helper` or `systemd-sysctl` enable them during `postinst`.  
  ```bash
  sudo systemctl list-unit-files | grep hello
  ```

These concrete paths and mechanisms show how package management is not a abstract layer but a set of well‑defined interactions with the Linux kernel’s VFS, the init system, and security frameworks.

## Why This Matters
Mastering package management transforms a Linux user from a manual software installer into a **systems engineer** who can guarantee **reproducibility, integrity, and security** across hundreds of machines.  

- **Reliability**: By enforcing dependency closure and transactional installs (dpkg’s `--configure -a`), the system avoids half‑installed states that cause crashes or missing libraries.  
- **Security**: Verified repository signatures and package‑level signatures prevent supply‑chain attacks; the same machinery underlies secure container image distribution (e.g., `apt` inside Docker, `rpm‑ostree`).  
- **Efficiency**: The O(|V| + |E|) resolution algorithm scales to repositories with > 100 k packages, enabling rapid provisioning in CI/CD pipelines and cloud‑init scripts.  
- **Auditability**: Every installed file is traceable to a specific package via `/var/lib/dpkg/info/` or `/var/lib/rpm/`, facilitating compliance checks, license scanning, and forensic analysis.  

When you move to advanced topics—such as building custom live images, creating immutable operating systems with **OSTree**, or managing fleets with **Landscape** or **Spacewalk**—the foundations laid here become the scaffolding. Understanding *why* a package manager resolves a dependency graph, *how* it verifies authenticity, and *where* it records state lets you troubleshoot failures, optimize workflows, and contribute confidently to the Linux ecosystem.
