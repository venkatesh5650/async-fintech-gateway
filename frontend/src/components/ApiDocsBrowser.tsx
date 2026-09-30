"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { OpenApiDocument, OpenApiOperation } from "../types/api";

interface FlattenedEndpoint {
  path: string;
  method: string;
  operation: OpenApiOperation;
  tag: string;
}

function getDefaultParamValue(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("ticker") || lower.includes("symbol")) return "AAPL";
  if (lower.includes("days")) return "30";
  if (lower.includes("limit")) return "10";
  if (lower.includes("offset")) return "0";
  if (lower.includes("form")) return "10-K";
  if (lower.includes("trace")) return "00000000000000000000000000000001";
  if (lower.includes("job")) return "sample_job_001";
  if (lower.includes("period")) return "1y";
  if (lower.includes("interval")) return "1d";
  return "test";
}

function getDefaultRequestBody(method: string, path: string): string {
  if (method === "GET" || method === "DELETE") return "";
  if (path.includes("/market-data/ingest")) {
    return JSON.stringify(
      {
        ticker: "AAPL",
        open: 220.5,
        high: 224.0,
        low: 219.0,
        close: 223.5,
        volume: 55000000,
      },
      null,
      2
    );
  }
  if (path.includes("/intelligence/analyze/batch")) {
    return JSON.stringify({ tickers: ["AAPL", "MSFT", "NVDA"] }, null, 2);
  }
  if (path.includes("/intelligence/analyze") || path.includes("/analyze")) {
    return JSON.stringify({ ticker: "AAPL" }, null, 2);
  }
  if (path.includes("/stress/run") || path.includes("/load-test")) {
    return JSON.stringify({ target_rps: 5, duration_sec: 5 }, null, 2);
  }
  if (path.includes("/code-quality/scan") || path.includes("/audit/regression/run")) {
    return "{}";
  }
  return JSON.stringify({ ticker: "AAPL" }, null, 2);
}

export const ApiDocsBrowser: React.FC = () => {
  const [doc, setDoc] = useState<OpenApiDocument | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"EXPLORER" | "SWAGGER" | "JSON">("EXPLORER");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("ALL");
  const [expandedEndpoints, setExpandedEndpoints] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<boolean>(false);
  const [swaggerEnv, setSwaggerEnv] = useState<"LOCAL" | "CLOUD">("LOCAL");

  // Live Tester State
  const [testResults, setTestResults] = useState<
    Record<string, { status: number; latencyMs: number; data: any; loading: boolean }>
  >({});
  const [testInputs, setTestInputs] = useState<
    Record<
      string,
      {
        pathParams: Record<string, string>;
        queryParams: Record<string, string>;
        body: string;
      }
    >
  >({});

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/docs/spec");
        if (!res.ok) {
          throw new Error(`Failed to load OpenAPI spec: HTTP ${res.status}`);
        }
        const data: OpenApiDocument = await res.json();
        setDoc(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load OpenAPI document.");
      } finally {
        setLoading(false);
      }
    };

    fetchDoc();
  }, []);

  const flattenedEndpoints: FlattenedEndpoint[] = useMemo(() => {
    if (!doc || !doc.paths) return [];
    const list: FlattenedEndpoint[] = [];
    Object.entries(doc.paths).forEach(([pathKey, methods]) => {
      Object.entries(methods).forEach(([methodKey, op]) => {
        const methodUpper = methodKey.toUpperCase();
        if (["GET", "POST", "PUT", "DELETE", "PATCH"].includes(methodUpper)) {
          const primaryTag = op.tags && op.tags.length > 0 ? op.tags[0] : "General";
          list.push({
            path: pathKey,
            method: methodUpper,
            operation: op,
            tag: primaryTag,
          });
        }
      });
    });
    return list;
  }, [doc]);

  const allTags = useMemo(() => {
    if (!doc || !doc.tags) return [];
    return doc.tags.map((t) => t.name);
  }, [doc]);

  const filteredEndpoints = useMemo(() => {
    return flattenedEndpoints.filter((item) => {
      const matchesTag = selectedTag === "ALL" || item.tag === selectedTag;
      const query = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !query ||
        item.path.toLowerCase().includes(query) ||
        item.method.toLowerCase().includes(query) ||
        (item.operation.summary && item.operation.summary.toLowerCase().includes(query)) ||
        (item.operation.description && item.operation.description.toLowerCase().includes(query));
      return matchesTag && matchesQuery;
    });
  }, [flattenedEndpoints, selectedTag, searchQuery]);

  // Pre-fill inputs when an endpoint is expanded
  const toggleEndpoint = (key: string, endpoint: FlattenedEndpoint) => {
    setExpandedEndpoints((prev) => {
      const isCurrentlyExpanded = !!prev[key];
      const nextState = !isCurrentlyExpanded;

      if (nextState && !testInputs[key]) {
        // Initialize default parameters
        const defaultPathParams: Record<string, string> = {};
        const pathMatches = endpoint.path.match(/\{([^}]+)\}/g) || [];
        pathMatches.forEach((m) => {
          const paramName = m.replace(/[{}]/g, "");
          defaultPathParams[paramName] = getDefaultParamValue(paramName);
        });

        const defaultQueryParams: Record<string, string> = {};
        (endpoint.operation.parameters || [])
          .filter((p) => p.in === "query")
          .forEach((p) => {
            defaultQueryParams[p.name] = getDefaultParamValue(p.name);
          });

        const defaultBody = getDefaultRequestBody(endpoint.method, endpoint.path);

        setTestInputs((curr) => ({
          ...curr,
          [key]: {
            pathParams: defaultPathParams,
            queryParams: defaultQueryParams,
            body: defaultBody,
          },
        }));
      }

      return { ...prev, [key]: nextState };
    });
  };

  const updatePathParam = (endpointKey: string, paramName: string, value: string) => {
    setTestInputs((prev) => {
      const current = prev[endpointKey] || { pathParams: {}, queryParams: {}, body: "" };
      return {
        ...prev,
        [endpointKey]: {
          ...current,
          pathParams: { ...current.pathParams, [paramName]: value },
        },
      };
    });
  };

  const updateQueryParam = (endpointKey: string, paramName: string, value: string) => {
    setTestInputs((prev) => {
      const current = prev[endpointKey] || { pathParams: {}, queryParams: {}, body: "" };
      return {
        ...prev,
        [endpointKey]: {
          ...current,
          queryParams: { ...current.queryParams, [paramName]: value },
        },
      };
    });
  };

  const updateBody = (endpointKey: string, body: string) => {
    setTestInputs((prev) => {
      const current = prev[endpointKey] || { pathParams: {}, queryParams: {}, body: "" };
      return {
        ...prev,
        [endpointKey]: {
          ...current,
          body,
        },
      };
    });
  };

  const copySpec = () => {
    if (!doc) return;
    navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadSpec = () => {
    if (!doc) return;
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openapi_v${doc.info.version || "0.9.0"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const executeLiveTest = async (endpoint: FlattenedEndpoint) => {
    const key = `${endpoint.method}_${endpoint.path}`;
    const input = testInputs[key] || { pathParams: {}, queryParams: {}, body: "" };

    let resolvedPath = endpoint.path;

    // Detect path parameters
    const pathParamMatches = endpoint.path.match(/\{([^}]+)\}/g) || [];
    pathParamMatches.forEach((m) => {
      const pKey = m.replace(/[{}]/g, "");
      const val = input.pathParams[pKey] || getDefaultParamValue(pKey);
      resolvedPath = resolvedPath.replace(m, encodeURIComponent(val));
    });

    // Query parameters
    const queryParts: string[] = [];
    Object.entries(input.queryParams || {}).forEach(([qKey, qVal]) => {
      if (qVal) {
        queryParts.push(`${encodeURIComponent(qKey)}=${encodeURIComponent(qVal)}`);
      }
    });

    if (queryParts.length > 0) {
      resolvedPath += (resolvedPath.includes("?") ? "&" : "?") + queryParts.join("&");
    }

    setTestResults((prev) => ({
      ...prev,
      [key]: { status: 0, latencyMs: 0, data: null, loading: true },
    }));

    const t0 = performance.now();
    try {
      const proxyUrl = `/api/docs/proxy?path=${encodeURIComponent(resolvedPath)}`;
      const reqBody =
        input.body ||
        (endpoint.method !== "GET" && endpoint.method !== "HEAD"
          ? getDefaultRequestBody(endpoint.method, endpoint.path)
          : undefined);

      const options: RequestInit = {
        method: endpoint.method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      if (endpoint.method !== "GET" && endpoint.method !== "HEAD" && reqBody) {
        options.body = reqBody;
      }

      const res = await fetch(proxyUrl, options);
      const latency = Math.round(performance.now() - t0);
      let payload: any = null;

      try {
        payload = await res.json();
      } catch {
        payload = await res.text();
      }

      setTestResults((prev) => ({
        ...prev,
        [key]: {
          status: payload?.status || res.status,
          latencyMs: payload?.latencyMs || latency,
          data: payload?.data !== undefined ? payload.data : payload,
          loading: false,
        },
      }));
    } catch (testErr: any) {
      const latency = Math.round(performance.now() - t0);
      setTestResults((prev) => ({
        ...prev,
        [key]: {
          status: 500,
          latencyMs: latency,
          data: { error: testErr.message || "Network request failed" },
          loading: false,
        },
      }));
    }
  };

  const getMethodBadgeClass = (method: string) => {
    switch (method) {
      case "GET":
        return "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
      case "POST":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "PUT":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "DELETE":
        return "bg-rose-500/10 text-rose-400 border-rose-500/30";
      case "PATCH":
        return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/30";
    }
  };

  const swaggerUrl =
    swaggerEnv === "LOCAL"
      ? "http://localhost:8000/docs"
      : "https://fintech-api-gateway-m2yl.onrender.com/docs";

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
                OpenAPI 3.1 Contract Specification
              </span>
              <span className="text-xs font-mono text-slate-500">•</span>
              <span className="text-xs font-mono text-slate-400">
                v{doc?.info?.version || "0.9.0"}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                PROD CERTIFIED
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              {doc?.info?.title || "Automated Equity Research Engine — API Explorer"}
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              {doc?.info?.description ||
                "Interactive OpenAPI 3.1 specification, REST endpoint explorer, and schema contracts for the fintech intelligence gateway."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadSpec}
              disabled={!doc}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-mono font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <span>💾</span>
              <span>Download Spec</span>
            </button>
            <button
              onClick={copySpec}
              disabled={!doc}
              className="px-3.5 py-2 bg-cyan-950/60 hover:bg-cyan-900/60 disabled:opacity-50 text-cyan-300 text-xs font-mono font-semibold rounded-lg border border-cyan-800/80 transition-colors flex items-center gap-1.5"
            >
              <span>{copied ? "✓ Copied" : "📋 Copy JSON"}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-800/80 font-mono text-xs">
          <button
            onClick={() => setActiveView("EXPLORER")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeView === "EXPLORER"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            ⚡ Live Interactive Explorer ({flattenedEndpoints.length} Routes)
          </button>
          <button
            onClick={() => setActiveView("SWAGGER")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeView === "SWAGGER"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            📑 Swagger UI View
          </button>
          <button
            onClick={() => setActiveView("JSON")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeView === "JSON"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            📄 Raw JSON Schema
          </button>
        </div>
      </div>

      {/* Explorer View */}
      {activeView === "EXPLORER" ? (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <span className="absolute left-3 top-2.5 text-slate-500 text-xs font-mono">🔍</span>
              <input
                type="text"
                placeholder="Search endpoints by path, method, or summary (e.g., /analytics, POST, ingest)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-4 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            {/* Category Tag Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto py-1 scrollbar-none font-mono text-[11px]">
              <button
                onClick={() => setSelectedTag("ALL")}
                className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
                  selectedTag === "ALL"
                    ? "bg-cyan-600 text-white font-bold"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                ALL ({flattenedEndpoints.length})
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
                    selectedTag === tag
                      ? "bg-cyan-600 text-white font-bold"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Endpoints List */}
          {loading ? (
            <div className="p-16 text-center text-slate-500 space-y-3 bg-slate-900/40 rounded-xl border border-slate-800">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono">Parsing OpenAPI 3.1 specification contracts...</p>
            </div>
          ) : error ? (
            <div className="p-6 bg-rose-950/30 border border-rose-800/50 rounded-xl text-rose-400 text-xs font-mono">
              ⚠️ {error}
            </div>
          ) : filteredEndpoints.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs font-mono bg-slate-900/40 rounded-xl border border-slate-800">
              No matching endpoints found for query "{searchQuery}".
            </div>
          ) : (
            filteredEndpoints.map((item) => {
              const endpointKey = `${item.method}_${item.path}`;
              const isExpanded = !!expandedEndpoints[endpointKey];
              const testResult = testResults[endpointKey];
              const inputs = testInputs[endpointKey] || {
                pathParams: {},
                queryParams: {},
                body: "",
              };

              // Identify parameters
              const pathParamMatches = item.path.match(/\{([^}]+)\}/g) || [];
              const pathParamNames = pathParamMatches.map((m) => m.replace(/[{}]/g, ""));
              const queryParams = (item.operation.parameters || []).filter(
                (p) => p.in === "query"
              );

              return (
                <div
                  key={endpointKey}
                  className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700/80 transition-all"
                >
                  {/* Endpoint Header Row */}
                  <div
                    onClick={() => toggleEndpoint(endpointKey, item)}
                    className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2.5 py-1 rounded text-xs font-mono font-bold border ${getMethodBadgeClass(
                          item.method
                        )}`}
                      >
                        {item.method}
                      </span>
                      <span className="text-sm font-mono font-semibold text-slate-200">
                        {item.path}
                      </span>
                      {item.operation.summary && (
                        <span className="text-xs text-slate-400 hidden sm:inline truncate max-w-md">
                          — {item.operation.summary}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 hidden md:inline">
                        {item.tag}
                      </span>
                      <span className="text-slate-400 text-xs font-mono">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Content Details */}
                  {isExpanded && (
                    <div className="p-5 border-t border-slate-800/80 bg-slate-950/60 space-y-5">
                      {/* Description */}
                      {item.operation.description && (
                        <div>
                          <div className="text-xs font-semibold text-slate-400 mb-1">
                            Description
                          </div>
                          <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {item.operation.description}
                          </p>
                        </div>
                      )}

                      {/* Parameters Table */}
                      {item.operation.parameters && item.operation.parameters.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-slate-400 mb-2">
                            Request Parameters
                          </div>
                          <div className="border border-slate-800 rounded-lg overflow-x-auto">
                            <table className="w-full text-left text-xs font-mono">
                              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                                <tr>
                                  <th className="p-2.5">Parameter</th>
                                  <th className="p-2.5">In</th>
                                  <th className="p-2.5">Type</th>
                                  <th className="p-2.5">Required</th>
                                  <th className="p-2.5">Description</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                                {item.operation.parameters.map((param, pIdx) => (
                                  <tr key={pIdx}>
                                    <td className="p-2.5 font-bold text-cyan-400">{param.name}</td>
                                    <td className="p-2.5 text-slate-400">{param.in}</td>
                                    <td className="p-2.5 text-purple-400">
                                      {param.schema?.type || "string"}
                                    </td>
                                    <td className="p-2.5">
                                      {param.required ? (
                                        <span className="text-rose-400 font-semibold">required</span>
                                      ) : (
                                        <span className="text-slate-500">optional</span>
                                      )}
                                    </td>
                                    <td className="p-2.5 text-slate-400">
                                      {param.description || "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Response Status Codes */}
                      <div>
                        <div className="text-xs font-semibold text-slate-400 mb-2">
                          Expected Responses
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {Object.entries(item.operation.responses || {}).map(([code, resp]) => {
                            const isSuccess = code.startsWith("2");
                            return (
                              <div
                                key={code}
                                className={`p-2.5 rounded-lg border text-xs font-mono ${
                                  isSuccess
                                    ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                                    : "bg-slate-900 border-slate-800 text-slate-400"
                                }`}
                              >
                                <div className="font-bold flex items-center justify-between">
                                  <span>HTTP {code}</span>
                                  <span>{isSuccess ? "✓" : "!"}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1 truncate">
                                  {resp.description || "Standard response"}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Live "Try It Out" Execution Console */}
                      <div className="border border-slate-800/80 rounded-lg p-4 bg-slate-900/60 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">⚡</span>
                            <span className="text-xs font-bold text-slate-200">
                              Live Gateway Console
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              BFF PROXIED • ZERO-TRUST
                            </span>
                          </div>
                          <button
                            onClick={() => executeLiveTest(item)}
                            disabled={testResult?.loading}
                            className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-mono text-xs font-semibold rounded-md shadow-md transition-colors flex items-center gap-1.5"
                          >
                            {testResult?.loading ? (
                              <>
                                <span className="animate-spin text-xs">⟳</span>
                                <span>Executing Request...</span>
                              </>
                            ) : (
                              <>
                                <span>▶</span>
                                <span>Execute {item.method} Request</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Interactive Parameters Input Fields */}
                        {(pathParamNames.length > 0 || queryParams.length > 0) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800/60">
                            {pathParamNames.map((paramName) => (
                              <div key={paramName} className="space-y-1">
                                <label className="text-[11px] font-mono font-semibold text-cyan-400 flex items-center gap-1">
                                  <span>{paramName}</span>
                                  <span className="text-slate-500">(path)</span>
                                </label>
                                <input
                                  type="text"
                                  value={
                                    inputs.pathParams[paramName] !== undefined
                                      ? inputs.pathParams[paramName]
                                      : getDefaultParamValue(paramName)
                                  }
                                  onChange={(e) =>
                                    updatePathParam(endpointKey, paramName, e.target.value)
                                  }
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                                />
                              </div>
                            ))}

                            {queryParams.map((param) => (
                              <div key={param.name} className="space-y-1">
                                <label className="text-[11px] font-mono font-semibold text-purple-400 flex items-center gap-1">
                                  <span>{param.name}</span>
                                  <span className="text-slate-500">(query)</span>
                                </label>
                                <input
                                  type="text"
                                  value={
                                    inputs.queryParams[param.name] !== undefined
                                      ? inputs.queryParams[param.name]
                                      : getDefaultParamValue(param.name)
                                  }
                                  onChange={(e) =>
                                    updateQueryParam(endpointKey, param.name, e.target.value)
                                  }
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Request Body Input Field (for POST/PUT) */}
                        {item.method !== "GET" && item.method !== "DELETE" && (
                          <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                              <span>Request Body (JSON)</span>
                              <button
                                onClick={() =>
                                  updateBody(
                                    endpointKey,
                                    getDefaultRequestBody(item.method, item.path)
                                  )
                                }
                                className="text-cyan-400 hover:underline"
                              >
                                Reset Sample Body
                              </button>
                            </div>
                            <textarea
                              rows={4}
                              value={
                                inputs.body !== undefined && inputs.body !== ""
                                  ? inputs.body
                                  : getDefaultRequestBody(item.method, item.path)
                              }
                              onChange={(e) => updateBody(endpointKey, e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-xs font-mono text-emerald-400 focus:outline-none focus:border-cyan-500"
                            />
                          </div>
                        )}

                        {/* Live Results Panel */}
                        {testResult && (
                          <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2">
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span
                                className={`px-2 py-0.5 rounded font-bold ${
                                  testResult.status >= 200 && testResult.status < 300
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-rose-500/20 text-rose-400"
                                }`}
                              >
                                HTTP {testResult.status}
                              </span>
                              <span className="text-slate-400">
                                Roundtrip Latency:{" "}
                                <span className="text-cyan-400 font-bold">
                                  {testResult.latencyMs}ms
                                </span>
                              </span>
                            </div>
                            <pre className="bg-slate-950 p-3 rounded-lg text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-60 border border-slate-800">
                              {typeof testResult.data === "object"
                                ? JSON.stringify(testResult.data, null, 2)
                                : testResult.data}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : activeView === "SWAGGER" ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-3">
              <span>FastAPI Interactive Swagger UI</span>
              <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                <button
                  onClick={() => setSwaggerEnv("LOCAL")}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                    swaggerEnv === "LOCAL"
                      ? "bg-cyan-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Local (:8000)
                </button>
                <button
                  onClick={() => setSwaggerEnv("CLOUD")}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                    swaggerEnv === "CLOUD"
                      ? "bg-cyan-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Cloud (Render)
                </button>
              </div>
            </div>
            <a
              href={swaggerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:underline flex items-center gap-1"
            >
              Open Standalone ({swaggerUrl}) ↗
            </a>
          </div>
          <iframe
            src={swaggerUrl}
            title="FastAPI Swagger Documentation"
            className="w-full h-[700px] border-0 bg-white"
          />
        </div>
      ) : activeView === "JSON" && doc ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 relative">
          <div className="flex items-center justify-between mb-3 text-xs font-mono text-slate-400">
            <span>OpenAPI Schema Version: {doc.openapi}</span>
            <button
              onClick={copySpec}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
            >
              {copied ? "✓ Copied" : "📋 Copy JSON"}
            </button>
          </div>
          <pre className="bg-slate-950 p-4 rounded-lg text-emerald-400 font-mono text-xs overflow-x-auto max-h-[600px] border border-slate-800">
            {JSON.stringify(doc, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
};
