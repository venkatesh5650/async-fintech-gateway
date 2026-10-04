"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface SectionSkeletonProps {
  height: string;
  label: string;
  icon?: React.ReactNode;
}

export function SectionSkeleton({ height, label, icon }: SectionSkeletonProps) {
  return (
    <div
      className="relative rounded-xl border border-slate-800/60 bg-slate-950/80 backdrop-blur-sm overflow-hidden"
      style={{
        height,
        overflow: "hidden",
        overflowAnchor: "none",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.05) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "shimmer-sweep 1.8s ease-in-out infinite",
        }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-lg bg-slate-900/70 border border-slate-800/80">
          {icon || <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />}
          <span className="text-xs font-mono text-slate-400 tracking-wider uppercase">
            {label}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-cyan-500/40"
              style={{
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer-sweep {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>
    </div>
  );
}
