// The admin: one small page for staff, generated from the collections'
// definitions (src/collections.ts). It keeps nothing itself; every list and
// every save goes through /admin/api, which checks the sign-in each time.
import { useEffect, useState } from 'react';
import { api, type Answer } from './api';
import { EditView } from './EditView';
import { ListView } from './ListView';
import { go, useRoute } from './route';

type Me = { email: string; collections: { name: string; label: string }[] };

export function App() {
  const [me, setMe] = useState<Answer<Me> | null>(null);
  const route = useRoute();
  useEffect(() => {
    let live = true;
    void api.me().then((answer) => live && setMe(answer));
    return () => {
      live = false;
    };
  }, []);

  const [name, second] = route;
  const only = me?.ok && me.value.collections.length === 1 ? me.value.collections[0].name : null;
  useEffect(() => {
    if (!name && only) go(only);
  }, [name, only]);

  return (
    <div className="admin">
      <header className="admin__bar">
        <a className="admin__home" href="#/">album.guide admin</a>
        <span className="admin__who">{me?.ok ? `Signed in as ${me.value.email}` : ''}</span>
        <a href="/picks">See the site</a>
      </header>
      <main className="admin__main">
        {!me ? (
          <p role="status">Loading…</p>
        ) : !me.ok ? (
          <p role="alert" className="notice notice--problem">{me.problem.message}</p>
        ) : !name ? (
          <>
            <h1>Lists you can edit</h1>
            <ul className="plain">
              {me.value.collections.map((c) => (
                <li key={c.name}><a href={`#/${c.name}`}>{c.label}</a></li>
              ))}
            </ul>
          </>
        ) : second === undefined || second === 'removed' ? (
          <ListView key={`${name}/${second ?? ''}`} collection={name} removed={second === 'removed'} />
        ) : (
          <EditView key={`${name}/${second}`} collection={name} id={second === 'new' ? null : second} />
        )}
      </main>
    </div>
  );
}
