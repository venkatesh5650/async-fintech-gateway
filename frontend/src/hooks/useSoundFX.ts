"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export function useSoundFX() {
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("fintech_gateway_audio_muted");
    if (saved !== null) {
      setIsMuted(saved === "true");
    }
  }, []);

  const getAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem("fintech_gateway_audio_muted", String(next));
      return next;
    });
  }, []);

  // Subtle mechanical micro-click
  const playClick = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {
      // Audio playback suppressed safely
    }
  }, [isMuted, getAudioContext]);

  // Frequency-modulated telemetry blip
  const playBlip = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch {
      // Audio suppressed safely
    }
  }, [isMuted, getAudioContext]);

  // Harmonic chord for multi-agent consensus trigger
  const playConsensus = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const freqs = [523.25, 659.25, 783.99, 1046.5]; // C Major chord
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.04);

        gain.gain.setValueAtTime(0.025, ctx.currentTime + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.04 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.04);
        osc.stop(ctx.currentTime + idx * 0.04 + 0.35);
      });
    } catch {
      // Suppressed
    }
  }, [isMuted, getAudioContext]);

  // High-priority Alert/Breaker sound
  const playAlert = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      // Suppressed
    }
  }, [isMuted, getAudioContext]);

  return {
    isMuted,
    toggleMute,
    playClick,
    playBlip,
    playConsensus,
    playAlert,
  };
}
