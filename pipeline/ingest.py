"""
ingest.py — PDF → text chunks → SQLite (+ embeddings)

Usage:
    python ingest.py                  # process all PDFs in books/
    python ingest.py books/tlpi.pdf   # process one PDF
    python ingest.py --embed-only     # only compute embeddings for existing chunks
"""

import sys
import os
import json
import sqlite3
import re
import time
from pathlib import Path

import numpy as np
import fitz  # pymupdf
from openai import OpenAI
from tqdm import tqdm

from config import BOOKS_DIR, CHUNKS_DB, CHUNK_WORDS, CHUNK_OVERLAP, API_KEY, BASE_URL, EMBED_MODEL


client = OpenAI(api_key=API_KEY, base_url=BASE_URL)


def init_db(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chunks (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            book     TEXT NOT NULL,
            page     INTEGER,
            section  TEXT,
            text     TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chunk_embeddings (
            chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id),
            embedding BLOB NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_book ON chunks(book)")
    conn.commit()
    return conn


def extract_pages(pdf_path: str) -> list[dict]:
    doc = fitz.open(pdf_path)
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text("text")
        if text.strip():
            pages.append({"page": i + 1, "text": text})
    return pages


def detect_section(text: str) -> str | None:
    """Heuristic: look for chapter/section headings in the first 200 chars."""
    head = text[:200]
    m = re.search(r'(Chapter\s+\d+[:\s][^\n]{0,60}|Section\s+\d[\d.]*[:\s][^\n]{0,60})', head, re.I)
    return m.group(0).strip() if m else None


def chunk_pages(pages: list[dict], chunk_words: int, overlap: int) -> list[dict]:
    """Slide a word window across the concatenated page text, preserving page numbers."""
    chunks = []
    words_with_meta = []  # list of (word, page_num)

    for p in pages:
        for w in p["text"].split():
            words_with_meta.append((w, p["page"]))

    total = len(words_with_meta)
    start = 0
    while start < total:
        end = min(start + chunk_words, total)
        slice_words = words_with_meta[start:end]
        text = " ".join(w for w, _ in slice_words)
        page = slice_words[0][1]
        section = detect_section(text)
        chunks.append({"page": page, "section": section, "text": text})
        start += chunk_words - overlap

    return chunks


def ingest_pdf(pdf_path: str, conn: sqlite3.Connection):
    book = Path(pdf_path).stem
    existing = conn.execute("SELECT COUNT(*) FROM chunks WHERE book=?", (book,)).fetchone()[0]
    if existing > 0:
        print(f"  {book}: already ingested ({existing} chunks), skipping.")
        return

    print(f"  Extracting {pdf_path}...")
    pages = extract_pages(pdf_path)
    print(f"  {len(pages)} pages extracted, chunking...")
    chunks = chunk_pages(pages, CHUNK_WORDS, CHUNK_OVERLAP)

    conn.executemany(
        "INSERT INTO chunks (book, page, section, text) VALUES (?, ?, ?, ?)",
        [(book, c["page"], c["section"], c["text"]) for c in chunks]
    )
    conn.commit()
    print(f"  {book}: {len(chunks)} chunks stored.")


def embed_chunks(conn: sqlite3.Connection, batch_size: int = 20):
    """Compute embeddings for all chunks that don't have one yet."""
    rows = conn.execute("""
        SELECT c.id, c.text FROM chunks c
        LEFT JOIN chunk_embeddings ce ON c.id = ce.chunk_id
        WHERE ce.chunk_id IS NULL
    """).fetchall()

    if not rows:
        print("All chunks already have embeddings.")
        return

    print(f"Embedding {len(rows)} chunks in batches of {batch_size}...")
    for i in tqdm(range(0, len(rows), batch_size), desc="embedding"):
        batch = rows[i:i + batch_size]
        texts = [text[:8000] for _, text in batch]
        ids = [row_id for row_id, _ in batch]

        for attempt in range(5):
            try:
                resp = client.embeddings.create(model=EMBED_MODEL, input=texts)
                break
            except Exception as e:
                if attempt == 4:
                    raise
                wait = min(60 * (attempt + 1), 120)
                tqdm.write(f"  Embed error (attempt {attempt+1}/5): {e} — retrying in {wait}s")
                time.sleep(wait)

        for row_id, emb_data in zip(ids, resp.data):
            vec = np.array(emb_data.embedding, dtype=np.float32)
            conn.execute(
                "INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding) VALUES (?, ?)",
                (row_id, vec.tobytes())
            )

        conn.commit()
        time.sleep(3.0)

    print(f"Embedded {len(rows)} chunks.")


def main():
    os.makedirs(os.path.dirname(CHUNKS_DB) or ".", exist_ok=True)
    conn = init_db(CHUNKS_DB)

    embed_only = "--embed-only" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    if not embed_only:
        if args:
            pdfs = args
        else:
            pdfs = sorted(Path(BOOKS_DIR).rglob("*.pdf"))

        if not pdfs:
            print(f"No PDFs found in {BOOKS_DIR}/. Put your book PDFs there and re-run.")
            return

        for pdf in pdfs:
            ingest_pdf(str(pdf), conn)

        total = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        books = conn.execute("SELECT book, COUNT(*) FROM chunks GROUP BY book").fetchall()
        print(f"\nTotal: {total} chunks across {len(books)} books")
        for b, n in books:
            print(f"  {b}: {n} chunks")

    embed_chunks(conn)
    conn.close()


if __name__ == "__main__":
    main()
