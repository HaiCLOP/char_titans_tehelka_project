"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Maximize2, Minus, Plus } from "lucide-react";
import { ErrorState, Skeleton } from "@/components/ui";
import { CAMPUS_ATTRIBUTION_URL, CAMPUS_DATA_URL } from "@/lib/campus";
import { cn } from "@/lib/utils";

// Canvas renderer for the real Dibrugarh University geometry (OpenStreetMap + Overture + the 2020 audit
// land cover, local metres), ported from the map kit's viewer. It is drawn like a printed campus atlas:
// sage ground, raised terracotta blocks (fake 2.5D: shadow, stacked side faces, lifted roof), tree
// clusters, fields, water and cream roads. Colours come from the --map-* tokens in globals.css.
// The static world is cached in an offscreen canvas per zoom level; panning only blits it.

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
  /** Audit land cover: forest, field (bare / sand), pitch, water. */
  cover?: { kind: string; geometry: Geometry }[];
  /** `o` = OpenStreetMap footprint (drawn a shade darker, as in the kit). */
  buildings: { geometry: Geometry; o?: number }[];
  /** [x, y, diameter] in metres; decorative, not surveyed trees. */
  trees?: [number, number, number][];
  boundary: Geometry;
  /** 500 m surroundings envelope. */
  buffer?: Geometry;
};
type Atlas = {
  width: number;
  height: number;
  /** Campus outline bounding box in metres: [minX, minY, maxX, maxY]. */
  campus: [number, number, number, number];
  boundary: Path2D;
  buffer: Path2D | null;
  land: Path2D;
  forest: Path2D;
  sand: Path2D;
  fields: Path2D;
  water: Path2D;
  roads: { primary: Path2D; minor: Path2D; service: Path2D; track: Path2D };
  /** Footprints split by fake height (small / large) and source (for the roof shade), bucketed by area. */
  low: Cell[];
  high: Cell[];
  osm: Cell[];
  /** Tree canopy blobs (p) and their sunlit highlights (q). */
  trees: Cell[];
};
/** A spatial bucket: only buckets that touch the view are painted, so zoomed-in rebuilds stay cheap. */
type Cell = { x0: number; y0: number; x1: number; y1: number; p: Path2D; q: Path2D };
const CELL = 250; // metres

class Grid {
  private cells = new Map<number, Cell>();
  /** Adds a feature with bounding box [x0, y0, x1, y1] to the bucket of its centre. */
  add(b: [number, number, number, number], draw: (cell: Cell) => void) {
    const key = Math.floor((b[0] + b[2]) / 2 / CELL) * 1000 + Math.floor((b[1] + b[3]) / 2 / CELL);
    let c = this.cells.get(key);
    if (!c) this.cells.set(key, (c = { x0: b[0], y0: b[1], x1: b[2], y1: b[3], p: new Path2D(), q: new Path2D() }));
    c.x0 = Math.min(c.x0, b[0]);
    c.y0 = Math.min(c.y0, b[1]);
    c.x1 = Math.max(c.x1, b[2]);
    c.y1 = Math.max(c.y1, b[3]);
    draw(c);
  }
  list() {
    return [...this.cells.values()];
  }
}

function bbox(g: Geometry): [number, number, number, number] {
  const pts = (g.type === "Polygon" ? (g.coordinates as Pt[][]).flat() : g.type === "MultiPolygon" ? (g.coordinates as Pt[][][]).flat(2) : []) as Pt[];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

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

/** Shoelace area of a polygon's outer ring(s), m². */
function footprintArea(g: Geometry): number {
  const rings = g.type === "Polygon" ? [(g.coordinates as Pt[][])[0]] : g.type === "MultiPolygon" ? (g.coordinates as Pt[][][]).map((a) => a[0]) : [];
  let s = 0;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(s / 2);
}

/** Stable 0..1 pseudo-random value from a tree position (same look on every render). */
function seeded(x: number, y: number, salt: number) {
  const v = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

let cache: Promise<Atlas> | null = null;
/** Loads /campus/map-data.json once per page session and builds the Path2D layers. */
function loadAtlas(): Promise<Atlas> {
  const p: Promise<Atlas> = cache ?? (async () => {
    const res = await fetch(CAMPUS_DATA_URL);
    if (!res.ok) throw new Error(`Campus map HTTP ${res.status}`);
    const d = (await res.json()) as RawData;
    const roads = { primary: new Path2D(), minor: new Path2D(), service: new Path2D(), track: new Path2D() };
    for (const r of d.roads) {
      const key = r.highway === "primary" ? "primary" : r.highway === "track" ? "track" : r.highway === "service" ? "service" : "minor";
      addGeometry(roads[key], r.geometry);
    }
    const low = new Grid();
    const high = new Grid();
    const osm = new Grid();
    for (const b of d.buildings) {
      const box = bbox(b.geometry);
      (footprintArea(b.geometry) > 450 ? high : low).add(box, (c) => addGeometry(c.p, b.geometry));
      if (b.o) osm.add(box, (c) => addGeometry(c.p, b.geometry));
    }
    const land = new Path2D();
    const forest = new Path2D();
    const sand = new Path2D();
    const fields = new Path2D();
    const water = new Path2D();
    for (const a of [...d.areas, ...(d.cover ?? [])]) {
      if (a.kind === "water") addGeometry(water, a.geometry);
      else if (a.kind === "pitch") addGeometry(fields, a.geometry);
      else if (a.kind === "field") addGeometry(sand, a.geometry);
      else if (a.kind === "forest") addGeometry(forest, a.geometry);
      else if (a.kind === "land") addGeometry(land, a.geometry);
    }
    // Each tree is a small cluster of overlapping blobs (seeded by its position) plus a highlight.
    const trees = new Grid();
    for (const [x, y, s] of d.trees ?? []) {
      const r = s / 2;
      trees.add([x - r, y - r, x + r, y + r], ({ p: canopy, q: canopyLight }) => {
        const blobs = 3 + Math.floor(seeded(x, y, 1) * 2);
        const turn = seeded(x, y, 2) * Math.PI * 2;
        for (let i = 0; i < blobs; i++) {
          const a = turn + (i / blobs) * Math.PI * 2;
          const br = r * (0.5 + seeded(x, y, 3 + i) * 0.14);
          const bx = x + Math.cos(a) * r * 0.36;
          const by = y + Math.sin(a) * r * 0.36;
          canopy.moveTo(bx + br, by);
          canopy.arc(bx, by, br, 0, Math.PI * 2);
          const lr = br * 0.42;
          const lx = bx - br * 0.28;
          const ly = by - br * 0.32;
          canopyLight.moveTo(lx + lr, ly);
          canopyLight.arc(lx, ly, lr, 0, Math.PI * 2);
        }
      });
    }
    const boundary = new Path2D();
    addGeometry(boundary, d.boundary);
    let buffer: Path2D | null = null;
    if (d.buffer) {
      buffer = new Path2D();
      addGeometry(buffer, d.buffer);
    }
    const ring = (d.boundary.type === "Polygon" ? (d.boundary.coordinates as Pt[][]) : (d.boundary.coordinates as Pt[][][]).flat()).flat();
    const xs = ring.map((c) => c[0]);
    const ys = ring.map((c) => c[1]);
    return {
      width: d.meta.width,
      height: d.meta.height,
      campus: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as Atlas["campus"],
      boundary, buffer, land, forest, sand, fields, water, roads,
      low: low.list(), high: high.list(), osm: osm.list(), trees: trees.list(),
    };
  })().catch((e) => {
    cache = null;
    throw e;
  });
  cache = p;
  return p;
}

const TOKENS = [
  "--map-outside", "--map-surround", "--map-ground", "--map-land", "--map-forest", "--map-field", "--map-sand",
  "--map-water", "--map-water-edge", "--map-road", "--map-road-edge", "--map-road-line", "--map-building",
  "--map-building-osm", "--map-building-side", "--map-building-edge", "--map-shadow", "--map-tree", "--map-tree-light",
  "--map-tree-edge", "--map-campus-edge", "--map-outer-edge", "--map-label", "--map-label-text", "--map-label-muted",
  "--map-marker", "--map-marker-text", "--map-select", "--success", "--p1", "--p2", "--p3", "--p4",
] as const;
type Palette = Record<(typeof TOKENS)[number], string> & { font: string };
function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const out = { font: getComputedStyle(document.body).fontFamily || "system-ui, sans-serif" } as Palette;
  for (const k of TOKENS) out[k] = css.getPropertyValue(k).trim() || "transparent";
  return out;
}

const markerRadius = (n: number) => (n === 0 ? 3.5 : Math.min(22, 10 + 3 * Math.sqrt(n)));
const LABEL_ZOOM = 1.1; // px per metre from which places without issues get labels
/** Offscreen cache budget in device pixels (≈ 40 MB RGBA at most). */
const CACHE_PIXELS = 10e6;

type StaticLayer = { canvas: HTMLCanvasElement; z: number; dpr: number; x0: number; y0: number; w: number; h: number };

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
  private layer: StaticLayer | null = null;
  private bitmap: HTMLCanvasElement | null = null;
  private lastZoom = 0;
  private settle: ReturnType<typeof setTimeout> | null = null;
  markers: AtlasMarker[] = [];
  selectedId: string | null = null;

  constructor(private canvas: HTMLCanvasElement, private atlas: Atlas, private compact: boolean) {
    this.ctx = canvas.getContext("2d")!;
    this.colors = readPalette();
  }

  refreshColors() {
    this.colors = readPalette();
    this.layer = null;
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
    this.layer = null;
    if (first) this.fit();
    else this.draw();
  }

  fit() {
    if (!this.w || !this.h) return;
    const [x0, y0, x1, y1] = this.atlas.campus;
    this.cx = (x0 + x1) / 2;
    this.cy = (y0 + y1) / 2;
    this.fitZ = Math.min(this.w / (x1 - x0), this.h / (y1 - y0)) * (this.compact ? 1.02 : 1);
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
    this.lastZoom = performance.now();
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
    if (this.settle) clearTimeout(this.settle);
    this.layer = null;
    this.bitmap = null;
  }

  /** The cached static world for the current view: reused while panning, scaled while zooming, rebuilt when idle. */
  private staticLayer(): StaticLayer {
    const L = this.layer;
    const vx0 = this.cx - this.w / 2 / this.z;
    const vy0 = this.cy - this.h / 2 / this.z;
    if (L && L.z === this.z && L.dpr === this.dpr) {
      const inside = vx0 >= L.x0 && vy0 >= L.y0 && vx0 + this.w / this.z <= L.x0 + L.w / L.z && vy0 + this.h / this.z <= L.y0 + L.h / L.z;
      if (inside) return L;
    } else if (L && L.dpr === this.dpr && performance.now() - this.lastZoom < 160) {
      // Mid-gesture: stretch the last bitmap and re-render once the zoom settles.
      if (this.settle) clearTimeout(this.settle);
      this.settle = setTimeout(() => {
        this.settle = null;
        this.lastZoom = 0;
        this.request();
      }, 170);
      return L;
    }
    return this.buildLayer();
  }

  private buildLayer(): StaticLayer {
    // Margin around the viewport (CSS px) so short pans reuse the bitmap; capped by the pixel budget.
    let m = this.compact ? 0 : 256;
    while (m > 0 && (this.w + 2 * m) * (this.h + 2 * m) * this.dpr * this.dpr > CACHE_PIXELS) m -= 32;
    const w = this.w + 2 * m;
    const h = this.h + 2 * m;
    const canvas = (this.bitmap ??= document.createElement("canvas")); // one bitmap, reused
    canvas.width = Math.round(w * this.dpr);
    canvas.height = Math.round(h * this.dpr);
    const x0 = this.cx - (this.w / 2 + m) / this.z;
    const y0 = this.cy - (this.h / 2 + m) / this.z;
    const c = canvas.getContext("2d")!;
    const s = this.dpr * this.z;
    c.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    this.paintWorld(c, this.z, [x0, y0, x0 + w / this.z, y0 + h / this.z]);
    this.layer = { canvas, z: this.z, dpr: this.dpr, x0, y0, w, h };
    return this.layer;
  }

  /** Static atlas in world units (metres). `z` is screen px per metre; all screen-size values divide by it. */
  private paintWorld(c: CanvasRenderingContext2D, z: number, view: [number, number, number, number]) {
    const k = this.colors;
    const a = this.atlas;
    const px = 1 / z;
    // Buckets touching the view (padded for shadows and lifted roofs).
    const pad = 12 * px + 6;
    const near = (cells: Cell[]) =>
      cells.filter((q) => q.x1 >= view[0] - pad && q.x0 <= view[2] + pad && q.y1 >= view[1] - pad && q.y0 <= view[3] + pad);
    const trees = near(a.trees);
    const low = near(a.low);
    const high = near(a.high);
    const osm = near(a.osm);
    const fillAll = (cells: Cell[], rule?: CanvasFillRule) => cells.forEach((q) => c.fill(q.p, rule));
    c.lineCap = "round";
    c.lineJoin = "round";
    c.fillStyle = k["--map-outside"];
    c.fillRect(-2000, -2000, a.width + 4000, a.height + 4000);
    if (a.buffer) {
      c.fillStyle = k["--map-surround"];
      c.fill(a.buffer);
    }
    c.fillStyle = k["--map-ground"];
    c.fill(a.boundary);
    c.fillStyle = k["--map-land"];
    c.fill(a.land, "evenodd");
    c.fillStyle = k["--map-forest"];
    c.fill(a.forest, "evenodd");
    c.fillStyle = k["--map-sand"];
    c.fill(a.sand, "evenodd");
    c.fillStyle = k["--map-field"];
    c.fill(a.fields, "evenodd");
    c.fillStyle = k["--map-water"];
    c.fill(a.water, "evenodd");
    c.lineWidth = Math.max(1, 0.8 * px);
    c.strokeStyle = k["--map-water-edge"];
    c.stroke(a.water);

    // Trees: soft drop shadow, clustered canopy with darker outlines, sunlit highlights.
    c.save();
    c.translate(1.6, 2.2);
    c.fillStyle = k["--map-shadow"];
    fillAll(trees);
    c.restore();
    c.fillStyle = k["--map-tree"];
    fillAll(trees);
    if (z > 0.35) {
      c.lineWidth = Math.min(0.9, 0.9 * px);
      c.strokeStyle = k["--map-tree-edge"];
      trees.forEach((q) => c.stroke(q.p));
      c.fillStyle = k["--map-tree-light"];
      trees.forEach((q) => c.fill(q.q));
    }

    // Roads: darker casing, cream fill; never thinner than ~1 px on screen.
    const casing = (p: Path2D, metres: number) => {
      c.lineWidth = Math.max(metres + 2.4, 2 * px);
      c.strokeStyle = k["--map-road-edge"];
      c.stroke(p);
    };
    const fill = (p: Path2D, metres: number) => {
      c.lineWidth = Math.max(metres, 1.1 * px);
      c.strokeStyle = k["--map-road"];
      c.stroke(p);
    };
    casing(a.roads.track, 3);
    casing(a.roads.service, 4);
    casing(a.roads.minor, 6);
    casing(a.roads.primary, 13);
    c.setLineDash([4, 3]);
    fill(a.roads.track, 3);
    c.setLineDash([]);
    fill(a.roads.service, 4);
    fill(a.roads.minor, 6);
    fill(a.roads.primary, 13);
    if (z > 0.8) {
      c.lineWidth = Math.max(0.6, 0.6 * px);
      c.strokeStyle = k["--map-road-line"];
      c.setLineDash([7, 5]);
      c.stroke(a.roads.primary);
      c.setLineDash([]);
    }

    // Buildings, fake 2.5D: offset shadow, side faces (footprint stacked upwards), lifted roof.
    const lift = (metres: number) => Math.min(metres, 9 * px); // never taller than ~9 screen px
    const raise = (cells: Cell[], metres: number) => {
      const top = lift(metres);
      const steps = Math.max(1, Math.min(6, Math.ceil((top * z) / 1.5)));
      c.fillStyle = k["--map-building-side"];
      for (let i = 0; i < steps; i++) {
        c.save();
        c.translate(0, (-top * i) / steps);
        fillAll(cells, "evenodd");
        c.restore();
      }
      return top;
    };
    c.save();
    c.translate(1.8, 2.4);
    c.fillStyle = k["--map-shadow"];
    fillAll(low, "evenodd");
    fillAll(high, "evenodd");
    c.restore();
    const roofs: [Cell[], number][] = [[low, 1.8], [high, 3.4]];
    const edge = Math.max(0.5 * px, Math.min(0.55, 0.7 * px));
    for (const [p, metres] of roofs) {
      const top = z > 0.25 ? raise(p, metres) : 0;
      c.save();
      c.translate(0, -top);
      c.fillStyle = k["--map-building"];
      fillAll(p, "evenodd");
      if (z > 0.35) {
        c.lineWidth = edge;
        c.strokeStyle = k["--map-building-edge"];
        p.forEach((q) => c.stroke(q.p));
      }
      c.restore();
    }
    // OSM-mapped buildings (the named university blocks) a shade deeper, like the kit.
    c.save();
    c.translate(0, -(z > 0.25 ? lift(3.4) : 0));
    c.fillStyle = k["--map-building-osm"];
    fillAll(osm, "evenodd");
    c.restore();

    // Boundaries: surroundings (blue) and campus (red-orange), dashed at constant screen size.
    if (a.buffer) {
      c.lineWidth = 1.6 * px;
      c.strokeStyle = k["--map-outer-edge"];
      c.setLineDash([7 * px, 6 * px]);
      c.stroke(a.buffer);
    }
    c.lineWidth = 2.2 * px;
    c.strokeStyle = k["--map-campus-edge"];
    c.setLineDash([7 * px, 4 * px]);
    c.stroke(a.boundary);
    c.setLineDash([]);
  }

  draw() {
    if (!this.w || !this.h) return;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = this.colors["--map-outside"];
    c.fillRect(0, 0, this.w, this.h);
    const L = this.staticLayer();
    const s = this.z / L.z;
    const [sx, sy] = this.screen(L.x0, L.y0);
    c.imageSmoothingEnabled = true;
    c.drawImage(L.canvas, sx, sy, L.w * s, L.h * s);
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
      m.topPriority ? k[`--p${m.topPriority}` as "--p1"] ?? k["--map-label"] : m.fixedOnly ? k["--success"] : k["--map-label"];

    for (const { m, x, y, r } of pts) {
      const on = m.id === this.selectedId;
      if (on) {
        c.beginPath();
        c.arc(x, y, r + 5, 0, Math.PI * 2);
        c.lineWidth = 3;
        c.strokeStyle = k["--map-select"];
        c.stroke();
      }
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = k["--map-marker"];
      c.shadowColor = k["--map-shadow"];
      c.shadowBlur = m.count > 0 ? 4 : 2;
      c.shadowOffsetY = 1;
      c.fill();
      c.shadowColor = "transparent";
      c.shadowBlur = 0;
      c.shadowOffsetY = 0;
      if (m.count > 0) {
        // Priority ring (meaning) with a thin cream keyline so it reads on any ground.
        c.lineWidth = this.compact ? 2 : 3;
        c.strokeStyle = ring(m);
        c.stroke();
        c.beginPath();
        c.arc(x, y, r + (this.compact ? 1.5 : 2), 0, Math.PI * 2);
        c.lineWidth = 1;
        c.strokeStyle = k["--map-label"];
        c.stroke();
        c.fillStyle = k["--map-marker-text"];
        c.font = `600 ${fs}px ${k.font}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(m.countText ?? String(m.count), x, y + 0.5);
      } else {
        c.lineWidth = 1.5;
        c.strokeStyle = k["--map-label"];
        c.stroke();
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
      const bw = tw + 12;
      const bh = fs + 8;
      const b = { x: p.x + p.r + 5, y: p.y - bh / 2, w: bw, h: bh };
      if (b.x + bw > this.w - 2) b.x = p.x - p.r - 5 - bw; // flip left at the right edge
      if (b.x < 2 || b.y < 2 || b.y + bh > this.h - 2) continue;
      if (boxes.some((o) => b.x < o.x + o.w && b.x + bw > o.x && b.y < o.y + o.h && b.y + bh > o.y)) continue;
      boxes.push(b);
      c.fillStyle = k["--map-label"];
      c.shadowColor = k["--map-shadow"];
      c.shadowBlur = 3;
      c.shadowOffsetY = 1;
      c.beginPath();
      c.roundRect(b.x, b.y, bw, bh, 5);
      c.fill();
      c.shadowColor = "transparent";
      c.shadowBlur = 0;
      c.shadowOffsetY = 0;
      c.fillStyle = p.m.count > 0 || p.m.id === this.selectedId ? k["--map-label-text"] : k["--map-label-muted"];
      c.fillText(text, b.x + 6, b.y + bh / 2 + 0.5);
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
