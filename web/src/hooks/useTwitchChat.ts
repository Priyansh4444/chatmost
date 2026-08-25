import { useEffect, useState, useRef } from "react";
import { twitchChat, type TwitchChatMessage, type ConnectionStatus, type ActiveChoice } from "@/lib/twitchChat";

export interface LiveVoteEvent {
  voter: string;
  choiceIndex: number;
  choiceName: string;
  matchedToken?: string;
  timestamp: number;
  text: string;
  isOverride?: boolean;
  previousChoiceName?: string;
}

export function useTwitchChat(
  activeChoices: ActiveChoice[] = [],
  enabled = true,
  targetChannel?: string
) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<TwitchChatMessage[]>([]);
  const [votes, setVotes] = useState<number[]>([]);
  const [recentVotes, setRecentVotes] = useState<LiveVoteEvent[]>([]);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  // Map of voter username -> { choiceIndex, choiceName } (tracks active vote & overrides)
  const voterMapRef = useRef<Map<string, { choiceIndex: number; choiceName: string }>>(new Map());
  const choicesRef = useRef<ActiveChoice[]>(activeChoices);
  choicesRef.current = activeChoices;

  // Switch channel dynamically if targetChannel changes (state is already fresh
  // because the parent pages remount per channel via key={channel})
  useEffect(() => {
    if (targetChannel && targetChannel.trim() && targetChannel.toLowerCase() !== twitchChat.currentChannel) {
      twitchChat.setChannel(targetChannel.trim().toLowerCase());
      voterMapRef.current.clear();
      setVotes(new Array(activeChoices.length).fill(0));
      setRecentVotes([]);
    }
  }, [targetChannel]);

  // Update active choices on the client & auto-reset when choices change between questions
  const prevChoicesKeyRef = useRef<string>("");
  useEffect(() => {
    twitchChat.setActiveChoices(activeChoices);
    const key = activeChoices.map((c) => c.login).join("|");
    if (prevChoicesKeyRef.current !== key) {
      prevChoicesKeyRef.current = key;
      voterMapRef.current.clear();
      setVotes(new Array(activeChoices.length).fill(0));
      setRecentVotes([]);
    }
  }, [activeChoices]);

  // Reset votes on new round/question
  const resetVotes = () => {
    voterMapRef.current.clear();
    setVotes(new Array(choicesRef.current.length).fill(0));
    setRecentVotes([]);
  };

  useEffect(() => {
    if (!enabled) return;

    twitchChat.connect();

    const unsubStatus = twitchChat.onStatus((s) => {
      setStatus(s);
    });

    const unsubMsg = twitchChat.onMessage((msg) => {
      setMessages((prev) => [msg, ...prev.slice(0, 79)]);
      setLastMessageAt(msg.timestamp);
    });

    const unsubVote = twitchChat.onVote((vote) => {
      const currentChoices = choicesRef.current;
      if (vote.choiceIndex >= 0 && vote.choiceIndex < currentChoices.length) {
        const existingVote = voterMapRef.current.get(vote.voter);
        const isOverride = !!existingVote && existingVote.choiceIndex !== vote.choiceIndex;
        const previousChoiceName = isOverride ? existingVote.choiceName : undefined;

        // Set or update current voter's choice
        voterMapRef.current.set(vote.voter, {
          choiceIndex: vote.choiceIndex,
          choiceName: vote.choiceName,
        });

        // Recalculate tally across all unique voters
        const tally = new Array(currentChoices.length).fill(0);
        for (const item of voterMapRef.current.values()) {
          if (item.choiceIndex >= 0 && item.choiceIndex < currentChoices.length) {
            tally[item.choiceIndex]++;
          }
        }
        setVotes(tally);

        // Annotate recent message in messages state with vote & override details
        setMessages((prev) =>
          prev.map((m) =>
            m.username.toLowerCase() === vote.voter.toLowerCase() && m.message === vote.text
              ? {
                  ...m,
                  voteIndex: vote.choiceIndex,
                  voteChoiceName: vote.choiceName,
                  matchedToken: vote.matchedToken,
                  isOverride,
                  previousVoteChoiceName: previousChoiceName,
                }
              : m
          )
        );

        // Add to recent vote feed
        setRecentVotes((prev) => [
          {
            voter: vote.voter,
            choiceIndex: vote.choiceIndex,
            choiceName: vote.choiceName,
            matchedToken: vote.matchedToken,
            timestamp: Date.now(),
            text: vote.text,
            isOverride,
            previousChoiceName,
          },
          ...prev.slice(0, 15),
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

  // Calculate vote percentages (0% when no votes exist; strictly 100% when 1 option has all votes)
  const totalVotes = votes.reduce((a, b) => a + b, 0);
  let percentages: number[] = new Array(activeChoices.length).fill(0);

  if (totalVotes > 0) {
    const nonZeroCount = votes.filter((v) => v > 0).length;
    percentages = activeChoices.map((_, i) => {
      const v = votes[i] ?? 0;
      if (v === 0) return 0;
      if (nonZeroCount === 1) return 100;
      return Math.round((v / totalVotes) * 100);
    });
  }

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
