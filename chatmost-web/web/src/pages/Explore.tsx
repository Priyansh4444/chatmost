import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type TopTarget, type LeaderboardEntry, type ChatterProfile } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmoteDisplay, KindBadge } from "@/components/emote";
import { ChatterProfileModal } from "@/components/ChatterProfileModal";
import { cn, formatNumber } from "@/lib/utils";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  BarChart2,
} from "lucide-react";

type KindFilter = "all" | "7tv" | "twitch" | "slang" | "word";
type SortMode = "uses_desc" | "users_desc" | "alpha_asc" | "uses_asc";

const PAGE_SIZE = 36;

export function Explore() {
  const [kind, setKind] = useState<KindFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("uses_desc");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);

  // Detail view state
  const [selectedTarget, setSelectedTarget] = useState<TopTarget | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ChatterProfile | null>(null);

  // All indexed targets from API
  const allTargets = useMemo(() => api.allTargets(), []);

  // Debounce search query
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
      setPage(1);
    }, 120);
    return () => clearTimeout(id);
  }, [query]);

  // Filter and sort targets
  const filteredTargets = useMemo(() => {
    return allTargets
      .filter((t) => {
        // Kind filter
        if (kind === "7tv" && t.kind !== "7tv") return false;
        if (kind === "twitch" && t.kind !== "twitch") return false;
        if (kind === "word" && t.kind !== "word") return false;
        if (kind === "slang" && !t.isSlang && !(t as any).isBrainrot) return false;

        // Search filter
        if (debouncedQuery && !t.name.toLowerCase().includes(debouncedQuery)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortMode === "uses_desc") return b.total - a.total;
        if (sortMode === "uses_asc") return a.total - b.total;
        if (sortMode === "users_desc") return b.users - a.users;
        if (sortMode === "alpha_asc") return a.name.localeCompare(b.name);
        return 0;
      });
  }, [allTargets, kind, sortMode, debouncedQuery]);

  // Paginated items
  const totalPages = Math.max(1, Math.ceil(filteredTargets.length / PAGE_SIZE));
  const paginatedTargets = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredTargets.slice(start, start + PAGE_SIZE);
  }, [filteredTargets, page]);

  // Counts breakdown
  const countsByKind = useMemo(() => {
    let tv7 = 0;
    let twitch = 0;
    let slang = 0;
    let word = 0;
    for (const t of allTargets) {
      if (t.kind === "7tv") tv7++;
      else if (t.kind === "twitch") twitch++;
      else if (t.kind === "word") word++;
      if (t.isSlang || (t as any).isBrainrot) slang++;
    }
    return { all: allTargets.length, tv7, twitch, slang, word };
  }, [allTargets]);

  // Select target for deep dive
  const openTargetDetail = useCallback(async (t: TopTarget) => {
    setSelectedTarget(t);
    try {
      const res = await api.leaderboard(t.kind, t.name, 100);
      setLeaderboard(res.entries);
    } catch {
      setLeaderboard([]);
    }
  }, []);

  const openChatterProfile = async (login: string) => {
    const profile = await api.chatterProfile(login);
    if (profile) {
      setSelectedProfile(profile);
    }
  };

  // Render Target Deep Dive view
  if (selectedTarget) {
    const topEntry = leaderboard[0];
    const totalUses = selectedTarget.total;
    const uniqueChatters = selectedTarget.users || leaderboard.length;

    return (
      <div className="flex flex-col gap-6 max-w-4xl mx-auto font-sans antialiased text-zinc-300">
        <button
          type="button"
          onClick={() => setSelectedTarget(null)}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 font-mono transition-colors w-fit"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Back to Lexicon</span>
        </button>

        {/* Hero Card */}
        <div className="border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
            <div className="flex items-center gap-4">
              {selectedTarget.url ? (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-zinc-800 bg-zinc-950 p-2">
                  <EmoteDisplay name={selectedTarget.name} url={selectedTarget.url} size="xl" />
                </div>
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-zinc-800 bg-zinc-950 text-xl font-bold text-zinc-200">
                  “ ”
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                    {selectedTarget.name}
                  </h1>
                  <KindBadge kind={selectedTarget.kind} />
                </div>
                <p className="text-xs text-zinc-400 mt-1 font-mono">
                  Tracked channel target · {selectedTarget.kind === "7tv" ? "7TV Emote" : selectedTarget.kind === "twitch" ? "Twitch Emote" : "Word/Slang"}
                </p>
              </div>
            </div>

            {topEntry && (
              <div className="flex flex-col items-start sm:items-end">
                <span className="text-xs text-zinc-500 font-medium">#1 Top Typer</span>
                <button
                  type="button"
                  onClick={() => openChatterProfile(topEntry.login)}
                  className="text-sm font-semibold text-zinc-100 hover:text-white underline underline-offset-4"
                >
                  {topEntry.displayName}
                </button>
                <span className="text-xs text-zinc-400 font-mono">
                  {formatNumber(topEntry.count)} uses ({Math.round((topEntry.count / totalUses) * 100)}% share)
                </span>
              </div>
            )}
          </div>

          {/* KPI Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-zinc-800/80 bg-zinc-950/60 p-3 flex flex-col">
              <span className="text-[11px] text-zinc-500 font-medium">Total Uses</span>
              <span className="text-lg font-bold text-zinc-100 font-mono mt-1 tabular-nums">
                {formatNumber(totalUses)}
              </span>
            </div>
            <div className="border border-zinc-800/80 bg-zinc-950/60 p-3 flex flex-col">
              <span className="text-[11px] text-zinc-500 font-medium">Unique Chatters</span>
              <span className="text-lg font-bold text-zinc-100 font-mono mt-1 tabular-nums">
                {formatNumber(uniqueChatters)}
              </span>
            </div>
            <div className="border border-zinc-800/80 bg-zinc-950/60 p-3 flex flex-col">
              <span className="text-[11px] text-zinc-500 font-medium">Chatter Penetration</span>
              <span className="text-lg font-bold text-zinc-100 font-mono mt-1 tabular-nums">
                {((uniqueChatters / 2176) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="border border-zinc-800/80 bg-zinc-950/60 p-3 flex flex-col">
              <span className="text-[11px] text-zinc-500 font-medium">Avg Uses / Chatter</span>
              <span className="text-lg font-bold text-zinc-100 font-mono mt-1 tabular-nums">
                {(totalUses / Math.max(1, uniqueChatters)).toFixed(1)}
              </span>
            </div>
          </div>

          {/* Full Chatter Leaderboard Table */}
          <div>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                <BarChart2 className="h-4 w-4 text-zinc-400" />
                Complete Chatter Leaderboard ({leaderboard.length} ranked chatters)
              </h2>
              <span className="text-xs text-zinc-500 font-mono">
                ranked by total uses
              </span>
            </div>

            {leaderboard.length > 0 ? (
              <div className="border border-zinc-800 bg-zinc-950 max-h-[500px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 text-zinc-400 text-[11px]">
                    <tr>
                      <th className="py-2 px-3 w-16 font-mono text-center">Rank</th>
                      <th className="py-2 px-3">Chatter</th>
                      <th className="py-2 px-3 text-right font-mono">Count</th>
                      <th className="py-2 px-3 text-right font-mono">% Share</th>
                      <th className="py-2 px-3 w-28">Usage Bar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850">
                    {leaderboard.map((entry, idx) => {
                      const sharePct = totalUses > 0 ? (entry.count / totalUses) * 100 : 0;
                      const isTop3 = idx < 3;
                      return (
                        <tr
                          key={entry.login}
                          onClick={() => openChatterProfile(entry.login)}
                          className="hover:bg-zinc-900/60 cursor-pointer transition-colors"
                        >
                          <td className="py-2 px-3 font-mono text-center tabular-nums">
                            {isTop3 ? (
                              <span className={cn(
                                "inline-flex items-center justify-center h-5 w-5 font-bold text-[11px]",
                                idx === 0 && "text-amber-400 bg-amber-400/10 border border-amber-400/30",
                                idx === 1 && "text-zinc-300 bg-zinc-300/10 border border-zinc-300/30",
                                idx === 2 && "text-amber-600 bg-amber-600/10 border border-amber-600/30"
                              )}>
                                #{idx + 1}
                              </span>
                            ) : (
                              <span className="text-zinc-500">#{idx + 1}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-medium text-zinc-200">
                            {entry.displayName}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-zinc-100 tabular-nums">
                            {formatNumber(entry.count)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-zinc-400 tabular-nums">
                            {sharePct.toFixed(1)}%
                          </td>
                          <td className="py-2 px-3">
                            <div className="h-1.5 w-full bg-zinc-800 overflow-hidden">
                              <div
                                className="h-full bg-zinc-300"
                                style={{ width: `${Math.min(100, Math.max(2, sharePct * 2))}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-zinc-500 border border-zinc-800">
                No recorded chatters found for this target.
              </div>
            )}
          </div>
        </div>

        <ChatterProfileModal
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto font-sans antialiased text-zinc-300">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Channel Lexicon & Emote Statistics
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Explore all 8,840+ tracked emotes, slang, and words with full chatter leaderboards
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
          <span><strong className="text-zinc-100 font-semibold">{formatNumber(countsByKind.tv7)}</strong> 7TV</span>
          <span className="text-zinc-600">·</span>
          <span><strong className="text-zinc-100 font-semibold">{formatNumber(countsByKind.twitch)}</strong> Twitch</span>
          <span className="text-zinc-600">·</span>
          <span><strong className="text-zinc-100 font-semibold">{formatNumber(countsByKind.slang)}</strong> Slang</span>
        </div>
      </div>

      {/* Control Bar: Filter Tabs + Search + Sort */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between border-b border-zinc-800 pb-3">
        {/* Kind Filters */}
        <div className="flex flex-wrap items-center gap-1">
          {[
            { id: "all", label: `All (${formatNumber(countsByKind.all)})` },
            { id: "7tv", label: `7TV (${formatNumber(countsByKind.tv7)})` },
            { id: "twitch", label: `Twitch (${formatNumber(countsByKind.twitch)})` },
            { id: "slang", label: `Slang (${countsByKind.slang})` },
            { id: "word", label: `Words (${formatNumber(countsByKind.word)})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setKind(tab.id as KindFilter);
                setPage(1);
              }}
              className={cn(
                "px-3 py-1.5 text-xs transition-colors rounded-none border",
                kind === tab.id
                  ? "border-zinc-300 bg-zinc-100 text-zinc-900 font-semibold"
                  : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1 md:w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search targets..."
              className="border-zinc-800 bg-zinc-950 pl-8 text-xs font-sans text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-500 h-8"
            />
          </div>

          {/* Sort Selector */}
          <select
            value={sortMode}
            onChange={(e) => {
              setSortMode(e.target.value as SortMode);
              setPage(1);
            }}
            aria-label="Sort lexicon entries"
            className="border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-sans text-zinc-300 focus:outline-none focus:border-zinc-500 h-8"
          >
            <option value="uses_desc">🔥 Most Uses</option>
            <option value="users_desc">👥 Most Chatters</option>
            <option value="alpha_asc">🔤 Name (A–Z)</option>
            <option value="uses_asc">💎 Hidden Lore</option>
          </select>
        </div>
      </div>

      {/* Target Grid Cards */}
      <div>
        <div className="flex items-center justify-between text-xs text-zinc-500 mb-3 font-mono">
          <span>Showing {filteredTargets.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filteredTargets.length)} of {formatNumber(filteredTargets.length)} matches</span>
          <span>Page {page} of {totalPages}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {paginatedTargets.map((t, idx) => {
            const overallRank = (page - 1) * PAGE_SIZE + idx + 1;
            return (
              <button
                key={`${t.kind}:${t.name}`}
                type="button"
                onClick={() => void openTargetDetail(t)}
                className="group border border-zinc-800 bg-zinc-950/60 p-3 text-left hover:border-zinc-600 hover:bg-zinc-900/60 transition-all flex flex-col justify-between min-h-[96px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {t.url ? (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-zinc-800 bg-zinc-900">
                        <EmoteDisplay name={t.name} url={t.url} size="sm" />
                      </div>
                    ) : (
                      <span className="font-mono text-zinc-500 text-xs shrink-0 w-4 text-center">
                        #{overallRank}
                      </span>
                    )}
                    <span className="font-semibold text-xs text-zinc-200 group-hover:text-white truncate">
                      {t.name}
                    </span>
                  </div>
                  <KindBadge kind={t.kind} />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-2 border-t border-zinc-900 mt-2">
                  <span>
                    <strong className="text-zinc-100 font-semibold">{formatNumber(t.total)}</strong> uses
                  </span>
                  <span>
                    {formatNumber(t.users)} users
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {filteredTargets.length === 0 && (
          <div className="py-16 text-center text-xs text-zinc-500 border border-zinc-800">
            No targets found matching “{query}”.
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-800 pt-4 mt-4">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="border-zinc-800 bg-transparent text-xs text-zinc-300 hover:text-white"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
            </Button>

            <div className="flex items-center gap-1 font-mono text-xs text-zinc-400">
              <span>Page</span>
              <span className="text-zinc-100 font-semibold">{page}</span>
              <span>of</span>
              <span className="text-zinc-100 font-semibold">{totalPages}</span>
            </div>

            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="border-zinc-800 bg-transparent text-xs text-zinc-300 hover:text-white"
            >
              Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        )}
      </div>

      <ChatterProfileModal
        profile={selectedProfile}
        onClose={() => setSelectedProfile(null)}
      />
    </div>
  );
}