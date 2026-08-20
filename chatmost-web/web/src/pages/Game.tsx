import { useReducer, useRef, useState } from "react";
import { api, type Question, type LeaderboardEntry } from "@/lib/api";
import type { DynamicStreamerData } from "@/lib/dynamicStreamer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmoteDisplay } from "@/components/emote";
import { ChatterSurvivalLadder, type RescueChatter } from "@/components/millionaire/ChatterSurvivalLadder";
import { Lifelines, type LifelineState } from "@/components/millionaire/Lifelines";
import { HardModePicker } from "@/components/millionaire/HardModePicker";
import { RankedBarList } from "@/components/ui/chart-bar";
import { triggerMilestoneConfetti } from "@/lib/confetti";
import { useTwitchChat } from "@/hooks/useTwitchChat";
import { TwitchChatFeed } from "@/components/TwitchChatFeed";
import { useStreamer, useChannelData } from "@/lib/streamerContext";
import { StreamerHeroBar, StreamerErrorFallback } from "@/components/StreamerHeroBar";
import { RudeCatFlash } from "@/components/RudeCatFlash";
import { cn, formatNumber, isBot } from "@/lib/utils";
import { Skull, RotateCcw, Flame, CheckCircle2, XCircle } from "lucide-react";

type GameMode = "easy" | "hard";
type GameState = "loading" | "playing" | "locked" | "answered" | "gameover" | "victory";

type SessionState = {
  mode: GameMode;
  subMode: "emotes" | "words";
  tier: number;
  question: Question | null;
  selected: string | null;
  gameState: GameState;
  error: string | null;
  survivalRoster: RescueChatter[];
  sacrificedLogins: Set<string>;
  lifelines: LifelineState;
  eliminatedChoices: Set<string>;
  isFiftyFiftyActive: boolean;
  hardModeDecoys: { login: string; displayName: string }[];
};

type SessionAction = { type: "update"; value: Partial<SessionState> };

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  return { ...state, ...action.value };
}

const FUNNY_DEATH_REASONS = [
  "Banned to the shadow realm for emote spam",
  "Lost in the 7TV emote void forever",
  "Sub streak reset to 0 days",
  "Timed out for 300,000,000 seconds",
  "Died waiting for the streamer to read chat",
  "Overdosed on channel brainrot",
  "Choked on a bad prediction bet",
  "Tab crashed during the final moments",
];

export function Game() {
  const { channel: streamerChannel, setChannel: setStreamerChannel } = useStreamer();
  const channelData = useChannelData(streamerChannel);
  const [useFastFallback, setUseFastFallback] = useState(false);
  const dynamicData = (useFastFallback ? channelData.data : channelData.data) ?? null;

  const blocked = !useFastFallback && streamerChannel !== "" && (channelData.isPending || channelData.isIngesting || channelData.isError || channelData.archiveFailed);
  const loading = blocked && (channelData.isPending || channelData.isIngesting);

  return (
    <div className="flex flex-col gap-6 w-full">
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
        <GameBoard
          key={streamerChannel}
          channel={streamerChannel}
          dynamicData={dynamicData}
          setChannel={setStreamerChannel}
        />
      )}
    </div>
  );
}

function GameBoard({
  channel: streamerChannel,
  dynamicData,
  setChannel: setStreamerChannel,
}: {
  channel: string;
  dynamicData: DynamicStreamerData | null;
  setChannel: (c: string) => void;
}) {
  const [session, dispatch] = useReducer(sessionReducer, null, (): SessionState => {
    // Seed the first question synchronously during initial state so the game
    // never re-rolls the main emote after a data refresh lands.
    let firstQuestion: Question | null = null;
    let firstError: string | null = null;
    try {
      firstQuestion = api.question(1, [], [], dynamicData);
    } catch (err) {
      firstError = err instanceof Error ? err.message : String(err);
    }
    return {
      mode: "easy", subMode: "emotes", tier: 1, question: firstQuestion, selected: null,
      gameState: firstQuestion ? "playing" : "loading", error: firstError,
      survivalRoster: api.getRandomTop150Chatters(15, dynamicData),
      sacrificedLogins: new Set(), lifelines: { fiftyFiftyUsed: false },
      eliminatedChoices: new Set(), isFiftyFiftyActive: false, hardModeDecoys: [],
    };
  });
  const {
    mode, subMode, tier, question, selected, gameState, error, survivalRoster, sacrificedLogins,
    lifelines, eliminatedChoices, isFiftyFiftyActive, hardModeDecoys,
  } = session;
  const [showRudeCat, setShowRudeCat] = useState(false);
  const excludedTargets = useRef<string[]>([]);
  const excludedAnswers = useRef<string[]>([]);

  const stableChoices = question?.choices ?? [];
  const { status, messages, votes, totalVotes, percentages, recentVotes, resetVotes, channel, setChannel } =
    useTwitchChat(stableChoices, true, streamerChannel);

  const loadQuestion = (targetTier: number, excludes: string[] = [], excludeAnswers: string[] = [], scope: "emotes" | "words" = subMode) => {
    dispatch({ type: "update", value: { gameState: "loading", selected: null, error: null, eliminatedChoices: new Set(), isFiftyFiftyActive: false } });
    resetVotes();
    try {
      const q = api.question(targetTier, excludes, excludeAnswers, dynamicData, scope);
      dispatch({ type: "update", value: { question: q, gameState: "playing" } });
    } catch (err) {
      dispatch({ type: "update", value: { error: err instanceof Error ? err.message : String(err), gameState: "loading" } });
    }
  };

  const restartRun = (newMode?: GameMode, newSubMode?: "emotes" | "words") => {
    const nextSubMode = newSubMode ?? subMode;
    dispatch({ type: "update", value: {
      ...(newMode ? { mode: newMode } : {}), subMode: nextSubMode, tier: 1,
      survivalRoster: api.getRandomTop150Chatters(15, dynamicData), sacrificedLogins: new Set(),
      lifelines: { fiftyFiftyUsed: false },
    } });
    excludedTargets.current = [];
    excludedAnswers.current = [];
    loadQuestion(1, [], [], nextSubMode);
  };

  const currentRescueTarget = survivalRoster[tier - 1];

  const useFiftyFifty = () => {
    if (lifelines.fiftyFiftyUsed || !question || gameState !== "playing") return;
    const victim = currentRescueTarget || survivalRoster[0];
    const nextSacrificed = victim ? new Set([...sacrificedLogins, victim.login]) : sacrificedLogins;
    dispatch({ type: "update", value: { sacrificedLogins: nextSacrificed, lifelines: { fiftyFiftyUsed: true, sacrificedChatterName: victim?.displayName } } });
    if (mode === "easy") {
      const wrong = question.choices.filter((c) => c.login !== question.answer.login);
      const toElim = new Set(wrong.slice().sort(() => Math.random() - 0.5).slice(0, 2).map((c) => c.login));
      dispatch({ type: "update", value: { eliminatedChoices: toElim } });
    } else {
      dispatch({ type: "update", value: {
        isFiftyFiftyActive: true,
        hardModeDecoys: api.topChatters(200, dynamicData).filter((c) => c.login !== question.answer.login && !isBot(c.login))
          .slice().sort(() => Math.random() - 0.5).slice(0, 3),
      } });
    }
  };

  const chooseAnswer = (login: string) => {
    if (gameState !== "playing" || !question) return;
    dispatch({ type: "update", value: { selected: login, gameState: "locked" } });
    setTimeout(() => {
      const correct = login === question.answer.login;

      // Flash the rude cat when chat voted AND the chat majority picked the
      // wrong answer (regardless of whether the local player was right).
      const answerIndex = question.choices.findIndex((c) => c.login === question.answer.login);
      const maxVotes = Math.max(...votes);
      const maxCount = votes.filter((v) => v === maxVotes).length;
      const chatMajorityWrong =
        totalVotes > 0 && maxCount === 1 && votes.indexOf(maxVotes) !== answerIndex;
      if (chatMajorityWrong) {
        setShowRudeCat(true);
      }

      if (correct) {
        if (tier === 15) { dispatch({ type: "update", value: { gameState: "victory" } }); triggerMilestoneConfetti(15); }
        else { dispatch({ type: "update", value: { gameState: "answered" } }); if (tier === 5 || tier === 10) triggerMilestoneConfetti(tier); }
      } else {
        dispatch({ type: "update", value: { gameState: "gameover" } });
      }
    }, 600);
  };

  const advanceNextTier = () => {
    if (!question) return;
    const next = tier + 1;
    const nextEx = [...excludedTargets.current, question.target.name];
    const nextExA = [...excludedAnswers.current, question.answer.login];
    excludedTargets.current = nextEx;
    excludedAnswers.current = nextExA;
    dispatch({ type: "update", value: { tier: next } });
    loadQuestion(next, nextEx, nextExA, subMode);
  };

  if (error) return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-xs text-zinc-600">{error}</p>
      <Button size="sm" variant="outline" onClick={() => restartRun()}>Retry</Button>
    </div>
  );

  if (gameState === "loading" || !question) return (
    <div className="flex flex-col gap-3 max-w-xl mx-auto py-8">
      <Skeleton className="h-6 w-32 bg-white/[0.04]" />
      <Skeleton className="h-40 w-full bg-white/[0.04]" />
      <Skeleton className="h-36 w-full bg-white/[0.04]" />
    </div>
  );

  const { target, answer, leaderboard } = question;
  const isCorrect = selected === answer.login;
  const revealed = gameState === "answered" || gameState === "victory" || gameState === "gameover";
  const deadChatters = gameState === "gameover" ? survivalRoster.slice(tier - 1) : [];
  const savedChatters = gameState === "gameover"
    ? survivalRoster.slice(0, tier - 1).filter(c => !sacrificedLogins.has(c.login))
    : [];

  // Word trivia is an opt-in under Hard Mode; disable the toggle when the
  // channel's archive has no word questions at all.
  const wordQuestionCount = (dynamicData?.questions ?? []).filter((q) => q.target.kind === "word").length;

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="grid gap-8 lg:grid-cols-12">
        {/* ── Left: Main question area ── */}
        <div className="flex flex-col gap-8 lg:col-span-8">
            {/* Top row: stage + controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Mode toggle — plain text tabs */}
            <div className="flex items-center gap-0.5 text-xs font-mono">
              {(["easy", "hard"] as GameMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => restartRun(m)}
                  className={cn(
                    "px-2.5 py-1 select-none transition-colors",
                    mode === m ? "text-white" : "text-zinc-600 hover:text-zinc-400"
                  )}
                >
                  {m === "easy" ? "4 Choices" : "Hard"}
                </button>
              ))}

              {mode === "hard" && (
                <div className="ml-2 flex items-center gap-0.5 border-l border-white/[0.08] pl-2 text-[10px]">
                  {(["emotes", "words"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => restartRun("hard", s)}
                      disabled={s === "words" && wordQuestionCount === 0}
                      className={cn(
                        "px-2 py-1 select-none transition-colors disabled:opacity-30",
                        subMode === s ? "text-primary" : "text-zinc-600 hover:text-zinc-400"
                      )}
                      title={s === "words" && wordQuestionCount === 0 ? "No word trivia in this channel's archive" : undefined}
                    >
                      {s === "emotes" ? "Emotes" : "Words"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="text-xs font-mono text-zinc-600">
              Stage <span className="text-zinc-300">{tier}</span>/15
            </span>
          </div>

          <Lifelines
            lifelines={lifelines}
            onUseFiftyFifty={useFiftyFifty}
            disabled={gameState !== "playing" || isFiftyFiftyActive}
            currentChatterName={currentRescueTarget?.displayName}
          />
        </div>

        {/* Context line */}
        <p className="text-[11px] font-mono text-zinc-500">
          Saving <span className="text-zinc-300">{currentRescueTarget?.displayName}</span>
          <span className="text-primary ml-1">(#{currentRescueTarget?.rank})</span>
        </p>

        {/* ── Question ── centered, large, breathable */}
        <div className="flex flex-col items-center text-center gap-5 py-10">
          <p className="text-[11px] uppercase tracking-widest font-mono text-zinc-600">
            {target.kindLabel === "Channel"
              ? "Who has typed in this channel the most?"
              : `Who has typed this ${target.kindLabel.toLowerCase()} the most?`}
          </p>

          {target.url ? (
            <div className="flex flex-col items-center gap-2">
              <EmoteDisplay name={target.name} url={target.url} size="xl" />
              <span className="font-mono text-base text-zinc-300">{target.name}</span>
            </div>
          ) : (
            <span className="text-5xl sm:text-7xl font-black tracking-tight text-white leading-none">
              "{target.name}"
            </span>
          )}

          <p className="text-[11px] font-mono text-zinc-700">
            {formatNumber(target.totalUses)}{" "}
            {target.kindLabel === "Channel" ? "messages in channel" : "uses in channel"}
          </p>
        </div>

        {/* ── Choices ── flat rows, no card backgrounds */}
        <GameChoices mode={mode} question={question} gameState={gameState} selected={selected}
          eliminatedChoices={eliminatedChoices} percentages={percentages} totalVotes={totalVotes}
          revealed={revealed} dynamicData={dynamicData} isFiftyFiftyActive={isFiftyFiftyActive}
          hardModeDecoys={hardModeDecoys} onSelect={(login) => dispatch({ type: "update", value: { selected: login } })}
          onChoose={chooseAnswer} />

        {/* Answer reveal */}
        {(gameState === "answered" || gameState === "victory") && (
          <AnswerReveal
            leaderboard={leaderboard}
            target={target}
            answer={answer}
            wasCorrect={isCorrect}
            tier={tier}
            isVictory={gameState === "victory"}
            rescuedChatter={currentRescueTarget}
            onNext={advanceNextTier}
            onRestart={() => restartRun()}
          />
        )}

        {/* Game over */}
        {gameState === "gameover" && (
          <GameOver
            tier={tier}
            targetName={target.name}
            dead={deadChatters}
            saved={savedChatters}
            sacrificedLogins={sacrificedLogins}
            onRestart={() => restartRun()}
          />
        )}

        {/* Chat vote footnote */}
        <p className="text-[11px] font-mono text-zinc-700">
          {recentVotes.length > 0
            ? <>Last vote: <span className="text-zinc-400">{recentVotes[0].voter}</span> → <span className="text-primary">{recentVotes[0].choiceName}</span></>
            : `Chat: type 1–4, A–D, or names · ${totalVotes} votes`
          }
        </p>

        {/* Twitch chat feed */}
        <TwitchChatFeed
          messages={messages}
          status={status}
          channel={channel}
          totalVotes={totalVotes}
          onSetChannel={(ch) => {
            setChannel(ch);
            setStreamerChannel(ch);
          }}
        />
      </div>

      {/* ── Right: Survival ladder ── */}
      <div className="lg:col-span-4">
        <ChatterSurvivalLadder
          currentTier={tier}
          roster={survivalRoster}
          gameState={gameState}
          sacrificedLogins={sacrificedLogins}
        />
      </div>
    </div>

    {/* Rude Cat Flash on Chat Wrong Guess */}
    <RudeCatFlash show={showRudeCat} onDismiss={() => setShowRudeCat(false)} />
  </div>
  );
}

/* ── sub-components ── */

function GameChoices({ mode, question, gameState, selected, eliminatedChoices, percentages, totalVotes,
  revealed, dynamicData, isFiftyFiftyActive, hardModeDecoys, onSelect, onChoose }: {
  mode: GameMode; question: Question; gameState: GameState; selected: string | null;
  eliminatedChoices: Set<string>; percentages: number[]; totalVotes: number; revealed: boolean;
  dynamicData: DynamicStreamerData | null; isFiftyFiftyActive: boolean;
  hardModeDecoys: { login: string; displayName: string }[];
  onSelect: (login: string) => void; onChoose: (login: string) => void;
}) {
  if (mode === "hard") return <HardModePicker chatters={api.topChatters(200, dynamicData)}
    answerLogin={question.answer.login} isFiftyFiftyActive={isFiftyFiftyActive}
    fiftyFiftyDecoys={hardModeDecoys} disabled={gameState !== "playing"} selectedLogin={selected}
    onSelect={onSelect} onConfirm={() => selected && onChoose(selected)} />;

  return <div className="flex flex-col divide-y divide-white/[0.05]">
    {question.choices.map((choice, i) => {
      const isAns = choice.login === question.answer.login;
      const isSel = choice.login === selected;
      const isElim = eliminatedChoices.has(choice.login);
      const pct = percentages[i] ?? 0;
      let rowCls = "text-zinc-200 hover:text-white hover:bg-white/[0.02]";
      let extra = "";
      let badge: React.ReactNode = null;
      if (isElim) rowCls = "text-zinc-700 line-through cursor-not-allowed";
      else if (gameState === "locked" && isSel) rowCls = "text-white bg-white/[0.03]";
      else if (revealed && isAns) {
        rowCls = "text-green-400"; extra = "animate-correct-pop";
        badge = <span className="flex items-center gap-1 text-[10px] font-mono text-green-400/70"><CheckCircle2 className="h-3 w-3" /> correct</span>;
      } else if (revealed && isSel) {
        rowCls = "text-primary"; extra = "animate-wrong-shake";
        badge = <span className="flex items-center gap-1 text-[10px] font-mono text-primary/70"><XCircle className="h-3 w-3" /> wrong</span>;
      } else if (revealed) rowCls = "text-zinc-600";
      return <button key={choice.login} type="button" disabled={gameState !== "playing" || isElim}
        onClick={() => onChoose(choice.login)} className={cn("relative flex items-center justify-between px-0 py-3.5 text-left font-mono text-sm transition-[color,background-color,transform]", rowCls, extra)}>
        {totalVotes > 0 && !isElim && <div className="absolute inset-y-0 left-0 bg-white/[0.025] transition-[width] duration-700 pointer-events-none" style={{ width: `${pct}%` }} />}
        <div className="flex items-center gap-4 relative z-10"><span className="text-zinc-600 w-3 text-xs">{["A", "B", "C", "D"][i]}</span><span className="font-semibold">{choice.displayName}</span></div>
        <div className="flex items-center gap-3 relative z-10 shrink-0">{badge}{totalVotes > 0 && !isElim && <span className="text-xs font-mono text-zinc-600">{pct}%</span>}</div>
      </button>;
    })}
  </div>;
}

function AnswerReveal({ leaderboard, target, answer, wasCorrect, tier, isVictory, rescuedChatter, onNext, onRestart }: {
  leaderboard: LeaderboardEntry[];
  target: Question["target"];
  answer: Question["answer"];
  wasCorrect: boolean;
  tier: number;
  isVictory: boolean;
  rescuedChatter?: RescueChatter;
  onNext: () => void;
  onRestart: () => void;
}) {
  const chartData = leaderboard.slice(0, 8).map((e, i) => ({
    label: e.displayName, count: e.count, isAnswer: e.login === answer.login, rank: i + 1,
  }));

  return (
    <div className="flex flex-col gap-4 pt-6 border-t border-white/[0.06]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-200">
          {isVictory ? "All 15 saved 🎉" : wasCorrect ? `Saved ${rescuedChatter?.displayName}` : "Rescue failed"}
        </p>
        <Button size="sm" onClick={wasCorrect && !isVictory ? onNext : onRestart}
          className="text-xs font-mono bg-transparent border border-white/[0.1] text-zinc-300 hover:text-white hover:border-white/20">
          {wasCorrect && !isVictory ? `Stage ${tier + 1} →` : "New run"}
        </Button>
      </div>

      <p className="text-[11px] font-mono text-zinc-600">
        Top user of {target.url
          ? <EmoteDisplay name={target.name} url={target.url} size="sm" />
          : `"${target.name}"`
        }: <span className="text-zinc-300">{leaderboard[0]?.displayName}</span> ({formatNumber(leaderboard[0]?.count ?? 0)})
      </p>

      <RankedBarList data={chartData} valueUnit="uses" />
    </div>
  );
}

function GameOver({ tier, targetName, dead, saved, sacrificedLogins, onRestart }: {
  tier: number;
  targetName: string;
  dead: RescueChatter[];
  saved: RescueChatter[];
  sacrificedLogins: Set<string>;
  onRestart: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 pt-6 border-t border-white/[0.08] animate-death-strike">
      {/* Failure banner with instant prominent Retry CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-primary/[0.08] border border-primary/30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 border border-primary/40 shrink-0">
            <Skull className="h-5 w-5 text-primary animate-skull-pulse" />
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              RUN TERMINATED · STAGE {tier}
            </p>
            <p className="text-xs text-primary/80 font-mono mt-0.5">
              "{targetName}" claimed {dead.length} {dead.length === 1 ? "chatter" : "chatters"}
            </p>
          </div>
        </div>

        <Button
          size="sm"
          onClick={onRestart}
          className="bg-primary text-white font-bold text-xs px-5 py-2 hover:bg-primary/90 border border-primary/50 shadow-lg active:scale-95 transition-[color,background-color,border-color,transform] flex items-center gap-2"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Play Again (Stage 1)
        </Button>
      </div>

      {/* Casualties summary & fallen chatters */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06] text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
          <span>Casualty Report</span>
          <span>Rank</span>
        </div>

        <div className="flex flex-col divide-y divide-white/[0.04]">
          {dead.map((c, i) => {
            const isSac = sacrificedLogins.has(c.login);
            const note = isSac ? "Sacrificed for the 50:50 lifeline" : FUNNY_DEATH_REASONS[(tier + i) % FUNNY_DEATH_REASONS.length];
            return (
              <div
                key={c.login}
                className="flex items-center justify-between py-2 animate-flip-reveal transition-[color,background-color,opacity,transform]"
                style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
              >
                <div className="flex items-center gap-2.5 font-mono text-xs min-w-0">
                  {isSac ? (
                    <Flame className="h-3.5 w-3.5 text-primary shrink-0 opacity-80" />
                  ) : (
                    <Skull className="h-3.5 w-3.5 text-primary shrink-0 opacity-80" />
                  )}
                  <span className={cn(
                    "font-bold truncate",
                    isSac ? "text-zinc-500 line-through" : "text-primary/90 line-through"
                  )}>
                    {c.displayName}
                  </span>
                  <span className="text-zinc-500 italic text-[11px] font-sans truncate hidden sm:inline">
                    — {note}
                  </span>
                </div>
                <span className="text-zinc-500 text-[11px] font-mono tabular-nums shrink-0 ml-2">
                  #{c.rank}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {saved.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400 font-sans pt-1">
          <span className="text-green-400 font-semibold font-mono">Rescued ({saved.length}):</span>
          <span className="text-zinc-300">{saved.map(c => c.displayName).join(", ")}</span>
        </div>
      )}
    </div>
  );
}
