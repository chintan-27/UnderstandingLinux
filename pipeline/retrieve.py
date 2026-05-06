"""
retrieve.py — embedding-based retrieval with cosine similarity fallback to keyword search
"""

import sqlite3
import numpy as np
from openai import OpenAI

from config import API_KEY, BASE_URL, EMBED_MODEL, CHUNKS_DB, BOOK_ALIASES


client = OpenAI(api_key=API_KEY, base_url=BASE_URL)


def embed_query(text: str) -> np.ndarray:
    resp = client.embeddings.create(model=EMBED_MODEL, input=[text[:8000]])
    return np.array(resp.data[0].embedding, dtype=np.float32)


def _has_embeddings(conn: sqlite3.Connection, book: str) -> bool:
    row = conn.execute("""
        SELECT COUNT(*) FROM chunk_embeddings ce
        JOIN chunks c ON c.id = ce.chunk_id
        WHERE c.book = ?
    """, (book,)).fetchone()
    return row[0] > 0


def _embedding_retrieve(conn: sqlite3.Connection, query_vec: np.ndarray, book: str, n: int) -> str:
    rows = conn.execute("""
        SELECT c.id, c.page, c.section, c.text, ce.embedding
        FROM chunks c
        JOIN chunk_embeddings ce ON c.id = ce.chunk_id
        WHERE c.book = ?
    """, (book,)).fetchall()

    if not rows:
        return f"(no embedded chunks found for book '{book}')"

    scored = []
    q_norm = query_vec / (np.linalg.norm(query_vec) + 1e-10)
    for chunk_id, page, section, text, emb_blob in rows:
        vec = np.frombuffer(emb_blob, dtype=np.float32)
        v_norm = vec / (np.linalg.norm(vec) + 1e-10)
        sim = float(np.dot(q_norm, v_norm))
        scored.append((sim, page, section, text))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:n]

    parts = []
    for sim, page, section, text in top:
        header = f"[p.{page}" + (f", {section}" if section else "") + f", sim={sim:.3f}]"
        parts.append(f"{header}\n{text[:1500]}")

    return "\n\n---\n\n".join(parts)


def _keyword_retrieve(conn: sqlite3.Connection, topics: list[str], book: str, n: int) -> str:
    keywords = set()
    for t in topics:
        keywords.update(t.lower().split())
    keywords = {w for w in keywords if len(w) > 3}

    rows = conn.execute(
        "SELECT page, section, text FROM chunks WHERE book=?", (book,)
    ).fetchall()

    if not rows:
        return f"(no chunks found for book '{book}')"

    scored = []
    for page, section, text in rows:
        score = sum(text.lower().count(kw) for kw in keywords)
        scored.append((score, page, section, text))

    scored.sort(key=lambda x: (x[0], x[1], x[2] or ""), reverse=True)
    top = scored[:n]

    parts = []
    for score, page, section, text in top:
        header = f"[p.{page}" + (f", {section}" if section else "") + "]"
        parts.append(f"{header}\n{text[:1500]}")

    return "\n\n---\n\n".join(parts)


def retrieve(
    module_title: str,
    topics: list[str],
    book_key: str,
    conn: sqlite3.Connection,
    n: int = 12,
) -> str:
    if not conn:
        return "(no source chunks available — run ingest.py first)"

    resolved = BOOK_ALIASES.get(book_key, book_key)

    if _has_embeddings(conn, resolved):
        query_text = f"{module_title}: {', '.join(topics)}"
        query_vec = embed_query(query_text)
        return _embedding_retrieve(conn, query_vec, resolved, n)
    else:
        return _keyword_retrieve(conn, topics, resolved, n)
