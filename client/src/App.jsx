import { useEffect, useState } from 'react';
import Home from './Home.jsx';
import Top from './Top.jsx';
import Import from './Import.jsx';
import Stats from './Stats.jsx';
import Wrapped from './Wrapped.jsx';
import NowPlaying from './NowPlaying.jsx';
import Privacy from './Privacy.jsx';

const PAGES = [
  ['home', 'Home'],
  ['top', 'Top'],
  ['stats', 'Stats'],
  ['wrapped', 'Wrapped'],
  ['import', 'Your data'],
];

const pageFromHash = () => location.hash.replace('#/', '') || 'home';

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = logged out
  const [page, setPage] = useState(pageFromHash);
  const error = new URLSearchParams(location.search).get('error');

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
    setMe(null);
  }

  if (me === undefined) return <main className="center" aria-busy="true" />;

  if (!me && page === 'privacy') {
    return <main className="main"><Privacy /><p><a className="sub" href="#/">← Back</a></p></main>;
  }

  if (!me) {
    return (
      <main className="center">
        <p className="logo">Echoes</p>
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
        <p className="logo">Echoes</p>
        {PAGES.map(([id, label]) => (
          <a key={id} className="nav" href={`#/${id}`} aria-current={page === id ? 'page' : undefined}>{label}</a>
        ))}
        <div className="me">
          {me.imageUrl && <img src={me.imageUrl} alt="" />}
          <span>{me.displayName}</span>
        </div>
      </nav>
      <main className="main">
        {page === 'home' && <Home me={me} />}
        {page === 'top' && <Top />}
        {page === 'import' && <Import me={me} onLogout={logout} />}
        {page === 'stats' && <Stats />}
        {page === 'wrapped' && <Wrapped />}
        {page === 'privacy' && <Privacy />}
      </main>
      <NowPlaying />
    </div>
  );
}
