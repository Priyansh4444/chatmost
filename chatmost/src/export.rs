use anyhow::Result;
use std::fs::File;
use std::io::Write;

/// Write the SQLite data out as a D1-importable `.sql` file.
///
/// Emits schema + batched INSERTs (D1 accepts up to 1000 statements per batch
/// via `wrangler d1 execute --file`, and each INSERT can carry many rows).
pub fn export_d1(db_path: &str, out_path: &str) -> Result<()> {
    let conn = rusqlite::Connection::open(db_path)?;
    let mut out = std::io::BufWriter::new(File::create(out_path)?);

    writeln!(
        out,
        "CREATE TABLE IF NOT EXISTS counts (
           kind TEXT NOT NULL,
           name  TEXT NOT NULL,
           login TEXT NOT NULL,
           n     INTEGER NOT NULL DEFAULT 0,
           PRIMARY KEY (kind, name, login)
         );
         CREATE INDEX IF NOT EXISTS idx_counts_kind_name ON counts(kind, name, n DESC);
         CREATE TABLE IF NOT EXISTS chatters (
           login TEXT PRIMARY KEY,
           display_name TEXT NOT NULL,
           messages INTEGER NOT NULL DEFAULT 0
         );
         CREATE TABLE IF NOT EXISTS emotes (
           kind TEXT NOT NULL,
           name  TEXT NOT NULL,
           url   TEXT NOT NULL DEFAULT '',
           PRIMARY KEY (kind, name)
         );
         CREATE INDEX IF NOT EXISTS idx_emotes_name ON emotes(kind, name);
         CREATE TABLE IF NOT EXISTS targets (
           kind  TEXT NOT NULL,
           name  TEXT NOT NULL,
           total INTEGER NOT NULL,
           users INTEGER NOT NULL,
           PRIMARY KEY (kind, name)
         );
         CREATE INDEX IF NOT EXISTS idx_targets_kind ON targets(kind, total DESC);"
    )?;

    // chatters
    {
        let mut stmt = conn.prepare("SELECT login, display_name, messages FROM chatters")?;
        let rows: Vec<(String, String, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<std::result::Result<_, _>>()?;
        for chunk in rows.chunks(500) {
            write!(out, "INSERT INTO chatters (login, display_name, messages) VALUES ")?;
            for (i, (login, display_name, messages)) in chunk.iter().enumerate() {
                if i > 0 {
                    write!(out, ",")?;
                }
                write!(
                    out,
                    "('{}','{}',{})",
                    sql_escape(login),
                    sql_escape(display_name),
                    messages
                )?;
            }
            writeln!(out, ";")?;
        }
    }

    // emotes
    {
        let mut stmt = conn.prepare("SELECT kind, name, url FROM emotes")?;
        let rows: Vec<(String, String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<std::result::Result<_, _>>()?;
        for chunk in rows.chunks(500) {
            write!(out, "INSERT INTO emotes (kind, name, url) VALUES ")?;
            for (i, (kind, name, url)) in chunk.iter().enumerate() {
                if i > 0 {
                    write!(out, ",")?;
                }
                write!(out, "('{}','{}','{}')", sql_escape(kind), sql_escape(name), sql_escape(url))?;
            }
            writeln!(out, ";")?;
        }
    }

    // counts (largest)
    {
        let mut stmt = conn.prepare("SELECT kind, name, login, n FROM counts")?;
        let rows: Vec<(String, String, String, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
            .collect::<std::result::Result<_, _>>()?;
        for chunk in rows.chunks(500) {
            write!(out, "INSERT INTO counts (kind, name, login, n) VALUES ")?;
            for (i, (kind, name, login, n)) in chunk.iter().enumerate() {
                if i > 0 {
                    write!(out, ",")?;
                }
                write!(
                    out,
                    "('{}','{}','{}',{})",
                    sql_escape(kind),
                    sql_escape(name),
                    sql_escape(login),
                    n
                )?;
            }
            writeln!(out, ";")?;
        }
    }

    // targets (aggregated per kind+name, for fast random-question picks)
    {
        let mut stmt = conn.prepare(
            "SELECT kind, name, SUM(n) AS total, COUNT(DISTINCT login) AS users
             FROM counts GROUP BY kind, name",
        )?;
        let rows: Vec<(String, String, i64, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
            .collect::<std::result::Result<_, _>>()?;
        for chunk in rows.chunks(500) {
            write!(out, "INSERT INTO targets (kind, name, total, users) VALUES ")?;
            for (i, (kind, name, total, users)) in chunk.iter().enumerate() {
                if i > 0 {
                    write!(out, ",")?;
                }
                write!(out, "('{}','{}',{}, {})", sql_escape(kind), sql_escape(name), total, users)?;
            }
            writeln!(out, ";")?;
        }
    }

    out.flush()?;
    println!("Wrote D1 SQL to {out_path}");
    Ok(())
}

fn sql_escape(s: &str) -> String {
    s.replace('\'', "''")
}