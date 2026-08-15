import { useCallback, useEffect, useMemo, useState } from "react";
import { api, PRIZE_TIERS, type Question, type LeaderboardEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmoteDisplay, KindBadge } from "@/components/emote";
import { Ladder } from "@/components/millionaire/Ladder";
import { Lifelines, type LifelineState } from "@/components/millionaire/Lifelines";
import { HardModePicker } from "@/components/millionaire/HardModePicker";
import { RankedBarList } from "@/components/ui/chart-bar";
import { triggerMilestoneConfetti } from "@/lib/confetti";
import { useTwitchChat } from "@/hooks/useTwitchChat";
import { cn, formatNumber } from "@/lib/utils";

type GameMode = "easy" | "hard";
type GameState = "loading" | "playing" | "locked" | "answered" | "gameover" | "victory";

export function Game() {
  const [mode, setMode] = useState<GameMode>("easy");
  const [tier, setTier] = useState(1);
  const [question, setQuestion] = useState<Question | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [excludedTargets, setExcludedTargets] = useState<string[]>([]);
  const [excludedAnswers, setExcludedAnswers] = useState<string[]>([]);

  // 50:50 Lifeline
  const [lifelines, setLifelines] = useState<LifelineState>({
    fiftyFiftyUsed: false,
  });
  const [eliminatedChoices, setEliminatedChoices] = useState<Set<string>>(new Set());
  const [isFiftyFiftyActive, setIsFiftyFiftyActive] = useState(false);
  const [hardModeDecoys, setHardModeDecoys] = useState<{ login: string; displayName: string }[]>([]);

  // Twitch Chat Hook
  const stableChoices = useMemo(() => question?.choices ?? [], [question?.choices]);
  const {
    votes,
    totalVotes,
    percentages,
    recentVotes,
    resetVotes,
  } = useTwitchChat(stableChoices, true);

  // Load a question for current tier
  const loadQuestion = useCallback(
    async (targetTier: number, excludes: string[] = [], excludeAnswers: string[] = []) => {
      setGameState("loading");
      setSelected(null);
      setError(null);
      setEliminatedChoices(new Set());
      setIsFiftyFiftyActive(false);
      resetVotes();

      try {
        const q = await api.question(targetTier, excludes, excludeAnswers);
        setQuestion(q);
        setGameState("playing");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setGameState("loading");
      }
    },
    [resetVotes]
  );

  // Start initial run
  useEffect(() => {
    let active = true;
    api
      .question(1, [], [])
      .then((q) => {
        if (active) {
          setQuestion(q);
          setGameState("playing");
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
          setGameState("loading");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Restart a fresh Millionaire run
  const restartRun = useCallback((newMode?: GameMode) => {
    if (newMode) setMode(newMode);
    setTier(1);
    setLifelines({
      fiftyFiftyUsed: false,
    });
    setExcludedTargets([]);
    setExcludedAnswers([]);
    void loadQuestion(1, [], []);
  }, [loadQuestion]);

  // 50:50 Lifeline Handler
  const handleFiftyFifty = () => {
    if (lifelines.fiftyFiftyUsed || !question || gameState !== "playing") return;
    setLifelines({ fiftyFiftyUsed: true });
    setIsFiftyFiftyActive(true);

    if (mode === "easy") {
      const wrongChoices = question.choices.filter(
        (c) => c.login !== question.answer.login
      );
      const toEliminate = wrongChoices
        .sort(() => Math.random() - 0.5)
        .slice(0, 2)
        .map((c) => c.login);
      setEliminatedChoices(new Set(toEliminate));
    } else {
      const topChatters = api.topChatters(200);
      const shuffled = topChatters
        .filter((c) => c.login !== question.answer.login)
        .sort(() => Math.random() - 0.5);
      setHardModeDecoys(shuffled.slice(0, 14));
    }
  };

  // Choose an answer
  const chooseAnswer = useCallback((login: string) => {
    if (gameState !== "playing" || !question) return;
    setSelected(login);
    setGameState("locked");

    // Tension suspense reveal
    setTimeout(() => {
      const correct = login === question.answer.login;
      if (correct) {
        triggerMilestoneConfetti(tier);
        if (tier === 15) {
          setGameState("victory");
        } else {
          setGameState("answered");
        }
      } else {
        setGameState("gameover");
      }
    }, 700);
  }, [gameState, question, tier]);

  // Advance to next tier
  const advanceNextTier = useCallback(() => {
    const nextTier = tier + 1;
    setTier(nextTier);
    const nextExcludes = question
      ? [...excludedTargets, question.target.name]
      : excludedTargets;
    const nextAnswers = question
      ? [...excludedAnswers, question.answer.login]
      : excludedAnswers;

    setExcludedTargets(nextExcludes);
    setExcludedAnswers(nextAnswers);
    void loadQuestion(nextTier, nextExcludes, nextAnswers);
  }, [tier, question, excludedTargets, excludedAnswers, loadQuestion]);

  // Calculate guaranteed safe winnings
  const calculateGuaranteed = () => {
    if (tier > 10) return "$32,000";
    if (tier > 5) return "$1,000";
    return "$0";
  };

  // Keyboard controls for rapid gameplay (1-4, A-D, Space/Enter to advance)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (mode === "hard") return;

      if (gameState === "answered") {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          advanceNextTier();
        }
        return;
      }

      if (gameState === "gameover" || gameState === "victory") {
        if (e.key === " " || e.key === "Enter" || e.key === "r" || e.key === "R") {
          e.preventDefault();
          restartRun();
        }
        return;
      }

      if (gameState !== "playing" || !question) return;

      const key = e.key.toLowerCase();
      if (key === "1" || key === "a") {
        e.preventDefault();
        if (question.choices[0] && !eliminatedChoices.has(question.choices[0].login)) {
          chooseAnswer(question.choices[0].login);
        }
      } else if (key === "2" || key === "b") {
        e.preventDefault();
        if (question.choices[1] && !eliminatedChoices.has(question.choices[1].login)) {
          chooseAnswer(question.choices[1].login);
        }
      } else if (key === "3" || key === "c") {
        e.preventDefault();
        if (question.choices[2] && !eliminatedChoices.has(question.choices[2].login)) {
          chooseAnswer(question.choices[2].login);
        }
      } else if (key === "4" || key === "d") {
        e.preventDefault();
        if (question.choices[3] && !eliminatedChoices.has(question.choices[3].login)) {
          chooseAnswer(question.choices[3].login);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, mode, question, eliminatedChoices, chooseAnswer, advanceNextTier, restartRun]);

  if (error) {
    return (
      <div className="border border-destructive bg-destructive/10 p-4 font-mono text-xs">
        <p className="text-destructive font-bold mb-2">Error: {error}</p>
        <Button size="sm" onClick={() => restartRun()}>Restart Game</Button>
      </div>
    );
  }

  if (gameState === "loading" || !question) {
    return (
      <div className="flex flex-col gap-3 font-mono">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  const { target, choices, answer, leaderboard, prize } = question;
  const isCorrect = selected === answer.login;

  return (
    <div className="flex flex-col gap-3 font-mono text-xs max-w-5xl mx-auto">
      {/* Compact Top Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2">
        {/* Mode Selector */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => restartRun("easy")}
            className={cn(
              "border px-2 py-0.5 text-xs font-bold transition-none",
              mode === "easy"
                ? "border-primary bg-primary text-black"
                : "border-border/60 bg-card/30 text-muted-foreground hover:text-foreground"
            )}
          >
            Easy (4)
          </button>
          <button
            type="button"
            onClick={() => restartRun("hard")}
            className={cn(
              "border px-2 py-0.5 text-xs font-bold transition-none",
              mode === "hard"
                ? "border-destructive bg-destructive text-white"
                : "border-border/60 bg-card/30 text-muted-foreground hover:text-foreground"
            )}
          >
            Hard (Top 200)
          </button>
        </div>

        {/* Prize & 50:50 Lifeline */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-gold border border-gold/40 bg-gold/5 px-2 py-0.5">
            Tier {tier} · {prize}
          </span>

          <Lifelines
            lifelines={lifelines}
            disabled={gameState !== "playing"}
            onUseFiftyFifty={handleFiftyFifty}
          />
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left: Question + Choices Area (8 cols) */}
        <div className="flex flex-col gap-3 lg:col-span-8">
          {/* Question Stage - Compact, Centered & Clean */}
          <div className="border border-border/70 bg-card/30 p-5 flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-2 mb-1.5">
              <KindBadge kind={target.kind} />
              <span className="text-[10px] text-muted-foreground">
                Question {tier}/15 · {formatNumber(target.totalUses)} uses
              </span>
            </div>

            <span className="text-[11px] text-muted-foreground mb-2 block font-medium">
              Who typed this the most in chat?
            </span>

            {/* Emote (Hover to see name) or Word Text */}
            <div className="py-1 flex items-center justify-center min-h-[56px]">
              {target.url ? (
                <EmoteDisplay name={target.name} url={target.url} size="xl" />
              ) : (
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  “{target.name}”
                </span>
              )}
            </div>
          </div>

          {/* Choices: Easy vs Hard */}
          {mode === "easy" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {choices.map((choice, i) => {
                const isAnswer = choice.login === answer.login;
                const isSelected = choice.login === selected;
                const isEliminated = eliminatedChoices.has(choice.login);
                const letter = ["A", "B", "C", "D"][i] || `${i + 1}`;
                const voteCount = votes[i] ?? 0;
                const votePct = percentages[i] ?? 0;

                let buttonStyle = "border-border/70 bg-card/40 hover:border-primary hover:bg-card/90 text-foreground";
                let extra = "";

                if (isEliminated) {
                  buttonStyle = "border-border/20 bg-muted/5 opacity-15 cursor-not-allowed line-through";
                } else if (gameState === "locked" && isSelected) {
                  buttonStyle = "border-gold bg-gold/15 text-gold font-bold";
                } else if (gameState === "answered" || gameState === "victory" || gameState === "gameover") {
                  if (isAnswer) {
                    buttonStyle = "border-success bg-success/20 text-success font-bold";
                  } else if (isSelected) {
                    buttonStyle = "border-destructive bg-destructive/20 text-destructive font-bold";
                    extra = "animate-strike";
                  } else {
                    buttonStyle = "border-border/30 opacity-20";
                  }
                }

                return (
                  <button
                    key={choice.login}
                    type="button"
                    disabled={gameState !== "playing" || isEliminated}
                    onClick={() => chooseAnswer(choice.login)}
                    className={cn(
                      "flex items-center justify-between border px-3 py-2.5 text-left font-mono transition-none text-xs",
                      buttonStyle,
                      extra
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center border border-border bg-background text-[9px] font-bold text-muted-foreground">
                        {letter}
                      </span>
                      <span className="font-bold truncate">{choice.displayName}</span>
                    </div>

                    {totalVotes > 0 && voteCount > 0 && !isEliminated && (
                      <span className="text-[9px] font-mono text-primary font-bold shrink-0">
                        {votePct}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <HardModePicker
              chatters={api.topChatters(200)}
              answerLogin={answer.login}
              isFiftyFiftyActive={isFiftyFiftyActive}
              fiftyFiftyDecoys={hardModeDecoys}
              disabled={gameState !== "playing"}
              selectedLogin={selected}
              onSelect={(login) => setSelected(login)}
              onConfirm={() => selected && chooseAnswer(selected)}
            />
          )}

          {/* Understated 1-Line Audience Status */}
          <div className="flex items-center justify-between border-t border-border/50 pt-1.5 text-[10px] text-muted-foreground">
            <span>
              {recentVotes.length > 0 ? (
                <span>
                  Vote: <strong className="text-foreground">{recentVotes[0].voter}</strong> →{" "}
                  <span className="text-primary font-bold">{recentVotes[0].choiceName}</span>
                </span>
              ) : (
                "Chat voting active"
              )}
            </span>
            <span className="font-mono">
              {totalVotes} votes
            </span>
          </div>

          {/* Answered / Leaderboard Breakdown */}
          {(gameState === "answered" || gameState === "victory" || gameState === "gameover") && (
            <div className="border border-border/80 bg-card/90 p-4 mt-1">
              <LeaderboardCard
                leaderboard={leaderboard}
                targetName={target.name}
                targetKind={target.kind}
                targetUrl={target.url}
                answerLogin={answer.login}
                wasCorrect={isCorrect}
                currentTier={tier}
                isGrandPrize={gameState === "victory"}
                guaranteedPrize={calculateGuaranteed()}
                onNextTier={advanceNextTier}
                onRestart={() => restartRun()}
              />
            </div>
          )}
        </div>

        {/* Right: Prize Ladder (4 cols) */}
        <div className="lg:col-span-4">
          <Ladder currentTier={tier} />
        </div>
      </div>
    </div>
  );
}

function LeaderboardCard({
  leaderboard,
  targetName,
  targetKind,
  targetUrl,
  answerLogin,
  wasCorrect,
  currentTier,
  isGrandPrize,
  guaranteedPrize,
  onNextTier,
  onRestart,
}: {
  leaderboard: LeaderboardEntry[];
  targetName: string;
  targetKind: string;
  targetUrl: string | null;
  answerLogin: string;
  wasCorrect: boolean;
  currentTier: number;
  isGrandPrize: boolean;
  guaranteedPrize: string;
  onNextTier: () => void;
  onRestart: () => void;
}) {
  const chartData = leaderboard.slice(0, 8).map((e, idx) => ({
    label: e.displayName,
    count: e.count,
    isAnswer: e.login === answerLogin,
    rank: idx + 1,
  }));

  const currentPrize = PRIZE_TIERS[currentTier - 1]?.prize || "$100";
  const nextPrize = PRIZE_TIERS[currentTier]?.prize || "$1,000,000";

  return (
    <div className="flex flex-col gap-2.5 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5">
        <span className={cn("font-bold text-xs", wasCorrect ? "text-success" : "text-destructive")}>
          {isGrandPrize
            ? "Grand Champion! Won $1,000,000!"
            : wasCorrect
            ? `Correct! Cleared Tier ${currentTier} (${currentPrize})`
            : `Game Over.`}
        </span>

        {!wasCorrect && (
          <span className="border border-gold bg-gold/10 px-1.5 py-0.2 text-gold font-bold text-[10px]">
            Guaranteed: {guaranteedPrize}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-muted-foreground text-[10px]">
        <span>Top chatter:</span>
        {targetUrl ? (
          <EmoteDisplay name={targetName} url={targetUrl} size="sm" />
        ) : (
          <span className="font-bold text-foreground">“{targetName}”</span>
        )}
        <KindBadge kind={targetKind} />
        <span className="font-bold text-primary">{leaderboard[0]?.displayName}</span>
        <span>({formatNumber(leaderboard[0]?.count ?? 0)} uses)</span>
      </div>

      {/* Ranked Data Meter */}
      <RankedBarList data={chartData} valueUnit="uses" />

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border pt-2">
        {wasCorrect && !isGrandPrize ? (
          <Button
            size="sm"
            onClick={onNextTier}
            className="border-primary bg-primary text-black font-bold px-6"
          >
            Next Tier ({nextPrize})
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onRestart}
            className="border-primary bg-primary text-black font-bold px-6"
          >
            {isGrandPrize ? "Play Again" : "Retry"}
          </Button>
        )}
      </div>
    </div>
  );
}