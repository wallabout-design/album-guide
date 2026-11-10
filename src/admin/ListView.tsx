// The list of one collection's records: search, more pages, and the things
// staff do to a record without opening it (show on the site, take off, move,
// remove, undo). Or, with `removed`, the records that were removed and can
// still be brought back.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LIMITS, type StoredRecord } from '../lib/collections/types';
import { api, type Answer, type Problem, type StaffList } from './api';
import { takeFlash } from './flash';
import { statusWords, titleOf, when } from './words';

interface Notice {
  text: string;
  /** The record a just-made removal can be undone for. */
  undo?: StoredRecord;
}

export function ListView({ collection, removed }: { collection: string; removed: boolean }) {
  const [list, setList] = useState<StaffList | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [search, setSearch] = useState('');
  const [typed, setTyped] = useState('');
  const [notice, setNotice] = useState<Notice | null>(() => {
    const text = takeFlash();
    return text ? { text } : null;
  });
  const [asking, setAsking] = useState<StoredRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);

  /** Loads from the top until at least `atLeast` records are shown, so the list keeps its length after a change. */
  const load = useCallback(
    async (atLeast: number, searchFor: string) => {
      const request = ++latest.current;
      const items: StoredRecord[] = [];
      let cursor: string | null = null;
      let page: StaffList;
      do {
        const answer: Answer<StaffList> = await api.list(collection, { cursor, search: searchFor, removed });
        if (request !== latest.current) return;
        if (!answer.ok) return setProblem(answer.problem);
        page = answer.value;
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && items.length < atLeast);
      setProblem(null);
      setList({ ...page, items, nextCursor: cursor });
    },
    [collection, removed],
  );

  useEffect(() => {
    void load(1, search);
  }, [load, search]);

  useEffect(() => {
    if (asking && !dialog.current?.open) dialog.current?.showModal();
  }, [asking]);

  if (!list) {
    return problem ? <p role="alert" className="notice notice--problem">{problem.message}</p> : <p role="status">Loading…</p>;
  }

  const def = list.definition;
  const shown = list.items.length;
  const canMove = def.sort.by === 'position' && !search && !removed;

  async function act(what: () => Promise<Answer<StoredRecord>>, done: (record: StoredRecord) => Notice) {
    setBusy(true);
    setNotice(null);
    const answer = await what();
    if (answer.ok) {
      setNotice(done(answer.value));
      await load(shown, search);
    } else setProblem(answer.problem);
    setBusy(false);
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setSearch(typed.trim());
  }

  const name = (record: StoredRecord) => titleOf(def, record);
  const count = `${list.total} of ${list.maxRecords}`;

  return (
    <>
      <h1>{removed ? `Removed from ${def.label}` : def.label}</h1>
      {removed ? (
        <p>
          Anything removed is kept here for {LIMITS.removedDays} days and can be brought back. <a href={`#/${collection}`}>Back to {def.label}</a>
        </p>
      ) : (
        <p className="toolbar">
          <a className="button button--main" href={`#/${collection}/new`}>Add a {def.singular}</a>
          <a href={`#/${collection}/removed`}>See what was removed</a>
          <span className="toolbar__count">{count} places used</span>
        </p>
      )}

      <form className="search" role="search" onSubmit={onSearch}>
        <label htmlFor="search">Search {removed ? 'removed entries' : def.label.toLowerCase()}</label>
        <input id="search" type="search" value={typed} maxLength={LIMITS.search} onChange={(e) => setTyped(e.target.value)} />
        <button type="submit">Search</button>
        {search && (
          <button type="button" onClick={() => { setTyped(''); setSearch(''); }}>
            Show everything
          </button>
        )}
      </form>

      <div role="status" aria-live="polite" className="status">
        {notice && (
          <p className="notice">
            {notice.text}{' '}
            {notice.undo && (
              <button type="button" disabled={busy} onClick={() => act(() => api.act(collection, notice.undo!.id, 'restore'), (r) => ({ text: `Brought back “${name(r)}”.` }))}>
                Undo
              </button>
            )}
          </p>
        )}
      </div>
      {problem && <p role="alert" className="notice notice--problem">{problem.message}</p>}

      {shown === 0 ? (
        <p className="empty">
          {search
            ? `Nothing matches “${search}”.`
            : removed
              ? 'Nothing has been removed.'
              : `There is nothing here yet. Add the first ${def.singular} with the button above.`}
        </p>
      ) : (
        <ul className="records" aria-label={removed ? 'Removed entries' : def.label}>
          {list.items.map((record, index) => (
            <li key={record.id} className="record">
              <div className="record__what">
                {removed ? (
                  <span className="record__title">{name(record)}</span>
                ) : (
                  <a className="record__title" href={`#/${collection}/${record.id}`}>{name(record)}</a>
                )}
                <span className={record.status === 'published' && !removed ? 'record__state record__state--live' : 'record__state'}>
                  {removed ? `Removed ${when(record.deletedAt ?? '')}` : statusWords(record)}
                </span>
                <span className="record__meta">Last changed {when(record.updatedAt)} by {record.updatedBy}</span>
              </div>
              <div className="record__actions">
                {removed ? (
                  <button type="button" disabled={busy} aria-label={`Bring back: ${name(record)}`} onClick={() => act(() => api.act(collection, record.id, 'restore'), (r) => ({ text: `Brought back “${name(r)}”. It is in ${def.label} again.` }))}>
                    Bring back
                  </button>
                ) : (
                  <>
                    <a className="button" href={`#/${collection}/${record.id}`} aria-label={`Edit: ${name(record)}`}>Edit</a>
                    {record.status === 'published' ? (
                      <button type="button" disabled={busy} aria-label={`Take off the site: ${name(record)}`} onClick={() => act(() => api.act(collection, record.id, 'unpublish'), (r) => ({ text: `“${name(r)}” is off the site. It is kept here as a draft.` }))}>
                        Take off the site
                      </button>
                    ) : (
                      <button type="button" disabled={busy} aria-label={`Show on the site: ${name(record)}`} onClick={() => act(() => api.act(collection, record.id, 'publish'), (r) => ({ text: `“${name(r)}” is on the site now.` }))}>
                        Show on the site
                      </button>
                    )}
                    {canMove && (
                      <>
                        <button type="button" disabled={busy || index === 0} aria-label={`Move up: ${name(record)}`} onClick={() => act(() => api.move(collection, record.id, 'up'), (r) => ({ text: `Moved “${name(r)}” up.` }))}>
                          Move up
                        </button>
                        <button type="button" disabled={busy || (index === shown - 1 && !list.nextCursor)} aria-label={`Move down: ${name(record)}`} onClick={() => act(() => api.move(collection, record.id, 'down'), (r) => ({ text: `Moved “${name(r)}” down.` }))}>
                          Move down
                        </button>
                      </>
                    )}
                    <button type="button" disabled={busy} aria-label={`Remove: ${name(record)}`} onClick={() => setAsking(record)}>
                      Remove
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.nextCursor && (
        <p>
          <button type="button" disabled={busy} onClick={() => { setBusy(true); void load(shown + LIMITS.pageSize.default, search).then(() => setBusy(false)); }}>
            Show more
          </button>
        </p>
      )}

      <dialog ref={dialog} className="confirm" aria-labelledby="confirm-title" onClose={() => setAsking(null)}>
        {asking && (
          <>
            <h2 id="confirm-title">Remove “{name(asking)}”?</h2>
            <p>
              It will come off the site straight away. You can bring it back for {LIMITS.removedDays} days from “See what was removed”.
            </p>
            <p className="confirm__buttons">
              <button
                type="button"
                className="button--danger"
                onClick={() => {
                  const record = asking;
                  dialog.current?.close();
                  void act(() => api.act(collection, record.id, 'remove'), (r) => ({ text: `Removed “${name(r)}”.`, undo: r }));
                }}
              >
                Remove {def.singular}
              </button>
              <button type="button" onClick={() => dialog.current?.close()}>Keep it</button>
            </p>
          </>
        )}
      </dialog>
    </>
  );
}
