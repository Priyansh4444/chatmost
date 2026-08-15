interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

type Kind = "word" | "twitch" | "7tv";

const KIND_LABEL: Record<Kind, string> = {
  word: "word",
  twitch: "Twitch emote",
  "7tv": "7TV emote",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const bad = (message: string) => json({ error: message }, 400);

async function randomTarget(db: D1Database, kind: Kind | null): Promise<{ kind: Kind; name: string; total: number } | null> {
  // Prefer emotes: 60% of the time pick an emote kind.
  const pickedKind: Kind =
    kind ?? (Math.random() < 0.6 ? (Math.random() < 0.5 ? "7tv" : "twitch") : "word");

  const result = await db
    .prepare(
      "SELECT name, total FROM targets WHERE kind = ?1 AND total >= 15 AND users >= 3 ORDER BY RANDOM() LIMIT 1"
    )
    .bind(pickedKind)
    .first<{ name: string; total: number }>();

  if (result) return { kind: pickedKind, name: result.name, total: result.total };
  if (kind) return null;
  // Fall back to any kind if the preferred one is empty.
  const any = await db
    .prepare("SELECT kind, name, total FROM targets WHERE total >= 15 AND users >= 3 ORDER BY RANDOM() LIMIT 1")
    .first<{ kind: Kind; name: string; total: number }>();
  return any;
}

async function leaderboard(db: D1Database, kind: string, name: string, limit: number) {
  const rows = await db
    .prepare(
      `SELECT c.login, ch.display_name, c.n
       FROM counts c JOIN chatters ch ON ch.login = c.login
       WHERE c.kind = ?1 AND c.name = ?2
       ORDER BY c.n DESC LIMIT ?3`
    )
    .bind(kind, name, limit)
    .all<{ login: string; display_name: string; n: number }>();
  return rows.results;
}

async function emoteUrl(db: D1Database, kind: string, name: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT url FROM emotes WHERE kind = ?1 AND name = ?2")
    .bind(kind, name)
    .first<{ url: string }>();
  return row?.url && row.url.length ? row.url : null;
}

async function handler(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // API routes
  if (path === "/api/question") {
    const kindParam = url.searchParams.get("kind") as Kind | null;
    if (kindParam && !(kindParam in KIND_LABEL)) return bad("kind must be word|twitch|7tv");
    const target = await randomTarget(env.DB, kindParam);
    if (!target) return json({ error: "no questions available" }, 404);

    const [top, options, emote] = await Promise.all([
      leaderboard(env.DB, target.kind, target.name, 20),
      env.DB
        .prepare("SELECT login, display_name FROM chatters WHERE messages >= 5 ORDER BY RANDOM() LIMIT 60")
        .all<{ login: string; display_name: string }>(),
      emoteUrl(env.DB, target.kind, target.name),
    ]);
    if (top.length === 0) return json({ error: "no data for target" }, 404);

    const answer = top[0];
    const decoys = options.results
      .filter((c) => c.login !== answer.login)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const choices = [answer, ...decoys].sort(() => Math.random() - 0.5);

    return json({
      target: {
        kind: target.kind,
        kindLabel: KIND_LABEL[target.kind],
        name: target.name,
        url: emote,
        totalUses: target.total,
      },
      answer: { login: answer.login, displayName: answer.display_name },
      choices: choices.map((c) => ({ login: c.login, displayName: c.display_name })),
      leaderboard: top.map((r) => ({ login: r.login, displayName: r.display_name, count: r.n })),
    });
  }

  if (path === "/api/leaderboard") {
    const kind = url.searchParams.get("kind");
    const name = url.searchParams.get("name");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "25", 10) || 25, 100);
    if (!kind || !name) return bad("need kind and name");
    const [rows, emote] = await Promise.all([
      leaderboard(env.DB, kind, name, limit),
      emoteUrl(env.DB, kind, name),
    ]);
    const totalRow = await env.DB.prepare("SELECT SUM(n) AS total FROM counts WHERE kind = ?1 AND name = ?2")
      .bind(kind, name)
      .first<{ total: number }>();
    return json({
      kind,
      kindLabel: KIND_LABEL[kind as Kind] ?? kind,
      name,
      url: emote,
      totalUses: totalRow?.total ?? 0,
      entries: rows.map((r) => ({ login: r.login, displayName: r.display_name, count: r.n })),
    });
  }

  if (path === "/api/search") {
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const kindParam = url.searchParams.get("kind");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10) || 30, 100);
    if (!q) return bad("need q");
    let stmt: D1PreparedStatement;
    if (kindParam && kindParam in KIND_LABEL) {
      stmt = env.DB.prepare(
        "SELECT t.kind, t.name, t.total, t.users FROM targets t WHERE t.kind = ?1 AND t.name LIKE ?2 ORDER BY t.total DESC LIMIT ?3"
      ).bind(kindParam, `%${q}%`, limit);
    } else {
      stmt = env.DB.prepare(
        "SELECT t.kind, t.name, t.total, t.users FROM targets t WHERE t.name LIKE ?1 ORDER BY t.total DESC LIMIT ?2"
      ).bind(`%${q}%`, limit);
    }
    const rows = await stmt.all<{ kind: string; name: string; total: number; users: number }>();
    const results = await Promise.all(
      rows.results.map(async (r) => ({
        ...r,
        kindLabel: KIND_LABEL[r.kind as Kind] ?? r.kind,
        url: await emoteUrl(env.DB, r.kind, r.name),
      }))
    );
    return json(results);
  }

  if (path === "/api/stats") {
    const [chatters, messages, targets] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM chatters").first<{ n: number }>(),
      env.DB.prepare("SELECT SUM(messages) AS n FROM chatters").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM targets").first<{ n: number }>(),
    ]);
    const topChatters = await env.DB.prepare(
      "SELECT login, display_name, messages FROM chatters ORDER BY messages DESC LIMIT 10"
    ).all<{ login: string; display_name: string; messages: number }>();
    const topEmotes = await env.DB.prepare(
      "SELECT kind, name, total FROM targets WHERE kind IN ('7tv','twitch') ORDER BY total DESC LIMIT 10"
    ).all<{ kind: string; name: string; total: number }>();
    const topEmotesWithUrl = await Promise.all(
      topEmotes.results.map(async (r) => ({ ...r, url: await emoteUrl(env.DB, r.kind, r.name) }))
    );
    return json({
      chatters: chatters?.n ?? 0,
      messages: messages?.n ?? 0,
      targets: targets?.n ?? 0,
      topChatters: topChatters.results.map((r) => ({ login: r.login, displayName: r.display_name, messages: r.messages })),
      topEmotes: topEmotesWithUrl,
    });
  }

  if (path === "/api/top") {
    const kind = url.searchParams.get("kind") as Kind | null;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
    if (kind && !(kind in KIND_LABEL)) return bad("kind must be word|twitch|7tv");
    let stmt: D1PreparedStatement;
    if (kind) {
      stmt = env.DB.prepare("SELECT kind, name, total, users FROM targets WHERE kind = ?1 ORDER BY total DESC LIMIT ?2").bind(kind, limit);
    } else {
      stmt = env.DB.prepare("SELECT kind, name, total, users FROM targets ORDER BY total DESC LIMIT ?1").bind(limit);
    }
    const rows = await stmt.all<{ kind: string; name: string; total: number; users: number }>();
    const results = await Promise.all(
      rows.results.map(async (r) => ({
        ...r,
        kindLabel: KIND_LABEL[r.kind as Kind] ?? r.kind,
        url: await emoteUrl(env.DB, r.kind, r.name),
      }))
    );
    return json(results);
  }

  // Serve the React app (static assets); fall through to the asset handler.
  return env.ASSETS.fetch(request);
}

export default {
  fetch: handler,
};
