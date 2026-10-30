import { cn } from "@/lib/utils";

type Pt = [number, number];

/** Monotone cubic path (no overshoot below zero), like a calm hand-drawn curve. */
function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const tan: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) tan.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  tan.push(m[n - 2]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + tan[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - tan[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

/**
 * Monochrome area trend: one ink line with a soft grey wash, an optional dashed comparison line,
 * and a marker on the latest value. Pure SVG, server-rendered.
 */
export function AreaTrend({
  series,
  compare,
  label,
  className,
  height = 120,
}: {
  series: number[];
  /** Optional second series drawn as a quiet dashed line (e.g. fixed vs reported). */
  compare?: number[];
  /** Accessible summary, e.g. "Reported per day, last 14 days: 3, 5, 2 …". */
  label: string;
  className?: string;
  height?: number;
}) {
  const W = 320;
  const H = height;
  const pad = 8;
  const max = Math.max(1, ...series, ...(compare ?? []));
  const toPts = (s: number[]): Pt[] =>
    s.map((v, i) => [pad + (i * (W - pad * 2)) / Math.max(1, s.length - 1), H - pad - (v / max) * (H - pad * 2.5)]);
  const pts = toPts(series);
  const line = smoothPath(pts);
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z` : "";
  const last = pts[pts.length - 1];
  const mid = pts[Math.floor((pts.length - 1) / 2)];
  const id = `trend-${label.length}-${series.length}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className={cn("block w-full overflow-visible", className)} style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${id})`} />}
      {compare && compare.length > 1 && (
        <path d={smoothPath(toPts(compare))} fill="none" stroke="var(--subtle-foreground)" strokeWidth={1.5} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      )}
      {line && <path d={line} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      {mid && pts.length > 2 && <circle cx={mid[0]} cy={mid[1]} r={3.5} fill="var(--chart-line)" />}
      {last && <circle cx={last[0]} cy={last[1]} r={4} fill="var(--chart-line)" stroke="var(--surface)" strokeWidth={2} />}
    </svg>
  );
}
