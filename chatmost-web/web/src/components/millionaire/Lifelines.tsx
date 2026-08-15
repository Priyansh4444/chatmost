import { Button } from "@/components/ui/button";

export interface LifelineState {
  fiftyFiftyUsed: boolean;
}

interface LifelinesProps {
  lifelines: LifelineState;
  disabled?: boolean;
  onUseFiftyFifty: () => void;
}

export function Lifelines({
  lifelines,
  disabled,
  onUseFiftyFifty,
}: LifelinesProps) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-xs">
      <Button
        type="button"
        size="sm"
        disabled={disabled || lifelines.fiftyFiftyUsed}
        onClick={onUseFiftyFifty}
        variant={lifelines.fiftyFiftyUsed ? "outline" : "default"}
        className={
          lifelines.fiftyFiftyUsed
            ? "border-border/40 text-muted-foreground line-through opacity-40"
            : "border-primary bg-primary text-black font-bold"
        }
      >
        50:50 Lifeline
      </Button>
    </div>
  );
}
