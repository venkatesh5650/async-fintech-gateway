"use client";

import React, { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { useSoundFX } from "@/hooks/useSoundFX";

export default function LogoutButton() {
  const { playClick } = useSoundFX();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    playClick();
    setIsLoggingOut(true);

    try {
      // Invalidate session cookie server-side via authentication gateway
      await fetch("/api/auth/logout", { method: "POST" });

      // Redirect client to login perimeter
      window.location.href = "/login";
    } catch (error) {
      console.error("Failed to execute logout", error);
      setIsLoggingOut(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      title="Terminate active zero-trust session"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-slate-300 hover:text-rose-300 bg-slate-900/90 hover:bg-rose-950/40 border border-slate-700/80 hover:border-rose-500/50 shadow-sm hover:shadow-[0_0_12px_rgba(244,63,94,0.25)] transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group shrink-0"
    >
      {isLoggingOut ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
      ) : (
        <LogOut className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-400 group-hover:-translate-x-0.5 transition-all" />
      )}
      <span>{isLoggingOut ? "Disconnecting..." : "Logout"}</span>
    </button>
  );
}