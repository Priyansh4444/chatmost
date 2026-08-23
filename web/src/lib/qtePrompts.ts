import { type QTEMode, type QTEPrompt } from "./qteTypes";

export const SOLO_CRIMES: { crime: string; title: string; hint: string }[] = [
  {
    title: "BLATANT BACKSEATING",
    crime: "Accused of: Telling the streamer which build to use 0.2s before a boss wipe.",
    hint: "Convince the court why your unsolicited gaming advice was actually galaxy brain!",
  },
  {
    title: "SUSPICIOUS LURKING",
    crime: "Accused of: Sitting in chat for 6 hours without typing until now.",
    hint: "Explain what you were doing the entire time or face the ban hammer!",
  },
  {
    title: "CONTROVERSIAL FOOD OPINION",
    crime: "Accused of: Putting ketchup on steak and claiming pineapple belongs on milk tea.",
    hint: "Provide an emergency culinary defense before you are permanently exiled.",
  },
  {
    title: "UNSOLICITED PSYCHOANALYSIS",
    crime: "Accused of: Typing 'streamer looks secretly tilted rn' after 1 death.",
    hint: "Apologize profusely or plead temporary insanity.",
  },
  {
    title: "FALSE SPOILER TERRORISM",
    crime: "Accused of: Typing 'NO WAY HE DIES NEXT' in a game you never played.",
    hint: "Deliver your best courtroom alibi!",
  },
  {
    title: "EXCESSIVE POGGIES SPAM",
    crime: "Accused of: Spawning 800 emote walls while the streamer was fixing OBS audio.",
    hint: "Explain why the hype was warranted or suffer the timeout!",
  },
];

export const DUO_PROMPTS: { title: string; topic: string; hint: string }[] = [
  {
    title: "THE VIP TRIAL",
    topic: "Why do YOU deserve the diamond VIP badge more than the chatter next to you?",
    hint: "Sell yourself to chat. Highest rizz wins!",
  },
  {
    title: "THE EMERGENCY EXCUSE",
    topic: "What is your best excuse for being 4 hours late to the subathon?",
    hint: "Absurd, hilarious, or dramatic excuses prevail!",
  },
  {
    title: "ROAST YOUR OPPONENT",
    topic: "Deliver a lightning 1-sentence friendly roast of your opponent's username.",
    hint: "Keep it playful, funny, and punchy!",
  },
  {
    title: "THE STREAM SAVIOR",
    topic: "Twitch is about to delete this channel in 10 seconds. What do you type to save it?",
    hint: "Only the most heroic message will prevail in the vote!",
  },
  {
    title: "WORST SPONSOR PITCH",
    topic: "Pitch the most unhinged and terrible sponsor deal to the streamer.",
    hint: "Make chat laugh to secure their votes!",
  },
];

export function getRandomPrompt(mode: QTEMode, useFlavorCrimes: boolean = false): QTEPrompt {
  if (mode === "solo_trial") {
    if (useFlavorCrimes) {
      const p = SOLO_CRIMES[Math.floor(Math.random() * SOLO_CRIMES.length)];
      return {
        id: Math.random().toString(36).slice(2),
        mode: "solo_trial",
        title: p.title,
        description: p.hint,
        crimeOrTopic: p.crime,
      };
    }
    return {
      id: Math.random().toString(36).slice(2),
      mode: "solo_trial",
      title: "MODERATION TRIAL",
      description: "Convince the streamer and chat why you should not be timed out!",
      crimeOrTopic: "Why should you not be timed out?",
    };
  } else {
    if (useFlavorCrimes) {
      const p = DUO_PROMPTS[Math.floor(Math.random() * DUO_PROMPTS.length)];
      return {
        id: Math.random().toString(36).slice(2),
        mode: "duo_duel",
        title: p.title,
        description: p.hint,
        crimeOrTopic: p.topic,
      };
    }
    return {
      id: Math.random().toString(36).slice(2),
      mode: "duo_duel",
      title: "DUEL FOR SURVIVAL",
      description: "Argue why the other chatter deserves the timeout instead of you!",
      crimeOrTopic: "Why should the OTHER person be timed out?",
    };
  }
}
