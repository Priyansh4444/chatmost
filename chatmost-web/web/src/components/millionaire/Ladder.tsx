import { PRIZE_TIERS } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LadderProps {
  currentTier: number; // 1 to 15
  className?: string;
}

export function Ladder({ currentTier, className }: LadderProps) {
  return (
    <div
      className={cn(
        "flex flex-col border border-border/80 bg-card/40 font-mono text-[11px] shadow-none",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-2.5 py-1.5">
        <span className="text-[10px] font-bold text-muted-foreground">
          Prize Ladder
        </span>
        <span className="font-bold text-primary text-[10px]">
          Tier {currentTier} / 15
        </span>
      </div>

      <div className="flex flex-col-reverse divide-y divide-y-reverse divide-border/50">
        {PRIZE_TIERS.map((tierInfo) => {
          const isActive = tierInfo.tier === currentTier;
          const isPassed = tierInfo.tier < currentTier;
          const isSafe = tierInfo.safe;

          return (
            <div
              key={tierInfo.tier}
              className={cn(
                "flex items-center justify-between px-2.5 py-1 transition-none",
                isActive &&
                  "bg-primary text-black font-bold animate-ladder-active",
                isPassed && "bg-muted/10 text-muted-foreground line-through opacity-40",
                !isActive && !isPassed && "text-foreground",
                isSafe && !isActive && !isPassed && "bg-gold/10 font-bold text-gold"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="w-4 text-left text-[9px] text-muted-foreground">
                  {tierInfo.tier.toString().padStart(2, "0")}
                </span>
                <span className={cn(isSafe ? "font-bold" : "")}>
                  {tierInfo.prize}
                </span>
              </div>

              {tierInfo.tier === 15 && (
                <span className="border border-current px-1 text-[8px] font-bold">
                  Win
                </span>
              )}
              {isSafe && tierInfo.tier !== 15 && (
                <span className="border border-current px-1 text-[8px] font-bold">
                  Safe
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
