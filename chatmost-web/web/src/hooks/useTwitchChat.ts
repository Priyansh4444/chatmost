import { useEffect, useState, useCallback, useRef } from "react";
import { twitchChat, type TwitchChatMessage, type ConnectionStatus, type ActiveChoice } from "@/lib/twitchChat";

export interface LiveVoteEvent {
  voter: string;
  choiceIndex: number;
  choiceName: string;
  timestamp: number;
}

export function useTwitchChat(
  activeChoices: ActiveChoice[] = [],
  enabled = true
) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<TwitchChatMessage[]>([]);
  const [votes, setVotes] = useState<number[]>([0, 0, 0, 0]);
  const [recentVotes, setRecentVotes] = useState<LiveVoteEvent[]>([]);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  // Map of voter username -> choiceIndex (ensures 1 vote per chatter per round)
  const voterMapRef = useRef<Map<string, number>>(new Map());

  // Update active choices on the client
  useEffect(() => {
    twitchChat.setActiveChoices(activeChoices);
  }, [activeChoices]);

  // Reset votes on new question
  const resetVotes = useCallback(() => {
    voterMapRef.current.clear();
    setVotes([0, 0, 0, 0]);
    setRecentVotes([]);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    twitchChat.connect();

    const unsubStatus = twitchChat.onStatus((s) => {
      setStatus(s);
    });

    const unsubMsg = twitchChat.onMessage((msg) => {
      setMessages((prev) => [msg, ...prev.slice(0, 29)]);
      setLastMessageAt(msg.timestamp);
    });

    const unsubVote = twitchChat.onVote((vote) => {
      if (vote.choiceIndex >= 0 && vote.choiceIndex <= 3) {
        voterMapRef.current.set(vote.voter, vote.choiceIndex);

        // Recalculate tally across all unique voters
        setVotes(() => {
          const tally = [0, 0, 0, 0];
          for (const choiceIdx of voterMapRef.current.values()) {
            if (choiceIdx >= 0 && choiceIdx <= 3) {
              tally[choiceIdx]++;
            }
          }
          return tally;
        });

        // Add to recent vote feed
        setRecentVotes((prev) => [
          {
            voter: vote.voter,
            choiceIndex: vote.choiceIndex,
            choiceName: vote.choiceName,
            timestamp: Date.now(),
          },
          ...prev.slice(0, 5),
        ]);
      }
    });

    return () => {
      unsubStatus();
      unsubMsg();
      unsubVote();
      twitchChat.disconnect();
    };
  }, [enabled]);

  // Calculate vote percentages (0% when no votes exist)
  const totalVotes = votes.reduce((a, b) => a + b, 0);
  const percentages = votes.map((v) =>
    totalVotes === 0 ? 0 : Math.round((v / totalVotes) * 100)
  );

  return {
    status,
    messages,
    votes,
    totalVotes,
    percentages,
    recentVotes,
    resetVotes,
    lastMessageAt,
    channel: twitchChat.currentChannel,
    setChannel: (ch: string) => twitchChat.setChannel(ch),
  };
}
