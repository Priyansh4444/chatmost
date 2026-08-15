import { cn, formatNumber } from "@/lib/utils";
import { EmoteDisplay } from "@/components/emote";

export interface RankedBarItem {
  label: string;
  count: number;
  url?: string | null;
  isAnswer?: boolean;
  rank?: number;
}

interface RankedBarListProps {
  data: RankedBarItem[];
  valueUnit?: string;
  className?: string;
}

export function RankedBarList({
  data,
  valueUnit = "uses",
  className,
}: RankedBarListProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const totalSum = data.reduce((acc, d) => acc + d.count, 0) || 1;

  return (
    <div className={cn("flex flex-col border border-border divide-y divide-border font-mono text-xs", className)}>
      {data.map((item, idx) => {
        const pctOfMax = Math.round((item.count / maxCount) * 100);
        const pctOfTotal = ((item.count / totalSum) * 100).toFixed(1);
        const rank = item.rank ?? idx + 1;

        return (
          <div
            key={`${item.label}-${idx}`}
            className={cn(
              "group relative flex items-center justify-between p-2.5 transition-none",
              item.isAnswer ? "bg-primary/10" : "hover:bg-muted/30"
            )}
          >
            {/* Brutalist Rectangular Progress Meter Fill */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 transition-none",
                item.isAnswer
                  ? "bg-primary/20"
                  : rank === 1
                  ? "bg-gold/15"
                  : "bg-muted/40"
              )}
              style={{ width: `${pctOfMax}%` }}
            />

            {/* Left: Rank + Label */}
            <div className="relative z-10 flex items-center gap-2.5 min-w-0">
              <span
                className={cn(
                  "flex h-5 w-6 shrink-0 items-center justify-center border font-mono text-[11px] font-bold",
                  rank === 1
                    ? "border-gold bg-gold text-black"
                    : rank === 2
                    ? "border-primary bg-primary text-black"
                    : rank === 3
                    ? "border-secondary bg-secondary text-black"
                    : "border-border bg-card text-muted-foreground"
                )}
              >
                {rank}
              </span>

              {item.url && <EmoteDisplay name={item.label} url={item.url} size="sm" />}

              <span
                className={cn(
                  "truncate font-bold tracking-tight",
                  item.isAnswer ? "text-primary" : "text-foreground"
                )}
              >
                {item.label}
              </span>
            </div>

            {/* Right: Count & Percentage */}
            <div className="relative z-10 flex items-center gap-3 shrink-0">
              <span className="font-bold text-foreground">
                {formatNumber(item.count)}{" "}
                <span className="text-[10px] text-muted-foreground font-normal">
                  {valueUnit}
                </span>
              </span>

              <span className="border border-border/80 bg-background px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                {pctOfTotal}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
