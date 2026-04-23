"use client";

import { cn } from "@/lib/utils";

interface ScoreCircleProps {
  score: number;
  size?: number;
  className?: string;
}

export function ScoreCircle({ score, size = 44, className }: ScoreCircleProps) {
  const getStyle = (s: number) => {
    if (s >= 90) return { border: '2px solid #F59E0B', background: 'rgba(245,158,11,0.12)', color: '#F59E0B' };
    if (s >= 70) return { border: '2px solid #34D399', background: 'rgba(52,211,153,0.12)', color: '#34D399' };
    if (s >= 40) return { border: '2px solid #FBBF24', background: 'rgba(251,191,36,0.12)', color: '#FBBF24' };
    return { border: '2px solid #EF4444', background: 'rgba(239,68,68,0.12)', color: '#EF4444' };
  };

  return (
    <div
      className={cn("shrink-0", className)}
      style={{
        ...getStyle(score),
        width: size,
        height: size,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: '"JetBrains Mono", var(--font-mono), monospace',
        fontSize: Math.max(12, size * 0.35),
        fontWeight: 700,
      }}
    >
      {Math.round(score)}
    </div>
  );
}
