import { useRef, useEffect, useState } from "react";
import { type TwitchChatMessage, type ConnectionStatus } from "@/lib/twitchChat";
import { ArrowRightLeft, Check, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderChatEmotes, useEmoteMap } from "@/lib/renderChatEmotes";

interface TwitchChatFeedProps {
  messages: TwitchChatMessage[];
  status: ConnectionStatus;
  channel: string;
  totalVotes: number;
  onSetChannel?: (ch: string) => void;
  className?: string;
}

const FALLBACK_COLORS = [
  "#f43f5e", "#fb7185", "#38bdf8", "#4ade80", "#fbbf24", "#a78bfa",
  "#f472b6", "#2dd4bf", "#e879f9", "#34d399", "#60a5fa", "#f59e0b",
];

function getChatterColor(username: string, rawColor?: string): string {
  if (rawColor && rawColor !== "#00f0ff" && rawColor !== "#a855f7" && rawColor.startsWith("#")) return rawColor;
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

export function TwitchChatFeed({
  messages,
  status,
  channel,
  totalVotes,
  onSetChannel,
  className,
}: TwitchChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [editingChannel, setEditingChannel] = useState(false);
  const [channelInput, setChannelInput] = useState(channel);
  const emoteMap = useEmoteMap();

  // Auto-scroll newest to bottom unless pinned
  useEffect(() => {
    if (!pinned && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pinned]);

  const submitChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (channelInput.trim() && onSetChannel) {
      onSetChannel(channelInput.trim());
      setEditingChannel(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-0 border-t border-white/[0.05] pt-4", className)}>

      {/* Header row — flat, no box */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <Radio className={cn("h-2.5 w-2.5", status === "connected" ? "text-green-400 animate-pulse" : "text-zinc-700")} />
          <span className="text-zinc-600">
            {status === "connected" ? "live" : status}
            {" · "}
          </span>
          {editingChannel ? (
            <form onSubmit={submitChannel} className="flex items-center gap-1">
              <input
                autoFocus
                type="text"
                aria-label="Twitch channel"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                className="bg-transparent border-b border-zinc-700 text-zinc-200 text-[10px] font-mono w-20 focus:outline-none focus:border-primary"
              />
              <button type="submit" className="text-primary text-[10px]">ok</button>
              <button type="button" aria-label="Cancel channel edit" onClick={() => setEditingChannel(false)} className="text-zinc-600 text-[10px]">✕</button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditingChannel(true)}
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              #{channel}
            </button>
          )}
          {totalVotes > 0 && (
            <span className="text-primary font-semibold">{totalVotes} votes</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setPinned(p => !p)}
          className={cn("text-[10px] font-mono transition-colors", pinned ? "text-primary" : "text-zinc-700 hover:text-zinc-400")}
        >
          {pinned ? "scroll locked" : "scroll live"}
        </button>
      </div>

      {/* Chat feed — fixed height, no outer border */}
      <div
        ref={scrollRef}
        onMouseEnter={() => setPinned(true)}
        onMouseLeave={() => setPinned(false)}
        className="h-52 overflow-y-auto flex flex-col gap-0.5 scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {messages.length === 0 ? (
          <p className="text-[11px] font-mono text-zinc-700 py-4 text-center">
            Waiting for chat in #{channel}…
          </p>
        ) : (
          // Messages are stored newest-first; render reversed so the newest
          // message sits at the bottom and auto-scroll lands on it.
          [...messages].reverse().map((m) => {
            const color = getChatterColor(m.username, m.color);
            const hasVote = m.voteChoiceName !== undefined;
            const isOverride = m.isOverride;
            return (
              <div
                key={m.id}
                className={cn(
                  "flex flex-wrap items-baseline gap-x-1.5 py-0.5 text-xs leading-relaxed font-sans",
                  hasVote && "border-l-2 border-primary/40 pl-2 -ml-2"
                )}
              >
                <span className="font-mono text-[9px] text-zinc-700 shrink-0 tabular-nums">
                  {new Date(m.timestamp).toTimeString().slice(0, 5)}
                </span>
                <strong
                  style={{ color }}
                  className="font-bold text-[11px] shrink-0 cursor-default"
                >
                  {m.displayName || m.username}
                </strong>
                <span className="text-zinc-300 break-words min-w-0">
                  {renderChatEmotes(m.message, emoteMap, m.matchedToken)}
                </span>
                {hasVote && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-primary shrink-0">
                    <Check className="h-2 w-2" />
                    {m.voteChoiceName}
                    {m.matchedToken && <span className="text-zinc-600"> via "{m.matchedToken}"</span>}
                  </span>
                )}
                {isOverride && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-zinc-500 shrink-0">
                    <ArrowRightLeft className="h-2 w-2" />
                    changed
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
