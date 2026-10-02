import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import CyberBackgroundCanvas from "@/components/CyberBackgroundCanvas";
import FounderDemoHotkeys from "@/components/FounderDemoHotkeys";
import { BikeTransitionProvider } from "@/context/BikeTransitionContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#030712",
};

export const metadata: Metadata = {
  title: "⚡ Autonomous Equity Research Gateway | Multi-Agent FinTech Command",
  description:
    "Institutional-grade autonomous multi-agent quantitative equity research platform powered by LangGraph, FastAPI, Redis Streams, and PostgreSQL pgvector.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark w-full max-w-full overflow-x-hidden`}
    >
      <body className="min-h-full flex flex-col bg-[#030712] text-slate-100 font-sans selection:bg-cyan-500 selection:text-black relative w-full max-w-full overflow-x-hidden">
        {/* Living Multi-Agent Ambient Neural Background */}
        <CyberBackgroundCanvas />
        <BikeTransitionProvider>
          <div className="relative z-10 flex-1 flex flex-col w-full max-w-full overflow-x-hidden">{children}</div>
        </BikeTransitionProvider>
        {/* Founder Presentation Quick-Dock & Keyboard Navigation */}
        <FounderDemoHotkeys />
      </body>
    </html>
  );
}
