"use client";

import React from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useSoundFX } from "@/hooks/useSoundFX";

export default function SoundToggle() {
  const { isMuted, toggleMute, playClick } = useSoundFX();

  const handleClick = () => {
    toggleMute();
    if (isMuted) {
      // Play a click right as it gets unmuted
      setTimeout(() => playClick(), 50);
    }
  };

  return (
    <button
      onClick={handleClick}
      title={isMuted ? "Unmute Neural Audio Feedback" : "Mute Audio Feedback"}
      className={`relative group px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center space-x-1.5 transition-all duration-200 ${
        isMuted
          ? "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
          : "bg-cyan-950/40 border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.2)]"
      }`}
    >
      {isMuted ? (
        <VolumeX className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
      ) : (
        <Volume2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
      )}
      <span className="hidden md:inline tracking-wider uppercase text-[10px]">
        {isMuted ? "FX OFF" : "FX ON"}
      </span>
      {!isMuted && (
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping absolute -top-0.5 -right-0.5" />
      )}
    </button>
  );
}
