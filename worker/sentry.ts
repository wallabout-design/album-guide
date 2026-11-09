// The Sentry tunnel: browser error events are posted to /api/sentry on this
// site and forwarded to Sentry from here. Copied from wallabout-design/rr
// (app/lib/monitoring.ts, `sentryTunnel`). See docs/decisions/0011-sentry-setup.md.
import { handleTunnelRequest } from '@sentry/core';
import { SENTRY_DSN } from '../src/sentry-config';

export { SENTRY_TUNNEL_PATH } from '../src/sentry-config';

/** Browser error envelopes are a few KB; anything this big isn't one. */
export const MAX_ENVELOPE_BYTES = 200_000;

/**
 * Forwards one envelope to Sentry, only for this site's own DSN (host, project
 * and key must all match, or Sentry's helper answers 403), and only from this
 * site's own pages, so nobody can use it as an open relay.
 */
export async function sentryTunnel(request: Request): Promise<Response> {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response(null, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_ENVELOPE_BYTES) {
    return new Response(null, { status: 413 });
  }
  const response = await handleTunnelRequest(request, { allowedDsns: [SENTRY_DSN] });
  if (!response.ok) {
    console.warn(JSON.stringify({ level: 'warn', route: 'sentry', message: 'tunnel rejected', status: response.status }));
  }
  return response;
}
