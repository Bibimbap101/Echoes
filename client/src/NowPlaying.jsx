import { useEffect, useState } from 'react';
import { get } from './api.js';
import { Art, Liked } from './ui.jsx';

const POLL_MS = 10_000;
const time = (ms) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms / 1000) % 60)).padStart(2, '0')}`;

// What's playing on your Spotify right now. Read-only: Spotify stays the player.
export default function NowPlaying() {
  const [np, setNp] = useState(null);
  const [at, setAt] = useState(0); // when np was fetched, to move the progress bar between polls
  const [, tick] = useState(0);

  useEffect(() => {
    let live = true;
    const load = () => {
      if (document.hidden) return;
      get('/api/now-playing').then(
        (d) => live && (setNp(d), setAt(Date.now())),
        () => live && setNp(null), // errors just hide the bar
      );
    };
    load();
    const id = setInterval(load, POLL_MS);
    addEventListener('visibilitychange', load);
    return () => { live = false; clearInterval(id); removeEventListener('visibilitychange', load); };
  }, []);

  useEffect(() => {
    if (!np?.isPlaying) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [np]);

  if (!np) return null;
  const progress = Math.min(np.progressMs + (np.isPlaying ? Date.now() - at : 0), np.durationMs);

  return (
    <section className="np" aria-label="Now playing on Spotify">
      <Art src={np.image} />
      <span className="title">
        <b>{np.liked && <Liked />}{np.name}</b>
        <span className="sub">{np.artist}</span>
      </span>
      <div className="np-time sub">
        <span>{time(progress)}</span>
        <div className="np-bar" aria-hidden="true"><i style={{ width: `${(progress / np.durationMs) * 100}%` }} /></div>
        <span>{time(np.durationMs)}</span>
        {!np.isPlaying && <span className="np-paused">Paused</span>}
      </div>
      {np.spotifyUrl && <a className="np-open" href={np.spotifyUrl} target="_blank" rel="noreferrer">Open Spotify</a>}
    </section>
  );
}
