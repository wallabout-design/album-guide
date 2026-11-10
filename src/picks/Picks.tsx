// Staff picks: the published records of the `picks` collection
// (src/collections.ts), a page at a time from /api/collections/picks.
import { useCallback, useEffect, useRef, useState } from 'react';
import { picks as definition } from '../collections';
import type { PublicRecord } from '../lib/collections/types';

type Page = { items: PublicRecord[]; nextCursor: string | null };
type State = { items: PublicRecord[]; nextCursor: string | null; status: 'loading' | 'ready' | 'failed' };

const kindField = definition.fields.find((f) => f.name === 'kind');
const KINDS = new Map(kindField?.type === 'select' ? kindField.options.map((o) => [o.value, o.label]) : []);

// A release group's front cover, 250px, from the Cover Art Archive.
const coverOf = (album: string) => `https://coverartarchive.org/release-group/${encodeURIComponent(album)}/front-250`;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

function Pick({ pick }: { pick: PublicRecord }) {
  const [noCover, setNoCover] = useState(false);
  const { data } = pick;
  const kind = KINDS.get(text(data.kind));
  const link = text(data.link);
  return (
    <li className={data.featured === true ? 'pick pick--featured' : 'pick'}>
      <div className="pick__cover">
        {!noCover && (
          <img src={coverOf(text(data.album))} alt="" width="250" height="250" loading="lazy" decoding="async" onError={() => setNoCover(true)} />
        )}
      </div>
      <div className="pick__words">
        <h2 className="pick__title">{text(data.title)}</h2>
        <p className="pick__by">
          {text(data.artist)}
          {typeof data.year === 'number' && <span>, {data.year}</span>}
          {kind && <span className="pick__kind">{kind}</span>}
        </p>
        <p className="pick__note">{text(data.note)}</p>
        {link.startsWith('https://') && (
          <p className="pick__more">
            <a href={link} rel="noopener noreferrer">
              Read more<span className="visually-hidden"> about {text(data.title)}</span>
            </a>
          </p>
        )}
      </div>
    </li>
  );
}

export function Picks() {
  const [state, setState] = useState<State>({ items: [], nextCursor: null, status: 'loading' });
  const started = useRef(false);

  const load = useCallback(async (cursor: string | null) => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const response = await fetch(`/api/collections/picks${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (!response.ok) throw new Error(String(response.status));
      const page = (await response.json()) as Page;
      setState((s) => ({ items: cursor ? [...s.items, ...page.items] : page.items, nextCursor: page.nextCursor, status: 'ready' }));
    } catch {
      setState((s) => ({ ...s, status: 'failed' }));
    }
  }, []);

  useEffect(() => {
    // Once, even when React runs effects twice in development.
    if (started.current) return;
    started.current = true;
    void load(null);
  }, [load]);

  const { items, nextCursor, status } = state;
  const shown = items.length;

  return (
    <div className="page">
      <header className="page__head">
        <a href="/" className="page__home"><img src="/svg/icon-lg-reversed.svg" alt="album.guide" width="40" height="40" /></a>
        <h1>Staff picks</h1>
        <p>Albums we keep coming back to, and a line on why.</p>
      </header>
      <main>
        {shown > 0 && (
          <ol className="picks">
            {items.map((pick) => (
              <Pick key={pick.id} pick={pick} />
            ))}
          </ol>
        )}
        <div role="status" aria-live="polite" className="page__status">
          {status === 'loading' && <p>Loading…</p>}
          {status === 'ready' && shown === 0 && <p>There are no picks yet. Come back soon.</p>}
          {status === 'ready' && shown > 0 && !nextCursor && <p>That is all {shown} of them.</p>}
        </div>
        {status === 'failed' && (
          <p role="alert" className="page__status">
            The picks could not be loaded.{' '}
            <button type="button" onClick={() => void load(shown ? nextCursor : null)}>Try again</button>
          </p>
        )}
        {status === 'ready' && nextCursor && (
          <p className="page__more">
            <button type="button" onClick={() => void load(nextCursor)}>Show more picks</button>
          </p>
        )}
        <p className="page__back"><a href="/">Find an album of your own on album.guide</a></p>
      </main>
    </div>
  );
}
