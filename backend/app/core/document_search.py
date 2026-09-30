import re
from typing import List, Dict, Any
from sqlalchemy import select
from app.database.database import AsyncSessionLocal
from app.database.models import DocumentChunk
from app.core.embedder import generate_deterministic_embedding, compute_cosine_similarity, EMBEDDING_DIM


def compute_lexical_overlap(query: str, content: str) -> float:
    query_tokens = set(re.findall(r"\b\w{3,}\b", query.lower()))
    if not query_tokens:
        return 0.0
    content_tokens = set(re.findall(r"\b\w{3,}\b", content.lower()))
    intersection = query_tokens.intersection(content_tokens)
    return len(intersection) / len(query_tokens)


async def search_document_chunks(
    ticker: str,
    query: str,
    top_k: int = 5,
    min_similarity: float = 0.0,
    session=None,
) -> List[Dict[str, Any]]:
    if not query.strip():
        return []

    top_k = max(1, min(top_k, 20))
    query_vec = generate_deterministic_embedding(query, dim=EMBEDDING_DIM)

    async def _execute_search(s):
        stmt = select(DocumentChunk).where(
            DocumentChunk.ticker == ticker.upper(),
            DocumentChunk.embedding.isnot(None),
        )
        res = await s.execute(stmt)
        chunks = res.scalars().all()

        scored_results = []
        for chunk in chunks:
            if not chunk.embedding:
                continue

            vector_sim = compute_cosine_similarity(query_vec, chunk.embedding)
            lexical_sim = compute_lexical_overlap(query, chunk.content)

            # Hybrid fusion score: 85% vector cosine similarity + 15% keyword overlap
            hybrid_score = round(0.85 * vector_sim + 0.15 * lexical_sim, 4)

            if hybrid_score >= min_similarity:
                scored_results.append(
                    {
                        "chunk_id": chunk.id,
                        "document_id": chunk.document_id,
                        "ticker": chunk.ticker,
                        "source_file": chunk.source_file,
                        "doc_type": chunk.doc_type,
                        "chunk_index": chunk.chunk_index,
                        "page_number": chunk.page_number,
                        "content": chunk.content,
                        "token_count": chunk.token_count,
                        "vector_similarity": round(vector_sim, 4),
                        "lexical_overlap": round(lexical_sim, 4),
                        "similarity_score": hybrid_score,
                    }
                )

        scored_results.sort(key=lambda x: x["similarity_score"], reverse=True)
        return scored_results[:top_k]

    if session is not None:
        return await _execute_search(session)

    async with AsyncSessionLocal() as s:
        return await _execute_search(s)
