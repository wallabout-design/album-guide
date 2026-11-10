import { createHash } from 'node:crypto';
import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';

/*
 * Helpers for the admin's tests. The server is the preview Worker's config
 * (playwright.config.ts), so the sign-in is the preview's fixed code, and a
 * flag passed only to this local server makes any `test-*` name a scratch
 * collection with one field of every type, three to a public page and room
 * for eight records (src/lib/collections/testing.ts).
 */
export const CODE = 'sleeve-notes';
export const STAFF_EMAIL = 'preview-staff@example.com';

/**
 * A collection only this test uses, so tests can run in any order, in
 * parallel, retried or repeated without seeing each other's records.
 */
export function scratch(testInfo: TestInfo): string {
  const key = [testInfo.project.name, ...testInfo.titlePath, testInfo.retry, testInfo.repeatEachIndex].join('|');
  return `test-${createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
}

/** What the admin page sends with every write. */
export function writeHeaders(baseURL: string) {
  return { Origin: new URL(baseURL).origin, 'X-Admin-Request': '1', 'Content-Type': 'application/json' };
}

/** Signs this request context in with the preview code; the cookie stays in the context. */
export async function signIn(request: APIRequestContext, baseURL: string) {
  const response = await request.post('/admin/test-login', {
    headers: { Origin: new URL(baseURL).origin },
    form: { code: CODE },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers()['location']).toBe('/admin');
}

type Listed = { items: { id: string; data: Record<string, unknown> }[]; nextCursor: string | null };

/** The titles on the public list of a collection, every page of it. */
export async function publicTitles(request: APIRequestContext, collection: string): Promise<unknown[]> {
  const titles: unknown[] = [];
  let cursor: string | null = null;
  do {
    const response = await request.get(`/api/collections/${collection}${cursor ? `?cursor=${cursor}` : ''}`);
    expect(response.status()).toBe(200);
    const page = (await response.json()) as Listed;
    titles.push(...page.items.map((item) => item.data.title));
    cursor = page.nextCursor;
  } while (cursor);
  return titles;
}
