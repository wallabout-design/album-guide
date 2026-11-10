// The Worker's side of collections (src/lib/collections): builds the service
// on D1 and answers the public list, GET /api/collections/<name>. All the
// rules live in the library; this file only speaks HTTP.
import { collections as siteCollections } from '../src/collections';
import { createCollections, type Collections, type Failure } from '../src/lib/collections/service';
import { createSqlStore, type SqlDatabase } from '../src/lib/collections/sql-store';
import { exampleCollection } from '../src/lib/collections/testing';

export interface CollectionsEnv {
  /** The site's D1 database. Without it every collections route answers 503. */
  DB?: SqlDatabase;
  /**
   * "1" only for the end-to-end tests (playwright.config.ts): any name that
   * starts with "test-" is then a scratch collection, so each test gets its
   * own. Never set in wrangler.jsonc; worker/tests/config.test.ts checks.
   */
  TEST_COLLECTIONS?: string;
}

const SCRATCH = /^test-[a-z0-9-]{1,35}$/;

/** The service for one request. `name` is the collection the request is about. */
export function collectionsFor(env: CollectionsEnv, name?: string): Collections | null {
  if (!env.DB) return null;
  const scratch = env.TEST_COLLECTIONS === '1' && name && SCRATCH.test(name) ? [exampleCollection(name)] : [];
  return createCollections({ definitions: [...siteCollections, ...scratch], store: createSqlStore(env.DB) });
}

const STATUS: Record<Failure['code'], number> = { not_found: 404, bad_request: 400, invalid: 422, full: 409, conflict: 409 };

/** A failure from the service as a JSON response that is never cached. */
export function failure(error: Failure): Response {
  const body = { error: error.message, code: error.code, ...(error.code === 'invalid' ? { fields: error.fields } : {}) };
  return Response.json(body, { status: STATUS[error.code], headers: { 'Cache-Control': 'no-store' } });
}

export const unavailable = () =>
  Response.json(
    { error: 'This is not available right now. Please try again in a minute.', code: 'unavailable' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );

// A minute in the browser, then up to five more while it checks for a newer
// copy, so staff see an edit on the site within a minute or so and no purge
// step is needed. The ETag makes that check a 304 when nothing changed.
export const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';

async function etagOf(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hex = [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `W/"${hex}"`;
}

/** GET or HEAD /api/collections/<name>?cursor=&limit=: published records only. */
export async function publicList(request: Request, env: CollectionsEnv, name: string): Promise<Response> {
  const service = collectionsFor(env, name);
  if (!service) return unavailable();
  const url = new URL(request.url);
  let result;
  try {
    result = await service.listPublished(name, { cursor: url.searchParams.get('cursor'), limit: url.searchParams.get('limit') });
  } catch (error) {
    console.error(
      JSON.stringify({ message: 'collection list failed', collection: name, error: error instanceof Error ? error.message : String(error) }),
    );
    return unavailable();
  }
  if (!result.ok) return failure(result.error);

  const body = JSON.stringify(result.value);
  const etag = await etagOf(body);
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': PUBLIC_CACHE, ETag: etag };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : body, { headers });
}
