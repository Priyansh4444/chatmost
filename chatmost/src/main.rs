mod api;
mod db;
mod emotes;
mod export;
mod game;
mod ingest;
mod tokenize;

use anyhow::Result;
use std::path::PathBuf;

const CHANNEL: &str = "jo2uke";
const CHANNEL_TWITCH_ID: &str = "506792939";
const DEFAULT_DB: &str = "chatmost.db";

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let command = args.get(1).map(String::as_str).unwrap_or("game");

    let db_path = std::env::var("CHATMOST_DB")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_DB));

    match command {
        "ingest" => {
            let limit_days = args.get(2).and_then(|s| s.parse::<usize>().ok());
            let start_from = args.get(3).and_then(|s| s.parse::<usize>().ok());
            let base = std::env::var("CHATMOST_BASE").ok();
            let db = db::Db::open(db_path.to_str().unwrap_or(DEFAULT_DB))?;
            let client = api::Client::new(base.as_deref())?;
            ingest::ingest(&db, &client, CHANNEL, CHANNEL_TWITCH_ID, limit_days, start_from)?;
        }
        "game" => {
            let db = db::Db::open(db_path.to_str().unwrap_or(DEFAULT_DB))?;
            game::loop_forever(&db)?;
        }
        "one" => {
            let db = db::Db::open(db_path.to_str().unwrap_or(DEFAULT_DB))?;
            game::play_one(&db)?;
        }
        "leaderboard" => {
            let kind = args.get(2).map(String::as_str).unwrap_or("word");
            let name = args.get(3).map(String::as_str).unwrap_or("");
            if name.is_empty() {
                anyhow::bail!("usage: chatmost leaderboard <word|twitch|7tv> <name>");
            }
            let db = db::Db::open(db_path.to_str().unwrap_or(DEFAULT_DB))?;
            game::leaderboard(&db, kind, name, 10)?;
        }
        "export-d1" => {
            let out = args.get(2).map(String::as_str).unwrap_or("chatmost-d1.sql");
            export::export_d1(db_path.to_str().unwrap_or(DEFAULT_DB), out)?;
        }
        _ => {
            anyhow::bail!(
                "usage: chatmost <ingest [days] [skip]|game|one|leaderboard <kind> <name>|export-d1 [out]>"
            )
        }
    }
    Ok(())
}