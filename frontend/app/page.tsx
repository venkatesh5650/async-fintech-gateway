import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#05070d] text-gray-100 font-sans selection:bg-blue-600 selection:text-white relative overflow-hidden flex flex-col justify-between">
      {/* Background Subtle Gradient Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293d0f_1px,transparent_1px),linear-gradient(to_bottom,#1f293d0f_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Top Navigation Bar */}
      <header className="border-b border-gray-800/80 backdrop-blur-md sticky top-0 z-50 bg-[#05070d]/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-mono font-bold text-sm shadow-[0_0_12px_rgba(59,130,246,0.2)]">
              Ω
            </div>
            <span className="font-mono text-sm font-semibold tracking-wider text-gray-200">
              FINTECH AUTOMATION // EQUITY RESEARCH
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 bg-gray-900/80 border border-gray-800 px-3 py-1 rounded-full text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <span className="text-emerald-400">CORE PIPELINE ACTIVE</span>
            </div>
            <Link
              href="/login"
              className="px-4 py-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-gray-300 hover:text-white bg-gray-900 border border-gray-700 hover:border-gray-500 rounded-md transition-all duration-200"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16 w-full relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center space-x-2 bg-blue-950/40 border border-blue-500/30 px-3 py-1 rounded-full text-xs font-mono text-blue-400 mb-6 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
            <span>● ZERO-TRUST ARCHITECTURE</span>
            <span className="text-gray-600">|</span>
            <span>ENTERPRISE EDITION</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
            Autonomous Multi-Agent{" "}
            <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              Equity Research
            </span>
          </h1>
          <p className="text-gray-400 text-base sm:text-lg leading-relaxed font-sans">
            Deterministic quantitative state machine powered by LangGraph, FastAPI async workers, and real-time WebSocket event streams for institutional equity analysis.
          </p>

          {/* Primary Action Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard/AAPL"
              className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-mono text-sm font-bold uppercase tracking-widest rounded-lg shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all duration-200 text-center"
            >
              Launch Research Terminal →
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto px-8 py-3.5 bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white font-mono text-sm font-semibold uppercase tracking-widest rounded-lg border border-gray-800 hover:border-gray-700 transition-all duration-200 text-center"
            >
              Establish Session
            </Link>
          </div>
        </div>

        {/* Live Terminal Preview Snapshot */}
        <div className="max-w-4xl mx-auto bg-gray-950 border border-gray-800 rounded-xl overflow-hidden shadow-2xl font-mono text-sm mb-16">
          <div className="bg-gray-900/90 px-4 py-2.5 border-b border-gray-800 flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block" />
              <span className="ml-2 font-mono text-gray-400">terminal@fintech-intelligence-gateway ~ preview</span>
            </div>
            <span className="text-emerald-400 font-mono text-[11px]">TELEMETRY: 138ms</span>
          </div>

          <div className="p-6 space-y-4 text-left">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800/80 pb-4">
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-widest block">Target Equity</span>
                <span className="text-xl font-bold text-white tracking-wide">AAPL (Apple Inc.)</span>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs text-gray-500 uppercase tracking-widest">Ternary Output:</span>
                <span className="bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 font-bold px-3 py-1 rounded text-xs tracking-wider">
                  SIGNAL: BUY
                </span>
              </div>
            </div>

            <div className="bg-black/60 p-4 rounded-lg border border-gray-800/80">
              <span className="text-gray-500 text-xs uppercase tracking-widest block mb-2">Agent Synthesis Report</span>
              <p className="text-gray-300 text-xs sm:text-sm leading-relaxed font-sans">
                Deterministic fundamental synthesis completed. 50-day SMA confirmation calculated mathematically in PostgreSQL. Multi-agent LangGraph consensus indicates strong upward momentum with low volatility drawdown risk.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="bg-gray-900/50 p-3 rounded border border-gray-800/60">
                <span className="text-gray-500 block text-[10px] uppercase">Engine Protocol</span>
                <span className="text-gray-200 font-semibold">LangGraph State</span>
              </div>
              <div className="bg-gray-900/50 p-3 rounded border border-gray-800/60">
                <span className="text-gray-500 block text-[10px] uppercase">Stream Pipeline</span>
                <span className="text-emerald-400 font-semibold">Persistent WS</span>
              </div>
              <div className="bg-gray-900/50 p-3 rounded border border-gray-800/60">
                <span className="text-gray-500 block text-[10px] uppercase">Perimeter Guard</span>
                <span className="text-blue-400 font-semibold">Pydantic V2</span>
              </div>
              <div className="bg-gray-900/50 p-3 rounded border border-gray-800/60">
                <span className="text-gray-500 block text-[10px] uppercase">M2M Alerts</span>
                <span className="text-purple-400 font-semibold">n8n / Discord</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4-Pillar Enterprise Architecture Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gray-950/60 border border-gray-800/80 p-5 rounded-xl">
            <div className="w-8 h-8 rounded bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-mono text-sm mb-3">
              01
            </div>
            <h3 className="font-bold text-white text-sm mb-1">Zero-Trust Perimeter</h3>
            <p className="text-gray-400 text-xs leading-relaxed">
              Pydantic V2 input boundaries, JWT auth gatekeeper, and edge error masking preventing stack traces.
            </p>
          </div>

          <div className="bg-gray-950/60 border border-gray-800/80 p-5 rounded-xl">
            <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono text-sm mb-3">
              02
            </div>
            <h3 className="font-bold text-white text-sm mb-1">Deterministic Math</h3>
            <p className="text-gray-400 text-xs leading-relaxed">
              No LLM hallucinations. All statistical & quantitative indicators calculated in Python/PostgreSQL.
            </p>
          </div>

          <div className="bg-gray-950/60 border border-gray-800/80 p-5 rounded-xl">
            <div className="w-8 h-8 rounded bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-mono text-sm mb-3">
              03
            </div>
            <h3 className="font-bold text-white text-sm mb-1">Event-Driven Streams</h3>
            <p className="text-gray-400 text-xs leading-relaxed">
              Persistent WebSocket pipeline with 30s ping/pong keep-alives and client-side circuit breakers.
            </p>
          </div>

          <div className="bg-gray-950/60 border border-gray-800/80 p-5 rounded-xl">
            <div className="w-8 h-8 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-mono text-sm mb-3">
              04
            </div>
            <h3 className="font-bold text-white text-sm mb-1">Autonomous M2M</h3>
            <p className="text-gray-400 text-xs leading-relaxed">
              n8n cron orchestration, multi-asset surveillance loops, and automated Discord webhook dispatch.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800/80 py-6 bg-black/40 text-xs font-mono text-gray-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>AUTOMATED EQUITY RESEARCH ENGINE // INSTITUTIONAL PLATFORM</div>
          <div className="flex items-center space-x-4 text-[11px]">
            <span>FASTAPI</span>
            <span>•</span>
            <span>LANGGRAPH</span>
            <span>•</span>
            <span>REDIS</span>
            <span>•</span>
            <span>NEXT.JS 16</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
