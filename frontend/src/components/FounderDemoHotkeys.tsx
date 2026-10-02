"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Command, Sparkles, ChevronUp, ChevronDown, Activity, ShieldCheck, FileCode, Compass, Home } from "lucide-react";
import { useSoundFX } from "@/hooks/useSoundFX";

export default function FounderDemoHotkeys() {
  const router = useRouter();
  const pathname = usePathname();
  const { playClick, playBlip } = useSoundFX();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger hotkeys if typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      switch (e.key) {
        case "1":
          e.preventDefault();
          playClick();
          router.push("/dashboard/AAPL");
          break;
        case "2":
          e.preventDefault();
          playClick();
          router.push("/about");
          break;
        case "3":
          e.preventDefault();
          playClick();
          router.push("/docs");
          break;
        case "4":
          e.preventDefault();
          playClick();
          router.push("/capstone");
          break;
        case "h":
        case "H":
          e.preventDefault();
          playClick();
          router.push("/");
          break;
        case "?":
          e.preventDefault();
          playBlip();
          setIsOpen((prev) => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, playClick, playBlip]);

  const shortcuts = [
    { key: "1", label: "Terminal Deck", href: "/dashboard/AAPL", icon: Activity },
    { key: "2", label: "7-Tier Topology", href: "/about", icon: Compass },
    { key: "3", label: "OpenAPI Explorer", href: "/docs", icon: FileCode },
    { key: "4", label: "Capstone Sign-Off", href: "/capstone", icon: ShieldCheck },
    { key: "H", label: "Home Showcase", href: "/", icon: Home },
  ];

  return (
    <aside aria-label="Founder Demo Dock" className="fixed bottom-2.5 right-2.5 sm:bottom-4 sm:right-4 z-50 font-mono text-xs select-none max-w-[calc(100vw-1.25rem)]">
      <div className="hud-panel corner-reticle rounded-xl border border-cyan-500/30 shadow-[0_0_20px_rgba(0,0,0,0.8)] backdrop-blur-xl overflow-hidden max-w-full">
        {/* Dock Header Button */}
        <button
          onClick={() => {
            playBlip();
            setIsOpen(!isOpen);
          }}
          className="flex items-center space-x-1.5 sm:space-x-2 px-2.5 py-1.5 sm:px-3 sm:py-2 text-slate-300 hover:text-cyan-300 hover:bg-slate-900/60 transition-colors w-full"
        >
          <Command className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="font-bold tracking-wider text-[10px] sm:text-[11px] uppercase hidden xs:inline">
            FOUNDER HOTKEYS
          </span>
          <span className="font-bold tracking-wider text-[10px] uppercase inline xs:hidden">
            HOTKEYS
          </span>
          <span className="text-[9px] sm:text-[10px] px-1 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            [?]
          </span>
          {isOpen ? (
            <ChevronDown className="w-3 h-3 text-slate-500 ml-auto shrink-0" />
          ) : (
            <ChevronUp className="w-3 h-3 text-slate-500 ml-auto shrink-0" />
          )}
        </button>

        {/* Expandable Navigation Drawer */}
        {isOpen && (
          <div className="p-2.5 sm:p-3 border-t border-cyan-500/20 bg-slate-950/95 space-y-1.5 max-w-[calc(100vw-2rem)] w-72">
            <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-2 font-bold flex items-center justify-between">
              <span>Instant Presentation Routing</span>
              <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
            </div>

            {shortcuts.map((sc) => {
              const Icon = sc.icon;
              const isActive = pathname === sc.href;
              return (
                <button
                  key={sc.key}
                  onClick={() => {
                    playClick();
                    router.push(sc.href);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${
                    isActive
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : "text-slate-400 hover:text-white hover:bg-slate-900/60"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Icon className="w-3 h-3 text-cyan-400" />
                    <span>{sc.label}</span>
                  </div>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-bold text-slate-300">
                    {sc.key}
                  </kbd>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
