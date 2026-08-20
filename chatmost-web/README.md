# ChatMost

ChatMost turns a Twitch channel's public chat history and emote metadata into interactive games and analytics.

## Features

- Save Your Chatters, a 15-stage trivia survival game with Twitch chat voting
- Higher or Lower for chatters, emotes, and community lore
- Chat Feud based on channel usage rankings
- Chatter profiles, message timelines, lexicon analytics, and longest messages
- Dynamic channel switching with no bundled channel dataset
- Browser-side archive building and IndexedDB caching

ChatMost reads public data from Twitch, StreamElements, 7TV, BTTV, FFZ, and available public chat-log sources. Data availability varies by channel. A channel needs accessible VOD chat or public logs to build the deep archive used by game modes.

## Run locally

Requirements: [Bun](https://bun.sh/) 1.3 or newer.

```bash
git clone https://github.com/Priyansh4444/chatmost.git
cd chatmost
bun install
bun run dev
```

Open `http://localhost:5173` and enter a Twitch channel, or use `http://localhost:5173/?channel=channel_name`.

No environment variables, database, or bundled dataset are required.

## Commands

```bash
bun run dev        # start Vite
bun run typecheck  # check TypeScript
bun run lint       # run ESLint
bun run test       # run Vitest
bun run build      # build web/dist
```

## Deploy

The included Wrangler configuration serves the static single-page app from Cloudflare Workers Assets:

```bash
bun run deploy
```

For another static host, run `bun run build` and publish `web/dist` with SPA fallback enabled.

## Privacy

ChatMost does not ship with streamer or chatter records. Channel archives are assembled in the visitor's browser and cached locally in IndexedDB. Public upstream services still receive the channel and resource requests needed to build the archive.

## License

MIT
