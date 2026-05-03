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

## Why This Matters

The Linux kernel receives roughly 10,000 patches per release cycle — from hundreds of contributors, across dozens of subsystems, with no single person who can hold the full state in their head. Git makes this tractable not by being a fancy backup system, but by making every state of the tree content-addressable, every transition auditable, and every regression bisectable. When a performance regression appears in the block I/O scheduler or a correctness bug surfaces in the BPF verifier, the question "which commit broke this?" has a mechanical answer that takes minutes, not days. That property is architectural, not incidental.

---

## Core Concepts

### What Git Actually Stores

Git stores **snapshots**, not diffs. Each commit points to a complete tree of content-addressed objects. The identity of every object is its hash:

$$\text{hash} = \text{SHA-1}(\text{type} \;\|\; \text{size} \;\|\; \text{content})$$

Four object types exist:

- **blob**: raw file content, no filename
- **tree**: a directory — maps filenames to blob/tree hashes plus file mode bits
- **commit**: points to one tree, zero or more parent commits, author, committer, timestamp, message
- **tag**: a named, optionally GPG-signed pointer to a commit

Because the hash is derived from content, two files with identical bytes share one blob object. Because a tree's hash covers its children's hashes, and a commit's hash covers its tree and parents, **any corruption or tampering anywhere in history changes every downstream hash** — making silent data loss detectable by construction.

Inspect the object store directly:

```bash
# The object store
ls .git/objects/          # subdirectories named by first two hex digits of hash

# What type is this object?
git cat-file -t HEAD      # → commit

# What does a commit object actually contain?
git cat-file -p HEAD
# tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904
# parent 89ab12cdef1234567890abcdef1234567890abcd
# author Jane <jane@example.com> 1700000000 +0000
# committer Jane <jane@example.com> 1700000000 +0000
#
# net: fix off-by-one in socket buffer accounting

# Walk the tree object it points to
git cat-file -p 4b825dc6
# 100644 blob a8f3b1...  Makefile
# 040000 tree c9d2e4...  kernel
# 040000 tree 8fe1a2...  net

# Compute what hash Git would assign to a file, without storing it
git hash-object myfile.c
```

A packed object (after `git gc` or `git pack-objects`) is stored as a delta against a base object, but the logical model — snapshot, not diff — is unchanged. Deltas are a storage optimization invisible to the data model.

### Commits as a DAG

Commits form a **directed acyclic graph**: each commit points to its parent(s), not forward to its children. A branch is a 41-byte file containing one commit hash. `HEAD` is a file containing either a branch name (attached HEAD) or a commit hash directly (detached HEAD).

```
A ← B ← C ← D          ← main (file: .git/refs/heads/main = hash of D)
              ↑
              └── E ← F  ← feature (file: .git/refs/heads/feature = hash of F)
```

Creating a branch costs one file write. Deleting a branch deletes that file. The commits themselves are unaffected — they remain in the object store until garbage collected.

The DAG structure means **merge commits have two parents**:

```bash
git cat-file -p <merge-commit-hash>
# parent <hash-of-main-tip>
# parent <hash-of-feature-tip>
```

### The Index (Staging Area)

The index — `.git/index` — is a binary-format cache of what the next commit will contain. It holds per-file metadata: blob hash, file mode, size, mtime, inode number, and flags.

```bash
# Read the raw index contents
git ls-files --stage
# 100644 a8f3b1... 0	kernel/bpf/verifier.c
# 100644 c7d2e4... 0	net/socket.c
# The third field (0) is the merge stage: 0=normal, 1=base, 2=ours, 3=theirs

# Stage only specific hunks from a file — each hunk becomes a separate decision
git add -p net/socket.c
```

`git add` writes a blob object to `.git/objects/` and updates the index entry. `git commit` converts the current index into a tree object, wraps it in a commit, then advances the branch pointer. The working directory is never directly committed — the index is the sole source of truth for the next commit. This is why a file modified after `git add` but before `git commit` produces a commit that doesn't include the later modification.

### Branching: Merge vs. Rebase

**Three-way merge** finds the nearest common ancestor commit $M$ of branches $A$ and $B$, then applies $\Delta(M \to A)$ and $\Delta(M \to B)$ simultaneously:

$$\text{result} = M + \Delta(M \to A) + \Delta(M \to B)$$

If $\Delta(M \to A)$ and $\Delta(M \to B)$ touch overlapping lines, Git cannot resolve the conflict automatically and halts for manual intervention. The conflict markers in the file encode all three versions: base, ours, theirs — corresponding to index stages 1, 2, 3.

```bash
# After a merge conflict, see all three versions of a file
git show :1:net/socket.c   # merge base
git show :2:net/socket.c   # ours (HEAD)
git show :3:net/socket.c   # theirs (incoming branch)
```

**Rebasing** replays commits from your branch on top of a new base, one by one. Each replayed commit gets a new hash because its parent has changed. The effect is a linear history with no merge commit.

```bash
# Before rebase:
#   main:    A ← B ← C
#   feature: A ← B ← D ← E

git checkout feature
git rebase main

# After rebase:
#   main:    A ← B ← C
#   feature: A ← B ← C ← D' ← E'
# D' and E' are new objects — same diffs, new hashes
```

The constraint on rebasing is not stylistic: if another developer has `D` and `E` in their history and you rebase them to `D'` and `E'`, their repository has dangling objects that diverge from yours. `git pull` will create a merge commit re-introducing the original commits, doubling them in history. **Rebase only commits that exist solely in your local repository.**

Interactive rebase is the tool for cleaning history before submission:

```bash
git rebase -i HEAD~4
# Opens editor with last 4 commits:
# pick a1b2c3 mm: reduce page cache pressure
# pick d4e5f6 mm: fix typo in comment         ← squash this
# pick 789abc bpf: add kprobe for do_nanosleep
# pick def012 bpf: handle NULL ptr in kprobe  ← fixup into previous
```

### Patch Workflows

The Linux kernel's primary development workflow is email-based. Patches travel as plaintext through mailing lists, get reviewed inline with `>` quoting, are collected by maintainers, and land via `git am`. This workflow predates GitHub by years and scales to LKML's volume (~500 emails/day on active threads) without any web service dependency.

A patch file is the union of a commit message, authorship metadata, and a unified diff:

```
From 89ab12cdef1234567890abcdef1234567890abcd Mon Sep 17 00:00:00 2001
From: Jane Developer <jane@example.com>
Date: Mon, 1 Jan 2024 12:00:00 +0000
Subject: [PATCH 1/2] net: fix off-by-one in socket buffer accounting

The recvfrom(2) path computes buffer occupancy using >= rather than >,
causing premature backpressure at exactly full capacity. Under load with
64KB socket buffers, this manifests as ~8% throughput reduction visible
in netperf TCP_STREAM tests.

Fixes: 1a2b3c4d ("net: initial socket buffer implementation")
Signed-off-by: Jane Developer <jane@example.com>
---
 net/socket.c | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

diff --git a/net/socket.c b/net/socket.c
index abc123..def456 100644
--- a/net/socket.c
+++ b/net/socket.c
@@ -412,7 +412,7 @@ int sock_recvmsg(struct socket *sock, ...)
-    if (buf->used >= buf->capacity)
+    if (buf->used > buf->capacity)
         return -ENOBUFS;
```

The `Signed-off-by` line is a legal statement (Developer Certificate of Origin) that the submitter has the right to submit the code under the project's license. The `Fixes:` tag enables automated tooling to identify stable-branch backport candidates.

```bash
# Generate numbered patch files for the last 3 commits
git format-patch -3
# → 0001-net-fix-off-by-one-in-socket-buffer-accounting.patch
# → 0002-bpf-add-kprobe-for-do-nanosleep.patch
# → 0003-mm-reduce-page-cache-pressure-under-writeback.patch

# Generate a cover letter for a multi-patch series
git format-patch -3 --cover-letter -o patches/

# Apply a patch (preserves author metadata, creates a real commit)
git am patches/0001-*.patch

# Apply with your sign-off added (you're vouching for it)
git
