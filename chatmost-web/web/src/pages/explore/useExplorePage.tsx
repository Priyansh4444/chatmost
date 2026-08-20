import { useEffect, useState } from "react";
import {
  api,
  type TopTarget,
  type LeaderboardEntry,
  type ChatterProfile,
  type SeChatter,
  type SeEmote,
  type SeCommand,
} from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmoteDisplay, KindBadge } from "@/components/emote";
import { RankedBarList } from "@/components/ui/chart-bar";
import { ChatterLineChart } from "@/components/dashboard/ChatterCharts";
import { buildCumulativeShare } from "@/lib/chatterCharts";
import { ChatterProfileModal } from "@/components/ChatterProfileModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatNumber } from "@/lib/utils";
import { useStreamer, useChannelData } from "@/lib/streamerContext";
import { useStats } from "@/hooks/useApiData";
import { StreamerHeroBar, StreamerErrorFallback } from "@/components/StreamerHeroBar";
import {
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type LexiconTab = "catalog" | "emotes_analytics" | "streamelements";
type KindFilter = "all" | "7tv" | "twitch" | "word";
type SortMode = "uses_desc" | "users_desc" | "alpha_asc" | "uses_asc";
type SeSubTab = "chatters" | "7tv" | "twitch" | "bttv_ffz" | "commands";

const PAGE_SIZE = 36;

export function useExplorePage() {
  const { streamer, channel } = useStreamer();
  const channelData = useChannelData(channel);
  const [useFastFallback, setUseFastFallback] = useState(false);
  const dynamicData = (useFastFallback ? channelData.data : channelData.data) ?? null;
  const stats = useStats(dynamicData).data ?? null;
  const [activeTab, setActiveTab] = useState<LexiconTab>("catalog");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("uses_desc");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);

  const blocked = !useFastFallback && channel !== "" && (channelData.isPending || channelData.isIngesting || channelData.isError || channelData.archiveFailed);
  const loading = blocked && (channelData.isPending || channelData.isIngesting);

  // Detail view state
  const [selectedTarget, setSelectedTarget] = useState<TopTarget | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ChatterProfile | null>(null);

  // Emote Analytics view mode
  const [emoteViewMode, setEmoteViewMode] = useState<"top" | "rarest" | "all">("top");

  // StreamElements Sub-View State
  const [seSubTab, setSeSubTab] = useState<SeSubTab>("chatters");
  const [seSearch, setSeSearch] = useState("");
  // The SE tab is "StreamElements Live": prefer the live snapshot over the
  // archive's baked-in copy so transient SE failures at build time can't
  // leave it empty.
  const liveSeData = channelData.seData ?? dynamicData;
  const seStats = api.streamelementsStats(liveSeData);
  const seChatters = api.streamelementsChatters(liveSeData);
  const seEmotes = api.streamelementsEmotes(liveSeData);
  const seCommands = api.streamelementsCommands(liveSeData);
  const allEmotes = api.allEmotes(dynamicData);

  // All indexed targets from API
  const allTargets = api.allTargets(dynamicData);

  // Debounce search query
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
      setPage(1);
    }, 120);
    return () => clearTimeout(id);
  }, [query]);

  // Filter and sort targets
  const filteredTargets = allTargets
    .filter((t) => {
      // Kind filter
      if (kind === "7tv" && t.kind !== "7tv") return false;
      if (kind === "twitch" && t.kind !== "twitch") return false;
      if (kind === "word" && t.kind !== "word") return false;

      // Search filter
      if (debouncedQuery && !t.name.toLowerCase().includes(debouncedQuery)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortMode === "uses_desc") return b.total - a.total;
      if (sortMode === "uses_asc") return a.total - b.total;
      if (sortMode === "users_desc") return (b.users ?? 0) - (a.users ?? 0);
      if (sortMode === "alpha_asc") return a.name.localeCompare(b.name);
      return 0;
    });

  // Paginated items
  const totalPages = Math.max(1, Math.ceil(filteredTargets.length / PAGE_SIZE));
  const paginatedTargets = filteredTargets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Counts breakdown
  let tv7 = 0;
  let twitch = 0;
  let word = 0;
  for (const t of allTargets) {
    if (t.kind === "7tv") tv7++;
    else if (t.kind === "twitch") twitch++;
    else if (t.kind === "word") word++;
  }
  const countsByKind = { all: allTargets.length, tv7, twitch, word };

  // Select target for deep dive
  const openTargetDetail = async (t: TopTarget) => {
    setSelectedTarget(t);
    try {
      const res = await api.leaderboard(t.kind, t.name, 100, dynamicData);
      setLeaderboard(res.entries);
    } catch {
      setLeaderboard([]);
    }
  };

  const openChatterProfile = async (login: string) => {
    const profile = await api.chatterProfile(login, dynamicData);
    if (profile) {
      setSelectedProfile(profile);
    }
  };

  // Render Target Deep Dive view
  if (selectedTarget) {
    const topEntry = leaderboard[0];
    const totalUses = selectedTarget.total;
    const uniqueChatters = selectedTarget.users ?? leaderboard.length;
    const hasPerTargetData = leaderboard.length > 0;
    const liveChannel = dynamicData !== null;

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
                  Tracked channel target · {selectedTarget.kind === "7tv" ? "7TV Emote" : selectedTarget.kind === "twitch" ? "Twitch Emote" : "Word"}
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
                {hasPerTargetData ? formatNumber(uniqueChatters) : "—"}
              </span>
            </div>
            <div className="border border-zinc-800/80 bg-zinc-950/60 p-3 flex flex-col">
              <span className="text-[11px] text-zinc-500 font-medium">Avg Uses / Chatter</span>
              <span className="text-lg font-bold text-zinc-100 font-mono mt-1 tabular-nums">
                {hasPerTargetData && uniqueChatters > 0 ? (totalUses / uniqueChatters).toFixed(1) : "—"}
              </span>
            </div>
            <div className="border border-zinc-800/80 bg-zinc-950/60 p-3 flex flex-col">
              <span className="text-[11px] text-zinc-500 font-medium">Type Classification</span>
              <span className="text-sm font-bold text-zinc-200 mt-1.5 uppercase font-mono">
                {selectedTarget.kind}
              </span>
            </div>
          </div>

          {!hasPerTargetData && liveChannel && (
            <div className="border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-400 font-sans">
              No individual chatter breakdown is indexed for “{selectedTarget.name}”.
            </div>
          )}

          {/* Usage Concentration Line Chart from real leaderboard data */}
          {hasPerTargetData && (
            <div className="border border-zinc-800 bg-zinc-950 p-3">
              <ChatterLineChart
                data={buildCumulativeShare(leaderboard)}
                title="Usage Concentration — Cumulative Share of Top Chatters"
                unit="%"
              />
            </div>
          )}

          {/* Top 100 Leaderboard Table */}
          {hasPerTargetData ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-200">
                  Top Chatters Using “{selectedTarget.name}”
                </h2>
                <span className="text-xs font-mono text-zinc-500">
                  {leaderboard.length} ranked
                </span>
              </div>

            <div className="border border-zinc-800 bg-zinc-950 max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-zinc-800 bg-zinc-900/60 text-xs">
                    <TableHead className="w-16 text-center font-mono">Rank</TableHead>
                    <TableHead>Chatter</TableHead>
                    <TableHead className="text-right font-mono">Count</TableHead>
                    <TableHead className="text-right font-mono">% Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((entry, idx) => {
                    const pct = totalUses > 0 ? ((entry.count / totalUses) * 100).toFixed(1) : "0.0";
                    return (
                      <TableRow
                        key={entry.login}
                        onClick={() => openChatterProfile(entry.login)}
                        className="cursor-pointer border-b border-zinc-850 hover:bg-zinc-900/50 transition-colors"
                      >
                        <TableCell className="text-center font-mono text-xs text-zinc-500 tabular-nums">
                          #{idx + 1}
                        </TableCell>
                        <TableCell className="font-medium text-zinc-200">
                          {entry.displayName}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-zinc-100 font-semibold tabular-nums">
                          {formatNumber(entry.count)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-zinc-400 tabular-nums">
                          {pct}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-200">
                  Top Chatters Using “{selectedTarget.name}”
                </h2>
              </div>
              <div className="border border-zinc-800 bg-zinc-950 p-6 text-center text-xs text-zinc-500 font-sans">
                No leaderboard data indexed{liveChannel ? " for this live channel" : " for this token"}.
              </div>
            </div>
          )}
        </div>

        <ChatterProfileModal
          profile={selectedProfile}
          totalChannelMsgs={stats?.messages ?? 0}
          onClose={() => setSelectedProfile(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto font-sans antialiased text-zinc-300">
      {/* Streamer Switcher & Status Hero Banner */}
      <StreamerHeroBar />

      {blocked ? (
        loading ? null : (
          <StreamerErrorFallback
            channel={channel}
            onRetry={channelData.retry}
            onUseFallback={channelData.seAvailable ? () => setUseFastFallback(true) : undefined}
          />
        )
      ) : (
        <>
          {/* Editorial Header */}
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-zinc-800 pb-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                #{channel} Channel Lexicon & Emote Analytics
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Indexed dictionary of {formatNumber(filteredTargets.length)}+ emotes, tokens, and records for #{channel}
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
              <span><strong className="text-zinc-100 font-semibold">{formatNumber(countsByKind.all)}</strong> tokens</span>
              <span className="text-zinc-600">·</span>
              <span><strong className="text-zinc-100 font-semibold">{formatNumber(countsByKind.tv7 + countsByKind.twitch)}</strong> emotes</span>
              <span className="text-zinc-600">·</span>
              <span><strong className="text-zinc-100 font-semibold">{formatNumber(countsByKind.word)}</strong> words</span>
            </div>
          </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-px overflow-x-auto">
        {[
          { id: "catalog", label: "Token Catalog & Index" },
          { id: "emotes_analytics", label: "Emote Lore & Rarities" },
          { id: "streamelements", label: "StreamElements Live" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as LexiconTab)}
            className={cn(
              "px-3.5 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
              activeTab === tab.id
                ? "border-zinc-100 text-zinc-100 font-semibold"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: TOKEN CATALOG */}
      {activeTab === "catalog" && (
        <div className="flex flex-col gap-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border border-zinc-800 bg-zinc-900/30 p-3">
            {/* Kind Filters */}
            <div className="flex flex-wrap items-center gap-1">
              {[
                { id: "all", label: `All (${countsByKind.all})` },
                { id: "7tv", label: `7TV (${countsByKind.tv7})` },
                { id: "twitch", label: `Twitch (${countsByKind.twitch})` },
                { id: "word", label: `Words (${countsByKind.word})` },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setKind(f.id as KindFilter);
                    setPage(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 text-xs font-mono transition-colors border",
                    kind === f.id
                      ? "border-zinc-300 bg-zinc-100 text-zinc-900 font-semibold"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search & Sort */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 border border-zinc-750 bg-zinc-950 px-2.5 py-1 w-48 sm:w-60">
                <Search className="h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  aria-label="Search tokens"
                  placeholder="Search token..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="bg-transparent text-xs font-sans text-zinc-100 placeholder:text-zinc-600 focus:outline-none w-full"
                />
              </div>

              <select
                aria-label="Sort tokens"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="border border-zinc-750 bg-zinc-950 px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none"
              >
                <option value="uses_desc">Most Uses</option>
                <option value="users_desc">Most Chatters</option>
                <option value="alpha_asc">Alphabetical</option>
                <option value="uses_asc">Fewest Uses</option>
              </select>
            </div>
          </div>

          {/* Grid of Token Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {paginatedTargets.map((t) => (
              <button
                key={`${t.kind}:${t.name}`}
                type="button"
                onClick={() => openTargetDetail(t)}
                className="border border-zinc-800 bg-zinc-950/70 p-3 flex flex-col items-center justify-between text-center transition-colors hover:border-zinc-600 hover:bg-zinc-900/40 group"
              >
                <div className="w-full flex items-center justify-between text-[9px] font-mono text-zinc-500 mb-2">
                  <KindBadge kind={t.kind} />
                  <span>{formatNumber(t.total)}</span>
                </div>

                <div className="py-2 flex flex-col items-center justify-center min-h-[48px]">
                  {t.url ? (
                    <EmoteDisplay name={t.name} url={t.url} size="lg" />
                  ) : (
                    <span className="font-bold text-sm text-zinc-200 group-hover:text-white truncate max-w-[120px]">
                      “{t.name}”
                    </span>
                  )}
                  {t.url && (
                    <span className="text-[10px] font-medium text-zinc-400 group-hover:text-zinc-200 mt-1 truncate max-w-[120px]">
                      {t.name}
                    </span>
                  )}
                </div>

                <div className="w-full border-t border-zinc-850 pt-1.5 flex items-center justify-between text-[9px] font-mono text-zinc-500">
                  <span>{t.users !== undefined ? `${formatNumber(t.users)} users` : "— users"}</span>
                  <span className="text-zinc-400 group-hover:text-zinc-200">View →</span>
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-800 pt-4 text-xs font-mono text-zinc-400">
              <span>
                Page {page} of {totalPages} ({filteredTargets.length} tokens)
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="border-zinc-800 bg-transparent text-xs h-7 px-2.5"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="border-zinc-800 bg-transparent text-xs h-7 px-2.5"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: EMOTE LORE & RARITIES */}
      {activeTab === "emotes_analytics" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEmoteViewMode("top")}
                className={cn(
                  "px-3 py-1 text-xs transition-colors border",
                  emoteViewMode === "top"
                    ? "border-zinc-300 bg-zinc-100 text-zinc-900 font-semibold"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200"
                )}
              >
                Top 25 Emotes
              </button>
              <button
                type="button"
                onClick={() => setEmoteViewMode("rarest")}
                className={cn(
                  "px-3 py-1 text-xs transition-colors border",
                  emoteViewMode === "rarest"
                    ? "border-zinc-300 bg-zinc-100 text-zinc-900 font-semibold"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200"
                )}
              >
                30 Niche Lore Emotes
              </button>
              <button
                type="button"
                onClick={() => setEmoteViewMode("all")}
                className={cn(
                  "px-3 py-1 text-xs transition-colors border",
                  emoteViewMode === "all"
                    ? "border-zinc-300 bg-zinc-100 text-zinc-900 font-semibold"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200"
                )}
              >
                All {dynamicData ? `${allEmotes.length}+` : "1,080+"} Emotes Catalog
              </button>
            </div>
            <span className="text-xs text-zinc-500 font-mono">
              {emoteViewMode === "top" ? "High volume" : emoteViewMode === "rarest" ? "Rare discovery" : "Full channel index"}
            </span>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/30 p-4">
            <RankedBarList
              data={
                emoteViewMode === "top"
                  ? (stats?.topEmotes || []).map((e, idx) => ({
                      label: e.name,
                      count: e.total,
                      url: e.url,
                      rank: idx + 1,
                    }))
                  : emoteViewMode === "rarest"
                  ? (stats?.rarestEmotes || []).map((e, idx) => ({
                      label: e.name,
                      count: e.total,
                      url: e.url,
                      rank: idx + 1,
                    }))
                  : allEmotes.map((e, idx) => ({
                      label: e.name,
                      count: e.total,
                      url: e.url,
                      rank: idx + 1,
                    }))
              }
              valueUnit="uses"
            />
          </div>
        </div>
      )}

      {/* TAB 4: STREAMELEMENTS GLOBAL */}
      {activeTab === "streamelements" && (
        <div className="flex flex-col gap-4">
          {/* Header & Source Info */}
          <div className="flex flex-wrap items-center justify-between gap-3 border border-zinc-800 bg-zinc-900/40 p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100">
                  StreamElements Official All-Time Stats
                </span>
                <span className="px-1.5 py-0.5 text-[9px] font-mono bg-indigo-950 text-indigo-400 border border-indigo-500/30 font-semibold">
                  Live Records
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                Tracking #{channel} Twitch chat · Official StreamElements & 7TV records
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
              <span><strong className="text-zinc-100 font-semibold">{formatNumber(seStats.messages)}</strong> messages</span>
              <span className="text-zinc-600">·</span>
              <span><strong className="text-zinc-100 font-semibold">{formatNumber(seStats.chatters)}</strong> unique chatters</span>
              <span className="text-zinc-600">·</span>
              <a
                href={streamer.streamElementsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4"
              >
                streamelements.com/c/{channel} ↗
              </a>
            </div>
          </div>

          {/* Sub-Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
            <div className="flex flex-wrap items-center gap-1">
              {[
                { id: "chatters", label: "Top 100 Chatters" },
                { id: "7tv", label: "7TV Emotes" },
                { id: "twitch", label: "Twitch Emotes" },
                { id: "bttv_ffz", label: "BTTV & FFZ" },
                { id: "commands", label: "Bot Commands" },
              ].map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => {
                    setSeSubTab(sub.id as SeSubTab);
                    setSeSearch("");
                  }}
                  className={cn(
                    "px-3 py-1 text-xs transition-colors rounded-none border",
                    seSubTab === sub.id
                      ? "border-zinc-300 bg-zinc-100 text-zinc-900 font-semibold"
                      : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {(seSubTab === "chatters" || seSubTab === "commands") && (
              <div className="w-48">
                <Input
                  value={seSearch}
                  onChange={(e) => setSeSearch(e.target.value)}
                  placeholder={seSubTab === "chatters" ? "Search chatter..." : "Search command..."}
                  className="border-zinc-800 bg-zinc-950 text-xs font-sans text-zinc-100 placeholder:text-zinc-600 h-7"
                />
              </div>
            )}
          </div>

          {/* Sub Tab: Chatters */}
          {seSubTab === "chatters" && (
            <div className="border border-zinc-800 bg-zinc-950 max-h-[500px] overflow-y-auto">
              {seChatters.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-zinc-800 bg-zinc-900/60 text-xs">
                      <TableHead className="w-16 text-center font-mono">Rank</TableHead>
                      <TableHead>Chatter</TableHead>
                      <TableHead className="text-right font-mono">Messages</TableHead>
                      <TableHead className="text-right font-mono">% of {formatNumber(seStats.messages)} Volume</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seChatters.reduce<React.ReactNode[]>((rows, c: SeChatter, idx: number) => {
                        const searchableName = c.displayName || c.login || "";
                        if (seSearch.trim() && !searchableName.toLowerCase().includes(seSearch.trim().toLowerCase())) {
                          return rows;
                        }
                        const name = c.displayName || c.login || "Chatter";
                        const msgCount = c.messages ?? c.total ?? 0;
                        const pct = seStats.messages > 0 ? (msgCount / seStats.messages) * 100 : 0;
                        rows.push(
                          <TableRow key={`${c.login || c.username || name}:${c.rank ?? msgCount}`} className="border-b border-zinc-850 hover:bg-zinc-900/50 transition-colors">
                            <TableCell className="text-center font-mono text-xs text-zinc-500 tabular-nums">
                              #{c.rank ?? idx + 1}
                            </TableCell>
                            <TableCell className="font-medium text-zinc-200">
                              {name}
                              {(c.login === "streamelements" || c.username === "streamelements") && (
                                <span className="ml-2 px-1 py-0.2 text-[9px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                                  BOT
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-zinc-100 font-semibold tabular-nums">
                              {formatNumber(msgCount)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-zinc-400 tabular-nums">
                              {pct.toFixed(2)}%
                            </TableCell>
                          </TableRow>
                        );
                        return rows;
                      }, [])}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-10 text-center text-xs text-zinc-500 font-sans">
                  No chatter data available{dynamicData ? " for this live channel" : ""}.
                </div>
              )}
            </div>
          )}

          {/* Sub Tab: 7TV */}
          {seSubTab === "7tv" && (
            <div className="border border-zinc-800 bg-zinc-900/30 p-4 max-h-[500px] overflow-y-auto">
              {(seEmotes["7tv"] || []).length > 0 ? (
                <RankedBarList
                  data={(seEmotes["7tv"] || []).map((e: SeEmote, idx: number) => ({
                    label: e.name,
                    count: e.total,
                    url: e.url,
                    rank: idx + 1,
                  }))}
                  valueUnit="uses"
                />
              ) : (
                <div className="py-10 text-center text-xs text-zinc-500 font-sans">
                  No 7TV emote usage data available{dynamicData ? " for this live channel" : ""}.
                </div>
              )}
            </div>
          )}

          {/* Sub Tab: Twitch */}
          {seSubTab === "twitch" && (
            <div className="border border-zinc-800 bg-zinc-900/30 p-4 max-h-[500px] overflow-y-auto">
              {(seEmotes["twitch"] || []).length > 0 ? (
                <RankedBarList
                  data={(seEmotes["twitch"] || []).map((e: SeEmote, idx: number) => ({
                    label: e.name,
                    count: e.total,
                    url: e.url,
                    rank: idx + 1,
                  }))}
                  valueUnit="uses"
                />
              ) : (
                <div className="py-10 text-center text-xs text-zinc-500 font-sans">
                  No Twitch emote usage data available{dynamicData ? " for this live channel" : ""}.
                </div>
              )}
            </div>
          )}

          {/* Sub Tab: BTTV & FFZ */}
          {seSubTab === "bttv_ffz" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-zinc-800 bg-zinc-900/30 p-4 max-h-[500px] overflow-y-auto">
                <div className="text-xs font-semibold text-zinc-200 mb-3">BetterTTV Emotes</div>
                {(seEmotes["bttv"] || []).length > 0 ? (
                  <RankedBarList
                    data={(seEmotes["bttv"] || []).map((e: SeEmote, idx: number) => ({
                      label: e.name,
                      count: e.total,
                      url: e.url,
                      rank: idx + 1,
                    }))}
                    valueUnit="uses"
                  />
                ) : (
                  <div className="py-10 text-center text-xs text-zinc-500 font-sans">
                    No BTTV emote usage data available{dynamicData ? " for this live channel" : ""}.
                  </div>
                )}
              </div>
              <div className="border border-zinc-800 bg-zinc-900/30 p-4 max-h-[500px] overflow-y-auto">
                <div className="text-xs font-semibold text-zinc-200 mb-3">FrankerFaceZ Emotes</div>
                {(seEmotes["ffz"] || []).length > 0 ? (
                  <RankedBarList
                    data={(seEmotes["ffz"] || []).map((e: SeEmote, idx: number) => ({
                      label: e.name,
                      count: e.total,
                      url: e.url,
                      rank: idx + 1,
                    }))}
                    valueUnit="uses"
                  />
                ) : (
                  <div className="py-10 text-center text-xs text-zinc-500 font-sans">
                    No FFZ emote usage data available{dynamicData ? " for this live channel" : ""}.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sub Tab: Commands */}
          {seSubTab === "commands" && (
            <div className="border border-zinc-800 bg-zinc-950 max-h-[500px] overflow-y-auto">
              {seCommands.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-zinc-800 bg-zinc-900/60 text-xs">
                      <TableHead className="w-16 text-center font-mono">Rank</TableHead>
                      <TableHead>Command</TableHead>
                      <TableHead className="text-right font-mono">Executions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seCommands.reduce<React.ReactNode[]>((rows, cmd: SeCommand, idx: number) => {
                      if (seSearch.trim() && !cmd.command.toLowerCase().includes(seSearch.trim().toLowerCase())) {
                        return rows;
                      }
                      rows.push(
                        <TableRow key={cmd.command} className="border-b border-zinc-850 hover:bg-zinc-900/50 transition-colors">
                          <TableCell className="text-center font-mono text-xs text-zinc-500 tabular-nums">
                            #{cmd.rank ?? idx + 1}
                          </TableCell>
                          <TableCell className="font-mono font-semibold text-indigo-400">
                            {cmd.command}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-zinc-100 font-semibold tabular-nums">
                            {formatNumber(cmd.amount ?? cmd.count ?? 0)}
                          </TableCell>
                        </TableRow>
                      );
                      return rows;
                    }, [])}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-10 text-center text-xs text-zinc-500 font-sans">
                  No bot command data available{dynamicData ? " for this live channel" : ""}.
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </>
      )}

      <ChatterProfileModal
        profile={selectedProfile}
        totalChannelMsgs={stats?.messages ?? 0}
        onClose={() => setSelectedProfile(null)}
      />
    </div>
  );
}
