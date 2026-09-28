"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { DocumentIngestResponse, TickerDocumentMeta } from "@/types/api";
import { EmbeddingProgressBar } from "./EmbeddingProgressBar";

const DEFAULT_TICKERS = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMD", "META"];
const DOC_TYPES = ["10-K", "10-Q", "8-K", "RESEARCH"];

export function DocumentUploadPanel({ initialTicker = "AAPL" }: { initialTicker?: string }) {
  const [ticker, setTicker] = useState<string>(initialTicker.toUpperCase());
  const [docType, setDocType] = useState<string>("10-K");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [lastIngest, setLastIngest] = useState<DocumentIngestResponse | null>(null);
  const [existingDocs, setExistingDocs] = useState<TickerDocumentMeta[]>([]);
  const [expandedChunk, setExpandedChunk] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchExistingDocs = useCallback(async (sym: string) => {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(sym)}`);
      if (res.ok) {
        const json = await res.json();
        setExistingDocs(json.documents || []);
      }
    } catch {
      // Degrade gracefully
    }
  }, []);

  useEffect(() => {
    fetchExistingDocs(ticker);
  }, [ticker, fetchExistingDocs]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith(".pdf")) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError("Only PDF document files are supported.");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.name.toLowerCase().endsWith(".pdf")) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError("Only PDF document files are supported.");
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a valid PDF file to upload.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(15);
    setError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("ticker", ticker);
    formData.append("doc_type", docType);

    const progressTimer = setInterval(() => {
      setUploadProgress((prev) => (prev < 85 ? prev + 12 : prev));
    }, 180);

    try {
      const res = await fetch("/api/documents/ingest", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressTimer);
      setUploadProgress(100);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Ingestion failed (${res.status})`);
      }

      const data: DocumentIngestResponse = await res.json();
      setLastIngest(data);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchExistingDocs(ticker);
    } catch (err: any) {
      setError(err?.message || "Failed to parse and chunk document.");
    } finally {
      clearInterval(progressTimer);
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 backdrop-blur-md shadow-2xl text-slate-200 font-mono space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
          <div>
            <h3 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
              Document Ingestion & Chunking Pipeline
            </h3>
            <span className="text-[11px] text-slate-500 block">
              Sliding-window token chunker (512 tokens / 50 overlap) with page boundary indexing.
            </span>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center space-x-3 text-xs">
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            className="bg-slate-950 border border-slate-700 text-cyan-300 font-bold px-3 py-1.5 rounded focus:outline-none focus:border-cyan-500"
          >
            {DEFAULT_TICKERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-purple-300 font-bold px-3 py-1.5 rounded focus:outline-none focus:border-purple-500"
          >
            {DOC_TYPES.map((dt) => (
              <option key={dt} value={dt}>
                {dt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-cyan-400 bg-cyan-950/20 shadow-[0_0_20px_rgba(6,182,212,0.15)]"
            : selectedFile
            ? "border-emerald-500/60 bg-emerald-950/10"
            : "border-slate-800 hover:border-slate-700 bg-slate-950/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="space-y-2">
          <div className="text-2xl">{selectedFile ? "📄" : "📑"}</div>
          <div className="text-xs font-semibold text-slate-300">
            {selectedFile ? (
              <span className="text-emerald-400 font-bold">
                {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </span>
            ) : (
              <span>Drag & drop financial PDF or click to browse</span>
            )}
          </div>
          <p className="text-[10px] text-slate-500">
            Supports SEC 10-K, 10-Q, 8-K filings and Institutional Research PDFs up to 25MB.
          </p>
        </div>
      </div>

      {/* Action Controls */}
      {selectedFile && (
        <div className="flex items-center justify-between bg-slate-950/80 p-3 rounded-lg border border-slate-800">
          <div className="text-xs text-slate-400">
            Ready to parse for <strong className="text-cyan-400">{ticker}</strong> [{docType}]
          </div>
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded transition-all disabled:opacity-50 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
          >
            {isUploading ? `Parsing Document (${uploadProgress}%)...` : "⚡ Ingest & Chunk Document"}
          </button>
        </div>
      )}

      {/* Upload Progress Bar */}
      {isUploading && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>Executing pypdf binary extraction & sliding-window segmentation...</span>
            <span className="tabular-nums">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
            <div
              className="bg-cyan-400 h-full transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-3 bg-rose-950/30 border border-rose-800/60 rounded-lg text-rose-300 text-xs flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Parse Results Preview */}
      {lastIngest && (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <span className="text-emerald-400">✓</span> Ingestion Summary — {lastIngest.filename}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              Trace: {lastIngest.trace_id.slice(0, 8)}...
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-500 uppercase">Pages Extracted</div>
              <div className="text-base font-bold text-slate-100 mt-0.5">
                {lastIngest.total_pages}
              </div>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-500 uppercase">Total Chunks</div>
              <div className="text-base font-bold text-cyan-300 mt-0.5">
                {lastIngest.total_chunks}
              </div>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-500 uppercase">Estimated Tokens</div>
              <div className="text-base font-bold text-purple-300 mt-0.5">
                {lastIngest.total_tokens.toLocaleString()}
              </div>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-500 uppercase">Window Specs</div>
              <div className="text-xs font-bold text-emerald-400 mt-1">
                512 / 50 Overlap
              </div>
            </div>
          </div>

          {/* Vector Embeddings Trigger & Progress Card */}
          <EmbeddingProgressBar
            documentId={lastIngest.document_id}
            ticker={lastIngest.ticker}
            totalChunks={lastIngest.total_chunks}
            onEmbeddingComplete={() => fetchExistingDocs(ticker)}
          />

          {/* Chunk Preview Accordion */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-slate-400 block">
              Chunk Stream Preview (First {lastIngest.chunks_preview.length} chunks)
            </span>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {lastIngest.chunks_preview.map((chunk) => {
                const isOpened = expandedChunk === chunk.chunk_id;
                return (
                  <div
                    key={chunk.chunk_id}
                    className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs space-y-2"
                  >
                    <div
                      onClick={() => setExpandedChunk(isOpened ? null : chunk.chunk_id)}
                      className="flex items-center justify-between cursor-pointer select-none"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="bg-cyan-500/20 text-cyan-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-cyan-500/30">
                          #{chunk.chunk_index}
                        </span>
                        <span className="text-slate-300 font-medium text-[11px]">
                          Page {chunk.page_number} (Pages: {chunk.page_span.join(", ")})
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {chunk.token_count} tokens
                        </span>
                      </div>
                      <span className="text-slate-500 text-[10px]">
                        {isOpened ? "▲ collapse" : "▼ inspect"}
                      </span>
                    </div>

                    {isOpened && (
                      <div className="p-2.5 bg-slate-900/90 rounded border border-slate-800 text-[11px] text-slate-300 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {chunk.content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Previously Ingested Documents */}
      {existingDocs.length > 0 && (
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <span className="text-[11px] font-semibold text-slate-400 block">
            Ingested Filings for {ticker} ({existingDocs.length})
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {existingDocs.map((doc) => (
              <div
                key={doc.document_id}
                className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-slate-200 text-[11px] truncate max-w-[180px]">
                    {doc.filename}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {doc.doc_type} · {doc.total_pages} pages · {doc.total_chunks} chunks
                  </div>
                </div>
                <span className="text-[10px] text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
                  INDEXED
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentUploadPanel;
