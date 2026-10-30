import { useEffect, useState } from 'react';
import Home from './Home.jsx';
import Top from './Top.jsx';
import Import from './Import.jsx';
import Stats from './Stats.jsx';
import Wrapped from './Wrapped.jsx';
import NowPlaying, { useNowPlaying } from './NowPlaying.jsx';
import Settings from './Settings.jsx';
import { prefs } from './prefs.js';
import Privacy from './Privacy.jsx';
import { Eq, SoundToggle } from './ui.jsx';
import { forgetCache } from './api.js';

// [id, label, icon path (24px, stroked)]
const PAGES = [
  ['home', 'Home', 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
  ['top', 'Top', 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a4 4 0 0 1-3 4M7 5H4v2a4 4 0 0 0 3 4'],
  ['stats', 'Stats', 'M3 21h18M6 17v-6M11 17V5M16 17v-9M21 17v-3'],
  ['wrapped', 'Wrapped', 'M12 3l2 5.5L19.5 10.5 14 12.5 12 18l-2-5.5-5.5-2L10 8.5zM19 3v4M17 5h4'],
  ['import', 'Your data', 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 21a8 8 0 0 1 16 0'],
];

const pageFromHash = () => location.hash.replace('#/', '') || prefs().start;

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = logged out
  const [page, setPage] = useState(pageFromHash);
  const error = new URLSearchParams(location.search).get('error');
  const { np, at } = useNowPlaying(Boolean(me));

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe, () => setMe(null));
    const onHash = () => setPage(pageFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    forgetCache(); // the next person on this browser shouldn't see your cached stats
    setMe(null);
  }

  if (me === undefined) return <main className="center" aria-busy="true" />;

  if (!me && page === 'privacy') {
    return <main className="main"><Privacy /><p><a className="sub" href="#/">← Back</a></p></main>;
  }

  if (!me) {
    return (
      <main className="center">
        <p className="logo"><img src="/icon.svg" alt="" />Echoes</p>
        <p className="sub">Your listening, all year round.</p>
        {error && <p className="error">Login didn't work ({error}). Try again.</p>}
        <a className="button" href="/api/auth/login">Log in with Spotify</a>
        <a className="sub" href="#/privacy">Privacy</a>
      </main>
    );
  }

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <p className="logo"><img src="/icon.svg" alt="" />Echoes</p>
        {PAGES.map(([id, label, icon]) => (
          <a key={id} className="nav" href={`#/${id}`} aria-current={page === id ? 'page' : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>
            {label}
          </a>
        ))}
        <div className="me">
          <div className="me-who">
            {me.imageUrl ? <img src={me.imageUrl} alt="" className={np?.isPlaying ? 'live' : ''} /> : <span className="ph round" />}
            <span className="title">
              <b>{me.displayName}</b>
              <span className="sub">{np?.isPlaying ? <><Eq />{np.name} · {np.artist}</> : 'Connected to Spotify'}</span>
            </span>
          </div>
          <div className="me-bar">
            <SoundToggle />
            <a className="icon-btn" href="#/settings" aria-current={page === 'settings' ? 'page' : undefined} title="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
              <span className="sr-only">Settings</span>
            </a>
            <button className="icon-btn" onClick={logout} title="Log out">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              <span className="sr-only">Log out</span>
            </button>
          </div>
        </div>
      </nav>
      <main className="main">
        {page === 'home' && <Home me={me} />}
        {page === 'top' && <Top />}
        {page === 'import' && <Import me={me} onLogout={logout} />}
        {page === 'stats' && <Stats />}
        {page === 'wrapped' && <Wrapped />}
        {page === 'privacy' && <Privacy />}
        {page === 'settings' && <Settings onLogout={logout} />}
      </main>
      <NowPlaying np={np} at={at} />
    </div>
  );
}
