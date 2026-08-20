import { useEffect, useRef, useState } from "react";
import { useStreamer } from "@/lib/streamerContext";

function formatEta(seconds: number): string {
  if (seconds < 60) return `≈ ${Math.max(1, Math.round(seconds))}s left`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `≈ ${m} min ${s}s left`;
}

/**
 * Full-screen, interaction-blocking overlay shown while a live channel's deep
 * chat archive is being built. Transparent: the dimmed page stays visible
 * behind it. Shows every step being done, plus an estimated time remaining
 * once enough progress has been measured (a few seconds in).
 */
export function IngestOverlay() {
  const { channel, archiveData, ingestProgress, seDataAvailable, isStreamerError } = useStreamer();
  const samplesRef = useRef<{ t: number; current: number }[]>([]);
  const [etaState, setEtaState] = useState<{ eta: number | null; estimating: boolean }>({ eta: null, estimating: false });

  const visible =
    channel !== "" &&
    archiveData === null &&
    !isStreamerError &&
    ingestProgress.status !== "done" &&
    ingestProgress.status !== "error";

  const stage =
    ingestProgress.stage ||
    (seDataAvailable ? "Preparing archive build…" : "Resolving channel, emotes & StreamElements…");

  // Tick once per second: refresh `now`, collect progress samples, and
  // recompute the ETA (setState only happens inside the interval callback).
  const progressRef = useRef(ingestProgress);
  useEffect(() => {
    progressRef.current = ingestProgress;
  }, [ingestProgress]);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      const t = Date.now();
      const { total, current } = progressRef.current;
      if (total > 0 && current > 0) {
        const last = samplesRef.current[samplesRef.current.length - 1];
        if (!last || t - last.t >= 1500) {
          samplesRef.current.push({ t, current });
        }
        if (samplesRef.current.length >= 2) {
          const first = samplesRef.current[0];
          const recent = samplesRef.current[samplesRef.current.length - 1];
          const elapsedMs = recent.t - first.t;
          const delta = recent.current - first.current;
          if (delta > 0 && elapsedMs > 0) {
            const remaining = ((total - current) / delta) * elapsedMs;
            if (elapsedMs > 5000) {
              setEtaState({ eta: remaining / 1000, estimating: false });
              return;
            }
          }
        }
      }
      setEtaState({ eta: null, estimating: total > 0 && current > 0 });
    }, 1000);
    return () => clearInterval(id);
  }, [visible]);

  // Reset ETA samples whenever the stage changes (or overlay reappears).
  useEffect(() => {
    if (!visible) return;
    samplesRef.current = [];
  }, [visible, stage]);

  // Lock page scrolling while the overlay is up so nothing can be interacted with.
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible) return null;

  const { eta, estimating } = etaState;

  const pct =
    ingestProgress.total > 0
      ? Math.min(100, Math.round((ingestProgress.current / ingestProgress.total) * 100))
      : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#070709] px-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-3 text-center font-mono">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />

        <h3 className="text-sm font-bold text-white tracking-tight">
          Building chat archive for{" "}
          <span className="text-primary font-black">#{channel}</span>
        </h3>

        <p className="text-[11px] text-zinc-400">{stage}</p>

        {ingestProgress.detail && (
          <p className="text-[10px] text-zinc-500">{ingestProgress.detail}</p>
        )}

        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          {pct === null ? (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
          ) : (
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.max(4, pct)}%` }}
            />
          )}
        </div>

        <p className="text-[10px] text-zinc-500 tabular-nums">
          {ingestProgress.total > 0
            ? `${ingestProgress.current} / ${ingestProgress.total}`
            : `${ingestProgress.current.toLocaleString()} messages parsed`}
          {eta !== null
            ? ` · ${formatEta(eta)}`
            : estimating
            ? " · estimating…"
            : ""}
        </p>
      </div>
    </div>
  );
}
