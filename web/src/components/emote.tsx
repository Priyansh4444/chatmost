import { useState } from "react";
import { cn } from "@/lib/utils";

interface EmoteDisplayProps {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function EmoteDisplay({
  name,
  url,
  size = "md",
  className,
}: EmoteDisplayProps) {
  const [prevUrl, setPrevUrl] = useState(url);
  const [error, setError] = useState(false);

  // Adjust state during render when the url prop changes (React 18+ idiom)
  if (url !== prevUrl) {
    setPrevUrl(url);
    setError(false);
  }

  // If there is no emote URL or image failed to load, do not show any box or placeholder
  if (!url || error) {
    return null;
  }

  const sizeClasses = {
    sm: "h-5 w-5",
    md: "h-7 w-7",
    lg: "h-10 w-10",
    xl: "h-14 w-14",
  }[size];

  return (
    <span className="relative inline-flex items-center justify-center group/emote align-middle">
      <img
        key={url}
        src={url}
        alt={name}
        title={name}
        onError={() => setError(true)}
        className={cn(
          "inline-block shrink-0 object-contain transition-transform duration-100 group-hover/emote:scale-110 cursor-help",
          sizeClasses,
          className
        )}
        loading="eager"
      />
      {/* Instant Micro-Tooltip on Hover */}
      <span className="pointer-events-none select-none absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/emote:opacity-100 transition-opacity duration-75 z-50 whitespace-nowrap border border-border bg-[#0d1117] px-1.5 py-0.5 font-mono text-[10px] font-bold text-foreground shadow-md">
        {name}
      </span>
    </span>
  );
}

export function KindBadge({ kind, className }: { kind: string; className?: string }) {
  const styles = {
    "7tv": "border-primary/60 text-primary bg-primary/10",
    twitch: "border-secondary/60 text-secondary bg-secondary/10",
    word: "border-border text-muted-foreground bg-muted/20",
  }[kind] || "border-border text-muted-foreground bg-muted/20";

  const label = kind === "7tv" ? "7TV" : kind === "twitch" ? "Twitch" : "Word";

  return (
    <span
      className={cn(
        "inline-flex items-center border px-1.5 py-0.2 font-mono text-[9px] font-bold tracking-tight",
        styles,
        className
      )}
    >
      {label}
    </span>
  );
}