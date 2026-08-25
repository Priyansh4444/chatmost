import { useState, useEffect, useRef } from "react";
import {
  type QTEPhase,
  type QTEMode,
  type QTEParticipant,
  type QTEPrompt,
  type VerdictResult,
  type QTEVoteMessage,
} from "@/lib/qteTypes";
import { qteAudio } from "@/lib/qteAudio";
import { twitchChat, parseTwitchVote, type TwitchChatMessage } from "@/lib/twitchChat";
import confetti from "canvas-confetti";
import {
  Volume2,
  VolumeX,
  X,
  AlertTriangle,
  Gavel,
  ShieldCheck,
  Ban,
  Clock,
  Swords,
  Trophy,
  Radio,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { renderChatEmotes } from "@/lib/renderChatEmotes";

const TOTAL_DEFENSE_SECONDS = 60.0;
const TOTAL_VOTING_SECONDS = 30.0;

interface QTEModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: QTEMode;
  prompt: QTEPrompt;
  p1: QTEParticipant;
  p2?: QTEParticipant;
  channel: string;
  onRecordHistory?: (verdict: VerdictResult, p1Votes: number, p2Votes: number) => void;
  liveChatters?: QTEParticipant[];
  emoteMap?: Map<string, string>;
}

export function QTEModal({
  isOpen,
  onClose,
  mode,
  prompt,
  p1: initialP1,
  p2: initialP2,
  channel,
  onRecordHistory,
  liveChatters = [],
  emoteMap,
}: QTEModalProps) {
  const [phase, setPhase] = useState<QTEPhase>("siren");
  const [p1, setP1] = useState<QTEParticipant>(initialP1);
  const [p2, setP2] = useState<QTEParticipant | undefined>(initialP2);
  const [inputTimeLeft, setInputTimeLeft] = useState<number>(TOTAL_DEFENSE_SECONDS);
  const [votingTimeLeft, setVotingTimeLeft] = useState<number>(TOTAL_VOTING_SECONDS);
  const [verdict, setVerdict] = useState<VerdictResult | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [screenShake, setScreenShake] = useState(false);
  const [rouletteNames, setRouletteNames] = useState<string[]>([]);
  const [voteCountP1, setVoteCountP1] = useState<number>(0);
  const [voteCountP2, setVoteCountP2] = useState<number>(0);
  const [liveVoteFeed, setLiveVoteFeed] = useState<QTEVoteMessage[]>([]);
  const voteScrollRef = useRef<HTMLDivElement>(null);

  const voteP1Ref = useRef(0);
  const voteP2Ref = useRef(0);
  const voterMapRef = useRef<Map<string, "p1" | "p2" | "spare" | "ban">>(new Map());
  const hasInitializedRef = useRef(false);
  const skipInputRef = useRef(false);

  useEffect(() => {
    voteP1Ref.current = voteCountP1;
  }, [voteCountP1]);

  useEffect(() => {
    voteP2Ref.current = voteCountP2;
  }, [voteCountP2]);

  const handleClose = () => {
    onClose();
  };

  const applyVerdict = (res: VerdictResult) => {
    setVerdict(res);
    setPhase("verdict");

    if (res === "banned" || res === "timedout") {
      if (soundEnabled) qteAudio.playBanHammer();
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 600);
    } else {
      if (soundEnabled) qteAudio.playVictoryFanfare();
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.6 },
        colors: ["#38bdf8", "#4ade80", "#fbbf24", "#f43f5e", "#a78bfa"],
      });
    }

    if (onRecordHistory) {
      onRecordHistory(res, voteP1Ref.current, voteP2Ref.current);
    }
  };

  // Auto-scroll the live chat feed during voting
  useEffect(() => {
    if (voteScrollRef.current) {
      voteScrollRef.current.scrollTop = voteScrollRef.current.scrollHeight;
    }
  }, [liveVoteFeed]);

  // Initial modal open setup (runs once per open)
  useEffect(() => {
    if (isOpen) {
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        setP1(initialP1);
        setP2(initialP2);
        setPhase("siren");
        setInputTimeLeft(TOTAL_DEFENSE_SECONDS);
        setVotingTimeLeft(TOTAL_VOTING_SECONDS);
        setVerdict(null);
        setVoteCountP1(0);
        setVoteCountP2(0);
        voteP1Ref.current = 0;
        voteP2Ref.current = 0;
        voterMapRef.current.clear();
        setLiveVoteFeed([]);
        qteAudio.enabled = soundEnabled;
      }
    } else {
      hasInitializedRef.current = false;
    }
  }, [isOpen, initialP1, initialP2, soundEnabled]);

  // 1. SIREN PHASE (1.2s)
  useEffect(() => {
    if (!isOpen || phase !== "siren") return;

    if (soundEnabled) qteAudio.playSiren();
    const shakeStart = setTimeout(() => setScreenShake(true), 20);
    const shakeTimer = setTimeout(() => setScreenShake(false), 600);
    const nextTimer = setTimeout(() => setPhase("roulette"), 1200);

    return () => {
      clearTimeout(shakeStart);
      clearTimeout(shakeTimer);
      clearTimeout(nextTimer);
    };
  }, [isOpen, phase, soundEnabled]);

  // 2. ROULETTE PHASE (1.6s)
  useEffect(() => {
    if (!isOpen || phase !== "roulette") return;

    let ticks = 0;
    const interval = setInterval(() => {
      ticks++;
      if (soundEnabled && ticks % 2 === 0) qteAudio.playTick(1 + ticks * 0.05);

      if (liveChatters && liveChatters.length >= 2) {
        const shuffled = [...liveChatters].sort(() => 0.5 - Math.random());
        setRouletteNames([
          `@${shuffled[0].displayName || shuffled[0].username}`,
          `@${shuffled[1]?.displayName || shuffled[1]?.username || shuffled[0].username}`,
        ]);
      } else if (liveChatters && liveChatters.length === 1) {
        setRouletteNames([`@${liveChatters[0].displayName || liveChatters[0].username}`, `@${p1.username}`]);
      } else {
        setRouletteNames([`@${p1.username}`, `@${p2?.username || "opponent"}`]);
      }

      if (ticks >= 12) {
        clearInterval(interval);
        setPhase("ready");
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isOpen, phase, soundEnabled, liveChatters, p1.username, p2?.username]);

  // 3. READY PHASE (0.9s)
  useEffect(() => {
    if (!isOpen || phase !== "ready") return;

    if (soundEnabled) qteAudio.playReadyFight();
    const readyTimer = setTimeout(() => {
      setPhase("input");
    }, 900);
    return () => clearTimeout(readyTimer);
  }, [isOpen, phase, soundEnabled]);

  // 4. INPUT TIMER (60.00s) — REAL CHAT DEFENSE LISTENER
  useEffect(() => {
    if (!isOpen || phase !== "input") return;

    const startTime = Date.now();
    const durationMs = TOTAL_DEFENSE_SECONDS * 1000;
    let lastTickSecond = Math.ceil(TOTAL_DEFENSE_SECONDS);
    // A streamer "Skip" click ends the defense window immediately.
    skipInputRef.current = false;

    // Listen to real Twitch IRC messages for the chosen chatters' defenses
    const unsubMsg = twitchChat.onMessage((msg: TwitchChatMessage) => {
      const senderLogin = msg.username.toLowerCase();
      const p1Login = p1.username.toLowerCase();
      const p2Login = p2?.username.toLowerCase();

      if (senderLogin === p1Login) {
        setP1((prev) => ({
          ...prev,
          defenseText: msg.message,
          submittedAt: Date.now(),
        }));
        if (soundEnabled) qteAudio.playTick(1.8);
      } else if (mode === "duo_duel" && p2Login && senderLogin === p2Login) {
        setP2((prev) =>
          prev
            ? {
                ...prev,
                defenseText: msg.message,
                submittedAt: Date.now(),
              }
            : undefined
        );
        if (soundEnabled) qteAudio.playTick(1.8);
      }
    });

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = skipInputRef.current ? 0 : Math.max(0, (durationMs - elapsed) / 1000);
      setInputTimeLeft(remaining);

      const wholeSec = Math.ceil(remaining);
      if (wholeSec !== lastTickSecond && wholeSec >= 1) {
        lastTickSecond = wholeSec;
        if (soundEnabled && wholeSec <= 5) {
          qteAudio.playCountdownTick(wholeSec, TOTAL_DEFENSE_SECONDS);
        }
      }

      if (remaining <= 0) {
        clearInterval(interval);
        unsubMsg();
        if (soundEnabled) qteAudio.playBuzzer();

        setP1((prev) => ({
          ...prev,
          defenseText: prev.defenseText || "*(Remained silent — no message in chat)*",
        }));
        if (mode === "duo_duel") {
          setP2((prev) =>
            prev
              ? {
                  ...prev,
                  defenseText: prev.defenseText || "*(Remained silent — no message in chat)*",
                }
              : undefined
          );
        }

        setPhase("voting");
      }
    }, 40);

    return () => {
      clearInterval(interval);
      unsubMsg();
    };
  }, [isOpen, phase, mode, soundEnabled, p1.username, p2?.username]);

  // 5. VOTING & REAL LIVE CHAT (10.0s)
  useEffect(() => {
    if (!isOpen || phase !== "voting") return;

    const startTime = Date.now();
    const durationMs = TOTAL_VOTING_SECONDS * 1000;
    voterMapRef.current.clear();

    // Listen to real live Twitch chat for votes
    const unsubMsg = twitchChat.onMessage((msg: TwitchChatMessage) => {
      const raw = msg.message.trim().toLowerCase();
      const voter = msg.username.toLowerCase();
      let choice: "p1" | "p2" | "spare" | "ban" | undefined;

      if (mode === "solo_trial") {
        // Option 1 = Spare / Pardon
        const isSpare =
          /^(1|!1|#1|a|!a)\b/i.test(raw) ||
          /\b(spare|pardon|innocent|save|live|yes|free)\b/i.test(raw);

        // Option 2 = Ban / Timeout
        const isBan =
          /^(2|!2|#2|b|!b)\b/i.test(raw) ||
          /\b(ban|guilty|kill|timeout|banned|no|dead)\b/i.test(raw);

        if (isSpare && !isBan) choice = "spare";
        else if (isBan && !isSpare) choice = "ban";
      } else {
        // Option 1 vs Option 2 (Duo Duel)
        const voteRes = parseTwitchVote(msg.message, [
          { login: p1.username, displayName: p1.displayName || p1.username },
          { login: p2?.username || "p2", displayName: p2?.displayName || p2?.username || "P2" },
        ]);
        if (voteRes) {
          choice = voteRes.index === 0 ? "p1" : voteRes.index === 1 ? "p2" : undefined;
        }
      }

      if (choice) {
        voterMapRef.current.set(voter, choice);

        let count1 = 0;
        let count2 = 0;
        for (const v of voterMapRef.current.values()) {
          if (v === "p1" || v === "spare") count1++;
          else if (v === "p2" || v === "ban") count2++;
        }
        voteP1Ref.current = count1;
        voteP2Ref.current = count2;
        setVoteCountP1(count1);
        setVoteCountP2(count2);
      }

      // Add all incoming live messages to the stream (tagged with choice if voted)
      const voteMsg: QTEVoteMessage = {
        id: msg.id || Math.random().toString(36).slice(2),
        username: msg.username,
        displayName: msg.displayName || msg.username,
        color: msg.color || "#00f0ff",
        choice: choice || (mode === "solo_trial" ? "spare" : "p1"),
        text: msg.message,
        timestamp: msg.timestamp || Date.now(),
      };

      setLiveVoteFeed((prev) => [...prev.slice(-19), voteMsg]);
    });

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, (durationMs - elapsed) / 1000);
      setVotingTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        unsubMsg();

        let count1 = 0;
        let count2 = 0;
        for (const v of voterMapRef.current.values()) {
          if (v === "p1" || v === "spare") count1++;
          else if (v === "p2" || v === "ban") count2++;
        }
        voteP1Ref.current = count1;
        voteP2Ref.current = count2;
        setVoteCountP1(count1);
        setVoteCountP2(count2);

        let result: VerdictResult;
        if (mode === "solo_trial") {
          if (count1 >= count2) {
            result = "spared";
          } else {
            result = count2 % 2 === 0 ? "banned" : "timedout";
          }
        } else {
          if (count1 > count2) result = "p1_won";
          else if (count2 > count1) result = "p2_won";
          else result = "tie";
        }
        applyVerdict(result);
      }
    }, 40);

    return () => {
      clearInterval(timer);
      unsubMsg();
    };
  }, [isOpen, phase, mode, p1.username, p1.displayName, p2?.username, p2?.displayName]);

  if (!isOpen) return null;

  const totalVotes = voteCountP1 + voteCountP2;
  const p1Percent = totalVotes > 0 ? Math.round((voteCountP1 / totalVotes) * 100) : 50;
  const p2Percent = totalVotes > 0 ? 100 - p1Percent : 50;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200 font-sans">
      {/* Modal Container: Matching Site Palette & Styling */}
      <div
        className={cn(
          "relative flex flex-col w-full max-w-xl bg-[#0c0c12] border border-white/15 shadow-2xl overflow-hidden text-zinc-100 transition-all",
          screenShake && "animate-qte-shake",
          phase === "siren" ? "animate-qte-siren border-rose-500/80" : "border-rose-500/40"
        )}
      >
        {/* Top Header Ribbon with Audio & Close Controls */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 border-b border-white/10 text-xs font-mono select-none">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span className="font-bold tracking-wider text-rose-400 uppercase flex items-center gap-1">
              {mode === "solo_trial" ? (
                <>
                  <Gavel className="h-3.5 w-3.5 text-rose-400" /> Ban Appeal Trial
                </>
              ) : (
                <>
                  <Swords className="h-3.5 w-3.5 text-cyan-400" /> Chatter Duel
                </>
              )}
            </span>
            <span className="text-zinc-500">· #{channel}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Sound FX Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                qteAudio.enabled = next;
              }}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
              title={soundEnabled ? "Mute audio" : "Enable audio"}
            >
              {soundEnabled ? (
                <Volume2 className="h-3.5 w-3.5 text-primary" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-zinc-600" />
              )}
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
              title="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Modal Content (Inter + Iosevka Monospace, Matching Site Standard) */}
        <div className="p-6 flex flex-col items-center min-h-[350px] justify-between relative bg-gradient-to-b from-transparent via-black/30 to-black/70">
          {/* ───────────────────────────────────────────────────────────── */}
          {/* PHASE 1: SIREN ALERT */}
          {/* ───────────────────────────────────────────────────────────── */}
          {phase === "siren" && (
            <div className="my-auto flex flex-col items-center text-center gap-3 py-6 animate-qte-slide-up">
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-full animate-qte-glow">
                <AlertTriangle className="h-10 w-10 text-rose-500 animate-bounce" />
              </div>
              <div className="space-y-1">
                <span className="font-mono text-xs text-rose-400 tracking-widest uppercase font-bold flex items-center justify-center gap-1">
                  <Flame className="h-3.5 w-3.5" /> QUICK TIME EVENT
                </span>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase font-sans">
                  {mode === "solo_trial" ? "Trial by Streamer" : "Chatter Face-Off"}
                </h2>
                <p className="text-xs text-zinc-400 font-mono">Drafting active candidate from live chat…</p>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* PHASE 2: ROULETTE CHATTER DRAFT */}
          {/* ───────────────────────────────────────────────────────────── */}
          {phase === "roulette" && (
            <div className="my-auto flex flex-col items-center text-center gap-4 py-4 animate-qte-slide-up w-full max-w-sm">
              <div className="font-mono text-xs text-amber-400 uppercase tracking-widest flex items-center gap-1.5 font-bold">
                <Flame className="h-3.5 w-3.5 text-amber-400 animate-pulse" /> Drafting Active Chatter…
              </div>

              <div className="w-full border border-amber-500/40 bg-amber-500/5 p-4 flex flex-col items-center gap-2">
                <div className="h-10 flex items-center justify-center font-mono text-xl font-black text-amber-300">
                  {rouletteNames[0] || `@${p1.username}`}
                </div>
                {mode === "duo_duel" && (
                  <>
                    <div className="text-[10px] font-mono text-zinc-500 font-bold">VS</div>
                    <div className="h-10 flex items-center justify-center font-mono text-xl font-black text-cyan-300">
                      {rouletteNames[1] || `@${p2?.username || "opponent"}`}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* PHASE 3: 1-SECOND READY */}
          {/* ───────────────────────────────────────────────────────────── */}
          {phase === "ready" && (
            <div className="my-auto flex flex-col items-center text-center gap-3 py-6 animate-qte-slide-up">
              <div className="text-5xl sm:text-6xl font-black tracking-widest text-primary animate-pulse font-mono">
                {mode === "solo_trial" ? "STAND TRIAL!" : "FIGHT!"}
              </div>
              <p className="text-xs font-mono text-zinc-300">
                You have <strong className="text-primary font-bold">60 SECONDS</strong> to defend in live chat!
              </p>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* PHASE 4: 60-SECOND DEFENSE WINDOW (REAL CHAT INPUT) */}
          {/* ───────────────────────────────────────────────────────────── */}
          {phase === "input" && (
            <div className="w-full flex flex-col items-center gap-3.5 animate-qte-slide-up">
              {/* Header: Title & 15.00s Timer */}
              <div className="w-full flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono text-rose-400 uppercase tracking-widest font-bold flex items-center gap-1">
                    <Flame className="h-3 w-3" /> {mode === "solo_trial" ? "The Accusation" : "Duel Prompt"}
                  </span>
                  <span className="text-sm font-bold text-white mt-0.5">{prompt.title}</span>
                </div>
                {/* 60.00s Countdown Display + Skip */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      skipInputRef.current = true;
                      setInputTimeLeft(0);
                    }}
                    className="flex items-center gap-1 px-2 py-1 border border-white/15 bg-white/5 text-[9px] font-mono font-bold text-zinc-300 hover:bg-white/10 hover:text-white transition-colors uppercase tracking-wider"
                    title="Skip the 60s defense window and move straight to voting"
                  >
                    Skip »
                  </button>
                  <Clock
                    className={cn(
                      "h-4 w-4",
                      inputTimeLeft < 5 ? "text-rose-500 animate-spin" : "text-amber-400"
                    )}
                  />
                  <span
                    className={cn(
                      "font-mono text-2xl font-black tracking-tight tabular-nums",
                      inputTimeLeft < 5 ? "text-rose-500 animate-pulse" : "text-primary"
                    )}
                  >
                    {inputTimeLeft.toFixed(2)}s
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-zinc-800 overflow-hidden -mt-1.5">
                <div
                  className={cn(
                    "h-full transition-all duration-75",
                    inputTimeLeft < 5
                      ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,1)]"
                      : "bg-primary"
                  )}
                  style={{ width: `${(inputTimeLeft / TOTAL_DEFENSE_SECONDS) * 100}%` }}
                />
              </div>

              {/* Prompt Box */}
              <div className="w-full p-3 bg-white/[0.04] border border-white/10 text-left">
                <div className="text-xs font-semibold text-zinc-100 leading-snug">
                  {prompt.crimeOrTopic}
                </div>
              </div>

              {/* Contestant Cards — Listening for REAL chat messages */}
              <div
                className={cn(
                  "w-full grid gap-2.5",
                  mode === "duo_duel" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
                )}
              >
                {/* Contestant 1 */}
                <div className="p-3 bg-zinc-900/90 border border-white/10 flex flex-col justify-between min-h-[90px]">
                  <div className="flex items-center justify-between border-b border-white/5 pb-1">
                    <strong className="font-bold text-xs font-mono" style={{ color: p1.color }}>
                      @{p1.displayName || p1.username}
                    </strong>
                    {p1.badge && (
                      <span className="text-[9px] font-mono bg-white/10 px-1.5 py-0.2 text-zinc-300 font-semibold">
                        {p1.badge}
                      </span>
                    )}
                  </div>
                  <div className="my-1.5 min-h-[30px] flex items-center">
                    {p1.defenseText ? (
                      <span className="text-xs text-emerald-300 italic bg-emerald-950/30 p-2 border border-emerald-500/20 w-full animate-qte-pop">
                        "{renderChatEmotes(p1.defenseText, emoteMap)}"
                      </span>
                    ) : (
                      <span className="text-xs font-mono text-zinc-500 animate-pulse">
                        ⏳ Listening for @{p1.username} in live chat…
                      </span>
                    )}
                  </div>
                </div>

                {/* Contestant 2 */}
                {mode === "duo_duel" && p2 && (
                  <div className="p-3 bg-zinc-900/90 border border-white/10 flex flex-col justify-between min-h-[90px]">
                    <div className="flex items-center justify-between border-b border-white/5 pb-1">
                      <strong className="font-bold text-xs font-mono" style={{ color: p2.color }}>
                        @{p2.displayName || p2.username}
                      </strong>
                      {p2.badge && (
                        <span className="text-[9px] font-mono bg-white/10 px-1.5 py-0.2 text-zinc-300 font-semibold">
                          {p2.badge}
                        </span>
                      )}
                    </div>
                    <div className="my-1.5 min-h-[30px] flex items-center">
                      {p2.defenseText ? (
                        <span className="text-xs text-emerald-300 italic bg-emerald-950/30 p-2 border border-emerald-500/20 w-full animate-qte-pop">
                          "{renderChatEmotes(p2.defenseText, emoteMap)}"
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-zinc-500 animate-pulse">
                          ⏳ Listening for @{p2.username} in live chat…
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* PHASE 5: VOTING & REAL LIVE CHAT STREAM */}
          {/* ───────────────────────────────────────────────────────────── */}
          {phase === "voting" && (
            <div className="w-full flex flex-col items-center gap-3.5 animate-qte-slide-up">
              <div className="w-full flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1 text-amber-400">
                  <Flame className="h-3.5 w-3.5 text-amber-400" />{" "}
                  {mode === "solo_trial"
                    ? "Type '1' (Spare) or '2' (Ban) in chat!"
                    : `Vote: '1' (@${p1.username}) or '2' (@${p2?.username})`}
                </span>
                <div className="flex items-center gap-1 font-mono text-xs text-amber-400 font-bold">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{votingTimeLeft.toFixed(1)}s</span>
                </div>
              </div>

              {/* Contestant Defenses */}
              <div className={cn("w-full grid gap-2", mode === "duo_duel" ? "grid-cols-2" : "grid-cols-1")}>
                <div className="p-2.5 bg-zinc-900/90 border border-white/10">
                  <div className="text-[11px] font-bold font-mono" style={{ color: p1.color }}>
                    @{p1.displayName || p1.username}
                  </div>
                  <div className="text-xs text-zinc-200 mt-0.5 italic line-clamp-2">
                    "{renderChatEmotes(p1.defenseText || "", emoteMap)}"
                  </div>
                </div>
                {mode === "duo_duel" && p2 && (
                  <div className="p-2.5 bg-zinc-900/90 border border-white/10">
                    <div className="text-[11px] font-bold font-mono" style={{ color: p2.color }}>
                      @{p2.displayName || p2.username}
                    </div>
                    <div className="text-xs text-zinc-200 mt-0.5 italic line-clamp-2">
                      "{renderChatEmotes(p2.defenseText || "", emoteMap)}"
                    </div>
                  </div>
                )}
              </div>

              {/* Tug-of-war Vote Bar */}
              <div className="w-full space-y-1">
                <div className="flex justify-between font-mono text-xs text-zinc-300">
                  <span className="text-emerald-400 font-bold">
                    {mode === "solo_trial" ? "✨ SPARE (Type '1')" : `@${p1.username} ('1')`}: <strong>{voteCountP1}</strong> ({p1Percent}%)
                  </span>
                  <span className="text-rose-400 font-bold">
                    {mode === "solo_trial" ? "🔨 BAN (Type '2')" : `@${p2?.username} ('2')`}: <strong>{voteCountP2}</strong> ({p2Percent}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-zinc-800 flex overflow-hidden border border-white/10">
                  <div
                    className={cn(
                      "h-full transition-all duration-150",
                      mode === "solo_trial" ? "bg-emerald-500" : "bg-primary"
                    )}
                    style={{ width: `${p1Percent}%` }}
                  />
                  <div
                    className={cn(
                      "h-full transition-all duration-150",
                      mode === "solo_trial" ? "bg-rose-500" : "bg-cyan-500"
                    )}
                    style={{ width: `${p2Percent}%` }}
                  />
                </div>
              </div>

              {/* REAL LIVE AUDIENCE VOTING STREAM */}
              <div className="w-full border border-white/10 bg-black/60 p-2.5 flex flex-col shadow-inner">
                <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1 flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <Radio className="h-3 w-3 text-emerald-400 animate-pulse" /> Live Twitch Chat Feed ({liveVoteFeed.length}):
                  </span>
                  <span className="text-emerald-400 font-bold">● Live Chat</span>
                </div>
                <div
                  ref={voteScrollRef}
                  className="h-24 overflow-y-auto flex flex-col gap-1 text-xs font-sans scroll-smooth"
                  style={{ scrollbarWidth: "none" }}
                >
                  {liveVoteFeed.length === 0 ? (
                    <span className="text-zinc-500 font-mono text-xs text-center my-auto">
                      Listening for incoming chat votes in #{channel}…
                    </span>
                  ) : (
                    liveVoteFeed.map((vote) => (
                      <div key={vote.id} className="flex items-baseline gap-1.5 leading-snug animate-qte-pop">
                        <span className="font-mono text-[9px] text-zinc-600 tabular-nums">
                          {new Date(vote.timestamp).toTimeString().slice(0, 5)}
                        </span>
                        <strong style={{ color: vote.color }} className="text-[10px] font-mono shrink-0">
                          {vote.displayName || vote.username}:
                        </strong>
                        <span className="text-zinc-200 text-xs truncate">{renderChatEmotes(vote.text, emoteMap)}</span>
                        {vote.choice && (
                          <span
                            className={cn(
                              "text-[8px] font-mono px-1.5 py-0.2 ml-auto font-bold shrink-0",
                              vote.choice === "spare" || vote.choice === "p1"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            )}
                          >
                            {vote.choice.toUpperCase()}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Streamer Instant Verdict Actions */}
              <div className="w-full border-t border-white/10 pt-2.5 flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Streamer Verdict:</span>
                {mode === "solo_trial" ? (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyVerdict("spared")}
                      className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 flex items-center gap-1 transition-colors"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" /> Spare
                    </button>
                    <button
                      type="button"
                      onClick={() => applyVerdict("timedout")}
                      className="px-3 py-1 bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-bold hover:bg-amber-500/30 flex items-center gap-1 transition-colors"
                    >
                      <Clock className="h-3.5 w-3.5" /> Timeout 60s
                    </button>
                    <button
                      type="button"
                      onClick={() => applyVerdict("banned")}
                      className="px-3 py-1 bg-rose-500/20 border border-rose-500/50 text-rose-300 text-xs font-bold hover:bg-rose-500/30 flex items-center gap-1 transition-colors"
                    >
                      <Ban className="h-3.5 w-3.5" /> Ban
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyVerdict("p1_won")}
                      className="px-3 py-1 bg-primary/20 border border-primary/50 text-primary text-xs font-bold hover:bg-primary/30 flex items-center gap-1 transition-colors"
                    >
                      <Trophy className="h-3.5 w-3.5" /> @{p1.username} Won
                    </button>
                    <button
                      type="button"
                      onClick={() => applyVerdict("p2_won")}
                      className="px-3 py-1 bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 text-xs font-bold hover:bg-cyan-500/30 flex items-center gap-1 transition-colors"
                    >
                      <Trophy className="h-3.5 w-3.5" /> @{p2?.username} Won
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* PHASE 6: VERDICT CONCLUSION */}
          {/* ───────────────────────────────────────────────────────────── */}
          {phase === "verdict" && verdict && (
            <div className="my-auto flex flex-col items-center text-center gap-4 py-4 animate-qte-slide-up w-full">
              {verdict === "banned" && (
                <div className="border-4 border-rose-600 px-8 py-3 bg-rose-950/90 text-rose-500 font-black text-3xl sm:text-4xl tracking-widest uppercase animate-qte-stamp shadow-2xl font-mono">
                  ⛔ BANNED ⛔
                </div>
              )}

              {verdict === "timedout" && (
                <div className="border-4 border-amber-500 px-8 py-3 bg-amber-950/90 text-amber-400 font-black text-2xl sm:text-3xl tracking-widest uppercase animate-qte-stamp shadow-2xl font-mono">
                  ⏱️ TIMED OUT (60s)
                </div>
              )}

              {verdict === "spared" && (
                <div className="border-4 border-emerald-500 px-8 py-3 bg-emerald-950/90 text-emerald-400 font-black text-2xl sm:text-3xl tracking-widest uppercase animate-qte-stamp shadow-2xl font-mono">
                  ✨ SPARED & PARDONED ✨
                </div>
              )}

              {verdict === "p1_won" && (
                <div className="border-4 border-primary px-8 py-3 bg-primary/20 text-primary font-black text-2xl sm:text-3xl tracking-widest uppercase animate-qte-stamp shadow-2xl font-mono">
                  👑 @{p1.username} VICTORIOUS!
                </div>
              )}

              {verdict === "p2_won" && p2 && (
                <div className="border-4 border-cyan-400 px-8 py-3 bg-cyan-950/90 text-cyan-300 font-black text-2xl sm:text-3xl tracking-widest uppercase animate-qte-stamp shadow-2xl font-mono">
                  👑 @{p2.username} VICTORIOUS!
                </div>
              )}

              {verdict === "tie" && (
                <div className="border-4 border-zinc-500 px-8 py-3 bg-zinc-900 text-zinc-300 font-black text-2xl tracking-widest uppercase animate-qte-stamp font-mono">
                  🤝 MUTUAL DRAW
                </div>
              )}

              <p className="text-xs font-mono text-zinc-300 mt-1">
                Final Votes: <strong>{voteCountP1}</strong> to <strong>{voteCountP2}</strong>
              </p>

              <button
                type="button"
                onClick={handleClose}
                className="mt-2 px-6 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs tracking-wider uppercase border border-white/20 transition-all font-mono"
              >
                Return to Stream
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
