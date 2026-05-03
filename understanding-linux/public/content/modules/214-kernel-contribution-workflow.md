---
id: 214
title: "Kernel contribution workflow"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Why This Matters

The Linux kernel uses an email-driven, maintainer-hierarchy review process because the alternatives fail at its scale. A GitHub-style pull request model centralizes merge authority, which doesn't work when a single release cycle ingests patches from ~1,700 developers touching ~70,000 lines across dozens of independent subsystems. The email model distributes that authority: each subsystem maintainer is the sole arbiter for their tree, and Linus only sees pull requests from ~30–40 top-level maintainers per merge window.

The consequence for contributors is precise: a patch that violates format conventions, targets the wrong maintainer, or omits required tags will be silently dropped or explicitly rejected before anyone evaluates the logic. The workflow is not bureaucracy — it is the interface contract for a system with no other coordination mechanism.

## Core Concepts

### The Patch as the Unit of Work

A kernel patch is a plain-text email whose body is a `diff -u` formatted diff, preceded by a commit message that explains *why the change is necessary*, not just what it does. The patch must be self-contained because review happens asynchronously on a public mailing list: the reviewer has no shared IDE, no PR comment thread, and no way to ask a quick clarifying question without a 24-hour round trip. Everything the reviewer needs — context, rationale, correctness argument — must be in the patch itself.

The `Signed-off-by` line is not optional metadata. It is a legally binding assertion under the [Developer Certificate of Origin (DCO)](https://developercertificate.org/) that you have the right to submit this code under the kernel's license. Without it, the patch cannot be applied.

### Subsystem Maintainers and the Merge Hierarchy

The file `MAINTAINERS` in the root of the kernel tree maps every file path and driver to a maintainer and mailing list. The hierarchy has three levels:

1. **Subsystem maintainers** review patches, apply accepted ones to their subsystem tree (a public git branch), and hold them there for testing.
2. **Subsystem trees** are pulled by **arch or area maintainers** (e.g., `netdev`, `arm-soc`) who aggregate changes.
3. Linus pulls from top-level maintainers during the **two-week merge window** that opens after each `-rc1` tag.

A patch touching `mm/vmscan.c` goes to Andrew Morton (memory management), not to Linus. A patch touching `net/ipv4/tcp.c` goes to David Miller or Jakub Kicinski (netdev). A patch touching `drivers/gpu/drm/i915/` goes to the i915 DRM maintainer. Routing to the wrong person costs one full release cycle — typically 8–10 weeks.

### Coding Style as an Operational Requirement

`Documentation/process/coding-style.rst` defines the kernel's style rules. The ones that cause the most rejections:

- **Tabs for indentation, not spaces.** A patch that uses spaces will be rejected outright; it corrupts `git blame` for the entire indented block.
- **80-column soft limit.** Lines over 100 columns are hard errors in `checkpatch.pl`.
- **No typedefs that hide pointer types.** `typedef struct foo *foo_t;` is forbidden because it makes it impossible to tell at a call site whether a variable is a pointer.
- **No trailing whitespace.** `checkpatch.pl` flags every instance; maintainers will not strip it for you.

A style violation signals that the contributor has not read the rules, which raises the prior probability that the logic is also wrong. Maintainers act on that prior.

### Mailing List Mechanics

All kernel development traffic passes through mailing lists hosted at `vger.kernel.org` (most subsystems) or `kvack.org` (memory management). The archive at `lore.kernel.org` is the canonical public record. Reviews are inline — the reviewer quotes the specific lines they are objecting to and writes their comment immediately after. Top-posting (writing your reply above all quoted text) makes the thread unreadable in archive view and will draw a correction before any technical discussion.

Every exchange is public and permanently archived. This is not incidental — it means review quality is observable by the entire community, which disciplines both sides.

## How It Works

### Cloning the Right Tree

Do not clone Linus's tree and send patches against it. Clone the subsystem tree where your patch belongs. For memory management:

```bash
git clone git://git.kernel.org/pub/scm/linux/kernel/git/akpm/mm.git
cd mm
git checkout -b fix-vmscan-null-deref mm-unstable
```

For networking:

```bash
git clone git://git.kernel.org/pub/scm/linux/kernel/git/netdev/net.git
cd net
git checkout -b fix-tcp-rcvbuf net-next
```

Using the correct base tree ensures your patch applies cleanly. A patch that generates conflicts when the maintainer tries `git am` is rejected immediately.

### Writing the Commit Message

The commit message is the permanent record. Once the patch is merged, `git log` is the only place this explanation lives. Write it accordingly.

```
mm: fix null pointer dereference in shrink_inactive_list()

When kswapd calls shrink_inactive_list() under heavy memcg pressure,
folio_lruvec_lock() can return a NULL lruvec if the memcg has been
offlined between the LRU isolation and the lock acquisition. The
existing check at line 1834 tests lruvec before the call, but a
concurrent memcg_offline_kmem() can run between the test and the
lock, leaving lruvec NULL when we dereference it at line 1847.

Fix this by rechecking lruvec after acquiring the lock and bailing
out if it has gone NULL, releasing the folio back to the LRU.

Fixes: 3f58a8292dbd ("mm: convert vmscan to folios")
Reported-by: Suren Baghdasaryan <surenb@google.com>
Closes: https://lore.kernel.org/mm-commits/CAJuCfpX...@mail.gmail.com/
Signed-off-by: Your Name <your@email.com>
```

The subject prefix (`mm:`) tells the maintainer which subsystem before they open the email. The `Fixes:` tag is parsed by the stable team's tooling to identify which released kernels need a backport — omitting it when the patch fixes a regression means stable users don't get the fix. The `Closes:` tag auto-closes the linked bug report in some tracking systems.

The `-s` flag in `git commit` inserts `Signed-off-by` automatically from your `.gitconfig` identity:

```bash
git commit -s
```

### Creating the Patch File

```bash
git format-patch origin/mm-unstable
# produces: 0001-mm-fix-null-pointer-dereference-in-shrink_inactive_l.patch
```

For a series of related commits:

```bash
git format-patch --cover-letter -v2 origin/mm-unstable
# produces:
# v2-0000-cover-letter.patch
# v2-0001-mm-introduce-helper-for-folio-lruvec-recheck.patch
# v2-0002-mm-fix-null-pointer-dereference-in-shrink_inactive_l.patch
```

The `--cover-letter` flag generates a patch 0 (the cover letter) where you explain the series as a whole. The `-v2` flag prefixes all subject lines with `[PATCH v2 N/M]` instead of `[PATCH N/M]`, indicating this is a revised submission.

Each patch in a series must be independently correct. A series where patch 2 introduces a bug that patch 3 fixes is rejected — the git tree bisects patches individually, so every commit must leave the tree in a compilable, non-regressing state.

### Finding the Right Recipients

```bash
./scripts/get_maintainer.pl 0001-mm-fix-null-pointer-dereference-in-shrink_inactive_l.patch
```

Sample output:

```
Andrew Morton <akpm@linux-foundation.org> (maintainer:MEMORY MANAGEMENT)
Vlastimil Babka <vbabka@suse.cz> (reviewer:MEMORY MANAGEMENT)
linux-mm@kvack.org (open list:MEMORY MANAGEMENT)
linux-kernel@vger.kernel.org (open list)
```

The first address in each category is `--to`; the rest are `--cc`. `linux-kernel@vger.kernel.org` is always CC'd. Do not omit the subsystem list (`linux-mm@kvack.org`) — that is where other reviewers with relevant expertise are watching.

### Checking Style Before Sending

```bash
./scripts/checkpatch.pl --strict 0001-mm-fix-null-pointer-dereference-in-shrink_inactive_l.patch
```

Run with `--strict` to catch warnings that become errors in some subsystems. A patch with unresolved `checkpatch.pl` errors will be returned before the maintainer reads past the subject line. Also build-test the patch — many maintainers run automated build-bots that will reply to your thread with compiler errors within hours if you did not:

```bash
make -j$(nproc) mm/vmscan.o    # spot-check the changed translation unit
make -j$(nproc) ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- mm/vmscan.o  # cross-check
```

### Sending the Patch

Configure `git send-email` with your SMTP credentials first (`~/.gitconfig` or `~/.gitconfig.local`). Then:

```bash
git send-email \
  --to="Andrew Morton <akpm@linux-foundation.org>" \
  --cc="Vlastimil Babka <vbabka@suse.cz>" \
  --cc=linux-mm@kvack.org \
  --cc=linux-kernel@vger.kernel.org \
  0001-mm-fix-null-pointer-dereference-in-shrink_inactive_l.patch
```

Do not use a webmail client. Gmail and Outlook both reformat long lines to quoted-printable encoding, which corrupts the diff. `git am` on the maint
