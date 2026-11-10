// The admin page's calls to /admin/api (worker/admin.ts). Every write carries
// the header the Worker asks for, and every failure comes back as words the
// person at the screen can act on.
import type { AdminPage } from '../lib/collections/service';
import type { CollectionDefinition, HistoryEntry, StoredRecord } from '../lib/collections/types';

export type Problem = {
  /** The Worker's code: invalid, conflict, full, not_found, forbidden... or "offline". */
  code: string;
  message: string;
  /** With `invalid`: a message per field. */
  fields?: Record<string, string>;
};

export type Answer<T> = { ok: true; value: T } | { ok: false; problem: Problem };

const SIGNED_OUT = 'You have been signed out. Reload the page to sign in again; anything you had not saved will need typing again.';

async function call<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<Answer<T>> {
  let response: Response;
  try {
    response = await fetch(`/admin/api/${path}`, {
      method,
      headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json', 'X-Admin-Request': '1' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      // An ended sign-in answers with a redirect to the sign-in page, which a fetch can't follow.
      redirect: 'manual',
    });
  } catch {
    return { ok: false, problem: { code: 'offline', message: 'The site could not be reached. Check your connection and try again.' } };
  }
  if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
    return { ok: false, problem: { code: 'forbidden', message: SIGNED_OUT } };
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Handled below: not JSON means something between here and the site answered.
  }
  if (response.ok && data) return { ok: true, value: data as T };
  const sent = (data ?? {}) as { error?: string; code?: string; fields?: Record<string, string> };
  return {
    ok: false,
    problem: {
      code: sent.code ?? 'error',
      message: sent.error ?? 'Something went wrong. Please try again in a minute.',
      fields: sent.fields,
    },
  };
}

export type StaffList = AdminPage & { definition: CollectionDefinition };
type One = { record: StoredRecord };
const one = (answer: Answer<One>): Answer<StoredRecord> => (answer.ok ? { ok: true, value: answer.value.record } : answer);
const at = (collection: string, id?: string, action?: string) =>
  ['collections', collection, id, action].filter(Boolean).map((part) => encodeURIComponent(part!)).join('/');

export const api = {
  me: () => call<{ email: string; collections: { name: string; label: string }[] }>('GET', 'me'),

  list(collection: string, options: { cursor?: string | null; search?: string; removed?: boolean }) {
    const query = new URLSearchParams();
    if (options.cursor) query.set('cursor', options.cursor);
    if (options.search) query.set('q', options.search);
    if (options.removed) query.set('show', 'removed');
    const text = query.toString();
    return call<StaffList>('GET', at(collection) + (text ? `?${text}` : ''));
  },

  get: async (collection: string, id: string) => one(await call<One>('GET', at(collection, id))),
  create: async (collection: string, data: unknown, publish: boolean) => one(await call<One>('POST', at(collection), { data, publish })),
  update: async (collection: string, id: string, data: unknown, updatedAt: string) =>
    one(await call<One>('PUT', at(collection, id), { data, updatedAt })),
  act: async (collection: string, id: string, action: 'publish' | 'unpublish' | 'remove' | 'restore') =>
    one(await call<One>('POST', at(collection, id, action))),
  move: async (collection: string, id: string, direction: 'up' | 'down' | 'first' | 'last') =>
    one(await call<One>('POST', at(collection, id, 'move'), { direction })),
  history: (collection: string, id: string) => call<{ items: HistoryEntry[] }>('GET', at(collection, id, 'history')),
  revert: async (collection: string, id: string, historyId: number) =>
    one(await call<One>('POST', at(collection, id, 'revert'), { historyId })),
};
