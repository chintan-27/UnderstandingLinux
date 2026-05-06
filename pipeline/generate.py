"""
generate.py — retrieve chunks → draft → refine → write .md files

Usage:
    python generate.py                        # generate all modules
    python generate.py 89 99                  # generate modules 89–99 (inclusive)
    python generate.py 103                    # generate a single module
    python generate.py --draft-only 89 99     # draft pass only, skip refine
    python generate.py --refine-only 89 99    # refine existing drafts only
"""

import sys
import os
import json
import sqlite3
import re
import time
from pathlib import Path
from datetime import datetime

from openai import OpenAI
from tqdm import tqdm

from config import (
    API_KEY, BASE_URL, DRAFT_MODEL, REFINE_MODEL,
    CHUNKS_DB, MODULE_MAP, OUTPUT_DIR,
)
from retrieve import retrieve

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)


# ── helpers ──────────────────────────────────────────────────────────────────

def load_module_map() -> dict:
    with open(MODULE_MAP) as f:
        return json.load(f)


def load_prompt(name: str, **kwargs) -> str:
    path = Path("prompts") / f"{name}.txt"
    template = path.read_text()
    for k, v in kwargs.items():
        template = template.replace("{" + k + "}", str(v))
    return template



def call_model(model: str, prompt: str, max_tokens: int = 2000, retries: int = 5) -> str:
    for attempt in range(retries):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
            )
            content = resp.choices[0].message.content or ""
            return content.strip()
        except Exception as e:
            if attempt == retries - 1:
                raise
            wait = min(60 * (attempt + 1), 120)
            tqdm.write(f"  API error (attempt {attempt+1}/{retries}): {e} — retrying in {wait}s")
            time.sleep(wait)


def build_frontmatter(mod: dict, module_id: int) -> str:
    resources = []
    map_data = load_module_map()
    books = map_data.get("books", {})
    for bkey in [mod.get("primary_book"), mod.get("secondary_book")]:
        if bkey and bkey in books:
            resources.append(f'  - type: book\n    title: "{books[bkey]}"')

    resources_yaml = "\n".join(resources) if resources else "  []"
    topics_yaml = "\n".join(f'  - "{t}"' for t in mod.get("topics", []))

    return f"""---
id: {module_id}
title: "{mod['title']}"
supermoduleId: {mod['supermoduleId']}
estimatedMinutes: 45
resources:
{resources_yaml}
---"""


def output_path(mod: dict) -> Path:
    return Path(OUTPUT_DIR) / Path(mod["contentPath"]).name


def draft_exists(mod: dict) -> bool:
    p = output_path(mod)
    if not p.exists():
        return False
    text = p.read_text()
    return "Content coming soon" not in text and len(text) > 400


# ── core generation ───────────────────────────────────────────────────────────

def generate_module(module_id: int, mod: dict, conn, draft_only=False, refine_only=False):
    out_path = output_path(mod)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if refine_only and out_path.exists():
        existing = out_path.read_text()
        body = re.sub(r"^---[\s\S]*?---\n", "", existing).strip()
        draft = body
    else:
        topics = mod.get("topics", [])
        primary_book = mod.get("primary_book", "")
        secondary_book = mod.get("secondary_book", "")

        chunks = retrieve(mod["title"], topics, primary_book, conn, n=12) if primary_book else "(no primary book)"
        secondary_chunks = retrieve(mod["title"], topics, secondary_book, conn, n=6) if secondary_book else "(no secondary book)"

        prompt = load_prompt(
            "draft",
            module_id=module_id,
            module_title=mod["title"],
            topics=", ".join(topics),
            primary_book=primary_book,
            chunks=chunks,
            secondary_chunks=secondary_chunks,
        )
        draft = call_model(DRAFT_MODEL, prompt, max_tokens=4000)

    if draft_only:
        body = draft
    else:
        prompt = load_prompt(
            "refine",
            module_id=module_id,
            module_title=mod["title"],
            draft=draft,
        )
        body = call_model(REFINE_MODEL, prompt, max_tokens=6000)

    frontmatter = build_frontmatter(mod, module_id)
    full = frontmatter + "\n\n" + body + "\n"
    out_path.write_text(full)
    return True


# ── entry point ───────────────────────────────────────────────────────────────

def parse_args():
    args = sys.argv[1:]
    draft_only   = "--draft-only"     in args
    refine_only  = "--refine-only"    in args
    skip_existing = "--skip-existing" in args
    args = [a for a in args if not a.startswith("--")]

    if len(args) == 0:
        return None, None, draft_only, refine_only, skip_existing
    elif len(args) == 1:
        n = int(args[0])
        return n, n, draft_only, refine_only, skip_existing
    else:
        return int(args[0]), int(args[1]), draft_only, refine_only, skip_existing


def main():
    start_id, end_id, draft_only, refine_only, skip_existing = parse_args()

    map_data = load_module_map()
    modules = map_data["modules"]

    # filter to requested range
    ids = sorted(int(k) for k in modules.keys())
    if start_id is not None:
        ids = [i for i in ids if start_id <= i <= end_id]

    if not ids:
        print("No modules matched.")
        return

    # open chunks db if available
    conn = None
    if Path(CHUNKS_DB).exists():
        conn = sqlite3.connect(CHUNKS_DB)
        total_chunks = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        print(f"Chunks DB: {total_chunks} chunks loaded.")
    else:
        print("Warning: chunks.db not found. Run ingest.py first for source-grounded output.")

    print(f"Generating {len(ids)} modules (draft_only={draft_only}, refine_only={refine_only})")
    print(f"Draft model: {DRAFT_MODEL}  |  Refine model: {REFINE_MODEL}\n")

    errors = []
    for module_id in tqdm(ids, desc="modules"):
        mod = modules[str(module_id)]
        if skip_existing and draft_exists(mod):
            continue
        try:
            generate_module(module_id, mod, conn, draft_only=draft_only, refine_only=refine_only)
        except Exception as e:
            errors.append((module_id, str(e)))
            tqdm.write(f"  ERROR module {module_id}: {e}")
        time.sleep(0.3)  # be polite to the API

    if conn:
        conn.close()

    print(f"\nDone. {len(ids) - len(errors)} succeeded, {len(errors)} failed.")
    if errors:
        print("Failed modules:", [i for i, _ in errors])


if __name__ == "__main__":
    main()
