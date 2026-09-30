import io
import uuid
import re
from typing import List, Dict, Any
from pypdf import PdfReader


def estimate_tokens(text: str) -> int:
    return max(1, len(re.findall(r"\w+|[^\w\s]", text)))


def extract_text_from_pdf(file_bytes: bytes) -> List[Dict[str, Any]]:
    if not file_bytes:
        raise ValueError("Empty PDF byte stream provided.")

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception as exc:
        raise ValueError(f"Failed to parse PDF binary payload: {exc}") from exc

    if len(reader.pages) == 0:
        raise ValueError("PDF payload contains zero pages.")

    pages_data = []
    for idx, page in enumerate(reader.pages):
        raw_text = page.extract_text() or ""
        cleaned = re.sub(r"\s+", " ", raw_text).strip()
        pages_data.append(
            {
                "page_number": idx + 1,
                "text": cleaned,
                "char_count": len(cleaned),
            }
        )

    return pages_data


def chunk_document(
    pages: List[Dict[str, Any]],
    ticker: str,
    source_file: str,
    doc_type: str = "10-K",
    target_tokens: int = 512,
    overlap_tokens: int = 50,
) -> List[Dict[str, Any]]:
    ticker_upper = ticker.upper().strip()
    chunks = []
    chunk_idx = 0

    accumulated_words: List[str] = []
    current_pages: set = set()

    for page_entry in pages:
        page_num = page_entry["page_number"]
        page_text = page_entry["text"]
        if not page_text:
            continue

        words = page_text.split()
        for word in words:
            accumulated_words.append(word)
            current_pages.add(page_num)

            if len(accumulated_words) >= target_tokens:
                chunk_text = " ".join(accumulated_words)
                token_count = estimate_tokens(chunk_text)
                sorted_pages = sorted(list(current_pages))

                chunks.append(
                    {
                        "chunk_id": f"{ticker_upper}-{doc_type}-{chunk_idx}-{uuid.uuid4().hex[:8]}",
                        "chunk_index": chunk_idx,
                        "ticker": ticker_upper,
                        "source_file": source_file,
                        "doc_type": doc_type,
                        "page_number": sorted_pages[0] if sorted_pages else page_num,
                        "page_span": sorted_pages,
                        "content": chunk_text,
                        "token_count": token_count,
                        "char_count": len(chunk_text),
                    }
                )
                chunk_idx += 1
                accumulated_words = accumulated_words[len(accumulated_words) - overlap_tokens :]
                current_pages = {page_num}

    if accumulated_words:
        chunk_text = " ".join(accumulated_words)
        token_count = estimate_tokens(chunk_text)
        sorted_pages = sorted(list(current_pages))
        chunks.append(
            {
                "chunk_id": f"{ticker_upper}-{doc_type}-{chunk_idx}-{uuid.uuid4().hex[:8]}",
                "chunk_index": chunk_idx,
                "ticker": ticker_upper,
                "source_file": source_file,
                "doc_type": doc_type,
                "page_number": sorted_pages[0] if sorted_pages else 1,
                "page_span": sorted_pages,
                "content": chunk_text,
                "token_count": token_count,
                "char_count": len(chunk_text),
            }
        )

    return chunks


def parse_and_chunk_pdf(
    file_bytes: bytes,
    ticker: str,
    filename: str,
    doc_type: str = "10-K",
    target_tokens: int = 512,
    overlap_tokens: int = 50,
) -> Dict[str, Any]:
    pages = extract_text_from_pdf(file_bytes)
    total_extracted_chars = sum(p["char_count"] for p in pages)
    if total_extracted_chars == 0:
        raise ValueError("PDF document parsed successfully but contains no extractable text.")

    chunks = chunk_document(
        pages=pages,
        ticker=ticker,
        source_file=filename,
        doc_type=doc_type,
        target_tokens=target_tokens,
        overlap_tokens=overlap_tokens,
    )

    doc_id = f"doc_{ticker.upper()}_{uuid.uuid4().hex[:12]}"
    total_tokens = sum(c["token_count"] for c in chunks)

    return {
        "document_id": doc_id,
        "ticker": ticker.upper(),
        "filename": filename,
        "doc_type": doc_type,
        "total_pages": len(pages),
        "total_chunks": len(chunks),
        "total_tokens": total_tokens,
        "chunks": chunks,
    }
