import { useEffect, useState } from 'react';
import { get } from './api.js';
import { Art } from './ui.jsx';

const CHECK_MS = 10_000;
const HINT_AFTER_MS = 5 * 60_000; // no song after this long: show what to check
const DONE_MS = 2000; // time to read "You're connected" before Home opens

// First visit for a Last.fm user: link Spotify to Last.fm, play a song, done. Skipped when plays already exist.
export default function LastfmSetup({ me, np, onDone }) {
  const [plays, setPlays] = useState(null); // null = first check still running
  const [since] = useState(Date.now);

  useEffect(() => {
    let first = true;
    const load = () =>
      get('/api/import/status').then(
        (s) => {
          const n = (s.plays.import ?? 0) + (s.plays.poll ?? 0);
          if (first && n > 0) onDone(); // set up on an earlier visit
          first = false;
          setPlays(n);
        },
        () => setPlays((p) => p ?? 0), // can't check: show the steps anyway
      );
    load();
    const id = setInterval(load, CHECK_MS);
    return () => clearInterval(id);
  }, [onDone]);

  const found = Boolean(np) || plays > 0;
  useEffect(() => {
    if (!found) return;
    const id = setTimeout(onDone, DONE_MS);
    return () => clearTimeout(id);
  }, [found, onDone]);

  if (plays === null) return <div aria-busy="true" />;
  const slow = !found && Date.now() - since > HINT_AFTER_MS; // re-checked on every 10s status update

  return (
    <section className="setup" aria-live="polite">
      <h1>{found ? "You're connected" : `Hi, ${me.displayName}. Two quick steps`}</h1>
      <ol className="setup-steps">
        <li className={found ? 'done' : ''}>
          <span className="setup-n">{found ? '✓' : '1'}</span>
          <div>
            <b>{found ? 'Spotify linked' : 'Link Spotify to Last.fm'}</b>
            {!found && <>
              <p className="sub">One time. Press Connect next to Spotify Scrobbling.</p>
              <a className="button small" href="https://www.last.fm/settings/applications" target="_blank" rel="noreferrer">Open Last.fm settings ↗</a>
            </>}
          </div>
        </li>
        <li className={found ? 'done' : ''}>
          <span className="setup-n">{found ? '✓' : '2'}</span>
          <div>
            {found ? <>
              <b>We heard you</b>
              {np && <div className="setup-np"><Art src={np.image} className="setup-art" /><span><b>{np.name}</b><span className="sub">{np.artist}</span></span></div>}
            </> : <>
              <b>Play any song on Spotify</b>
              <p className="sub"><span className="setup-dot" />Checking every 10 seconds…</p>
              {slow && <p className="sub">Still nothing? On Last.fm, check that Spotify Scrobbling says Connected.</p>}
            </>}
          </div>
        </li>
        {!found && (
          <li>
            <span className="setup-n">+</span>
            <div>
              <b>Older years?</b>
              <p className="sub">Last.fm only counts from today. Upload your Spotify history for the rest.</p>
              <a className="button ghost small" href="#/import">Upload files</a>
            </div>
          </li>
        )}
      </ol>
      <p className="sub">Plays come from <a href={`https://www.last.fm/user/${encodeURIComponent(me.id)}`} target="_blank" rel="noreferrer">Last.fm</a>.</p>
    </section>
  );
}
