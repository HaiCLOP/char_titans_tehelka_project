import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Point = [number, number];
type Shape = { coordinates?: Point[][] };
type Campus = { meta: { utmOrigin: [number, number] }; boundary: Shape; buffer: Shape };

function exifGps(bytes: Uint8Array): { lat: number; lon: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]; const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(offset + 4, offset + 10)) === "Exif\0\0") {
      const tiff = offset + 10; const little = bytes[tiff] === 0x49;
      const u16 = (n: number) => view.getUint16(n, little); const u32 = (n: number) => view.getUint32(n, little);
      if (u16(tiff + 2) !== 42) return null;
      const readIfd = (at: number) => {
        const result = new Map<number, { type: number; count: number; value: number; entry: number }>();
        const n = u16(at);
        for (let i = 0; i < n; i++) { const e = at + 2 + i * 12; result.set(u16(e), { type: u16(e + 2), count: u32(e + 4), value: u32(e + 8), entry: e }); }
        return result;
      };
      const ifd0 = readIfd(tiff + u32(tiff + 4)); const gpsTag = ifd0.get(0x8825);
      if (!gpsTag) return null;
      const gps = readIfd(tiff + gpsTag.value);
      const ascii = (tag: number) => { const x = gps.get(tag); if (!x) return ""; const start = x.count <= 4 ? x.entry + 8 : tiff + x.value; return String.fromCharCode(...bytes.subarray(start, start + x.count)).replaceAll("\0", ""); };
      const rationals = (tag: number) => { const x = gps.get(tag); if (!x || x.count < 3) return null; const start = tiff + x.value; return [0,1,2].map((i) => { const p = start + i * 8; return u32(p) / Math.max(1, u32(p + 4)); }); };
      const coordinate = (tag: number, refTag: number) => { const v = rationals(tag); if (!v) return null; const deg = v[0] + v[1] / 60 + v[2] / 3600; return ascii(refTag).startsWith("S") || ascii(refTag).startsWith("W") ? -deg : deg; };
      const lat = coordinate(2, 1), lon = coordinate(4, 3);
      return lat != null && lon != null ? { lat, lon } : null;
    }
    if (length < 2) break;
    offset += 2 + length;
  }
  // QuickTime's ©xyz atom often stores ISO-6709 coordinates as +lat+lon+alt/.
  const text = new TextDecoder("latin1").decode(bytes);
  const match = text.match(/[+-]\d{2}(?:\.\d+)?[+-]\d{3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?\//);
  if (match) { const pair = match[0].match(/[+-]\d{2,3}(?:\.\d+)?/g); if (pair?.length && pair.length >= 2) return { lat: Number(pair[0]), lon: Number(pair[1]) }; }
  return null;
}

// WGS84 geographic coordinates to UTM zone 46N (the campus map's EPSG:32646).
function toUtm({ lat, lon }: { lat: number; lon: number }): Point {
  const a = 6378137, ecc = 0.00669438, k0 = 0.9996, latR = lat * Math.PI / 180, lonR = lon * Math.PI / 180;
  const lon0 = 93 * Math.PI / 180, ep = ecc / (1 - ecc), n = a / Math.sqrt(1 - ecc * Math.sin(latR) ** 2);
  const t = Math.tan(latR) ** 2, c = ep * Math.cos(latR) ** 2, A = Math.cos(latR) * (lonR - lon0);
  const m = a * ((1-ecc/4-3*ecc**2/64-5*ecc**3/256)*latR-(3*ecc/8+3*ecc**2/32+45*ecc**3/1024)*Math.sin(2*latR)+(15*ecc**2/256+45*ecc**3/1024)*Math.sin(4*latR)-(35*ecc**3/3072)*Math.sin(6*latR));
  return [500000 + k0*n*(A+(1-t+c)*A**3/6+(5-18*t+t*t+72*c-58*ep)*A**5/120), k0*(m+n*Math.tan(latR)*(A**2/2+(5-t+9*c+4*c*c)*A**4/24+(61-58*t+t*t+600*c-330*ep)*A**6/720))];
}
function inside([x,y]: Point, polygon: Point[]) { let yes = false; for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) { const [xi,yi]=polygon[i], [xj,yj]=polygon[j]; if (((yi>y)!==(yj>y)) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) yes=!yes; } return yes; }

export async function inspectMediaLocation(sources: Uint8Array[]) {
  const points = sources.map(exifGps).filter((point): point is { lat: number; lon: number } => Boolean(point));
  if (points.length === 0) return { status: "no_gps" as const };
  const file = path.join(process.cwd(), "public", "campus", "map-data.json");
  const campus = JSON.parse(await readFile(file, "utf8")) as Campus;
  const origin = campus.meta.utmOrigin;
  const boundary = campus.boundary.coordinates?.[0] ?? [];
  const buffer = campus.buffer.coordinates?.[0] ?? [];
  const statuses = points.map((gps) => {
    const [easting,northing] = toUtm(gps);
    const point: Point = [easting-origin[0], origin[1]-northing];
    if (inside(point, boundary)) return "inside_campus";
    return inside(point, buffer) ? "nearby_outside_campus" : "outside_campus";
  });
  if (statuses.includes("outside_campus")) return { status: "outside_campus" as const };
  if (statuses.includes("nearby_outside_campus")) return { status: "nearby_outside_campus" as const };
  return { status: "inside_campus" as const };
}
