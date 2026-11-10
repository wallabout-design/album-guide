// /admin and /admin/api/*: the staff side of collections. Every request is
// checked here (worker/admin-auth.ts) before anything is read, served or
// written; the rules about records live in src/lib/collections.
import { collections as siteCollections } from '../src/collections';
import type { Collections, MoveDirection, Result } from '../src/lib/collections/service';
import { sameText, staffEmail, TEST_COOKIE, testCookieValue, testLoginAllowed, type AdminEnv } from './admin-auth';
import { collectionsFor, failure, unavailable, type CollectionsEnv } from './collections';

export interface AdminRouteEnv extends AdminEnv, CollectionsEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** The header the admin page sends with every write. A form on another site can't set it. */
export const WRITE_HEADER = 'X-Admin-Request';
/** The most a write may send. A record is at most 16 KB of JSON. */
export const MAX_WRITE_BYTES = 64_000;
const TEST_LOGIN_PATH = '/admin/test-login';

/** True for the admin page, its API, and near misses like /admin.html. */
export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/admin.');
}

const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
const refuse = (status: number, code: string, error: string) => json({ error, code }, status);

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** What a signed-out visitor gets at /admin: no page, no data. Previews add the test sign-in form. */
function signedOutPage(testLogin: boolean, wrongCode: boolean): Response {
  const form = testLogin
    ? `<p>This is a preview with made-up data. Sign in with the preview code.</p>
${wrongCode ? '<p role="alert">That code is not right. Please try again.</p>\n' : ''}<form method="post" action="${TEST_LOGIN_PATH}">
<p><label for="code">Preview code</label> <input id="code" name="code" type="password" autocomplete="off" required></p>
<p><button type="submit">Sign in</button></p>
</form>`
    : '<p>This page is for the people who run album.guide. If that is you, ask for your email address to be added, then sign in again.</p>';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml('Staff only · album.guide')}</title>
</head>
<body>
<main>
<h1>Staff only</h1>
${form}
<p><a href="/">Back to album.guide</a></p>
</main>
</body>
</html>`;
  return new Response(html, { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });
}

/** A write must come from this site's own pages: same Origin, and the admin's own header. */
function crossSite(request: Request): boolean {
  return request.headers.get('origin') !== new URL(request.url).origin;
}

/** POST /admin/test-login: the fixed code, on previews and local runs only. */
async function testLogin(request: Request, env: AdminEnv): Promise<Response> {
  if (!testLoginAllowed(request, env)) return refuse(404, 'not_found', 'not found');
  if (crossSite(request)) return refuse(403, 'forbidden', 'This request did not come from the admin page.');
  const url = new URL(request.url);
  let code = '';
  try {
    code = String((await request.formData()).get('code') ?? '');
  } catch {
    // An unreadable form is a wrong code.
  }
  if (!sameText(code, env.ADMIN_TEST_CODE!)) {
    return new Response(null, { status: 303, headers: { Location: '/admin?wrong-code', ...NO_STORE } });
  }
  // Secure everywhere but a local run over plain http, where WebKit would drop it.
  const secure = url.protocol === 'https:' ? ' Secure;' : '';
  const value = await testCookieValue(env.ADMIN_TEST_CODE!);
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/admin',
      'Set-Cookie': `${TEST_COOKIE}=${value}; Path=/admin; HttpOnly;${secure} SameSite=Lax; Max-Age=28800`,
      ...NO_STORE,
    },
  });
}

async function readJson(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const type = request.headers.get('content-type') ?? '';
  if (!/^application\/json\b/i.test(type)) return { ok: false, response: refuse(415, 'bad_request', 'The request must be JSON.') };
  if (Number(request.headers.get('content-length') ?? 0) > MAX_WRITE_BYTES) {
    return { ok: false, response: refuse(413, 'too_large', 'That is too much to save at once.') };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_WRITE_BYTES) {
    return { ok: false, response: refuse(413, 'too_large', 'That is too much to save at once.') };
  }
  try {
    const body: unknown = text === '' ? {} : JSON.parse(text);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('not an object');
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, response: refuse(400, 'bad_request', 'The request could not be read.') };
  }
}

const answer = <T>(result: Result<T>, wrap: (value: T) => unknown, status = 200) =>
  result.ok ? json(wrap(result.value), status) : failure(result.error);

const record = (value: unknown) => ({ record: value });

async function api(request: Request, env: AdminRouteEnv, email: string, path: string[]): Promise<Response> {
  const { method } = request;
  const url = new URL(request.url);
  const read = method === 'GET';

  if (path.length === 1 && path[0] === 'me' && read) {
    return json({ email, collections: siteCollections.map(({ name, label }) => ({ name, label })) });
  }
  if (path[0] !== 'collections' || path.length < 2 || path.length > 4) return refuse(404, 'not_found', 'not found');
  const [, name, id, action] = path;
  const service: Collections | null = collectionsFor(env, name);
  if (!service) return unavailable();

  // /admin/api/collections/<name>
  if (!id) {
    if (read) {
      const page = await service.listForStaff(name, {
        cursor: url.searchParams.get('cursor'),
        limit: url.searchParams.get('limit'),
        search: url.searchParams.get('q'),
        show: url.searchParams.get('show') === 'removed' ? 'removed' : 'current',
      });
      return answer(page, (value) => ({ definition: service.definition(name), ...value }));
    }
    if (method === 'POST') {
      const sent = await readJson(request);
      if (!sent.ok) return sent.response;
      return answer(await service.create(name, sent.body.data, email, sent.body.publish === true), record, 201);
    }
    return refuse(405, 'bad_request', 'That is not something this address does.');
  }

  // /admin/api/collections/<name>/<id>
  if (!action) {
    if (read) return answer(await service.get(name, id), record);
    if (method === 'PUT') {
      const sent = await readJson(request);
      if (!sent.ok) return sent.response;
      const ifUpdatedAt = typeof sent.body.updatedAt === 'string' ? sent.body.updatedAt : undefined;
      return answer(await service.update(name, id, sent.body.data, email, ifUpdatedAt), record);
    }
    return refuse(405, 'bad_request', 'That is not something this address does.');
  }

  // /admin/api/collections/<name>/<id>/<action>
  if (action === 'history' && read) return answer(await service.history(name, id), (items) => ({ items }));
  if (method !== 'POST') return refuse(405, 'bad_request', 'That is not something this address does.');
  const sent = await readJson(request);
  if (!sent.ok) return sent.response;
  switch (action) {
    case 'publish':
      return answer(await service.setPublished(name, id, true, email), record);
    case 'unpublish':
      return answer(await service.setPublished(name, id, false, email), record);
    case 'remove':
      return answer(await service.remove(name, id, email), record);
    case 'restore':
      return answer(await service.restore(name, id, email), record);
    case 'move':
      return answer(await service.move(name, id, sent.body.direction as MoveDirection), record);
    case 'revert':
      return answer(await service.revert(name, id, Number(sent.body.historyId), email), record);
    default:
      return refuse(404, 'not_found', 'not found');
  }
}

/** Everything under /admin. Nothing is served, read or written before the sign-in check. */
export async function handleAdmin(request: Request, env: AdminRouteEnv): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  if (pathname === TEST_LOGIN_PATH && request.method === 'POST') return testLogin(request, env);

  const isApi = pathname === '/admin/api' || pathname.startsWith('/admin/api/');
  const email = await staffEmail(request, env);
  if (!email) {
    if (isApi) return refuse(403, 'forbidden', 'Please sign in to use the admin.');
    return signedOutPage(testLoginAllowed(request, env), url.searchParams.has('wrong-code'));
  }

  if (!isApi) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return refuse(405, 'bad_request', 'not allowed');
    // The admin page is one static file, admin.html, served at /admin.
    const page = await env.ASSETS.fetch(new Request(new URL('/admin', url), { headers: request.headers }));
    const response = new Response(page.body, page);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  if (request.method !== 'GET') {
    if (crossSite(request) || !request.headers.get(WRITE_HEADER)) {
      return refuse(403, 'forbidden', 'This request did not come from the admin page. Reload the page and try again.');
    }
  }
  const path = pathname.slice('/admin/api/'.length).split('/').filter(Boolean);
  try {
    const response = await api(request, env, email, path);
    if (request.method !== 'GET') {
      console.log(JSON.stringify({ message: 'admin write', method: request.method, path: path.join('/'), status: response.status }));
    }
    return response;
  } catch (error) {
    console.error(
      JSON.stringify({ message: 'admin request failed', path: path.join('/'), error: error instanceof Error ? error.message : String(error) }),
    );
    return unavailable();
  }
}
