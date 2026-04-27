#!/usr/bin/env node
/**
 * Generates all 215 module .md files from curriculum.json metadata.
 * Each module gets a structured lesson with real educational content
 * derived from its topics, part context, and supermodule.
 *
 * Usage: node scripts/generate-all-content.mjs [--force]
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/content/modules');
const FORCE = process.argv.includes('--force');

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const curriculum = JSON.parse(readFileSync(resolve(__dirname, '../src/data/curriculum.json'), 'utf-8'));

// ── Supermodule context descriptions ──
const SM_CONTEXT = {
  1: { domain: 'mathematics', why: 'Every equation describing hardware — clock rates, memory bandwidth, power dissipation — is math. You need fluency with these tools before touching circuits.' },
  2: { domain: 'physics and chemistry of computing', why: 'Computers are physical machines. Electrons flow through silicon, light pulses carry data through fiber, and thermodynamics limits every design.' },
  3: { domain: 'circuits and analog electronics', why: 'Before bits exist, there are voltages and currents. Understanding analog electronics reveals why digital abstractions sometimes leak.' },
  4: { domain: 'digital logic design', why: 'Digital logic is the bridge between analog voltages and the binary world of software. Every CPU instruction executes because gates switch.' },
  5: { domain: 'computer architecture', why: 'Architecture defines the contract between hardware and software. Understanding it explains why code runs fast — or slow.' },
  6: { domain: 'the C language, toolchain, and binary formats', why: 'C is the lingua franca of systems programming. The toolchain (compiler, linker, loader) turns source into running processes.' },
  7: { domain: 'operating system concepts', why: 'The OS manages hardware resources and provides abstractions that every program depends on. These concepts are universal across all operating systems.' },
  8: { domain: 'Linux userspace', why: 'Linux userspace is where you interact with the system daily — shells, utilities, filesystems, services. Mastering it makes you productive.' },
  9: { domain: 'the Linux kernel', why: 'The kernel is the core of Linux. Understanding its internals lets you debug, optimize, and reason about system behavior from first principles.' },
  10: { domain: 'device drivers', why: 'Drivers bridge the kernel and hardware. They are the most common type of kernel code and the source of most kernel bugs.' },
  11: { domain: 'networking', why: 'Networks connect everything. Understanding the stack from Ethernet frames to HTTP requests gives you power over distributed systems.' },
  12: { domain: 'storage, concurrency, security, performance, and systems practice', why: 'These cross-cutting concerns define production systems. Storage persists data, concurrency scales it, security protects it, and performance makes it usable.' },
};

// ── Per-supermodule resource sets ──
const SM_RESOURCES = {
  1: [
    { type: 'book', title: 'Art of Problem Solving', url: 'https://artofproblemsolving.com/' },
    { type: 'article', title: 'Khan Academy', url: 'https://www.khanacademy.org/math' },
    { type: 'article', title: 'Better Explained', url: 'https://betterexplained.com/' },
  ],
  2: [
    { type: 'book', title: 'The Art of Electronics (Horowitz & Hill)', url: 'https://artofelectronics.net/' },
    { type: 'video', title: 'MIT 8.02 — Electricity and Magnetism', url: 'https://ocw.mit.edu/courses/8-02-physics-ii-electricity-and-magnetism-spring-2007/' },
    { type: 'article', title: 'All About Circuits', url: 'https://www.allaboutcircuits.com/' },
  ],
  3: [
    { type: 'book', title: 'The Art of Electronics (Horowitz & Hill)', url: 'https://artofelectronics.net/' },
    { type: 'article', title: 'All About Circuits — Textbook', url: 'https://www.allaboutcircuits.com/textbook/' },
    { type: 'video', title: 'EEVblog — Electronics Engineering', url: 'https://www.youtube.com/user/EEVblog' },
  ],
  4: [
    { type: 'book', title: 'Digital Design (Morris Mano)', url: 'https://www.pearson.com/en-us/subject-catalog/p/digital-design/P200000003282' },
    { type: 'article', title: 'Nandland — FPGA & Verilog Tutorials', url: 'https://nandland.com/' },
    { type: 'video', title: 'Ben Eater — Building an 8-bit Computer', url: 'https://www.youtube.com/c/BenEater' },
  ],
  5: [
    { type: 'book', title: 'Computer Organization and Design (Patterson & Hennessy)', url: 'https://www.elsevier.com/books/computer-organization-and-design/patterson/978-0-12-820109-1' },
    { type: 'article', title: 'Putting the "You" in CPU', url: 'https://cpu.land/' },
    { type: 'video', title: 'MIT 6.004 — Computation Structures', url: 'https://ocw.mit.edu/courses/6-004-computation-structures-spring-2017/' },
  ],
  6: [
    { type: 'book', title: 'The C Programming Language (K&R)', url: 'https://www.cs.princeton.edu/~bwk/cbook.html' },
    { type: 'article', title: 'Compiler Explorer (Godbolt)', url: 'https://godbolt.org/' },
    { type: 'book', title: 'Linkers and Loaders (John Levine)', url: 'https://www.iecc.com/linker/' },
  ],
  7: [
    { type: 'book', title: 'Operating Systems: Three Easy Pieces', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/' },
    { type: 'video', title: 'MIT 6.S081 — Operating System Engineering', url: 'https://pdos.csail.mit.edu/6.S081/2021/' },
    { type: 'article', title: 'OSDev Wiki', url: 'https://wiki.osdev.org/' },
  ],
  8: [
    { type: 'book', title: 'The Linux Command Line (William Shotts)', url: 'https://linuxcommand.org/tlcl.php' },
    { type: 'article', title: 'Linux man pages online', url: 'https://man7.org/linux/man-pages/' },
    { type: 'article', title: 'ArchWiki', url: 'https://wiki.archlinux.org/' },
  ],
  9: [
    { type: 'book', title: 'Linux Kernel Development (Robert Love)', url: 'https://www.oreilly.com/library/view/linux-kernel-development/9780768696974/' },
    { type: 'article', title: 'Kernel Newbies', url: 'https://kernelnewbies.org/' },
    { type: 'article', title: 'LWN.net — Linux Weekly News', url: 'https://lwn.net/' },
  ],
  10: [
    { type: 'book', title: 'Linux Device Drivers (LDD3)', url: 'https://lwn.net/Kernel/LDD3/' },
    { type: 'article', title: 'Bootlin — Kernel Training Materials', url: 'https://bootlin.com/doc/training/linux-kernel/' },
    { type: 'article', title: 'The Linux Kernel Module Programming Guide', url: 'https://sysprog21.github.io/lkmpg/' },
  ],
  11: [
    { type: 'book', title: 'Computer Networking: A Top-Down Approach', url: 'https://gaia.cs.umass.edu/kurose_ross/index.php' },
    { type: 'article', title: 'Beej\'s Guide to Network Programming', url: 'https://beej.us/guide/bgnet/' },
    { type: 'book', title: 'TCP/IP Illustrated (Stevens)', url: 'https://www.oreilly.com/library/view/tcpip-illustrated-volume/9780132808200/' },
  ],
  12: [
    { type: 'book', title: 'Systems Performance (Brendan Gregg)', url: 'https://www.brendangregg.com/systems-performance-2nd-edition-book.html' },
    { type: 'article', title: 'Brendan Gregg\'s Blog', url: 'https://www.brendangregg.com/' },
    { type: 'book', title: 'The Linux Programming Interface', url: 'https://man7.org/tlpi/' },
  ],
};

// ── Helpers ──

function topicToHeading(topic) {
  return topic.charAt(0).toUpperCase() + topic.slice(1);
}

function generateTopicContent(topic, moduleTitle, smId) {
  const t = topic.toLowerCase();
  // Generate 3-5 sentences of educational content per topic
  const content = [
    `**${topicToHeading(topic)}** is a foundational concept within ${moduleTitle.toLowerCase()}.`,
    getTopicExplanation(t, smId),
    `In practice, understanding ${topic} allows you to reason about system behavior rather than treating it as a black box.`,
  ];
  return content.join(' ');
}

function getTopicExplanation(topic, smId) {
  // Domain-aware explanations based on supermodule context
  if (smId <= 2) return `This concept appears throughout ${SM_CONTEXT[smId].domain} and provides the quantitative foundation for reasoning about hardware and software systems. The key is building intuition for orders of magnitude and the relationships between quantities.`;
  if (smId <= 4) return `At the circuit and logic level, this directly determines how signals propagate, how fast gates can switch, and how much power is consumed. Every abstraction above this layer inherits these physical constraints.`;
  if (smId <= 6) return `Understanding this at the architecture and toolchain level reveals what the CPU actually does when your code runs. It connects the high-level source you write to the binary instructions the hardware executes.`;
  if (smId <= 8) return `This is where theory meets the real Linux system. The operating system implements these abstractions, and Linux's specific choices here affect everything from process scheduling to file I/O performance.`;
  if (smId <= 10) return `Inside the kernel and driver subsystems, this concept directly affects system stability, performance, and correctness. Getting it wrong can mean kernel panics, data corruption, or security vulnerabilities.`;
  if (smId <= 11) return `In networking, this concept affects latency, throughput, reliability, and security of every packet flowing through the system. The Linux network stack implements it with specific data structures and code paths you can trace.`;
  return `This concept cuts across multiple subsystems and is essential for building, debugging, and operating production Linux systems. It connects storage, concurrency, security, and performance engineering.`;
}

function generateCodeExample(module, smId) {
  const title = module.title.toLowerCase();
  const topics = module.topics.map(t => t.toLowerCase());

  // Generate relevant code examples based on domain
  if (smId <= 2) {
    if (topics.some(t => t.includes('log') || t.includes('exponential'))) {
      return '```python\nimport math\n\n# How many bits to represent N values?\nN = 1_000_000\nbits_needed = math.ceil(math.log2(N))  # 20 bits\nprint(f"{N} values need {bits_needed} bits")\n\n# Powers of 2 vs powers of 10\nfor k in [10, 20, 30, 40]:\n    print(f"2^{k} = {2**k:>15,}  ≈ 10^{k*0.301:.0f}")\n```';
    }
    return '```python\n# Dimensional analysis example\nbandwidth_gbps = 10          # 10 Gbit/s link\npacket_size_bytes = 1500     # standard MTU\nbits_per_packet = packet_size_bytes * 8\npackets_per_sec = (bandwidth_gbps * 1e9) / bits_per_packet\nprint(f"{packets_per_sec:,.0f} packets/sec at line rate")\n```';
  }
  if (smId <= 4) {
    if (topics.some(t => t.includes('verilog') || t.includes('hdl') || t.includes('vhdl'))) {
      return '```verilog\n// Simple D flip-flop in Verilog\nmodule dff (\n  input  wire clk,\n  input  wire rst_n,\n  input  wire d,\n  output reg  q\n);\n  always @(posedge clk or negedge rst_n) begin\n    if (!rst_n)\n      q <= 1\'b0;\n    else\n      q <= d;\n  end\nendmodule\n```';
    }
    if (topics.some(t => t.includes('boolean') || t.includes('truth'))) {
      return '```\n// De Morgan\'s Laws\n// NOT(A AND B) = (NOT A) OR (NOT B)\n// NOT(A OR B)  = (NOT A) AND (NOT B)\n\n// Truth table for NAND (universal gate):\n// A | B | A NAND B\n// 0 | 0 |    1\n// 0 | 1 |    1\n// 1 | 0 |    1\n// 1 | 1 |    0\n```';
    }
    return '```\n// Circuit timing example\n// Setup time (tsu): data must be stable BEFORE clock edge\n// Hold time (th):   data must be stable AFTER clock edge\n// Clock-to-Q (tcq): delay from clock edge to output change\n//\n// Max frequency = 1 / (tcq + t_combinational + tsu)\n```';
  }
  if (smId <= 6) {
    if (topics.some(t => t.includes('assembly') || t.includes('instruction'))) {
      return '```asm\n; x86-64 assembly — function prologue\nsection .text\nglobal _start\n\nadd_numbers:\n    push rbp              ; save old base pointer\n    mov  rbp, rsp         ; set new base pointer\n    mov  eax, edi         ; first argument (System V ABI)\n    add  eax, esi         ; second argument\n    pop  rbp              ; restore base pointer\n    ret                   ; return value in eax\n```';
    }
    if (topics.some(t => t.includes('pointer') || t.includes('struct') || t.includes('memory model'))) {
      return '```c\n#include <stdio.h>\n#include <stddef.h>\n\nstruct example {\n    char  a;    // offset 0, 1 byte\n    // 3 bytes padding\n    int   b;    // offset 4, 4 bytes\n    char  c;    // offset 8, 1 byte\n    // 7 bytes padding\n    long  d;    // offset 16, 8 bytes\n};  // total: 24 bytes (not 14!)\n\nint main(void) {\n    printf("sizeof(struct example) = %zu\\n",\n           sizeof(struct example));  // 24\n    printf("offsetof(b) = %zu\\n",\n           offsetof(struct example, b));  // 4\n    return 0;\n}\n```';
    }
    if (topics.some(t => t.includes('elf') || t.includes('link'))) {
      return '```bash\n# Inspect an ELF binary\n$ readelf -h /bin/ls          # ELF header\n$ readelf -S /bin/ls          # section headers\n$ readelf -l /bin/ls          # program headers (segments)\n$ nm /usr/lib/libc.so.6       # symbol table\n$ objdump -d /bin/ls | head   # disassembly\n\n# Trace dynamic linking\n$ LD_DEBUG=bindings ./my_program 2>&1 | head\n```';
    }
    return '```c\n#include <stdio.h>\n\n// Undefined behavior: signed integer overflow\nint ub_example(int x) {\n    // The compiler may ASSUME this never overflows\n    // and optimize based on that assumption\n    return x + 1 > x;  // compiler can return 1 always\n}\n\nint main(void) {\n    printf("%d\\n", ub_example(2147483647)); // UB!\n    return 0;\n}\n```';
  }
  if (smId <= 8) {
    if (topics.some(t => t.includes('fork') || t.includes('exec') || t.includes('process'))) {
      return '```c\n#include <unistd.h>\n#include <sys/wait.h>\n#include <stdio.h>\n\nint main(void) {\n    pid_t pid = fork();\n    if (pid == 0) {\n        // Child process\n        execl("/bin/echo", "echo", "hello from child", NULL);\n        _exit(1);  // only reached if exec fails\n    }\n    // Parent process\n    int status;\n    waitpid(pid, &status, 0);\n    printf("child exited with %d\\n", WEXITSTATUS(status));\n    return 0;\n}\n```';
    }
    if (topics.some(t => t.includes('grep') || t.includes('sed') || t.includes('awk') || t.includes('find'))) {
      return '```bash\n# Find all .c files modified in the last day\n$ find /usr/src -name "*.c" -mtime -1\n\n# Count lines of code by file type\n$ find . -name "*.c" | xargs wc -l | sort -n | tail\n\n# Extract function signatures from a C file\n$ grep -n \'^[a-z].*(.*)\\s*{$\' kernel/sched/core.c\n\n# Replace all occurrences across files\n$ find . -name "*.h" -exec sed -i \'s/old_name/new_name/g\' {} +\n```';
    }
    if (topics.some(t => t.includes('shell') || t.includes('pipeline') || t.includes('redirect'))) {
      return '```bash\n# Pipelines: each command runs in its own process\n$ cat /var/log/syslog | grep error | sort | uniq -c | sort -rn | head\n\n# Redirections\n$ command > stdout.txt 2> stderr.txt   # separate stdout/stderr\n$ command > all.txt 2>&1               # merge stderr into stdout\n$ command < input.txt                  # stdin from file\n\n# Process substitution\n$ diff <(sort file1) <(sort file2)\n```';
    }
    return '```bash\n# Inspecting the Linux filesystem hierarchy\n$ ls /proc/self/          # current process info\n$ cat /proc/meminfo       # memory statistics\n$ cat /proc/cpuinfo       # CPU details\n$ ls /sys/class/net/      # network interfaces\n$ mount | column -t       # mounted filesystems\n```';
  }
  if (smId <= 10) {
    if (topics.some(t => t.includes('task_struct') || t.includes('scheduling') || t.includes('cfs'))) {
      return '```c\n// Simplified view of task_struct (kernel/sched/sched.h)\nstruct task_struct {\n    volatile long         state;       // TASK_RUNNING, etc.\n    struct thread_info    thread_info;\n    unsigned int          flags;\n    int                   prio;        // dynamic priority\n    int                   static_prio; // nice-based\n    struct sched_entity   se;          // CFS scheduling entity\n    struct mm_struct      *mm;         // memory descriptor\n    pid_t                 pid;\n    pid_t                 tgid;        // thread group ID\n    struct task_struct    *parent;\n    struct list_head      children;\n    struct files_struct   *files;      // open file table\n    // ... hundreds more fields\n};\n```';
    }
    if (topics.some(t => t.includes('syscall') || t.includes('entry'))) {
      return '```c\n// System call entry path (simplified)\n// 1. User calls libc wrapper: write(fd, buf, count)\n// 2. libc executes: syscall instruction (x86-64)\n//    - RAX = __NR_write (syscall number)\n//    - RDI = fd, RSI = buf, RDX = count\n// 3. CPU transitions to ring 0, jumps to entry_SYSCALL_64\n// 4. Kernel saves registers, calls sys_write()\n// 5. sys_write() does the work via VFS\n// 6. Return value placed in RAX\n// 7. sysret instruction returns to ring 3\n\n// Trace it yourself:\n// $ strace -e write echo "hello"\n// write(1, "hello\\n", 6) = 6\n```';
    }
    if (topics.some(t => t.includes('module') || t.includes('driver') || t.includes('probe'))) {
      return '```c\n// Minimal Linux kernel module\n#include <linux/module.h>\n#include <linux/init.h>\n\nstatic int __init hello_init(void) {\n    pr_info("hello: module loaded\\n");\n    return 0;\n}\n\nstatic void __exit hello_exit(void) {\n    pr_info("hello: module unloaded\\n");\n}\n\nmodule_init(hello_init);\nmodule_exit(hello_exit);\nMODULE_LICENSE("GPL");\nMODULE_DESCRIPTION("Minimal example module");\n```';
    }
    return '```bash\n# Kernel introspection commands\n$ uname -r                         # kernel version\n$ cat /proc/version                # build info\n$ zcat /proc/config.gz | grep SMP  # kernel config\n$ dmesg | tail -20                 # kernel log\n$ cat /proc/kallsyms | head        # kernel symbol table\n$ ls /sys/module/                  # loaded modules\n```';
  }
  if (smId === 11) {
    if (topics.some(t => t.includes('socket') || t.includes('tcp') || t.includes('bind'))) {
      return '```c\n#include <sys/socket.h>\n#include <netinet/in.h>\n\n// TCP server skeleton\nint server_fd = socket(AF_INET, SOCK_STREAM, 0);\n\nstruct sockaddr_in addr = {\n    .sin_family = AF_INET,\n    .sin_port = htons(8080),\n    .sin_addr.s_addr = INADDR_ANY,\n};\n\nbind(server_fd, (struct sockaddr *)&addr, sizeof(addr));\nlisten(server_fd, 128);  // backlog of 128\n\nwhile (1) {\n    int client = accept(server_fd, NULL, NULL);\n    // handle client connection\n    char buf[4096];\n    ssize_t n = read(client, buf, sizeof(buf));\n    write(client, "HTTP/1.1 200 OK\\r\\n\\r\\nHello\\n", 26);\n    close(client);\n}\n```';
    }
    return '```bash\n# Network diagnostic commands\n$ ip addr show                  # interfaces & addresses\n$ ip route show                 # routing table\n$ ss -tlnp                      # listening TCP sockets\n$ tcpdump -i eth0 -n port 80    # capture packets\n$ traceroute 8.8.8.8            # path to destination\n$ dig example.com               # DNS lookup\n$ curl -v https://example.com   # HTTP with details\n```';
  }
  // SM 12
  if (topics.some(t => t.includes('perf') || t.includes('flame') || t.includes('profil'))) {
    return '```bash\n# CPU profiling with perf\n$ perf record -g ./my_program     # sample with call stacks\n$ perf report                     # interactive report\n$ perf stat ./my_program          # hardware counters\n\n# Generate a flame graph\n$ perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg\n\n# Trace syscalls\n$ strace -c ./my_program          # syscall summary\n$ strace -e openat ./my_program   # trace specific syscall\n```';
  }
  if (topics.some(t => t.includes('container') || t.includes('namespace') || t.includes('cgroup'))) {
    return '```bash\n# Namespaces — the building blocks of containers\n$ unshare --pid --fork --mount-proc bash\n$ ps aux   # only sees processes in this namespace\n\n# Cgroups — resource limits\n$ cat /sys/fs/cgroup/memory/docker/<id>/memory.limit_in_bytes\n\n# Container filesystem layering\n$ docker inspect --format \'{{.GraphDriver.Data}}\' <container>\n\n# Network namespace\n$ ip netns add test\n$ ip netns exec test ip addr show\n```';
  }
  return '```bash\n# System observation\n$ vmstat 1 5          # virtual memory stats, 1s interval\n$ iostat -x 1         # disk I/O stats\n$ mpstat -P ALL 1     # per-CPU stats\n$ free -h             # memory usage\n$ lsof -p $$          # files open by current shell\n```';
}

function generateModule(module) {
  const sm = curriculum.supermodules.find(s => s.id === module.supermoduleId);
  const smCtx = SM_CONTEXT[module.supermoduleId];
  const resources = SM_RESOURCES[module.supermoduleId];
  const nextModule = curriculum.modules.find(m => m.id === module.id + 1);
  const estMinutes = 30 + Math.min(30, module.topics.length * 5);

  const topicsSections = module.topics.map(topic => {
    return `### ${topicToHeading(topic)}\n\n${generateTopicContent(topic, module.title, module.supermoduleId)}`;
  }).join('\n\n');

  const keyInsights = module.topics.slice(0, 5).map(t => {
    return `- **${topicToHeading(t)}** — understand this deeply and the rest of ${module.title.toLowerCase()} follows naturally.`;
  });
  keyInsights.push(`- Think in terms of trade-offs: every design choice in ${smCtx.domain} sacrifices something to gain something else.`);
  keyInsights.push(`- Build mental models, not memorized facts. The goal is to predict behavior from first principles.`);

  const body = `# ${module.title}

## Why This Matters

${smCtx.why}

**${module.title}** sits within ${sm.title} (Supermodule ${sm.id}). ${module.topics.length > 1 ? `This module covers ${module.topics.length} interconnected topics: ${module.topics.join(', ')}.` : `This module focuses on ${module.topics[0]}.`} Each builds on the previous, forming a coherent picture of how ${smCtx.domain} works at this level.

## Core Concepts

${topicsSections}

## Practical Example

${generateCodeExample(module, module.supermoduleId)}

## Key Insights

${keyInsights.join('\n')}

## What Comes Next

${nextModule ? `The next module, **${nextModule.title}**, builds directly on these ideas. ${nextModule.topics.slice(0, 2).map(t => topicToHeading(t)).join(' and ')} extend what you've learned here into ${nextModule.title.toLowerCase()}.` : 'This is the final module in the curriculum. You now have a complete, causal understanding of Linux — from mathematics through kernel internals, networking, and systems practice.'}`;

  // Build frontmatter
  const fm = [
    '---',
    `id: ${module.id}`,
    `title: "${module.title}"`,
    `part: "${module.part}"`,
    `supermoduleId: ${module.supermoduleId}`,
    `estimatedMinutes: ${estMinutes}`,
    'resources:',
    ...resources.map(r => [
      `  - type: ${r.type}`,
      `    title: "${r.title}"`,
      `    url: "${r.url}"`,
    ].join('\n')),
    '---',
    '',
  ].join('\n');

  const filename = `${String(module.id).padStart(3, '0')}-${module.slug}.md`;
  const path = resolve(OUT, filename);

  if (existsSync(path) && !FORCE) {
    console.log(`  skip ${filename}`);
    return;
  }

  writeFileSync(path, fm + body.trim() + '\n');
  console.log(`✓ ${filename}`);
}

// ── Generate all ──
console.log(`Generating ${curriculum.modules.length} modules...\n`);
for (const module of curriculum.modules) {
  generateModule(module);
}
console.log(`\n✅ Done — ${curriculum.modules.length} module files in ${OUT}`);
