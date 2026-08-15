import { useState, useEffect } from "react";
import { api, type ChatterProfile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmoteDisplay, KindBadge } from "@/components/emote";
import { ChatterLineChart, ChatterPieChart } from "@/components/dashboard/ChatterCharts";
import { formatNumber } from "@/lib/utils";

interface ChatterProfileModalProps {
  profile: (ChatterProfile & {
    timeline?: { period: string; messages: number }[];
    breakdown?: {
      emotesCount: number;
      wordsCount: number;
      emoteShare: number;
      wordShare: number;
    };
  }) | null;
  totalChannelMsgs?: number;
  onClose: () => void;
}

export function ChatterProfileModal({ profile, totalChannelMsgs: propTotalMsgs, onClose }: ChatterProfileModalProps) {
  const [queriedTotal, setQueriedTotal] = useState<number>(0);

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

  if (!profile) return null;

  const resolvedTotal = propTotalMsgs || queriedTotal || profile.messages || 1;
  const channelPct = ((profile.messages / resolvedTotal) * 100).toFixed(2);

  const tier =
    profile.messages >= 10000
      ? { label: "🐋 Whale (10k+ msgs)", variant: "default" as const }
      : profile.messages >= 2500
      ? { label: "⚡ Core Regular (2.5k-10k)", variant: "secondary" as const }
      : profile.messages >= 500
      ? { label: "💬 Active Chatter (500-2.5k)", variant: "gold" as const }
      : { label: "🌱 Casual Chatter", variant: "outline" as const };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm font-mono text-xs">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border-2 border-primary bg-card p-0 shadow-none">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-muted/90 p-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="border border-primary bg-primary text-black px-1.5 py-0.5 text-[10px] font-bold">
              #{profile.rank}
            </span>
            <span className="text-sm font-bold tracking-tight text-foreground">
              Chatter Dashboard: {profile.displayName}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="border border-border bg-card px-2 py-1 text-muted-foreground hover:bg-foreground hover:text-black"
          >
            [Close]
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          {/* KPI Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border border-border bg-background p-3">
            <div>
              <span className="text-[9px] text-muted-foreground block">Total Messages</span>
              <span className="text-lg font-bold text-primary">{formatNumber(profile.messages)}</span>
            </div>
            <div>
              <span className="text-[9px] text-muted-foreground block">Channel Share</span>
              <span className="text-lg font-bold text-gold">{channelPct}%</span>
            </div>
            <div>
              <span className="text-[9px] text-muted-foreground block">Global Rank</span>
              <span className="text-lg font-bold text-foreground">#{profile.rank}</span>
            </div>
            <div>
              <span className="text-[9px] text-muted-foreground block">Activity Tier</span>
              <Badge variant={tier.variant} className="mt-1 text-[8px]">
                {tier.label}
              </Badge>
            </div>
          </div>

          {/* Animated 12-Month Line Chart */}
          {profile.timeline && (
            <ChatterLineChart data={profile.timeline} />
          )}

          {/* Lexicon Donut Pie Chart */}
          {profile.breakdown && (
            <ChatterPieChart breakdown={profile.breakdown} />
          )}

          {/* Top Used Emotes & Words by this Chatter */}
          <div className="flex flex-col border border-border bg-background p-3">
            <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground border-b border-border/60 pb-2 mb-2">
              <span>Most Frequent Emotes & Words</span>
              <span>{profile.topTargets?.length ?? 0} tracked</span>
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-border/40">
              {profile.topTargets && profile.topTargets.length > 0 ? (
                profile.topTargets.map((t, idx) => {
                  const maxCount = profile.topTargets[0]?.count || 1;
                  const barWidth = Math.round((t.count / maxCount) * 100);

                  return (
                    <div key={`${t.kind}:${t.name}`} className="flex items-center justify-between py-2 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 text-muted-foreground text-[10px] shrink-0">#{idx + 1}</span>
                        {t.url ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <EmoteDisplay name={t.name} url={t.url} size="sm" />
                            <span className="font-bold text-foreground truncate">{t.name}</span>
                          </div>
                        ) : (
                          <span className="font-bold text-foreground truncate">
                            “{t.name}”
                          </span>
                        )}
                        <KindBadge kind={t.kind} className="shrink-0 ml-1" />
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="h-1.5 w-20 border border-border bg-card hidden sm:block">
                          <div
                            className="h-full bg-primary transition-all duration-500 ease-out"
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
