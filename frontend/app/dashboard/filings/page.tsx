"use client";

import { useState } from "react";
import { DocumentLibraryPanel } from "@/components/DocumentLibraryPanel";
import { DocumentSearchPanel } from "@/components/DocumentSearchPanel";
import { DocumentUploadPanel } from "@/components/DocumentUploadPanel";
import { RAGContextViewer } from "@/components/RAGContextViewer";

type FilingsTab = "library" | "search" | "citations" | "upload";

const TABS: { id: FilingsTab; label: string }[] = [
  { id: "library", label: "Library" },
  { id: "search", label: "Search" },
  { id: "citations", label: "Citations" },
  { id: "upload", label: "Upload" },
];

export default function FilingsPage() {
  const [tab, setTab] = useState<FilingsTab>("library");
  const [ticker, setTicker] = useState("AAPL");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">Filings</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          SEC library, semantic search, and document upload. A stock workspace
          still keeps filings for the open ticker.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-800">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`shrink-0 px-3 py-2 text-sm ${
              tab === item.id
                ? "border-b-2 border-cyan-400 text-slate-50"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "library" && (
        <DocumentLibraryPanel
          onNavigateToSearch={(symbol) => {
            setTicker(symbol);
            setTab("search");
          }}
          onNavigateToRAG={(symbol) => {
            setTicker(symbol);
            setTab("citations");
          }}
        />
      )}
      {tab === "search" && <DocumentSearchPanel key={`search-${ticker}`} initialTicker={ticker} />}
      {tab === "citations" && <RAGContextViewer key={`rag-${ticker}`} initialTicker={ticker} />}
      {tab === "upload" && <DocumentUploadPanel key={`upload-${ticker}`} initialTicker={ticker} />}
    </div>
  );
}
