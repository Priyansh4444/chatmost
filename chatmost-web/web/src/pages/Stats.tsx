import { useReducer, useRef } from "react";
import { api, type FeudCategory, type ChatterProfile } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmoteDisplay } from "@/components/emote";
import { ChatterProfileModal } from "@/components/ChatterProfileModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatNumber, isBot } from "@/lib/utils";
import { triggerMilestoneConfetti } from "@/lib/confetti";
import { useStreamer, useChannelData } from "@/lib/streamerContext";
import { useStats } from "@/hooks/useApiData";
import { StreamerHeroBar, StreamerErrorFallback } from "@/components/StreamerHeroBar";
import {
  Search,
  MessageSquareText,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
} from "lucide-react";

type StatsTab = "feud" | "longest" | "chatters";

interface AutocompleteItem {
  label: string;
  value: string;
  type: string;
  url?: string | null;
}

interface StatsPageState {
  useFastFallback: boolean;
  activeTab: StatsTab;
  chatterSearch: string;
  selectedProfile: ChatterProfile | null;
  longestSearch: string;
  longestChatterFilter: string;
  longestSort: "length_desc" | "words_desc";
  copiedId: string | null;
  selectedCategoryIdx: number;
  revealedRanks: Set<number>;
  lastRevealedRank: number | null;
  guess: string;
  strikes: number;
  score: number;
  shake: boolean;
  feedback: string | null;
  showSuggestions: boolean;
  selectedSuggestionIdx: number;
}

type StatsPageAction = {
  [K in keyof StatsPageState]: {
    field: K;
    value: StatsPageState[K] | ((previous: StatsPageState[K]) => StatsPageState[K]);
  }
}[keyof StatsPageState];

const initialState: StatsPageState = {
  useFastFallback: false, activeTab: "feud", chatterSearch: "", selectedProfile: null,
  longestSearch: "", longestChatterFilter: "all", longestSort: "length_desc", copiedId: null,
  selectedCategoryIdx: 0, revealedRanks: new Set(), lastRevealedRank: null, guess: "",
  strikes: 0, score: 0, shake: false, feedback: null, showSuggestions: false,
  selectedSuggestionIdx: -1,
};

function statsPageReducer(state: StatsPageState, action: StatsPageAction): StatsPageState {
  const previous = state[action.field];
  const value = typeof action.value === "function"
    ? (action.value as (item: typeof previous) => typeof previous)(previous)
    : action.value;
  return { ...state, [action.field]: value };
}

function useStatsPageModel() {
  const { channel } = useStreamer();
  const channelData = useChannelData(channel);
  const [state, dispatch] = useReducer(statsPageReducer, initialState);
  const set = <K extends keyof StatsPageState>(field: K, value: StatsPageState[K] | ((previous: StatsPageState[K]) => StatsPageState[K])) =>
    dispatch({ field, value } as StatsPageAction);
  const {
    useFastFallback, activeTab, chatterSearch, selectedProfile, longestSearch,
    longestChatterFilter, longestSort, copiedId, selectedCategoryIdx, revealedRanks,
    lastRevealedRank, guess, strikes, score, shake, feedback, showSuggestions,
    selectedSuggestionIdx,
  } = state;
  const setUseFastFallback = (value: boolean) => set("useFastFallback", value);
  const setActiveTab = (value: StatsTab) => set("activeTab", value);
  const setChatterSearch = (value: string) => set("chatterSearch", value);
  const setSelectedProfile = (value: ChatterProfile | null) => set("selectedProfile", value);
  const setLongestSearch = (value: string) => set("longestSearch", value);
  const setLongestChatterFilter = (value: string) => set("longestChatterFilter", value);
  const setLongestSort = (value: StatsPageState["longestSort"]) => set("longestSort", value);
  const setCopiedId = (value: string | null) => set("copiedId", value);
  const setSelectedCategoryIdx = (value: number) => set("selectedCategoryIdx", value);
  const setRevealedRanks = (value: StatsPageState["revealedRanks"] | ((previous: Set<number>) => Set<number>)) => set("revealedRanks", value);
  const setLastRevealedRank = (value: number | null) => set("lastRevealedRank", value);
  const setGuess = (value: string) => set("guess", value);
  const setStrikes = (value: number) => set("strikes", value);
  const setScore = (value: number | ((previous: number) => number)) => set("score", value);
  const setShake = (value: boolean) => set("shake", value);
  const setFeedback = (value: string | null) => set("feedback", value);
  const setShowSuggestions = (value: boolean) => set("showSuggestions", value);
  const setSelectedSuggestionIdx = (value: number | ((previous: number) => number)) => set("selectedSuggestionIdx", value);
  const dynamicData = (useFastFallback ? channelData.data : channelData.data) ?? null;
  const stats = useStats(dynamicData).data ?? null;

  const blocked = !useFastFallback && channel !== "" && (channelData.isPending || channelData.isIngesting || channelData.isError || channelData.archiveFailed);
  const loading = blocked && (channelData.isPending || channelData.isIngesting);

  const longestMessages = api.longestMessages(10000, dynamicData).filter((m) => !isBot(m.login));

  // Feud State
  const feudCategories = api.feudCategories(dynamicData);
  const allTargets = api.allTargets(dynamicData);

  const top200Chatters = api.topChatters(200, dynamicData).filter((c) => !isBot(c.login));
  const currentCategory: FeudCategory = feudCategories[selectedCategoryIdx] || feudCategories[0];

  // Full channel lexicon for neutral autocomplete without giving away answers
  const autocompleteDictionary: AutocompleteItem[] = (() => {
    const allC = api.allChatters(dynamicData).filter((c) => !isBot(c.login)).map((c) => ({
      label: c.displayName,
      value: c.displayName,
      type: "Chatter",
      url: null,
    }));
    const allT = allTargets.map((t) => ({
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
  })();

  // Filter autocomplete suggestions based on current user input
  const suggestions = (() => {
    const q = guess.trim().toLowerCase();
    if (q.length < 2) return [];

    return autocompleteDictionary
      .filter((item) => {
        const itemLower = item.label.toLowerCase();
        return itemLower.includes(q) || itemLower.replace(/[^a-z0-9]/g, "").includes(q);
      })
      .slice(0, 8);
  })();

  // Load chatter modal profile
  const openChatter = async (login: string) => {
    const profile = await api.chatterProfile(login, dynamicData);
    if (profile) {
      setSelectedProfile(profile);
    }
  };

  // Reset feud puzzle
  const resetFeud = (idx: number) => {
    setSelectedCategoryIdx(idx);
    setRevealedRanks(new Set());
    setLastRevealedRank(null);
    setStrikes(0);
    setScore(0);
    setGuess("");
    setFeedback(null);
    setShowSuggestions(false);
    setSelectedSuggestionIdx(-1);
  };

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
      setLastRevealedRank(match.rank);
      setRevealedRanks((prev) => new Set([...prev, match.rank]));
      setScore((s) => s + points);
      setFeedback(`+${formatNumber(points)} pts — Revealed #${match.rank} (${match.name})`);
      setGuess("");
      triggerMilestoneConfetti(1);
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
  const filteredTop200 = (() => {
    const q = chatterSearch.trim().toLowerCase();
    if (!q) return top200Chatters;
    return top200Chatters.filter(
      (c) =>
        c.login.toLowerCase().includes(q) ||
        c.displayName.toLowerCase().includes(q)
    );
  })();

  // Filter & sort longest messages
  const filteredLongestMessages = longestMessages
    .filter((m) => {
      if (longestChatterFilter !== "all" && m.login !== longestChatterFilter) {
        return false;
      }
      if (longestSearch.trim()) {
        const q = longestSearch.trim().toLowerCase();
        const matchText = m.text.toLowerCase().includes(q);
        const matchUser = m.displayName.toLowerCase().includes(q);
        if (!matchText && !matchUser) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (longestSort === "words_desc") return b.words - a.words;
      return b.length - a.length;
    });

  // Unique chatters in longest messages for filter dropdown
  const uniqueLongestChatters = (() => {
    const map = new Map<string, string>();
    for (const m of longestMessages) {
      map.set(m.login, m.displayName);
    }
    return Array.from(map.entries()).map(([login, name]) => ({ login, name }));
  })();

  const copyMessage = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return {
    channel, channelData, useFastFallback, activeTab, chatterSearch, selectedProfile,
    longestSearch, longestChatterFilter, longestSort, copiedId, selectedCategoryIdx,
    revealedRanks, lastRevealedRank, guess, strikes, score, shake, feedback,
    showSuggestions, selectedSuggestionIdx,
    dynamicData, stats, blocked, loading, longestMessages,
    feudCategories, currentCategory, suggestions, filteredTop200,
    filteredLongestMessages, uniqueLongestChatters,
    feudInputRef, setUseFastFallback, setActiveTab, setChatterSearch,
    setSelectedProfile, setLongestSearch, setLongestChatterFilter, setLongestSort,
    resetFeud, submitGuess, handleKeyDown,
    handleSelectSuggestion, revealAll, openChatter, copyMessage, setShowSuggestions,
    setGuess, setSelectedSuggestionIdx,
  };
}

type StatsPageModel = ReturnType<typeof useStatsPageModel>;

export function Stats() {
  const model = useStatsPageModel();
  const {
    channel, channelData, activeTab, selectedProfile, stats,
    blocked, loading, setUseFastFallback, setActiveTab, setSelectedProfile,
  } = model;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
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
              <h1 className="text-xl font-bold tracking-tight text-zinc-100">
                #{channel} Analytics & Feud
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                #{channel} community analytics · Live Ingested
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

      {/* Minimalist Tab Bar */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-px overflow-x-auto">
        {[
          { id: "feud", label: "Chat Feud" },
          { id: "longest", label: "Longest Messages (Yap Hall of Fame)" },
          { id: "chatters", label: "Top Chatters" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as StatsTab)}
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

      {/* TAB 1: CHAT FEUD */}
      {activeTab === "feud" && <FeudTab model={model} />}

      {/* TAB 2: LONGEST MESSAGES (YAP HALL OF FAME) */}
      {activeTab === "longest" && <LongestMessagesTab model={model} />}

      {/* TAB 3: TOP 200 CHATTERS */}
      {activeTab === "chatters" && <ChattersTab model={model} />}
      </>
      )}

      {/* Modal Profile Viewer */}
      <ChatterProfileModal
        profile={selectedProfile}
        totalChannelMsgs={stats?.messages ?? 0}
        onClose={() => setSelectedProfile(null)}
      />
    </div>
  );
}

function FeudTab({ model }: { model: StatsPageModel }) {
  const { feudCategories, selectedCategoryIdx, resetFeud, shake, currentCategory, score, strikes, revealedRanks, lastRevealedRank, feudInputRef, guess, setShowSuggestions, setGuess, setSelectedSuggestionIdx, handleKeyDown, showSuggestions, suggestions, selectedSuggestionIdx, handleSelectSuggestion, submitGuess, revealAll, feedback } = model;
  if (!currentCategory) {
    return <p className="py-16 text-center text-xs text-zinc-400">No chat archive data is available for Chat Feud yet.</p>;
  }
  return (
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
            <div className="grid gap-1.5 sm:grid-cols-2">
              {currentCategory.answers.map((ans) => {
                const isRevealed = revealedRanks.has(ans.rank);
                const isJustRevealed = lastRevealedRank === ans.rank;
                return (
                  <div
                    key={ans.rank}
                    className={cn(
                      "flex items-center justify-between px-3 py-2.5 border transition-all duration-200",
                      isRevealed
                        ? isJustRevealed
                          ? "border-white/40 bg-white/[0.07] text-white animate-correct-pop"
                          : "border-white/[0.12] bg-white/[0.03] text-zinc-200"
                        : "border-white/[0.05] bg-transparent text-zinc-600"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={cn(
                        "font-mono text-[10px] w-5 h-5 flex items-center justify-center font-bold tabular-nums shrink-0 border",
                        isRevealed ? "border-white/30 bg-white/10 text-white" : "border-white/[0.06] text-zinc-600"
                      )}>
                        {ans.rank}
                      </span>

                      {isRevealed ? (
                        <div className="flex items-center gap-2 truncate animate-flip-reveal">
                          <CheckCircle2 className="h-3.5 w-3.5 text-white/60 shrink-0" />
                          {ans.url && <EmoteDisplay name={ans.name} url={ans.url} size="sm" />}
                          <span className="font-semibold text-xs text-white truncate">{ans.name}</span>
                        </div>
                      ) : (
                        <span className="font-mono text-[10px] tracking-widest text-zinc-800 select-none">
                          ············
                        </span>
                      )}
                    </div>

                    <span className="font-mono text-xs tabular-nums shrink-0">
                      {isRevealed ? (
                        <strong className="text-white font-semibold">{formatNumber(ans.count)}</strong>
                      ) : (
                        <span className="text-zinc-700">{(11 - ans.rank) * 1000}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Input Form & Autocomplete */}
            <div className="relative pt-2 border-t border-white/[0.06]">
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
                    className="border-white/[0.08] bg-white/[0.02] text-xs font-sans text-zinc-100 placeholder:text-zinc-700 focus-visible:border-white/30 w-full"
                  />

                  {/* Autocomplete Suggestions */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute left-0 top-full mt-1 z-30 w-full border border-white/[0.08] bg-zinc-950 shadow-xl divide-y divide-white/[0.05]">
                      {suggestions.map((item, sIdx) => {
                        const isSel = sIdx === selectedSuggestionIdx;
                        return (
                          <button
                            type="button"
                            key={`${item.type}:${item.value}`}
                            onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(item); }}
                            className={cn(
                              "flex w-full items-center justify-between px-3 py-2 cursor-pointer text-xs transition-colors",
                              isSel ? "bg-white/[0.07] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.04]"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {item.url && <EmoteDisplay name={item.label} url={item.url} size="sm" />}
                              <span className="truncate">{item.label}</span>
                            </div>
                            <span className="text-[10px] text-zinc-600 font-mono">{item.type}</span>
                          </button>
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
                    className="bg-primary text-white hover:bg-primary/90 font-semibold text-xs px-4"
                  >
                    Submit
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={revealAll}
                    className="border-white/[0.08] bg-transparent text-zinc-400 hover:text-zinc-200 text-xs">
                    Reveal
                  </Button>
                  <Button type="button" size="sm" variant="outline"
                    onClick={() => resetFeud((selectedCategoryIdx + 1) % feudCategories.length)}
                    className="border-white/[0.08] bg-transparent text-zinc-400 hover:text-zinc-200 text-xs">
                    Next
                  </Button>
                </div>
              </form>
            </div>

            {/* Feedback */}
            {feedback && (
              <div className={cn(
                "px-3 py-2.5 text-xs font-mono flex items-center gap-2 border transition-all duration-200",
                feedback.startsWith("+")
                  ? "border-white/20 bg-white/[0.05] text-white animate-correct-pop"
                  : feedback.startsWith("Strike")
                  ? "border-primary/40 bg-primary/[0.06] text-primary animate-wrong-shake"
                  : "border-white/[0.06] bg-transparent text-zinc-500"
              )}>
                {feedback.startsWith("+") ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-white/60 shrink-0" />
                ) : feedback.startsWith("Strike") ? (
                  <XCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                ) : null}
                <span>{feedback}</span>
              </div>
            )}
          </div>
        </div>
      );
}

function LongestMessagesTab({ model }: { model: StatsPageModel }) {
  const { longestMessages, longestSearch, setLongestSearch, longestChatterFilter, setLongestChatterFilter, uniqueLongestChatters, longestSort, setLongestSort, filteredLongestMessages, copiedId, openChatter, copyMessage } = model;
  return (
        <div className="flex flex-col gap-4">
          {/* Header & KPI Summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 border border-primary/40 bg-primary/10 flex items-center justify-center text-primary">
                <MessageSquareText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  Per-User Longest Messages & Essays (Descending Order)
                  <span className="px-1.5 py-0.2 text-[9px] font-mono bg-zinc-800 text-primary border border-primary/30">
                    Yap Hall of Fame
                  </span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  1 top genuine yap per chatter ranked strictly by character & word length (emote spam filtered out). Click a chatter to read all their personal essays.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
              <span><strong className="text-zinc-100 font-semibold">{longestMessages.length}</strong> unique yappers</span>
              <span className="text-zinc-600">·</span>
              <span>Max: <strong className="text-primary font-semibold">500</strong> chars</span>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border border-zinc-800 bg-zinc-900/30 p-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
              <div className="flex items-center gap-1.5 border border-zinc-750 bg-zinc-950 px-2.5 py-1 flex-1 max-w-sm">
                <Search className="h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  aria-label="Search longest messages"
                  placeholder="Search message text or chatter..."
                  value={longestSearch}
                  onChange={(e) => setLongestSearch(e.target.value)}
                  className="bg-transparent text-xs font-sans text-zinc-100 placeholder:text-zinc-600 focus:outline-none w-full"
                />
              </div>

              <select
                aria-label="Filter longest messages by chatter"
                value={longestChatterFilter}
                onChange={(e) => setLongestChatterFilter(e.target.value)}
                className="border border-zinc-750 bg-zinc-950 px-2.5 py-1 text-xs font-mono text-zinc-200 focus:outline-none"
              >
                <option value="all">All Chatters ({uniqueLongestChatters.length})</option>
                {uniqueLongestChatters.map((c) => (
                  <option key={c.login} value={c.login}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Toggle */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setLongestSort("length_desc")}
                className={cn(
                  "px-2.5 py-1 text-xs font-mono transition-colors border",
                  longestSort === "length_desc"
                    ? "border-zinc-300 bg-zinc-100 text-zinc-900 font-semibold"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200"
                )}
              >
                Characters ↓
              </button>
              <button
                type="button"
                onClick={() => setLongestSort("words_desc")}
                className={cn(
                  "px-2.5 py-1 text-xs font-mono transition-colors border",
                  longestSort === "words_desc"
                    ? "border-zinc-300 bg-zinc-100 text-zinc-900 font-semibold"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200"
                )}
              >
                Words ↓
              </button>
            </div>
          </div>

          {/* Messages List */}
          <div className="flex flex-col gap-3">
            {filteredLongestMessages.length > 0 ? (
              filteredLongestMessages.map((m, idx) => {
                const messageId = m.id || `${m.login}:${m.createdAt ?? m.vodId ?? m.text}`;
                const isCopied = copiedId === messageId;

                return (
                  <div
                    key={messageId}
                    className="flex flex-col gap-2 py-3 border-b border-white/[0.05]"
                  >
                    {/* Message Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-zinc-600 tabular-nums">#{m.rank || idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => openChatter(m.login)}
                          className="font-semibold text-zinc-200 hover:text-primary transition-colors"
                        >
                          {m.displayName}
                        </button>
                      </div>

                      <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-600">
                        <span><span className="text-zinc-300 font-semibold">{m.length}</span> chars</span>
                        <span><span className="text-zinc-300 font-semibold">{m.words}</span> words</span>
                        {m.vodId && (
                          <span className="text-zinc-500 hidden md:inline">Stream #{m.vodId.slice(-6)}</span>
                        )}
                        {m.createdAt && (
                          <span className="text-zinc-500 hidden sm:inline">{m.createdAt.slice(0, 10)}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => copyMessage(messageId, m.text)}
                          className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5"
                          title="Copy message"
                        >
                          {isCopied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Message Body — full text, no truncation */}
                    <p className="text-sm font-sans text-zinc-300 leading-relaxed break-words">
                      {m.text}
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="py-8 text-center text-zinc-600 text-xs font-mono">
                No matching messages found.
              </p>
            )}
          </div>
        </div>
      );
}

function ChattersTab({ model }: { model: StatsPageModel }) {
  const { chatterSearch, setChatterSearch, filteredTop200, openChatter, dynamicData, stats } = model;
  return (
        <div className="flex flex-col gap-3">
          {/* Quick Search */}
          <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-900/40 px-3 py-2">
            <Search className="h-4 w-4 text-zinc-500" />
            <input
              type="text"
              aria-label="Search chatters"
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
                  <TableHead className="text-right font-mono hidden sm:table-cell">Msgs / Stream</TableHead>
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
                    <TableCell className="text-right font-mono text-xs text-zinc-400 tabular-nums hidden sm:table-cell">
                      {dynamicData ? "—" : ((c.messages ?? 0) / (stats?.days || 236)).toFixed(1)}
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
      );
}

