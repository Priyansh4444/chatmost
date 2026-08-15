import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { api, type Stats as StatsData, type FeudCategory, type ChatterProfile } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmoteDisplay } from "@/components/emote";
import { RankedBarList } from "@/components/ui/chart-bar";
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
import {
  Search,
} from "lucide-react";

type StatsTab = "feud" | "chatters" | "lexicon" | "slang" | "inspector";

interface AutocompleteItem {
  label: string;
  value: string;
  type: string;
  url?: string | null;
}

export function Stats() {
  const [activeTab, setActiveTab] = useState<StatsTab>("feud");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatterSearch, setChatterSearch] = useState("");
  const [emoteViewMode, setEmoteViewMode] = useState<"top" | "rarest" | "all">("top");

  // Chatter Profile Dialog State
  const [selectedProfile, setSelectedProfile] = useState<ChatterProfile | null>(null);

  // Feud State
  const feudCategories = useMemo(() => api.feudCategories(), []);
  const [selectedCategoryIdx, setSelectedCategoryIdx] = useState(0);
  const [revealedRanks, setRevealedRanks] = useState<Set<number>>(new Set());
  const [guess, setGuess] = useState("");
  const [strikes, setStrikes] = useState(0);
  const [score, setScore] = useState(0);
  const [shake, setShake] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Autocomplete Suggestions State
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);

  // Target Inspector State
  const [inspectedTargetName, setInspectedTargetName] = useState<string>("LO");
  const [inspectedKind, setInspectedKind] = useState<string>("7tv");
  const [inspectedLeaderboard, setInspectedLeaderboard] = useState<{ login: string; displayName: string; count: number }[]>([]);

  const top200Chatters = useMemo(() => api.topChatters(200), []);
  const currentCategory: FeudCategory = feudCategories[selectedCategoryIdx] || feudCategories[0];

  // Full channel lexicon for neutral autocomplete without giving away answers
  const autocompleteDictionary = useMemo<AutocompleteItem[]>(() => {
    const allC = api.allChatters().map((c) => ({
      label: c.displayName,
      value: c.displayName,
      type: "Chatter",
      url: null,
    }));
    const allT = api.allTargets().map((t) => ({
      label: t.name,
      value: t.name,
      type: t.kind === "7tv" ? "7TV" : t.kind === "twitch" ? "Twitch" : "Word",
      url: t.url,
    }));

    const seen = new Set<string>();
    const combined: AutocompleteItem[] = [];
    for (const item of [...allC, ...allT]) {
      const lower = item.label.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        combined.push(item);
      }
    }
    return combined;
  }, []);

  // Filtered neutral suggestions based on typed input
  const suggestions = useMemo(() => {
    const q = guess.trim().toLowerCase();
    if (q.length < 2) return [];
    return autocompleteDictionary
      .filter((item) => item.label.toLowerCase().includes(q))
      .slice(0, 6);
  }, [guess, autocompleteDictionary]);

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Load target inspector leaderboard
  useEffect(() => {
    void api.leaderboard(inspectedKind, inspectedTargetName, 15).then((res) => {
      setInspectedLeaderboard(res.entries);
    });
  }, [inspectedKind, inspectedTargetName]);

  // Open Chatter Profile
  const openChatter = async (login: string) => {
    const profile = await api.chatterProfile(login);
    if (profile) {
      setSelectedProfile(profile);
    }
  };

  // Reset feud puzzle
  const resetFeud = useCallback((idx: number) => {
    setSelectedCategoryIdx(idx);
    setRevealedRanks(new Set());
    setStrikes(0);
    setScore(0);
    setGuess("");
    setFeedback(null);
    setShowSuggestions(false);
    setSelectedSuggestionIdx(-1);
  }, []);

  // Submit Feud Guess
  const feudInputRef = useRef<HTMLInputElement>(null);

  const processGuess = (rawGuess: string) => {
    const q = rawGuess.trim().toLowerCase();
    if (!q || strikes >= 3) return;

    setShowSuggestions(false);
    setSelectedSuggestionIdx(-1);

    const match = currentCategory.answers.find(
      (a) =>
        !revealedRanks.has(a.rank) &&
        (a.name.toLowerCase() === q ||
          a.name.toLowerCase().replace(/[^a-z0-9]/g, "") === q.replace(/[^a-z0-9]/g, ""))
    );

    if (match) {
      const points = (11 - match.rank) * 1000;
      setRevealedRanks((prev) => new Set([...prev, match.rank]));
      setScore((s) => s + points);
      setFeedback(`+${formatNumber(points)} pts — Revealed #${match.rank} (${match.name})`);
      setGuess("");
    } else {
      const alreadyRevealed = currentCategory.answers.some(
        (a) => revealedRanks.has(a.rank) && a.name.toLowerCase() === q
      );

      if (alreadyRevealed) {
        setFeedback("Already revealed");
      } else {
        const nextStrikes = strikes + 1;
        setStrikes(nextStrikes);
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setFeedback(`Strike ${nextStrikes}/3: "${rawGuess}" is not in the Top 10`);
      }
      setGuess("");
    }
    setTimeout(() => feudInputRef.current?.focus(), 10);
  };

  const submitGuess = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (selectedSuggestionIdx >= 0 && suggestions[selectedSuggestionIdx]) {
      processGuess(suggestions[selectedSuggestionIdx].value);
    } else {
      processGuess(guess);
    }
  };

  const handleSelectSuggestion = (item: AutocompleteItem) => {
    processGuess(item.value);
  };

  // Keyboard navigation for suggestions dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setSelectedSuggestionIdx(-1);
    } else if (e.key === "Tab" && selectedSuggestionIdx >= 0) {
      e.preventDefault();
      setGuess(suggestions[selectedSuggestionIdx].value);
      setShowSuggestions(false);
    }
  };

  const revealAll = () => {
    const all = new Set(currentCategory.answers.map((a) => a.rank));
    setRevealedRanks(all);
    setFeedback("All answers revealed");
    setShowSuggestions(false);
  };

  // Filter top 200 chatters
  const filteredTop200 = useMemo(() => {
    const q = chatterSearch.trim().toLowerCase();
    if (!q) return top200Chatters;
    return top200Chatters.filter(
      (c) =>
        c.login.toLowerCase().includes(q) ||
        c.displayName.toLowerCase().includes(q)
    );
  }, [chatterSearch, top200Chatters]);

  if (error) {
    return (
      <div className="border border-red-500/40 bg-red-500/5 p-4 text-xs text-center text-red-400">
        <p className="font-semibold mb-2">Error: {error}</p>
        <Button size="sm" onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Editorial Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Analytics & Feud
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Aug 25, 2025 – Aug 14, 2026 · 236 logged stream days
          </p>
        </div>

        {stats && (
          <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
            <span><strong className="text-zinc-100 font-semibold">{formatNumber(stats.messages)}</strong> msgs</span>
            <span className="text-zinc-600">·</span>
            <span><strong className="text-zinc-100 font-semibold">{formatNumber(stats.chatters)}</strong> chatters</span>
            <span className="text-zinc-600">·</span>
            <span><strong className="text-zinc-100 font-semibold">{formatNumber(stats.targets)}</strong> targets</span>
          </div>
        )}
      </div>

      {/* Understated Minimalist Tab Bar */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-px">
        {[
          { id: "feud", label: "Chat Feud" },
          { id: "chatters", label: "Top Chatters" },
          { id: "lexicon", label: "Emotes" },
          { id: "slang", label: "Slang Trends" },
          { id: "inspector", label: "Target Inspector" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as StatsTab)}
            className={cn(
              "px-3.5 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-zinc-100 text-zinc-100 font-semibold"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: CHAT FEUD */}
      {activeTab === "feud" && (
        <div className="flex flex-col gap-4">
          {/* Clean Category Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {feudCategories.map((cat, idx) => {
              const isSelected = selectedCategoryIdx === idx;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => resetFeud(idx)}
                  className={cn(
                    "px-3 py-1 text-xs transition-colors rounded-none border",
                    isSelected
                      ? "border-zinc-300 bg-zinc-100 text-zinc-900 font-semibold"
                      : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                  )}
                >
                  {cat.title}
                </button>
              );
            })}
          </div>

          {/* Feud Board Container */}
          <div className={cn("border border-zinc-800 bg-zinc-900/30 p-5 flex flex-col gap-4", shake && "animate-strike")}>
            {/* Board Header Bar */}
            <div className="flex items-center justify-between gap-4 border-b border-zinc-800/80 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  {currentCategory.title}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {currentCategory.prompt}
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-zinc-500 mr-1.5">Score</span>
                  <span className="font-semibold text-zinc-100 tabular-nums">{formatNumber(score)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-zinc-500 mr-1">Strikes</span>
                  <span className={cn("font-bold tracking-widest", strikes > 0 ? "text-red-400" : "text-zinc-600")}>
                    {strikes === 0 ? "—" : "X ".repeat(strikes).trim()}
                  </span>
                </div>
              </div>
            </div>

            {/* 10-Slot Board Grid */}
            <div className="grid gap-2 sm:grid-cols-2">
              {currentCategory.answers.map((ans) => {
                const isRevealed = revealedRanks.has(ans.rank);
                return (
                  <div
                    key={ans.rank}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 border transition-colors",
                      isRevealed
                        ? "border-zinc-600 bg-zinc-800/50 text-zinc-100"
                        : "border-zinc-800/70 bg-zinc-950/40 text-zinc-500"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-[11px] text-zinc-500 w-4 text-center tabular-nums">
                        {ans.rank}
                      </span>

                      {isRevealed ? (
                        <div className="flex items-center gap-2 truncate">
                          {ans.url && <EmoteDisplay name={ans.name} url={ans.url} size="sm" />}
                          <span className="font-medium text-xs text-zinc-100 truncate">{ans.name}</span>
                        </div>
                      ) : (
                        <span className="font-mono text-[10px] tracking-widest text-zinc-600">
                          ••••••••••
                        </span>
                      )}
                    </div>

                    <span className="font-mono text-xs tabular-nums shrink-0">
                      {isRevealed ? (
                        <strong className="text-zinc-200 font-semibold">{formatNumber(ans.count)}</strong>
                      ) : (
                        <span className="text-zinc-600 font-normal">{(11 - ans.rank) * 1000}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Clean Input Form & Autocomplete */}
            <div className="relative pt-2 border-t border-zinc-800/60">
              <form onSubmit={submitGuess} className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Input
                    ref={feudInputRef}
                    placeholder="Type a guess..."
                    value={guess}
                    onChange={(e) => {
                      setGuess(e.target.value);
                      setShowSuggestions(e.target.value.trim().length >= 2);
                      setSelectedSuggestionIdx(-1);
                    }}
                    onFocus={() => {
                      if (guess.trim().length >= 2) setShowSuggestions(true);
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={strikes >= 3 || revealedRanks.size === 10}
                    className="border-zinc-700 bg-zinc-950 text-xs font-sans text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-400 w-full"
                  />

                  {/* Autocomplete Suggestions */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute left-0 top-full mt-1 z-30 w-full border border-zinc-700 bg-zinc-900 shadow-xl divide-y divide-zinc-800">
                      {suggestions.map((item, sIdx) => {
                        const isSelected = sIdx === selectedSuggestionIdx;
                        return (
                          <div
                            key={`${item.type}:${item.value}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectSuggestion(item);
                            }}
                            className={cn(
                              "flex items-center justify-between px-3 py-2 cursor-pointer text-xs transition-colors",
                              isSelected
                                ? "bg-zinc-800 text-zinc-100 font-medium"
                                : "text-zinc-300 hover:bg-zinc-800/60"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {item.url && <EmoteDisplay name={item.label} url={item.url} size="sm" />}
                              <span className="truncate">{item.label}</span>
                            </div>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {item.type}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-1.5">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!guess.trim() || strikes >= 3 || revealedRanks.size === 10}
                    className="bg-zinc-100 text-zinc-900 hover:bg-white font-semibold text-xs px-4"
                  >
                    Submit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={revealAll}
                    className="border-zinc-800 bg-transparent text-zinc-400 hover:text-zinc-200 text-xs"
                  >
                    Reveal
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => resetFeud((selectedCategoryIdx + 1) % feudCategories.length)}
                    className="border-zinc-800 bg-transparent text-zinc-400 hover:text-zinc-200 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </form>
            </div>

            {/* Feedback message */}
            {feedback && (
              <div className="text-xs text-zinc-400 font-mono">
                {feedback}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TOP 200 CHATTERS */}
      {activeTab === "chatters" && (
        <div className="flex flex-col gap-3">
          {/* Quick Search */}
          <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-900/40 px-3 py-2">
            <Search className="h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search chatters..."
              value={chatterSearch}
              onChange={(e) => setChatterSearch(e.target.value)}
              className="w-full bg-transparent text-xs font-sans text-zinc-100 focus:outline-none placeholder:text-zinc-600"
            />
            <span className="text-xs font-mono text-zinc-500 tabular-nums shrink-0">
              {filteredTop200.length} chatters
            </span>
          </div>

          {/* Clean Table */}
          <div className="border border-zinc-800 bg-zinc-950 max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-800 bg-zinc-900/60 text-xs">
                  <TableHead className="w-16 text-center font-mono">Rank</TableHead>
                  <TableHead>Chatter</TableHead>
                  <TableHead className="text-right font-mono">Messages</TableHead>
                  <TableHead className="text-right">Profile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTop200.map((c, idx) => (
                  <TableRow
                    key={c.login}
                    onClick={() => openChatter(c.login)}
                    className="cursor-pointer border-b border-zinc-850 hover:bg-zinc-900/50 transition-colors"
                  >
                    <TableCell className="text-center font-mono text-xs text-zinc-500 tabular-nums">
                      #{idx + 1}
                    </TableCell>
                    <TableCell className="font-medium text-zinc-200">
                      {c.displayName}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-zinc-300 font-semibold tabular-nums">
                      {formatNumber(c.messages ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs text-zinc-400 hover:text-zinc-100">
                        View →
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 3: EMOTES */}
      {activeTab === "lexicon" && (
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
                All 1,080+ Emotes Catalog
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
                  : api.allEmotes().map((e, idx) => ({
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

      {/* TAB 4: SLANG TRENDS */}
      {activeTab === "slang" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-sm font-semibold text-zinc-100">
              Community Slang & Meme Trends
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              Channel frequency
            </span>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/30 p-4">
            <RankedBarList
              data={(stats?.topSlang || stats?.topBrainrot || []).map((b, idx) => ({
                label: `“${b.name}”`,
                count: b.total,
                url: b.url,
                rank: idx + 1,
              }))}
              valueUnit="uses"
            />
          </div>
        </div>
      )}

      {/* TAB 5: TARGET INSPECTOR */}
      {activeTab === "inspector" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 border border-zinc-800 bg-zinc-900/40 p-3">
            <span className="text-xs text-zinc-400 font-medium">Inspect:</span>
            <input
              type="text"
              value={inspectedTargetName}
              onChange={(e) => setInspectedTargetName(e.target.value)}
              placeholder="Target name (e.g. LO, guuh, pronsh, clappi)..."
              className="border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-400 flex-1"
            />
            <div className="flex items-center gap-1">
              {(["7tv", "twitch", "word"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setInspectedKind(k)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-mono transition-colors border",
                    inspectedKind === k
                      ? "border-zinc-300 bg-zinc-100 text-zinc-900 font-semibold"
                      : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/30 p-4">
            <div className="mb-3 font-semibold text-xs text-zinc-200">
              Leaderboard for “{inspectedTargetName}” ({inspectedKind})
            </div>

            {inspectedLeaderboard.length > 0 ? (
              <RankedBarList
                data={inspectedLeaderboard.map((e, idx) => ({
                  label: e.displayName,
                  count: e.count,
                  rank: idx + 1,
                }))}
                valueUnit="uses"
              />
            ) : (
              <div className="py-8 text-center text-zinc-500 text-xs">
                No usage recorded for this target yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Profile Viewer */}
      <ChatterProfileModal
        profile={selectedProfile}
        onClose={() => setSelectedProfile(null)}
      />
    </div>
  );
}