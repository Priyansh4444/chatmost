import { useState, useEffect } from "react";
import { Game } from "./pages/Game";
import { HigherLower } from "./pages/HigherLower";
import { Explore } from "./pages/Explore";
import { Stats } from "./pages/Stats";
import { QTEFloatingWidget } from "./components/qte/QTEFloatingWidget";
import { cn } from "./lib/utils";
import { useStreamer } from "./lib/streamerContext";
import { ChannelSwitcherModal } from "./components/ChannelSwitcherModal";
import { IngestOverlay } from "./components/IngestOverlay";
import { ChannelPicker } from "./components/ChannelPicker";
import { ArrowLeftRight, Github, Coffee } from "lucide-react";

type Page = "game" | "higherlower" | "stats" | "explore";

const NAV: { id: Page; label: string }[] = [
  { id: "game", label: "Save Your Chatters" },
  { id: "higherlower", label: "Higher or Lower" },
  { id: "stats", label: "Analytics & Feud" },
  { id: "explore", label: "Lexicon" },
];

export default function App() {
  const [page, setPage] = useState<Page>("game");
  const { channel, isLoadingStreamer, setIsChannelModalOpen } = useStreamer();

  // First-time visitors land on the picking UI
  useEffect(() => {
    if (!channel) setIsChannelModalOpen(true);
  }, [channel, setIsChannelModalOpen]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-16 font-sans text-xs antialiased text-zinc-300 selection:bg-primary selection:text-black">
      {/* Sleek Minimal Top Navigation with Interactive Channel Switcher & Links */}
      <header className="sticky top-0 z-30 -mx-4 border-b border-white/[0.06] bg-[#070709]/80 px-4 py-2.5 backdrop-blur-xl transition-[background-color,border-color,backdrop-filter]">
        <div className="mx-auto flex max-w-5xl flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          {/* Centered Segment Tabs */}
          <nav className="grid w-full grid-cols-2 gap-1 border border-white/[0.06] bg-white/[0.03] p-1 font-sans sm:flex sm:w-auto sm:items-center">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPage(item.id)}
                className={cn(
                  "px-2 py-1.5 text-[11px] tracking-tight transition-[background-color,border-color,color,box-shadow] duration-150 select-none sm:px-3.5 sm:text-xs",
                  page === item.id
                    ? "bg-white/[0.1] text-white font-semibold shadow-sm border border-white/[0.08]"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent"
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Dynamic Interactive Channel Indicator + GitHub & Ko-fi buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsChannelModalOpen(true)}
              title="Click to switch streamer / channel"
              className="group flex flex-1 sm:flex-none items-center justify-center gap-2 border border-white/[0.08] bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-zinc-300 transition-[background-color,border-color,color] hover:border-primary/60 hover:bg-white/[0.06] hover:text-white sm:justify-start"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  isLoadingStreamer ? "bg-amber-400 animate-pulse" : "bg-emerald-400 animate-pulse"
                )}
              />
              <span className="font-semibold text-zinc-200 group-hover:text-primary transition-colors">
                {channel ? `#${channel}` : "Pick a streamer"}
              </span>
              {isLoadingStreamer && (
                <span className="text-[9px] text-zinc-500 font-sans hidden sm:inline">syncing...</span>
              )}
              <ArrowLeftRight className="h-3 w-3 text-zinc-500 group-hover:text-primary transition-colors ml-0.5" />
            </button>

            <a
              href="https://github.com/Priyansh4444/chatmost"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex h-7 w-7 items-center justify-center border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:text-white hover:bg-white/[0.06] hover:border-white/20 transition-all"
              title="GitHub Repository (Priyansh4444/chatmost)"
            >
              <Github className="h-3.5 w-3.5" />
            </a>

            <a
              href="https://ko-fi.com/pronsh"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-mono font-medium text-amber-300 hover:bg-amber-500/20 hover:border-amber-400/50 transition-all"
              title="Support pronsh on Ko-fi"
            >
              <Coffee className="h-3 w-3 text-amber-400" />
              <span>Ko-fi</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Game Arena */}
      <main className="mt-6 flex-1">
        {!channel ? (
          <ChannelPicker />
        ) : (
          <>
            {page === "game" && <Game key={channel} />}
            {page === "higherlower" && <HigherLower key={channel} />}
            {page === "stats" && <Stats key={channel} />}
            {page === "explore" && <Explore key={channel} />}
          </>
        )}
      </main>

      {/* Understated Minimal Footer with Dynamic Channel, GitHub, and Ko-fi links */}
      <footer className="mt-16 border-t border-white/[0.06] pt-5 text-[11px] text-zinc-500 font-mono flex flex-wrap items-center justify-between gap-4">
        <span>
          {channel ? (
            <>
              <strong className="text-zinc-300 font-semibold">#{channel}</strong> Twitch chat archive · Official
              StreamElements & 7TV records
            </>
          ) : (
            "Twitch chat archives · Official StreamElements & 7TV records"
          )}
        </span>

        <div className="flex items-center gap-3 text-xs">
          <a
            href="https://github.com/Priyansh4444/chatmost"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"
            title="GitHub Repository (Priyansh4444/chatmost)"
          >
            <Github className="h-3.5 w-3.5" />
            <span>GitHub</span>
          </a>

          <span className="text-zinc-700">·</span>

          <a
            href="https://ko-fi.com/pronsh"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors font-medium"
            title="Support pronsh on Ko-fi"
          >
            <Coffee className="h-3.5 w-3.5" />
            <span>Ko-fi</span>
          </a>

          <span className="text-zinc-700">·</span>

          <button
            type="button"
            onClick={() => setIsChannelModalOpen(true)}
            className="text-zinc-500 hover:text-primary transition-colors underline underline-offset-4"
          >
            switch streamer
          </button>
        </div>
      </footer>

      {/* Global Channel Switcher Modal */}
      <ChannelSwitcherModal />

      {/* Full-screen blocking overlay while a live channel archive builds */}
      <IngestOverlay />

      {/* ⚡ Floating QTE Widget — always visible, minimal footprint */}
      <QTEFloatingWidget channel={channel || ""} />
    </div>
  );
}
