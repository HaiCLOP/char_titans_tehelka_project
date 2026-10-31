// Shared by src/proxy.ts and src/lib/sys.ts (no server-only import: the proxy bundles this file).

/** Request header the proxy sets only on its own rewrite of the secret panel path to /sys. */
export const SYS_HEADER = "x-cs-sys";

/** The secret first path segment of the system panel (SYS_PANEL_PATH), or null when unset or malformed. */
export function sysPanelSegment(): string | null {
  const s = (process.env.SYS_PANEL_PATH ?? "").trim().replace(/^\/+|\/+$/g, "");
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) && s !== "sys" ? s : null;
}
