// First-party telemetry (standards/telemetry.md v1), copied from
// wallabout-design/site (worker/telemetry.ts): pure logic for POST /api/event.
// The browser script is src/telemetry.ts; worker/index.ts writes the data point.
// No cookies, no stored IP addresses.
import { isbot } from "isbot";

export const EVENT_PATH = "/api/event";
export const SITE_ID = "album-guide";
export const MAX_BODY_BYTES = 2048;

export const EVENT_TYPES = ["pageview", "engage", "vital"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const VITALS = ["LCP", "INP", "CLS"] as const;

export type TelemetryEvent = {
  type: EventType;
  path: string;
  referrer: string; // hostname, or ""
  utm: [source: string, medium: string, campaign: string];
  vital: string; // "LCP" | "INP" | "CLS" for vital events, else ""
  value: number; // engage: ms. vital: the metric. pageview: 0
  width: number;
  // The page's build (baked into the bundle by vite.config.ts): the Worker is a
  // static site's only code, so the page is what knows which commit was built.
  build: string;
};

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Hostname of a referrer URL, or "" if it isn't one. */
export function referrerHost(referrer: string): string {
  try {
    return new URL(referrer).hostname;
  } catch {
    return "";
  }
}

/** Validates the JSON body the browser sends. Null if it isn't a known event. */
export function parseEvent(text: string): TelemetryEvent | null {
  if (text.length > MAX_BODY_BYTES) return null;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const type = EVENT_TYPES.find((t) => t === raw.type);
  if (!type) return null;
  const path = str(raw.path, 200).split(/[?#]/)[0];
  if (!path.startsWith("/")) return null;
  const vital = type === "vital" ? VITALS.find((v) => v === raw.name) : "";
  if (vital === undefined) return null;
  return {
    type,
    path,
    referrer: referrerHost(str(raw.referrer, 500)),
    utm: [str(raw.utm_source, 100), str(raw.utm_medium, 100), str(raw.utm_campaign, 100)],
    vital,
    value: type === "pageview" ? 0 : num(raw.value),
    width: Math.round(num(raw.width)),
    build: typeof raw.build === "string" && /^[0-9a-f]{7}$/.test(raw.build) ? raw.build : "",
  };
}

/** Bots and visitors who sent Global Privacy Control are not counted. */
export function shouldDrop(userAgent: string, gpc: string | null): boolean {
  return gpc === "1" || !userAgent || isbot(userAgent);
}

export function deviceClass(ua: string): "mobile" | "tablet" | "desktop" {
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return "mobile";
  return "desktop";
}

export function browserFamily(ua: string): string {
  if (/Edg(e|A|iOS)?\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Firefox\/|FxiOS\//.test(ua)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}

/**
 * First 16 hex characters of SHA-256 of `salt:YYYY-MM-DD (UTC):site:ip:ua`. The
 * date changes it daily, so visitors count within a day but aren't tracked
 * across days.
 */
export async function visitorHash(salt: string, now: Date, ip: string, ua: string): Promise<string> {
  const input = `${salt}:${now.toISOString().slice(0, 10)}:${SITE_ID}:${ip}:${ua}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type Context = {
  hostname: string;
  country: string;
  region: string;
  city: string;
  userAgent: string;
  visitor: string;
};

/** The Analytics Engine data point, in the exact layout of standards/telemetry.md. */
export function dataPoint(e: TelemetryEvent, c: Context) {
  return {
    indexes: [SITE_ID],
    blobs: [
      e.type,
      c.hostname,
      e.path,
      // Own pages as referrer aren't a source.
      e.referrer === c.hostname ? "" : e.referrer,
      e.utm[0],
      e.utm[1],
      e.utm[2],
      c.country,
      c.region,
      c.city,
      deviceClass(c.userAgent),
      browserFamily(c.userAgent),
      c.visitor,
      e.build,
      e.vital,
    ],
    doubles: [e.value, e.width],
  };
}
