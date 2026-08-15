use crate::db::{Db, KIND_SEVENTV, KIND_TWITCH, KIND_WORD};
use anyhow::Result;
use rand::seq::SliceRandom;
use rand::Rng;
use rand::thread_rng;
use std::io::{self, BufRead, Write};

fn kind_label(kind: &str) -> &'static str {
    match kind {
        KIND_TWITCH => "Twitch emote",
        KIND_SEVENTV => "7TV emote",
        _ => "word",
    }
}

pub fn play_one(db: &Db) -> Result<bool> {
    let rng = &mut thread_rng();

    // Prefer emotes: 60% of the time pick an emote kind.
    let emote_kinds = [KIND_TWITCH, KIND_SEVENTV];
    let kind = if rng.gen_bool(0.6) {
        *emote_kinds.choose(rng).unwrap_or(&KIND_TWITCH)
    } else {
        KIND_WORD
    };
    let Some((kind, name)) = db.random_target_in_kind(kind, 15, 3)? else {
        anyhow::bail!("No targets available yet; run `chatmost ingest` first.");
    };

    let top = db.leaderboard(&kind, &name, 20)?;
    let Some((answer_login, answer_display, _)) = top.first().cloned() else {
        return Ok(false);
    };

    // Decoy options from other active chatters, excluding the answer.
    let mut decoys: Vec<String> = db
        .chatters(&[answer_login.clone()])?
        .into_iter()
        .filter(|(login, _, _)| login != &answer_login)
        .map(|(login, _, _)| login)
        .collect();
    decoys.shuffle(rng);
    decoys.truncate(3);
    if decoys.len() < 3 {
        return Ok(false);
    }

    let mut options = vec![answer_login.clone()];
    options.extend(decoys.iter().cloned());
    options.shuffle(rng);

    println!("\nWhich chatter typed the {} `{}` the most? ({} uses total)", kind_label(&kind), name, top.iter().map(|(_, _, n)| n).sum::<i64>());
    for (i, opt) in options.iter().enumerate() {
        println!("  {}) {}", i + 1, opt);
    }
    print!("> ");
    io::stdout().flush()?;

    let stdin = io::stdin();
    let mut line = String::new();
    stdin.lock().read_line(&mut line)?;
    let choice = line.trim().parse::<usize>().ok().and_then(|i| options.get(i.checked_sub(1)?));

    let mut correct = false;
    match choice {
        Some(login) if login == &answer_login => {
            println!("Correct! {}", answer_display);
            correct = true;
        }
        Some(login) => println!("Nope — it was {} ({}). You guessed {}.",
            answer_display, answer_login, login),
        None => println!("(no answer recorded) The answer was {} ({}).", answer_display, answer_login),
    }

    println!("\nTop 5 for {} `{}`:", kind_label(&kind), name);
    for (i, (login, display, n)) in top.iter().take(5).enumerate() {
        println!("  {}. {} ({}) — {}", i + 1, display, login, n);
    }

    Ok(correct)
}

pub fn loop_forever(db: &Db) -> Result<()> {
    let mut score = 0i64;
    let mut total = 0i64;
    loop {
        match play_one(db) {
            Ok(correct) => {
                if correct {
                    score += 1;
                }
                total += 1;
                println!("\nScore: {}/{}", score, total);
            }
            Err(e) => {
                eprintln!("Error: {e}");
                break;
            }
        }
        print!("\nPress enter for next question (q to quit) > ");
        io::stdout().flush()?;
        let mut line = String::new();
        io::stdin().lock().read_line(&mut line)?;
        if line.trim().eq_ignore_ascii_case("q") {
            break;
        }
    }
    println!("Final score: {}/{}", score, total);
    Ok(())
}

pub fn leaderboard(db: &Db, kind: &str, name: &str, limit: usize) -> Result<()> {
    let kind = match kind {
        "word" => KIND_WORD,
        "twitch" => KIND_TWITCH,
        "7tv" => KIND_SEVENTV,
        _ => anyhow::bail!("kind must be word|twitch|7tv"),
    };
    for (i, (login, display, n)) in db.leaderboard(kind, name, limit)?.iter().enumerate() {
        println!("  {}. {} ({}) — {}", i + 1, display, login, n);
    }
    Ok(())
}