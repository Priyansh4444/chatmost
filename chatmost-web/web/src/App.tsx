import { useState } from "react";
import { Game } from "./pages/Game";
import { HigherLower } from "./pages/HigherLower";
import { Explore } from "./pages/Explore";
import { Stats } from "./pages/Stats";
import { cn } from "./lib/utils";

type Page = "game" | "higherlower" | "stats" | "explore";

const NAV: { id: Page; label: string }[] = [
  { id: "game", label: "Millionaire" },
  { id: "higherlower", label: "Higher or Lower" },
  { id: "stats", label: "Analytics & Feud" },
  { id: "explore", label: "Lexicon" },
];

export default function App() {
  const [page, setPage] = useState<Page>("game");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-16 font-sans text-xs antialiased text-zinc-300 selection:bg-zinc-700 selection:text-white">
      {/* Clean Minimal Header */}
      <header className="sticky top-0 z-30 -mx-4 border-b border-zinc-800/80 bg-[#09090b]/85 px-4 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 max-w-5xl mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setPage("game")}
              className="flex items-center gap-2 text-left group"
            >
              <span className="font-mono text-xs font-bold px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-100">
                c_
              </span>
              <span className="text-sm font-semibold tracking-tight text-zinc-100 group-hover:text-white transition-colors">
                chatmost
              </span>
            </button>

            {/* Navigation Switcher */}
            <nav className="flex items-center gap-1">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPage(item.id)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium transition-colors",
                    page === item.id
                      ? "bg-zinc-800/90 text-zinc-100 font-semibold"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Minimal Channel Info */}
          <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
            <span>#jo2uke</span>
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="mt-6 flex-1">
        {page === "game" && <Game />}
        {page === "higherlower" && <HigherLower />}
        {page === "stats" && <Stats />}
        {page === "explore" && <Explore />}
      </main>

      {/* Understated Minimal Footer */}
      <footer className="mt-16 border-t border-zinc-800/80 pt-5 text-[11px] text-zinc-500 font-mono flex flex-wrap items-center justify-between gap-2">
        <span>jo2uke chat archive · 236 stream days · 590K messages</span>
        <span>craft minimalist web</span>
      </footer>
    </div>
  );
}