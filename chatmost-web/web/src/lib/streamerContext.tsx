import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DynamicStreamerData } from "./dynamicStreamer";
import { loadDynamicStreamerData, clearStreamerMemoryCache } from "./dynamicStreamer";
import { archiveCacheGet, archiveCacheSet, buildChatArchive, clearArchiveCache, incrementalArchiveUpdate, isUsableArchive, type IngestProgress } from "./chatIngest";

interface StreamerInfo {
  channel: string;
  displayName: string;
  twitchUrl: string;
  streamElementsUrl: string;
}

interface StreamerContextValue {
  streamer: StreamerInfo;
  channel: string;
  isLoadingStreamer: boolean;
  isStreamerError: boolean;
  retryStreamerLoad: () => void;
  setChannel: (channel: string) => void;
  isChannelModalOpen: boolean;
  setIsChannelModalOpen: (open: boolean) => void;
  data: DynamicStreamerData | null;
  archiveData: DynamicStreamerData | null;
  /** Live StreamElements snapshot (pre-archive), always fresh from the API. */
  seData: DynamicStreamerData | null;
  ingestProgress: IngestProgress;
  seDataAvailable: boolean;
  clearArchives: () => Promise<void>;
}

const ARCHIVE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Live StreamElements / 7TV / BTTV / FFZ data for the given channel, fetched
 * through react-query. Data is cached for the current page session only, so a
 * full page reload is the only thing that triggers a refetch.
 */
function useDynamicStreamerData(channel: string) {
  return useQuery<DynamicStreamerData | null>({
    queryKey: ["dynamicStreamer", channel],
    queryFn: () => loadDynamicStreamerData(channel),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

const StreamerContext = createContext<StreamerContextValue | null>(null);

function getInitialChannel(): string {
  if (typeof window !== "undefined") {
    // Clear old legacy test cache if present
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith("chatmost_streamer_")) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      /* ignore */
    }

    const params = new URLSearchParams(window.location.search);
    const urlChannel = params.get("channel") || params.get("streamer") || params.get("c");
    if (urlChannel && urlChannel.trim()) {
      return urlChannel.trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_]/g, "");
    }
  }

  // No default channel: the root page always lands on the streamer-picking UI.
  // Only an explicit ?channel=... deep link loads a channel directly.
  return "";
}

export function StreamerProvider({ children }: { children: ReactNode }) {
  const [channel, setChannelState] = useState<string>(getInitialChannel);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [archiveData, setArchiveData] = useState<DynamicStreamerData | null>(null);
  const [ingestProgress, setIngestProgress] = useState<IngestProgress>({ status: "idle", stage: "", current: 0, total: 0, detail: "" });
  const [retryKey, setRetryKey] = useState(0);
  const runIdRef = useRef(0);
  const streamerQuery = useDynamicStreamerData(channel);

  // Load the deep chat archive for live channels. IndexedDB is read first so
  // cached channels render instantly — live API data (SE/emotes) only gates
  // the initial full build and background refreshes. Stale caches are synced
  // incrementally (new days/VODs only) while the page keeps showing data.
  useEffect(() => {
    if (!channel) return;

    const runId = ++runIdRef.current;

    const run = async () => {
      const cached = await archiveCacheGet(channel);
      if (runIdRef.current !== runId) return;

      const seData =
        streamerQuery.data && streamerQuery.data.channel === channel ? streamerQuery.data : null;

      if (cached && isUsableArchive(cached) && cached.data.channel === channel) {
        // [dbg] Breakdown of the cached archive's emote targets.
        {
          const d = cached.data;
          const byKind: Record<string, number> = {};
          const caseDupes = new Map<string, Set<string>>();
          for (const t of d.targets ?? []) {
            if (t.kind !== "7tv" && t.kind !== "twitch") continue;
            byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
            const key = t.name.toLowerCase();
            const s = caseDupes.get(key) ?? new Set<string>();
            s.add(t.name);
            caseDupes.set(key, s);
          }
          const dupes = [...caseDupes.entries()].filter(([, names]) => names.size > 1);
          console.log(
            `[dbg] cached #${channel}: msgs=${d.stats?.messages} emotes=${d.emotesCount} byKind=${JSON.stringify(byKind)} caseVariants=${dupes.length} cachedMinsAgo=${Math.round((Date.now() - cached.builtAt) / 60000)}`,
            dupes.slice(0, 25).map(([key, names]) => `${key}: [${[...names].join(", ")}]`)
          );
        }
        setArchiveData(cached.data);
        setIngestProgress({
          status: "done",
          stage: "Archive ready",
          current: cached.messages,
          total: cached.messages,
          detail: `${cached.messages.toLocaleString()} messages from ${cached.source === "zonian" ? cached.days + " days of chat logs" : cached.videos + " VODs"} (cached ${Math.round((Date.now() - cached.builtAt) / 60000)}m ago)`,
        });

        // Live data decides whether a refresh is due; this effect re-runs as
        // soon as it lands, so nothing is blocked waiting for it.
        if (!seData) return;

        let needsUpdate = Date.now() - cached.builtAt > ARCHIVE_TTL_MS;
        // Any day/VOD that failed to finish (rate-limited) is carried forward
        // in `partialOffsets`; those archives must keep being retried until the
        // data is corrected, regardless of the TTL.
        const hasPartialDays = cached.partialOffsets && Object.keys(cached.partialOffsets).length > 0;
        if (hasPartialDays) needsUpdate = true;
        const liveSeMessages = seData.streamelements?.stats?.messages ?? 0;
        const cachedSeMessages = cached.data.streamelements?.stats?.messages ?? 0;
        if (liveSeMessages > 0 && cachedSeMessages === 0) {
          needsUpdate = true;
        }
        if (!needsUpdate) return;

        if (cached.aggregate) {
          // Diff-based background refresh: only missing days/VODs are fetched.
          try {
            const updated = await incrementalArchiveUpdate(
              channel,
              cached,
              seData,
              (p) => {
                if (runIdRef.current === runId) setIngestProgress(p);
              },
              () => runIdRef.current !== runId
            );
            if (runIdRef.current !== runId) return;
            if (updated) {
              setArchiveData(updated.data);
              setIngestProgress({
                status: "done",
                stage: "Archive ready",
                current: updated.messages,
                total: updated.messages,
                detail: `${updated.messages.toLocaleString()} messages from ${updated.source === "zonian" ? updated.days + " days of chat logs" : updated.videos + " VODs"}`,
              });
              await archiveCacheSet(updated);
            }
          } catch (err) {
            // Background refresh failed: keep showing the cached archive.
            if (runIdRef.current !== runId) return;
            console.warn(`Background archive refresh for #${channel} failed; keeping cached data.`, err);
          }
          return;
        }

        // Pre-aggregate (legacy) cache: can't diff, rebuild once in the
        // background so the next refresh becomes incremental.
        try {
          const built = await buildChatArchive(
            channel,
            seData,
            (p) => {
              if (runIdRef.current === runId) setIngestProgress(p);
            },
            () => runIdRef.current !== runId
          );
          if (runIdRef.current !== runId) return;
          setArchiveData(built.data);
          setIngestProgress({
            status: "done",
            stage: "Archive ready",
            current: built.messages,
            total: built.messages,
            detail: `${built.messages.toLocaleString()} messages from ${built.source === "zonian" ? built.days + " days of chat logs" : built.videos + " VODs"}`,
          });
          await archiveCacheSet(built);
        } catch (err) {
          if (runIdRef.current !== runId) return;
          console.warn(`Full archive rebuild for #${channel} failed; keeping cached data.`, err);
        }
        return;
      }

      // No usable cache: full build once live data is in.
      if (!seData) return;

      try {
        const built = await buildChatArchive(
          channel,
          seData,
          (p) => {
            if (runIdRef.current === runId) setIngestProgress(p);
          },
          () => runIdRef.current !== runId
        );
        if (runIdRef.current !== runId) return;
        setArchiveData(built.data);
        setIngestProgress({
          status: "done",
          stage: "Archive ready",
          current: built.messages,
          total: built.messages,
          detail: `${built.messages.toLocaleString()} messages from ${built.source === "zonian" ? built.days + " days of chat logs" : built.videos + " VODs"}`,
        });
        await archiveCacheSet(built);
      } catch (err) {
        if (runIdRef.current !== runId) return;
        setArchiveData(null);
        const message = err instanceof Error && err.message !== "cancelled" ? err.message : "Archive build failed";
        if (message !== "cancelled") {
          setIngestProgress({
            status: "error",
            stage: "Archive failed",
            current: 0,
            total: 0,
            detail: message,
            error: message,
          });
        }
      }
    };

    run();
    return () => {
      runIdRef.current += 1;
    };
  }, [channel, streamerQuery.data, retryKey]);

  const validArchive = archiveData && archiveData.channel === channel ? archiveData : null;
  const validSe = streamerQuery.data && streamerQuery.data.channel === channel ? streamerQuery.data : null;
  const validData = validArchive ?? validSe ?? null;

  const isLoadingStreamer = channel !== "" && streamerQuery.isPending && validArchive === null;
  const isStreamerError = channel !== "" && !streamerQuery.isPending && streamerQuery.data === null && validArchive === null;
  const retryStreamerLoad = () => {
    setArchiveData(null);
    setIngestProgress({ status: "idle", stage: "", current: 0, total: 0, detail: "" });
    streamerQuery.refetch();
    setRetryKey((k) => k + 1);
  };

  const clearArchives = async () => {
    console.log(`[dbg] clearArchives: clearing caches for all channels`);
    await clearArchiveCache();
    clearStreamerMemoryCache();
    setArchiveData(null);
    setIngestProgress({ status: "idle", stage: "", current: 0, total: 0, detail: "" });
    streamerQuery.refetch();
    setRetryKey((k) => k + 1);
  };

  const setChannel = (newChannel: string) => {
    const clean = newChannel.trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_]/g, "");
    if (!clean) return;

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("channel", clean);
      window.location.assign(url.toString());
      return;
    }

    setArchiveData(null);
    setIngestProgress({ status: "idle", stage: "", current: 0, total: 0, detail: "" });
    setChannelState(clean);
  };

  // Sync with browser back/forward buttons or URL change
  useEffect(() => {
    const handlePopState = () => {
      setArchiveData(null);
      setIngestProgress({ status: "idle", stage: "", current: 0, total: 0, detail: "" });
      setChannelState(getInitialChannel());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const streamer: StreamerInfo = {
    channel,
    displayName: channel,
    twitchUrl: `https://twitch.tv/${channel}`,
    streamElementsUrl: `https://stats.streamelements.com/c/${channel}`,
  };

  const value: StreamerContextValue = {
    streamer,
    channel,
    isLoadingStreamer,
    isStreamerError,
    retryStreamerLoad,
    setChannel,
    isChannelModalOpen,
    setIsChannelModalOpen,
    data: validData,
    archiveData: validArchive,
    seData: validSe,
    ingestProgress,
    seDataAvailable: validSe !== null,
    clearArchives,
  };

  return <StreamerContext.Provider value={value}>{children}</StreamerContext.Provider>;
}

export function useStreamer() {
  const ctx = useContext(StreamerContext);
  if (!ctx) {
    throw new Error("useStreamer must be used within a StreamerProvider");
  }
  return ctx;
}

export interface ChannelData {
  data: DynamicStreamerData | null;
  archiveData: DynamicStreamerData | null;
  /** Live StreamElements snapshot (pre-archive), always fresh from the API. */
  seData: DynamicStreamerData | null;
  isPending: boolean;
  isError: boolean;
  retry: () => void;
  ingestProgress: IngestProgress;
  /** Deep archive build in progress and no archive to show yet. */
  isIngesting: boolean;
  /** Archive build failed and no archive to fall back on. */
  archiveFailed: boolean;
  /** Fast StreamElements snapshot is available (can unblock with it). */
  seAvailable: boolean;
}

/**
 * Best available data for a channel: the deep chat archive when one exists
 * (live channels get one built automatically), otherwise the fast
 * StreamElements snapshot.
 */
export function useChannelData(_channel: string): ChannelData {
  const ctx = useStreamer();
  const archive = ctx.archiveData !== null;
  return {
    data: ctx.data,
    archiveData: ctx.archiveData,
    seData: ctx.seData,
    isPending: ctx.isLoadingStreamer,
    isError: ctx.isStreamerError,
    retry: ctx.retryStreamerLoad,
    ingestProgress: ctx.ingestProgress,
    isIngesting: ctx.ingestProgress.status === "ingesting" && !archive,
    archiveFailed: ctx.ingestProgress.status === "error" && !archive,
    seAvailable: ctx.seDataAvailable,
  };
}
