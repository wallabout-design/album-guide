// Who is asking for /admin. In production Cloudflare Access sits in front of
// /admin and adds a signed token to every request; this checks that token
// itself and then checks the email against the Worker's own list, so a
// misconfigured Access app can't open the admin. With any of the three
// settings missing, everyone is refused. Copied from wallabout-design/rr
// (app/lib/admin/auth.server.ts); standards/login.md, "staff".
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AdminEnv {
  /** The Zero Trust team's login domain, like "team.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's audience tag. */
  ACCESS_AUD?: string;
  /** Who may use the admin: email addresses separated by commas. */
  ADMIN_EMAILS?: string;
  /**
   * A fixed sign-in code for previews and tests, where there is no Access.
   * Declared only for the preview Worker (wrangler.jsonc, env.preview), whose
   * data is fake. Never set on production, and never honoured on album.guide.
   */
  ADMIN_TEST_CODE?: string;
}

/** The hosts production answers on. The test sign-in never works here, whatever is configured. */
const PRODUCTION_HOSTS = ['album.guide', 'www.album.guide'];

/** Who a test sign-in is, in "last changed by". */
export const TEST_EMAIL = 'preview-staff@example.com';
export const TEST_COOKIE = 'admin_test';

const jwksByTeam = new Map<string, JWTVerifyGetKey>();

function teamKeys(team: string): JWTVerifyGetKey {
  let keys = jwksByTeam.get(team);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
    jwksByTeam.set(team, keys);
  }
  return keys;
}

const emailList = (text: string | undefined) =>
  (text ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes('@'));

/** True when the fixed test code may be used on this request's host. */
export function testLoginAllowed(request: Request, env: AdminEnv): boolean {
  return Boolean(env.ADMIN_TEST_CODE) && !PRODUCTION_HOSTS.includes(new URL(request.url).hostname);
}

/** What the test cookie holds: derived from the code, so changing the code signs everyone out. */
export async function testCookieValue(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`album-guide admin test sign-in:${code}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares without stopping at the first difference. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

/**
 * The email of the staff member making the request, or null for everyone
 * else. `keys` is for tests; production fetches the team's public keys.
 */
export async function staffEmail(request: Request, env: AdminEnv, keys?: JWTVerifyGetKey): Promise<string | null> {
  if (testLoginAllowed(request, env)) {
    const sent = cookie(request, TEST_COOKIE);
    if (sent && sameText(sent, await testCookieValue(env.ADMIN_TEST_CODE!))) return TEST_EMAIL;
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  const allowed = emailList(env.ADMIN_EMAILS);
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || allowed.length === 0) return null;

  const team = `https://${env.ACCESS_TEAM_DOMAIN}`;
  try {
    const { payload } = await jwtVerify(token, keys ?? teamKeys(team), { issuer: team, audience: env.ACCESS_AUD });
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    return email && allowed.includes(email) ? email : null;
  } catch {
    return null;
  }
}
