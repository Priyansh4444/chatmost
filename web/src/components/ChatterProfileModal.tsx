import { useState, useEffect } from "react";
import { api, type ChatterProfile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmoteDisplay, KindBadge } from "@/components/emote";
import { ChatterLineChart, ChatterPieChart } from "@/components/dashboard/ChatterCharts";
import { formatNumber } from "@/lib/utils";
import { Copy, Check, MessageSquareText, X } from "lucide-react";

interface ChatterProfileModalProps {
  profile: (ChatterProfile & {
    timeline?: { period: string; messages: number }[];
    breakdown?: {
      emotesCount: number;
      wordsCount: number;
      emoteShare: number;
      wordShare: number;
      emotesPerMsg?: number;
      wordsPerMsg?: number;
      emotesPer100Words?: number;
      uniqueEmotes?: number;
      uniqueWords?: number;
    };
    longestMessages?: {
      id?: string;
      text: string;
      length: number;
      words: number;
      createdAt?: string;
      vodId?: string;
    }[];
  }) | null;
  totalChannelMsgs?: number;
  onClose: () => void;
}

export function ChatterProfileModal({ profile, totalChannelMsgs: propTotalMsgs, onClose }: ChatterProfileModalProps) {
  const [queriedTotal, setQueriedTotal] = useState<number>(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    if (!propTotalMsgs) {
      void api.stats().then((s) => {
        if (active) setQueriedTotal(s.messages);
      });
    }
    return () => {
      active = false;
    };
  }, [propTotalMsgs]);

  // Timeline normalized to monthly buckets (older cached archives may contain
  // daily buckets — group them by YYYY-MM so the chart always shows months).
  const timelineData = (() => {
    if (!profile?.timeline || profile.timeline.length === 0) return [];
    const byMonth = new Map<string, number>();
    for (const t of profile.timeline) {
      const key = t.period.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + t.messages);
    }
    return [...byMonth.entries()]
      .map(([period, messages]) => ({ period, messages }))
      .sort((a, b) => a.period.localeCompare(b.period));
  })();

  if (!profile) return null;

  const resolvedTotal = propTotalMsgs || queriedTotal || profile.messages || 1;
  const channelPct = ((profile.messages / resolvedTotal) * 100).toFixed(2);

  const tier =
    profile.rank === 1
      ? { label: "👑 Channel Apex (#1 Legend)", variant: "default" as const }
      : profile.rank <= 3
      ? { label: `🔱 Top 3 Legend (#${profile.rank})`, variant: "default" as const }
      : profile.rank <= 10
      ? { label: `⚡ Top 10 Warlord (#${profile.rank})`, variant: "secondary" as const }
      : profile.messages >= 10000
      ? { label: "🐋 Chat Whale (10k+ msgs)", variant: "secondary" as const }
      : profile.messages >= 2500
      ? { label: "🔥 Core Regular (2.5k-10k)", variant: "secondary" as const }
      : profile.messages >= 500
      ? { label: "💬 Daily Chatter (500-2.5k)", variant: "gold" as const }
      : { label: "🌱 Casual Chatter (<500 msgs)", variant: "outline" as const };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const distinctEmotes =
    profile.breakdown?.uniqueEmotes ||
    (profile.topTargets ? profile.topTargets.length : 0);

  const distinctWords = profile.breakdown?.uniqueWords || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm font-mono text-xs">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border-2 border-primary bg-card p-0 shadow-none">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-muted/90 p-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="border border-primary bg-primary text-black px-1.5 py-0.5 text-[10px] font-bold">
              #{profile.rank}
            </span>
            <span className="text-sm font-black text-foreground">{profile.displayName}</span>
            <span className="text-[10px] text-muted-foreground font-mono">({profile.login})</span>
          </div>
          <button
            type="button"
            aria-label="Close chatter profile"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center border border-border bg-card text-muted-foreground hover:border-primary hover:bg-primary hover:text-black transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          {/* Top KPI Cards Grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="border border-border/80 bg-background/50 p-2.5 flex flex-col justify-between">
              <span className="text-[10px] text-muted-foreground">Total Messages</span>
              <p className="text-base font-black text-primary">{formatNumber(profile.messages)}</p>
              <span className="text-[9px] text-muted-foreground">{channelPct}% of chat volume</span>
            </div>

            <div className="border border-border/80 bg-background/50 p-2.5 flex flex-col justify-between">
              <span className="text-[10px] text-muted-foreground">Distinct Emotes</span>
              <p className="text-sm font-bold text-foreground">{formatNumber(distinctEmotes)}</p>
              <span className="text-[9px] text-zinc-500">{distinctWords > 0 ? `${formatNumber(distinctWords)} unique words` : "Across streams"}</span>
            </div>

            <div className="border border-border/80 bg-background/50 p-2.5 flex flex-col justify-between">
              <span className="text-[10px] text-muted-foreground">Total Word Volume</span>
              <p className="text-sm font-bold text-foreground">{formatNumber(profile.breakdown?.wordsCount || 0)}</p>
              <span className="text-[9px] text-zinc-500">{profile.breakdown?.wordShare ?? 0}% word ratio</span>
            </div>

            <div className="border border-border/80 bg-background/50 p-2.5 flex flex-col justify-between">
              <span className="text-[10px] text-muted-foreground">Chatter Tier</span>
              <div className="mt-1">
                <Badge variant={tier.variant} className="text-[10px]">
                  {tier.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Activity Timeline from recorded data */}
          {timelineData.length > 0 ? (
            <ChatterLineChart data={timelineData} />
          ) : (
            <div className="border border-border/80 bg-background/50 p-3 text-center text-[10px] text-muted-foreground">
              No monthly timeline data available for this chatter.
            </div>
          )}

          {/* Dual Emote vs Word Distribution Donut Charts */}
          {profile.breakdown && (
            <ChatterPieChart breakdown={profile.breakdown} />
          )}

          {/* Top Emotes / Targets Used */}
          <div className="flex flex-col border border-border/80 bg-background/50 p-3">
            <span className="text-[10px] text-muted-foreground font-medium mb-2">
              Signature Emotes & Top Target Words
            </span>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              {profile.topTargets && profile.topTargets.length > 0 ? (
                profile.topTargets.map((t, idx) => {
                  const maxTarget = profile.topTargets[0].count || 1;
                  const barWidth = Math.min(100, Math.round((t.count / maxTarget) * 100));

                  return (
                    <div
                      key={t.name}
                      className="flex items-center justify-between border border-border/40 bg-card/40 p-1.5 text-[11px]"
                    >
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <span className="w-5 text-muted-foreground text-[10px] font-mono">
                          #{idx + 1}
                        </span>
                        {t.url ? (
                          <EmoteDisplay name={t.name} url={t.url} size="sm" />
                        ) : null}
                        <span className="font-bold text-foreground truncate max-w-[100px]">
                          {t.name}
                        </span>
                        <KindBadge kind={t.kind} />
                      </div>

                      <div className="flex items-center gap-2 flex-1 justify-end max-w-[200px]">
                        <div className="h-1.5 w-24 bg-muted/40 overflow-hidden">
                          <div
                            className="h-full bg-primary transition-[width] duration-500 ease-out"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="font-bold text-primary font-mono w-16 text-right">
                          {formatNumber(t.count)} uses
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-muted-foreground">
                  No specific emote breakdown indexed for this chatter.
                </div>
              )}
            </div>
          </div>

          {/* Personal Longest Messages / Top Yaps (No Emote Spam) */}
          {profile.longestMessages && profile.longestMessages.length > 0 && (
            <div className="flex flex-col border border-border/80 bg-background/50 p-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground border-b border-border/60 pb-2 mb-2">
                <span className="flex items-center gap-1.5 text-foreground">
                  <MessageSquareText className="h-3.5 w-3.5 text-primary" />
                  Personal Longest Messages (Top Yaps)
                </span>
                <span className="text-[9px] font-mono text-primary bg-primary/10 border border-primary/30 px-1.5 py-0.5">
                  {profile.longestMessages.length} Genuine Logged Essays
                </span>
              </div>

              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {profile.longestMessages.map((m, idx) => (
                  <div
                    key={m.id ?? `${m.vodId ?? "no-vod"}:${m.createdAt ?? "no-date"}:${m.text}`}
                    className="border border-border/60 bg-card/60 p-2.5 flex flex-col gap-1.5 relative group hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-primary bg-primary/10 border border-primary/30 px-1.5 py-0.2">
                          {idx === 0 ? "👑 Top Yap" : `#${idx + 1}`}
                        </span>
                        <span className="text-zinc-300 font-bold">
                          {m.length} chars · {m.words} words
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.createdAt && <span>{m.createdAt.slice(0, 10)}</span>}
                        <button
                          type="button"
                          onClick={() => handleCopy(m.text, idx)}
                          title="Copy message"
                          className="border border-border/60 bg-muted/40 hover:bg-primary hover:text-black p-1 transition-colors"
                        >
                          {copiedIdx === idx ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-100 font-sans leading-relaxed break-words selection:bg-primary selection:text-black pr-6">
                      "{m.text}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={onClose}
            className="w-full border-primary bg-primary text-black font-bold hover:bg-primary/90"
          >
            Close Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
