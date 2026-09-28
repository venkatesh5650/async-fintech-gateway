import json
import os
import uuid
import time
import logging
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Request
import redis.asyncio as redis
from sqlalchemy import select, delete

from app.core.document_parser import parse_and_chunk_pdf
from app.core.embedder import generate_batch_embeddings, EMBEDDING_DIM
from app.core.document_search import search_document_chunks
from app.database.database import AsyncSessionLocal
from app.database.models import DocumentChunk
from app.database.schemas import (
    DocumentIngestResponse,
    DocumentChunkItem,
    EmbeddingJobResponse,
    EmbeddingProgressResponse,
    DocumentSearchResponse,
    DocumentSearchResultItem,
)
from app.core.telemetry import generate_trace_id

logger = logging.getLogger("documents_router")

router = APIRouter(prefix="/v1/documents", tags=["Document Ingestion & RAG"])

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
if "redis://redis:" in REDIS_URL and not os.path.exists("/.dockerenv"):
    REDIS_URL = REDIS_URL.replace("redis://redis:", "redis://localhost:")
elif "redis://fintech_redis:" in REDIS_URL:
    REDIS_URL = REDIS_URL.replace("redis://fintech_redis:", "redis://localhost:" if not os.path.exists("/.dockerenv") else "redis://redis:")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

MAX_PDF_SIZE_BYTES = 25 * 1024 * 1024


@router.post("/ingest", response_model=DocumentIngestResponse, status_code=status.HTTP_201_CREATED)
async def ingest_document(
    request: Request,
    file: UploadFile = File(...),
    ticker: str = Form(..., description="Target equity ticker symbol"),
    doc_type: str = Form("10-K", description="Document type: 10-K, 10-Q, 8-K, RESEARCH"),
):
    clean_ticker = ticker.upper().strip()
    if not clean_ticker.isalpha() or not (1 <= len(clean_ticker) <= 5):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticker must be 1-5 alphabetic characters.",
        )

    filename = file.filename or "uploaded_document.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported document format. Only PDF files are supported.",
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supplied file payload is empty.",
        )

    if len(file_bytes) > MAX_PDF_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size ({MAX_PDF_SIZE_BYTES // (1024 * 1024)} MB).",
        )

    trace_id = (
        getattr(request.state, "trace_id", None)
        or getattr(request.state, "request_id", None)
        or request.headers.get("X-Request-ID", generate_trace_id())
    )

    try:
        parsed_result = parse_and_chunk_pdf(
            file_bytes=file_bytes,
            ticker=clean_ticker,
            filename=filename,
            doc_type=doc_type.upper().strip(),
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )
    except Exception as exc:
        logger.error(f"Failed to ingest document for {clean_ticker}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document parsing failed: {str(exc)}",
        )

    doc_id = parsed_result["document_id"]
    chunks = parsed_result["chunks"]

    doc_meta = {
        "document_id": doc_id,
        "ticker": clean_ticker,
        "filename": filename,
        "doc_type": doc_type.upper().strip(),
        "total_pages": parsed_result["total_pages"],
        "total_chunks": parsed_result["total_chunks"],
        "total_tokens": parsed_result["total_tokens"],
        "trace_id": trace_id,
    }

    try:
        await redis_client.set(f"doc:{doc_id}:meta", json.dumps(doc_meta), ex=86400 * 7)
        await redis_client.set(f"doc:{doc_id}:chunks", json.dumps(chunks), ex=86400 * 7)
        await redis_client.sadd(f"docs:ticker:{clean_ticker}", doc_id)
        await redis_client.expire(f"docs:ticker:{clean_ticker}", 86400 * 7)
    except Exception as redis_err:
        logger.warning(f"Transient Redis document persistence warning: {redis_err}")

    preview_chunks = [DocumentChunkItem(**c) for c in chunks[:5]]

    return DocumentIngestResponse(
        document_id=doc_id,
        ticker=clean_ticker,
        filename=filename,
        doc_type=doc_type.upper().strip(),
        total_pages=parsed_result["total_pages"],
        total_chunks=parsed_result["total_chunks"],
        total_tokens=parsed_result["total_tokens"],
        chunks_preview=preview_chunks,
        trace_id=trace_id,
    )


@router.post("/edgar/sync", status_code=status.HTTP_200_OK)
async def sync_edgar_documents(
    request: Request,
    ticker: Optional[str] = Form(None, description="Optional equity ticker to sync (defaults to all)"),
    doc_type: str = Form("10-K", description="Filing type: 10-K or 10-Q"),
):
    from app.workers.edgar_worker import sync_edgar_filings_for_ticker, TRACKED_TICKERS

    trace_id = getattr(request.state, "trace_id", None) or generate_trace_id()
    t0 = time.perf_counter()

    if ticker:
        clean_ticker = ticker.upper().strip()
        result = await sync_edgar_filings_for_ticker(clean_ticker, doc_type)
        synced = [result]
    else:
        synced = []
        for sym in TRACKED_TICKERS:
            res = await sync_edgar_filings_for_ticker(sym, doc_type)
            synced.append(res)

    total_chunks = sum(s["chunks_generated"] for s in synced)
    total_tokens = sum(s["total_tokens"] for s in synced)
    latency_ms = round((time.perf_counter() - t0) * 1000, 2)

    return {
        "status": "COMPLETED",
        "synced_count": len(synced),
        "total_chunks": total_chunks,
        "total_tokens": total_tokens,
        "filings": synced,
        "latency_ms": latency_ms,
        "trace_id": trace_id,
    }


@router.get("/search", response_model=DocumentSearchResponse, status_code=status.HTTP_200_OK)
async def search_documents(
    request: Request,
    ticker: str,
    query: str,
    top_k: int = 5,
    min_similarity: float = 0.0,
):
    clean_ticker = ticker.upper().strip()
    if not clean_ticker.isalpha() or not (1 <= len(clean_ticker) <= 5):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticker must be 1-5 alphabetic characters.",
        )

    if not query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query parameter cannot be empty.",
        )

    trace_id = getattr(request.state, "trace_id", None) or generate_trace_id()

    results = await search_document_chunks(
        ticker=clean_ticker,
        query=query,
        top_k=top_k,
        min_similarity=min_similarity,
    )

    return DocumentSearchResponse(
        ticker=clean_ticker,
        query=query,
        total_results=len(results),
        results=[DocumentSearchResultItem(**r) for r in results],
        trace_id=trace_id,
    )


@router.get("/{ticker}", status_code=status.HTTP_200_OK)
async def list_ticker_documents(ticker: str):
    clean_ticker = ticker.upper().strip()
    try:
        doc_ids = await redis_client.smembers(f"docs:ticker:{clean_ticker}")
    except Exception:
        doc_ids = []

    documents = []
    for d_id in doc_ids:
        raw_meta = await redis_client.get(f"doc:{d_id}:meta")
        if raw_meta:
            try:
                documents.append(json.loads(raw_meta))
            except Exception:
                pass

    return {
        "ticker": clean_ticker,
        "total_documents": len(documents),
        "documents": documents,
    }


@router.post("/{document_id}/embed", response_model=EmbeddingJobResponse, status_code=status.HTTP_200_OK)
async def embed_document_chunks(document_id: str, request: Request):
    t0 = time.perf_counter()
    raw_meta = await redis_client.get(f"doc:{document_id}:meta")
    if not raw_meta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {document_id} not found.",
        )

    doc_meta = json.loads(raw_meta)
    ticker = doc_meta["ticker"]
    trace_id = doc_meta.get("trace_id") or generate_trace_id()

    raw_chunks = await redis_client.get(f"doc:{document_id}:chunks")
    if not raw_chunks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chunks for {document_id} not found in cache.",
        )

    chunks = json.loads(raw_chunks)
    texts = [c["content"] for c in chunks]

    # Batch vectorization
    embeddings = await generate_batch_embeddings(texts, dim=EMBEDDING_DIM)

    # Persist into PostgreSQL document_chunks table
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))

            for chunk, emb in zip(chunks, embeddings):
                record = DocumentChunk(
                    id=chunk["chunk_id"],
                    document_id=document_id,
                    ticker=ticker,
                    source_file=chunk.get("source_file", doc_meta["filename"]),
                    doc_type=chunk.get("doc_type", doc_meta["doc_type"]),
                    chunk_index=chunk["chunk_index"],
                    page_number=chunk["page_number"],
                    content=chunk["content"],
                    token_count=chunk["token_count"],
                    embedding=emb,
                )
                session.add(record)

    doc_meta["status"] = "EMBEDDED"
    doc_meta["embedded_chunks"] = len(chunks)
    doc_meta["embedding_dim"] = EMBEDDING_DIM
    await redis_client.set(f"doc:{document_id}:meta", json.dumps(doc_meta), ex=86400 * 7)

    latency_ms = round((time.perf_counter() - t0) * 1000, 2)

    return EmbeddingJobResponse(
        document_id=document_id,
        ticker=ticker,
        chunks_embedded=len(chunks),
        embedding_dim=EMBEDDING_DIM,
        status="COMPLETED",
        latency_ms=latency_ms,
        trace_id=trace_id,
    )


@router.get("/{document_id}/progress", response_model=EmbeddingProgressResponse, status_code=status.HTTP_200_OK)
async def get_embedding_progress(document_id: str):
    raw_meta = await redis_client.get(f"doc:{document_id}:meta")
    if not raw_meta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {document_id} not found.",
        )

    doc_meta = json.loads(raw_meta)
    total_chunks = int(doc_meta.get("total_chunks", 0))
    is_embedded = doc_meta.get("status") == "EMBEDDED"

    embedded_count = int(doc_meta.get("embedded_chunks", total_chunks if is_embedded else 0))
    percentage = 100.0 if is_embedded else (round((embedded_count / total_chunks * 100.0), 1) if total_chunks > 0 else 0.0)
    current_status = "COMPLETED" if is_embedded else ("EMBEDDING" if embedded_count > 0 else "PARSED")

    return EmbeddingProgressResponse(
        document_id=document_id,
        ticker=doc_meta["ticker"],
        status=current_status,
        total_chunks=total_chunks,
        embedded_chunks=embedded_count,
        percentage=percentage,
    )

