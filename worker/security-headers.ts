// The response headers every album.guide response carries: a content security
// policy built from third-parties.json, HSTS, and the usual hardening headers.
// public/_headers carries the same values for static files, and
// worker/tests/security-headers.test.ts fails if the two drift apart, so
// third-parties.json is the one list to edit. Copied from wallabout-design/rr
// (app/lib/csp.ts) and wallabout-design/site (public/_headers).
// See docs/decisions/0012-security-headers.md.
import thirdParties from '../third-parties.json' with { type: 'json' };

type ThirdParty = { csp: Record<string, string[]> };

// The site's own sources. The page has no inline scripts: the only <script> in
// index.html besides the bundle is JSON-LD, a data block that script-src
// doesn't govern. React's `style` props go through the CSSOM, which style-src
// doesn't govern either, so styles need no 'unsafe-inline'.
const OWN: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
};

/** The policy: this origin, plus every host in third-parties.json under its directive. */
export function contentSecurityPolicy(): string {
  const policy: Record<string, string[]> = structuredClone(OWN);
  for (const entry of thirdParties.entries as ThirdParty[]) {
    for (const [directive, hosts] of Object.entries(entry.csp)) {
      policy[directive] = [...new Set([...(policy[directive] ?? ["'self'"]), ...hosts])];
    }
  }
  return Object.entries(policy)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

// One year, every subdomain (album.guide's names are all on Cloudflare). No
// preload: that list is hard to leave, and neither reference site uses it.
export const HSTS = 'max-age=31536000; includeSubDomains';

/** Headers for every response, pages, files and Worker responses alike. */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': contentSecurityPolicy(),
  'Strict-Transport-Security': HSTS,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/** A copy of the response with SECURITY_HEADERS set (redirects' headers are immutable). */
export function withSecurityHeaders(response: Response): Response {
  const res = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(name, value);
  return res;
}
