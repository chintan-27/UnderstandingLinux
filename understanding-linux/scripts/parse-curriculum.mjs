import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULES_TXT = resolve(__dirname, '../../Modules.txt');
const OUT = resolve(__dirname, '../src/data/curriculum.json');

// --- Supermodule definitions ---
const SUPERMODULES = [
  { id: 1, title: 'Math for Physical Computing',                         slug: 'math-for-physical-computing',                        description: 'Algebra through information theory — the mathematical toolkit every layer of the stack draws from.', range: [[1, 15]] },
  { id: 2, title: 'Physics and Chemistry of Computing',                  slug: 'physics-and-chemistry-of-computing',                  description: 'From atomic structure to semiconductor physics: why matter behaves the way it does inside a chip.', range: [[16, 27]] },
  { id: 3, title: 'Electricity, Electronics, and Signals',               slug: 'electricity-electronics-and-signals',                  description: 'Circuit laws, analog signals, noise, and the physical foundations of digital hardware.', range: [[28, 38]] },
  { id: 4, title: 'Digital Logic and Hardware Design',                   slug: 'digital-logic-and-hardware-design',                   description: 'Boolean algebra through HDLs, FPGAs, and timing closure — how logic gates become computation.', range: [[39, 48]] },
  { id: 5, title: 'Computer Architecture and Machine Execution',         slug: 'computer-architecture-and-machine-execution',         description: 'ISA, pipelining, caches, virtual memory, and multiprocessors — the hardware a program runs on.', range: [[49, 62]] },
  { id: 6, title: 'C, Assembly, Compilers, Linking, and Binaries',       slug: 'c-assembly-compilers-linking-and-binaries',           description: 'How source code becomes machine instructions: C semantics, toolchains, ELF, and runtime startup.', range: [[63, 73]] },
  { id: 7, title: 'Core Operating Systems',                              slug: 'core-operating-systems',                              description: 'Processes, scheduling, memory management, filesystems, IPC, and OS security fundamentals.', range: [[74, 88]] },
  { id: 8, title: 'Linux User Space and System Programming',             slug: 'linux-user-space-and-system-programming',             description: 'The Unix philosophy in practice: shells, core utilities, libc, init, and systems programming.', range: [[89, 99]] },
  { id: 9, title: 'Linux Kernel Internals',                              slug: 'linux-kernel-internals',                              description: 'The kernel source tree, syscall path, scheduler, MM, VFS, block layer, and eBPF — from the inside.', range: [[100, 120]] },
  { id: 10, title: 'Drivers and Hardware Interaction',                   slug: 'drivers-and-hardware-interaction',                    description: 'All driver frameworks: PCI, USB, I2C, SPI, input, storage, network, graphics, power management.', range: [[121, 140]] },
  { id: 11, title: 'Networking and Distributed Communication',           slug: 'networking-and-distributed-communication',            description: 'The full Linux network stack: sockets through netfilter, NIC drivers through distributed system patterns.', range: [[141, 158], [205, 209]] },
  { id: 12, title: 'Performance, Security, Virtualization, and Beyond',  slug: 'performance-security-virtualization-and-beyond',      description: 'Profiling, kernel security, containers, KVM, storage performance, and advanced Linux engineering.', range: [[159, 204], [210, 215]] },
];

function getSupermoduleId(moduleId) {
  for (const sm of SUPERMODULES) {
    for (const [lo, hi] of sm.range) {
      if (moduleId >= lo && moduleId <= hi) return sm.id;
    }
  }
  return null;
}

function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// --- Parse Modules.txt ---
const text = readFileSync(MODULES_TXT, 'utf-8');
const lines = text.split('\n');

const modules = [];
const partTitleMap = {};

let currentPart = null;
let currentPartTitle = null;
let currentModule = null;

for (const raw of lines) {
  const line = raw.trim();

  // Part header: "# Part I: ..." or "# Part I — ..."
  const partMatch = line.match(/^#\s+Part\s+([IVXLCDM]+)\s*[:—]\s*(.+)/);
  if (partMatch) {
    currentPart = partMatch[1];
    currentPartTitle = partMatch[2].trim();
    partTitleMap[currentPart] = currentPartTitle;
    continue;
  }

  // Module header: "## 55. Caches" — only lines with a plain integer id
  const modMatch = line.match(/^##\s+(\d+)\.\s+(.+)/);
  if (modMatch) {
    if (currentModule) modules.push(currentModule);
    const id = parseInt(modMatch[1], 10);
    const title = modMatch[2].trim();
    currentModule = {
      id,
      title,
      slug: toSlug(title),
      part: currentPart ?? 'I',
      partTitle: currentPartTitle ?? '',
      supermoduleId: getSupermoduleId(id),
      topics: [],
      contentPath: `content/modules/${String(id).padStart(3, '0')}-${toSlug(title)}.md`,
    };
    continue;
  }

  // Topics line
  if (line.startsWith('Topics:') && currentModule) {
    const topicStr = line.slice('Topics:'.length).trim().replace(/\.$/, '');
    currentModule.topics = topicStr.split(',').map(t => t.trim()).filter(Boolean);
  }
}
if (currentModule) modules.push(currentModule);

// Keep only modules 1–215 (Parts I–XX)
const filtered = modules.filter(m => m.id >= 1 && m.id <= 215 && m.supermoduleId !== null);

// Build supermodule moduleIds
const smMap = {};
for (const sm of SUPERMODULES) smMap[sm.id] = { ...sm, moduleCount: 0, moduleIds: [] };
for (const m of filtered) {
  if (m.supermoduleId && smMap[m.supermoduleId]) {
    smMap[m.supermoduleId].moduleIds.push(m.id);
    smMap[m.supermoduleId].moduleCount++;
  }
}

const result = {
  supermodules: SUPERMODULES.map(sm => ({
    id: sm.id,
    title: sm.title,
    slug: sm.slug,
    description: sm.description,
    moduleCount: smMap[sm.id].moduleCount,
    moduleIds: smMap[sm.id].moduleIds,
  })),
  modules: filtered,
};

writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`✓ Wrote ${filtered.length} modules across ${SUPERMODULES.length} supermodules to src/data/curriculum.json`);
