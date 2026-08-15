use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;

pub struct Db {
    conn: Connection,
}

pub const KIND_WORD: &str = "word";
pub const KIND_TWITCH: &str = "twitch";
pub const KIND_SEVENTV: &str = "7tv";

impl Db {
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             CREATE TABLE IF NOT EXISTS counts (
               kind TEXT NOT NULL,
               name  TEXT NOT NULL,
               login TEXT NOT NULL,
               n     INTEGER NOT NULL DEFAULT 0,
               PRIMARY KEY (kind, name, login)
             ) WITHOUT ROWID;
             CREATE INDEX IF NOT EXISTS idx_counts_name ON counts(kind, name, n DESC);
             CREATE TABLE IF NOT EXISTS chatters (
               login TEXT PRIMARY KEY,
               display_name TEXT NOT NULL,
               messages INTEGER NOT NULL DEFAULT 0
             ) WITHOUT ROWID;
             CREATE TABLE IF NOT EXISTS days_done (
               day TEXT PRIMARY KEY
             ) WITHOUT ROWID;
             CREATE TABLE IF NOT EXISTS emotes (
               kind TEXT NOT NULL,
               name  TEXT NOT NULL,
               url   TEXT NOT NULL DEFAULT '',
               PRIMARY KEY (kind, name)
             ) WITHOUT ROWID;
             CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);",
        )?;
        Ok(Self { conn })
    }

    pub fn set_meta(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    /// Record that `login` sent a message.
    pub fn touch_chatter(&self, login: &str, display_name: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO chatters (login, display_name, messages)
             VALUES (?1, ?2, 1)
             ON CONFLICT(login) DO UPDATE SET
               display_name = excluded.display_name,
               messages = chatters.messages + 1",
            params![login, display_name],
        )?;
        Ok(())
    }

    /// Batch increment counts: `(kind, name, login) -> delta`.
    pub fn add_counts(&self, deltas: &HashMap<(String, String, String), i64>) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO counts (kind, name, login, n) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(kind, name, login) DO UPDATE SET n = counts.n + excluded.n",
            )?;
            for ((kind, name, login), delta) in deltas {
                stmt.execute(params![kind, name, login, delta])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Pick a random target (kind+name) with at least `min_total` uses and
    /// `min_users` distinct chatters.
    pub fn random_target_in_kind(&self, kind: &str, min_total: i64, min_users: i64) -> Result<Option<(String, String)>> {
        self.conn
            .query_row(
                "SELECT kind, name FROM (
                   SELECT kind, name, SUM(n) AS total, COUNT(DISTINCT login) AS users
                   FROM counts
                   WHERE kind = ?1
                   GROUP BY kind, name
                   HAVING total >= ?2 AND users >= ?3
                 ) ORDER BY RANDOM() LIMIT 1",
                params![kind, min_total, min_users],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(Into::into)
    }

    /// Leaderboard for a target: (login, display_name, n) sorted desc.
    pub fn leaderboard(&self, kind: &str, name: &str, limit: usize) -> Result<Vec<(String, String, i64)>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT c.login, ch.display_name, c.n
             FROM counts c
             JOIN chatters ch ON ch.login = c.login
             WHERE c.kind = ?1 AND c.name = ?2
             ORDER BY c.n DESC
             LIMIT ?3",
        )?;
        let rows = stmt
            .query_map(params![kind, name, limit as i64], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn chatters(&self, exclude: &[String]) -> Result<Vec<(String, String, i64)>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT login, display_name, messages FROM chatters WHERE messages >= 5 ORDER BY messages DESC",
        )?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows
            .into_iter()
            .filter(|(login, _, _)| !exclude.contains(login))
            .collect())
    }

    pub fn is_day_done(&self, day: &str) -> Result<bool> {
        Ok(self
            .conn
            .query_row("SELECT 1 FROM days_done WHERE day = ?1", params![day], |_| Ok(()))
            .optional()?
            .is_some())
    }

    pub fn mark_day_done(&self, day: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO days_done (day) VALUES (?1)",
            params![day],
        )?;
        Ok(())
    }

    pub fn upsert_emote(&self, kind: &str, name: &str, url: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO emotes (kind, name, url) VALUES (?1, ?2, ?3)
             ON CONFLICT(kind, name) DO UPDATE SET url = excluded.url",
            params![kind, name, url],
        )?;
        Ok(())
    }

    pub fn emotes(&self) -> Result<Vec<(String, String, String)>> {
        let mut stmt = self.conn.prepare_cached("SELECT kind, name, url FROM emotes")?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}