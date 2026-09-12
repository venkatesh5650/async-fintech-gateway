export interface IntelligenceResponse {
  ticker: string;
  signal: "BUY" | "SELL" | "HOLD" | "INVALID";
  reasoning?: string;
  analysis_report?: string;
  execution_time_ms: number;
}

// ==================================================
// MULTI-ASSET BATCH ORCHESTRATION CONTRACTS
// ==================================================

export interface BatchAnalysisRequest {
  tickers: string[];
}

export interface BatchJobItem {
  ticker: string;
  job_id: string;
}

export interface BatchJobAcceptedResponse {
  batch_id: string;
  total_assets: number;
  status: "queued" | "processing" | "completed" | "failed";
  jobs: BatchJobItem[];
  message: string;
}

export interface BatchAssetStatus {
  ticker: string;
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  result?: IntelligenceResponse;
  error?: string;
  server_timestamp?: number;
}

// ==================================================
// LIVE JOB AUDIT REGISTRY TYPE CONTRACTS
// ==================================================

export interface JobAuditEntry {
  job_id: string;
  ticker: string;
  status: "processing" | "completed" | "failed" | string;
  batch_id?: string;
  age_seconds: number;
  signal?: "BUY" | "SELL" | "HOLD" | "INVALID";
  execution_time_ms?: number;
}

export interface SystemAuditResponse {
  total_active_jobs: number;
  processing: number;
  completed: number;
  failed: number;
  jobs: JobAuditEntry[];
  audit_timestamp_ms: number;
}

