// Dibrugarh University campus map kit: shared constants (no React, safe on server and client).
// Map coordinates are LOCAL METRES (x right, y down) in public/campus/map-data.json.
// `locations.map_x/map_y` store them as 0..1 fractions of this extent.

export const CAMPUS_EXTENT = { width: 3141.49, height: 2357.16 } as const;
export const CAMPUS_DATA_URL = "/campus/map-data.json";
export const CAMPUS_ATTRIBUTION_URL = "/campus/ATTRIBUTION.txt";

/** `locations.map_x/map_y` (0..1) → local metres, or null when the place has no map position. */
export function locationMetres(l: { map_x: number | null; map_y: number | null }): { x: number; y: number } | null {
  if (l.map_x == null || l.map_y == null) return null;
  return { x: l.map_x * CAMPUS_EXTENT.width, y: l.map_y * CAMPUS_EXTENT.height };
}

/** 60 pixel characters in /campus/team-characters.webp: 10 columns × 6 rows, 64 × 80 px frames. */
export const CHARACTER_COUNT = 60;
export const CHARACTER_SHEET = { url: "/campus/team-characters.webp", cols: 10, rows: 6, frameW: 64, frameH: 80 } as const;

/** Stable character for a user without a saved choice (FNV-1a hash of the id → 0..59). */
export function defaultCharacter(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % CHARACTER_COUNT;
}

export function resolveCharacter(characterId: number | null | undefined, seed: string | null | undefined): number | null {
  if (characterId != null && characterId >= 0 && characterId < CHARACTER_COUNT) return characterId;
  return seed ? defaultCharacter(seed) : null;
}
