export type QTEMode = "solo_trial" | "duo_duel";

export type QTEPhase =
  | "idle"
  | "siren"
  | "roulette"
  | "ready"
  | "input"
  | "voting"
  | "verdict";

export type VerdictResult = "banned" | "timedout" | "spared" | "p1_won" | "p2_won" | "tie";

export interface QTEParticipant {
  username: string;
  displayName: string;
  color: string;
  badge?: string;
  recentContext?: string;
  defenseText?: string;
  submittedAt?: number;
  votes: number;
}

export interface QTEPrompt {
  id: string;
  mode: QTEMode;
  title: string;
  description: string;
  crimeOrTopic: string;
}

export interface QTEVoteMessage {
  id: string;
  username: string;
  displayName: string;
  color: string;
  choice: "p1" | "p2" | "spare" | "ban";
  text: string;
  timestamp: number;
}

export interface QTEHistoryItem {
  id: string;
  timestamp: number;
  mode: QTEMode;
  topic: string;
  p1: QTEParticipant;
  p2?: QTEParticipant;
  verdict: VerdictResult;
  totalVotes: number;
}
