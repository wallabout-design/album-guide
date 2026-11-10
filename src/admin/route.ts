// Where the admin is, kept in the address after the #, so the Back button
// works and a screen can be linked to: /picks, /picks/new, /picks/removed, /picks/<id>.
import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};
const readHash = () => window.location.hash;

export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribe, readHash);
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function go(...parts: string[]) {
  window.location.hash = `/${parts.map(encodeURIComponent).join('/')}`;
}
