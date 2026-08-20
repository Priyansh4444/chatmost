import { useState, useId } from "react";
import { formatNumber } from "@/lib/utils";

interface TimelinePoint {
  period: string;
  messages: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2024-03" -> "Mar 24"; anything else passes through unchanged. */
function formatPeriodLabel(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  const year = match[1].slice(2);
  const monthIdx = parseInt(match[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return period;
  return `${MONTHS[monthIdx]} ${year}`;
}

interface BreakdownData {
  emotesCount: number;
  wordsCount: number;
  totalTokens?: number;
  emoteShare: number;
  wordShare: number;
  emotesPerMsg?: number;
  wordsPerMsg?: number;
  emotesPer100Words?: number;
  uniqueEmotes?: number;
  uniqueWords?: number;
}

/**
 * Highly Dynamic Animated SVG Line Chart with Interactive Cursor & Scrubber
 */
export function ChatterLineChart({
  data,
  className,
  title = "Activity Velocity (Monthly Stream Timeline)",
  unit = "msgs",
}: {
  data: TimelinePoint[];
  className?: string;
  title?: string;
  unit?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const id = useId().replace(/:/g, "");

  if (!data || data.length === 0) return null;

  const width = 540;
  const height = 180;
  const paddingX = 35;
  const paddingY = 30;

  const maxVal = Math.max(...data.map((d) => d.messages), 1);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => {
    const x = paddingX + (i / (data.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((d.messages - minVal) / range) * (height - paddingY * 2);
    return { x, y, ...d };
  });

  // Smooth SVG cubic bezier path
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    pathD += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  // Area fill path
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  const activeIdx = hoveredIdx !== null ? hoveredIdx : points.length - 1;
  const activePoint = points[activeIdx];

  return (
    <div className={className}>
      <style>{`
        @keyframes strokeDrawMotion {
          0% {
            stroke-dashoffset: 1400;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        @keyframes areaGlowPulse {
          0%, 100% {
            opacity: 0.85;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes ringPulse {
          0% {
            transform: scale(0.9);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.4);
            opacity: 0.2;
          }
          100% {
            transform: scale(0.9);
            opacity: 0.8;
          }
        }
        .anim-stroke-draw {
          stroke-dasharray: 1400;
          animation: strokeDrawMotion 1.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .anim-area-pulse {
          animation: areaGlowPulse 4s ease-in-out infinite;
        }
      `}</style>

      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          {title}
        </span>
        {activePoint && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono">{formatPeriodLabel(activePoint.period)}:</span>
            <span className="font-mono text-xs font-black text-primary animate-fadeIn">
              {formatNumber(activePoint.messages)} {unit}
            </span>
          </div>
        )}
      </div>

      <div
        className="relative border border-border/80 bg-background/60 p-2 overflow-hidden group select-none"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-44 overflow-visible"
        >
          <defs>
            <linearGradient id={`lineGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#00f0ff" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
            </linearGradient>
            <filter id={`glow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={width - paddingX}
            y2={paddingY}
            stroke="#1a2333"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingX}
            y1={(height - paddingY + paddingY) / 2}
            x2={width - paddingX}
            y2={(height - paddingY + paddingY) / 2}
            stroke="#1a2333"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingX}
            y1={height - paddingY}
            x2={width - paddingX}
            y2={height - paddingY}
            stroke="#1a2333"
          />

          {/* Animated Area Fill */}
          <path
            d={areaD}
            fill={`url(#lineGrad-${id})`}
            className="anim-area-pulse transition-opacity duration-300"
          />

          {/* Glowing Stroke Underlay */}
          <path
            d={pathD}
            fill="none"
            stroke="#00f0ff"
            strokeWidth="5"
            strokeOpacity="0.3"
            filter={`url(#glow-${id})`}
            className="anim-stroke-draw"
          />

          {/* Main Animated Line Stroke */}
          <path
            d={pathD}
            fill="none"
            stroke="#00f0ff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="anim-stroke-draw"
          />

          {/* Interactive Vertical Scrubber Guide Line */}
          {activePoint && (
            <g className="transition-[transform,opacity] duration-150 ease-out">
              <line
                x1={activePoint.x}
                y1={paddingY - 5}
                x2={activePoint.x}
                y2={height - paddingY}
                stroke="#00f0ff"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                strokeOpacity="0.75"
              />
              {/* Pulsing Active Halo */}
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="9"
                fill="#00f0ff"
                fillOpacity="0.25"
                className="animate-ping"
                style={{ transformOrigin: `${activePoint.x}px ${activePoint.y}px`, animationDuration: "2s" }}
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="5.5"
                fill="#00f0ff"
                stroke="#050811"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Data Points */}
          {points.map((p, idx) => (
            <g
              key={p.period}
              onMouseEnter={() => setHoveredIdx(idx)}
              className="cursor-pointer"
            >
              {/* Invisible large hover hit-area */}
              <rect
                x={p.x - 15}
                y={0}
                width={30}
                height={height}
                fill="transparent"
              />
              {/* Small point dot if not active */}
              {activeIdx !== idx && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.messages === 0 ? "2" : "3"}
                  fill={p.messages === 0 ? "#1e2638" : "#06080d"}
                  stroke="#00f0ff"
                  strokeWidth={p.messages === 0 ? "1" : "1.8"}
                  className="transition-transform duration-200 hover:scale-150"
                />
              )}
              {/* X-axis labels */}
              <text
                x={p.x}
                y={height - 10}
                textAnchor="middle"
                className={`font-mono text-[8px] transition-colors duration-150 select-none ${
                  activeIdx === idx ? "fill-primary font-bold" : "fill-muted-foreground/60"
                }`}
              >
                {formatPeriodLabel(p.period)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/**
 * Animated SVG Donut Ring with interactive expansion and hover effects
 *
 * Red/black channel palette: red = emotes, black = words.
 */
const DONUT_RED = "#e8647a";
const DONUT_BLACK = "#2e2e33";

function SingleDonut({
  shareA,
  shareB,
  labelCenter,
  sublabelCenter,
  colorA = DONUT_RED,
  colorB = DONUT_BLACK,
  isHovered = false,
}: {
  shareA: number;
  shareB: number;
  labelCenter: string;
  sublabelCenter: string;
  colorA?: string;
  colorB?: string;
  isHovered?: boolean;
}) {
  const size = 100;
  const strokeWidth = isHovered ? 14 : 12;
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;

  const lenA = (Math.max(0, Math.min(100, shareA)) / 100) * circumference;
  const lenB = (Math.max(0, Math.min(100, shareB)) / 100) * circumference;

  return (
    <div className="relative shrink-0 flex items-center justify-center transition-transform duration-300 hover:scale-105">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#151b28"
          strokeWidth={strokeWidth}
        />
        {/* Arc A (Emotes) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colorA}
          strokeWidth={strokeWidth}
          strokeDasharray={`${lenA} ${circumference}`}
          strokeDashoffset={0}
          strokeLinecap="butt"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-width,stroke-dasharray,stroke-dashoffset,filter] duration-700 ease-out"
          style={{ filter: isHovered ? `drop-shadow(0 0 6px ${colorA}88)` : undefined }}
        />
        {/* Arc B (Words) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colorB}
          strokeWidth={strokeWidth}
          strokeDasharray={`${lenB} ${circumference}`}
          strokeDashoffset={-lenA}
          strokeLinecap="butt"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-width,stroke-dasharray,stroke-dashoffset,filter] duration-700 ease-out"
          style={{ filter: isHovered ? `drop-shadow(0 0 6px ${colorB}88)` : undefined }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
        <span className="font-mono text-xs font-black text-foreground leading-none animate-fadeIn">
          {labelCenter}
        </span>
        <span className="text-[8px] text-muted-foreground font-mono mt-0.5">{sublabelCenter}</span>
      </div>
    </div>
  );
}

/**
 * Dual Donut Charts: Total Occurrences Ratio vs Unique Vocabulary Ratio
 */
export function ChatterPieChart({
  breakdown,
  className,
}: {
  breakdown: BreakdownData;
  className?: string;
}) {
  const [hoveredChart, setHoveredChart] = useState<"vol" | "unique" | null>(null);

  if (!breakdown) return null;

  const totalEmotes = breakdown.emotesCount;
  const totalWords = breakdown.wordsCount;
  const totalOccurrences = totalEmotes + totalWords || 1;
  const occurrenceEmoteShare = Math.round((totalEmotes / totalOccurrences) * 1000) / 10;
  const occurrenceWordShare = Math.round((totalWords / totalOccurrences) * 1000) / 10;

  const uniqueEmotes = breakdown.uniqueEmotes ?? 0;
  const uniqueWords = breakdown.uniqueWords ?? 0;
  const totalUnique = uniqueEmotes + uniqueWords || 1;
  const uniqueEmoteShare = Math.round((uniqueEmotes / totalUnique) * 1000) / 10;
  const uniqueWordShare = Math.round((uniqueWords / totalUnique) * 1000) / 10;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Lexicon Ratios (Total Occurrences vs Unique Vocabulary)
        </span>
        <span className="text-[9px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 border border-border/40">
          Dual Breakdown
        </span>
      </div>

      <div className="flex flex-col gap-3 border border-border/80 bg-background/50 p-3">
        {/* Two Animated Donut Charts Side-by-Side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-border/50">
          {/* Chart 1: All Occurrences */}
          <div
            className="flex items-center gap-3 pt-2 sm:pt-0 sm:pr-2 cursor-pointer transition-colors"
            onMouseEnter={() => setHoveredChart("vol")}
            onMouseLeave={() => setHoveredChart(null)}
          >
            <SingleDonut
              shareA={occurrenceEmoteShare}
              shareB={occurrenceWordShare}
              labelCenter={`${occurrenceEmoteShare}%`}
              sublabelCenter="Emote Vol"
              colorA={DONUT_RED}
              colorB={DONUT_BLACK}
              isHovered={hoveredChart === "vol"}
            />
            <div className="flex flex-col gap-1.5 flex-1 text-xs font-mono">
              <span className="text-[10px] font-bold text-foreground uppercase tracking-wider block border-b border-border/40 pb-0.5">
                Total Volume Ratio
              </span>
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 text-foreground">
                  <span className="h-1.5 w-1.5 bg-primary shrink-0 animate-pulse" />
                  All Emotes
                </span>
                <span className="text-primary font-bold">{formatNumber(totalEmotes)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 text-foreground">
                  <span className="h-1.5 w-1.5 bg-[#2e2e33] shrink-0" />
                  All Words
                </span>
                <span className="text-zinc-400 font-bold">{formatNumber(totalWords)}</span>
              </div>
            </div>
          </div>

          {/* Chart 2: Unique Vocabulary Variety */}
          <div
            className="flex items-center gap-3 pt-3 sm:pt-0 sm:pl-4 cursor-pointer transition-colors"
            onMouseEnter={() => setHoveredChart("unique")}
            onMouseLeave={() => setHoveredChart(null)}
          >
            <SingleDonut
              shareA={uniqueEmoteShare}
              shareB={uniqueWordShare}
              labelCenter={`${uniqueEmoteShare}%`}
              sublabelCenter="Unique"
              colorA={DONUT_RED}
              colorB={DONUT_BLACK}
              isHovered={hoveredChart === "unique"}
            />
            <div className="flex flex-col gap-1.5 flex-1 text-xs font-mono">
              <span className="text-[10px] font-bold text-foreground uppercase tracking-wider block border-b border-border/40 pb-0.5">
                Vocabulary Variety
              </span>
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 text-foreground">
                  <span className="h-1.5 w-1.5 bg-primary shrink-0 animate-pulse" />
                  Unique Emotes
                </span>
                <span className="text-primary font-bold">{formatNumber(uniqueEmotes)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 text-foreground">
                  <span className="h-1.5 w-1.5 bg-[#2e2e33] shrink-0" />
                  Unique Words
                </span>
                <span className="text-zinc-400 font-bold">{formatNumber(uniqueWords)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Velocity & Vocabulary Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 border-t border-border/40 pt-2 text-[10px] font-mono">
          <div className="bg-card/40 border border-border/40 p-1.5 transition-colors hover:border-primary/60">
            <span className="text-muted-foreground block text-[8px]">Emotes / Msg</span>
            <span className="font-bold text-primary">{breakdown.emotesPerMsg ?? 0}</span>
          </div>
          <div className="bg-card/40 border border-border/40 p-1.5 transition-colors hover:border-secondary/60">
            <span className="text-muted-foreground block text-[8px]">Words / Msg</span>
            <span className="font-bold text-secondary">{breakdown.wordsPerMsg ?? 0}</span>
          </div>
          <div className="bg-card/40 border border-border/40 p-1.5 transition-colors hover:border-foreground/60">
            <span className="text-muted-foreground block text-[8px]">Emote Density</span>
            <span className="font-bold text-foreground">{breakdown.emotesPer100Words ?? 0} / 100w</span>
          </div>
          <div className="bg-card/40 border border-border/40 p-1.5 transition-colors hover:border-foreground/60">
            <span className="text-muted-foreground block text-[8px]">Total Tokens</span>
            <span className="font-bold text-foreground">{formatNumber(totalOccurrences)}</span>
          </div>
        </div>

        <div className="text-[8.5px] text-muted-foreground/70 leading-relaxed border-t border-border/20 pt-1 font-mono">
          * Left chart measures <strong>Total Volume</strong> (all times emotes/words were typed). Right chart measures <strong>Unique Vocabulary</strong> (distinct unique emotes vs unique words used). Emote spam walls have been filtered out.
        </div>
      </div>
    </div>
  );
}
