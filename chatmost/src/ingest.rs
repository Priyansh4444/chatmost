use crate::api::{Client, Day};
use crate::db::{Db, KIND_SEVENTV, KIND_TWITCH, KIND_WORD};
use crate::emotes::{seven_tv_emote_url, twitch_emotes_with_ids, twitch_emote_url, SevenTv};
use crate::tokenize::{is_bot, is_command, Tokenizer};
use anyhow::Result;
use std::collections::HashMap;
use std::time::Instant;

pub fn ingest(
    db: &Db,
    client: &Client,
    channel: &str,
    channel_twitch_id: &str,
    limit_days: Option<usize>,
    start_from: Option<usize>,
) -> Result<()> {
    let seven_tv = SevenTv::load(channel_twitch_id)?;
    let tok = Tokenizer::new();

    let mut days = client.list_days(channel)?;
    days.sort_by(|a, b| {
        let ka = (a.year.parse::<i32>().unwrap_or(0), a.month.parse::<i32>().unwrap_or(0), a.day.parse::<i32>().unwrap_or(0));
        let kb = (b.year.parse::<i32>().unwrap_or(0), b.month.parse::<i32>().unwrap_or(0), b.day.parse::<i32>().unwrap_or(0));
        kb.cmp(&ka)
    });
    if let Some(limit) = limit_days {
        days.truncate(limit);
    }
    if let Some(skip) = start_from {
        days = days.into_iter().skip(skip).collect();
    }

    let days: Vec<&Day> = days
        .iter()
        .filter(|d| !db.is_day_done(&format!("{}-{}-{}", d.year, d.month, d.day)).unwrap_or(false))
        .collect();

    println!(
        "Ingesting {} pending days for #{} (7tv emotes: {} channel + {} global)",
        days.len(),
        channel,
        seven_tv.channel.len(),
        seven_tv.global.len()
    );

    let mut total_messages = 0usize;
    let mut total_emotes = 0i64;
    let mut total_words = 0i64;
    for (idx, day) in days.iter().enumerate() {
        let start = Instant::now();
        let messages = client.fetch_day(channel, day)?;
        let mut deltas: HashMap<(String, String, String), i64> = HashMap::new();

        for msg in &messages {
            let login = msg.username.to_lowercase();
            if login.is_empty() || is_bot(&login) {
                continue;
            }
            if is_command(&msg.text) {
                continue;
            }
            db.touch_chatter(&login, if msg.display_name.is_empty() { &login } else { &msg.display_name })?;

            let mut used_words: HashMap<String, i64> = HashMap::new();
            let mut used_emotes: HashMap<(String, String), i64> = HashMap::new();

            // Twitch emotes: positions come from the IRC emotes tag; names must
            // be read from the raw IRC payload, not the cleaned `text` field.
            for (emote, emote_id) in twitch_emotes_with_ids(&msg.raw, &msg.tags.emotes) {
                *used_emotes.entry((KIND_TWITCH.to_string(), emote.clone())).or_insert(0) += 1;
                db.upsert_emote(KIND_TWITCH, &emote, &twitch_emote_url(&emote_id))?;
            }
            // 7TV emotes appear as plain tokens; match against known sets first.
            for piece in msg.text.split_whitespace() {
                let clean: String = piece
                    .chars()
                    .filter(|c| c.is_ascii_alphanumeric())
                    .collect();
                if clean.len() >= 2 && seven_tv.is_emote(&clean) {
                    *used_emotes.entry((KIND_SEVENTV.to_string(), clean.clone())).or_insert(0) += 1;
                    if let Some(id) = seven_tv.ids.get(&clean) {
                        db.upsert_emote(KIND_SEVENTV, &clean, &seven_tv_emote_url(id))?;
                    }
                }
            }
            // Remaining words.
            for word in tok.words(&msg.text) {
                *used_words.entry(word).or_insert(0) += 1;
            }

            for (name, n) in used_words {
                *deltas.entry((KIND_WORD.to_string(), name, login.clone())).or_insert(0) += n;
                total_words += n;
            }
            for ((kind, name), n) in used_emotes {
                *deltas.entry((kind, name, login.clone())).or_insert(0) += n;
                total_emotes += n;
            }
            total_messages += 1;
        }

        db.add_counts(&deltas)?;
        db.mark_day_done(&format!("{}-{}-{}", day.year, day.month, day.day))?;
        db.set_meta("last_ingest_day", &format!("{}-{}-{}", day.year, day.month, day.day))?;

        let secs = start.elapsed().as_secs_f32();
        eprintln!(
            "[{:>3}/{}] {}-{}-{}  {:>5} msgs  {:>7.1}/s  ({} emotes, {} words so far)",
            idx + 1,
            days.len(),
            day.year,
            day.month,
            day.day,
            messages.len(),
            messages.len() as f32 / secs.max(0.001),
            total_emotes,
            total_words,
        );

        // Be polite to the public API between days.
        std::thread::sleep(std::time::Duration::from_millis(150));
    }

    println!(
        "Done: {} messages, {} emote uses, {} word uses across {} days",
        total_messages,
        total_emotes,
        total_words,
        days.len()
    );
    Ok(())
}

