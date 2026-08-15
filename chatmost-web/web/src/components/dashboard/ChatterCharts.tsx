import { useState, useId } from "react";
import { formatNumber } from "@/lib/utils";

interface TimelinePoint {
  period: string;
  messages: number;
}

interface BreakdownData {
  emotesCount: number;
  wordsCount: number;
  emoteShare: number;
  wordShare: number;
}

/**
 * Animated SVG Line Chart inspired by Olivier Larose / Ryo Lu minimal dashboards
 */
export function ChatterLineChart({
  data,
  className,
}: {
  data: TimelinePoint[];
  className?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const id = useId().replace(/:/g, "");

  if (!data || data.length === 0) return null;

  const width = 540;
  const height = 170;
  const paddingX = 35;
  const paddingY = 25;

  const maxVal = Math.max(...data.map((d) => d.messages), 1);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => {
    const x = paddingX + (i / (data.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((d.messages - minVal) / range) * (height - paddingY * 2);
    return { x, y, ...d };
  });

  // Create smooth SVG cubic bezier path
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    pathD += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  // Area fill path
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  const activePoint = hoveredIdx !== null ? points[hoveredIdx] : points[points.length - 1];

  return (
    <div className={className}>
      <style>{`
        @keyframes chartStrokeDraw {
          0% {
            stroke-dashoffset: 1200;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        @keyframes chartAreaFadeIn {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        .animate-chart-line {
          stroke-dasharray: 1200;
          animation: chartStrokeDraw 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-chart-area {
          animation: chartAreaFadeIn 0.8s ease-out 0.3s both;
        }
      `}</style>

      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-muted-foreground font-medium">
          Activity Velocity (Monthly Stream History)
        </span>
        {activePoint && (
          <span className="font-mono text-xs font-bold text-primary">
            {activePoint.period}: {formatNumber(activePoint.messages)} msgs
          </span>
        )}
      </div>

      <div className="relative border border-border/80 bg-background/50 p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-40 overflow-visible"
        >
          <defs>
            <linearGradient id={`lineGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={width - paddingX}
            y2={paddingY}
            stroke="#1e2638"
            strokeDasharray="3 3"
          />
          <line
            x1={paddingX}
            y1={height / 2}
            x2={width - paddingX}
            y2={height / 2}
            stroke="#1e2638"
            strokeDasharray="3 3"
          />
          <line
            x1={paddingX}
            y1={height - paddingY}
            x2={width - paddingX}
            y2={height - paddingY}
            stroke="#1e2638"
          />

          {/* Animated Area Fill */}
          <path d={areaD} fill={`url(#lineGrad-${id})`} className="animate-chart-area" />

          {/* Animated Line Stroke */}
          <path
            d={pathD}
            fill="none"
            stroke="#00f0ff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-chart-line"
          />

          {/* Data Points */}
          {points.map((p, idx) => (
            <g
              key={p.period}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredIdx === idx ? "5" : p.messages === 0 ? "2" : "3.5"}
                fill={hoveredIdx === idx ? "#00f0ff" : p.messages === 0 ? "#1e2638" : "#06080d"}
                stroke="#00f0ff"
                strokeWidth={p.messages === 0 ? "1" : "2"}
                className="transition-all duration-150"
              />
              {/* Skip some text labels on small widths or display every other if dense */}
              <text
                x={p.x}
                y={height - 8}
                textAnchor="middle"
                className="fill-muted-foreground font-mono text-[7.5px] select-none"
              >
                {p.period}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/**
 * Animated SVG Donut / Pie Chart for Emotes vs Words Share
 */
export function ChatterPieChart({
  breakdown,
  className,
}: {
  breakdown: BreakdownData;
  className?: string;
}) {
  if (!breakdown) return null;

  const size = 110;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const emoteOffset = 0;
  const emoteLength = (breakdown.emoteShare / 100) * circumference;
  const wordLength = (breakdown.wordShare / 100) * circumference;

  return (
    <div className={className}>
      <span className="text-[10px] text-muted-foreground font-medium block mb-2">
        Lexicon Ratio (Emotes vs Words)
      </span>

      <div className="flex items-center gap-4 border border-border/80 bg-background/50 p-3">
        {/* Donut Graphic */}
        <div className="relative shrink-0 flex items-center justify-center">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Background ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#151b28"
              strokeWidth={strokeWidth}
            />

            {/* Emotes Arc */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#00f0ff"
              strokeWidth={strokeWidth}
              strokeDasharray={`${emoteLength} ${circumference}`}
              strokeDashoffset={emoteOffset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              className="transition-all duration-1000 ease-out"
            />

            {/* Words Arc */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#a855f7"
              strokeWidth={strokeWidth}
              strokeDasharray={`${wordLength} ${circumference}`}
              strokeDashoffset={-emoteLength}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              className="transition-all duration-1000 ease-out"
            />
          </svg>

          {/* Centered label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-mono text-xs font-bold text-foreground">
              {breakdown.emoteShare}%
            </span>
            <span className="text-[8px] text-muted-foreground font-mono">Emotes</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2 flex-1 text-xs font-mono">
          <div className="flex items-center justify-between border-b border-border/40 pb-1">
            <span className="flex items-center gap-1.5 text-foreground font-medium">
              <span className="h-2 w-2 bg-primary shrink-0" />
              Emotes
            </span>
            <span className="text-primary font-bold">
              {breakdown.emoteShare}% ({formatNumber(breakdown.emotesCount)})
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-foreground font-medium">
              <span className="h-2 w-2 bg-secondary shrink-0" />
              Words
            </span>
            <span className="text-secondary font-bold">
              {breakdown.wordShare}% ({formatNumber(breakdown.wordsCount)})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
