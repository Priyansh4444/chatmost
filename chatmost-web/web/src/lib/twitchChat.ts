export interface TwitchChatMessage {
  id: string;
  username: string;
  displayName: string;
  color: string;
  message: string;
  timestamp: number;
  voteIndex?: number; // 0, 1, 2, 3 if recognized as option vote
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface ActiveChoice {
  login: string;
  displayName: string;
}

export class TwitchChatClient {
  private ws: WebSocket | null = null;
  private channel: string;
  private status: ConnectionStatus = "disconnected";
  private messageListeners: ((msg: TwitchChatMessage) => void)[] = [];
  private statusListeners: ((status: ConnectionStatus) => void)[] = [];
  private voteListeners: ((vote: { voter: string; choiceIndex: number; choiceName: string; text: string }) => void)[] = [];
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private activeChoices: ActiveChoice[] = [];
  private intentionalDisconnect = false;
  private _lastMessageAt: number | null = null;

  constructor(channel = "jo2uke") {
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
    const voteResult = this.extractVoteIndex(message);

    const chatMsg: TwitchChatMessage = {
      id: Math.random().toString(36).slice(2),
      username,
      displayName,
      color: color || "#a855f7",
      message,
      timestamp: Date.now(),
      voteIndex: voteResult !== null ? voteResult.index : undefined,
    };

    this._lastMessageAt = Date.now();
    this.messageListeners.forEach((l) => l(chatMsg));

    if (voteResult !== null) {
      this.voteListeners.forEach((l) =>
        l({
          voter: username,
          choiceIndex: voteResult.index,
          choiceName: voteResult.name,
          text: message,
        })
      );
    }
  }

  private extractVoteIndex(msg: string): { index: number; name: string } | null {
    const clean = msg.trim().toLowerCase();
    if (!clean) return null;

    // 1. Single option identifier (1, 2, 3, 4, A, B, C, D, !1, !a, etc.)
    if (["1", "a", "!1", "!a", "vote 1", "vote a", "!vote 1", "!vote a"].includes(clean)) {
      if (this.activeChoices[0]) return { index: 0, name: this.activeChoices[0].displayName };
    }
    if (["2", "b", "!2", "!b", "vote 2", "vote b", "!vote 2", "!vote b"].includes(clean)) {
      if (this.activeChoices[1]) return { index: 1, name: this.activeChoices[1].displayName };
    }
    if (["3", "c", "!3", "!c", "vote 3", "vote c", "!vote 3", "!vote c"].includes(clean)) {
      if (this.activeChoices[2]) return { index: 2, name: this.activeChoices[2].displayName };
    }
    if (["4", "d", "!4", "!d", "vote 4", "vote d", "!vote 4", "!vote d"].includes(clean)) {
      if (this.activeChoices[3]) return { index: 3, name: this.activeChoices[3].displayName };
    }

    // 2. Chatter name typed in chat (e.g. "splinteredspike", "@splinteredspike", "vote splinteredspike")
    if (this.activeChoices.length > 0) {
      // Split message into words / tokens
      const sanitized = clean.replace(/[@!#]/g, " ");
      const words = sanitized.split(/\s+/).filter(Boolean);

      for (let i = 0; i < this.activeChoices.length; i++) {
        const choice = this.activeChoices[i];
        const loginLower = choice.login.toLowerCase();
        const displayLower = choice.displayName.toLowerCase();

        // Exact match or word token match
        if (clean === loginLower || clean === displayLower) {
          return { index: i, name: choice.displayName };
        }

        if (words.some((w) => w === loginLower || w === displayLower)) {
          return { index: i, name: choice.displayName };
        }
      }
    }

    return null;
  }

  public onMessage(fn: (msg: TwitchChatMessage) => void) {
    this.messageListeners.push(fn);
    return () => {
      this.messageListeners = this.messageListeners.filter((l) => l !== fn);
    };
  }

  public onVote(fn: (vote: { voter: string; choiceIndex: number; choiceName: string; text: string }) => void) {
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
export const twitchChat = new TwitchChatClient("jo2uke");
