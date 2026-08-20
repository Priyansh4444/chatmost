import { useState, useEffect, useRef, useCallback } from "react";
import {
  type QTEMode,
  type QTEParticipant,
  type QTEPrompt,
} from "@/lib/qteTypes";
import { getRandomPrompt } from "@/lib/qtePrompts";
import { buildQteChatterPool } from "@/lib/qteChatters";
import { QTEModal } from "@/components/qte/QTEModal";
import { useTwitchChat } from "@/hooks/useTwitchChat";
import { useEmoteMap } from "@/lib/renderChatEmotes";
import {
  Zap,
  Settings2,
  X,
  Clock,
  Volume2,
  VolumeX,
  Users,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** How many seconds of silence before we consider chat "dead" */
const ACTIVITY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
/** Minimum unique chatters needed to fire a QTE */
const MIN_CHATTERS_SOLO = 1;
const MIN_CHATTERS_DUO = 2;
/** Stable empty array for useTwitchChat — avoids re-renders from a new [] each render */
const EMPTY_CHOICES: [] = [];

interface QTEFloatingWidgetProps {
  channel: string;
}

/**
 * Production-ready floating QTE widget.
 *
 * Connects to live Twitch IRC via the existing `useTwitchChat` hook.
 * Auto-timer is OFF by default as requested. Streamer can enable it or
 * trigger events on-demand with the lightning button.
 *
 * Two icons:
 *   ⚡ Trigger button — fires a random solo or duo QTE from real chatters
 *   ⚙  Settings toggle — slim panel with timer/sound controls
 */
export function QTEFloatingWidget({ channel }: QTEFloatingWidgetProps) {
  const [panelOpen, setPanelOpen] = useState(false);

  // Timer state — DEFAULT OFF as requested
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(1800);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Sound FX & Custom Accusations
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [flavorCrimes, setFlavorCrimes] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [activeMode, setActiveMode] = useState<QTEMode>("solo_trial");
  const [currentPrompt, setCurrentPrompt] = useState<QTEPrompt>(() => getRandomPrompt("solo_trial", false));
  const [selectedP1, setSelectedP1] = useState<QTEParticipant | null>(null);
  const [selectedP2, setSelectedP2] = useState<QTEParticipant | undefined>(undefined);

  // Error toast
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Emote URL mapping for 7TV, Twitch, BTTV, and FFZ inline hotswapping
  const emoteMap = useEmoteMap();

  // Connect to real live Twitch chat
  const { messages, status } = useTwitchChat(EMPTY_CHOICES, true, channel);

  /**
   * Extract unique recent chatters from the live message buffer.
   * Stored in refs and state to avoid impure Date.now() calls during render.
   */
  const recentChattersRef = useRef<QTEParticipant[]>([]);
  const msgsPerMinuteRef = useRef(0);
  const [activeChatterPool, setActiveChatterPool] = useState<QTEParticipant[]>([]);
  const [chatterCount, setChatterCount] = useState(0);
  const [chatVelocity, setChatVelocity] = useState(0);

  // Recompute chatter pool from live messages (bots excluded — StreamElements,
  // Nightbot, etc. can never be drafted into a QTE)
  const recomputeChatters = useCallback(() => {
    const now = Date.now();
    recentChattersRef.current = buildQteChatterPool(messages, now, ACTIVITY_WINDOW_MS);
    setActiveChatterPool(recentChattersRef.current);

    const velCutoff = now - 60_000;
    msgsPerMinuteRef.current = messages.filter((m) => m.timestamp >= velCutoff).length;

    setChatterCount(recentChattersRef.current.length);
    setChatVelocity(msgsPerMinuteRef.current);
  }, [messages]);

  // Refresh chatter pool periodically
  useEffect(() => {
    const timer = setTimeout(recomputeChatters, 0);
    const interval = setInterval(recomputeChatters, 2000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [recomputeChatters]);

  const showError = useCallback((msg: string) => {
    setErrorToast(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorToast(null), 3000);
  }, []);

  const triggerQTE = useCallback(
    (forceMode?: QTEMode) => {
      const mode = forceMode || (Math.random() > 0.5 ? "solo_trial" : "duo_duel");
      const minNeeded = mode === "duo_duel" ? MIN_CHATTERS_DUO : MIN_CHATTERS_SOLO;
      const activePool = recentChattersRef.current;

      if (activePool.length < minNeeded) {
        showError(
          activePool.length === 0
            ? `No active chatters in #${channel} — QTE cancelled`
            : `Need ${minNeeded}+ chatters for ${mode === "duo_duel" ? "duo" : "solo"} — only ${activePool.length} active`
        );
        return;
      }

      setActiveMode(mode);
      const p = getRandomPrompt(mode, flavorCrimes);
      setCurrentPrompt(p);

      // Pick random chatters from REAL live chat
      const pool = [...activePool].sort(() => 0.5 - Math.random());
      const c1 = pool[0];
      const c2 = pool[1];

      setSelectedP1({ ...c1, defenseText: undefined, submittedAt: undefined, votes: 0 });
      setSelectedP2(
        mode === "duo_duel" && c2
          ? { ...c2, defenseText: undefined, submittedAt: undefined, votes: 0 }
          : undefined
      );
      setModalKey((k) => k + 1);
      setIsModalOpen(true);
      setPanelOpen(false);
    },
    [channel, flavorCrimes, showError]
  );

  // 30-Minute Auto-Trigger Engine (only runs when enabled by streamer)
  useEffect(() => {
    if (!isTimerRunning || isModalOpen) return;

    const interval = setInterval(() => {
      setTimerSecondsLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          // Only auto-fire if chat is active (>= 3 msgs/min & at least 1 recent chatter)
          if (msgsPerMinuteRef.current >= 3 && recentChattersRef.current.length >= MIN_CHATTERS_SOLO) {
            triggerQTE();
          }
          return 1800;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning, isModalOpen, triggerQTE]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Status dot color based on IRC connection
  const statusColor =
    status === "connected"
      ? "bg-emerald-400"
      : status === "connecting"
      ? "bg-amber-400 animate-pulse"
      : "bg-zinc-600";

  return (
    <>
      {/* ──────────────────────────────────────────────────────── */}
      {/* Fixed bottom-right floating widget                       */}
      {/* ──────────────────────────────────────────────────────── */}
      <div className="fixed bottom-5 right-5 z-40 flex items-end gap-2">
        {/* Settings Panel (slides up next to buttons) */}
        {panelOpen && (
          <div className="animate-qte-slide-up mb-1 w-56 border border-white/10 bg-[#0c0c12]/95 backdrop-blur-xl shadow-2xl flex flex-col text-xs font-mono">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider">QTE Controls</span>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div className="p-3 flex flex-col gap-3">
              {/* Live IRC status */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-[10px]">IRC:</span>
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full", statusColor)} />
                  <span className="text-zinc-200 text-[10px]">{status}</span>
                </div>
              </div>

              {/* Active chatters count */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-[10px]">Active:</span>
                <div className="flex items-center gap-1">
                  <Users className="h-2.5 w-2.5 text-zinc-400" />
                  <span
                    className={cn(
                      "text-[10px] font-bold",
                      chatterCount >= MIN_CHATTERS_DUO
                        ? "text-emerald-400"
                        : chatterCount >= MIN_CHATTERS_SOLO
                        ? "text-amber-400"
                        : "text-red-400"
                    )}
                  >
                    {chatterCount}
                  </span>
                  <span className="text-zinc-500 text-[9px]">({chatVelocity}/min)</span>
                </div>
              </div>

              {/* Auto Timer Toggle (Default: OFF) */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-[10px]">Auto (30m):</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-100 font-bold tabular-nums">{formatTime(timerSecondsLeft)}</span>
                  <button
                    type="button"
                    onClick={() => setIsTimerRunning((r) => !r)}
                    className={cn(
                      "text-[9px] px-1.5 py-0.5 border transition-colors",
                      isTimerRunning
                        ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10 font-bold"
                        : "text-zinc-500 border-white/10"
                    )}
                  >
                    {isTimerRunning ? "ON" : "OFF"}
                  </button>
                </div>
              </div>

              {/* Sound FX Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-[10px]">Sound FX:</span>
                <button
                  type="button"
                  onClick={() => setSoundEnabled((s) => !s)}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 border text-[9px] font-bold transition-colors",
                    soundEnabled
                      ? "text-primary border-primary/40 bg-primary/10"
                      : "text-zinc-500 border-white/10"
                  )}
                >
                  {soundEnabled ? <Volume2 className="h-2.5 w-2.5" /> : <VolumeX className="h-2.5 w-2.5" />}
                  {soundEnabled ? "ON" : "OFF"}
                </button>
              </div>

              {/* Custom Flavor Accusations Toggle (Default: OFF) */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-[10px]" title="Accused of: funny chat crimes vs pure timeout defense">
                  Scenario Crimes:
                </span>
                <button
                  type="button"
                  onClick={() => setFlavorCrimes((f) => !f)}
                  className={cn(
                    "text-[9px] px-1.5 py-0.5 border font-bold transition-colors",
                    flavorCrimes
                      ? "text-primary border-primary/40 bg-primary/10"
                      : "text-zinc-500 border-white/10"
                  )}
                >
                  {flavorCrimes ? "ON" : "OFF"}
                </button>
              </div>

              {/* Channel indicator */}
              <div className="flex items-center justify-between border-t border-white/5 pt-2">
                <span className="text-zinc-500 text-[10px]">Channel:</span>
                <span className="text-zinc-200 font-semibold text-[10px]">#{channel || "—"}</span>
              </div>
            </div>
          </div>
        )}

        {/* Vertical button stack with timer badge cleanly at the top */}
        <div className="flex flex-col items-center gap-2">
          {/* Auto-timer badge — only shown when timer is running and panel is closed */}
          {isTimerRunning && !panelOpen && !isModalOpen && (
            <div className="flex items-center gap-1 bg-[#0c0c12]/90 border border-white/10 px-2 py-0.5 backdrop-blur-md font-mono text-[9px] text-zinc-400 select-none shadow-lg">
              <Clock className="h-2.5 w-2.5 text-zinc-400" />
              <span className="tabular-nums font-semibold text-zinc-200">{formatTime(timerSecondsLeft)}</span>
            </div>
          )}

          {/* Settings toggle button */}
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            className={cn(
              "group relative h-9 w-9 flex items-center justify-center border shadow-lg transition-all",
              panelOpen
                ? "bg-white/15 border-white/20 text-white"
                : "bg-[#0c0c12]/90 border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20 backdrop-blur-md"
            )}
            title="QTE Settings"
          >
            <Settings2 className="h-4 w-4" />
            {/* Live dot */}
            <span className={cn("absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full", statusColor)} />
          </button>

          {/* Trigger button — fires random solo or duo from real chatters */}
          <button
            type="button"
            onClick={() => triggerQTE()}
            disabled={isModalOpen}
            className={cn(
              "group h-10 w-10 flex items-center justify-center border shadow-lg transition-all",
              isModalOpen
                ? "bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed"
                : "bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 hover:shadow-[0_0_15px_rgba(232,100,122,0.4)] backdrop-blur-md"
            )}
            title="Trigger Random QTE"
          >
            <Zap className={cn("h-5 w-5", !isModalOpen && "group-hover:scale-110 transition-transform")} />
          </button>
        </div>
      </div>

      {/* Error toast */}
      {errorToast && (
        <div className="fixed bottom-20 right-5 z-50 animate-qte-slide-up flex items-center gap-2 bg-red-950/90 border border-red-500/40 px-3 py-2 text-xs text-red-200 font-mono backdrop-blur-md shadow-xl">
          <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
          {errorToast}
        </div>
      )}

      {/* The actual QTE Modal */}
      {selectedP1 && (
        <QTEModal
          key={modalKey}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          mode={activeMode}
          prompt={currentPrompt}
          p1={selectedP1}
          p2={selectedP2}
          channel={channel || ""}
          liveChatters={activeChatterPool}
          emoteMap={emoteMap}
        />
      )}
    </>
  );
}
