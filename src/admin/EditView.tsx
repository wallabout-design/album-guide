// Adding a record, or editing one: a form generated from the collection's
// definition, checked in the browser with the same rules the server enforces
// (src/lib/collections/validate.ts), plus the record's earlier versions.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { CollectionDefinition, HistoryEntry, StoredRecord } from '../lib/collections/types';
import { FORM, validateRecord } from '../lib/collections/validate';
import { api, type Problem } from './api';
import { Field } from './fields';
import { recordFrom, valuesFrom, type FormValues } from './form-values';
import { go } from './route';
import { setFlash } from './flash';
import { ACTION_WORDS, Singular, statusWords, titleOf, when } from './words';

interface Loaded {
  def: CollectionDefinition;
  /** Null while adding a new record. */
  record: StoredRecord | null;
  history: HistoryEntry[];
}

export function EditView({ collection, id }: { collection: string; id: string | null }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    const list = await api.list(collection, {});
    if (!list.ok) return setProblem(list.problem);
    const def = list.value.definition;
    if (!id) {
      setValues(valuesFrom(def));
      return setLoaded({ def, record: null, history: [] });
    }
    const [record, history] = await Promise.all([api.get(collection, id), api.history(collection, id)]);
    if (!record.ok) return setProblem(record.problem);
    setValues(valuesFrom(def, record.value.data));
    setLoaded({ def, record: record.value, history: history.ok ? history.value.items : [] });
  }, [collection, id]);

  useEffect(() => {
    void load();
  }, [load]);

  // After a failed save, put the cursor in the first field that needs fixing.
  useEffect(() => {
    if (Object.keys(errors).length) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  if (!loaded) {
    return problem ? (
      <>
        <p role="alert" className="notice notice--problem">{problem.message}</p>
        <p><a href={`#/${collection}`}>Back to the list</a></p>
      </>
    ) : (
      <p role="status">Loading…</p>
    );
  }

  const { def, record, history } = loaded;
  const removed = Boolean(record?.deletedAt);

  function fail(found: Problem) {
    setSaved('');
    setErrors(found.fields ?? {});
    setProblem(found.fields && !found.fields[FORM] ? null : { ...found, message: found.fields?.[FORM] ?? found.message });
  }

  async function save(publish: boolean) {
    const data = recordFrom(def, values);
    const checked = validateRecord(def, data);
    if (!checked.ok) return fail({ code: 'invalid', message: 'Please fix the marked fields.', fields: checked.errors });
    setBusy(true);
    const answer = record ? await api.update(collection, record.id, data, record.updatedAt) : await api.create(collection, data, publish);
    setBusy(false);
    if (!answer.ok) return fail(answer.problem);
    if (!record) {
      setFlash(publish ? `Added “${titleOf(def, answer.value)}”. It is on the site now.` : `Added “${titleOf(def, answer.value)}” as a draft. It is not on the site yet.`);
      return go(collection);
    }
    setErrors({});
    setProblem(null);
    setSaved(answer.value.status === 'published' ? 'Saved. The site shows the new version within a minute or two.' : 'Saved.');
    await load();
  }

  async function act(what: () => ReturnType<typeof api.get>, done: string) {
    setBusy(true);
    const answer = await what();
    setBusy(false);
    if (!answer.ok) return fail(answer.problem);
    setErrors({});
    setProblem(null);
    setSaved(done);
    await load();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void save(false);
  }

  const errorCount = Object.keys(errors).filter((key) => key !== FORM).length;

  return (
    <>
      <p><a href={`#/${collection}`}>Back to {def.label}</a></p>
      <h1>{record ? `Edit “${titleOf(def, record)}”` : `Add a ${def.singular}`}</h1>

      {record && !removed && (
        <p className="state">
          <span className={record.status === 'published' ? 'record__state record__state--live' : 'record__state'}>{statusWords(record)}</span>{' '}
          {record.status === 'published' ? (
            <button type="button" disabled={busy} onClick={() => act(() => api.act(collection, record.id, 'unpublish'), 'It is off the site now, and kept here as a draft.')}>
              Take off the site
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => act(() => api.act(collection, record.id, 'publish'), 'It is on the site now.')}>
              Show on the site
            </button>
          )}
        </p>
      )}
      {removed && record && (
        <p className="notice">
          This {def.singular} was removed.{' '}
          <button type="button" disabled={busy} onClick={() => act(() => api.act(collection, record.id, 'restore'), `${Singular(def)} brought back.`)}>
            Bring it back
          </button>
        </p>
      )}

      <div role="status" aria-live="polite" className="status">{saved && <p className="notice">{saved}</p>}</div>
      {(problem || errorCount > 0) && (
        <div role="alert" className="notice notice--problem">
          {problem && <p>{problem.message}</p>}
          {errorCount > 0 && <p>{errorCount === 1 ? 'One thing needs fixing below.' : `${errorCount} things need fixing below.`}</p>}
          {problem?.code === 'conflict' && (
            <p><button type="button" onClick={() => { setProblem(null); void load(); }}>Load their version</button></p>
          )}
        </div>
      )}

      {!removed && (
        <form ref={form} className="form" noValidate onSubmit={onSubmit}>
          {def.fields.map((field) => (
            <Field
              key={field.name}
              field={field}
              value={values[field.name] ?? ''}
              error={errors[field.name]}
              onChange={(value) => {
                setValues((current) => ({ ...current, [field.name]: value }));
                setSaved('');
              }}
            />
          ))}
          <p className="form__buttons">
            {record ? (
              <button type="submit" className="button--main" disabled={busy}>Save changes</button>
            ) : (
              <>
                <button type="button" className="button--main" disabled={busy} onClick={() => save(true)}>Save and show on the site</button>
                <button type="submit" disabled={busy}>Save as a draft</button>
              </>
            )}
            <a href={`#/${collection}`}>Cancel</a>
          </p>
        </form>
      )}

      {record && history.length > 0 && (
        <section aria-labelledby="history-title" className="history">
          <h2 id="history-title">Earlier versions</h2>
          <p>Every change is kept. You can look at an earlier version, or put the {def.singular} back to how it was then.</p>
          <ol className="history__list">
            {history.map((entry, index) => (
              <li key={entry.id}>
                <details>
                  <summary>
                    {ACTION_WORDS[entry.action]}, {when(entry.at)}, by {entry.by}
                    {index === 0 && ' (how it is now)'}
                  </summary>
                  <dl>
                    {def.fields.map((field) => {
                      const value = entry.data[field.name];
                      if (value === undefined || value === '' || value === false) return null;
                      const shown =
                        field.type === 'boolean' ? 'Yes' : field.type === 'select' ? (field.options.find((o) => o.value === value)?.label ?? String(value)) : String(value);
                      return (
                        <div key={field.name}>
                          <dt>{field.label}</dt>
                          <dd>{shown}</dd>
                        </div>
                      );
                    })}
                  </dl>
                  {index > 0 && !removed && (
                    <p>
                      <button type="button" disabled={busy} onClick={() => act(() => api.revert(collection, record.id, entry.id), `Put back to the version from ${when(entry.at)}.`)}>
                        Put it back to this version
                      </button>
                    </p>
                  )}
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
