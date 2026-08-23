/**
 * In-Browser Chat Archive Builder
 *
 * Builds a full chat archive for ANY Twitch channel, entirely in the
 * browser, from real chat:
 *
 * 1. Source A: logs.zonian.dev daily chat logs (fast, one request per ~1000
 *    messages) when the channel has logs there.
 * 2. Source B: Twitch VOD chat via the internal GraphQL endpoint
 *    (gql.twitch.tv, public client-id, no login) — works for every channel.
 *
 * Messages are tokenized against the live 7TV / Twitch / BTTV / FFZ emote sets
 * plus word tokens, then aggregated into the same DynamicStreamerData shape the
 * rest of the app consumes (targets, leaderboards, chatter profiles with
 * breakdowns & timelines, yaps, matchups, feud boards, trivia, stats).
 *
 * Results are cached in IndexedDB per channel so revisits are instant.
 */

import {
  type TopTarget,
  type LeaderboardEntry,
  type FeudCategory,
  type LongestMessage,
  type Stats as StatsData,
  type Choice,
  type ChatterLoreMatchup,
  type ChatterProfile,
} from "@/lib/api";
import type { DynamicStreamerData, HigherLowerItem } from "./dynamicStreamer";
import { fetchEmoteSets } from "./emoteSets";
import { Data, Effect } from "effect";
import { fetchWithRetryEffect } from "./effectHttp";

export interface IngestLiveStats {
  messages: number;
  chatters: number;
  emotes: number;
  words: number;
}

export interface IngestProgress {
  status: "idle" | "ingesting" | "done" | "error";
  stage: string;
  current: number;
  total: number;
  detail: string;
  error?: string;
  /** Secondary live stats shown beside the progress bar — never moves it. */
  live?: IngestLiveStats;
}

export interface CachedArchive {
  channel: string;
  builtAt: number;
  source: "zonian" | "vods";
  videos: number;
  days: number;
  messages: number;
  data: DynamicStreamerData;
  /** Zonian day keys ("YYYY-MM-DD") fully ingested — enables incremental sync.
   * Only fully-fetched days are listed here; a rate-limited/partial day stays
   * absent so the next sync retries it (resuming from `partialOffsets`). */
  ingestedDays?: string[];
  /** Zonian day key -> next page offset to resume from for days that failed
   * mid-fetch. Lets a partial day be completed later without double-counting
   * the messages that were already merged into the aggregate. */
  partialOffsets?: Record<string, number>;
  /** Zonian day key -> number of messages already ingested for that day
   * (equivalently, the next page offset to resume from). Recorded for EVERY
   * fetched day, complete or not. Incremental sync uses it to re-fetch the
   * current/live day's growing tail without re-reading (and double-counting)
   * messages that are already merged into the aggregate. */
  dayOffsets?: Record<string, number>;
  /** Twitch VOD ids already ingested — enables incremental sync. */
  vodIds?: string[];
  /** Serialized aggregate needed to merge newly-fetched messages into cached stats. */
  aggregate?: SerializedAggregate;
}

export function isUsableArchive(archive: CachedArchive): boolean {
  return archive.messages > 0 && archive.data.chatters.length > 0;
}

const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const COMMENTS_HASH = "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a";
const ZONIAN_BASE = "https://logs.zonian.dev";
const REQUEST_DELAY_MS = 120;

import { isBot, STOP_WORDS } from "./utils";

// Bump whenever tokenization/aggregation changes so previously cached
// archives (keyed by channel) are rebuilt with the new logic.
//
// v11: full reload with no legacy migration. Older caches (v9/v10) were built
// under ingestion bugs that silently dropped rate-limited days/VODs, so their
// diff state and counts can't be trusted. Old keys are simply ignored and the
// channel is rebuilt from scratch with the corrected, guaranteed-complete
// ingestion. From v11 on, only fully-fetched days/VODs are marked ingested
// and leftover partial days are retried until they clear, so cached archives
// are trustworthy and future bumps can migrate.
const ARCHIVE_CACHE_VERSION = "v12";
const LEGACY_ARCHIVE_CACHE_VERSIONS: string[] = [];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const MAX_RETRIES = 3;
let baseBackoffMs = 100;

// Simple semaphore for controlled concurrency (avoids 429s while speeding up multi-day fetches)
async function withConcurrency<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = index++;
      if (i >= items.length) break;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

export function setBaseBackoffMs(ms: number) {
  baseBackoffMs = ms;
}

function fetchWithRetry(url: string, options: RequestInit, isCancelled: () => boolean): Promise<Response> {
  return Effect.runPromise(
    fetchWithRetryEffect(url, options, isCancelled, {
      retries: MAX_RETRIES,
      baseBackoffMs,
    }).pipe(
      Effect.mapError((error) => new Error(error.message))
    )
  );
}

export { fetchWithRetry };


export interface RawMessage {
  login: string;
  displayName: string;
  text: string;
  ts: string;
  vodId?: string;
  commentId?: string;
  twitchSpans?: { start: number; end: number; id: string; name: string }[];
}

export interface EmoteMatcher {
  regex: RegExp;
  kind: "7tv" | "twitch";
  kindLabel: string;
  caseInsensitive: boolean;
  urlFor: (name: string) => string | null;
}

interface TargetAcc {
  kind: "7tv" | "twitch" | "word";
  kindLabel: string;
  name: string;
  total: number;
  users: Set<string>;
  url: string | null;
  perChatter: Map<string, number>;
}

interface ChatterAcc {
  login: string;
  displayName: string;
  messages: number;
  targets: Map<string, number>;
  timeline: Map<string, number>;
  firstSeen: string;
  lastSeen: string;
}

interface LongestCandidate {
  login: string;
  displayName: string;
  text: string;
  length: number;
  words: number;
  ts: string;
  vodId?: string;
}

// ---------------------------------------------------------------------------
// IndexedDB cache
// ---------------------------------------------------------------------------

const DB_NAME = "chatmost-archives";
const DB_STORE = "archives";

class ArchiveCacheError extends Data.TaggedError("ArchiveCacheError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

function openDbEffect(): Effect.Effect<IDBDatabase, ArchiveCacheError> {
  return Effect.async((resume) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) {
        req.result.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resume(Effect.succeed(req.result));
    req.onerror = () => resume(Effect.fail(new ArchiveCacheError({
      message: "IndexedDB open failed",
      cause: req.error,
    })));
  });
}

function archiveCacheGetEffect(channel: string): Effect.Effect<CachedArchive | null, ArchiveCacheError> {
  return Effect.gen(function* () {
    const db = yield* openDbEffect();

    const read = (key: string) =>
      Effect.async<CachedArchive | null, ArchiveCacheError>((resume) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).get(key);
        req.onsuccess = () => resume(Effect.succeed((req.result as CachedArchive | undefined) ?? null));
        req.onerror = () => resume(Effect.fail(new ArchiveCacheError({
          message: "IndexedDB read failed",
          cause: req.error,
        })));
      });

    for (const version of [ARCHIVE_CACHE_VERSION, ...LEGACY_ARCHIVE_CACHE_VERSIONS]) {
      const key = `${channel}::${version}`;
      const entry = yield* read(key);
      if (!entry) continue;
      return entry;
    }
    return null;
  });
}

export function archiveCacheGet(channel: string): Promise<CachedArchive | null> {
  return Effect.runPromise(archiveCacheGetEffect(channel).pipe(
    Effect.catchAll(() => Effect.succeed(null))
  ));
}

function archiveCacheSetEffect(entry: CachedArchive): Effect.Effect<void, ArchiveCacheError> {
  if (!isUsableArchive(entry)) return Effect.void;

  return Effect.gen(function* () {
    const db = yield* openDbEffect();
    yield* Effect.async<void, ArchiveCacheError>((resume) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      store.put(entry, `${entry.channel}::${ARCHIVE_CACHE_VERSION}`);
      // Sweep any older version keys for this channel so full-reload version
      // bumps don't leave stale (potentially incomplete) caches behind.
      const sweep = store.openCursor();
      sweep.onsuccess = () => {
        const cursor = sweep.result;
        if (!cursor) return;
        const key = cursor.key as unknown;
        if (typeof key === "string" && key.startsWith(`${entry.channel}::`) && key !== `${entry.channel}::${ARCHIVE_CACHE_VERSION}`) {
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => resume(Effect.void);
      tx.onerror = () => resume(Effect.fail(new ArchiveCacheError({
        message: "IndexedDB write failed",
        cause: tx.error,
      })));
    });
  });
}

export function archiveCacheSet(entry: CachedArchive): Promise<void> {
  return Effect.runPromise(archiveCacheSetEffect(entry).pipe(
    Effect.catchAll(() => Effect.void)
  ));
}

/**
 * Wipe every cached chat archive from IndexedDB so the next visit to any
 * channel rebuilds its archive from scratch.
 */
function clearArchiveCacheEffect(): Effect.Effect<void, ArchiveCacheError> {
  return Effect.gen(function* () {
    const db = yield* openDbEffect();
    yield* Effect.async<void, ArchiveCacheError>((resume) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = () => resume(Effect.void);
      tx.onerror = () => resume(Effect.fail(new ArchiveCacheError({
        message: "IndexedDB clear failed",
        cause: tx.error,
      })));
    });
  });
}

export function clearArchiveCache(): Promise<void> {
  return Effect.runPromise(clearArchiveCacheEffect().pipe(
    Effect.tapError(() => Effect.sync(() => console.warn("clearArchiveCache: IndexedDB clear failed"))),
    Effect.catchAll(() => Effect.void)
  ));
}

// ---------------------------------------------------------------------------
// Twitch GraphQL
// ---------------------------------------------------------------------------

interface VodInfo {
  id: string;
  title: string;
  lengthSeconds: number;
  createdAt: string;
}

async function twitchGql(body: unknown, isCancelled: () => boolean): Promise<unknown> {
  const response = await fetchWithRetry(
    "https://gql.twitch.tv/gql",
    {
      method: "POST",
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    isCancelled
  );
  return response.json();
}

async function twitchListVods(channel: string, isCancelled: () => boolean, stopAfterSeen?: Set<string>): Promise<VodInfo[]> {
  const vods: VodInfo[] = [];
  let cursor: string | null = null;
  for (;;) {
    if (isCancelled()) break;
    const data = (await twitchGql(
      {
        query: `query {
      user(login: "${channel}") {
        videos(first: 100, type: ARCHIVE, sort: TIME${cursor ? `, after: "${cursor}"` : ""}) {
          edges { cursor node { id title lengthSeconds createdAt } }
          pageInfo { hasNextPage }
        }
      }
    }`,
      },
      isCancelled
    )) as {
      data?: {
        user?: {
          videos?: {
            edges: { cursor: string; node: { id: string; title: string; lengthSeconds: number; createdAt: string } }[];
            pageInfo: { hasNextPage: boolean };
          };
        };
      };
      errors?: { message: string }[];
    };
    if (data.errors?.length) throw new Error(data.errors[0].message);
    const videos = data.data?.user?.videos;
    const edges = videos?.edges ?? [];
    for (const e of edges) vods.push(e.node);
    // VODs are newest-first, so once a whole page is already ingested every
    // older VOD is too — stop paginating (used by incremental syncs).
    if (stopAfterSeen && edges.length > 0 && edges.every((e) => stopAfterSeen.has(e.node.id))) break;
    if (!videos?.pageInfo?.hasNextPage || edges.length === 0) break;
    const next = edges[edges.length - 1].cursor;
    if (!next || next === cursor) break;
    cursor = next;
  }
  return vods;
}

interface VodCommentEdge {
  node: {
    id: string;
    commenter?: { login?: string; displayName?: string };
    contentOffsetSeconds: number;
    createdAt: string;
    message?: { fragments?: { emote?: { id: string } | null; text?: string | null }[] };
  };
}

async function twitchVodCommentsPage(videoId: string, offset: number, isCancelled: () => boolean): Promise<{ edges: VodCommentEdge[]; hasNextPage: boolean }> {
  const raw = (await twitchGql(
    [
      {
        operationName: "VideoCommentsByOffsetOrCursor",
        variables: { videoID: videoId, contentOffsetSeconds: offset },
        extensions: {
          persistedQuery: { version: 1, sha256Hash: COMMENTS_HASH },
        },
      },
    ],
    isCancelled
  )) as {
    data?: {
      video?: {
        comments?: { edges: VodCommentEdge[]; pageInfo: { hasNextPage: boolean } };
      };
    };
    errors?: { message: string }[];
  }[];
  const result = raw[0];
  if (result.errors?.length) throw new Error(result.errors[0].message);
  const comments = result.data?.video?.comments;
  return { edges: comments?.edges ?? [], hasNextPage: comments?.pageInfo.hasNextPage ?? false };
}

async function fetchVodChat(
  vod: VodInfo,
  isCancelled: () => boolean,
  onBatch: (msgs: RawMessage[]) => void
): Promise<{ messages: number; pages: number }> {
  let offset = 0;
  let pages = 0;
  let messages = 0;
  const seen = new Set<string>();

  while (offset <= vod.lengthSeconds && !isCancelled()) {
    let edges: VodCommentEdge[];
    let hasNextPage: boolean;
    try {
      const page = await twitchVodCommentsPage(vod.id, offset, isCancelled);
      edges = page.edges;
      hasNextPage = page.hasNextPage;
    } catch {
      // One failed page (after backoff retries) must not kill the whole VOD:
      // keep whatever we already collected and move on.
      if (pages === 0) throw new Error(`Failed to fetch chat for VOD ${vod.id}`);
      break;
    }
    if (edges.length === 0) break;
    pages += 1;

    const batch: RawMessage[] = [];
    for (const edge of edges) {
      const { node } = edge;
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      const login = node.commenter?.login ?? "";
      const displayName = node.commenter?.displayName ?? login;
      const fragments = node.message?.fragments ?? [];
      let text = "";
      const twitchSpans: RawMessage["twitchSpans"] = [];
      for (const f of fragments) {
        const fragText = f.text ?? "";
        const start = text.length;
        text += fragText;
        if (f.emote?.id) {
          twitchSpans.push({ start, end: text.length, id: f.emote.id, name: fragText });
        }
      }
      if (!text.trim()) continue;
      messages += 1;
      batch.push({
        login,
        displayName,
        text,
        ts: edge.node.createdAt,
        vodId: vod.id,
        commentId: edge.node.id,
        twitchSpans,
      });
    }
    if (batch.length > 0) onBatch(batch);

    if (!hasNextPage) break;
    const lastOffset = edges.reduce((max, e) => Math.max(max, e.node.contentOffsetSeconds), 0);
    const nextOffset = Math.floor(lastOffset) + 1;
    if (nextOffset <= offset) break;
    offset = nextOffset;

    await sleep(REQUEST_DELAY_MS);
  }

  return { messages, pages };
}

// ---------------------------------------------------------------------------
// Zonian daily logs
// ---------------------------------------------------------------------------

export interface ZonianDay {
  year: string;
  month: string;
  day: string;
}

/**
 * Fetch one zonian endpoint with a retry policy tuned for the logs server,
 * which rate-limits aggressively (429) during bulk pulls. Backs off with
 * Retry-After when present, otherwise exponentially; a page only gives up
 * after a long budget so transient throttling can't silently drop a day.
 */
const ZONIAN_MAX_ATTEMPTS = 8;
const ZONIAN_429_BASE_MS = 500;
const ZONIAN_NETWORK_BASE_MS = 250;

interface ZonianRetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
}

let zonianRetryConfig: ZonianRetryConfig = { maxAttempts: ZONIAN_MAX_ATTEMPTS, baseDelayMs: ZONIAN_429_BASE_MS };

export function setZonianRetryConfig(config: Partial<ZonianRetryConfig>): void {
  zonianRetryConfig = { ...zonianRetryConfig, ...config };
}

async function zonianFetchPage(path: string, isCancelled: () => boolean): Promise<Response> {
  let lastError: unknown;
  const { maxAttempts, baseDelayMs } = zonianRetryConfig;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isCancelled()) throw new Error("cancelled");
    try {
      const response = await fetch(`${ZONIAN_BASE}${path}`);
      // Retry every transient failure (429 throttling and 5xx server errors)
      // with backoff; only a definitive response is passed through.
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(20000, baseDelayMs * 2 ** attempt + Math.random() * 500);
        await sleep(waitMs);
        continue;
      }
      return response;
    } catch (cause) {
      lastError = cause;
      await sleep(Math.min(20000, ZONIAN_NETWORK_BASE_MS * 2 ** attempt + Math.random() * 250));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`zonian fetch failed: ${path}`);
}

export async function zonianListDays(channel: string, isCancelled: () => boolean): Promise<ZonianDay[]> {
  try {
    const response = await zonianFetchPage(`/list?channel=${channel}`, isCancelled);
    if (!response.ok) return [];
    const data = (await response.json()) as {
      availableLogs?: ZonianDay[];
      available_logs?: ZonianDay[];
    };
    const days = data.availableLogs ?? data.available_logs ?? [];
    return days
      .map((d) => ({ year: String(d.year).padStart(4, "0"), month: String(d.month).padStart(2, "0"), day: String(d.day).padStart(2, "0") }))
      .sort((a, b) => `${b.year}-${b.month}-${b.day}`.localeCompare(`${a.year}-${a.month}-${a.day}`))
      .reverse();
  } catch {
    // Logs server unreachable -> let the Twitch VOD path take over.
    return [];
  }
}

interface ZonianMessage {
  text?: string;
  raw?: string;
  username?: string;
  display_name?: string;
  timestamp?: string;
  tags?: { emotes?: string };
}

interface ZonianFetchResult {
  messages: number;
  complete: boolean;
  nextOffset: number;
}

/**
 * Fetch every page of one zonian day. `complete` is true only when the whole
 * day (all pages) made it in — callers must NOT mark a day as ingested unless
 * complete, so a rate-limited day is retried on the next sync. On failure the
 * result reports `nextOffset` so the next sync can resume without re-reading
 * (and double-counting) the pages that were already ingested.
 */
export async function zonianFetchDay(
  channel: string,
  day: ZonianDay,
  isCancelled: () => boolean,
  onBatch: (msgs: RawMessage[]) => void,
  startOffset = 0
): Promise<ZonianFetchResult> {
  let offset = startOffset;
  let messages = 0;
  for (;;) {
    if (isCancelled()) break;
    const path = `/channel/${channel}/${day.year}/${day.month}/${day.day}?limit=1000&offset=${offset}&json`;
    let data: { messages?: ZonianMessage[] };
    try {
      const response = await zonianFetchPage(path, isCancelled);
      data = (await response.json()) as { messages?: ZonianMessage[] };
    } catch {
      // A page that never recovered (after the full 429/backoff budget) is not
      // fatal: keep everything already collected and report the day as
      // incomplete so a later sync resumes exactly where this one stopped.
      return { messages, complete: false, nextOffset: offset };
    }
    const page = data.messages ?? [];
    if (page.length === 0) {
      // Empty page: no more messages for this day.
      return { messages, complete: true, nextOffset: offset };
    }

    const batch: RawMessage[] = [];
    for (const m of page) {
      const text = m.text || m.raw || "";
      if (!text.trim()) continue;
      const login = (m.username ?? "").toLowerCase().trim();
      if (!login) continue;
      messages += 1;
      const twitchSpans = parseTwitchEmotePositions(m.tags?.emotes ?? "", text);
      batch.push({
        login,
        displayName: m.display_name || m.username || login,
        text,
        ts: m.timestamp ?? `${day.year}-${day.month}-${day.day}T00:00:00.000Z`,
        twitchSpans,
      });
    }
    if (batch.length > 0) onBatch(batch);

    if (page.length < 1000) {
      return { messages, complete: true, nextOffset: offset + page.length };
    }
    offset += page.length;
    await sleep(REQUEST_DELAY_MS);
  }
  return { messages, complete: false, nextOffset: offset };
}

function parseTwitchEmotePositions(tagsEmotes: string, text: string): RawMessage["twitchSpans"] {
  // IRC emote tags look like: "emoteid:0-5,9-14;emoteid2:20-25"
  const spans: RawMessage["twitchSpans"] = [];
  for (const chunk of tagsEmotes.split(";")) {
    const [id, positions] = chunk.split(":");
    if (!id || !positions) continue;
    for (const range of positions.split(",")) {
      const [startRaw, endRaw] = range.split("-");
      const start = parseInt(startRaw, 10);
      const end = parseInt(endRaw, 10);
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      const name = text.slice(start, end + 1);
      if (name) spans.push({ start, end: end + 1, id, name });
    }
  }
  return spans;
}

// ---------------------------------------------------------------------------
// Tokenizer & aggregation
// ---------------------------------------------------------------------------

export function buildMatchers(sets: { "7tv": Map<string, string>; bttv: Map<string, string>; ffz: Map<string, string> }): EmoteMatcher[] {
  const build = (
    map: Map<string, string>,
    kind: "7tv" | "twitch",
    kindLabel: string,
    caseInsensitive: boolean
  ): EmoteMatcher => {
    const names = [...map.keys()]
      .filter((n) => n.length >= 1)
      .sort((a, b) => b.length - a.length)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return {
      // Whole-token matching only: an emote like "o" or "s" must stand alone,
      // never match inside words ("no", "close", "OBS", "1oo7TV", ...).
      // 7TV/BTTV names are case-sensitive ("LO" vs "lo" are distinct emotes);
      // FFZ matches case-insensitively.
      regex:
        names.length > 0
          ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${names.join("|")})(?![\\p{L}\\p{N}_])`, `g${caseInsensitive ? "i" : ""}u`)
          : /(?!x)/g,
      kind,
      kindLabel,
      caseInsensitive,
      urlFor: (name) => map.get(name) ?? null,
    };
  };
  return [
    build(sets["7tv"], "7tv", "7TV Emote", false),
    build(sets.bttv, "twitch", "BTTV Emote", false),
    build(sets.ffz, "twitch", "FFZ Emote", true),
  ];
}

export interface EmoteSpan {
  start: number;
  end: number;
  kind: "7tv" | "twitch";
  kindLabel: string;
  name: string;
  url: string | null;
}

export function scanEmotes(text: string, matchers: EmoteMatcher[]): EmoteSpan[] {
  const spans: EmoteSpan[] = [];
  for (const m of matchers) {
    for (const match of text.matchAll(m.regex)) {
      const idx = match.index ?? 0;
      // Case-sensitive sets (7TV/BTTV) keep the exact typed name; FFZ
      // (case-insensitive) normalizes to lowercase so the stored name and
      // urlFor lookup stay canonical.
      const name = m.caseInsensitive ? match[0].toLowerCase() : match[0];
      if (name.length === 0) continue;
      spans.push({ start: idx, end: idx + name.length, kind: m.kind, kindLabel: m.kindLabel, name, url: m.urlFor(name) });
    }
  }
  // Greedy dedupe: longest spans win; break ties by 7TV > BTTV > FFZ priority.
  const priority = { "7tv": 0, twitch: 1 } as const;
  spans.sort((a, b) => b.end - b.start - (a.end - a.start) || priority[a.kind] - priority[b.kind]);
  const kept: EmoteSpan[] = [];
  for (const span of spans) {
    if (kept.some((k) => span.start < k.end && span.end > k.start)) continue;
    kept.push(span);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function extractWords(text: string, spans: EmoteSpan[]): string[] {
  const parts: string[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) parts.push(text.slice(cursor, span.start));
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  const words: string[] = [];
  for (const part of parts) {
    for (const token of part.toLowerCase().split(/[^\p{L}\p{N}_]+/u)) {
      if (token.length < 2 || token.length > 30) continue;
      if (STOP_WORDS.has(token)) continue;
      if (/^\d+$/.test(token)) continue;
      words.push(token);
    }
  }
  return words;
}

export function isEmoteSpam(words: string[]): boolean {
  if (words.length === 0) return true;
  if (words.length >= 6 && new Set(words).size / words.length < 0.35) return true;
  const lower = words.map((w) => w.toLowerCase());
  if (lower.length >= 4 && new Set(lower).size <= 2) return true;
  const counts = new Map<string, number>();
  for (const w of lower) counts.set(w, (counts.get(w) ?? 0) + 1);
  const top = Math.max(...counts.values());
  if (lower.length >= 5 && top / lower.length > 0.45) return true;
  return false;
}

export interface Aggregate {
  targets: Map<string, TargetAcc>;
  chatters: Map<string, ChatterAcc>;
  totalMessages: number;
  longest: LongestCandidate[];
  minDate: string;
  maxDate: string;
}

export function createAggregate(): Aggregate {
  return { targets: new Map(), chatters: new Map(), totalMessages: 0, longest: [], minDate: "", maxDate: "" };
}

/** Cheap live counters for the ingest overlay's secondary stats line. */
function computeLiveStats(agg: Aggregate): IngestLiveStats {
  let emotes = 0;
  let words = 0;
  for (const t of agg.targets.values()) {
    if (t.kind === "7tv" || t.kind === "twitch") emotes += 1;
    else if (t.kind === "word") words += 1;
  }
  return { messages: agg.totalMessages, chatters: agg.chatters.size, emotes, words };
}

function touchDate(agg: Aggregate, date: string) {
  if (!agg.minDate || date < agg.minDate) agg.minDate = date;
  if (!agg.maxDate || date > agg.maxDate) agg.maxDate = date;
}

export function ingestMessage(agg: Aggregate, msg: RawMessage, matchers: EmoteMatcher[]) {
  const login = msg.login.toLowerCase().trim();
  if (!login || !msg.text.trim() || isBot(login)) return;
  if (msg.text.trim().startsWith("!")) return;

  const twitchSpans: EmoteSpan[] = [];
  for (const s of msg.twitchSpans ?? []) {
    if (s.end > s.start && s.name.length > 0) twitchSpans.push({
      start: s.start,
      end: s.end,
      kind: "twitch" as const,
      kindLabel: "Twitch Emote",
      // Twitch emote matching is case-insensitive — normalize so "PogChamp"
      // and "pogchamp" (same emote id) aggregate into one target.
      name: s.name.toLowerCase(),
      url: `https://static-cdn.jtvnw.net/emoticons/v2/${s.id}/default/dark/2.0`,
    });
  }

  const thirdPartySpans = scanEmotes(msg.text, matchers);
  const allSpans = [...twitchSpans, ...thirdPartySpans].sort((a, b) => a.start - b.start);
  const words = extractWords(msg.text, allSpans);

  let chatter = agg.chatters.get(login);
  if (!chatter) {
    chatter = { login, displayName: msg.displayName || login, messages: 0, targets: new Map(), timeline: new Map(), firstSeen: msg.ts, lastSeen: msg.ts };
    agg.chatters.set(login, chatter);
  }
  chatter.messages += 1;
  if (msg.ts < chatter.firstSeen) chatter.firstSeen = msg.ts;
  if (msg.ts > chatter.lastSeen) chatter.lastSeen = msg.ts;
  const month = msg.ts.slice(0, 7);
  chatter.timeline.set(month, (chatter.timeline.get(month) ?? 0) + 1);
  touchDate(agg, month);

  const bumpTarget = (kind: "7tv" | "twitch" | "word", kindLabel: string, name: string, url: string | null) => {
    // Exact-name keys: 7TV/BTTV emotes are case-sensitive ("LO" vs "lo" are
    // distinct), words are pre-lowercased, Twitch/FFZ names are normalized.
    const key = `${kind}:${name}`;
    let target = agg.targets.get(key);
    if (!target) {
      target = { kind, kindLabel, name, total: 0, users: new Set(), url, perChatter: new Map() };
      agg.targets.set(key, target);
    }
    target.total += 1;
    target.users.add(login);
    target.perChatter.set(login, (target.perChatter.get(login) ?? 0) + 1);
    chatter.targets.set(key, (chatter.targets.get(key) ?? 0) + 1);
  };

  for (const span of allSpans) {
    bumpTarget(span.kind, span.kindLabel, span.name, span.url);
  }

  if (!isEmoteSpam(words)) {
    for (const word of words) {
      bumpTarget("word", "Word", word, null);
    }
  }

  agg.totalMessages += 1;
  if (msg.text.length >= 30 && !isEmoteSpam(words)) {
    agg.longest.push({
      login,
      displayName: msg.displayName || login,
      text: msg.text.trim(),
      length: msg.text.length,
      words: words.length,
      ts: msg.ts,
      vodId: msg.vodId,
    });
  }
}

// ---------------------------------------------------------------------------
// Aggregate serialization (incremental sync support)
// ---------------------------------------------------------------------------

interface SerializedTargetAcc {
  kind: TargetAcc["kind"];
  kindLabel: string;
  name: string;
  total: number;
  users: string[];
  url: string | null;
  perChatter: Record<string, number>;
}

interface SerializedChatterAcc {
  login: string;
  displayName: string;
  messages: number;
  targets: Record<string, number>;
  timeline: Record<string, number>;
  firstSeen: string;
  lastSeen: string;
}

export interface SerializedAggregate {
  version: 1;
  totalMessages: number;
  minDate: string;
  maxDate: string;
  targets: Record<string, SerializedTargetAcc>;
  chatters: Record<string, SerializedChatterAcc>;
  /** Longest-message candidates (capped; enough to recompute the top 100 exactly). */
  longest: LongestCandidate[];
}

// The archive builder only keeps the top 100 longest messages. Keeping the
// top 200 candidates is provably sufficient to recompute that top 100 after
// merging in new messages (the global top 100 is a subset of the old top 100
// ∪ new candidates), while keeping the cache far smaller than the full corpus.
const MAX_LONGEST_CANDIDATES = 200;

export function serializeAggregate(agg: Aggregate): SerializedAggregate {
  const targets: SerializedAggregate["targets"] = {};
  for (const [key, t] of agg.targets) {
    targets[key] = {
      kind: t.kind,
      kindLabel: t.kindLabel,
      name: t.name,
      total: t.total,
      users: [...t.users],
      url: t.url,
      perChatter: Object.fromEntries(t.perChatter),
    };
  }
  const chatters: SerializedAggregate["chatters"] = {};
  for (const [login, c] of agg.chatters) {
    chatters[login] = {
      login: c.login,
      displayName: c.displayName,
      messages: c.messages,
      targets: Object.fromEntries(c.targets),
      timeline: Object.fromEntries(c.timeline),
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
    };
  }
  return {
    version: 1,
    totalMessages: agg.totalMessages,
    minDate: agg.minDate,
    maxDate: agg.maxDate,
    targets,
    chatters,
    longest: [...agg.longest].sort((a, b) => b.length - a.length).slice(0, MAX_LONGEST_CANDIDATES),
  };
}

export function deserializeAggregate(serialized: SerializedAggregate): Aggregate {
  const agg = createAggregate();
  agg.totalMessages = serialized.totalMessages;
  agg.minDate = serialized.minDate;
  agg.maxDate = serialized.maxDate;
  for (const [key, t] of Object.entries(serialized.targets)) {
    agg.targets.set(key, {
      kind: t.kind,
      kindLabel: t.kindLabel,
      name: t.name,
      total: t.total,
      users: new Set(t.users),
      url: t.url,
      perChatter: new Map(Object.entries(t.perChatter)),
    });
  }
  for (const [login, c] of Object.entries(serialized.chatters)) {
    agg.chatters.set(login, {
      login: c.login,
      displayName: c.displayName,
      messages: c.messages,
      targets: new Map(Object.entries(c.targets)),
      timeline: new Map(Object.entries(c.timeline)),
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
    });
  }
  agg.longest = serialized.longest;
  return agg;
}

// ---------------------------------------------------------------------------
// Archive builder
// ---------------------------------------------------------------------------

export function buildArchive(channel: string, agg: Aggregate, meta: { twitchId: string; avatarUrl?: string; seData: DynamicStreamerData }): DynamicStreamerData {
  const chattersSorted = [...agg.chatters.values()]
    .filter((c) => !isBot(c.login))
    .sort((a, b) => b.messages - a.messages);
  const chatters: Choice[] = chattersSorted.slice(0, 10000).map((c) => ({
    login: c.login,
    displayName: c.displayName,
    messages: c.messages,
  }));

  const targets: TopTarget[] = [...agg.targets.values()]
    .filter((t) => t.total > 0 && !(t.kind === "word" && (t.name.length < 3 || STOP_WORDS.has(t.name.toLowerCase()))))
    .sort((a, b) => b.total - a.total)
    .map((t) => ({
      kind: t.kind,
      kindLabel: t.kindLabel,
      name: t.name,
      total: t.total,
      users: t.users.size,
      url: t.url,
    }));

  const displayNameFor = new Map<string, string>();
  for (const c of chattersSorted) displayNameFor.set(c.login, c.displayName);

  const leaderboards: Record<string, LeaderboardEntry[]> = {};
  for (const t of agg.targets.values()) {
    if (t.users.size < 1) continue;
    const entries: LeaderboardEntry[] = [...t.perChatter.entries()]
      .filter(([login]) => !isBot(login))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200)
      .map(([login, count]) => ({
        login,
        displayName: displayNameFor.get(login) ?? login,
        count,
      }));
    if (entries.length >= 1) {
      leaderboards[`${t.kind}:${t.name}`] = entries;
    }
  }

  const longestMessages: LongestMessage[] = agg.longest
    .filter((m) => !isBot(m.login))
    .sort((a, b) => b.length - a.length)
    .slice(0, 100)
    .map((m, i) => ({
      rank: i + 1,
      login: m.login,
      displayName: m.displayName,
      text: m.text,
      length: m.length,
      words: m.words,
      createdAt: m.ts,
      vodId: m.vodId,
    }));

  const emoteTargets = targets.filter((t) => t.kind === "7tv" || t.kind === "twitch");

  // [dbg] Emote target breakdown: total, per-kind counts, and case-variants
  // that look like the same emote but were counted separately.
  {
    const byKind: Record<string, number> = {};
    for (const t of emoteTargets) byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
    const caseDupes = new Map<string, Set<string>>();
    for (const t of emoteTargets) {
      const key = t.name.toLowerCase();
      const s = caseDupes.get(key) ?? new Set<string>();
      s.add(t.name);
      caseDupes.set(key, s);
    }
    const dupes = [...caseDupes.entries()].filter(([, names]) => names.size > 1);
    console.log(
      `[dbg] buildArchive #${channel}: totalMsgs=${agg.totalMessages} emotes=${emoteTargets.length} byKind=${JSON.stringify(byKind)} caseVariants=${dupes.length}`,
      dupes.slice(0, 25).map(([key, names]) => `${key}: [${[...names].join(", ")}]`)
    );
  }

  const chatterProfiles: Record<string, ChatterProfile> = {};
  for (let i = 0; i < chattersSorted.slice(0, 500).length; i++) {
    const c = chattersSorted[i];
    if (isBot(c.login)) continue;
    const targetEntries = [...c.targets.entries()]
      .map(([key, count]) => {
        const t = agg.targets.get(key);
        return t ? { t, count } : null;
      })
      .filter((x): x is { t: TargetAcc; count: number } => x !== null)
      .sort((a, b) => b.count - a.count);

    let emotesCount = 0;
    let wordsCount = 0;
    const uniqueEmotes = new Set<string>();
    const uniqueWords = new Set<string>();
    for (const { t, count } of targetEntries) {
      if (t.kind === "word") {
        wordsCount += count;
        uniqueWords.add(t.name.toLowerCase());
      } else {
        emotesCount += count;
        uniqueEmotes.add(t.name.toLowerCase());
      }
    }
    const targetTokens = emotesCount + wordsCount;
    const messages = Math.max(1, c.messages);

    chatterProfiles[c.login] = {
      rank: i + 1,
      login: c.login,
      displayName: c.displayName,
      messages: c.messages,
      topTargets: targetEntries.slice(0, 8).map(({ t, count }) => ({
        kind: t.kind,
        name: t.name,
        count,
        url: t.url,
      })),
      breakdown: {
        emotesCount,
        wordsCount,
        emoteShare: targetTokens > 0 ? Number(((emotesCount / targetTokens) * 100).toFixed(1)) : 0,
        wordShare: targetTokens > 0 ? Number(((wordsCount / targetTokens) * 100).toFixed(1)) : 0,
        emotesPerMsg: Number((emotesCount / messages).toFixed(2)),
        wordsPerMsg: Number((wordsCount / messages).toFixed(2)),
        emotesPer100Words: wordsCount > 0 ? Number(((emotesCount / wordsCount) * 100).toFixed(1)) : 0,
        uniqueEmotes: uniqueEmotes.size,
        uniqueWords: uniqueWords.size,
      },
      timeline: [...c.timeline.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([period, n]) => ({ period, messages: n })),
    };
  }

  const chatterLoreMatchups: ChatterLoreMatchup[] = [];
  let matchupRank = 1;
  for (const c of chattersSorted.slice(0, 40)) {
    if (isBot(c.login)) continue;
    const top = [...c.targets.entries()]
      .map(([key, count]) => ({ key, count, t: agg.targets.get(key) }))
      .filter((x): x is { key: string; count: number; t: TargetAcc } => x.t !== undefined)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    for (const { t, count } of top) {
      if (count < 5) continue;
      // Trivia and matchups skip short filler words
      if (t.kind === "word" && (t.name.length < 5 || STOP_WORDS.has(t.name.toLowerCase()))) continue;
      chatterLoreMatchups.push({
        rank: matchupRank++,
        login: c.login,
        displayName: c.displayName,
        targetKind: t.kind,
        targetName: t.name,
        targetUrl: t.url,
        count,
        metric: "uses",
      });
    }
  }

  const feudCategories: FeudCategory[] = [];
  const topEmotes = emoteTargets.slice(0, 10);
  const topChatters = chatters.slice(0, 10);
  feudCategories.push(
    {
      id: "top-emotes",
      title: "Top Channel Emotes",
      prompt: `What are the top 10 most-used emotes in #${channel}?`,
      answers: topEmotes.map((e, i) => ({ rank: i + 1, kind: e.kind, name: e.name, count: e.total, url: e.url })),
    },
    {
      id: "top-chatters",
      title: "All-Time Top Chatters",
      prompt: `Who are the top 10 most active chatters in #${channel}?`,
      answers: topChatters.map((c, i) => ({ rank: i + 1, kind: "chatter", name: c.displayName, count: c.messages ?? 0 })),
    }
  );
  for (const target of emoteTargets.slice(0, 5)) {
    const lb = (leaderboards[`${target.kind}:${target.name}`] ?? []).filter((r) => !isBot(r.login));
    if (!lb || lb.length < 6) continue;
    feudCategories.push({
      id: `target-${target.kind}-${target.name}`,
      title: `Who typed "${target.name}"?`,
      prompt: `Who are the top chatters that typed the emote "${target.name}" in #${channel}?`,
      answers: lb.slice(0, 10).map((r, i) => ({ rank: i + 1, kind: "chatter", name: r.displayName, count: r.count, url: target.url })),
    });
  }

  const higherLowerItems: HigherLowerItem[] = targets.slice(0, 100).map((t, idx) => ({
    id: `${t.name}-${idx}`,
    name: t.name,
    kind: t.kind,
    kindLabel: t.kindLabel,
    total: t.total,
    url: t.url,
    rank: idx + 1,
  }));

  const stats: StatsData = {
    chatters: chattersSorted.length,
    messages: agg.totalMessages,
    targets: targets.length,
    dateRange: agg.minDate && agg.maxDate ? `${agg.minDate} – ${agg.maxDate}` : "Channel chat archive",
    topChatters: chatters.slice(0, 25).map((c) => ({
      login: c.login,
      displayName: c.displayName,
      messages: c.messages ?? 0,
      percentage: agg.totalMessages > 0 ? Number((((c.messages ?? 0) / agg.totalMessages) * 100).toFixed(2)) : 0,
    })),
    topEmotes: topEmotes.map((t) => ({ kind: t.kind, name: t.name, total: t.total, url: t.url })),
    rarestEmotes: emoteTargets.slice(-20).map((t) => ({ kind: t.kind, name: t.name, total: t.total, url: t.url })),
  };

  return {
    channel,
    twitchId: meta.twitchId,
    avatarUrl: meta.avatarUrl,
    emotesCount: emoteTargets.length,
    targets,
    questions: [],
    higherLowerItems,
    chatters,
    feudCategories,
    longestMessages,
    chatterLoreMatchups,
    chatterProfiles,
    stats,
    // The StreamElements blob is carried into archives so the SE tab on the
    // Lexicon keeps working. It is purely informational: game modes and every
    // chatter/emote calculation still come exclusively from ingested chat.
    streamelements:
      meta.seData?.streamelements ?? {
        stats: { messages: 0, chatters: 0, emotes: 0, commands: 0 },
        chatters: [],
        emotes: { "7tv": [], twitch: [], bttv: [], ffz: [] },
        commands: [],
      },
    leaderboards,
    loadedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function buildChatArchive(
  channel: string,
  seData: DynamicStreamerData,
  onProgress: (p: IngestProgress) => void,
  isCancelled: () => boolean
): Promise<CachedArchive> {
  const agg = createAggregate();
  let source: "zonian" | "vods" = "vods";
  let videos = 0;
  let days = 0;
  const completedDays: string[] = [];
  const partialDayOffsets: Record<string, number> = {};
  const dayOffsets: Record<string, number> = {};
  const ingestedVodIds: string[] = [];

  // The loader's main line stays locked to the current fetch stage; batch
  // updates only tick the secondary live stats (messages/chatters/emotes) so
  // the progress bar and stage never flap between "Fetching…" and
  // "Analyzing messages" mid-day. Counters are shared across the concurrent
  // day fetchers so the reported progress is monotonic and consistent.
  let fetchStage = "Analyzing messages";
  let fetchCurrent = 0;
  let fetchTotal = 0;
  let fetchDetail = "";
  let daysStarted = 0;
  let daysCompleted = 0;

  const emitProgress = (stage: string, current: number, total: number, detail: string) => {
    fetchStage = stage;
    fetchCurrent = current;
    fetchTotal = total;
    fetchDetail = detail;
    onProgress({ status: "ingesting", stage, current, total, detail, live: computeLiveStats(agg) });
  };

  const handleBatch = () => {
    if (isCancelled()) return;
    onProgress({
      status: "ingesting",
      stage: fetchStage,
      current: fetchCurrent,
      total: fetchTotal,
      detail: fetchDetail,
      live: computeLiveStats(agg),
    });
  };

  const emoteSets = await fetchEmoteSets(seData.twitchId, isCancelled);
  const matchers = buildMatchers(emoteSets);

  // Source A: zonian daily logs (concurrent with limit)
  const zonianDays = await zonianListDays(channel, isCancelled);
  if (zonianDays.length > 0) {
    source = "zonian";
    days = zonianDays.length;

    const fetchDay = async (day: ZonianDay) => {
      if (isCancelled()) return;
      daysStarted += 1;
      emitProgress(
        `Fetching ${channel} chat logs (zonian)`,
        daysCompleted,
        zonianDays.length,
        `Day ${daysStarted}/${zonianDays.length} · ${day.year}-${day.month}-${day.day} (${agg.totalMessages.toLocaleString()} msgs)`
      );
      const result = await zonianFetchDay(channel, day, isCancelled, (batch) => {
        for (const msg of batch) ingestMessage(agg, msg, matchers);
        handleBatch();
      });
      const key = `${day.year}-${day.month}-${day.day}`;
      // Track how many messages were ingested for this day (the resume offset)
      // so a later incremental sync can re-fetch the live day's growing tail.
      dayOffsets[key] = result.nextOffset;
      // Only a fully-fetched day counts as ingested. A rate-limited day stays
      // out of `ingestedDays` (with its resume offset recorded) so the next
      // incremental sync finishes it instead of silently losing its messages.
      if (result.complete) {
        completedDays.push(key);
        daysCompleted += 1;
        delete partialDayOffsets[key];
      } else {
        partialDayOffsets[key] = result.nextOffset;
      }
      await sleep(REQUEST_DELAY_MS);
    };

    await withConcurrency(zonianDays, 3, fetchDay);
  }

  // Source B: Twitch VOD chat — used when there are no zonian logs, or when
  // zonian came back empty/failed. Individual VOD failures are skipped; the
  // archive is built from whatever survived.
  if (zonianDays.length === 0 || agg.totalMessages === 0) {
    source = "vods";
    onProgress({ status: "ingesting", stage: "Listing VODs", current: 0, total: 0, detail: `Looking up recent VODs for #${channel}` });
    const vods = (await twitchListVods(channel, isCancelled)).filter((v) => v.lengthSeconds > 0);
    if (vods.length === 0 && agg.totalMessages === 0) {
      throw new Error("No VODs or chat logs found for this channel.");
    }
    videos = vods.length;
    let failedVods = 0;
    for (let i = 0; i < vods.length; i++) {
      if (isCancelled()) break;
      const vod = vods[i];
      const hours = (vod.lengthSeconds / 3600).toFixed(1);
      emitProgress(
        "Fetching VOD chat (Twitch)",
        i,
        vods.length,
        `VOD ${i + 1}/${vods.length} · ${hours}h · ${vod.title.slice(0, 30)} (${agg.totalMessages.toLocaleString()} msgs)`
      );
      try {
        await fetchVodChat(vod, isCancelled, (batch) => {
          for (const msg of batch) ingestMessage(agg, msg, matchers);
          handleBatch();
        });
        ingestedVodIds.push(vod.id);
      } catch {
        failedVods += 1;
      }
      await sleep(REQUEST_DELAY_MS);
    }
    if (agg.totalMessages === 0 && failedVods === vods.length) {
      throw new Error("Couldn't fetch chat from this channel's VODs (retries exhausted). Please try again.");
    }
  }

  if (isCancelled()) throw new Error("cancelled");
  if (agg.totalMessages === 0) throw new Error("No chat messages could be fetched for this channel.");

  onProgress({ status: "ingesting", stage: "Building archive", current: 1, total: 1, detail: "Compiling leaderboards, profiles, trivia…", live: computeLiveStats(agg) });
  const data = buildArchive(channel, agg, { twitchId: seData.twitchId, avatarUrl: seData.avatarUrl, seData });

  return {
    channel,
    builtAt: Date.now(),
    source,
    videos,
    days,
    messages: agg.totalMessages,
    data,
    ingestedDays: completedDays,
    partialOffsets: partialDayOffsets,
    dayOffsets,
    vodIds: ingestedVodIds,
    aggregate: serializeAggregate(agg),
  };
}

/**
 * Incremental sync: fetch only the chat that is missing from an existing
 * cached archive (new zonian days, or VODs that appeared since) and merge it
 * into the cached aggregate, rebuilding the same DynamicStreamerData shape.
 *
 * Returns the refreshed archive, or null when there is nothing new to fetch
 * (so the existing cache can keep serving). Archives without a serialized
 * aggregate cannot be diffed and return null — callers should fall back to a
 * one-time full rebuild in that case.
 *
 * Rate-limited days/VODs that don't finish on the first pass are retried in
 * a few rounds (a fresh attempt that resumes exactly where it stopped), so
 * transient throttling can't permanently strand data. Whatever is still
 * incomplete is carried forward in `partialOffsets` — callers are expected to
 * re-run this sync (bypassing any TTL) until it clears.
 */
const MAX_SYNC_ROUNDS = 5;
const SYNC_ROUND_DELAY_MS = 10000;

export async function incrementalArchiveUpdate(
  channel: string,
  cached: CachedArchive,
  seData: DynamicStreamerData,
  onProgress: (p: IngestProgress) => void,
  isCancelled: () => boolean
): Promise<CachedArchive | null> {
  if (!cached.aggregate) return null;

  const agg = deserializeAggregate(cached.aggregate);
  console.log(
    `[dbg] incremental #${channel}: cached msgs=${cached.messages} deserialized msgs=${agg.totalMessages} targets=${agg.targets.size} chatters=${agg.chatters.size} longest=${agg.longest.length}`
  );
  const emoteSets = await fetchEmoteSets(seData.twitchId, isCancelled);
  const matchers = buildMatchers(emoteSets);
  let days = cached.days;
  let videos = cached.videos;
  const ingestedDays = new Set(cached.ingestedDays ?? []);
  const ingestedVodIds = new Set(cached.vodIds ?? []);
  const partialOffsets: Record<string, number> = { ...(cached.partialOffsets ?? {}) };
  const dayOffsets: Record<string, number> = { ...(cached.dayOffsets ?? {}) };

  if (cached.source === "zonian") {
    const zonianDays = await zonianListDays(channel, isCancelled);
    if (zonianDays.length === 0) return null;
    days = zonianDays.length;
    const keyOf = (d: ZonianDay) => `${d.year}-${d.month}-${d.day}`;

    // Resume offset for a day: partial days continue from their last recorded
    // progress; fully-ingested days resume from how many messages were already
    // merged (so re-fetching never re-reads — or double-counts — old pages).
    const resumeOf = (key: string) => partialOffsets[key] ?? dayOffsets[key] ?? 0;

    // The most recent day is the live/current one: its log keeps growing while
    // the stream is up, so ALWAYS re-check it (resuming from its offset) even
    // though it was already marked ingested. Past days are immutable and are
    // only fetched when missing or partial. A fully-ingested live day is only
    // re-checked when we have a recorded offset to resume from — otherwise we
    // can't tell which messages are already merged, so we skip it rather than
    // double-count its whole day. Days successfully re-checked this sync are
    // done for this call (the tail won't be re-read every retry round).
    let latestKey: string | null = null;
    for (const d of zonianDays) {
      const k = keyOf(d);
      if (!latestKey || k > latestKey) latestKey = k;
    }
    const doneThisSync = new Set<string>();
    const needsFetch = (d: ZonianDay) => {
      const key = keyOf(d);
      if (doneThisSync.has(key)) return false;
      if (!ingestedDays.has(key)) return true;
      if (key !== latestKey) return false;
      return dayOffsets[key] !== undefined;
    };

    // Fetch one day, resuming from where a previous partial attempt stopped;
    // the messages already merged into the aggregate are never re-read, so no
    // double counting. Only a fully-fetched day is marked ingested.
    const syncDay = async (day: ZonianDay, index: number, total: number) => {
      if (isCancelled()) return false;
      const key = keyOf(day);
      onProgress({
        status: "ingesting",
        stage: "Fetching new chat logs (zonian)",
        current: index,
        total,
        detail: `Day ${index + 1}/${total} · ${key} (${agg.totalMessages.toLocaleString()} msgs so far)`,
      });
      const result = await zonianFetchDay(channel, day, isCancelled, (batch) => {
        for (const msg of batch) ingestMessage(agg, msg, matchers);
      }, resumeOf(key));
      dayOffsets[key] = result.nextOffset;
      if (result.complete) {
        ingestedDays.add(key);
        delete partialOffsets[key];
        doneThisSync.add(key);
      } else {
        partialOffsets[key] = result.nextOffset;
      }
      await sleep(REQUEST_DELAY_MS);
      return result.complete;
    };

    let pending = zonianDays.filter(needsFetch);
    if (pending.length === 0) return null;

    let round = 0;
    while (pending.length > 0 && round < MAX_SYNC_ROUNDS && !isCancelled()) {
      onProgress({
        status: "ingesting",
        stage: "Fetching new chat logs (zonian)",
        current: round + 1,
        total: MAX_SYNC_ROUNDS,
        detail: `Round ${round + 1}/${MAX_SYNC_ROUNDS} · ${pending.length} day${pending.length === 1 ? "" : "s"} still rate-limited`,
      });
      if (round > 0) await sleep(SYNC_ROUND_DELAY_MS);
      for (let i = 0; i < pending.length; i++) {
        if (isCancelled()) break;
        await syncDay(pending[i], i, pending.length);
      }
      pending = zonianDays.filter(needsFetch);
      round += 1;
    }
    if (agg.totalMessages === cached.messages) return null;
  } else {
    const vods = (await twitchListVods(channel, isCancelled, ingestedVodIds)).filter((v) => v.lengthSeconds > 0);
    const newVods = vods.filter((v) => !ingestedVodIds.has(v.id));
    if (newVods.length === 0) return null;

    const syncVod = async (vod: VodInfo, index: number, total: number) => {
      if (isCancelled()) return false;
      const hours = (vod.lengthSeconds / 3600).toFixed(1);
      onProgress({
        status: "ingesting",
        stage: "Fetching new VOD chat (Twitch)",
        current: index,
        total,
        detail: `VOD ${index + 1}/${total} · ${hours}h · ${vod.title.slice(0, 30)} (${agg.totalMessages.toLocaleString()} msgs)`,
      });
      try {
        await fetchVodChat(vod, isCancelled, (batch) => {
          for (const msg of batch) ingestMessage(agg, msg, matchers);
        });
        ingestedVodIds.add(vod.id);
        return true;
      } catch {
        // Keep whatever survived; the VOD stays un-marked so a later round
        // (or the next sync) retries it.
        return false;
      } finally {
        await sleep(REQUEST_DELAY_MS);
      }
    };

    let pending = newVods;
    let round = 0;
    while (pending.length > 0 && round < MAX_SYNC_ROUNDS && !isCancelled()) {
      if (round > 0) await sleep(SYNC_ROUND_DELAY_MS);
      for (let i = 0; i < pending.length; i++) {
        if (isCancelled()) break;
        await syncVod(pending[i], i, pending.length);
      }
      pending = vods.filter((v) => !ingestedVodIds.has(v.id));
      round += 1;
    }
    if (agg.totalMessages === cached.messages) return null;
  }

  if (isCancelled()) throw new Error("cancelled");

  onProgress({
    status: "ingesting",
    stage: "Merging new messages",
    current: 1,
    total: 1,
    detail: "Rebuilding leaderboards, profiles, trivia…",
  });
  const data = buildArchive(channel, agg, { twitchId: seData.twitchId, avatarUrl: seData.avatarUrl, seData });
  console.log(
    `[dbg] incremental #${channel} MERGED: cached msgs=${cached.messages} -> new msgs=${agg.totalMessages} (+${agg.totalMessages - cached.messages}) targets=${agg.targets.size}`
  );

  return {
    channel,
    builtAt: Date.now(),
    source: cached.source,
    videos,
    days,
    messages: agg.totalMessages,
    data,
    ingestedDays: [...ingestedDays],
    partialOffsets,
    dayOffsets,
    vodIds: [...ingestedVodIds],
    aggregate: serializeAggregate(agg),
  };
}
