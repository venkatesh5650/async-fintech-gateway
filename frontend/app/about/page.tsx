import Link from "next/link";
import CyberTopNav from "@/components/CyberTopNav";
import { ArchitectureDiagramViewer } from "@/components/ArchitectureDiagramViewer";

export const metadata = {
  title: "System Architecture | Automated Equity Research Engine",
  description: "Enterprise multi-agent microservice architecture blueprint and interactive data plane specification.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-transparent text-gray-100 font-sans selection:bg-cyan-500 selection:text-black relative overflow-hidden flex flex-col justify-between">
      {/* Background Subtle Gradient Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#00f0ff08_1px,transparent_1px),linear-gradient(to_bottom,#00f0ff08_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Futuristic HUD Navigation */}
      <CyberTopNav />

      {/* Main Architecture Blueprint Container */}
      <div className="max-w-7xl mx-auto px-6 py-8 w-full relative z-10">
        <ArchitectureDiagramViewer />
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800/80 bg-[#05070d]/90 py-6 text-center text-xs font-mono text-gray-500">
        Automated Equity Research Engine · Phase 2 Capstone Architecture Blueprint · Built for Institutional FinTech
      </footer>
    </main>
  );
}
