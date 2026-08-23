import { useStreamer } from "@/lib/streamerContext";
import { Radio, ArrowLeftRight, Github, Coffee } from "lucide-react";

export function ChannelPicker() {
  const { setIsChannelModalOpen } = useStreamer();

  return (
    <div className="flex flex-col items-center justify-center gap-5 py-24 text-center font-mono">
      <div className="h-14 w-14 border-2 border-primary/60 bg-primary/10 flex items-center justify-center">
        <Radio className="h-6 w-6 text-primary animate-pulse" />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-black text-white tracking-tight">
          Pick a Streamer to Begin
        </h1>
        <p className="text-xs text-zinc-400 font-sans max-w-sm leading-relaxed">
          Load any Twitch channel's chat archive: live StreamElements records,
          7TV & Twitch emote stats, trivia, higher/lower, and the full lexicon.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setIsChannelModalOpen(true)}
        className="flex items-center gap-2 bg-primary/10 border border-primary/40 text-primary hover:bg-primary hover:text-black transition-[background-color,border-color,color,box-shadow] px-5 py-2.5 font-mono text-sm font-bold shadow-sm cursor-pointer"
      >
        <ArrowLeftRight className="h-4 w-4" />
        Choose Streamer
      </button>

      <div className="flex items-center gap-3 pt-2">
        <a
          href="https://github.com/Priyansh4444/chatmost"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-zinc-400 hover:text-white hover:border-white/20 transition-all font-mono"
        >
          <Github className="h-3.5 w-3.5" />
          <span>GitHub</span>
        </a>

        <a
          href="https://ko-fi.com/pronsh"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300 hover:bg-amber-500/20 hover:border-amber-400/50 transition-all font-mono font-medium"
        >
          <Coffee className="h-3.5 w-3.5 text-amber-400" />
          <span>Support on Ko-fi</span>
        </a>
      </div>

      <p className="text-[10px] text-zinc-600 font-mono mt-1">
        works with any Twitch channel
      </p>
    </div>
  );
}
