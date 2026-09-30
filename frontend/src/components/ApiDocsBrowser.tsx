"use client";

import React, { useState, useEffect, useMemo } from "react";
import { OpenApiDocument, OpenApiOperation } from "../types/api";

interface FlattenedEndpoint {
  path: string;
  method: string;
  operation: OpenApiOperation;
  tag: string;
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

  // Live Tester State
  const [testResults, setTestResults] = useState<
    Record<string, { status: number; latencyMs: number; data: any; loading: boolean }>
  >({});
  const [testInputs, setTestInputs] = useState<Record<string, { pathParams: Record<string, string>; queryParams: Record<string, string>; body: string }>>({});

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
      const query = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !query ||
        item.path.toLowerCase().includes(query) ||
        item.method.toLowerCase().includes(query) ||
        (item.operation.summary && item.operation.summary.toLowerCase().includes(query)) ||
        (item.operation.description && item.operation.description.toLowerCase().includes(query));
      return matchesTag && matchesQuery;
    });
  }, [flattenedEndpoints, selectedTag, searchQuery]);

  const toggleEndpoint = (key: string) => {
    setExpandedEndpoints((prev) => ({ ...prev, [key]: !prev[key] }));
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
    Object.entries(input.pathParams || {}).forEach(([pKey, pVal]) => {
      resolvedPath = resolvedPath.replace(`{${pKey}}`, encodeURIComponent(pVal));
    });

    const queryParts: string[] = [];
    Object.entries(input.queryParams || {}).forEach(([qKey, qVal]) => {
      if (qVal) queryParts.push(`${encodeURIComponent(qKey)}=${encodeURIComponent(qVal)}`);
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
      const options: RequestInit = {
        method: endpoint.method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      if (endpoint.method !== "GET" && input.body) {
        options.body = input.body;
      }

      const res = await fetch(resolvedPath, options);
      const t1 = performance.now();
      const latency = Math.round(t1 - t0);
      let resData = null;
      try {
        resData = await res.json();
      } catch {
        resData = await res.text();
      }

      setTestResults((prev) => ({
        ...prev,
        [key]: {
          status: res.status,
          latencyMs: latency,
          data: resData,
          loading: false,
        },
      }));
    } catch (testErr: any) {
      const t1 = performance.now();
      setTestResults((prev) => ({
        ...prev,
        [key]: {
          status: 500,
          latencyMs: Math.round(t1 - t0),
          data: { error: testErr.message || "Network request failed" },
          loading: false,
        },
      }));
    }
  };

  const getMethodBadgeClass = (method: string) => {
    switch (method) {
      case "GET":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "POST":
        return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
      case "DELETE":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      case "PUT":
      case "PATCH":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">📖</span>
              <h2 className="text-xl font-bold text-white tracking-wide">
                Enterprise OpenAPI 3.1 Specification & API Explorer
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                v{doc?.info.version || "0.9.0"}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ZERO-TRUST SECURED
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Institutional microservice contracts, interactive endpoint testing, and distributed telemetry lineage.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadSpec}
              disabled={!doc}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <span>💾</span>
              <span>Download JSON</span>
            </button>
            <button
              onClick={copySpec}
              disabled={!doc}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <span>{copied ? "✓ Copied" : "📋 Copy Spec"}</span>
            </button>
          </div>
        </div>

        {/* Metric Badges */}
        {doc && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-800/80">
            <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-3">
              <div className="text-xs text-slate-400 font-medium">Documented Routes</div>
              <div className="text-lg font-bold text-cyan-400 mt-0.5">
                {flattenedEndpoints.length} Operations
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Across {Object.keys(doc.paths || {}).length} unique URI paths
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-3">
              <div className="text-xs text-slate-400 font-medium">Domain Category Tags</div>
              <div className="text-lg font-bold text-purple-400 mt-0.5">
                {doc.tags?.length || 0} Subsystems
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Tiered microservice architecture</div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-3">
              <div className="text-xs text-slate-400 font-medium">Pydantic Schemas</div>
              <div className="text-lg font-bold text-emerald-400 mt-0.5">
                {Object.keys(doc.components?.schemas || {}).length} Contracts
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Strict typing & payload firewall</div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-3">
              <div className="text-xs text-slate-400 font-medium">Security Schemes</div>
              <div className="text-lg font-bold text-amber-400 mt-0.5">
                Bearer + ApiKey
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Dual JWT & M2M protection</div>
            </div>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* View Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView("EXPLORER")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeView === "EXPLORER"
                ? "bg-slate-800 text-cyan-400 border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            ⚡ Interactive Explorer
          </button>
          <button
            onClick={() => setActiveView("SWAGGER")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeView === "SWAGGER"
                ? "bg-slate-800 text-emerald-400 border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            📜 Swagger UI Portal
          </button>
          <button
            onClick={() => setActiveView("JSON")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeView === "JSON"
                ? "bg-slate-800 text-purple-400 border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            📦 OpenAPI JSON
          </button>
        </div>

        {activeView === "EXPLORER" && (
          <div className="text-xs text-slate-400 font-mono">
            Showing {filteredEndpoints.length} of {flattenedEndpoints.length} endpoints
          </div>
        )}
      </div>

      {/* Search and Tag Filter Bar */}
      {activeView === "EXPLORER" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-2.5 text-slate-500 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search endpoints by path, method, or keyword (e.g. /v1/analytics, BUY, volatility)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Tag Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setSelectedTag("ALL")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors ${
                selectedTag === "ALL"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              All Domains ({flattenedEndpoints.length})
            </button>
            {allTags.map((tag) => {
              const count = flattenedEndpoints.filter((e) => e.tag === tag).length;
              return (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    selectedTag === tag
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                >
                  {tag} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading && !doc ? (
        <div className="p-16 text-center text-slate-500 space-y-3">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs">Loading OpenAPI 3.1 gateway specification...</p>
        </div>
      ) : activeView === "EXPLORER" ? (
        <div className="space-y-3">
          {filteredEndpoints.length === 0 ? (
            <div className="p-12 text-center text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
              <span className="text-2xl mb-2 block">🔍</span>
              <p className="text-sm font-semibold text-slate-400">No matching endpoints found</p>
              <p className="text-xs text-slate-600 mt-1">Try refining your search query or selected category tag.</p>
            </div>
          ) : (
            filteredEndpoints.map((item) => {
              const key = `${item.method}_${item.path}`;
              const isExpanded = !!expandedEndpoints[key];
              const testResult = testResults[key];

              return (
                <div
                  key={key}
                  className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden transition-all hover:border-slate-700/80 shadow-md"
                >
                  {/* Endpoint Header Bar */}
                  <div
                    onClick={() => toggleEndpoint(key)}
                    className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span
                        className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono border ${getMethodBadgeClass(
                          item.method
                        )}`}
                      >
                        {item.method}
                      </span>
                      <span className="font-mono text-sm font-bold text-slate-200 truncate">
                        {item.path}
                      </span>
                      {item.operation.summary && (
                        <span className="text-xs text-slate-400 hidden md:inline truncate">
                          — {item.operation.summary}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[11px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 hidden sm:inline">
                        {item.tag}
                      </span>
                      <span className="text-xs text-slate-400">
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
                          <div className="text-xs font-semibold text-slate-400 mb-1">Description</div>
                          <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {item.operation.description}
                          </p>
                        </div>
                      )}

                      {/* Parameters Table */}
                      {item.operation.parameters && item.operation.parameters.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-slate-400 mb-2">Request Parameters</div>
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
                                    <td className="p-2.5 text-purple-400">{param.schema?.type || "string"}</td>
                                    <td className="p-2.5">
                                      {param.required ? (
                                        <span className="text-rose-400 font-semibold">required</span>
                                      ) : (
                                        <span className="text-slate-500">optional</span>
                                      )}
                                    </td>
                                    <td className="p-2.5 text-slate-400">{param.description || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Response Status Codes */}
                      <div>
                        <div className="text-xs font-semibold text-slate-400 mb-2">Expected Responses</div>
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
                      <div className="border border-slate-800/80 rounded-lg p-4 bg-slate-900/60 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">⚡</span>
                            <span className="text-xs font-bold text-slate-200">Live Gateway Console</span>
                          </div>
                          <button
                            onClick={() => executeLiveTest(item)}
                            disabled={testResult?.loading}
                            className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-mono text-xs font-semibold rounded-md shadow transition-colors flex items-center gap-1.5"
                          >
                            {testResult?.loading ? (
                              <>
                                <span className="animate-spin text-xs">⟳</span>
                                <span>Executing...</span>
                              </>
                            ) : (
                              <>
                                <span>▶</span>
                                <span>Execute {item.method}</span>
                              </>
                            )}
                          </button>
                        </div>

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
                                Latency: <span className="text-cyan-400 font-bold">{testResult.latencyMs}ms</span>
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
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
            <span>FastAPI Interactive Swagger UI (/docs)</span>
            <a
              href="https://fintech-api-gateway-m2yl.onrender.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:underline flex items-center gap-1"
            >
              Open Standalone ↗
            </a>
          </div>
          <iframe
            src="https://fintech-api-gateway-m2yl.onrender.com/docs"
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
