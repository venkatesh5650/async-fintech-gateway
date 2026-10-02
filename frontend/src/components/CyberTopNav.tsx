"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Activity, Cpu, ShieldCheck, FileCode, Compass } from "lucide-react";
import SoundToggle from "@/components/SoundToggle";
import { useSoundFX } from "@/hooks/useSoundFX";

export default function CyberTopNav() {
  const pathname = usePathname();
  const { playClick } = useSoundFX();

  const navLinks = [
    { label: "Command Terminal", href: "/dashboard/AAPL", icon: Activity },
    { label: "Capstone Sign-off", href: "/capstone", icon: ShieldCheck },
    { label: "API Explorer", href: "/docs", icon: FileCode },
    { label: "Architecture Spec", href: "/about", icon: Compass },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-cyan-500/20 bg-[#030712]/85 backdrop-blur-xl transition-all duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand / Swarm Core */}
        <Link
          href="/"
          onClick={() => playClick()}
          className="flex items-center space-x-3 group"
        >
          <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-950/60 to-slate-900 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_15px_rgba(0,240,255,0.25)] group-hover:border-cyan-400 group-hover:shadow-[0_0_20px_rgba(0,240,255,0.5)] transition-all duration-300">
            <Bot className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform duration-300" />
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 absolute -top-0.5 -right-0.5 animate-ping" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs sm:text-sm font-bold tracking-wider text-slate-100 group-hover:text-cyan-300 transition-colors">
                FINTECH GATEWAY
              </span>
              <span className="hidden sm:inline px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                v0.9.0
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-500 tracking-tight flex items-center space-x-1">
              <Cpu className="w-2.5 h-2.5 text-emerald-400 inline" />
              <span>AUTONOMOUS SWARM ACTIVE</span>
            </span>
          </div>
        </Link>

        {/* Center Navigation Links */}
        <nav className="hidden lg:flex items-center space-x-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => playClick()}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-all duration-200 ${
                  isActive
                    ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.15)]"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-cyan-400" : "text-slate-500"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Action Stack: Telemetry Badge + Sound FX + Auth */}
        <div className="flex items-center space-x-3">
          {/* Heartbeat Telemetry */}
          <div className="hidden sm:flex items-center space-x-2 bg-slate-900/80 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[11px] font-mono text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
            <span className="tracking-wide">ZERO-TRUST 100%</span>
          </div>

          {/* Sound Synthesizer Controller */}
          <SoundToggle />

          {/* Terminal Session / Login */}
          <Link
            href="/login"
            onClick={() => playClick()}
            className="px-3.5 py-1.5 text-xs font-mono font-semibold tracking-wider text-slate-200 hover:text-white bg-slate-900/90 border border-slate-700/80 hover:border-cyan-500/50 rounded-lg hover:shadow-[0_0_12px_rgba(0,240,255,0.25)] transition-all duration-200"
          >
            Access Deck
          </Link>
        </div>
      </div>
    </header>
  );
}
