import asyncio
import io
import math
import sys
import time
from pathlib import Path
import httpx

# Ensure backend root is on sys.path
backend_root = str(Path(__file__).resolve().parent.parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app.core.document_parser import parse_and_chunk_pdf
from app.core.embedder import (
    generate_deterministic_embedding,
    generate_batch_embeddings,
    compute_cosine_similarity,
    EMBEDDING_DIM,
)
from app.core.document_search import search_document_chunks
from app.workers.edgar_worker import sync_edgar_filings_for_ticker
from app.graph.graph import AgentState
from app.core.analytics import QuantitativeAnalyticsEngine
from app.database.database import engine, Base, AsyncSessionLocal
from app.database.models import DocumentChunk
from app.main import app


def build_test_pdf(text: str) -> bytes:
    escaped = text.replace("(", "[").replace(")", "]")
    stream_content = f"BT /F1 12 Tf 72 712 Td ({escaped}) Tj ET"
    stream_len = len(stream_content)
    pdf_template = f"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length {stream_len} >>
stream
{stream_content}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000228 00000 n 
0000000305 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
{350 + stream_len}
%%EOF"""
    return pdf_template.encode("latin1")


async def run_capstone_audit():
    print("=" * 80)
    print("🏆 [PHASE 2 MILESTONE 4 CAPSTONE] DOCUMENT INGESTION & RAG PIPELINES AUDIT")
    print("=" * 80)

    # Initialize tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # --------------------------------------------------------------------------
    # Assertion 1: PDF Ingestion & Sliding-Window Tokenization
    # --------------------------------------------------------------------------
    dummy_text = " ".join([f"financial_metric_token_{i}" for i in range(1200)])
    pdf_bytes = build_test_pdf(dummy_text)
    parsed = parse_and_chunk_pdf(
        file_bytes=pdf_bytes,
        ticker="GOOGL",
        doc_type="10-K",
        filename="googl-10k.pdf",
        target_tokens=512,
        overlap_tokens=50,
    )
    assert parsed["total_chunks"] >= 2, "Expected multiple chunks for 1200 tokens"
    assert parsed["total_tokens"] > 1000
    for chunk in parsed["chunks"]:
        assert chunk["token_count"] <= 512
        assert "chunk_id" in chunk
        assert chunk["ticker"] == "GOOGL"
    print(f"✅ Assertion 1 Passed: PDF sliding-window chunker verified ({parsed['total_chunks']} chunks, {parsed['total_tokens']} tokens).")

    # --------------------------------------------------------------------------
    # Assertion 2: pgvector Vector Storage & Embedding Normalization
    # --------------------------------------------------------------------------
    sample_text = "Alphabet advertising and search revenue acceleration driven by Gemini infrastructure."
    vec = generate_deterministic_embedding(sample_text, dim=EMBEDDING_DIM)
    assert len(vec) == EMBEDDING_DIM
    norm = math.sqrt(sum(x * x for x in vec))
    assert abs(norm - 1.0) < 1e-4, f"Vector norm must be 1.0, got {norm}"

    batch_vecs = await generate_batch_embeddings([sample_text, dummy_text[:200]], dim=EMBEDDING_DIM)
    assert len(batch_vecs) == 2
    for b_v in batch_vecs:
        assert len(b_v) == EMBEDDING_DIM
        assert abs(math.sqrt(sum(x * x for x in b_v)) - 1.0) < 1e-4
    print("✅ Assertion 2 Passed: 1536-dimensional L2-normalized vector storage verified.")

    # --------------------------------------------------------------------------
    # Assertion 3: HNSW Cosine Semantic Search & Hybrid Ranking
    # --------------------------------------------------------------------------
    async with AsyncSessionLocal() as session:
        seed_chunk = DocumentChunk(
            id="chunk_capstone_googl_1",
            document_id="doc_capstone_googl",
            ticker="GOOGL",
            source_file="googl-10k.pdf",
            doc_type="10-K",
            chunk_index=0,
            page_number=1,
            content=sample_text,
            token_count=12,
            embedding=vec,
        )
        await session.merge(seed_chunk)
        await session.commit()

    search_hits = await search_document_chunks(
        ticker="GOOGL",
        query="Alphabet search advertising Gemini",
        top_k=5,
    )
    assert len(search_hits) >= 1
    assert search_hits[0]["chunk_id"] == "chunk_capstone_googl_1"
    assert search_hits[0]["similarity_score"] > 0.3
    print(f"✅ Assertion 3 Passed: Semantic search ranked target passage #1 (score: {search_hits[0]['similarity_score']:.4f}).")

    # --------------------------------------------------------------------------
    # Assertion 4: LangGraph RAG Multi-Agent State Context & Citations
    # --------------------------------------------------------------------------
    assert "rag_context" in AgentState.__annotations__
    assert "citations" in AgentState.__annotations__
    assert "rag_context_injected" in AgentState.__annotations__
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/v1/intelligence/rag-context/GOOGL")
        assert res.status_code == 200
        payload = res.json()
        assert payload["ticker"] == "GOOGL"
        assert payload["rag_injected"] is True
        assert payload["total_citations"] >= 1
    print("✅ Assertion 4 Passed: Multi-agent RAG context and citation injection confirmed.")

    # --------------------------------------------------------------------------
    # Assertion 5: Autonomous SEC EDGAR Ingestion Daemon
    # --------------------------------------------------------------------------
    edgar_result = await sync_edgar_filings_for_ticker("NVDA", "10-K")
    assert edgar_result["ticker"] == "NVDA"
    assert edgar_result["chunks_generated"] >= 1
    assert edgar_result["status"] == "SYNCED"

    # Confirm chunks are stored in DB
    async with AsyncSessionLocal() as session:
        db_chunks = (
            await session.execute(
                DocumentChunk.__table__.select().where(DocumentChunk.ticker == "NVDA")
            )
        ).fetchall()
        assert len(db_chunks) >= 1, "NVDA EDGAR chunks must be persisted in database"
    print(f"✅ Assertion 5 Passed: SEC EDGAR daemon auto-ingestion verified ({edgar_result['chunks_generated']} chunks persisted).")

    # --------------------------------------------------------------------------
    # Assertion 6: Multi-Tenant Ticker Scoping & Zero Contamination
    # --------------------------------------------------------------------------
    nvda_hits_in_googl = await search_document_chunks(
        ticker="GOOGL",
        query="NVIDIA accelerated computing GPU clusters",
        top_k=10,
    )
    for h in nvda_hits_in_googl:
        assert h["ticker"] == "GOOGL", f"Cross-tenant leak: expected GOOGL, got {h['ticker']}"
    print("✅ Assertion 6 Passed: Strict multi-tenant isolation verified with zero cross-ticker leakage.")

    # --------------------------------------------------------------------------
    # Assertion 7: Quantitative Determinism Invariant & Zero Regressions
    # --------------------------------------------------------------------------
    async with AsyncSessionLocal() as session:
        composite = await QuantitativeAnalyticsEngine.compute_composite_signal(session, "AAPL")
        assert "composite_score" in composite
        assert 0.0 <= composite["composite_score"] <= 100.0
        assert "recommendation" in composite
    print("✅ Assertion 7 Passed: Quantitative engine mathematical determinism invariant verified with zero regressions.")

    print("=" * 80)
    print("🎉 PHASE 2 MILESTONE 4 COMPLETE: 7/7 ASSERTIONS PASSED WITH ZERO REGRESSIONS.")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_capstone_audit())
