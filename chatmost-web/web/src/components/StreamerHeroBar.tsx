import { useEffect, useRef, useState } from "react";
import { useStreamer } from "@/lib/streamerContext";
import { ArrowLeftRight, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { formatNumber, cn } from "@/lib/utils";

export function StreamerHeroBar() {
  const {
    channel,
    streamer,
    isLoadingStreamer,
    isStreamerError,
    retryStreamerLoad,
    setIsChannelModalOpen,
    data,
    archiveData,
    clearArchives,
    ingestProgress,
  } = useStreamer();

  const [confirmingClear, setConfirmingClear] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);

  const handleClearCache = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      confirmTimerRef.current = window.setTimeout(() => setConfirmingClear(false), 4000);
      return;
    }
    if (confirmTimerRef.current !== null) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmingClear(false);
    void clearArchives();
  };

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const isArchiveFailed = ingestProgress.status === "error";
  const isIngesting = ingestProgress.status === "ingesting";
  const isReady = !isStreamerError && !isArchiveFailed && data !== null && !isLoadingStreamer && !isIngesting;

  const totalEmotes = isReady && data ? data.emotesCount : 0;
  const totalChatters = isReady && data ? (data.chatters?.length || 0) : 0;

  const badge = isStreamerError
    ? "Live Sync Failed"
    : isArchiveFailed
    ? "Archive Unavailable"
    : isIngesting
    ? "Ingesting Archive…"
    : archiveData
    ? "Deep Archive"
    : data
    ? "Live Ingested"
    : "Loading…";

  const isAnyError = isStreamerError || isArchiveFailed;

  return (
    <>
      <div className="w-full border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4 mb-5 flex flex-wrap items-center justify-between gap-4 font-mono text-xs shadow-sm backdrop-blur-md">
      {/* Left: Streamer identity & live sync status */}
      <div className="flex items-center gap-3">
        {/* Streamer Avatar or default badge */}
        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden border border-white/[0.1] bg-black">
          {data?.avatarUrl ? (
            <img
              src={data.avatarUrl}
              alt={channel}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-black text-primary bg-primary/10">
              #{channel.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span
            className={`absolute bottom-0 right-0 h-2.5 w-2.5 border-2 border-black ${
              isLoadingStreamer || isIngesting
                ? "bg-amber-400 animate-spin"
                : isAnyError
                ? "bg-red-500"
                : "bg-emerald-400 animate-pulse"
            }`}
          />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="font-black text-sm text-white tracking-tight">#{channel}</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 border",
              isAnyError
                ? "text-red-400 bg-red-950/40 border-red-800/60"
                : isIngesting
                ? "text-purple-300 bg-purple-950/40 border-purple-800/60"
                : "text-zinc-500 bg-white/[0.04] border-white/[0.06]"
            )}>
              {badge}
            </span>
          </div>

          <p className="text-[11px] text-zinc-400 font-sans mt-0.5 flex items-center gap-2">
            {isLoadingStreamer || isIngesting ? (
              <span className="text-amber-400 flex items-center gap-1 font-mono">
                <RefreshCw className="h-3 w-3 animate-spin" /> Ingesting channel data & emotes…
              </span>
            ) : isAnyError ? (
              <span className="flex items-center gap-2">
                <span className="text-red-400">
                  {isStreamerError
                    ? `Couldn't load live data for #${channel}`
                    : `Chat archive unavailable for #${channel}`}
                </span>
                <button
                  type="button"
                  onClick={retryStreamerLoad}
                  className="inline-flex items-center gap-1 text-primary hover:text-black hover:bg-primary border border-primary/40 px-1.5 py-0.5 transition-colors font-mono"
                >
                  <RefreshCw className="h-3 w-3" /> Retry
                </button>
              </span>
            ) : (
              <>
                <span>
                  <strong className="text-zinc-200">{formatNumber(totalEmotes)}</strong> emotes
                </span>
                <span className="text-zinc-600">·</span>
                <span>
                  <strong className="text-zinc-200">{formatNumber(totalChatters)}</strong> chatters
                </span>
                <span className="text-zinc-600">·</span>
                <a
                  href={streamer.twitchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 hover:text-primary transition-colors inline-flex items-center gap-0.5"
                >
                  twitch.tv/{channel} <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Right: Clear Cache + Instant Streamer Switch Buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClearCache}
          title={
            confirmingClear
              ? "Click again to confirm — wipes all cached chat archives and rebuilds from scratch"
              : "Wipe all cached chat archives and rebuild from scratch"
          }
          className={`flex items-center gap-2 border px-3 py-1.5 font-mono text-xs font-bold transition-[border-color,color,background-color] ${
            confirmingClear
              ? "border-red-500 bg-red-950/60 text-red-200 animate-pulse"
              : "border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-500/50"
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>{confirmingClear ? "Click again to confirm" : "Clear Cache"}</span>
        </button>
        <button
          type="button"
          onClick={() => setIsChannelModalOpen(true)}
          className="flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary hover:bg-primary hover:text-black transition-[background-color,border-color,color,box-shadow] px-3 py-1.5 font-mono text-xs font-bold shadow-sm"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          <span>Switch Streamer</span>
        </button>
      </div>
      </div>
    </>
  );
}

export function StreamerErrorFallback({
  channel,
  onRetry,
  onUseFallback,
}: {
  channel: string;
  onRetry: () => void;
  onUseFallback?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center font-mono">
      <div className="h-12 w-12 border-2 border-red-500 border-t-transparent rounded-full mb-4 flex items-center justify-center">
        <span className="text-red-500 text-lg">!</span>
      </div>
      <h3 className="text-sm font-bold text-white tracking-tight">Couldn't load chat data for #{channel}</h3>
      <p className="text-xs text-zinc-400 font-sans max-w-sm mt-2">
        The chat archive couldn't be fetched (retries exhausted). Archive data is never shown under another channel's
        name — try again or switch streamers.
      </p>
      <div className="flex items-center gap-2 mt-5">
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary hover:bg-primary hover:text-black transition-[background-color,border-color,color,box-shadow] px-3 py-1.5 font-mono text-xs font-bold shadow-sm"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry Load
        </button>
        {onUseFallback && (
          <button
            type="button"
            onClick={onUseFallback}
            className="flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-white/[0.06] transition-[background-color,border-color,color] px-3 py-1.5 font-mono text-xs font-bold"
          >
            Show fast stats anyway
          </button>
        )}
      </div>
    </div>
  );
}
