import { useState, useEffect, useCallback, useMemo } from "react";
import { api, type Choice, type TopTarget } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmoteDisplay, KindBadge } from "@/components/emote";
import { triggerMilestoneConfetti } from "@/lib/confetti";
import { cn, formatNumber } from "@/lib/utils";
import { ArrowUp, ArrowDown, RotateCcw, Trophy, Flame, Sparkles, Users } from "lucide-react";

type GameMode = "chatters" | "emotes";

interface ChatterItem extends Choice {
  rank: number;
}

interface EmoteItem extends TopTarget {
  rank: number;
}

/**
 * Matchmaking algorithm for Chatters
 */
function pickNextChatter(
  currentA: ChatterItem,
  allChatters: ChatterItem[],
  streak: number
): ChatterItem {
  const isJumpRound = streak > 0 && streak % 5 === 0;

  if (isJumpRound) {
    const farCandidates = allChatters.filter(
      (c) =>
        c.login !== currentA.login &&
        Math.abs(c.rank - currentA.rank) >= 40
    );
    if (farCandidates.length > 0) {
      return farCandidates[Math.floor(Math.random() * farCandidates.length)];
    }
  }

  const closeCandidates = allChatters.filter(
    (c) =>
      c.login !== currentA.login &&
      Math.abs(c.rank - currentA.rank) >= 2 &&
      Math.abs(c.rank - currentA.rank) <= 18
  );

  if (closeCandidates.length > 0) {
    return closeCandidates[Math.floor(Math.random() * closeCandidates.length)];
  }

  const candidates = allChatters.filter((c) => c.login !== currentA.login);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Matchmaking algorithm for Emotes (Close / Hard mode)
 */
function pickNextEmote(
  currentA: EmoteItem,
  allEmotes: EmoteItem[],
  streak: number
): EmoteItem {
  const isJumpRound = streak > 0 && streak % 5 === 0;

  if (isJumpRound) {
    const farCandidates = allEmotes.filter(
      (e) =>
        e.name !== currentA.name &&
        Math.abs(e.rank - currentA.rank) >= 40
    );
    if (farCandidates.length > 0) {
      return farCandidates[Math.floor(Math.random() * farCandidates.length)];
    }
  }

  // Pick close competition (2 to 16 rank difference for tricky close numbers)
  const closeCandidates = allEmotes.filter(
    (e) =>
      e.name !== currentA.name &&
      Math.abs(e.rank - currentA.rank) >= 2 &&
      Math.abs(e.rank - currentA.rank) <= 16
  );

  if (closeCandidates.length > 0) {
    return closeCandidates[Math.floor(Math.random() * closeCandidates.length)];
  }

  const candidates = allEmotes.filter((e) => e.name !== currentA.name);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function HigherLower() {
  const [mode, setMode] = useState<GameMode>("emotes");

  // Load chatters pool
  const topChatters: ChatterItem[] = useMemo(() => {
    return (api.topChatters(200) || []).map((c, idx) => ({
      ...c,
      rank: idx + 1,
    }));
  }, []);

  // Load emotes pool
  const topEmotes: EmoteItem[] = useMemo(() => {
    const targets: TopTarget[] = api.allTargets();
    const valid = targets.filter(
      (t: TopTarget) =>
        (t.kind === "7tv" || t.kind === "twitch" || t.isSlang || (t as any).isBrainrot) && t.total >= 15
    );
    return valid.map((t: TopTarget, idx: number) => ({
      ...t,
      rank: idx + 1,
    }));
  }, []);

  // Current Card A & B for Chatters
  const [chatterA, setChatterA] = useState<ChatterItem>(() => {
    return topChatters[Math.floor(Math.random() * 40)] || topChatters[0];
  });
  const [chatterB, setChatterB] = useState<ChatterItem>(() => {
    return pickNextChatter(topChatters[0], topChatters, 0);
  });

  // Current Card A & B for Emotes
  const [emoteA, setEmoteA] = useState<EmoteItem>(() => {
    return topEmotes[Math.floor(Math.random() * 50)] || topEmotes[0];
  });
  const [emoteB, setEmoteB] = useState<EmoteItem>(() => {
    return pickNextEmote(topEmotes[0], topEmotes, 0);
  });

  const [revealed, setRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);

  const [highScoreChatters, setHighScoreChatters] = useState(() => {
    return parseInt(localStorage.getItem("chatmost_hl_highscore_chatters") || "0", 10);
  });
  const [highScoreEmotes, setHighScoreEmotes] = useState(() => {
    return parseInt(localStorage.getItem("chatmost_hl_highscore_emotes") || "0", 10);
  });

  const highScore = mode === "chatters" ? highScoreChatters : highScoreEmotes;
  const [gameOver, setGameOver] = useState(false);

  const handleGuess = useCallback((guess: "higher" | "lower") => {
    if (revealed || gameOver) return;

    setRevealed(true);
    let valA = 0;
    let valB = 0;

    if (mode === "chatters") {
      if (!chatterA || !chatterB) return;
      valA = chatterA.messages ?? 0;
      valB = chatterB.messages ?? 0;
    } else {
      if (!emoteA || !emoteB) return;
      valA = emoteA.total;
      valB = emoteB.total;
    }

    const correct =
      (guess === "higher" && valB >= valA) ||
      (guess === "lower" && valB <= valA);

    setIsCorrect(correct);

    if (correct) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);

      if (mode === "chatters") {
        if (nextStreak > highScoreChatters) {
          setHighScoreChatters(nextStreak);
          localStorage.setItem("chatmost_hl_highscore_chatters", nextStreak.toString());
        }
      } else {
        if (nextStreak > highScoreEmotes) {
          setHighScoreEmotes(nextStreak);
          localStorage.setItem("chatmost_hl_highscore_emotes", nextStreak.toString());
        }
      }

      if (nextStreak % 5 === 0) {
        triggerMilestoneConfetti(nextStreak);
      }

      setTimeout(() => {
        setRevealed(false);
        setIsCorrect(null);
        if (mode === "chatters") {
          setChatterA(chatterB);
          setChatterB(pickNextChatter(chatterB, topChatters, nextStreak));
        } else {
          setEmoteA(emoteB);
          setEmoteB(pickNextEmote(emoteB, topEmotes, nextStreak));
        }
      }, 950);
    } else {
      setTimeout(() => {
        setGameOver(true);
      }, 750);
    }
  }, [mode, chatterA, chatterB, emoteA, emoteB, revealed, gameOver, streak, highScoreChatters, highScoreEmotes, topChatters, topEmotes]);

  const restartGame = useCallback((newMode?: GameMode) => {
    const targetMode = newMode || mode;
    if (newMode) setMode(newMode);

    setGameOver(false);
    setRevealed(false);
    setIsCorrect(null);
    setStreak(0);

    if (targetMode === "chatters" && topChatters.length >= 2) {
      const startA = topChatters[Math.floor(Math.random() * 40)] || topChatters[0];
      const startB = pickNextChatter(startA, topChatters, 0);
      setChatterA(startA);
      setChatterB(startB);
    } else if (targetMode === "emotes" && topEmotes.length >= 2) {
      const startA = topEmotes[Math.floor(Math.random() * 50)] || topEmotes[0];
      const startB = pickNextEmote(startA, topEmotes, 0);
      setEmoteA(startA);
      setEmoteB(startB);
    }
  }, [mode, topChatters, topEmotes]);

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

      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === "h" || e.key === "H" || e.key === "1") {
        e.preventDefault();
        handleGuess("higher");
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S" || e.key === "l" || e.key === "L" || e.key === "2") {
        e.preventDefault();
        handleGuess("lower");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [revealed, gameOver, handleGuess, restartGame]);

  return (
    <div className="flex flex-col gap-3 font-mono text-xs max-w-4xl mx-auto">
      {/* Top Header & Mode Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2">
        {/* Mode Selector */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => restartGame("emotes")}
            className={cn(
              "flex items-center gap-1.5 border px-2.5 py-1 text-xs font-bold transition-none",
              mode === "emotes"
                ? "border-primary bg-primary text-black"
                : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Emote Usage (Hard)
          </button>
          <button
            type="button"
            onClick={() => restartGame("chatters")}
            className={cn(
              "flex items-center gap-1.5 border px-2.5 py-1 text-xs font-bold transition-none",
              mode === "chatters"
                ? "border-secondary bg-secondary text-white"
                : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Chatters
          </button>
        </div>

        {/* Score Indicators */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-primary/40 bg-primary/5 px-2 py-0.5">
            <Flame className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-muted-foreground">Streak:</span>
            <span className="font-bold text-primary text-xs tabular-nums">{streak}</span>
          </div>

          <div className="flex items-center gap-1 border border-gold/40 bg-gold/5 px-2 py-0.5">
            <Trophy className="h-3 w-3 text-gold" />
            <span className="text-[10px] text-muted-foreground">Best:</span>
            <span className="font-bold text-gold text-xs tabular-nums">{highScore}</span>
          </div>
        </div>
      </div>

      {/* Main Dual Arena */}
      {!gameOver ? (
        <div className="grid gap-3 md:grid-cols-2">
          {/* Card A: Base Reference Item */}
          <div className="border border-border/80 bg-card/50 p-4 flex flex-col justify-between backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
              <span className="text-[10px] text-muted-foreground">
                Reference · #{mode === "emotes" ? emoteA.rank : chatterA.rank}
              </span>
              {mode === "emotes" ? (
                <KindBadge kind={emoteA.kind} />
              ) : (
                <span className="border border-border/60 bg-muted/20 px-1 text-[8px] text-muted-foreground">
                  Base
                </span>
              )}
            </div>

            <div className="py-5 flex flex-col items-center justify-center text-center min-h-[160px]">
              {mode === "emotes" ? (
                <div className="flex flex-col items-center gap-2">
                  {emoteA.url ? (
                    <EmoteDisplay name={emoteA.name} url={emoteA.url} size="xl" />
                  ) : (
                    <span className="text-2xl sm:text-3xl font-bold text-foreground">
                      “{emoteA.name}”
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-muted-foreground">
                    {emoteA.name}
                  </span>
                </div>
              ) : (
                <span className="text-xl sm:text-2xl font-bold text-foreground">
                  {chatterA.displayName}
                </span>
              )}

              <span className="text-[10px] text-muted-foreground mt-2">
                {mode === "emotes" ? "Total Channel Uses" : "Total Messages Sent"}
              </span>
              <span className="text-2xl sm:text-3xl font-bold text-primary mt-0.5 font-mono tabular-nums">
                {formatNumber(mode === "emotes" ? emoteA.total : chatterA.messages ?? 0)}
              </span>
            </div>

            <div className="border-t border-border/40 pt-1.5 text-center text-muted-foreground text-[9px]">
              Rank #{mode === "emotes" ? emoteA.rank : chatterA.rank} of all-time
            </div>
          </div>

          {/* Card B: Target Mystery Item */}
          <div
            className={cn(
              "border p-4 flex flex-col justify-between transition-none backdrop-blur-sm",
              revealed && isCorrect === true && "border-success/80 bg-success/10",
              revealed && isCorrect === false && "border-destructive/80 bg-destructive/10 animate-strike",
              !revealed && "border-border/80 bg-card/50"
            )}
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
              <span className="text-[10px] text-muted-foreground">
                {revealed
                  ? `Actual Rank: #${mode === "emotes" ? emoteB.rank : chatterB.rank}`
                  : mode === "emotes"
                  ? "Mystery Emote"
                  : "Mystery Chatter"}
              </span>
              {mode === "emotes" && <KindBadge kind={emoteB.kind} />}
            </div>

            <div className="py-4 flex flex-col items-center justify-center text-center min-h-[160px]">
              {mode === "emotes" ? (
                <div className="flex flex-col items-center gap-2">
                  {emoteB.url ? (
                    <EmoteDisplay name={emoteB.name} url={emoteB.url} size="xl" />
                  ) : (
                    <span className="text-2xl sm:text-3xl font-bold text-foreground">
                      “{emoteB.name}”
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-muted-foreground">
                    {emoteB.name}
                  </span>
                </div>
              ) : (
                <span className="text-xl sm:text-2xl font-bold text-foreground">
                  {chatterB.displayName}
                </span>
              )}

              <span className="text-[10px] text-muted-foreground mt-1">
                has been {mode === "emotes" ? "used" : "sent"}
              </span>

              {revealed ? (
                <div className="my-1.5 flex flex-col items-center">
                  <span
                    className={cn(
                      "text-2xl sm:text-3xl font-bold font-mono tabular-nums",
                      isCorrect ? "text-success" : "text-destructive"
                    )}
                  >
                    {formatNumber(mode === "emotes" ? emoteB.total : chatterB.messages ?? 0)}
                  </span>
                  <span className="text-[9px] text-muted-foreground mt-0.5">
                    Rank #{mode === "emotes" ? emoteB.rank : chatterB.rank} (Diff:{" "}
                    {Math.abs(
                      (mode === "emotes" ? emoteB.rank : chatterB.rank) -
                        (mode === "emotes" ? emoteA.rank : chatterA.rank)
                    )}{" "}
                    ranks)
                  </span>
                </div>
              ) : (
                /* Guess Buttons */
                <div className="flex flex-col w-full max-w-xs gap-1.5 my-2">
                  <Button
                    size="sm"
                    onClick={() => handleGuess("higher")}
                    className="border-primary bg-primary text-black font-bold hover:bg-primary/90 flex items-center justify-center gap-1.5"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    Higher (More Uses)
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleGuess("lower")}
                    className="border-destructive bg-destructive text-white font-bold hover:bg-destructive/90 flex items-center justify-center gap-1.5"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    Lower (Fewer Uses)
                  </Button>
                </div>
              )}
            </div>

            <div className="border-t border-border/40 pt-1.5 text-center text-muted-foreground text-[9px]">
              {revealed
                ? isCorrect
                  ? "Correct! Advancing..."
                  : "Incorrect."
                : "Higher or lower total channel uses?"}
            </div>
          </div>
        </div>
      ) : (
        /* Game Over Minimal Screen */
        <div className="border border-destructive bg-card/80 p-6 text-center flex flex-col items-center justify-center gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-base font-bold text-destructive">
              Streak Ended! Final Score: {streak}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {mode === "emotes" ? (
                <span>
                  {emoteB.name} (#{emoteB.rank} · {formatNumber(emoteB.total)} uses) vs{" "}
                  {emoteA.name} (#{emoteA.rank} · {formatNumber(emoteA.total)} uses)
                </span>
              ) : (
                <span>
                  {chatterB.displayName} (#{chatterB.rank} · {formatNumber(chatterB.messages ?? 0)} msgs) vs{" "}
                  {chatterA.displayName} (#{chatterA.rank} · {formatNumber(chatterA.messages ?? 0)} msgs)
                </span>
              )}
            </span>
          </div>

          <Button
            size="sm"
            onClick={() => restartGame()}
            className="border-primary bg-primary text-black font-bold flex items-center gap-1.5 px-6"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Play Again
          </Button>
        </div>
      )}
    </div>
  );
}
