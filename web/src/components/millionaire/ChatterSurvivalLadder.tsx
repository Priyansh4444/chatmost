import { cn } from "@/lib/utils";
import { Skull, Check, Flame } from "lucide-react";

export interface RescueChatter {
  login: string;
  displayName: string;
  rank: number;
}

interface ChatterSurvivalLadderProps {
  currentTier: number;
  roster: RescueChatter[];
  gameState: "loading" | "playing" | "locked" | "answered" | "gameover" | "victory";
  sacrificedLogins?: Set<string>;
  className?: string;
}

export function ChatterSurvivalLadder({
  currentTier,
  roster,
  gameState,
  sacrificedLogins = new Set(),
  className,
}: ChatterSurvivalLadderProps) {
  const isOver    = gameState === "gameover";
  const isVictory = gameState === "victory";

  return (
    <div className={cn("flex flex-col font-mono text-xs", className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.08] gap-3">
        <span className="text-[11px] text-zinc-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Survival Ladder
        </span>
        <span className={cn(
          "text-[11px] font-bold tabular-nums px-2 py-0.5 border border-primary/30 bg-primary/10 text-primary font-mono",
          isVictory && "text-green-400 border-green-500/30 bg-green-500/10",
          isOver && "text-primary border-primary/40 bg-primary/15"
        )}>
          {isVictory ? "15/15 Saved" : isOver ? `Fell at Stage ${currentTier}` : `Stage ${currentTier}/15`}
        </span>
      </div>

      {/* Tiers — reversed so Stage 15 is at apex */}
      <div className="flex flex-col-reverse divide-y divide-y-reverse divide-white/[0.04]">
        {Array.from({ length: 15 }, (_, i) => i + 1).map((t) => {
          const chatter   = roster[t - 1];
          const isCurrent = t === currentTier && !isOver && !isVictory;
          const isSaved   = (t < currentTier && (!chatter || !sacrificedLogins.has(chatter.login))) || isVictory;
          const isSac     = chatter && sacrificedLogins.has(chatter.login);
          const isDead    = isOver && t >= currentTier && !isSac;
          const isApex    = t === 15;
          const isCkpt    = t === 5 || t === 10;
          const displayRank = chatter?.rank ?? (16 - t);

          // Death stagger delay for the cooler death animation
          const deathDelay = isDead ? (t - currentTier) * 70 : 0;

          return (
            <div
              key={t}
              style={isDead ? { animationDelay: `${deathDelay}ms`, animationFillMode: "both" } : undefined}
              className={cn(
                "flex items-center justify-between py-1.5 px-2 transition-all duration-300",
                isCurrent && "bg-white/[0.06] border-l-2 border-primary text-white",
                isDead && "animate-death-disintegrate bg-primary/[0.06] border-l-2 border-primary/60 text-primary",
                isSac && "bg-primary/[0.03] text-zinc-500 opacity-60 line-through",
                isSaved && "text-zinc-400 opacity-80",
                !isCurrent && !isSaved && !isDead && !isSac && "text-zinc-300 hover:bg-white/[0.02]"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {/* Status Indicator */}
                {isDead ? (
                  <Skull className="h-3.5 w-3.5 text-primary shrink-0 animate-skull-pulse" />
                ) : isSac ? (
                  <Flame className="h-3.5 w-3.5 text-primary shrink-0 opacity-70" />
                ) : isSaved ? (
                  <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
                ) : (
                  <span className={cn(
                    "text-[11px] w-4 text-right tabular-nums shrink-0 font-bold",
                    isCurrent ? "text-primary" : "text-zinc-500"
                  )}>
                    {t}
                  </span>
                )}

                {/* Chatter Name */}
                <span className={cn(
                  "truncate max-w-[130px] text-xs transition-colors",
                  isCurrent ? "text-white font-bold tracking-tight" :
                  isDead    ? "text-primary font-semibold line-through" :
                  isSac     ? "text-zinc-500" :
                  isSaved   ? "text-zinc-400" :
                              "text-zinc-200"
                )}>
                  {chatter?.displayName ?? `Chatter #${displayRank}`}
                </span>
              </div>

              {/* Tier / Rank Tag */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isDead ? (
                  <span className="text-[10px] font-bold text-primary tracking-wide">
                    DEAD
                  </span>
                ) : isSac ? (
                  <span className="text-[9px] text-primary/70 tracking-wide uppercase">
                    SACRIFICED
                  </span>
                ) : isSaved ? (
                  <span className="text-[9px] text-green-400/80 font-mono">
                    SAVED
                  </span>
                ) : (
                  <span className={cn(
                    "text-[10px] font-mono tabular-nums",
                    isCurrent && isApex ? "text-primary font-bold" :
                    isCurrent            ? "text-primary font-semibold" :
                    isApex               ? "text-zinc-200 font-bold" :
                    isCkpt               ? "text-zinc-400 font-semibold" :
                                           "text-zinc-500"
                  )}>
                    {isApex ? `APEX #${displayRank}` : isCkpt ? `CKPT #${displayRank}` : `#${displayRank}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
