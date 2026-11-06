import { useEffect, useState } from 'react';
import { get } from './api.js';
import { Art, Eq, Liked } from './ui.jsx';
import { useAmbient, useCoverColor } from './coverColor.js';

const POLL_MS = 10_000;
const LEAVE_MS = 320; // matches .np.leaving in index.css
const time = (ms) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms / 1000) % 60)).padStart(2, '0')}`;

// What's playing on your Spotify right now (null when nothing). `at` = when it was fetched, to move the bar between polls.
export function useNowPlaying(enabled) {
  const [state, setState] = useState({ np: null, at: 0 });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = () => {
      if (document.hidden) return;
      get('/api/now-playing').then(
        (np) => live && setState({ np, at: Date.now() }),
        () => live && setState({ np: null, at: 0 }), // errors just hide the bar
      );
    };
    load();
    const id = setInterval(load, POLL_MS);
    addEventListener('visibilitychange', load);
    return () => { live = false; clearInterval(id); removeEventListener('visibilitychange', load); };
  }, [enabled]);
  return state;
}

// Read-only: Spotify stays the player. Slides up when a song starts, slides away when it stops.
export default function NowPlaying({ np, at }) {
  const [shown, setShown] = useState(np); // keeps the last song on screen while the bar slides away
  const [, tick] = useState(0);

  useEffect(() => {
    if (np) return setShown(np);
    const id = setTimeout(() => setShown(null), LEAVE_MS);
    return () => clearTimeout(id);
  }, [np]);

  useEffect(() => {
    if (!np?.isPlaying) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [np]);

  useAmbient(np?.isPlaying ? np.image : null, 'playing'); // tints pages that have no art of their own
  const color = useCoverColor(shown?.image);
  if (!shown) return null;
  const s = np ?? shown;
  const progress = Math.min(s.progressMs + (s.isPlaying && np ? Date.now() - at : 0), s.durationMs);

  return (
    <section className={`np${np ? '' : ' leaving'}`} style={{ '--np': color ?? undefined }} aria-label="Now playing on Spotify">
      <Art key={s.image} src={s.image} className="np-art" />
      <span className="title">
        <b>{s.liked && <Liked />}{s.name}</b>
        <span className="sub">{s.isPlaying ? <Eq /> : <span className="np-paused">Paused · </span>}{s.artist}</span>
      </span>
      {s.durationMs != null && ( // Last.fm doesn't say how far into the song you are
        <div className="np-time sub">
          <span>{time(progress)}</span>
          <div className="np-bar" aria-hidden="true"><i style={{ width: `${(progress / s.durationMs) * 100}%` }} /></div>
          <span>{time(s.durationMs)}</span>
        </div>
      )}
      {s.spotifyUrl && (
        <a className="np-open" href={s.spotifyUrl} target="_blank" rel="noreferrer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
          <span>Open Spotify</span>
        </a>
      )}
    </section>
  );
}
