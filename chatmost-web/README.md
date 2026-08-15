# ChatMost Web

A modern Twitch chat trivia & statistics game built from **236 days of jo2uke's archived chat**.

Inspired by **VSCode's Dark Horizon theme**, **Who Wants to Be a Millionaire**, and **Google Feud**.

---

## Features

### 👑 Who Wants to Be a Millionaire Quiz Mode
- **15-Tier Prize Ladder**: Progress from $100 up to the grand prize of **$1,000,000**, featuring safety thresholds at **Tier 5 ($1,000)** and **Tier 10 ($32,000)**.
- **Brainrot Slang First**: Early tiers (Tiers 1–4) highlight high-energy funny words (*freaky, freak, chud, bum, ass, asshole, shit, fuck, bitch, cock, dick, piss, cunt, stfu, bruh, rizz, cooked, etc.*) and viral 7TV emotes.
- **Easy Mode**: 4 multiple-choice options (1 answer + 3 decoys) with live audience percentage pills.
- **Hard Mode**: Search & pick from **all 800+ indexed chatters** with a lightning-fast fuzzy combobox.
- **3 Lifelines / Powerups**:
  1. **50:50**: Visually strikes two wrong answers in Easy mode, or narrows candidate chatters by 80% in Hard mode.
  2. **Ask Twitch Chat / Audience**: Real-time polling modal from live Twitch chat with voting distribution bar charts.
  3. **Switch Question**: Replaces the current question target with a fresh one of equal tier value.
- **Celebration Confetti**: Visual milestone bursts on reaching checkpoints ($1,000 and $32,000) and grand victory ($1,000,000).

### 🔴 Real-Time Twitch IRC Audience Voting
- **Anonymous Twitch WebSocket**: Connects directly to `wss://irc-ws.chat.twitch.tv:443` for `#jo2uke` without requiring user login.
- **Vote by Typing Chatter Names or Numbers**: Viewers vote in chat by typing the chatter name (e.g. `splinteredspike`, `@darth_boii`) or option numbers/letters (`1-4`, `A-D`).
- **Live On-Screen Voting Bar**: Live percentage progress bars and real-time voter ticker displayed directly below the quiz choices.
- **Honest Stream State**: If the stream is offline or chat is quiet, displays `0%` and `"Connected (Channel Quiet / Offline)"` with zero fake simulated messages.

### 🔍 Google Feud Stats Mode
- **Interactive Feud Board**: Guess the top 10 answers across categories (*Top Overall Chatters, Top Emotes, Top Brainrot Words, and Per-Emote/Word leaderboards*).
- **3 Strikes System**: Red `❌ ❌ ❌` strike counter with shake animations and score multipliers (+10,000 pts down to +1,000 pts).
- **3D Card Flip Reveals**: Displays rank, emote image, chatter name, and exact use counts.
- **Full Charts Toggle**: Instantly view comprehensive shadcn ranked data visualizers, tables, breakdowns, and galleries.

### 🗄️ Convex Backend Integration
- **Convex Provider**: Frontend root is wrapped with `<ConvexProvider client={convexClient}>`.
- **Database Schema**: [schema.ts](file:///home/pronsh/Coding/joshing-around/chatmost-web/convex/schema.ts) defines tables for `chatters`, `targets`, `counts`, `rooms`, and `feudScores`.
- **Queries & Mutations**: [quiz.ts](file:///home/pronsh/Coding/joshing-around/chatmost-web/convex/quiz.ts) handles question generation, live room state, and feud score submissions.
- **Database Seeder**: [seed.ts](file:///home/pronsh/Coding/joshing-around/chatmost-web/convex/seed.ts) batch imports chat data into Convex.
- **Zero-Config Fallback**: If `VITE_CONVEX_URL` is unset, the app runs locally from the precomputed 236-day archive dataset (588k messages, 2,177 chatters, 14,106 targets).

### 🎨 Dark Horizon VSCode Design System
- Deep obsidian slate canvas (`#0a0d14`, `#111622`, `#151b2a`).
- Neon accents: **Horizon Cyan** (`#00f0ff`), **Electric Purple** (`#a855f7`), **Coral Strike** (`#f43f5e`), **Gold Checkpoint** (`#fbbf24`), **Emerald Success** (`#10b981`).
- Custom scrollbars, glassmorphism overlays, and smooth micro-animations.

---

## Development & Commands

```bash
# 1. Run local web app (Vite + React Scan)
npm run dev

# 2. Run Convex backend in development mode (optional)
npm run dev:convex

# 3. Seed data into your Convex deployment (optional)
npm run seed:convex

# 4. Verify TypeScript types
npm run typecheck

# 5. Verify React Compiler ESLint rules
npm run lint

# 6. Build production bundle
npm run build
```