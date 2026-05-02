# Content Generation Pipeline

Generates lesson content for all 215 modules from your reference PDFs using an OpenAI-compatible API.

## Setup

```bash
cd pipeline
pip install -r requirements.txt
```

Configure your API in `config.py` or via environment variables:

```bash
export OPENAI_API_KEY="your-key"
export OPENAI_BASE_URL="https://your-provider/v1"   # default: openai
export DRAFT_MODEL="gpt-4o-mini"                    # cheap model for drafting
export REFINE_MODEL="gpt-4o"                        # strong model for refining
```

## Step 1 — Add your PDFs

Drop PDFs into `pipeline/books/`. Name them clearly — the filename becomes the book key in the DB:

```
books/
  tlpi.pdf
  lkd.pdf
  ostep.pdf
  csapp.pdf
  ...
```

Then update `data/module_map.json` if any `primary_book` keys don't match your filenames (without `.pdf`).

## Step 2 — Ingest PDFs

```bash
python ingest.py           # all PDFs in books/
python ingest.py books/tlpi.pdf   # single PDF
```

This extracts text, chunks it into ~1000-word pieces, and stores them in `data/chunks.db`.

## Step 3 — Generate lessons

```bash
# Generate everything (slow, costs tokens)
python generate.py

# Generate a range (recommended — do in batches)
python generate.py 89 99       # Linux userspace first
python generate.py 100 120     # kernel internals
python generate.py 74 88       # OS theory

# Single module
python generate.py 103

# Draft pass only (cheap model, no refine)
python generate.py --draft-only 89 99

# Refine existing drafts (strong model only)
python generate.py --refine-only 89 99
```

Output goes directly to `../understanding-linux/public/content/modules/`.

## Recommended order

Start with the modules you actually want to study first:

| Priority | Range | Topic |
|---|---|---|
| 1 | 89–99 | Linux userspace |
| 2 | 74–88 | OS theory |
| 3 | 100–120 | Linux kernel |
| 4 | 121–140 | Drivers |
| 5 | 141–158 | Networking |
| 6 | 159–215 | Performance / Security / Containers |
| 7 | 63–73 | C & Toolchain |
| 8 | 49–62 | Architecture |
| 9 | 1–48 | Math / Physics / Circuits |

## Cost estimate

Each module = 1 draft call + 1 refine call.
- Draft (cheap model, ~2k tokens out): ~$0.001–0.003
- Refine (strong model, ~2.5k tokens out): ~$0.01–0.03
- 215 modules total: roughly **$2–7** end to end depending on your models.

Do a batch of 10 first to check quality before running all 215.
