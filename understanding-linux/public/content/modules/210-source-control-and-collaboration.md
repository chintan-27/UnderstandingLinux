---
id: 210
title: "Source control and collaboration"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Introduction to Git – First Principles
Git is a **content-addressable** version control system. Every object (file blob, directory tree, commit) is identified by the SHA‑1 hash of its contents, prefixed with a type and length:

$$
\text{hash} = \text{SHA-1}\bigl(\text{type}\ \text{len}\ \backslash0\ \text{content}\bigr)
$$

*Why this matters*: Because the hash is a deterministic function of the content, identical objects share the same hash, enabling deduplication and O(1) lookup. The `.git/objects/` directory stores each object as `.git/objects/<first 2 chars of hash>/<remaining 38 chars>`.

A **repository** is simply a directory containing:
* `.git/objects/` – the object database.
* `.git/refs/` – lightweight pointers (branches, tags) that refer to commit objects.
* `.git/HEAD` – a symbolic ref pointing to the current branch.

When you clone a repo you obtain a **complete copy** of this object graph, which is why Git is *distributed*: each clone holds the full history and can operate independently.

### Branching – Why It’s Cheap
A branch is nothing more than a file under `.git/refs/heads/<name>` that contains the SHA‑1 of a commit. Creating a branch therefore involves:

1. Writing a single 41‑byte file (the commit hash).
2. No data duplication; the branch shares all existing commits with its parent.

*Why this matters*: Because branches are cheap, developers can isolate work without costly copies. The underlying DAG (directed acyclic graph) of commits remains unchanged; a new branch merely adds a new pointer to an existing node.

### Patch Workflows – From Diff to Apply
A **patch** is the textual representation of the difference between two tree states. Git’s internal diff algorithm works on the *object* level:

* For each path, if the blob hash differs, generate a unified diff of the blob contents.
* If the blob hash is identical, no output is emitted.

The command `git diff A B` therefore produces a set of changes that, when applied to the tree at commit **A**, yields the tree at commit **B**. Applying a patch with `git apply` replays those textual changes onto the working tree and updates the index accordingly.

*Why this matters*: Patches decouple change review from repository state. A reviewer can examine a patch without needing the exact same commit history, which is essential for distributed workflows (e.g., mailing list submissions).

### Code Review – Mechanism and Rationale
Code review catches logical errors, style violations, and security issues before they become part of the project history. In Git‑centric workflows review is typically performed via:

* **Patch series** sent with `git format-patch` and `git send-email` (or uploaded to a forge like GitHub/GitLab).
* **Reviewer feedback** captured as replies; the author amends the commit (`git commit --amend`) or creates a new fixup commit.
* **Integration** – once approved, the maintainer merges the series (`git merge --ff-only` or `git am`).

*Why this matters*: Review improves *software quality* by leveraging multiple pairs of eyes, reduces the chance of regressions, and provides a documented rationale for each change (the review thread becomes part of the project’s institutional memory).

---

## How It Works
### Step‑by‑Step Workflow with Internal Details
1. **Create a branch**  
   ```bash
   git branch feature/foo          # creates .git/refs/heads/feature/foo
   git checkout feature/foo        # updates .git/HEAD to ref: refs/heads/feature/foo
   ```
   *Internally*: HEAD now points to the same commit as the previous branch; no new objects are created.

2. **Make changes and commit**  
   ```bash
   echo "int x = 1;" > foo.c
   git add foo.c                    # writes blob object, updates index
   git commit -m "Add foo"
   ```
   *Internally*:
   * `git add` hashes the file content → creates a blob object `.git/objects/<hash>`.
   * The index (`.git/index`) stores mode, path, and blob hash.
   * `git commit` builds a tree object that records the index entries, then creates a commit object:
     ```
     tree <tree-hash>
     parent <parent-hash>
     author <name> <email> <timestamp>
     committer <name> <email> <timestamp>
     
     <commit-message>
     ```
   * The commit object is hashed and stored as an object; HEAD is updated to point to the new commit.

3. **Generate a patch**  
   ```bash
   git diff HEAD~1 > foo.patch
   ```
   *Internally*: Git walks the tree of `HEAD~1` and `HEAD`, emits unified diffs for any differing blobs.

4. **Review**  
   The patch file is emailed or uploaded; reviewers comment; author may amend:
   ```bash
   git commit --amend          # replaces the tip commit with a new one (new hash)
   git format-patch -1 HEAD    # regenerates patch reflecting the amendment
   ```

5. **Apply the patch**  
   ```bash
   git apply foo.patch         # updates working tree and index
   git commit -a -c ORIG_HEAD  # reuses original commit message if desired
   ```
   *Internally*: `apply` modifies the index entries; the subsequent commit records the new tree.

### Mathematical View of a Patch
Let \(T_C\) denote the tree snapshot of commit \(C\). A patch \(P_{A\rightarrow B}\) converting tree \(T_A\) to \(T_B\) can be expressed as the set‑difference of the two tree representations:

$$
P_{A\rightarrow B} = \{ (p, \text{content}_B(p)) \mid p \in \text{paths}, \text{hash}_A(p) \neq \text{hash}_B(p) \}
$$

Applying the patch is equivalent to computing:

$$
T_B = T_A \oplus P_{A\rightarrow B}
$$

where \(\oplus\) denotes the operation that replaces each listed path’s content with the new value.

---

## Worked Examples
### Example 1: Creating and Switching to a Topic Branch
**Scenario**: Start from `main`, add a new utility file, isolate work.

```bash
# 1. Ensure we are on main
git checkout main
git pull origin main   # update local main

# 2. Create and switch to a new branch
git switch -c feature/add-utils   # shorthand for branch + checkout
# .git/refs/heads/feature/add-utils now contains the same hash as main

# 3. Edit a file
printf '/* utils.h */\nstatic inline int max(int a, int b) { return a > b ? a : b; }\n' > utils.h

# 4. Stage and commit
git add utils.h
git commit -m "Add max() inline utility"
```
*Explanation*: `git switch -c` creates the ref and updates HEAD in one step. The commit adds a blob for `utils.h`, a tree entry pointing to it, and a commit object whose parent is the previous tip of `main`.

### Example 2: Generating a Mail‑able Patch Series
**Scenario**: Two commits need to be reviewed via email.

```bash
# Assume we have two local commits on feature/add-utils
git log --oneline
# abc1234 Add max() inline utility
# def5678 Add min() inline utility

# Generate patch series (one file per commit) with cover letter
git format-patch -2 --cover-letter --subject-prefix='PATCH utils' -o outgoing/
```
*Outgoing/* now contains:
* `0001-Add-max-inline-utility.patch`
* `0002-Add-min-inline-utility.patch`
* `0000-cover-letter.patch`

*Why a cover letter?* It provides context (goal, testing plan) that helps reviewers understand the series as a whole.

### Example 3: Applying a Patch Series from Email
**Scenario**: Maintainer receives the series, applies it, and merges.

```bash
# 1. Apply patches preserving authorship
git am --signoff outgoing/0001-Add-max-inline-utility.patch
git am --signoff outgoing/0002-Add-min-inline-utility.patch
# Each `git am` creates a commit with the original author and adds a Signed-off-by trailer.

# 2. Verify the result
git show --stat HEAD

# 3. Fast‑forward main (if appropriate)
git checkout main
git merge --ff-only feature/add-utils
```
*Internally*: `git am` parses the patch, updates the index, creates a commit, and advances HEAD. The `--signoff` adds the required `Signed-off-by: ...` line for kernel‑style provenance.

### Example 4: Using `git bisect` to Locate a Regression
**Scenario**: A bug was introduced somewhere between `v1.0` (known good) and `HEAD` (known bad).

```bash
git bisect start
git bisect bad          # current HEAD is bad
git bisect good v1.0    # tag v1.0 is known good

# Git checks out a midpoint; we test the build
make -j$(nproc) && ./run-tests   # replace with actual test
# If test passes:
git bisect good
# else:
git bisect bad

# Repeat until Git prints:
# <commit-hash> is the first bad commit
```
*Why this works*: Each step halves the remaining search space; after \(k\) steps the interval size is \(N/2^k\). With a binary search over the commit DAG, the complexity is \(O(\log N)\) builds.

---

## Common Mistakes
| Mistake | What’s Wrong | Why It Breaks |
|---------|--------------|---------------|
| **Committing large binary assets (e.g., PDFs, images) without LFS** | The blob objects become huge; each clone downloads the full history. | Bloated repository size → slow clones, excessive disk usage, and difficulty handling history rewrites. |
| **Rewriting public history (e.g., `git push --force` on `main`)** | Existing clones retain the old commits; diverging histories cause confusion. | Collaborators may accidentally re‑introduce discarded work or create irreconcilable merge conflicts. |
| **Ignoring `.gitignore` and committing build artifacts** | Object files, `.o`, executables enter the object database. | Every change triggers a new blob for each binary, bloating the repo and making diffs noisy. |
| **Writing vague commit messages like “fix” or “update”** | No clue about *what* changed or *why*. | Hinders `git bisect`, code review, and changelog generation; increases cognitive load. |
| **Skipping the sign‑off (`Signed-off-by`) when submitting to kernel‑style lists** | Maintainers cannot automatically track provenance. | Violates the Developer’s Certificate of Origin (DCO); patches may be rejected outright. |
| **Assuming `git merge` always creates a merge commit** | Fast‑forward merges move the branch pointer without a commit. | If a linear history is required (e.g., for bisect friendliness), unexpected fast‑forwards can hide merge topology. |
| **Using `git add .` in a repo with untracked sensitive files** | Accidentally stages passwords, keys, or config files. | Secrets become part of the history; even if later removed with `git filter-branch`, they remain reachable via reflog unless fully purged. |

---

## Exercises
### Easy
1. **Initialize a repo and make a first commit**  
   ```bash
   mkdir demo && cd demo
   git init
   echo "# README" > README.md
   git add README.md
   git commit -m "Initial commit"
   ```
   Verify the object database: `find .git/objects -type f | head -5`.

2. **Create a branch, edit a file, and discard changes**  
   ```bash
   git switch -c tmp
   echo "test" > test.txt
   git checkout -- test.txt   # discard workspace changes
   git diff   # should be empty
   ```

### Medium
3. **Create a patch series and apply it elsewhere**  
   ```bash
   # In repo A
   git switch -c feature
   printf 'int foo(void){return 0;}\n' > foo.c
   git add foo.c
   git commit -m "Add foo"
   printf 'int bar(void){return 1;}\n' > bar.c
   git add bar.c
   git commit -m "Add bar"

   # Generate two patches
   git format-patch -2 -o ../patches

   # In a fresh clone (repo B)
   git apply ../patches/0001-Add-foo.patch
   git apply ../patches/0002-Add-bar.patch
   git commit -a -m "Apply patch series"
   ```

4. **Perform a bisect on a known bug**  
   Introduce a deliberate bug (e.g., change `return 0;` to `return 1;` in a function), commit, tag the bad commit, revert to a good tag, then run `git bisect` as shown in the worked example.

### Hard
5. **Send a patch series via email using `git send-email`**  
   ```bash
   git format-patch -1 --subject-prefix='PATCH' -o /tmp/patch
   git send-email --to=you@example.com --smtp-server=localhost /tmp/patch/*.patch
   ```
   (Configure a local MTA or use `msmtp` for realistic testing.)

6. **Rewrite history safely with `git rebase -i` and force‑push with lease**  
   ```bash
   git switch feature
   git rebase -i main   # squash, edit, or drop commits as needed
   git push --force-with-lease origin feature   # updates only if no new commits appeared
   ```
   Explain why `--force-with-lease` prevents overwriting unrelated work.

7. **Create a signed commit and verify the signature**  
   ```bash
   git config --global user.signingkey <your-gpg-key-id>
   git commit -S -m "Signed commit"
   git verify-signature HEAD
   ```
   Discuss the role of cryptographic signatures in guaranteeing author authenticity.

---

## Linux Connection
Git is the backbone of many critical Linux projects. Below are concrete illustrations showing how the concepts appear in real‑world Linux development.

### Linux Kernel Development
* **Repository layout**  
  ```bash
  git clone https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git
  cd linux
  # The .git directory holds ~1.2 GiB of objects (as of 2025)
  du -sh .git
  ```

* **Subsystem maintenance** – Each major subsystem (e.g., `net/`, `drivers/gpu/drm/`) has a maintainer who holds a **topic branch** in their personal tree. Contributors send patches to the subsystem mailing list; the maintainer applies them with `git am` and later pushes to `linux-next`.

* **Typical patch workflow** (as seen on LKML):
  ```bash
  # Developer
  git switch -c fix/ipv6-bug
  # ... edit net/ipv6/addrconf.c ...
  git commit -s -m "ipv6: fix address lifetime race"
  git format-patch -1 -o ~/patches/
  git send-email --to=netdev@vger.kernel.org ~/patches/0001-*.patch
  ```

* **Reviewer tools** – Maintainers often use:
  * `git show <commit>` – view commit with diff.
  * `git blame drivers/gpu/drm/i915/intel_display.c` – line‑level provenance.
  * `git log --grep="fix.*race"` – search commit messages.
  * `patchwork` web UI – tracks series state.

* **Build and test** – After applying a patch series, a developer typically runs:
  ```bash
  make -j$(nproc) defconfig   # or a specific config like allyesconfig
  make -j$(nproc)            # compile
  make -j$(nproc) modules_install
  sudo make -j$(nproc) install
  reboot
  # test with e.g., ip link, ping, or specific subsystem tests
  ```

### Userspace Tooling (systemd, glibc, etc.)
* **systemd** uses Git with a `contrib/` directory for packaging scripts; developers often run:
  ```bash
  git clone https://github.com/systemd/systemd.git
  cd systemd
  meson setup build   # build system
  ninja -C build
  sudo ninja -C build install
  ```
  Patch submissions follow the same `format-patch` → `send-email` flow.

* **glibc** employs `git grep` to locate macro usage across architecture-specific directories:
  ```bash
  git grep -n '__asm__' sysdeps/x86_64/
  ```

### Debugging with Git in Linux
* **Finding regressions** – The kernel’s `git bisect` is heavily used to pinpoint which commit introduced a panic or performance regression. Example:
  ```bash
  git bisect start
  git bisect bad v6.8
  git bisect good v6.6
  # compile and test each midpoint with `make -j$(nproc) && ./tools/testing/selftests/run.sh`
  ```

* **Analyzing blame for security issues** – When a CVE is filed, maintainers run:
  ```bash
  git blame -L 120,130 net/ipv4/tcp_input.c
  ```
  to see who last touched the offending lines.

### Hooks and Automation
Many Linux projects install **repository hooks** to enforce policies:
* `.git/hooks/pre-commit` – runs `clang-format` or `checkpatch.pl` (the kernel style checker).
* `.git/hooks/prepare-commit-msg` – inserts bug‑tracker IDs.
* `.git/hooks/post-merge` – updates generated files (e.g., `scripts/kconfig/`.

Example `pre-commit` hook for kernel style:
```bash
#!/bin/bash
# .git/hooks/pre-commit
if git diff --cached --name-only --diff-filter=ACM | grep -E '\.(c|h)$'; then
    if ! ./scripts/checkpatch.pl --git commit; then
        echo "checkpatch.pl failed – fix style errors before committing"
        exit 1
    fi
fi
```

---

## Why This Matters
Understanding Git at the level of its internal object model transforms it from a “save button” into a **precise engineering tool**.  

* The **content-addressable store** guarantees that identical data is stored once, making clones lightweight and enabling efficient transfer of only new objects.  
* **Branches as lightweight refs** let developers experiment freely without copying data, which is essential in the Linux kernel where thousands of concurrent topic branches exist.  
* **Patch‑based workflows** decouple code review from repository state, allowing maintainers to accept contributions from strangers via mailing lists—a model that has sustained the Linux kernel for decades.  
* **Mathematical reasoning** (hash functions, set‑difference representations, binary search in `git bisect`) provides a foundation for predicting performance, estimating storage needs, and reasoning about correctness of merges and rebases.  
* **Real‑world Linux examples** show that the same mechanisms used to manage a toy project are employed to steer a codebase of over 30 million lines of code, where a single mistaken commit can break millions of devices.  

By mastering these principles—how objects are stored, why branches are cheap, how patches represent tree deltas, and how review integrates with the workflow—you gain the ability to navigate, contribute to, and maintain large-scale open‑source systems with confidence. The payoff is not merely a smoother personal workflow; it is the capacity to participate in the collaborative, transparent, and reliable development that underpins the Linux ecosystem and countless other critical software projects.
