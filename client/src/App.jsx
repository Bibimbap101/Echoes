import { useEffect, useState } from 'react';
import Home from './Home.jsx';
import Top from './Top.jsx';
import Import from './Import.jsx';
import Stats from './Stats.jsx';
import Wrapped from './Wrapped.jsx';
import NowPlaying, { useNowPlaying } from './NowPlaying.jsx';
import Settings from './Settings.jsx';
import { prefs, setPref } from './prefs.js';
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

// Sidebar width in px; dragging thinner than SNAP folds it into the icon rail
const MIN_W = 220, MAX_W = 360, WIDTH = 232, SNAP = 150;
const clampW = (w) => Math.min(MAX_W, Math.max(MIN_W, w));

function useSidebar() {
  const [w, setW] = useState(() => prefs().sideW);
  const [rail, setRail] = useState(() => prefs().rail);
  const [dragging, setDragging] = useState(false);
  const save = (nw, nr) => { setW(nw); setRail(nr); setPref('sideW', nw); setPref('rail', nr); };
  const toggle = () => setRail((r) => { setPref('rail', !r); return !r; });

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggle(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  function startDrag(e) {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX, w0 = rail ? 72 : w;
    let next = [w, rail];
    setDragging(true);
    el.onpointermove = (m) => {
      const nw = w0 + m.clientX - x0;
      next = nw < SNAP ? [w, true] : [clampW(nw), false];
      setW(next[0]); setRail(next[1]);
    };
    el.onpointerup = el.onpointercancel = () => {
      el.onpointermove = el.onpointerup = el.onpointercancel = null;
      setDragging(false);
      save(...next);
    };
  }

  const handle = {
    role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize sidebar', tabIndex: 0,
    'aria-valuenow': rail ? 72 : w, 'aria-valuemin': 72, 'aria-valuemax': MAX_W,
    onPointerDown: startDrag,
    onDoubleClick: () => save(WIDTH, false),
    onKeyDown: (e) => {
      const step = { ArrowLeft: -16, ArrowRight: 16 }[e.key];
      if (!step) return;
      e.preventDefault();
      if (rail) { if (step > 0) save(w, false); } else if (step < 0 && w <= MIN_W) save(w, true); else save(clampW(w + step), false);
    },
  };
  return { w, rail, dragging, toggle, handle };
}

// Spotify said 403: this account isn't on the dashboard's User Management list yet.
function NotOnList() {
  useEffect(() => {
    const s = document.createElement('script');
    s.src = 'https://tenor.com/embed.js'; // turns the div below into the GIF
    s.async = true;
    document.body.append(s);
    return () => s.remove();
  }, []);
  return (
    <main className="center not-listed">
      <p className="logo"><img src="/icon.svg" alt="" />Echoes</p>
      <div className="tenor-gif-embed" data-postid="20974962" data-share-method="host" data-aspect-ratio="1" data-width="100%">
        <a href="https://tenor.com/view/mina-twice-twice-mina-twice-mina-no-mina-no-gif-20974962">Mina Twice GIF</a>
      </div>
      <h1>You're not on the list yet</h1>
      <p className="sub">Send the dev the email you use for Spotify. Once they add you, log in again.</p>
      <a className="button" href="https://www.instagram.com/bibimbapkr/" target="_blank" rel="noreferrer">Send Email</a>
      <a className="sub" href="/api/auth/login">Try logging in again</a>
    </main>
  );
}

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = logged out
  const [page, setPage] = useState(pageFromHash);
  const error = new URLSearchParams(location.search).get('error');
  const { np, at } = useNowPlaying(Boolean(me));
  const side = useSidebar();

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe, () => setMe(null));
    const onHash = () => setPage(pageFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  // A new page starts at its top (phones scroll the window, wider screens scroll the panel)
  useEffect(() => { scrollTo(0, 0); document.querySelector('.main')?.scrollTo(0, 0); }, [page]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    forgetCache(); // the next person on this browser shouldn't see your cached stats
    setMe(null);
  }

  if (me === undefined) return <main className="center" aria-busy="true" />;

  if (!me && page === 'privacy') {
    return <main className="main"><Privacy /><p><a className="sub" href="#/">← Back</a></p></main>;
  }

  if (!me && error === 'not_on_list') return <NotOnList />;

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
    <div
      className={`shell${side.rail ? ' rail' : ''}${side.dragging ? ' dragging' : ''}`}
      style={{ '--side-w': side.rail ? '72px' : `${side.w}px` }}
    >
      <nav className="side" aria-label="Main">
        <div className="side-top">
          <p className="logo"><img src="/icon.svg" alt="" /><span>Echoes</span></p>
          <button className="icon-btn" onClick={side.toggle} aria-expanded={!side.rail} title={`${side.rail ? 'Open' : 'Close'} sidebar (Ctrl+B)`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={side.rail ? 'M4 4h16v16H4zM9 4v16M14 10l2 2-2 2' : 'M4 4h16v16H4zM9 4v16M16 10l-2 2 2 2'} /></svg>
            <span className="sr-only">{side.rail ? 'Open sidebar' : 'Close sidebar'}</span>
          </button>
        </div>
        {PAGES.map(([id, label, icon]) => (
          <a key={id} className="nav" href={`#/${id}`} aria-current={page === id ? 'page' : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>
            <span className="label">{label}</span>
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
        <div className="side-drag" {...side.handle} />
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
