import { useState } from "react";
import { useStreamer } from "@/lib/streamerContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Radio, ExternalLink } from "lucide-react";

export function ChannelSwitcherModal() {
  const { channel, setChannel, isChannelModalOpen, setIsChannelModalOpen } = useStreamer();
  const [inputVal, setInputVal] = useState(channel);

  if (!isChannelModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputVal.trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_]/g, "");
    if (clean) {
      setIsChannelModalOpen(false);
      setChannel(clean);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md font-mono text-xs animate-flip-reveal">
      <div className="w-full max-w-md border border-white/[0.12] bg-[#0c0c0e] p-5 shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary animate-pulse" />
            <h2 className="text-sm font-bold text-white tracking-tight">
              Switch Streamer / Channel
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close channel switcher"
            onClick={() => setIsChannelModalOpen(false)}
            className="text-zinc-500 hover:text-white p-1 text-xs"
          >
            ✕
          </button>
        </div>

        <p className="text-xs font-sans text-zinc-400 leading-relaxed">
          Enter any Twitch username to load their live IRC chat stream, StreamElements records, and interactive chat quiz.
        </p>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 border border-white/[0.1] bg-white/[0.03] px-3 py-2 focus-within:border-primary">
            <span className="text-zinc-500 font-bold">#</span>
            <Input
              autoFocus
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="enter a Twitch username…"
              className="bg-transparent border-0 p-0 text-white placeholder:text-zinc-600 focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-xs"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <a
              href={`https://twitch.tv/${channel}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
            >
              twitch.tv/{channel} <ExternalLink className="h-2.5 w-2.5" />
            </a>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsChannelModalOpen(false)}
                className="text-xs text-zinc-400 border-white/[0.1] hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs bg-primary text-white font-bold hover:bg-primary/90"
              >
                Set Channel
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
