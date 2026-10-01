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

export interface RegressionAssertionDetail {
  assertion_number: number;
  title: string;
  passed: boolean;
  details?: string;
}

export interface RegressionSuiteReport {
  suite_id: string;
  suite_name: string;
  status: "PASSED" | "FAILED" | string;
  assertions_passed: number;
  total_assertions: number;
  duration_ms: number;
  assertions: RegressionAssertionDetail[];
}

export interface MasterRegressionReport {
  run_id: string;
  status: "PASSED" | "FAILED" | string;
  total_suites: number;
  suites_passed: number;
  total_assertions: number;
  assertions_passed: number;
  pass_rate_pct: number;
  total_duration_ms: number;
  timestamp_iso: string;
  trace_id: string;
  suites: RegressionSuiteReport[];
}

export interface ArchitectureNode {
  id: string;
  name: string;
  subsystem: string;
  tech_stack: string;
  role: string;
  protocol: string;
  latency_sla_ms: number;
}

export interface ArchitectureEdge {
  source: string;
  target: string;
  protocol: "HTTP" | "WS" | "REDIS_STREAM" | "SQL" | "IPC" | string;
  description: string;
  is_async: boolean;
}

export interface ArchitectureSubsystem {
  id: string;
  title: string;
  description: string;
  nodes: ArchitectureNode[];
}

export interface SystemArchitectureTopology {
  system_name: string;
  version: string;
  status: string;
  subsystems: ArchitectureSubsystem[];
  edges: ArchitectureEdge[];
  mermaid_diagram: string;
  timestamp_iso: string;
  trace_id: string;
}

export interface CodeQualityCheckItem {
  check_name: string;
  tool: "ruff" | "ast" | "file_scanner" | string;
  status: "PASSED" | "WARNING" | "FAILED";
  issues_found: number;
  details: string[];
  duration_ms: number;
}

export interface CodeQualityReport {
  run_id: string;
  status: "PASSED" | "FAILED";
  total_checks: number;
  passed_checks: number;
  total_files_scanned: number;
  total_lines_of_code: number;
  total_issues: number;
  linter_clean: boolean;
  formatter_clean: boolean;
  checks: CodeQualityCheckItem[];
  timestamp_iso: string;
  trace_id: string;
}

export interface OpenApiTag {
  name: string;
  description?: string;
}

export interface OpenApiResponse {
  description: string;
  content?: Record<string, { schema?: any; example?: any }>;
}

export interface OpenApiParameter {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  required?: boolean;
  description?: string;
  schema?: any;
}

export interface OpenApiOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: any; example?: any }>;
  };
  responses: Record<string, OpenApiResponse>;
}

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    summary?: string;
    description?: string;
  };
  tags?: OpenApiTag[];
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
    responses?: Record<string, any>;
  };
}

export interface Phase2MilestoneSummary {
  milestone_id: string;
  title: string;
  status: "SEALED" | "CERTIFIED" | string;
  days_covered: string;
  assertions_count: number;
  audit_suite: string;
  key_features: string[];
}

export interface Phase2CapstoneReport {
  version: string;
  status: string;
  system_name: string;
  total_milestones: number;
  milestones_sealed: number;
  total_assertions: number;
  assertions_passed: number;
  pass_rate_pct: number;
  stream_health_status: string;
  circuit_breaker_state: string;
  cache_layer_status: string;
  rag_embeddings_status: string;
  lines_of_code: number;
  python_modules_count: number;
  milestones: Phase2MilestoneSummary[];
  timestamp_iso: string;
  trace_id: string;
}

export interface ContainerSecurityCheck {
  check_id: string;
  title: string;
  status: "PASSED" | "FAILED" | "WARNING" | string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string;
}

export interface ContainerImageSpec {
  service_name: "api_gateway" | "stream_worker" | string;
  dockerfile_path: string;
  base_image: string;
  is_multistage: boolean;
  is_non_root: boolean;
  user_name: string;
  exposed_ports: number[];
  entrypoint_cmd: string;
  healthcheck_defined: boolean;
  security_score_pct: number;
  security_checks: ContainerSecurityCheck[];
}

export interface DockerIgnoreAudit {
  is_valid: boolean;
  total_rules: number;
  critical_exclusions_present: string[];
  missing_exclusions: string[];
  rules_sample: string[];
}

export interface ContainerSpecReport {
  system_name: string;
  status: "CERTIFIED" | "WARNING" | "FAILED" | string;
  total_services: number;
  compliance_score_pct: number;
  services: ContainerImageSpec[];
  dockerignore_audit: DockerIgnoreAudit;
  timestamp_iso: string;
  trace_id: string;
}

export interface CloudResourceNode {
  id: string;
  name: string;
  resource_type: "web_service" | "background_worker" | "managed_database" | "managed_cache" | string;
  runtime: string;
  plan: string;
  dockerfile_path?: string | null;
  health_check_path?: string | null;
  auto_deploy: boolean;
  env_vars_count: number;
  status: "CONFIGURED" | "ACTIVE" | "HEALTHY" | string;
}

export interface CloudDependencyEdge {
  source_id: string;
  target_id: string;
  protocol: "HTTP" | "REDIS_STREAM" | "SQL" | "IPC" | string;
  purpose: string;
  is_critical: boolean;
}

export interface CloudTopologyReport {
  system_name: string;
  version: string;
  environment: string;
  iac_spec_path: string;
  total_services: number;
  total_datastores: number;
  total_edges: number;
  nodes: CloudResourceNode[];
  edges: CloudDependencyEdge[];
  raw_yaml_spec: string;
  timestamp_iso: string;
  trace_id: string;
}

export interface SubsystemProbe {
  name: string;
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | string;
  latency_ms: number;
  is_critical: boolean;
  details?: string | null;
}

export interface LivenessProbeResult {
  status: "HEALTHY" | "UNHEALTHY" | string;
  uptime_seconds: number;
  event_loop_healthy: boolean;
  timestamp_iso: string;
}

export interface ReadinessProbeResult {
  status: "READY" | "NOT_READY" | string;
  overall_healthy: boolean;
  subsystems: SubsystemProbe[];
  total_latency_ms: number;
  timestamp_iso: string;
}

export interface StartupProbeResult {
  status: "INITIALIZED" | "IN_PROGRESS" | "FAILED" | string;
  schema_ready: boolean;
  migrations_current: boolean;
  tables_found: string[];
  timestamp_iso: string;
}

export interface TieredHealthMatrixReport {
  system_name: string;
  overall_status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | string;
  liveness: LivenessProbeResult;
  readiness: ReadinessProbeResult;
  startup: StartupProbeResult;
  timestamp_iso: string;
  trace_id: string;
}

export interface SecurityCheckItem {
  name: string;
  category: "SECRETS" | "DATABASE" | "CORS" | "TRANSPORT" | "COMPUTE" | string;
  status: "PASS" | "WARN" | "FAIL" | string;
  description: string;
  remediation?: string | null;
}

export interface SecretRedactionItem {
  key_name: string;
  is_configured: boolean;
  masked_value: string;
  entropy_bits: number;
  status: "SECURE" | "DEFAULT_WARNING" | "UNCONFIGURED" | string;
}

export interface EnvironmentAuditReport {
  system_name: string;
  profile: "DEVELOPMENT" | "STAGING" | "PRODUCTION" | string;
  compliance_score_pct: number;
  status: "CERTIFIED" | "REQUIRES_HARDENING" | "NON_COMPLIANT" | string;
  total_checks_passed: number;
  total_checks_count: number;
  checks: SecurityCheckItem[];
  redacted_secrets: SecretRedactionItem[];
  allowed_origins: string[];
  ssl_required: boolean;
  timestamp_iso: string;
  trace_id: string;
}

export interface MigrationStatusReport {
  status: "SYNCHRONIZED" | "PARTIAL" | "FAILED" | string;
  tables_verified: string[];
  pgvector_extension_ready: boolean;
  total_tables: number;
  timestamp_iso: string;
  trace_id: string;
}

export interface TickerSeedSummary {
  symbol: string;
  company_name: string;
  candles_count: number;
  signals_count: number;
  rag_chunks_count: number;
  latest_candle_date?: string | null;
  status: "SEEDED" | "EMPTY" | "INCOMPLETE" | string;
}

export interface SeedStatusReport {
  system_name: string;
  is_seeded: boolean;
  total_tickers: number;
  total_candles: number;
  total_signals: number;
  total_rag_chunks: number;
  tickers: TickerSeedSummary[];
  timestamp_iso: string;
  trace_id: string;
}

export interface SeedExecutionRequest {
  tickers?: string[];
  days_history?: number;
  seed_rag_passages?: boolean;
  force_refresh?: boolean;
}

export interface SeedExecutionResponse {
  run_id: string;
  status: "COMPLETED" | "FAILED" | string;
  seeded_tickers_count: number;
  total_candles_inserted: number;
  total_signals_inserted: number;
  total_chunks_inserted: number;
  duration_ms: number;
  tickers: string[];
  timestamp_iso: string;
  trace_id: string;
}

// ==================================================
// SPEC-TELEMETRY-METRICS: PROMETHEUS METRIC EXPORTERS & TELEMETRY TYPES
// ==================================================

export interface GoldenSignalsMetrics {
  throughput_rps: number;
  total_requests: number;
  error_requests: number;
  error_rate_pct: number;
  p50_latency_ms: number;
  p90_latency_ms: number;
  p99_latency_ms: number;
  event_loop_lag_ms: number;
}

export interface CacheTelemetryMetrics {
  hits: number;
  misses: number;
  hit_rate_pct: number;
}

export interface DbPoolTelemetryMetrics {
  active_connections: number;
  idle_connections: number;
  max_connections: number;
}

export interface PrometheusSampleItem {
  name: string;
  type: string;
  help: string;
  labels: Record<string, string>;
  value: number;
}

export interface MetricSummaryReport {
  golden_signals: GoldenSignalsMetrics;
  stream_lag: Record<string, number>;
  cache_telemetry: CacheTelemetryMetrics;
  circuit_breaker_status: Record<string, string>;
  db_pool_status: DbPoolTelemetryMetrics;
  active_metrics_count: number;
  samples: PrometheusSampleItem[];
  timestamp_iso: string;
  trace_id: string;
}

export interface TrafficSimulationRequest {
  count?: number;
}

export interface TrafficSimulationResponse {
  simulated_requests: number;
  status: "SUCCESS" | "FAILED" | string;
  message: string;
  timestamp_iso: string;
  trace_id: string;
}

// ==================================================
// SPEC-GRAFANA-OBSERVABILITY: GRAFANA DASHBOARD & SLI/SLO TYPES
// ==================================================

export interface GrafanaPanelSpec {
  id: number;
  title: string;
  type: string;
  gridPos: { h: number; w: number; x: number; y: number };
  targets: Array<{ expr: string; legendFormat?: string; refId?: string }>;
  options: Record<string, any>;
}

export interface GrafanaDashboardSpec {
  title: string;
  uid: string;
  description: string;
  tags: string[];
  timezone: string;
  schemaVersion: number;
  version: number;
  refresh: string;
  time: Record<string, string>;
  panels: GrafanaPanelSpec[];
  timestamp_iso: string;
  trace_id: string;
}

export interface PrometheusAlertRule {
  alert: string;
  expr: string;
  for: string;
  severity: "CRITICAL" | "WARNING" | "INFO" | string;
  summary: string;
  description: string;
  action: string;
}

export interface SloItem {
  name: string;
  target: string;
  current_value: string;
  error_budget_remaining_pct: number;
  burn_rate_1h: number;
  status: "COMPLIANT" | "WARNING" | "BREACHED" | string;
  description: string;
}

export interface SloStatusReport {
  overall_compliance_score: number;
  active_slos_count: number;
  slos: SloItem[];
  alert_rules_count: number;
  alert_rules: PrometheusAlertRule[];
  timestamp_iso: string;
  trace_id: string;
}

export interface AlertDispatchTestRequest {
  alert_name?: string;
  severity?: string;
  message?: string;
}

export interface AlertDispatchTestResponse {
  status: "DISPATCHED" | "FAILED" | string;
  alert_name: string;
  severity: string;
  message: string;
  dispatched_to: string[];
  timestamp_iso: string;
  trace_id: string;
}

export interface WaterfallSpanItem {
  span_id: string;
  parent_span_id: string | null;
  name: string;
  service: string;
  kind: "SERVER" | "CLIENT" | "INTERNAL" | "PRODUCER" | "CONSUMER" | string;
  status: "OK" | "ERROR" | "SLOW" | string;
  start_time_iso: string;
  end_time_iso: string;
  duration_ms: number;
  relative_offset_ms: number;
  offset_percent: number;
  width_percent: number;
  depth: number;
  is_critical_path: boolean;
  tags: Record<string, string | number | boolean>;
  traceparent: string;
}

export interface TraceWaterfallDetail {
  trace_id: string;
  root_span_name: string;
  service_name: string;
  status: "OK" | "ERROR" | "SLOW" | string;
  total_duration_ms: number;
  critical_path_duration_ms: number;
  span_count: number;
  error_count: number;
  root_start_iso: string;
  root_end_iso: string;
  spans: WaterfallSpanItem[];
  w3c_traceparent: string;
}

export interface TraceSummaryItem {
  trace_id: string;
  root_span_name: string;
  service_name: string;
  status: "OK" | "ERROR" | "SLOW" | string;
  status_code: number;
  duration_ms: number;
  span_count: number;
  error_count: number;
  timestamp_iso: string;
  ticker?: string | null;
  tags: Record<string, string | number | boolean>;
}

export interface TraceQueryResponse {
  total: number;
  traces: TraceSummaryItem[];
  active_trace_id?: string | null;
  timestamp_iso: string;
  trace_id: string;
}

export interface TraceSimulationResponse {
  status: string;
  trace_id: string;
  ticker: string;
  span_count: number;
  total_duration_ms: number;
  waterfall: TraceWaterfallDetail;
}

export interface SecurityHeaderSpec {
  header_name: string;
  directive_value: string;
  category: "TRANSPORT" | "FRAMING" | "CONTENT" | "PERMISSIONS" | string;
  is_compliant: boolean;
  description: string;
}

export interface TlsCertificateSpec {
  domain: string;
  issuer: string;
  tls_version: string;
  cipher_suite: string;
  key_type: string;
  valid_from_iso: string;
  valid_until_iso: string;
  days_until_expiry: number;
  ocsp_stapling_enabled: boolean;
  hsts_preload_ready: boolean;
}

export interface DomainRouteSpec {
  hostname: string;
  target_cluster: string;
  routing_tier: "EDGE_API" | "WEB_APP" | "WEBSOCKET_STREAM" | string;
  port: number;
  protocols: string[];
  rate_limit: string;
}

export interface RateLimitRuleSpec {
  zone_name: string;
  rate_expression: string;
  burst_capacity: number;
  target_tier: string;
}

export interface ProductionIngressSpec {
  ingress_controller: string;
  ssl_grade: string;
  security_score: number;
  certificate: TlsCertificateSpec;
  security_headers: SecurityHeaderSpec[];
  routes: DomainRouteSpec[];
  rate_limits: RateLimitRuleSpec[];
  raw_nginx_config: string;
  timestamp_iso: string;
  trace_id: string;
}

export interface IngressVerificationItem {
  check_name: string;
  category: "TLS" | "HEADERS" | "ROUTING" | "RATELIMIT" | string;
  status: "PASSED" | "WARNING" | "FAILED" | string;
  details: string;
}

export interface IngressVerificationReport {
  status: "CERTIFIED" | "DEGRADED" | "FAILED" | string;
  ssl_grade: string;
  overall_score: number;
  checks_total: number;
  checks_passed: number;
  checkpoints: IngressVerificationItem[];
  timestamp_iso: string;
  trace_id: string;
}

export interface ReadinessCheckItem {
  day: number;
  criterion_name: string;
  subsystem: string;
  status: "CERTIFIED" | "PENDING" | "FAILED" | string;
  details: string;
}

export interface ProductionReadinessReport {
  status: "CERTIFIED_FOR_PRODUCTION" | "DEGRADED" | "FAILED" | string;
  readiness_score: number;
  version: string;
  checks_passed: number;
  checks_total: number;
  criteria: ReadinessCheckItem[];
  timestamp_iso: string;
  trace_id: string;
}

export interface SmokeTestStep {
  step_number: number;
  name: string;
  service: string;
  status: "SUCCESS" | "FAILED" | string;
  duration_ms: number;
  details: string;
}

export interface SmokeTestResult {
  status: "SUCCESS" | "FAILED" | string;
  ticker: string;
  total_duration_ms: number;
  steps_passed: number;
  steps_total: number;
  steps: SmokeTestStep[];
  trace_id: string;
  timestamp_iso: string;
}

export interface GoLiveCertificate {
  certificate_id: string;
  title: string;
  phase: string;
  release_tag: string;
  status: string;
  readiness_percentage: number;
  signed_by: string;
  total_days_certified: number;
  codebase_metrics: Record<string, string | number | boolean>;
  issued_at_iso: string;
  signature_hash: string;
}

// ==============================================================================
// LangGraph Multi-Agent Topology & Dynamic Execution Tracer (SPEC-GRAPH-TOPOLOGY)
// ==============================================================================

export interface GraphNodeSpec {
  id: string;
  label: string;
  node_type: "INTELLIGENCE" | "TOOL_EXECUTION" | "SYNTHESIS" | "QUALITY_GATE" | "TERMINATION" | string;
  category: "AGENT" | "TOOL" | "REPORTING" | "GATEKEEPER" | "SYSTEM" | string;
  description: string;
  tools_bound: string[];
  position_x: number;
  position_y: number;
}

export interface GraphEdgeSpec {
  id: string;
  source: string;
  target: string;
  edge_type: "DIRECT" | "CONDITIONAL" | string;
  label?: string | null;
  condition_expr?: string | null;
  animated: boolean;
}

export interface GraphStateChannelSpec {
  channel_name: string;
  type_name: string;
  reducer: string;
  description: string;
  example_value?: string | null;
}

export interface GraphTopologyResponse {
  graph_id: string;
  version: string;
  entry_point: string;
  terminal_nodes: string[];
  nodes: GraphNodeSpec[];
  edges: GraphEdgeSpec[];
  state_channels: GraphStateChannelSpec[];
  timestamp_iso: string;
  trace_id: string;
}

export interface LLMNodeTokenCostSpec {
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_cost_usd: number;
  completion_cost_usd: number;
  total_cost_usd: number;
  cache_hit: boolean;
}

export interface AgentNodeExecutionStep {
  step_number: number;
  node_id: string;
  node_label: string;
  status: "SUCCESS" | "FAILED" | "RETRY" | string;
  duration_ms: number;
  input_state_summary: Record<string, unknown>;
  output_state_delta: Record<string, unknown>;
  messages_added_count: number;
  tokens_estimated: number;
  token_cost?: LLMNodeTokenCostSpec | null;
  timestamp_iso: string;
}

export interface GraphExecutionTraceResponse {
  execution_id: string;
  ticker: string;
  scenario: "NOMINAL" | "RETRY_LOOP" | "TOOL_EXPEDITION" | "RAG_FAILURE" | string;
  status: "SUCCESS" | "DEGRADED" | "FAILED" | string;
  total_duration_ms: number;
  total_tokens_consumed?: number;
  total_cost_usd?: number;
  final_signal: "BUY" | "SELL" | "HOLD" | "INVALID" | string;
  steps_count: number;
  steps: AgentNodeExecutionStep[];
  trace_id: string;
  timestamp_iso: string;
}

export interface GraphSimulationRequest {
  ticker: string;
  scenario: "NOMINAL" | "RETRY_LOOP" | "TOOL_EXPEDITION" | "RAG_FAILURE" | string;
}

export interface GraphStreamingEvent {
  event_type: "step_start" | "step_complete" | "trace_complete" | string;
  execution_id: string;
  step_number: number;
  node_id: string;
  node_label: string;
  status: string;
  duration_ms: number;
  token_cost?: LLMNodeTokenCostSpec | null;
  state_delta: Record<string, unknown>;
  timestamp_iso: string;
}

export interface AgentTokenSummaryReport {
  total_runs_analyzed: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_tokens_per_run: number;
  avg_cost_per_run_usd: number;
  model_distribution: Record<string, number>;
  by_node: Record<string, LLMNodeTokenCostSpec>;
  timestamp_iso: string;
  trace_id: string;
}
