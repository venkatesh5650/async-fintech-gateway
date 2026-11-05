"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LineChart,
  FileSearch,
  Library,
  Activity,
  Server,
  Menu,
  X,
  Search,
} from "lucide-react";
import TickerSearchModal from "@/components/TickerSearchModal";
import LogoutButton from "@/components/LogoutButton";
import SoundToggle from "@/components/SoundToggle";

const LAST_TICKER_KEY = "aer-last-ticker";
const RESERVED = new Set(["analytics", "filings", "runs", "platform"]);


export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lastTicker, setLastTicker] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(LAST_TICKER_KEY);
    if (stored) setLastTicker(stored);
  }, []);

  useEffect(() => {
    const parts = pathname.split("/").filter(Boolean);
    const segment = parts[1];
    if (parts[0] === "dashboard" && segment && !RESERVED.has(segment) && parts.length === 2) {
      const symbol = segment.toUpperCase();
      sessionStorage.setItem(LAST_TICKER_KEY, symbol);
      setLastTicker(symbol);
    }
    setMenuOpen(false);
  }, [pathname]);

  const onOverview = pathname === "/dashboard";
  const onMarkets = pathname.startsWith("/dashboard/analytics");
  const onRuns = pathname.startsWith("/dashboard/runs");
  const onFilings = pathname.startsWith("/dashboard/filings");
  const onPlatform = pathname.startsWith("/dashboard/platform");
  const onResearch =
    pathname.startsWith("/dashboard/") &&
    !onMarkets &&
    !onRuns &&
    !onFilings &&
    !onPlatform &&
    pathname.split("/").filter(Boolean).length === 2;

  const researchHref = lastTicker ? `/dashboard/${lastTicker}` : null;

  const nav = (
    <nav className="flex flex-col gap-1 px-3">
      <ShellLink href="/dashboard" active={onOverview} icon={LayoutDashboard} label="Overview" />
      <ShellLink href="/dashboard/analytics" active={onMarkets} icon={LineChart} label="Markets" />
      {researchHref ? (
        <ShellLink href={researchHref} active={onResearch} icon={FileSearch} label="Research" hint={lastTicker ?? undefined} />
      ) : (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800/80"
        >
          <FileSearch className="h-4 w-4 shrink-0 text-slate-400" />
          <span>Research</span>
        </button>
      )}
      <ShellLink href="/dashboard/filings" active={onFilings} icon={Library} label="Filings" />
      <ShellLink href="/dashboard/runs" active={onRuns} icon={Activity} label="Runs" />
      <div className="mt-4 px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        Engineer
      </div>
      <ShellLink href="/dashboard/platform" active={onPlatform} icon={Server} label="Platform" />
    </nav>
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <aside className="hidden h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-950 md:flex">
        <div className="px-5 py-5">
          <div className="text-sm font-semibold tracking-tight text-slate-100">Equity Research</div>
          <div className="mt-1 text-xs text-slate-500">Research desk</div>
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="mx-3 mb-4 flex items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-400 hover:border-slate-700 hover:text-slate-200"
        >
          <Search className="h-4 w-4" />
          Search a stock
        </button>
        {nav}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-800 px-3 py-3">
          <SoundToggle />
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-800 bg-slate-950 px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-md border border-slate-800 p-2 text-slate-200"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <span className="text-sm font-medium text-slate-100">Equity Research</span>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="ml-auto rounded-md border border-slate-800 p-2 text-slate-300"
            aria-label="Search a stock"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
        {menuOpen && (
          <div className="border-b border-slate-800 bg-slate-950 py-3 md:hidden">
            {nav}
            <div className="mt-3 flex items-center justify-between px-3">
              <SoundToggle />
              <LogoutButton />
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      <TickerSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function ShellLink({
  href,
  active,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
        active ? "bg-slate-800 text-slate-50" : "text-slate-300 hover:bg-slate-800/80"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-cyan-300" : "text-slate-400"}`} />
      <span>{label}</span>
      {hint && <span className="ml-auto text-[10px] text-slate-500">{hint}</span>}
    </Link>
  );
}
