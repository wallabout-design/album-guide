// Browser side of first-party telemetry (standards/telemetry.md; copied from
// wallabout-design/site): a page view, engaged time and Core Web Vitals, posted
// to this site's own /api/event (worker/index.ts). No cookies or storage.
import { onCLS, onINP, onLCP } from 'web-vitals';

// Absolute: the site is served from the domain root, where the Worker runs.
const EVENT_PATH = '/api/event';
const path = location.pathname;
// Baked in by vite.config.ts; the Worker keeps it only if it is a 7-character SHA.
const build = String(import.meta.env.VITE_BUILD_SHA ?? '');

function send(body: Record<string, string | number>): void {
  navigator.sendBeacon?.(EVENT_PATH, new Blob([JSON.stringify({ ...body, build })], { type: 'application/json' }));
}

let visibleSince: number | null = document.visibilityState === 'visible' ? performance.now() : null;
let engaged = 0;

function flushEngage(): void {
  if (visibleSince !== null) engaged += performance.now() - visibleSince;
  visibleSince = null;
  if (engaged > 0) send({ type: 'engage', path, value: Math.round(engaged), width: innerWidth });
  engaged = 0;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushEngage();
  else visibleSince = performance.now();
});
addEventListener('pagehide', flushEngage);

const vital = (m: { name: string; value: number }) =>
  send({ type: 'vital', name: m.name, path, value: m.value, width: innerWidth });
// Telemetry must never stop the app rendering: this module runs before it. A
// browser without the Performance APIs web-vitals reads (or jsdom, in
// `npm run dist-check`) just sends no vitals.
try {
  onLCP(vital);
  onINP(vital);
  onCLS(vital);
} catch {
  // No vitals from this browser.
}

const q = new URLSearchParams(location.search);
send({
  type: 'pageview',
  path,
  referrer: document.referrer,
  utm_source: q.get('utm_source') ?? '',
  utm_medium: q.get('utm_medium') ?? '',
  utm_campaign: q.get('utm_campaign') ?? '',
  width: innerWidth,
});
