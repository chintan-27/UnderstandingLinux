# Svadhyaya — Research Brief for Claude Code

> **Svadhyaya** (स्वाध्याय) — Sanskrit: *self-study, one's own reading*. One of Patanjali's five Niyamas in the Yoga Sutras. The Vedic practice of disciplined, self-directed study of sacred texts. The platform name encodes the core value: mastery through your own sustained effort.

## What We're Building

**Svadhyaya** — a **new standalone project** — a gamified MCAT preparation platform ("Phase 1") that evolves into a universal "Duolingo for Books" system ("Phase 2"). This is not an extension of Understanding Linux; it is a separate repo with its own backend, database, and auth.

The MCAT is the ideal pilot: extreme content density, highly motivated users, $1,500–$3,500 average spend per student, clear dependency graph, and a measurable outcome (exam score).

The product is NOT another QBank. The USP is **metacognitive review** — the platform tells students *why* they got a question wrong (content gap, trap distractor, passage misread, time pressure) and automates the mistake-recovery process that top scorers currently do in spreadsheets.

---

## Content Architecture

### The 4 MCAT Sections
| Section | Weight | Questions | Core Disciplines |
|---|---|---|---|
| Bio/Biochem (B/B) | Bio 65%, Biochem 25% | 59 q / 95 min | Biochem, Cell Bio, Genetics |
| Chem/Phys (C/P) | Gen Chem 30%, Physics 25% | 59 q / 95 min | Gen Chem, Orgo, Physics |
| Psych/Soc (P/S) | Psych 65%, Soc 30% | 59 q / 95 min | Psychology, Sociology, Neuro |
| CARS | 100% Critical Reasoning | 53 q / 90 min | Reading comprehension only |

### Prerequisite Dependency Chain (enforced unlock order)
```
Phase 1: Atoms & Force
  → Math fundamentals, units, basic physics

Phase 2: Molecular Logic
  → Atomic bonding, IMF, amino acid structure (PREREQUISITE FOR EVERYTHING)

Phase 3: Bioenergetics
  → Thermodynamics, equilibrium, kinetics
  → Unlocks enzyme kinetics (Michaelis-Menten)

Phase 4: Metabolic Flow
  → Organic chemistry mechanisms, enzyme regulation
  → Glycolysis → TCA → ETC

Phase 5: Integrated Systems
  → Renal, cardiovascular, neurobiology, immunology

Phase 6: The Self & Society
  → Sensation/perception, social stratification, behavior
  → Should start Day 1 as spaced repetition vocabulary, not crammed at the end
```

**Critical insight:** Standard prep courses teach subjects in silos (all biology → all physics). The dependency graph shows this is wrong. Fluid dynamics must precede circulatory physiology. Thermodynamics must precede enzyme kinetics. The platform enforces this.

### High-Yield Topic Priority
- **Amino Acids** — single highest-yield topic, appears across B/B and C/P
- **Enzyme Kinetics** — Michaelis-Menten, inhibition types
- **Metabolic Pathways** — Glycolysis, TCA, ETC
- **Acid-Base Chemistry** — titration curves, buffers, Henderson-Hasselbalch
- **Central Dogma** — replication, transcription, translation, regulation
- **Sensation & Perception** — one of the most discrete-question-dense P/S areas
- **Social Stratification** — high-yield sociology
- **Lab Techniques** — gel electrophoresis, PCR, ELISA, centrifugation (frequently tested)

**Avoid over-indexing on:** projectile motion, advanced circuits, low-yield physics.

### Study Hour Benchmarks
| Target Score | Total Hours | Hours/Week (3–4 months) |
|---|---|---|
| 500–505 | ~180 | 10–15 |
| 510–515 | ~300 | 20–25 |
| 515–519 | ~360 | 25–30 |
| 520+ | 430–550 | 35+ |

Top scorers use: **Kaplan 7-book set** (content), **AnKing/Pankow Anki decks** (Psych/Soc + Biochem), **UWorld** (practice), **AAMC materials** (official logic).

---

## Competitive Landscape

### The Market Gap
Students currently self-assemble three separate tools:
1. **Anki** — memorization via spaced repetition
2. **UWorld** — passage practice and question logic
3. **AAMC** — official assessment

No single platform combines all three with behavioral engagement mechanics. That's the gap.

### Why Existing Platforms Fail

| Platform | Pricing | Primary Complaint |
|---|---|---|
| UWorld | $300+/yr | "UWorld fatigue" — questions too hard, explanations exhausting |
| Blueprint | $700+ | Analytics show what you missed, not why. Score deflation anxiety |
| Jack Westin | Free/paid | CARS only. No science integration |
| Anki (AnKing) | Free | Steep setup curve. No passage reasoning. Just isolation recall |
| Kaplan | $200+ | Books are too dense. Passive learning. No analytics |
| AAMC Official | One-time | "Worst explanations in the industry" — per r/Mcat consensus |
| Khan Academy | Free | Broad but lacks test-day depth and passage difficulty |

### The Specific Gaps to Fill
1. **"Second-Order Review Analytics"** — no platform tells you *why* you missed (content gap vs. trap distractor vs. passage misread). Students track this in spreadsheets manually.
2. **Stress-integrated gamification** — no platform uses loss aversion to incentivize the *review* process (the actual learning event).
3. **Mobile micro-sessions with real passage reasoning** — a 10-minute commute session that isn't just flashcards but a real mini-passage with AAMC-style logic.
4. **Unified interface** — students want Kaplan content + UWorld logic + Duolingo engagement in one place.

---

## Gamification Design

### What Works in High-Stakes Medical Education
From Delphi consensus research on medical gamification, the 5 most critical elements:
1. **Integration with instructional objectives** — mechanics must reward the right behaviors, not just activity
2. **Rapid feedback** — know within seconds whether reasoning was correct and why
3. **Freedom to fail** — mistakes in practice must be penalty-free except for energy cost
4. **Increasing difficulty** — adaptive difficulty prevents both boredom and anxiety
5. **Process rewards** — reward the act of identifying a trap, not just getting the right answer

### The Mechanics Stack

**Streaks (Process-Based)**
- Streak is preserved by completing a "Review Block" of previously missed questions — not just doing new questions
- Do NOT tie streaks to correctness (causes metric gaming — students pick easy questions to preserve streak)
- Streak Freeze mechanic: give 1 freeze per week; Duolingo showed this *increased* DAU by 0.38%

**Hearts / Energy**
- Start with 5 hearts per session
- Wrong answer costs 1 heart
- Depleted → must complete a "Review Sprint" of old material to refill (enforces spacing effect)
- Do NOT make hearts too punishing — high anxiety consumes working memory needed for passage reasoning

**XP System**
- Reading a micro-lesson: 5 XP
- Completing a "Verify This" interaction: 10 XP
- Passing a checkpoint quiz: 50 XP
- Streak bonus: +20% XP on days 7, 14, 30
- Identifying a trap distractor correctly: bonus 15 XP (rewards metacognition)

**Doubt-Management Meter**
- After answering, student marks confidence: Sure / Unsure / Guessed
- Algorithm weights spaced-repetition intervals by confidence, not just correctness
- "Sure but wrong" = high priority review; "Unsure but right" = medium priority

**Collaborative Clans (5–10 students)**
- Team-based weekly goals reduce social isolation of solo MCAT prep
- Collaborative competition outperforms individual competition in high-stress contexts per medical education research
- Avoid individual leaderboards — amplifies anxiety in premed culture

### Failure Modes to Avoid
| Risk | Mitigation |
|---|---|
| Metric Gaming | Tie streaks to review completion, not answer correctness |
| Plateau Problem | Inject "Stretch" hard questions every 5th session |
| Anxiety Amplification | Hearts reset daily; no streak loss if review block done |
| Habituation | Variable reward schedule: surprise XP bonuses on session 3, 7, 15 |
| Passive clicking | "Verify This" interactions require drag/highlight/type — not just click |

---

## The Learning Model

### Lesson Structure: Read → Practice → Master
Each "Level" (atomic learning unit) follows:
1. **Read** — 150-word micro-lesson from source content
2. **Verify This** — one immediate interaction (see types below)
3. **Practice** — 1–3 discrete MCQs on the concept
4. **Master** — integrated passage question using the concept in context

### "Verify This" Interaction Types
- **Ordering** — drag steps of a process into sequence (e.g., steps of glycolysis)
- **Identification** — highlight the line in a paragraph where a specific event occurs
- **Prediction** — "What happens to enzyme velocity when competitive inhibitor is added?" before seeing the answer
- **Labeling** — click the correct region on a diagram (amino acid structure, cell organelle)
- **Calculation** — one-step numerical (pH from H+ concentration)

These are NOT Anki-style flashcards. They require active construction of an answer, which triggers the Testing Effect more powerfully than recognition-based MCQ.

### Spaced Repetition by Content Type
| Content Type | Optimal Format | Review Interval |
|---|---|---|
| Factual recall (amino acids, Psych/Soc) | Cloze deletion / discrete MCQ | 1, 3, 7, 30 days |
| Procedural math (Henderson-Hasselbalch) | Practice problems | 5, 15, 60 days |
| Passage reasoning (CARS, B/B) | Mini-passage + integrated MCQ | Every 14 days |
| Lab technique recall | Discrete MCQ + diagram | 3, 10, 30 days |

---

## Technical Architecture

### Content Pipeline (3-Agent System)

```
PDF/EPUB Input
     ↓
[Agent 1: Extractor]
  - Chunk by semantic header/section
  - Identify "Knowledge Components" (KCs) per chunk
  - Tag dependency index (which KCs must precede this one)
  - Store in SQLite with UTS metadata

     ↓
[Agent 2: Distractor Engine]
  - Input: KC list + chunk text
  - Step 1: Generate predicted student misconceptions for each KC
  - Step 2: Construct distractors that embody those misconceptions
  - Step 3: Ensure distractors are syntactically consistent (same length/grammar as correct answer)
  - Output: MCQ with 4 options + misconception tag per wrong answer

     ↓
[Agent 3: Validator]
  - Separate LLM instance "takes the test"
  - Confirms correct answer is unambiguous
  - Confirms distractors are plausible but wrong
  - Flags any distractor that is logically equivalent to the correct answer
  - Uses NLI (natural language inference) for equivalence detection
```

### MCAT-Quality Distractor Requirements
A valid MCAT distractor must be:
- **Plausible** — based on a real documented misconception (e.g., confusing Keq with Q, or teleological biological reasoning)
- **Syntactically consistent** — same grammatical structure and approximate length as the correct answer
- **Non-equivalent** — NLI-verified not to be a synonym or logical restatement of the correct answer

Prompt template for distractor generation:
```
Given this Knowledge Component: [KC]
And this common student error type: [misconception_category]
Generate a distractor that: (a) a student who believes [misconception] would select, 
(b) is grammatically parallel to the correct answer, 
(c) contains a specific factual or logical error that maps to [misconception].
```

### Database Schema (Universal Tagging Schema — UTS)
Each content chunk needs:
```sql
chunks (
  id, book, page, section, text,
  knowledge_components TEXT,      -- JSON array of KC tags
  dependency_index TEXT,          -- JSON array of prerequisite KC IDs
  high_yield_level INT,           -- 1=essential, 2=important, 3=supporting
  content_type TEXT               -- 'factual'|'procedural'|'passage'|'diagram'
)

questions (
  id, chunk_id, stem, correct_answer, 
  distractor_a, distractor_b, distractor_c,
  misconception_a, misconception_b, misconception_c,  -- why each wrong answer is wrong
  difficulty INT,                 -- 1-5
  cognitive_mode TEXT             -- 'recall'|'application'|'analysis'|'reasoning'
)

student_responses (
  id, user_id, question_id, selected_answer,
  time_spent_ms, confidence_level TEXT,   -- 'sure'|'unsure'|'guessed'
  failure_mode TEXT                        -- auto-tagged: 'content'|'distractor_trap'|'passage_misread'|'time'
)
```

### Legal / Content Seeding Strategy
- **DO NOT** generate content that mirrors Kaplan/Princeton Review phrasing — copyright risk ($150k/work willful infringement)
- **Safe sources to seed from:**
  - AAMC official topic outlines (public domain — provides the structural backbone)
  - Khan Academy archived content (permissively licensed, created with AAMC)
  - Open textbooks (OpenStax Biology, Chemistry — CC-BY licensed)
  - AAMC Sample Test (official, public)
- Generate derivative micro-lessons from *facts* (not copyrightable) using open-source texts as source

---

## Go-to-Market

### Market Size
- Global test prep market: $126B (2024), growing 5.9–7.1% CAGR
- U.S. market: $37.6B
- Average MCAT student spend: $335 (registration) + $1,000–$2,500 (prep materials)
- 20–30% of test-takers are retakers — highly motivated, high willingness to pay for something new

### Target User: The "Anki-Exhausted" Student
- Loves spaced repetition, already uses Anki
- Frustrated that Anki gives no passage reasoning integration
- Wants the engagement loop of a game without something that feels "too easy"
- Studies 25+ hours/week, targeting 515+

### Discovery Channels (in priority order)
1. **r/Mcat** — every resource gets crowd-vetted here. A positive thread here is worth $100k in marketing.
2. **Discord study servers** — real-time word of mouth among active studiers
3. **YouTube: AnKing, Med School Insiders, Dirty Medicine** — these influencers make or break tools
4. **Premed advisors / pre-health committees** — institutional credibility path (slower but high trust)

### Launch Strategy
- **Month 1:** Launch "Free 30-Day High-Yield Sprint" — AI generates a daily schedule based on a diagnostic
- **Positioning:** "The Anki + UWorld you wish existed, with the engagement of Duolingo"
- **Pricing:** $39/month subscription (affordable companion, not replacement for $2k courses)
- **Credibility bar before anyone pays:**
  - Questions must match AAMC "reasoning-first" style (not content quiz)
  - Must automate the mistake document (auto-tag failure mode per wrong answer)
  - Must work in 10-minute mobile sessions with real passage logic

---

## Project Setup — New Standalone Project

This is a **greenfield project**, not an extension of Understanding Linux. Build it from scratch in its own repo.

### Recommended Stack

**Frontend**
- React 19 + Vite + TypeScript
- Tailwind CSS v4 (CSS-first config)
- Framer Motion (animations: snake path, quiz transitions, XP pop-ups)
- React Router v7
- Design system: same editorial aesthetic (Barlow Condensed, JetBrains Mono, paper rules) — proven and consistent

**Backend** ← required from day one (unlike Understanding Linux which used localStorage)
- Node.js + Hono (lightweight, edge-compatible) or FastAPI (Python, easier to co-locate with pipeline)
- PostgreSQL — user accounts, progress, XP, streaks, question responses
- Redis — session state, hearts counter, leaderboard caching
- Auth: Clerk or Supabase Auth (fastest to ship, handles email + OAuth)

**Content Pipeline** (Python, standalone scripts)
- Same pattern as Understanding Linux pipeline: PDF → chunks → SQLite → LLM generation
- Extend with: KC extraction, dependency tagging, distractor generation (3-agent system)
- Models: UFL proxy (llama-3.3-70b for drafting, nemotron-120b for validation) or OpenAI API
- Embeddings: nomic-embed-text-v1.5 for semantic retrieval

**Database Schema — Core Tables**
```sql
-- Content
stages (id, title, phase, prerequisite_stage_id, unlock_threshold_pct)
units (id, stage_id, title, order_index)
levels (id, unit_id, title, mode TEXT) -- 'read'|'practice'|'master'
micro_lessons (id, level_id, text, knowledge_components JSONB)
questions (
  id, level_id, stem, correct_answer,
  distractor_a, distractor_b, distractor_c,
  misconception_a, misconception_b, misconception_c,
  difficulty INT, cognitive_mode TEXT, high_yield_level INT
)

-- Users
users (id, email, created_at, target_score, exam_date)
user_progress (
  user_id, level_id, status TEXT,       -- 'locked'|'active'|'complete'
  passed_at TIMESTAMPTZ
)
user_responses (
  id, user_id, question_id, selected_answer,
  is_correct BOOL, time_spent_ms INT,
  confidence TEXT,                        -- 'sure'|'unsure'|'guessed'
  failure_mode TEXT,                      -- 'content'|'trap'|'passage'|'time'
  created_at TIMESTAMPTZ
)

-- Gamification
user_stats (
  user_id, xp INT, streak_days INT,
  last_activity_date DATE, streak_freeze_count INT,
  hearts_remaining INT, hearts_last_refill TIMESTAMPTZ
)
clans (id, name, invite_code)
clan_members (clan_id, user_id, role TEXT)
```

---

## Repo Structure

```
svadhyaya/
├── app/                    # React frontend (Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── SnakePath.tsx       # The journey map
│   │   │   ├── LevelPage.tsx       # Read → Practice → Master
│   │   │   ├── QuizEngine.tsx      # "Verify This" interactions
│   │   │   ├── ReviewDashboard.tsx # Failure mode analytics
│   │   │   └── ClanPage.tsx        # Collaborative groups
│   │   ├── components/
│   │   │   ├── interactions/       # Ordering, Highlight, Prediction, MCQ
│   │   │   ├── gamification/       # HeartsBar, XPCounter, StreakBadge
│   │   │   └── snake/              # StageNode, UnitCard, LockOverlay
│   │   └── hooks/
│   │       ├── useSession.ts       # Hearts, XP, streak for current session
│   │       └── useReviewQueue.ts   # Spaced repetition due items
│
├── api/                    # Backend (Hono or FastAPI)
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── progress.ts
│   │   ├── questions.ts
│   │   └── gamification.ts
│   └── db/
│       ├── schema.sql
│       └── migrations/
│
└── pipeline/               # Content generation (Python)
    ├── ingest.py           # PDF → chunks + embeddings
    ├── extract_kcs.py      # Knowledge component extraction
    ├── generate_questions.py  # 3-agent MCQ + distractor pipeline
    ├── validate.py         # Validator agent
    └── data/
        ├── chunks.db
        └── questions.db
```

---

## Phase 1 Build Order (MVP — MCAT)

### Sprint 1: Content Pipeline
1. `ingest.py` — PDF → semantic chunks → SQLite (port from Understanding Linux)
2. `extract_kcs.py` — LLM extracts Knowledge Components + assigns dependency index + high-yield level
3. `generate_questions.py` — Agent 1 (extractor) → Agent 2 (distractor engine) → Agent 3 (validator)
4. Seed with open-license content: OpenStax Biology/Chemistry + AAMC official outlines
5. Manually QA 50 questions before touching frontend

### Sprint 2: Auth + Core Backend
1. User accounts (Clerk or Supabase Auth)
2. `user_stats` table with XP, streak, hearts
3. `user_responses` logging with failure_mode auto-tagging
4. Progress sync API (level unlock state)

### Sprint 3: Snake Path UI
1. Vertical scrollable map: 6 phases → stages → units
2. Lock/unlock state with prerequisite enforcement
3. Stage checkpoint quiz gate (must pass ≥ 70% to unlock next stage)
4. Animated unlock celebration (Framer Motion)

### Sprint 4: Quiz Engine
1. MCQ component with 4-option layout
2. Confidence selector (Sure / Unsure / Guessed) — shown after answering
3. "Verify This" interaction types: Ordering (drag), Identification (highlight), Prediction (input before reveal)
4. Hearts deduction on wrong answer
5. Failure mode auto-tag on wrong answer submission

### Sprint 5: Review Dashboard
1. Spaced repetition queue (SM-2 algorithm or simple 1-3-7-30 schedule)
2. "Why you missed it" breakdown: content gap / trap distractor / passage misread
3. Streak tracker with freeze mechanic
4. XP history chart

### Sprint 6: Polish + Launch
1. Clan creation + invite code
2. "Free 30-Day High-Yield Sprint" landing page
3. Stripe integration at $39/month
4. r/Mcat launch post

---

## Phase 2 (After MCAT Validation — "Duolingo for Books")

- Generic pipeline: any PDF/EPUB → same 3-agent question generation
- User-submitted book support
- Genre-specific interaction types (narrative exploration vs. technical verification)
- Mobile app (React Native — shares design system and API)
- Learning Reels (short explainer cards with micro-interaction gate)
