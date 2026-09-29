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

// ==================================================
// QUANTITATIVE TIME-SERIES ANALYTICS CONTRACTS
// ==================================================

export interface BollingerBandsData {
  upper: number | null;
  middle: number | null;
  lower: number | null;
  bandwidth_pct: number | null;
  status: "ABOVE_UPPER" | "BELOW_LOWER" | "WITHIN_BANDS" | "INSUFFICIENT_DATA" | string;
}

export interface IndicatorsData {
  sma_10: number | null;
  sma_50: number | null;
  sma_200: number | null;
  ema_14: number | null;
  vwap: number | null;
  rsi_14: number | null;
  rsi_status: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL" | "INSUFFICIENT_DATA" | string;
  bollinger_bands: BollingerBandsData;
}

export interface CrossoverSignalData {
  status:
    | "BULLISH_GOLDEN_CROSS"
    | "BEARISH_DEATH_CROSS"
    | "BULLISH_SHORT_CROSS"
    | "BEARISH_SHORT_CROSS"
    | "NEUTRAL"
    | "INSUFFICIENT_DATA"
    | string;
  strength: "STRONG" | "MODERATE" | "NEUTRAL" | string;
  description: string;
}

export interface TickerAnalyticsResponse {
  symbol: string;
  calculated_at: string | null;
  data_points_analyzed: number;
  current_price: number | null;
  indicators: IndicatorsData;
  crossover_signal: CrossoverSignalData;
  trace_id: string;
}

export interface VolatilityMetricsResponse {
  symbol: string;
  calculated_at: string | null;
  data_points_analyzed: number;
  volatility_30d_pct: number | null;
  sharpe_ratio: number | null;
  max_drawdown_pct: number | null;
  risk_level: "LOW_RISK" | "MODERATE_RISK" | "HIGH_RISK" | string;
  sharpe_rating: "EXCELLENT" | "GOOD" | "SUBPAR" | "NEGATIVE" | string;
  trace_id: string;
}

export interface CompositeComponentDetail {
  score: number;
  weight: number;
  signal?: string;
  val?: number | null;
  status?: string;
  rating?: string;
}

export interface CompositeComponents {
  sma_crossover: CompositeComponentDetail;
  rsi_14: CompositeComponentDetail;
  bollinger_bands: CompositeComponentDetail;
  sharpe_ratio: CompositeComponentDetail;
}

export interface CompositeSignalResponse {
  symbol: string;
  calculated_at: string | null;
  data_points_analyzed: number;
  composite_score: number;
  recommendation: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL" | string;
  components: CompositeComponents;
  trace_id: string;
}

export interface CorrelationMatrixResponse {
  symbols: string[];
  matrix: Record<string, Record<string, number | null>>;
  days_analyzed: number;
  data_points_analyzed: number;
  trace_id: string;
}

export interface DocumentChunkItem {
  chunk_id: string;
  chunk_index: number;
  ticker: string;
  source_file: string;
  doc_type: string;
  page_number: number;
  page_span: number[];
  content: string;
  token_count: number;
  char_count: number;
}

export interface DocumentIngestResponse {
  document_id: string;
  ticker: string;
  filename: string;
  doc_type: string;
  total_pages: number;
  total_chunks: number;
  total_tokens: number;
  chunks_preview: DocumentChunkItem[];
  trace_id: string;
}

export interface TickerDocumentMeta {
  document_id: string;
  ticker: string;
  filename: string;
  doc_type: string;
  total_pages: number;
  total_chunks: number;
  total_tokens: number;
  trace_id: string;
}

export interface TickerDocumentsResponse {
  ticker: string;
  total_documents: number;
  documents: TickerDocumentMeta[];
}
export interface EmbeddingJobResponse {
  document_id: string;
  ticker: string;
  chunks_embedded: number;
  embedding_dim: number;
  latency_ms: number;
  duration_ms?: number;
  status: string;
  trace_id?: string;
}

export interface EmbeddingProgressResponse {
  document_id: string;
  ticker: string;
  total_chunks: number;
  embedded_chunks: number;
  percentage: number;
  status: string;
  embedding_dim: number;
}

export interface DocumentSearchResultItem {
  chunk_id: string;
  document_id: string;
  ticker: string;
  source_file: string;
  doc_type: string;
  chunk_index: number;
  page_number: number;
  content: string;
  token_count: number;
  vector_similarity: number;
  lexical_overlap: number;
  similarity_score: number;
}

export interface DocumentSearchResponse {
  ticker: string;
  query: string;
  total_results: number;
  results: DocumentSearchResultItem[];
  trace_id: string;
}

export interface CitationItem {
  citation_ref: string;
  doc_type: string;
  source_file: string;
  page_number: number;
  similarity_score: number;
  excerpt: string;
}

export interface RAGContextResponse {
  ticker: string;
  rag_injected: boolean;
  total_citations: number;
  citations: CitationItem[];
  rag_context: DocumentSearchResultItem[];
  trace_id: string;
}

export interface LoadTestEndpointMetric {
  endpoint: string;
  method: string;
  request_count: number;
  success_count: number;
  failure_count: number;
  p50_ms: number;
  p90_ms: number;
  p95_ms: number;
  p99_ms: number;
  avg_latency_ms: number;
}

export interface LoadTestReport {
  run_id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | string;
  concurrency: number;
  duration_seconds: number;
  total_requests: number;
  total_success: number;
  total_failures: number;
  requests_per_second: number;
  failure_rate_pct: number;
  latency_p50_ms: number;
  latency_p90_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  latency_min_ms: number;
  latency_max_ms: number;
  endpoint_breakdown: LoadTestEndpointMetric[];
  timestamp_iso: string;
  trace_id: string;
}

export interface LoadTestRequest {
  concurrency?: number;
  duration_seconds?: number;
  target_endpoints?: string[];
}

export interface ConnectionPoolStatus {
  pool_size: number;
  max_overflow: number;
  total_capacity: number;
  checked_in: number;
  checked_out: number;
  overflow_active: number;
  saturation_pct: number;
  is_exhausted: boolean;
  avg_checkout_latency_ms: number;
  timestamp_iso: string;
  trace_id: string;
}

export interface ConnectionPoolStressRequest {
  concurrency?: number;
  hold_duration_seconds?: number;
}

export interface ConnectionPoolStressReport {
  run_id: string;
  status: "COMPLETED" | "FAILED" | string;
  requested_connections: number;
  acquired_connections: number;
  failed_connections: number;
  peak_saturation_pct: number;
  avg_queue_wait_ms: number;
  max_queue_wait_ms: number;
  recovery_time_ms: number;
  pool_exhausted: boolean;
  timestamp_iso: string;
  trace_id: string;
}

export interface RedisMemoryStatus {
  used_memory_mb: number;
  peak_memory_mb: number;
  allocated_limit_mb: number;
  memory_utilization_pct: number;
  evicted_keys_count: number;
  expired_keys_count: number;
  fragmentation_ratio: number;
  total_tracked_keys: number;
  pressure_status: "HEALTHY" | "ELEVATED" | "CRITICAL" | string;
  timestamp_iso: string;
  trace_id: string;
}

export interface RedisMemoryPressureRequest {
  target_fill_mb?: number;
  key_count?: number;
  ttl_seconds?: number;
}

export interface RedisMemoryPressureReport {
  run_id: string;
  status: "COMPLETED" | "FAILED" | string;
  keys_generated: number;
  memory_before_mb: number;
  memory_peak_mb: number;
  memory_after_mb: number;
  delta_bytes: number;
  eviction_detected: boolean;
  graceful_degradation_verified: boolean;
  timestamp_iso: string;
  trace_id: string;
}

export interface EventLoopStatus {
  current_lag_ms: number;
  avg_lag_ms: number;
  p95_lag_ms: number;
  max_lag_ms: number;
  blocking_events_count: number;
  is_starved: boolean;
  sample_count: number;
  recent_samples_ms: number[];
  status: "HEALTHY" | "ELEVATED" | "STARVED" | string;
  timestamp_iso: string;
  trace_id: string;
}

export interface EventLoopLagSimulationRequest {
  block_duration_ms?: number;
  simulation_type?: "cpu_burn" | "sync_sleep" | string;
}

export interface EventLoopLagSimulationReport {
  run_id: string;
  status: "COMPLETED" | "FAILED" | string;
  target_block_ms: number;
  measured_lag_ms: number;
  recovery_time_ms: number;
  detected_by_monitor: boolean;
  timestamp_iso: string;
  trace_id: string;
}

export interface WorkerChaosSimulationRequest {
  orphaned_message_count?: number;
  min_idle_time_ms?: number;
  consumer_dead_name?: string;
  consumer_recovery_name?: string;
}

export interface WorkerChaosRecoveryReport {
  run_id: string;
  status: "COMPLETED" | "FAILED" | string;
  stream_name: string;
  group_name: string;
  orphaned_message_ids: string[];
  claimed_message_ids: string[];
  recovery_time_ms: number;
  pel_cleared: boolean;
  sla_met: boolean;
  timestamp_iso: string;
  trace_id: string;
}

export interface ChaosSystemOverview {
  load_testing_status: string;
  connection_pool_status: string;
  redis_memory_status: string;
  event_loop_status: string;
  worker_recovery_status: string;
  resilience_score_pct: number;
  timestamp_iso: string;
  trace_id: string;
}




