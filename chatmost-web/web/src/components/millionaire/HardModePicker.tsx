import { useState, useMemo, useRef, useEffect } from "react";
import { type Choice } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import { ChevronDown, Search, X } from "lucide-react";

interface HardModePickerProps {
  chatters: Choice[]; // Top 200 active chatters
  answerLogin: string;
  isFiftyFiftyActive: boolean;
  fiftyFiftyDecoys?: Choice[];
  disabled?: boolean;
  selectedLogin: string | null;
  onSelect: (login: string) => void;
  onConfirm: () => void;
}

export function HardModePicker({
  chatters,
  answerLogin,
  isFiftyFiftyActive,
  fiftyFiftyDecoys = [],
  disabled,
  selectedLogin,
  onSelect,
  onConfirm,
}: HardModePickerProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // If 50:50 is active, narrow to answer + 14 decoys (15 candidates)
  const candidatePool = useMemo(() => {
    if (!isFiftyFiftyActive) return chatters;
    const answer = chatters.find((c) => c.login === answerLogin);
    return answer
      ? [answer, ...fiftyFiftyDecoys].sort((a, b) => (b.messages ?? 0) - (a.messages ?? 0))
      : chatters.slice(0, 15);
  }, [chatters, answerLogin, isFiftyFiftyActive, fiftyFiftyDecoys]);

  // Filtered dropdown results
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidatePool;
    return candidatePool.filter(
      (c) =>
        c.login.toLowerCase().includes(q) ||
        c.displayName.toLowerCase().includes(q)
    );
  }, [candidatePool, query]);

  // Currently selected chatter
  const selectedChatter = useMemo(() => {
    return chatters.find((c) => c.login === selectedLogin);
  }, [chatters, selectedLogin]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1 < filtered.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIndex]) {
        handlePick(filtered[highlightIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handlePick = (chatter: Choice) => {
    onSelect(chatter.login);
    setQuery(chatter.displayName);
    setIsOpen(false);
  };

  const clearSelection = () => {
    setQuery("");
    onSelect("");
    inputRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col border border-border bg-card/70 font-mono text-xs shadow-none"
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-border bg-muted/40 p-2.5">
        <div className="flex items-center gap-2">
          <span className="border border-destructive bg-destructive text-white px-1.5 text-[9px] font-bold">
            Hard Mode
          </span>
          <span className="font-bold text-foreground">
            Top 200 Most Active Chatters
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Pool: <strong className="text-primary">{candidatePool.length}</strong> chatters</span>
          {isFiftyFiftyActive && (
            <span className="border border-primary bg-primary/15 text-primary px-1 font-bold">
              50:50 (15 Choices)
            </span>
          )}
        </div>
      </div>

      {/* Search Input with Dropdown Trigger */}
      <div className="relative p-3 bg-background border-b border-border">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            placeholder="Type to filter top 200 chatters (e.g. splinteredspike, pronshh)..."
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
              setHighlightIndex(0);
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="pl-8 pr-16 border-border bg-card/60 text-xs font-mono focus-visible:border-primary"
          />

          <div className="absolute right-1 flex items-center gap-1">
            {query && !disabled && (
              <button
                type="button"
                onClick={clearSelection}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setIsOpen((prev) => !prev)}
              className="p-1.5 border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
            </button>
          </div>
        </div>

        {/* Filterable Dropdown Menu */}
        {isOpen && !disabled && (
          <div className="absolute left-3 right-3 top-full z-40 max-h-64 overflow-y-auto border-x border-b border-border bg-background shadow-2xl divide-y divide-border/50">
            <div className="bg-muted/60 px-3 py-1.5 text-[10px] font-medium text-muted-foreground flex items-center justify-between">
              <span>Showing {filtered.length} chatters</span>
              <span>Use ↑↓ keys + Enter to select</span>
            </div>

            {filtered.map((c, idx) => {
              const isSelected = c.login === selectedLogin;
              const isHighlighted = idx === highlightIndex;

              return (
                <button
                  key={c.login}
                  type="button"
                  onClick={() => handlePick(c)}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left font-mono text-xs transition-none",
                    isSelected
                      ? "bg-primary text-black font-bold"
                      : isHighlighted
                      ? "bg-muted/80 text-foreground"
                      : "hover:bg-muted/50 text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                      "flex h-4 w-7 shrink-0 items-center justify-center border text-[9px] font-bold",
                      isSelected ? "border-black bg-black text-primary" : "border-border bg-card text-muted-foreground"
                    )}>
                      #{idx + 1}
                    </span>
                    <span className="font-bold truncate">{c.displayName}</span>
                  </div>

                  {c.messages && (
                    <span className={cn(
                      "text-[10px] shrink-0 font-mono",
                      isSelected ? "text-black font-bold" : "text-muted-foreground"
                    )}>
                      {formatNumber(c.messages)} msgs
                    </span>
                  )}
                </button>
              );
            })}

            {filtered.length === 0 && (
              <div className="p-4 text-center text-muted-foreground text-xs">
                No chatter found in Top 200 matching "{query}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Lock-In Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-card/40">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-[10px]">Selected:</span>
          {selectedChatter ? (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-primary text-sm">
                {selectedChatter.displayName}
              </span>
              {selectedChatter.messages && (
                <span className="text-muted-foreground text-[10px]">
                  ({formatNumber(selectedChatter.messages)} messages)
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground/60 text-xs">
              None (type or pick from dropdown)
            </span>
          )}
        </div>

        <Button
          size="sm"
          disabled={!selectedLogin || disabled}
          onClick={onConfirm}
          className="border-primary bg-primary text-black font-bold hover:bg-primary/90 disabled:opacity-30"
        >
          Lock In Final Answer
        </Button>
      </div>
    </div>
  );
}
