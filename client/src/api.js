import { useEffect, useState } from 'react';

export async function get(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// Fetches `path` (skips when null). Keeps the old data while new data loads, so lists don't flash.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    get(path).then(
      (data) => live && setState({ data, error: null, loading: false }),
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
