import { Button } from "@/components/ui/button";
import { Flame } from "lucide-react";

export interface LifelineState {
  fiftyFiftyUsed: boolean;
  sacrificedChatterName?: string;
}

interface LifelinesProps {
  lifelines: LifelineState;
  disabled?: boolean;
  onUseFiftyFifty: () => void;
  currentChatterName?: string;
}

export function Lifelines({ lifelines, disabled, onUseFiftyFifty, currentChatterName }: LifelinesProps) {
  const used = lifelines.fiftyFiftyUsed;
  return (
    <Button
      type="button"
      size="sm"
      disabled={disabled || used}
      onClick={onUseFiftyFifty}
      className={
        used
          ? "border border-white/[0.06] bg-transparent text-zinc-600 line-through opacity-40 text-xs cursor-not-allowed"
          : "border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 font-semibold text-xs flex items-center gap-1.5 active:scale-95 transition-transform"
      }
    >
      {used ? (
        "Sacrificed"
      ) : (
        <>
          <Flame className="h-3.5 w-3.5 animate-fade-pulse" />
          Sacrifice {currentChatterName ? `"${currentChatterName}"` : "Chatter"}
        </>
      )}
    </Button>
  );
}
