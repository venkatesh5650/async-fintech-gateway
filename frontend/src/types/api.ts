export interface IntelligenceResponse {
  ticker: string;
  signal: "BUY" | "SELL" | "HOLD" | "INVALID";
  reasoning?: string;
  analysis_report?: string;
  execution_time_ms: number;
}

export interface CachedIntelligenceResult extends IntelligenceResponse {
  cache_hit: boolean;
  source: "CACHE" | "DATABASE" | string;
  prime_origin?: string;
  primed_at?: string | null;
  cache_ttl_remaining?: number;
  data_source_latency_ms?: number;
  total_request_latency_ms?: number;
  mutex_contention?: boolean;
  lock_wait_ms?: number;
  span_id?: string;
  trace_id?: string;
}

// Immediate response returned when a single job is accepted (HTTP 202)
export interface JobAcceptedResponse {
  job_id: string;
  trace_id?: string;
  status: string;
  message: string;
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
  trace_id?: string;
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
  trace_id?: string;
  cache_primed?: boolean;
  primed_at?: string | null;
  cache_ttl_remaining?: number | null;
}

export interface SystemAuditResponse {
  total_active_jobs: number;
  processing: number;
  completed: number;
  failed: number;
  jobs: JobAuditEntry[];
  audit_timestamp_ms: number;
}

// ==================================================
// DEAD-LETTER QUEUE (DLQ) TYPE CONTRACTS
// ==================================================

export interface DeadLetterJobEntry {
  dlq_id: string;
  original_message_id: string;
  job_id: string;
  ticker: string;
  batch_id?: string | null;
  trace_id?: string | null;
  delivery_count: number;
  error_reason: string;
  quarantined_at: number;
}

export interface DeadLetterRegistryResponse {
  total_quarantined: number;
  entries: DeadLetterJobEntry[];
  audit_timestamp_ms: number;
}

// ==================================================
// DISTRIBUTED TRACE WATERFALL CONTRACTS
// ==================================================

export interface TraceSpanEntry {
  stage:
    | "INGEST_AND_STREAM_ENQUEUE"
    | "STREAM_QUEUE_WAIT"
    | "WORKER_MULTI_AGENT_EXECUTION"
    | "BROADCAST_AND_PERSIST"
    | string;
  span_id?: string | null;
  duration_ms?: number | null;
  status: "COMPLETED" | "FAILED" | "QUARANTINED" | string;
}

export interface TraceWaterfallResponse {
  trace_id: string;
  job_id: string;
  ticker: string;
  status: string;
  total_journey_ms: number;
  spans: TraceSpanEntry[];
  server_timestamp_ms: number;
}

// ==================================================
// STREAM HEALTH & DYNAMIC CONCURRENCY CONTRACTS
// ==================================================

export type StreamHealthStatus = "HEALTHY" | "ACTIVE" | "DEGRADED" | "CRITICAL";

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerTelemetrySnapshot {
  circuit_state: CircuitBreakerState;
  consecutive_rate_limits: number;
  failure_threshold: number;
  total_trips: number;
  cooldown_period_sec: number;
  cooldown_remaining_sec: number;
  last_failure_reason?: string | null;
  server_timestamp_ms: number;
}

export interface StreamHealthResponse {
  stream_name: string;
  consumer_group: string;
  stream_len: number;
  lag: number;
  pel_count: number;
  consumer_count: number;
  last_delivered_id: string;
  health_status: StreamHealthStatus;
  circuit_breaker?: CircuitBreakerTelemetrySnapshot;
  audit_timestamp_ms: number;
}

export interface CacheHealthResponse {
  hit_count: number;
  miss_count: number;
  total_requests: number;
  hit_ratio_pct: number;
  contention_count: number;
  total_cached_keys: number;
  memory_used_mb: number;
  memory_peak_mb: number;
  server_timestamp_ms: number;
}

export interface CacheInspectorResponse {
  ticker: string;
  is_cached: boolean;
  ttl_remaining_seconds: number;
  ttl_total_seconds: number;
  payload_size_bytes: number;
  prime_origin?: string | null;
  trace_id?: string | null;
  primed_at_iso?: string | null;
  raw_payload_preview?: Record<string, any> | null;
  server_timestamp_ms: number;
}

