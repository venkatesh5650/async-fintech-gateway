import Link from "next/link";
import CyberTopNav from "@/components/CyberTopNav";
import { ApiDocsBrowser } from "@/components/ApiDocsBrowser";

export const metadata = {
  title: "API Documentation | Automated Equity Research Engine",
  description:
    "Interactive OpenAPI 3.1 specification, REST endpoint explorer, and schema contracts for the fintech intelligence gateway.",
};

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-transparent text-gray-100 font-sans selection:bg-cyan-500 selection:text-black relative overflow-hidden flex flex-col justify-between">
      {/* Background Subtle Gradient Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#00f0ff08_1px,transparent_1px),linear-gradient(to_bottom,#00f0ff08_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Futuristic HUD Navigation */}
      <CyberTopNav />

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
