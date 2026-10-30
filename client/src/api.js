import { useEffect, useState } from 'react';

export async function get(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// Answers already fetched this tab session: pages paint instantly from these, then refresh quietly.
const cache = new Map();
function cached(path) {
  if (!cache.has(path)) {
    try { const v = JSON.parse(sessionStorage.getItem(`api:${path}`)); if (v) cache.set(path, v); } catch {}
  }
  return cache.get(path) ?? null;
}
function remember(path, data) {
  cache.set(path, data);
  try { sessionStorage.setItem(`api:${path}`, JSON.stringify(data)); } catch {} // full or blocked: memory still works
}
export function forgetCache() {
  cache.clear();
  try { sessionStorage.clear(); } catch {}
}

// Fetches `path` (skips when null). Shows the cached answer (or the old data) while fresh data loads, so nothing flashes.
export function useApi(path) {
  const [state, setState] = useState(() => ({ data: path && cached(path), error: null, loading: Boolean(path) }));
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ data: cached(path) ?? s.data, error: null, loading: true }));
    get(path).then(
      (data) => { remember(path, data); if (live) setState({ data, error: null, loading: false }); },
      (error) => live && setState((s) => ({ ...s, error, loading: false })),
    );
    return () => { live = false; };
  }, [path]);
  return state;
}

export const fmt = (n) => (n == null ? '—' : n.toLocaleString());
export const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`;

// % change vs previous period; null when there's nothing to compare against.
export const pctChange = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);
