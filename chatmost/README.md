# chatmost

A Rust prototype: a Twitch chat guessing game for **jo2uke** built from a
third-party chat log API (no official Twitch API).

## How it works

- `chatmost ingest` downloads every logged day of `#jo2uke` chat from
  `https://logs.zonian.dev` (a mirror over justlog/rustlog instances such as
  `logxx.dev`, which serve the channel's full history in JSON).
- Each message is tokenized into:
  - **7TV emotes** — matched against the channel's 7TV emote set plus the 7TV
    global set (`https://7tv.io/v3/users/twitch/506792939` and the global set).
  - **Twitch emotes** — recovered from the IRC `emotes` tag byte positions in
    the raw message.
  - **words** — everything else, with stopwords and known bots filtered out.
- Per-user counts are stored in SQLite (`counts` table: `kind`, `name`,
  `login`, `n`).
- `chatmost game` picks a random target (60% of the time an emote), asks
  "which chatter typed it the most?", and offers four answer choices.

## Usage

```sh
cargo build --release

# Download all chat (resumable; skips days already ingested).
./target/release/chatmost ingest

# Play the guessing game.
./target/release/chatmost game

# A single question.
./target/release/chatmost one

# Inspect a leaderboard: chatmost leaderboard <word|twitch|7tv> <name>
./target/release/chatmost leaderboard 7tv OL
```

Environment variables:

- `CHATMOST_DB` — SQLite path (default `chatmost.db`).
- `CHATMOST_BASE` — chat log API base (default `https://logs.zonian.dev`).

## Data notes

- The public log API rate-limits; ingest backs off and retries on 429/5xx and
  treats a 404 at a later page offset as end-of-day.
- Not every day is logged; available days come from the API's `/list`.
- Chat is user-generated content — keep the database local.

## Current game logic

- Target selection prefers emotes (Twitch + 7TV) over plain words.
- Options: the correct chatter plus three decoys picked from active chatters.
- `min_total = 15` uses and `min_users = 3` distinct chatters required for a
  target to be askable.
