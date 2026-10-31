"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Maximize2, Minus, Plus } from "lucide-react";
import { ErrorState, Skeleton } from "@/components/ui";
import { CAMPUS_ATTRIBUTION_URL, CAMPUS_DATA_URL } from "@/lib/campus";
import { cn } from "@/lib/utils";

// Canvas renderer for the real Dibrugarh University geometry (OpenStreetMap + Overture, local metres),
// ported from the map kit's examples/atlas-renderer.js and restyled with our monochrome tokens.

export type AtlasMarker = {
  id: string;
  /** Local metres (x right, y down). */
  x: number;
  y: number;
  /** Number shown inside the disc; 0 draws a small hollow dot. */
  count: number;
  /** Already localised count (Assamese digits). Defaults to the number. */
  countText?: string;
  /** Highest open priority 1–4 (ring colour), null = nothing open. */
  topPriority: number | null;
  /** Only fixed issues here: ring uses --success. */
  fixedOnly?: boolean;
  label?: string;
};

type Geometry = { type: string; coordinates: unknown };
type RawData = {
  meta: { width: number; height: number };
  roads: { highway: string; geometry: Geometry }[];
  areas: { kind: string; geometry: Geometry }[];
  buildings: { geometry: Geometry }[];
  boundary: Geometry;
};
type Atlas = {
  width: number;
  height: number;
  /** Campus outline bounding box in metres: [minX, minY, maxX, maxY]. */
  campus: [number, number, number, number];
  boundary: Path2D;
  majorRoads: Path2D;
  minorRoads: Path2D;
  buildings: Path2D;
  fields: Path2D;
  water: Path2D;
};

type Pt = [number, number];
function addGeometry(p: Path2D, g: Geometry) {
  const line = (c: Pt[], closed: boolean) => {
    c.forEach((v, i) => (i ? p.lineTo(v[0], v[1]) : p.moveTo(v[0], v[1])));
    if (closed) p.closePath();
  };
  if (g.type === "Polygon") (g.coordinates as Pt[][]).forEach((c) => line(c, true));
  else if (g.type === "MultiPolygon") (g.coordinates as Pt[][][]).forEach((a) => a.forEach((c) => line(c, true)));
  else if (g.type === "LineString") line(g.coordinates as Pt[], false);
  else if (g.type === "MultiLineString") (g.coordinates as Pt[][]).forEach((c) => line(c, false));
}

let cache: Promise<Atlas> | null = null;
/** Loads /campus/map-data.json once per page session and builds the Path2D layers. */
function loadAtlas(): Promise<Atlas> {
  const p: Promise<Atlas> = cache ?? (async () => {
    const res = await fetch(CAMPUS_DATA_URL);
    if (!res.ok) throw new Error(`Campus map HTTP ${res.status}`);
    const d = (await res.json()) as RawData;
    const majorRoads = new Path2D();
    const minorRoads = new Path2D();
    for (const r of d.roads) addGeometry(r.highway === "primary" ? majorRoads : minorRoads, r.geometry);
    const buildings = new Path2D();
    for (const b of d.buildings) addGeometry(buildings, b.geometry);
    const fields = new Path2D();
    const water = new Path2D();
    for (const a of d.areas) {
      if (a.kind === "water") addGeometry(water, a.geometry);
      else if (a.kind === "pitch" || a.kind === "field") addGeometry(fields, a.geometry);
    }
    const boundary = new Path2D();
    addGeometry(boundary, d.boundary);
    const ring = (d.boundary.type === "Polygon" ? (d.boundary.coordinates as Pt[][]) : (d.boundary.coordinates as Pt[][][]).flat()).flat();
    const xs = ring.map((c) => c[0]);
    const ys = ring.map((c) => c[1]);
    return {
      width: d.meta.width,
      height: d.meta.height,
      campus: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as Atlas["campus"],
      boundary, majorRoads, minorRoads, buildings, fields, water,
    };
  })().catch((e) => {
    cache = null;
    throw e;
  });
  cache = p;
  return p;
}

const FALLBACK: Record<string, string> = {
  "--surface": "#ffffff", "--surface-muted": "#f0f0ef", "--surface-sunken": "#e9e9e8", "--foreground": "#111111",
  "--muted-foreground": "#66666a", "--subtle-foreground": "#8e8e93", "--border": "#e4e4e2", "--border-strong": "#d4d4d1",
  "--primary": "#111111", "--success": "#0b7a3c", "--p1": "#d4372f", "--p2": "#e0701f", "--p3": "#c99a0a", "--p4": "#1f9a5c",
};
type Palette = Record<keyof typeof FALLBACK, string> & { font: string };
function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const out = { font: getComputedStyle(document.body).fontFamily || "system-ui, sans-serif" } as Palette;
  for (const k of Object.keys(FALLBACK)) out[k] = css.getPropertyValue(k).trim() || FALLBACK[k];
  return out;
}

const markerRadius = (n: number) => (n === 0 ? 3.5 : Math.min(22, 10 + 3 * Math.sqrt(n)));
const LABEL_ZOOM = 1.1; // px per metre from which places without issues get labels

class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private cx = 0;
  private cy = 0;
  private z = 1;
  private fitZ = 1;
  private frame = 0;
  private colors: Palette;
  private hits: { id: string; x: number; y: number; r: number }[] = [];
  markers: AtlasMarker[] = [];
  selectedId: string | null = null;

  constructor(private canvas: HTMLCanvasElement, private atlas: Atlas, private compact: boolean) {
    this.ctx = canvas.getContext("2d")!;
    this.colors = readPalette();
  }

  refreshColors() {
    this.colors = readPalette();
    this.request();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const first = this.w === 0;
    this.w = r.width;
    this.h = r.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    if (first) this.fit();
    else this.draw();
  }

  fit() {
    if (!this.w || !this.h) return;
    const [x0, y0, x1, y1] = this.atlas.campus;
    this.cx = (x0 + x1) / 2;
    this.cy = (y0 + y1) / 2;
    this.fitZ = Math.min(this.w / (x1 - x0), this.h / (y1 - y0)) * (this.compact ? 1.02 : 0.94);
    this.z = this.fitZ;
    this.draw(); // synchronous: a resize just cleared the bitmap
  }

  private world(sx: number, sy: number) {
    return { x: (sx - this.w / 2) / this.z + this.cx, y: (sy - this.h / 2) / this.z + this.cy };
  }
  private screen(x: number, y: number): Pt {
    return [(x - this.cx) * this.z + this.w / 2, (y - this.cy) * this.z + this.h / 2];
  }

  zoomAt(f: number, sx = this.w / 2, sy = this.h / 2) {
    if (!Number.isFinite(f) || f <= 0) return;
    const a = this.world(sx, sy);
    this.z = Math.max(this.fitZ * 0.6, Math.min(12, this.z * f));
    const b = this.world(sx, sy);
    this.cx += a.x - b.x;
    this.cy += a.y - b.y;
    this.request();
  }

  pan(dx: number, dy: number) {
    this.cx -= dx / this.z;
    this.cy -= dy / this.z;
    // Keep the map extent in reach.
    this.cx = Math.max(0, Math.min(this.atlas.width, this.cx));
    this.cy = Math.max(0, Math.min(this.atlas.height, this.cy));
    this.request();
  }

  hit(sx: number, sy: number): string | null {
    let best: { id: string; d: number } | null = null;
    for (const p of this.hits) {
      const d = Math.hypot(sx - p.x, sy - p.y);
      if (d <= Math.max(p.r + 6, 14) && (!best || d < best.d)) best = { id: p.id, d };
    }
    return best?.id ?? null;
  }

  request() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  draw() {
    if (!this.w || !this.h) return;
    const c = this.ctx;
    const k = this.colors;
    const a = this.atlas;
    const z = this.z;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = k["--surface-muted"];
    c.fillRect(0, 0, this.w, this.h);

    c.save();
    c.translate(this.w / 2, this.h / 2);
    c.scale(z, z);
    c.translate(-this.cx, -this.cy);
    c.lineCap = "round";
    c.lineJoin = "round";
    // Campus ground a touch lighter than the surroundings.
    c.globalAlpha = 0.6;
    c.fillStyle = k["--surface"];
    c.fill(a.boundary);
    c.globalAlpha = 0.7;
    c.fillStyle = k["--surface-sunken"];
    c.fill(a.fields);
    c.fillStyle = k["--border"];
    c.fill(a.water);
    c.globalAlpha = 1;
    // Roads: casing then fill; never thinner than ~1 px on screen.
    const road = (p: Path2D, metres: number) => {
      const wpx = Math.max(metres, 1.4 / z);
      c.lineWidth = wpx + 2 / z;
      c.strokeStyle = k["--border-strong"];
      c.stroke(p);
      c.lineWidth = wpx;
      c.strokeStyle = k["--surface"];
      c.stroke(p);
    };
    road(a.minorRoads, 5);
    road(a.majorRoads, 12);
    c.fillStyle = k["--border-strong"];
    c.fill(a.buildings);
    if (z > 0.5) {
      c.lineWidth = 0.6 / z;
      c.strokeStyle = k["--muted-foreground"];
      c.globalAlpha = 0.35;
      c.stroke(a.buildings);
      c.globalAlpha = 1;
    }
    c.lineWidth = 1.5 / z;
    c.strokeStyle = k["--subtle-foreground"];
    c.setLineDash([6 / z, 5 / z]);
    c.stroke(a.boundary);
    c.setLineDash([]);
    c.restore();

    this.drawMarkers();
  }

  private drawMarkers() {
    const c = this.ctx;
    const k = this.colors;
    const fs = this.compact ? 10 : 12;
    // Busy places on top; zero-count dots first so they never hide a count.
    const pts = this.markers
      .map((m) => {
        const [x, y] = this.screen(m.x, m.y);
        return { m, x, y, r: markerRadius(m.count) * (this.compact ? 0.75 : 1) };
      })
      .filter((p) => p.x > -30 && p.y > -30 && p.x < this.w + 30 && p.y < this.h + 30)
      .sort((p, q) => Number(p.m.id === this.selectedId) - Number(q.m.id === this.selectedId) || p.m.count - q.m.count);
    this.hits = pts.map((p) => ({ id: p.m.id, x: p.x, y: p.y, r: p.r }));

    const ring = (m: AtlasMarker) =>
      m.topPriority ? k[`--p${m.topPriority}` as "--p1"] ?? k["--border-strong"] : m.fixedOnly ? k["--success"] : k["--subtle-foreground"];

    for (const { m, x, y, r } of pts) {
      const on = m.id === this.selectedId;
      if (on) {
        c.beginPath();
        c.arc(x, y, r + 5, 0, Math.PI * 2);
        c.lineWidth = 3;
        c.strokeStyle = k["--primary"];
        c.stroke();
      }
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = k["--surface"];
      if (m.count > 0) {
        c.shadowColor = "rgba(0,0,0,0.18)";
        c.shadowBlur = 4;
        c.shadowOffsetY = 1;
      }
      c.fill();
      c.shadowColor = "transparent";
      c.shadowBlur = 0;
      c.shadowOffsetY = 0;
      c.lineWidth = m.count > 0 ? (this.compact ? 2 : 3) : 1.5;
      c.strokeStyle = ring(m);
      c.stroke();
      if (m.count > 0) {
        c.fillStyle = k["--foreground"];
        c.font = `600 ${fs}px ${k.font}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(m.countText ?? String(m.count), x, y + 0.5);
      }
    }

    // Labels: places with issues first (most first), others only when zoomed in; skip overlaps.
    if (this.compact && this.markers.every((m) => !m.label)) return;
    c.font = `500 ${fs - 1}px ${k.font}`;
    c.textAlign = "left";
    c.textBaseline = "middle";
    // Discs with a count block labels; the small empty-place dots do not.
    const boxes: { x: number; y: number; w: number; h: number }[] = pts.filter((p) => p.m.count > 0).map((p) => ({ x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 }));
    const labelled = [...pts]
      .filter((p) => p.m.label && (p.m.count > 0 || p.m.id === this.selectedId || (!this.compact && this.z >= LABEL_ZOOM)))
      .sort((p, q) => Number(q.m.id === this.selectedId) - Number(p.m.id === this.selectedId) || q.m.count - p.m.count);
    const maxW = this.compact ? 110 : 150;
    for (const p of labelled) {
      let text = p.m.label!;
      while (text.length > 4 && c.measureText(text).width > maxW) text = text.slice(0, -2);
      if (text !== p.m.label) text = text.trimEnd() + "…";
      const tw = c.measureText(text).width;
      const bw = tw + 10;
      const bh = fs + 6;
      const b = { x: p.x + p.r + 4, y: p.y - bh / 2, w: bw, h: bh };
      if (b.x + bw > this.w - 2) b.x = p.x - p.r - 4 - bw; // flip left at the right edge
      if (b.x < 2 || b.y < 2 || b.y + bh > this.h - 2) continue;
      if (boxes.some((o) => b.x < o.x + o.w && b.x + bw > o.x && b.y < o.y + o.h && b.y + bh > o.y)) continue;
      boxes.push(b);
      c.globalAlpha = 0.92;
      c.fillStyle = k["--surface"];
      c.beginPath();
      c.roundRect(b.x, b.y, bw, bh, 6);
      c.fill();
      c.globalAlpha = 1;
      c.fillStyle = p.m.count > 0 || p.m.id === this.selectedId ? k["--foreground"] : k["--muted-foreground"];
      c.fillText(text, b.x + 5, b.y + bh / 2 + 0.5);
    }
  }
}

type Props = {
  markers: AtlasMarker[];
  /** Accessible name of the map image. Interactive maps should also offer a list of the same places. */
  label: string;
  /** Small, non-interactive card map (admin dashboard). */
  compact?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
};

/** Real campus map: pan (drag), zoom (wheel, pinch, + / − / Home keys and buttons), tap a marker to select it. */
export function CampusAtlas({ markers, label, compact = false, selectedId = null, onSelect, className }: Props) {
  const t = useTranslations("map");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const onSelectRef = useRef(onSelect);
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; atlas?: Atlas }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let alive = true;
    loadAtlas().then(
      (atlas) => alive && setState({ status: "ready", atlas }),
      () => alive && setState({ status: "error" }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  // Build the renderer and wire input once the geometry is in.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (state.status !== "ready" || !state.atlas || !canvas) return;
    const r = new Renderer(canvas, state.atlas, compact);
    rendererRef.current = r;
    const ro = new ResizeObserver(() => r.resize());
    ro.observe(canvas);
    r.resize();
    // Theme switch (`dark` class on <html>) → re-read the tokens.
    const mo = new MutationObserver(() => r.refreshColors());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });

    const cleanups: (() => void)[] = [];
    if (!compact) {
      const pointers = new Map<number, Pt>();
      let moved = false;
      const pos = (e: PointerEvent | WheelEvent): Pt => {
        const b = canvas.getBoundingClientRect();
        return [e.clientX - b.left, e.clientY - b.top];
      };
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        const [x, y] = pos(e);
        r.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y);
      };
      const down = (e: PointerEvent) => {
        canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, pos(e));
        moved = false;
      };
      const move = (e: PointerEvent) => {
        const p = pos(e);
        const old = pointers.get(e.pointerId);
        if (!old) {
          canvas.style.cursor = r.hit(p[0], p[1]) ? "pointer" : "grab";
          return;
        }
        const before = [...pointers.values()];
        pointers.set(e.pointerId, p);
        const after = [...pointers.values()];
        if (after.length === 2) {
          const dist = (v: Pt[]) => Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]);
          r.zoomAt(dist(after) / Math.max(1, dist(before)), (after[0][0] + after[1][0]) / 2, (after[0][1] + after[1][1]) / 2);
          moved = true;
        } else {
          if (Math.hypot(p[0] - old[0], p[1] - old[1]) > 2) moved = true;
          r.pan(p[0] - old[0], p[1] - old[1]);
          canvas.style.cursor = "grabbing";
        }
      };
      const up = (e: PointerEvent) => {
        if (!pointers.has(e.pointerId)) return;
        const tap = pointers.size === 1 && !moved;
        pointers.delete(e.pointerId);
        canvas.style.cursor = "grab";
        if (tap) {
          const [x, y] = pos(e);
          const id = r.hit(x, y);
          if (id) onSelectRef.current?.(id);
        }
      };
      const cancel = (e: PointerEvent) => pointers.delete(e.pointerId);
      const key = (e: KeyboardEvent) => {
        const step = 60;
        if (e.key === "+" || e.key === "=") r.zoomAt(1.5);
        else if (e.key === "-" || e.key === "_") r.zoomAt(1 / 1.5);
        else if (e.key === "Home" || e.key === "0") r.fit();
        else if (e.key === "ArrowLeft") r.pan(step, 0);
        else if (e.key === "ArrowRight") r.pan(-step, 0);
        else if (e.key === "ArrowUp") r.pan(0, step);
        else if (e.key === "ArrowDown") r.pan(0, -step);
        else return;
        e.preventDefault();
      };
      canvas.addEventListener("wheel", wheel, { passive: false });
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", cancel);
      canvas.addEventListener("keydown", key);
      cleanups.push(() => {
        canvas.removeEventListener("wheel", wheel);
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("pointercancel", cancel);
        canvas.removeEventListener("keydown", key);
      });
    }
    return () => {
      cleanups.forEach((f) => f());
      ro.disconnect();
      mo.disconnect();
      r.destroy();
      rendererRef.current = null;
    };
  }, [state, compact]);

  // Markers and selection change without rebuilding the renderer.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.markers = markers;
    r.selectedId = selectedId;
    r.draw();
  }, [markers, selectedId, state]);

  const ctl =
    "grid size-10 place-items-center rounded-full border border-border bg-surface text-foreground shadow-sm transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className={cn("relative overflow-hidden bg-surface-muted", className)}>
      {state.status === "loading" && (
        <div className="absolute inset-0" aria-busy="true">
          <Skeleton className="size-full rounded-none" />
          <span className="sr-only">{t("loading")}</span>
        </div>
      )}
      {state.status === "error" && (
        <div className="absolute inset-0 grid place-items-center p-4">
          <ErrorState
            bare
            title={t("loadErrorTitle")}
            body={t("loadErrorBody")}
            onRetry={() => {
              setState({ status: "loading" });
              setAttempt((a) => a + 1);
            }}
          />
        </div>
      )}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={compact ? label : `${label}. ${t("atlasKeys")}`}
        tabIndex={compact ? -1 : 0}
        className={cn(
          "absolute inset-0 block size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          !compact && "cursor-grab touch-none",
          state.status !== "ready" && "invisible",
        )}
      />
      {state.status === "ready" && !compact && (
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          <button type="button" className={ctl} aria-label={t("zoomIn")} onClick={() => rendererRef.current?.zoomAt(1.5)}>
            <Plus className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" className={ctl} aria-label={t("zoomOut")} onClick={() => rendererRef.current?.zoomAt(1 / 1.5)}>
            <Minus className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" className={ctl} aria-label={t("resetView")} onClick={() => rendererRef.current?.fit()}>
            <Maximize2 className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <p className={cn("absolute bottom-2 left-2 rounded-full bg-surface/90 px-2.5 py-1 text-muted-foreground ring-1 ring-border", compact ? "text-[10px]" : "text-[11px]")}>
          {!compact && <>{t("atlasCaption")} · </>}
          <a href={CAMPUS_ATTRIBUTION_URL} target="_blank" rel="noopener" className="underline-offset-2 hover:text-foreground hover:underline">
            {t("attribution")}
          </a>
        </p>
      )}
    </div>
  );
}
