import { type Choice } from "@/lib/api";
import { type TwitchChatMessage, type ConnectionStatus } from "@/lib/twitchChat";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

interface AudiencePollModalProps {
  open: boolean;
  choices: Choice[];
  votes: number[];
  percentages: number[];
  totalVotes: number;
  messages: TwitchChatMessage[];
  status: ConnectionStatus;
  channel: string;
  onClose: () => void;
}

export function AudiencePollModal({
  open,
  choices,
  votes,
  percentages,
  totalVotes,
  messages,
  status,
  channel,
  onClose,
}: AudiencePollModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-none">
      <div className="w-full max-w-xl border-2 border-secondary bg-card p-0 shadow-none font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-secondary/15 p-3">
          <div className="flex items-center gap-2">
            <span className="border border-secondary bg-secondary text-black px-1.5 py-0.5 text-[10px] font-black uppercase">
              LIFELINE
            </span>
            <span className="font-bold uppercase tracking-wider text-foreground">
              ASK TWITCH CHAT // #{channel}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="border border-border bg-muted/40 px-2 py-1 text-muted-foreground hover:bg-foreground hover:text-black"
          >
            [ESC / CLOSE]
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          {/* Live Audience Distribution */}
          <div className="flex flex-col gap-2 border border-border bg-background p-3">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60 pb-1.5">
              <span>AUDIENCE VOTE DISTRIBUTION</span>
              <span className="text-foreground">
                {formatNumber(totalVotes)} {totalVotes === 1 ? "VOTE" : "VOTES"} CAST
              </span>
            </div>

            <div className="grid gap-2 pt-1">
              {choices.map((choice, i) => {
                const label = ["A", "B", "C", "D"][i] || `${i + 1}`;
                const pct = percentages[i] ?? 0;
                const count = votes[i] ?? 0;

                return (
                  <div key={choice.login} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-bold text-foreground">
                        <span className="border border-secondary bg-secondary/20 text-secondary px-1.5 text-[10px]">
                          [{label}]
                        </span>
                        {choice.displayName}
                      </span>
                      <span className="font-bold text-primary">
                        {pct}% ({count})
                      </span>
                    </div>

                    <div className="h-2 w-full border border-border bg-muted/40">
                      <div
                        className="h-full bg-primary transition-none"
                        style={{ width: `${count > 0 ? Math.max(3, pct) : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {totalVotes === 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground border-t border-border/40 pt-2 text-center">
                Chatters in #{channel} can vote by typing the chatter name or 1–4.
              </p>
            )}
          </div>

          {/* Live Twitch Chat Stream Ticker */}
          <div className="flex flex-col border border-border bg-background p-3">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase text-muted-foreground border-b border-border/60 pb-1.5">
              <span>LIVE TWITCH CHAT FEED</span>
              <span className="text-[10px]">
                STATUS:{" "}
                <strong className={status === "connected" ? "text-primary" : "text-destructive"}>
                  {status.toUpperCase()}
                </strong>
              </span>
            </div>

            <div className="flex max-h-32 flex-col gap-1 overflow-y-auto pt-2 divide-y divide-border/30">
              {messages.slice(0, 8).map((m) => (
                <div key={m.id} className="flex items-center gap-2 py-1 text-xs">
                  <span className="font-bold shrink-0 text-primary">
                    [{m.displayName}]:
                  </span>
                  <span className="truncate text-foreground">{m.message}</span>
                </div>
              ))}

              {messages.length === 0 && (
                <div className="py-4 text-center text-muted-foreground text-[11px]">
                  No chat messages received yet. Chat feed is quiet or streamer is offline.
                </div>
              )}
            </div>
          </div>

          <Button
            onClick={onClose}
            className="w-full border-secondary bg-secondary text-black font-black uppercase tracking-wider hover:bg-secondary/90"
          >
            [ RESUME MILLIONAIRE RUN ]
          </Button>
        </div>
      </div>
    </div>
  );
}
