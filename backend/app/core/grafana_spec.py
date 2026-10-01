"""Enterprise Grafana Dashboard Specifications & SLI/SLO Alert Thresholds.

Provides declarative Grafana Dashboard JSON models, Prometheus alerting
rules specifications (4 Golden Signals), and real-time SRE SLI/SLO
evaluation with error budget consumption and burn rate tracking.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
from app.core.telemetry_metrics import MetricsRegistryManager


class GrafanaSpecManager:
    """Institutional Grafana Dashboard Specification & PromQL Alerting Rules Manager."""

    @staticmethod
    def get_dashboard_json() -> Dict[str, Any]:
        """Generates declarative Grafana Dashboard JSON model (4 Golden Signals)."""
        return {
            "title": "FinTech Gateway & Algorithmic Engine — Golden Signals",
            "uid": "fintech-gateway-core",
            "description": "Production SRE observability dashboard tracking Rate, Errors, Duration, and Saturation across microservices.",
            "tags": ["fintech", "production", "fastapi", "redis-streams", "langgraph"],
            "timezone": "utc",
            "schemaVersion": 38,
            "version": 1,
            "refresh": "10s",
            "time": {"from": "now-1h", "to": "now"},
            "panels": [
                {
                    "id": 1,
                    "title": "Inbound Throughput (Rate) by Route Class",
                    "type": "timeseries",
                    "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0},
                    "targets": [
                        {
                            "expr": "sum(rate(fintech_http_requests_total[1m])) by (endpoint)",
                            "legendFormat": "{{endpoint}}",
                            "refId": "A",
                        }
                    ],
                    "options": {"unit": "reqps", "colorMode": "palette"},
                },
                {
                    "id": 2,
                    "title": "Error Rate (% 4xx / 5xx Failures)",
                    "type": "timeseries",
                    "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0},
                    "targets": [
                        {
                            "expr": "(sum(rate(fintech_http_requests_total{status_code=~\"[45]..\"}[1m])) / sum(rate(fintech_http_requests_total[1m]))) * 100",
                            "legendFormat": "Error Rate %",
                            "refId": "A",
                        }
                    ],
                    "options": {"unit": "percent", "thresholds": [1.0, 5.0]},
                },
                {
                    "id": 3,
                    "title": "Latency Quantiles (P50, P90, P99 Duration)",
                    "type": "timeseries",
                    "gridPos": {"h": 8, "w": 12, "x": 0, "y": 8},
                    "targets": [
                        {
                            "expr": "histogram_quantile(0.50, sum(rate(fintech_http_request_duration_seconds_bucket[5m])) by (le)) * 1000",
                            "legendFormat": "P50 Median (ms)",
                            "refId": "P50",
                        },
                        {
                            "expr": "histogram_quantile(0.90, sum(rate(fintech_http_request_duration_seconds_bucket[5m])) by (le)) * 1000",
                            "legendFormat": "P90 (ms)",
                            "refId": "P90",
                        },
                        {
                            "expr": "histogram_quantile(0.99, sum(rate(fintech_http_request_duration_seconds_bucket[5m])) by (le)) * 1000",
                            "legendFormat": "P99 Critical SLA (ms)",
                            "refId": "P99",
                        },
                    ],
                    "options": {"unit": "ms"},
                },
                {
                    "id": 4,
                    "title": "Redis Streams Saturation & Consumer Queue Lag",
                    "type": "timeseries",
                    "gridPos": {"h": 8, "w": 12, "x": 12, "y": 8},
                    "targets": [
                        {
                            "expr": "fintech_redis_stream_lag_total",
                            "legendFormat": "{{stream}} pending",
                            "refId": "Lag",
                        }
                    ],
                    "options": {"unit": "short", "thresholds": [20, 50]},
                },
                {
                    "id": 5,
                    "title": "Distributed Cache Hit Ratio & I/O Offload",
                    "type": "stat",
                    "gridPos": {"h": 6, "w": 12, "x": 0, "y": 16},
                    "targets": [
                        {
                            "expr": "(sum(rate(fintech_cache_hits_total[5m])) / (sum(rate(fintech_cache_hits_total[5m])) + sum(rate(fintech_cache_misses_total[5m])))) * 100",
                            "legendFormat": "Cache Hit Ratio",
                            "refId": "CacheRatio",
                        }
                    ],
                    "options": {"unit": "percent", "colorMode": "value"},
                },
                {
                    "id": 6,
                    "title": "ASGI Event Loop Scheduling Lag & Process Uptime",
                    "type": "gauge",
                    "gridPos": {"h": 6, "w": 12, "x": 12, "y": 16},
                    "targets": [
                        {
                            "expr": "fintech_asgi_event_loop_lag_seconds * 1000",
                            "legendFormat": "Loop Lag (ms)",
                            "refId": "LoopLag",
                        }
                    ],
                    "options": {"unit": "ms", "max": 50},
                },
            ],
        }

    @staticmethod
    def get_prometheus_alert_rules() -> List[Dict[str, Any]]:
        """Generates Prometheus alerting rules with severity, thresholds, and annotations."""
        return [
            {
                "alert": "HighHttpErrorRate",
                "expr": "(sum(rate(fintech_http_requests_total{status_code=~\"5..\"}[2m])) / sum(rate(fintech_http_requests_total[2m]))) * 100 > 1.0",
                "for": "1m",
                "severity": "CRITICAL",
                "summary": "HTTP 5xx error rate exceeds 1.0% SLA threshold",
                "description": "More than 1.0% of requests are failing with 5xx status codes over a 2m rolling window.",
                "action": "Trigger Discord / n8n incident escalation and investigate gateway logs.",
            },
            {
                "alert": "P99LatencyBreach",
                "expr": "histogram_quantile(0.99, sum(rate(fintech_http_request_duration_seconds_bucket[5m])) by (le)) * 1000 > 500",
                "for": "2m",
                "severity": "WARNING",
                "summary": "P99 request latency breaches 500ms SLA",
                "description": "99th percentile response time is exceeding 500ms, indicating downstream database or model latency.",
                "action": "Verify PostgreSQL connection pool and Groq LLM circuit breaker status.",
            },
            {
                "alert": "RedisStreamQueueLagHigh",
                "expr": "fintech_redis_stream_lag_total > 50",
                "for": "1m",
                "severity": "WARNING",
                "summary": "Redis Stream backlog exceeding 50 pending jobs",
                "description": "Stream consumer workers are not keeping pace with ingestion rate.",
                "action": "Scale worker daemon concurrency or inspect DLQ poison pills.",
            },
            {
                "alert": "AsgiEventLoopStarvation",
                "expr": "fintech_asgi_event_loop_lag_seconds * 1000 > 25",
                "for": "30s",
                "severity": "CRITICAL",
                "summary": "ASGI event loop experiencing scheduling starvation (>25ms lag)",
                "description": "Synchronous blocking calls detected in async FastAPI handlers.",
                "action": "Profile event loop tasks and verify threadpool delegation for I/O bounds.",
            },
        ]


class SloThresholdEvaluator:
    """Evaluates live Prometheus telemetry against institutional SRE SLO agreements."""

    def __init__(self, metrics_mgr: Optional[MetricsRegistryManager] = None):
        self.metrics_mgr = metrics_mgr or MetricsRegistryManager.get_instance()
        self._alert_history: List[Dict[str, Any]] = []

    def evaluate_slos(self) -> Dict[str, Any]:
        """Compute live adherence, error budget consumption, and burn rate across 4 core SLOs."""
        summary = self.metrics_mgr.get_metrics_summary()
        signals = summary["golden_signals"]

        # -------------------------------------------------------------
        # SLO 1: API Availability SLA (99.9% target)
        # -------------------------------------------------------------
        error_rate = signals["error_rate_pct"]
        current_availability = max(0.0, min(100.0, 100.0 - error_rate))
        target_availability = 99.9
        # Error budget: (100 - target) = 0.1% allowable errors
        # Budget used = error_rate / 0.1 * 100
        budget_used_pct = min(100.0, (error_rate / 0.1) * 100.0) if error_rate > 0 else 0.0
        budget_remaining_pct = max(0.0, 100.0 - budget_used_pct)
        # 1-hour burn rate: 1.0 means consuming budget at exactly 1x rate
        burn_rate_1h = round(error_rate / 0.1, 2) if error_rate > 0 else 0.0

        slo1_status = "COMPLIANT" if current_availability >= target_availability else (
            "WARNING" if current_availability >= 99.0 else "BREACHED"
        )

        slo1 = {
            "name": "API Service Availability SLA",
            "target": ">= 99.90%",
            "current_value": f"{current_availability:.2f}%",
            "error_budget_remaining_pct": round(budget_remaining_pct, 1),
            "burn_rate_1h": burn_rate_1h,
            "status": slo1_status,
            "description": "Monthly percentage of successful requests (non-5xx responses).",
        }

        # -------------------------------------------------------------
        # SLO 2: Latency P99 SLA (< 500ms target)
        # -------------------------------------------------------------
        p99_latency = signals["p99_latency_ms"]
        target_p99 = 500.0
        # If latency < 500ms, budget remaining is high
        p99_budget_used = min(100.0, (p99_latency / target_p99) * 100.0) if p99_latency > 0 else 10.0
        p99_budget_remaining = max(0.0, 100.0 - p99_budget_used)
        slo2_status = "COMPLIANT" if p99_latency <= target_p99 else "BREACHED"

        slo2 = {
            "name": "P99 Response Latency SLA",
            "target": "< 500.0 ms",
            "current_value": f"{p99_latency:.1f} ms",
            "error_budget_remaining_pct": round(p99_budget_remaining, 1),
            "burn_rate_1h": round(p99_latency / target_p99, 2) if p99_latency > 0 else 0.1,
            "status": slo2_status,
            "description": "99% of valid requests served within half a second.",
        }

        # -------------------------------------------------------------
        # SLO 3: Queue Processing Saturation SLA (< 50 pending messages)
        # -------------------------------------------------------------
        max_lag = max(summary["stream_lag"].values()) if summary["stream_lag"] else 0
        target_lag = 50
        lag_budget_remaining = max(0.0, 100.0 - (max_lag / target_lag * 100.0))
        slo3_status = "COMPLIANT" if max_lag < 25 else ("WARNING" if max_lag <= target_lag else "BREACHED")

        slo3 = {
            "name": "Stream Backlog Processing SLA",
            "target": "< 50 msgs",
            "current_value": f"{max_lag} pending",
            "error_budget_remaining_pct": round(lag_budget_remaining, 1),
            "burn_rate_1h": round(max_lag / target_lag, 2) if max_lag > 0 else 0.0,
            "status": slo3_status,
            "description": "Redis Streams message queue lag ceiling before worker auto-scaling.",
        }

        # -------------------------------------------------------------
        # SLO 4: ASGI Non-Blocking Event Loop SLA (< 15ms delay)
        # -------------------------------------------------------------
        event_loop_lag = signals["event_loop_lag_ms"]
        target_loop = 15.0
        loop_budget_remaining = max(0.0, 100.0 - (event_loop_lag / target_loop * 100.0))
        slo4_status = "COMPLIANT" if event_loop_lag <= 10.0 else ("WARNING" if event_loop_lag <= target_loop else "BREACHED")

        slo4 = {
            "name": "ASGI Event Loop Scheduling SLA",
            "target": "< 15.0 ms",
            "current_value": f"{event_loop_lag:.1f} ms",
            "error_budget_remaining_pct": round(loop_budget_remaining, 1),
            "burn_rate_1h": round(event_loop_lag / target_loop, 2),
            "status": slo4_status,
            "description": "Event-loop tick scheduling drift guarantee to prevent thread starvation.",
        }

        slos = [slo1, slo2, slo3, slo4]
        compliant_count = sum(1 for s in slos if s["status"] == "COMPLIANT")
        overall_compliance = round((compliant_count / len(slos)) * 100.0, 1)

        return {
            "overall_compliance_score": overall_compliance,
            "active_slos_count": len(slos),
            "slos": slos,
            "alert_rules_count": len(GrafanaSpecManager.get_prometheus_alert_rules()),
            "alert_rules": GrafanaSpecManager.get_prometheus_alert_rules(),
        }

    def dispatch_test_alert(self, alert_name: str, severity: str = "WARNING", message: Optional[str] = None) -> Dict[str, Any]:
        """Dispatches synthetic alert test to notification registry (simulating Discord/n8n webhook)."""
        record = {
            "alert_name": alert_name,
            "severity": severity.upper(),
            "message": message or f"Synthetic alert drill for {alert_name} dispatched via SLI/SLO engine.",
            "dispatched_to": ["Discord-Ops-Webhook", "n8n-Incident-Orchestrator"],
            "status": "DISPATCHED",
            "timestamp_iso": datetime.now(timezone.utc).isoformat(),
        }
        self._alert_history.append(record)
        if len(self._alert_history) > 50:
            self._alert_history.pop(0)
        return record
