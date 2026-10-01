import { Metadata } from "next";
import { ProductionSmokeTestPanel } from "@/components/ProductionSmokeTestPanel";

export const metadata: Metadata = {
  title: "Phase 3 Capstone Seal • Production Go-Live Certification",
  description:
    "120-Day Automated Equity Research Engine Phase 3 Milestone 2 Capstone Seal and Production Go-Live Readiness Certificate (v1.0.0-rc1).",
};

export default function GoLivePage() {
  return (
    <main className="min-h-screen bg-gray-950 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <ProductionSmokeTestPanel />
      </div>
    </main>
  );
}
