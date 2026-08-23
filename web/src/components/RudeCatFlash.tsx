import { useEffect } from "react";

interface RudeCatFlashProps {
  show: boolean;
  onDismiss?: () => void;
  title?: string;
  duration?: number;
}

export function RudeCatFlash({
  show,
  onDismiss,
  title = "CHAT WAS WRONG",
  duration = 1800,
}: RudeCatFlashProps) {
  // The parent controls `show`; this only schedules the auto-dismiss
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => {
      onDismiss?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [show, duration, onDismiss]);

  if (!show) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-black/60 backdrop-blur-[2px] transition-opacity duration-300"
    >
      <div className="flex flex-col items-center gap-3 p-4 bg-[#0a0a0c]/90 border-2 border-primary shadow-[0_0_50px_rgba(232,100,122,0.4)] animate-wrong-shake max-w-sm sm:max-w-md mx-4">
        {/* Header Warning */}
        <div className="flex items-center gap-2 text-primary font-mono font-bold text-xs uppercase tracking-widest">
          <span>💀</span>
          <span>{title}</span>
          <span>💀</span>
        </div>

        {/* Rude Cat Meme Image */}
        <div className="relative w-full overflow-hidden border border-white/[0.1] bg-black">
          <img
            src="/rude-cat.png"
            alt="Rude Cat"
            onError={(e) => {
              // Fallback to direct Reddit CDN if needed
              (e.currentTarget as HTMLImageElement).src =
                "https://preview.redd.it/a-rude-cat-but-in-good-quality-v0-51wvd7kw4my91.png?auto=webp&s=283a445c6b024cf4180a1b878e1f974fe7d3c829";
            }}
            className="w-full h-auto max-h-[320px] object-cover"
          />
        </div>

        <p className="text-[11px] font-mono text-zinc-400 text-center">
          Chat confident. Chat wrong.
        </p>
      </div>
    </div>
  );
}
