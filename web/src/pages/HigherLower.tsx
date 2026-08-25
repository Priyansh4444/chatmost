import { useState, useEffect, useRef } from "react";
import { api, type Choice, type TopTarget } from "@/lib/api";
import type { DynamicStreamerData } from "@/lib/dynamicStreamer";
import { Button } from "@/components/ui/button";
import { EmoteDisplay, KindBadge } from "@/components/emote";
import { triggerMilestoneConfetti } from "@/lib/confetti";
import { useTwitchChat } from "@/hooks/useTwitchChat";
import { TwitchChatFeed } from "@/components/TwitchChatFeed";
import { useStreamer, useChannelData } from "@/lib/streamerContext";
import { StreamerHeroBar, StreamerErrorFallback } from "@/components/StreamerHeroBar";
import { RudeCatFlash } from "@/components/RudeCatFlash";
import { cn, formatNumber, isBot } from "@/lib/utils";
import { ArrowUp, ArrowDown, RotateCcw, Trophy, Flame, Sparkles, Users, Swords, CheckCircle2, XCircle } from "lucide-react";
import { buildMatchups, pickNextChatter, pickNextEmote, pickNextMatchup, pickPrioritizedMatchup, type ChatterItem, type EmoteItem, type MatchupItem } from "./higherLowerUtils";

export { pickNextChatter, pickNextEmote, pickNextMatchup, pickPrioritizedMatchup } from "./higherLowerUtils";

type GameMode = "emotes" | "chatters" | "matchups";

const TWITCH_CHOICES: Choice[] = [
  { login: "higher", displayName: "Higher" },
  { login: "lower", displayName: "Lower" },
];

export function HigherLower() {
  const { channel: streamerChannel, setChannel: setStreamerChannel } = useStreamer();
  const channelData = useChannelData(streamerChannel);
  const [useFastFallback, setUseFastFallback] = useState(false);
  const dynamicData = (useFastFallback ? channelData.data : channelData.data) ?? null;

  const blocked = !useFastFallback && streamerChannel !== "" && (channelData.isPending || channelData.isIngesting || channelData.isError || channelData.archiveFailed);
  const loading = blocked && (channelData.isPending || channelData.isIngesting);

  return (
    <div className="flex flex-col gap-5 font-mono text-xs max-w-4xl mx-auto">
      {/* Streamer Switcher & Status Hero Banner */}
      <StreamerHeroBar />

      {blocked ? (
        loading ? null : (
          <StreamerErrorFallback
            channel={streamerChannel}
            onRetry={channelData.retry}
            onUseFallback={channelData.seAvailable ? () => setUseFastFallback(true) : undefined}
          />
        )
      ) : (
        <HigherLowerGame
          key={`${streamerChannel}:${dynamicData?.loadedAt ?? "none"}`}
          channel={streamerChannel}
          dynamicData={dynamicData}
          setChannel={setStreamerChannel}
        />
      )}
    </div>
  );
}

function HigherLowerGame(props: HigherLowerGameProps) {
  return useHigherLowerGame(props);
}

interface HigherLowerGameProps {
  channel: string;
  dynamicData: DynamicStreamerData | null;
  setChannel: (c: string) => void;
}

function useHigherLowerGame({
  channel: streamerChannel,
  dynamicData,
  setChannel: setStreamerChannel,
}: HigherLowerGameProps) {
  const [mode, setMode] = useState<GameMode>("matchups");

  // Load chatters pool
  const topChatters: ChatterItem[] = (api.topChatters(200, dynamicData) || [])
    .filter((c) => !isBot(c.login))
    .map((c, idx) => ({ ...c, rank: idx + 1 }));

  // Load emotes pool (7TV & Twitch emotes only — words belong in Lexicon/Chatter Lore)
  const topEmotes: EmoteItem[] = (() => {
    const targets: TopTarget[] = api.allTargets(dynamicData);
    const valid = targets.filter(
      (t: TopTarget) => (t.kind === "7tv" || t.kind === "twitch") && t.total >= 1
    );
    return valid.map((t: TopTarget, idx: number) => ({
      ...t,
      rank: idx + 1,
    }));
  })();

  // Load chatter lore matchups pool (Mode 3) — 7TV/Twitch emotes only,
  // randomized fresh on every run.
  const topMatchups = buildMatchups(api.chatterLoreMatchups(dynamicData));

  // Current Card A & B for Chatters
  const [chatterA, setChatterA] = useState<ChatterItem | null>(() => {
    return topChatters[Math.floor(Math.random() * 40)] || topChatters[0] || null;
  });
  const [chatterB, setChatterB] = useState<ChatterItem | null>(() => {
    return topChatters[0] ? pickNextChatter(topChatters[0], topChatters, 0) : null;
  });

  // Current Card A & B for Emotes
  const [emoteA, setEmoteA] = useState<EmoteItem | null>(() => {
    return topEmotes[Math.floor(Math.random() * 50)] || topEmotes[0] || null;
  });
  const [emoteB, setEmoteB] = useState<EmoteItem | null>(() => {
    return topEmotes[0] ? pickNextEmote(topEmotes[0], topEmotes, 0) : null;
  });

  // Current Card A & B for Matchups (Mode 3) — opened with a randomized,
  // emote-prioritized pick so every run starts on a fresh target.
  const [matchupA, setMatchupA] = useState<MatchupItem | null>(() => {
    return pickPrioritizedMatchup(topMatchups) || topMatchups[0] || null;
  });
  const [matchupB, setMatchupB] = useState<MatchupItem | null>(() => {
    return topMatchups[0] ? pickNextMatchup(topMatchups[0], topMatchups, 0) : null;
  });

  // Sliding window of recently shown items per mode so the game never gets
  // stuck bouncing between the same two cards.
  const recentKeysRef = useRef<{ chatters: string[]; emotes: string[]; matchups: string[] }>({
    chatters: [],
    emotes: [],
    matchups: [],
  });
  const recordRecent = (mode: keyof typeof recentKeysRef.current, key: string) => {
    recentKeysRef.current[mode] = [...recentKeysRef.current[mode], key].slice(-6);
  };

  const [revealed, setRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);
  const [showRudeCat, setShowRudeCat] = useState(false);

  const {
    status,
    messages,
    votes,
    totalVotes,
    percentages,
    resetVotes,
    channel: twitchChatChannel,
    setChannel: setTwitchChannel,
  } = useTwitchChat(TWITCH_CHOICES, true, streamerChannel);

  const [highScoreChatters, setHighScoreChatters] = useState(() => {
    return parseInt(localStorage.getItem("chatmost_hl_highscore_chatters") || "0", 10);
  });
  const [highScoreEmotes, setHighScoreEmotes] = useState(() => {
    return parseInt(localStorage.getItem("chatmost_hl_highscore_emotes") || "0", 10);
  });
  const [highScoreMatchups, setHighScoreMatchups] = useState(() => {
    return parseInt(localStorage.getItem("chatmost_hl_highscore_matchups") || "0", 10);
  });

  const highScore =
    mode === "chatters"
      ? highScoreChatters
      : mode === "emotes"
      ? highScoreEmotes
      : highScoreMatchups;

  const [gameOver, setGameOver] = useState(false);

  // Only one outcome timer may be pending at a time. A second guess (double
  // click / key repeat in the same frame) must cancel the first guess's timer,
  // otherwise a wrong guess's game-over can be followed by a stale "correct"
  // advance that keeps the streak running.
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPendingTimer = () => {
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  };

  const handleGuess = (
    guess: "higher" | "lower") => {
      if (revealed || gameOver) return;
      // Never reveal into a state with no cards: a missing pool must have hit
      // the empty-state guard above, but this keeps the game from sticking on
      // a revealed card that has no timer to advance it.
      const cardsOk =
        mode === "chatters"
          ? Boolean(chatterA && chatterB)
          : mode === "emotes"
          ? Boolean(emoteA && emoteB)
          : Boolean(matchupA && matchupB);
      if (!cardsOk) return;
      clearPendingTimer();

      setRevealed(true);
      let valA = 0;
      let valB = 0;

      if (mode === "chatters") {
        if (!chatterA || !chatterB) return;
        valA = chatterA.messages ?? 0;
        valB = chatterB.messages ?? 0;
      } else if (mode === "emotes") {
        if (!emoteA || !emoteB) return;
        valA = emoteA.total;
        valB = emoteB.total;
      } else {
        if (!matchupA || !matchupB) return;
        valA = matchupA.count;
        valB = matchupB.count;
      }

      const correct =
        (guess === "higher" && valB >= valA) ||
        (guess === "lower" && valB <= valA);

      setIsCorrect(correct);

      // Flash the rude cat when chat voted AND the chat majority guessed wrong
      // (regardless of whether the local player was right).
      const maxVotes = Math.max(...votes);
      const maxCount = votes.filter((v) => v === maxVotes).length;
      const chatMajorityChoice = maxCount === 1 ? votes.indexOf(maxVotes) : -1; // 0 = higher, 1 = lower
      const chatCorrect =
        chatMajorityChoice === 0 ? valB >= valA : chatMajorityChoice === 1 ? valB <= valA : false;
      const chatMajorityWrong = totalVotes > 0 && maxCount === 1 && !chatCorrect;
      if (chatMajorityWrong) {
        setShowRudeCat(true);
      }

      if (correct) {
        const nextStreak = streak + 1;
        setStreak(nextStreak);

        if (mode === "chatters") {
          if (nextStreak > highScoreChatters) {
            setHighScoreChatters(nextStreak);
            localStorage.setItem("chatmost_hl_highscore_chatters", nextStreak.toString());
          }
        } else if (mode === "emotes") {
          if (nextStreak > highScoreEmotes) {
            setHighScoreEmotes(nextStreak);
            localStorage.setItem("chatmost_hl_highscore_emotes", nextStreak.toString());
          }
        } else {
          if (nextStreak > highScoreMatchups) {
            setHighScoreMatchups(nextStreak);
            localStorage.setItem("chatmost_hl_highscore_matchups", nextStreak.toString());
          }
        }

        if (nextStreak % 5 === 0) {
          triggerMilestoneConfetti(nextStreak);
        }

        pendingTimerRef.current = setTimeout(() => {
          pendingTimerRef.current = null;
          setRevealed(false);
          setIsCorrect(null);
          resetVotes();
          if (mode === "chatters") {
            if (!chatterA || !chatterB) return;
            const nextB = pickNextChatter(chatterB, topChatters, nextStreak, recentKeysRef.current.chatters);
            recordRecent("chatters", `c:${chatterA.login}`);
            recordRecent("chatters", `c:${nextB.login}`);
            setChatterA(chatterB);
            setChatterB(nextB);
          } else if (mode === "emotes") {
            if (!emoteA || !emoteB) return;
            const nextB = pickNextEmote(emoteB, topEmotes, nextStreak, recentKeysRef.current.emotes);
            recordRecent("emotes", `e:${emoteA.kind}:${emoteA.name}`);
            recordRecent("emotes", `e:${nextB.kind}:${nextB.name}`);
            setEmoteA(emoteB);
            setEmoteB(nextB);
          } else {
            if (!matchupB) return;
            const nextB = pickNextMatchup(matchupB, topMatchups, nextStreak, recentKeysRef.current.matchups);
            recordRecent("matchups", `m:${matchupA?.login}|${matchupA?.targetName}`);
            recordRecent("matchups", `m:${nextB.login}|${nextB.targetName}`);
            setMatchupA(matchupB);
            setMatchupB(nextB);
          }
        }, 950);
      } else {
        pendingTimerRef.current = setTimeout(() => {
          pendingTimerRef.current = null;
          setGameOver(true);
        }, 750);
      }
    };

  const restartGame = (newMode?: GameMode) => {
    const targetMode = newMode || mode;
    if (newMode) setMode(newMode);

    clearPendingTimer();
    setGameOver(false);
    setRevealed(false);
    setIsCorrect(null);
    setStreak(0);
    resetVotes();

    if (targetMode === "chatters" && topChatters.length >= 2) {
      const startA = topChatters[Math.floor(Math.random() * 40)] || topChatters[0];
      const startB = pickNextChatter(startA, topChatters, 0);
      recentKeysRef.current.chatters = [`c:${startA.login}`, `c:${startB.login}`];
      setChatterA(startA);
      setChatterB(startB);
    } else if (targetMode === "emotes" && topEmotes.length >= 2) {
      const startA = topEmotes[Math.floor(Math.random() * 50)] || topEmotes[0];
      const startB = pickNextEmote(startA, topEmotes, 0);
      recentKeysRef.current.emotes = [`e:${startA.kind}:${startA.name}`, `e:${startB.kind}:${startB.name}`];
      setEmoteA(startA);
      setEmoteB(startB);
    } else if (targetMode === "matchups" && topMatchups.length >= 2) {
      const startA = pickPrioritizedMatchup(topMatchups) || topMatchups[0];
      const startB = pickNextMatchup(startA, topMatchups, 0);
      recentKeysRef.current.matchups = [`m:${startA.login}|${startA.targetName}`, `m:${startB.login}|${startB.targetName}`];
      setMatchupA(startA);
      setMatchupB(startB);
    }
  };

  // Keyboard navigation (Arrow keys / WASD / Space / Enter)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (gameOver) {
        if (e.key === " " || e.key === "Enter" || e.key === "r" || e.key === "R") {
          e.preventDefault();
          restartGame();
        }
        return;
      }
      if (revealed) return;

      if (
        e.key === "ArrowUp" ||
        e.key === "w" ||
        e.key === "W" ||
        e.key === "h" ||
        e.key === "H" ||
        e.key === "1"
      ) {
        e.preventDefault();
        handleGuess("higher");
      } else if (
        e.key === "ArrowDown" ||
        e.key === "s" ||
        e.key === "S" ||
        e.key === "l" ||
        e.key === "L" ||
        e.key === "2"
      ) {
        e.preventDefault();
        handleGuess("lower");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Only the active mode's pool needs to be real: if it has fewer than two
  // cards there is nothing real to compare — do not serve SE-derived data.
  const poolReady =
    mode === "chatters"
      ? topChatters.length >= 2
      : mode === "emotes"
      ? topEmotes.length >= 2
      : topMatchups.length >= 2;

  if (!poolReady) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center font-mono">
        <p className="text-sm font-bold text-white">No chat archive for #{streamerChannel}</p>
        <p className="text-xs text-zinc-400 font-sans max-w-sm">
          Higher/Lower needs a built chat archive (real ingested messages). Try again once the archive finishes
          building, or switch streamers.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 font-mono text-xs max-w-4xl mx-auto">
      {/* Top Header & Mode Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
        {/* Mode Selector */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => restartGame("matchups")}
            className={cn(
              "flex items-center gap-1.5 border px-3.5 py-1.5 text-xs font-bold transition-colors",
              mode === "matchups"
                ? "border-primary bg-primary text-black"
                : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Swords className="h-3.5 w-3.5" />
            Chatter vs Token (Has X said Y more?)
          </button>
          <button
            type="button"
            onClick={() => restartGame("emotes")}
            className={cn(
              "flex items-center gap-1.5 border px-3.5 py-1.5 text-xs font-bold transition-colors",
              mode === "emotes"
                ? "border-primary bg-primary text-black"
                : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Emote Usage
          </button>
          <button
            type="button"
            onClick={() => restartGame("chatters")}
            className={cn(
              "flex items-center gap-1.5 border px-3.5 py-1.5 text-xs font-bold transition-colors",
              mode === "chatters"
                ? "border-primary bg-primary text-black"
                : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Chatters
          </button>
        </div>

        {/* Score Indicators */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-primary/40 bg-primary/10 px-3 py-1">
            <Flame className="h-4 w-4 text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Streak:</span>
            <span className="font-bold text-primary text-sm tabular-nums">{streak}</span>
          </div>

          <div className="flex items-center gap-1.5 border border-gold/40 bg-gold/10 px-3 py-1">
            <Trophy className="h-4 w-4 text-gold" />
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Best:</span>
            <span className="font-bold text-gold text-sm tabular-nums">{highScore}</span>
          </div>
        </div>
      </div>

      {/* Main Dual Arena */}
      {!gameOver ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Card A: Base Reference Item */}
            <div className="border-2 border-border/80 bg-card/70 p-6 flex flex-col justify-between backdrop-blur-sm shadow-xl min-h-[340px]">
              <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                  Reference · #
                  {mode === "matchups"
                    ? matchupA?.rank ?? 1
                    : mode === "emotes"
                    ? emoteA?.rank ?? 1
                    : chatterA?.rank ?? 1}
                </span>
                {mode === "matchups" ? (
                  matchupA?.metric === "messages" ? (
                    <span className="border border-border/60 bg-muted/20 px-2 py-0.5 text-[9px] text-muted-foreground">
                      Most Active Chatter
                    </span>
                  ) : (
                    <KindBadge kind={matchupA?.targetKind ?? "7tv"} />
                  )
                ) : mode === "emotes" ? (
                  <KindBadge kind={emoteA?.kind ?? "7tv"} />
                ) : (
                  <span className="border border-border/60 bg-muted/20 px-2 py-0.5 text-[9px] text-muted-foreground">
                    Base Reference
                  </span>
                )}
              </div>

              <div className="py-6 flex flex-col items-center justify-center text-center">
                {mode === "matchups" ? (
                  matchupA?.metric === "messages" ? (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-2xl sm:text-4xl font-black text-zinc-100">
                        {matchupA?.displayName ?? "Chatter"}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        #{matchupA?.rank ?? "?"} most active in {matchupA?.targetName ?? "#channel"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl sm:text-4xl font-black text-zinc-100">
                      {matchupA?.displayName ?? "Chatter"}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      typing
                    </span>
                    {matchupA?.targetUrl ? (
                      <div className="flex items-center gap-2 mt-1">
                        <EmoteDisplay name={matchupA.targetName} url={matchupA.targetUrl} size="lg" />
                        <span className="font-bold text-lg text-foreground">{matchupA.targetName}</span>
                      </div>
                    ) : (
                      <span className="text-2xl sm:text-3xl font-black text-foreground mt-1">
                        “{matchupA?.targetName ?? "Emote"}”
                      </span>
                    )}
                    </div>
                  )
                ) : mode === "emotes" ? (
                  <div className="flex flex-col items-center gap-2">
                    {emoteA?.url ? (
                      <>
                        <EmoteDisplay name={emoteA.name} url={emoteA.url} size="xl" />
                        <span className="text-sm font-bold text-muted-foreground mt-1">
                          {emoteA.name}
                        </span>
                      </>
                    ) : (
                      <span className="text-3xl sm:text-5xl font-bold text-foreground">
                        “{emoteA?.name ?? "Emote"}”
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-2xl sm:text-4xl font-bold text-foreground">
                    {chatterA?.displayName ?? "Chatter"}
                  </span>
                )}

                <span className="text-[11px] text-muted-foreground mt-4 uppercase tracking-wider font-medium">
                  {mode === "matchups"
                    ? matchupA?.metric === "messages"
                      ? "Total Messages Sent"
                      : "Times Typed in Chat"
                    : mode === "emotes"
                    ? "Total Channel Uses"
                    : "Total Messages Sent"}
                </span>
                <span className="text-4xl sm:text-5xl font-black text-primary mt-1 font-mono tabular-nums">
                  {formatNumber(
                    mode === "matchups"
                      ? matchupA?.count ?? 0
                      : mode === "emotes"
                      ? emoteA?.total ?? 0
                      : chatterA?.messages ?? 0
                  )}
                </span>
              </div>

              <div className="border-t border-border/40 pt-2.5 text-center text-muted-foreground text-[10px] font-mono">
                Rank #{mode === "matchups" ? matchupA?.rank ?? 1 : mode === "emotes" ? emoteA?.rank ?? 1 : chatterA?.rank ?? 1} of all-time
              </div>
            </div>

            {/* Card B: Target Mystery Item */}
            <div
              className={cn(
                "border-2 p-6 flex flex-col justify-between transition-colors duration-300 backdrop-blur-sm shadow-xl min-h-[340px] relative overflow-hidden",
                revealed && isCorrect === true  && "border-white/40 bg-white/[0.05] animate-correct-pop",
                revealed && isCorrect === false && "border-primary/60 bg-primary/[0.05] animate-wrong-shake",
                !revealed && "border-border/80 bg-card/70"
              )}
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                  {revealed
                    ? `Actual Rank: #${
                        mode === "matchups"
                          ? matchupB?.rank ?? 1
                          : mode === "emotes"
                          ? emoteB?.rank ?? 1
                          : chatterB?.rank ?? 1
                      }`
                    : mode === "matchups"
                    ? matchupB?.metric === "messages"
                      ? "Mystery Chatter"
                      : "Mystery Emote"
                    : mode === "emotes"
                    ? "Mystery Emote"
                    : "Mystery Chatter"}
                </span>
                {mode === "matchups" ? (
                  matchupB?.metric === "messages" ? (
                    <span className="border border-border/60 bg-muted/20 px-2 py-0.5 text-[9px] text-muted-foreground">
                      Most Active Chatter
                    </span>
                  ) : (
                    <KindBadge kind={matchupB?.targetKind ?? "7tv"} />
                  )
                ) : mode === "emotes" ? (
                  <KindBadge kind={emoteB?.kind ?? "7tv"} />
                ) : null}
              </div>

              <div className="py-5 flex flex-col items-center justify-center text-center">
                {mode === "matchups" ? (
                  matchupB?.metric === "messages" ? (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-2xl sm:text-4xl font-black text-zinc-100">
                        {matchupB?.displayName ?? "Mystery Chatter"}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        #{matchupB?.rank ?? "?"} most active in {matchupB?.targetName ?? "#channel"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl sm:text-4xl font-black text-zinc-100">
                      {matchupB?.displayName ?? "Mystery Chatter"}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      typing
                    </span>
                    {matchupB?.targetUrl ? (
                      <div className="flex items-center gap-2 mt-1">
                        <EmoteDisplay name={matchupB.targetName} url={matchupB.targetUrl} size="lg" />
                        <span className="font-bold text-lg text-foreground">{matchupB.targetName}</span>
                      </div>
                    ) : (
                      <span className="text-2xl sm:text-3xl font-black text-foreground mt-1">
                        “{matchupB?.targetName ?? "Mystery Target"}”
                      </span>
                    )}
                    </div>
                  )
                ) : mode === "emotes" ? (
                  <div className="flex flex-col items-center gap-2">
                    {emoteB?.url ? (
                      <>
                        <EmoteDisplay name={emoteB.name} url={emoteB.url} size="xl" />
                        <span className="text-sm font-bold text-muted-foreground mt-1">
                          {emoteB.name}
                        </span>
                      </>
                    ) : (
                      <span className="text-3xl sm:text-5xl font-bold text-foreground">
                        “{emoteB?.name ?? "Mystery Emote"}”
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-2xl sm:text-4xl font-bold text-foreground">
                    {chatterB?.displayName ?? "Mystery Chatter"}
                  </span>
                )}

                <span className="text-[11px] text-muted-foreground mt-3 uppercase tracking-wider font-medium">
                  has been{" "}
                  {mode === "matchups"
                    ? matchupB?.metric === "messages"
                      ? "sent"
                      : "typed"
                    : mode === "emotes"
                    ? "used"
                    : "sent"}
                </span>

                {revealed ? (
                  <div className="my-3 flex flex-col items-center gap-2 animate-correct-pop">
                    <div className="flex items-center gap-2">
                      {isCorrect ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white border border-white/30 bg-white/[0.08] px-3 py-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          CORRECT
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary border border-primary/40 bg-primary/[0.08] px-3 py-1">
                          <XCircle className="h-3.5 w-3.5" />
                          WRONG
                        </span>
                      )}
                    </div>

                    <span
                      className={cn(
                        "text-4xl sm:text-5xl font-black font-mono tabular-nums",
                        isCorrect ? "text-white" : "text-primary"
                      )}
                    >
                      {formatNumber(
                        mode === "matchups"
                          ? matchupB?.count ?? 0
                          : mode === "emotes"
                          ? emoteB?.total ?? 0
                          : chatterB?.messages ?? 0
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Rank #
                      {mode === "matchups"
                        ? matchupB?.rank ?? 1
                        : mode === "emotes"
                        ? emoteB?.rank ?? 1
                        : chatterB?.rank ?? 1}{" "}
                      overall
                    </span>
                  </div>
                ) : (
                  /* Guess Buttons */
                  <div className="flex flex-col w-full max-w-sm gap-2.5 my-3">
                    <Button
                      size="sm"
                      onClick={() => handleGuess("higher")}
                      className="border-2 border-primary bg-primary text-black font-black hover:bg-primary/90 flex items-center justify-between px-4 py-3.5 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <ArrowUp className="h-4 w-4 stroke-[3]" />
                        Higher (More Times)
                      </span>
                      {totalVotes > 0 && (
                        <span className="bg-black/30 px-2.5 py-0.5 text-xs font-mono font-bold">
                          {percentages[0]}%
                        </span>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleGuess("lower")}
                      className="border-2 border-zinc-800 bg-zinc-900 text-zinc-100 font-black hover:bg-zinc-850 flex items-center justify-between px-4 py-3.5 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <ArrowDown className="h-4 w-4 stroke-[3]" />
                        Lower (Fewer Times)
                      </span>
                      {totalVotes > 0 && (
                        <span className="bg-black/40 px-2.5 py-0.5 text-xs font-mono font-bold">
                          {percentages[1]}%
                        </span>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              <div className="border-t border-border/40 pt-2.5 text-center text-muted-foreground text-[10px] font-mono">
                {revealed
                  ? isCorrect
                    ? "Correct! Advancing..."
                    : "Incorrect."
                  : mode === "matchups"
                  ? matchupB?.metric === "messages"
                    ? `Has ${matchupB?.displayName} sent more messages than ${matchupA?.displayName}?`
                    : `Has ${matchupB?.displayName} typed "${matchupB?.targetName}" more or less?`
                  : "Higher or lower total channel uses?"}
              </div>
            </div>
          </div>

          {/* Clean Animated Live Audience Vote Split Meter */}
          {totalVotes > 0 && (
            <div className="flex flex-col gap-1.5 border border-border/80 bg-zinc-950 p-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-primary font-bold">
                  ▲ HIGHER: {percentages[0]}%
                </span>
                <span className="text-zinc-400 font-bold">
                  {totalVotes} live chat vote{totalVotes === 1 ? "" : "s"}
                </span>
                <span className="text-zinc-300 font-bold">
                  ▼ LOWER: {percentages[1]}%
                </span>
              </div>

              {/* Animated Dual Bar with zero edge gap */}
              <div className="w-full bg-zinc-900 border border-zinc-800 h-6 flex overflow-hidden relative">
                {percentages[0] > 0 && (
                  <div
                    className="bg-primary text-black font-black text-xs flex items-center px-3 transition-[width] duration-500 ease-out select-none min-w-0 whitespace-nowrap overflow-hidden"
                    style={{ width: `${percentages[0]}%` }}
                  >
                    ▲ HIGHER {percentages[0]}%
                  </div>
                )}
                {percentages[1] > 0 && (
                  <div
                    className="bg-zinc-800 text-zinc-100 font-black text-xs flex items-center justify-end px-3 transition-[width] duration-500 ease-out select-none min-w-0 whitespace-nowrap overflow-hidden"
                    style={{ width: `${percentages[1]}%` }}
                  >
                    ▼ LOWER {percentages[1]}%
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dedicated Twitch Chat Live Stream Feed Box */}
          <TwitchChatFeed
            messages={messages}
            status={status}
            channel={twitchChatChannel}
            totalVotes={totalVotes}
            onSetChannel={(ch) => {
              setTwitchChannel(ch);
              setStreamerChannel(ch);
            }}
          />
        </div>
      ) : (
        /* Game Over Screen */
        <div className="border-2 border-primary bg-card/95 p-8 text-center flex flex-col items-center justify-center gap-5 shadow-2xl">
          <div className="flex flex-col gap-2">
            <span className="text-xl font-black text-primary uppercase tracking-wider">
              Streak Ended! Final Score: {streak}
            </span>
            <span className="text-xs text-muted-foreground max-w-md">
              {mode === "matchups" ? (
                matchupB?.metric === "messages" ? (
                  <span>
                    {matchupB?.displayName ?? "?"} ({formatNumber(matchupB?.count ?? 0)} msgs) vs{" "}
                    {matchupA?.displayName ?? "?"} ({formatNumber(matchupA?.count ?? 0)} msgs)
                  </span>
                ) : (
                  <span>
                    {matchupB?.displayName ?? "?"} saying "{matchupB?.targetName ?? "?"}" (
                    {formatNumber(matchupB?.count ?? 0)} times) vs {matchupA?.displayName ?? "?"} saying "
                    {matchupA?.targetName ?? "?"}" ({formatNumber(matchupA?.count ?? 0)} times)
                  </span>
                )
              ) : mode === "emotes" ? (
                <span>
                  {emoteB?.name ?? "?"} (#{emoteB?.rank ?? "?"} · {formatNumber(emoteB?.total ?? 0)} uses) vs{" "}
                  {emoteA?.name ?? "?"} (#{emoteA?.rank ?? "?"} · {formatNumber(emoteA?.total ?? 0)} uses)
                </span>
              ) : (
                <span>
                  {chatterB?.displayName ?? "?"} (#{chatterB?.rank ?? "?"} ·{" "}
                  {formatNumber(chatterB?.messages ?? 0)} msgs) vs {chatterA?.displayName ?? "?"} (
                  #{chatterA?.rank ?? "?"} · {formatNumber(chatterA?.messages ?? 0)} msgs)
                </span>
              )}
            </span>
          </div>

          <Button
            size="sm"
            onClick={() => restartGame()}
            className="border-2 border-primary bg-primary text-black font-black flex items-center gap-2 px-10 py-3.5 text-sm hover:bg-primary/90"
          >
            <RotateCcw className="h-4 w-4" />
            Play Again
          </Button>
        </div>
      )}

      {/* Rude Cat Flash on Chat Wrong Guess */}
      <RudeCatFlash show={showRudeCat} onDismiss={() => setShowRudeCat(false)} />
    </div>
  );
}
