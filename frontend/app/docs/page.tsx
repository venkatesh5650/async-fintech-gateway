import Link from "next/link";
import { ApiDocsBrowser } from "@/components/ApiDocsBrowser";

export const metadata = {
  title: "API Documentation | Automated Equity Research Engine",
  description:
    "Interactive OpenAPI 3.1 specification, REST endpoint explorer, and schema contracts for the fintech intelligence gateway.",
};

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#05070d] text-gray-100 font-sans selection:bg-cyan-600 selection:text-white relative overflow-hidden flex flex-col justify-between">
      {/* Background Subtle Gradient Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293d0f_1px,transparent_1px),linear-gradient(to_bottom,#1f293d0f_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Top Navigation Bar */}
      <header className="border-b border-gray-800/80 backdrop-blur-md sticky top-0 z-50 bg-[#05070d]/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-600/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-mono font-bold text-sm shadow-[0_0_12px_rgba(6,182,212,0.2)]">
              Ω
            </div>
            <Link
              href="/"
              className="font-mono text-sm font-semibold tracking-wider text-gray-200 hover:text-white transition"
            >
              FINTECH AUTOMATION // EQUITY RESEARCH
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard/AAPL"
              className="px-4 py-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-cyan-400 hover:text-white bg-cyan-950/40 border border-cyan-700/60 hover:border-cyan-500 rounded-md transition-all duration-200 flex items-center gap-1.5"
            >
              <span>← Terminal</span>
            </Link>
            <div className="hidden sm:flex items-center space-x-2 bg-gray-900/80 border border-gray-800 px-3 py-1 rounded-full text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              <span className="text-cyan-400">OPENAPI 3.1 SPECIFIED</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Documentation Container */}
      <div className="max-w-7xl mx-auto px-6 py-8 w-full relative z-10">
        <ApiDocsBrowser />
      </div>

      {/* Footer System Telemetry Status */}
      <footer className="border-t border-gray-800/80 py-6 bg-[#05070d]/90 relative z-10 text-xs text-gray-500 font-mono">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="text-gray-400">GATEWAY KERNEL:</span>
            <span className="text-gray-300">FastAPI 0.115 // Uvicorn Async</span>
          </div>
          <div>CONTRACT STATUS: 100% OPENAPI 3.1 VALIDATED</div>
        </div>
      </footer>
    </main>
  );
}
