export interface TwitchChatMessage {
  id: string;
  username: string;
  displayName: string;
  color: string;
  message: string;
  timestamp: number;
  voteIndex?: number;
  voteChoiceName?: string;
  matchedToken?: string;
  isOverride?: boolean;
  previousVoteChoiceName?: string;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface ActiveChoice {
  login: string;
  displayName: string;
}

export interface VoteExtractionResult {
  index: number;
  name: string;
  matchedToken: string;
}

/**
 * Break a name / login into clean sub-tokens for flexible nickname/alias matching.
 * e.g.:
 * - ExampleViewer -> ["exampleviewer", "example", "viewer"]
 * - chat_member -> ["chat_member", "chatmember", "chat", "member"]
 * - viewer123 -> ["viewer123", "viewer"]
 */
export function getChoiceSubTokens(choice: ActiveChoice): string[] {
  const rawLogin = choice.login.toLowerCase().trim();
  const rawDisplay = choice.displayName.toLowerCase().trim();

  const tokens = new Set<string>();
  tokens.add(rawLogin);
  tokens.add(rawDisplay);
  tokens.add(rawLogin.replace(/[^a-z0-9]/g, ""));
  tokens.add(rawDisplay.replace(/[^a-z0-9]/g, ""));

  // Split on underscores, hyphens, and whitespace
  for (const part of choice.displayName.split(/[\s_-]+/)) {
    const clean = part.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (clean.length >= 3) tokens.add(clean);
  }

  // Split on camelCase boundaries (e.g. EvilBuddha -> Evil, Buddha)
  const camelParts = choice.displayName.replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/);
  for (const part of camelParts) {
    const clean = part.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (clean.length >= 3) tokens.add(clean);
  }

  // Strip trailing numbers (e.g. viewer123 -> viewer)
  const withoutTrailingDigits = rawLogin.replace(/\d+$/, "");
  if (withoutTrailingDigits.length >= 3) {
    tokens.add(withoutTrailingDigits);
  }

  return Array.from(tokens).filter((t) => t.length >= 2);
}

/**
 * Robust Twitch Vote Parser supporting option numbers, letters, higher/lower keywords,
 * exact chatter/emote names, and sub-word / nickname aliases.
 */
export function parseTwitchVote(
  msg: string,
  activeChoices: ActiveChoice[] = []
): VoteExtractionResult | null {
  if (!msg || !msg.trim() || activeChoices.length === 0) return null;

  const rawClean = msg.trim().toLowerCase();
  const isHigherLowerMode =
    activeChoices.length === 2 &&
    (activeChoices[0].login.toLowerCase() === "higher" || activeChoices[0].displayName.toLowerCase() === "higher") &&
    (activeChoices[1].login.toLowerCase() === "lower" || activeChoices[1].displayName.toLowerCase() === "lower");

  // 1. Direct Option Identifiers (1-4, A-D, !1-!4, !a-!d, #1-#4, p1/p2)
  const exactOptionMap: Record<string, number> = {
    "1": 0, "a": 0, "!1": 0, "!a": 0, "#1": 0, "option 1": 0, "option a": 0, "vote 1": 0, "vote a": 0, "p1": 0, "!p1": 0, "#p1": 0, "player 1": 0, "player1": 0,
    "2": 1, "b": 1, "!2": 1, "!b": 1, "#2": 1, "option 2": 1, "option b": 1, "vote 2": 1, "vote b": 1, "p2": 1, "!p2": 1, "#p2": 1, "player 2": 1, "player2": 1,
    "3": 2, "c": 2, "!3": 2, "!c": 2, "#3": 2, "option 3": 2, "option c": 2, "vote 3": 2, "vote c": 2, "p3": 2, "!p3": 2, "#p3": 2, "player 3": 2, "player3": 2,
    "4": 3, "d": 3, "!4": 3, "!d": 3, "#4": 3, "option 4": 3, "option d": 3, "vote 4": 3, "vote d": 3, "p4": 3, "!p4": 3, "#p4": 3, "player 4": 3, "player4": 3,
  };

  if (rawClean in exactOptionMap) {
    const idx = exactOptionMap[rawClean];
    if (activeChoices[idx]) {
      return { index: idx, name: activeChoices[idx].displayName, matchedToken: rawClean };
    }
  }

  // 2. Higher / Lower Keyword Matching (for Higher or Lower game mode).
  // Single letters ("h", "s", "l", "w", "+", "-") are deliberately NOT
  // keywords: they collide with single-letter emote spam ("s", "o", ...)
  // that would otherwise cast false votes.
  if (isHigherLowerMode) {
    const higherKeywords = new Set(["higher", "high", "up", "higer", "more", "above", "over", "top", "big", "bigger"]);
    const lowerKeywords = new Set(["lower", "low", "down", "fewer", "less", "below", "under", "bot", "bottom", "small", "smaller"]);
    const negationTokens = new Set(["not", "no", "never", "n't", "aint", "isnt", "arent", "dont", "didnt"]);

    const words = rawClean.replace(/[^a-z0-9+-]/g, " ").split(/\s+/).filter(Boolean);
    let negated = false;
    for (const w of words) {
      if (negationTokens.has(w)) {
        negated = true;
        continue;
      }
      if (higherKeywords.has(w)) {
        return { index: negated ? 1 : 0, name: activeChoices[negated ? 1 : 0].displayName, matchedToken: w };
      }
      if (lowerKeywords.has(w)) {
        return { index: negated ? 0 : 1, name: activeChoices[negated ? 0 : 1].displayName, matchedToken: w };
      }
      // Any intervening word cancels the negation (e.g. "no" as filler,
      // "not sure but higher", ...) so only adjacent "not <keyword>" flips.
      negated = false;
    }
  }

  // 3. Choice Name, Sub-token, and Alias Matching
  // Clean message into tokens stripping punctuation
  const sanitized = rawClean.replace(/[@!#?.,;:"'()[\]{}]/g, " ");
  const msgTokens = sanitized.split(/\s+/).filter(Boolean);

  // Pre-calculate sub-tokens for each active choice
  const choiceSubTokens = activeChoices.map((choice) => ({
    choice,
    subTokens: getChoiceSubTokens(choice),
  }));

  // A. Check for exact full message matches
  for (const [i, { choice, subTokens }] of choiceSubTokens.entries()) {
    const loginClean = choice.login.toLowerCase().replace(/[^a-z0-9]/g, "");
    const displayClean = choice.displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const msgClean = rawClean.replace(/[^a-z0-9]/g, "");

    if (msgClean === loginClean || msgClean === displayClean) {
      return { index: i, name: choice.displayName, matchedToken: rawClean };
    }

    if (subTokens.some((st) => st === rawClean)) {
      return { index: i, name: choice.displayName, matchedToken: rawClean };
    }
  }

  // B. Check word-by-word against sub-tokens (e.g. "i think buddha is top" -> matches "buddha" -> EvilBuddha)
  for (const word of msgTokens) {
    if (word.length < 2) continue;

    // Check if word is option digit or letter (e.g. "I pick 1" or "vote a")
    if (word in exactOptionMap) {
      const idx = exactOptionMap[word];
      if (activeChoices[idx]) {
        return { index: idx, name: activeChoices[idx].displayName, matchedToken: word };
      }
    }

    // Match word against choice sub-tokens
    for (const [i, { choice, subTokens }] of choiceSubTokens.entries()) {
      if (subTokens.includes(word)) {
        return { index: i, name: choice.displayName, matchedToken: word };
      }
    }
  }

  return null;
}

class TwitchChatClient {
  private ws: WebSocket | null = null;
  private channel: string;
  private status: ConnectionStatus = "disconnected";
  private messageListeners: ((msg: TwitchChatMessage) => void)[] = [];
  private statusListeners: ((status: ConnectionStatus) => void)[] = [];
  private voteListeners: ((vote: { voter: string; choiceIndex: number; choiceName: string; matchedToken: string; text: string }) => void)[] = [];
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private activeChoices: ActiveChoice[] = [];
  private intentionalDisconnect = false;
  private _lastMessageAt: number | null = null;

  constructor(channel = "") {
    this.channel = channel.toLowerCase().replace(/^#/, "");
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public get lastMessageAt(): number | null {
    return this._lastMessageAt;
  }

  public get currentChannel(): string {
    return this.channel;
  }

  public setChannel(channel: string) {
    const clean = channel.toLowerCase().replace(/^#/, "");
    if (this.channel === clean) return;
    this.channel = clean;
    this.reconnect();
  }

  public setActiveChoices(choices: ActiveChoice[]) {
    this.activeChoices = choices;
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalDisconnect = false;
    this.setStatus("connecting");

    try {
      this.ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");

      this.ws.onopen = () => {
        if (!this.ws) return;
        this.ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands\r\n");
        const anonNick = `justinfan${Math.floor(10000 + Math.random() * 89999)}`;
        this.ws.send(`PASS SCHMOOPIE\r\n`);
        this.ws.send(`NICK ${anonNick}\r\n`);
        this.ws.send(`JOIN #${this.channel}\r\n`);
      };

      this.ws.onmessage = (event) => {
        this.handleRawMessage(event.data);
      };

      this.ws.onerror = () => {
        this.setStatus("error");
      };

      this.ws.onclose = () => {
        if (!this.intentionalDisconnect) {
          this.setStatus("disconnected");
          this.scheduleReconnect();
        }
      };
    } catch {
      this.setStatus("error");
    }
  }

  public disconnect() {
    this.intentionalDisconnect = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }

    this.setStatus("disconnected");
  }

  private reconnect() {
    this.disconnect();
    this.connect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 5000);
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.statusListeners.forEach((l) => l(status));
  }

  private handleRawMessage(raw: string) {
    const lines = raw.split("\r\n");
    for (const line of lines) {
      if (!line) continue;

      if (line.startsWith("PING")) {
        this.ws?.send("PONG :tmi.twitch.tv\r\n");
        continue;
      }

      // Connection acknowledged by Twitch IRC
      if (this.status === "connecting" && (line.includes(" 001 ") || line.includes("JOIN"))) {
        this.setStatus("connected");
      }

      if (line.includes("PRIVMSG")) {
        this.parsePrivMsg(line);
      }
    }
  }

  private parsePrivMsg(line: string) {
    // Format: @tags :nick!nick@nick.tmi.twitch.tv PRIVMSG #channel :message
    let tagsPart = "";
    let rest = line;

    if (line.startsWith("@")) {
      const spaceIdx = line.indexOf(" ");
      tagsPart = line.slice(1, spaceIdx);
      rest = line.slice(spaceIdx + 1);
    }

    const match = rest.match(/^:([^!]+)![^@]+@[^\s]+\s+PRIVMSG\s+#[^\s]+\s+:(.*)$/);
    if (!match) return;

    const username = match[1];
    const message = match[2];

    // Extract Twitch tags
    let displayName = username;
    let color = "#00f0ff";
    if (tagsPart) {
      const tags = Object.fromEntries(
        tagsPart.split(";").map((kv) => {
          const eq = kv.indexOf("=");
          return [kv.slice(0, eq), kv.slice(eq + 1)];
        })
      );
      if (tags["display-name"]) displayName = tags["display-name"];
      if (tags["color"]) color = tags["color"];
    }

    // Check vote extraction
    const voteResult = parseTwitchVote(message, this.activeChoices);

    const chatMsg: TwitchChatMessage = {
      id: Math.random().toString(36).slice(2),
      username,
      displayName,
      color: color || "#a855f7",
      message,
      timestamp: Date.now(),
      voteIndex: voteResult ? voteResult.index : undefined,
      voteChoiceName: voteResult ? voteResult.name : undefined,
      matchedToken: voteResult ? voteResult.matchedToken : undefined,
    };

    this._lastMessageAt = Date.now();
    this.messageListeners.forEach((l) => l(chatMsg));

    if (voteResult) {
      this.voteListeners.forEach((l) =>
        l({
          voter: username,
          choiceIndex: voteResult.index,
          choiceName: voteResult.name,
          matchedToken: voteResult.matchedToken,
          text: message,
        })
      );
    }
  }

  public onMessage(fn: (msg: TwitchChatMessage) => void) {
    this.messageListeners.push(fn);
    return () => {
      this.messageListeners = this.messageListeners.filter((l) => l !== fn);
    };
  }

  public onVote(fn: (vote: { voter: string; choiceIndex: number; choiceName: string; matchedToken: string; text: string }) => void) {
    this.voteListeners.push(fn);
    return () => {
      this.voteListeners = this.voteListeners.filter((l) => l !== fn);
    };
  }

  public onStatus(fn: (status: ConnectionStatus) => void) {
    this.statusListeners.push(fn);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== fn);
    };
  }
}

// Global shared singleton
export const twitchChat = new TwitchChatClient("");
