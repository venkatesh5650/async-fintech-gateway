import Link from "next/link";
import CyberTopNav from "@/components/CyberTopNav";
import { Phase2CapstoneReportPanel } from "@/components/Phase2CapstoneReport";

export const metadata = {
  title: "Phase 2 Capstone Report | Automated Equity Research Engine",
  description:
    "Production dry run verification, milestone sign-offs, and architectural certifications for Phase 2 sealed at v0.9.0.",
};

export default function CapstonePage() {
  return (
    <main className="min-h-screen bg-transparent text-gray-100 font-sans selection:bg-amber-500 selection:text-black relative overflow-hidden flex flex-col justify-between">
      {/* Background Subtle Gradient Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Futuristic HUD Navigation */}
      <CyberTopNav />

      {/* Main Capstone Container */}
      <div className="max-w-7xl mx-auto px-6 py-8 w-full relative z-10">
        <Phase2CapstoneReportPanel />
      </div>

      {/* Footer System Telemetry Status */}
      <footer className="border-t border-gray-800/80 py-6 bg-[#05070d]/90 relative z-10 text-xs text-gray-500 font-mono">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="text-gray-400">ENGINE STATE:</span>
            <span className="text-gray-300">Phase 2 Certified // Release v0.9.0 Invariant Pass Rate: 100%</span>
          </div>
          <div>RELEASE: v0.9.0 PRODUCTION DRY RUN CERTIFIED</div>
        </div>
      </footer>
    </main>
  );
}
