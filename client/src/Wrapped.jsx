import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { get, fmt, plural } from './api.js';
import { useCoverColor } from './coverColor.js';
import { Art, Liked } from './ui.jsx';
import { play } from './sound.js';

const todayStr = () => new Date().toLocaleDateString('en-CA');
const CHOICES = [
  ['year', 'This year', () => `range=custom&from=${new Date().getFullYear()}-01-01&to=${todayStr()}`],
  ['6m', 'Last 6 months', () => 'range=6m'],
  ['life', 'All time', () => 'range=life'],
  ['custom', 'Pick dates', null],
];
const monthName = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short' });
const dayName = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

// "That's 28 days straight" style fact for the minutes card.
function minutesFact(min) {
  if (min >= 2880) return `That's ${Math.round(min / 1440)} days of music, back to back.`;
  if (min >= 120) return `That's ${Math.round(min / 60)} hours of music, back to back.`;
  return 'Every minute counts.';
}

function Card({ bg, dark, children, label }) {
  return (
    <div className={`story-card ${dark ? 'on-light' : ''}`} style={{ background: bg }} aria-label={label}>
      {children}
      <span className="mark">Echoes</span>
    </div>
  );
}

// Builds the list of cards from the data, skipping ones with nothing to show.
function buildCards(w, colors, title) {
  const cards = [];
  const a = w.topArtists[0];
  cards.push(
    <Card key="min" bg="var(--acc)" dark label="Minutes listened">
      <p className="k">{title}, you listened for</p>
      <p className="big huge">{fmt(w.minutes)}</p>
      <p className="unit">minutes</p>
      <p className="k fact">{minutesFact(w.minutes)}</p>
    </Card>,
  );
  if (a) {
    cards.push(
      <Card key="artist" bg={colors.artist ?? '#5b2340'} label="Top artist">
        <p className="k">Your top artist</p>
        <Art src={a.image} round className="story-art" />
        <p className="big name">{a.name}</p>
        <p className="k">{plural(a.streams, 'stream')} · {a.minutes >= 60 ? plural(Math.round(a.minutes / 60), 'hour') : plural(a.minutes, 'minute')}</p>
      </Card>,
    );
  }
  if (w.topTracks.length) {
    cards.push(
      <Card key="songs" bg="#121212" label="Top songs">
        <p className="big title">Your top songs</p>
        <ol className="story-list">
          {w.topTracks.map((t, i) => (
            <li key={t.id}>
              <b className="n">{i + 1}</b>
              <Art src={t.image} />
              <span><b>{t.name}</b><span className="dim">{t.artist}</span></span>
            </li>
          ))}
        </ol>
      </Card>,
    );
  }
  if (w.topGenres.length) {
    cards.push(
      <Card key="genre" bg="#121212" label="Top genre">
        <p className="k">Your top genre</p>
        <p className="big name accent">{w.topGenres[0].name}</p>
        {w.topGenres.length > 1 && <p className="k">Then {w.topGenres.slice(1).map((g) => g.name).join(' and ')}</p>}
      </Card>,
    );
  }
  if (w.obsession) {
    const o = w.obsession;
    cards.push(
      <Card key="obsession" bg={colors.obsession ?? '#2d3f6b'} label="Obsession">
        <p className="k">Your obsession</p>
        <Art src={o.image} className="story-art square" />
        <p className="big name">{o.name}</p>
        <p className="k">The week of {dayName(o.weekOf)}, you played it <b className="accent">{plural(o.streams, 'time')}</b>.</p>
      </Card>,
    );
  }
  if (w.likedCount) {
    const f = w.firstLiked;
    cards.push(
      <Card key="liked" bg="#121212" label="Liked songs">
        <p className="k">{title}, you liked</p>
        <p className="big huge accent">{fmt(w.likedCount)}</p>
        <p className="unit">new {w.likedCount === 1 ? 'song' : 'songs'}</p>
        {f?.name && (
          <>
            <p className="k fact">The first one was</p>
            <ol className="story-list">
              <li><span className="n"><Liked /></span><Art src={f.image} /><span><b>{f.name}</b><span className="dim">{f.artist}</span></span></li>
            </ol>
          </>
        )}
      </Card>,
    );
  }
  if (w.eras.length >= 2) {
    cards.push(
      <Card key="eras" bg="#121212" label="Monthly eras">
        <p className="big title">Your eras</p>
        <div className="eras">
          {w.eras.slice(-12).map((e) => (
            <p key={e.month}><span className="dim">{monthName(e.month)}</span><b className={e.artist === a?.name ? 'accent' : ''}>{e.artist}</b></p>
          ))}
        </div>
      </Card>,
    );
  }
  if (w.personality) {
    cards.push(
      <Card key="me" bg="#3d2b6b" label="Listening personality">
        <p className="k">Your listening personality</p>
        <p className="big name">{w.personality.title}</p>
        <div className="traits">
          {w.personality.traits.map((t) => (
            <p key={t.name}><b className="accent">{t.value}</b><span className="dim">{t.detail}</span></p>
          ))}
        </div>
      </Card>,
    );
  }
  cards.push(
    <Card key="summary" bg="var(--acc)" dark label="Summary">
      {a && <Art src={a.image} className="story-art small square" />}
      <div className="summary">
        <div><span className="dim">Top artists</span>{w.topArtists.slice(0, 3).map((x) => <b key={x.id}>{x.name}</b>)}</div>
        <div><span className="dim">Top songs</span>{w.topTracks.slice(0, 3).map((x) => <b key={x.id}>{x.name}</b>)}</div>
        <div><span className="dim">Minutes</span><b className="stat">{fmt(w.minutes)}</b></div>
        {w.topGenres.length ? (
          <div><span className="dim">Top genre</span><b className="stat">{w.topGenres[0].name}</b></div>
        ) : (
          <div><span className="dim">Different songs</span><b className="stat">{fmt(w.uniqueTracks)}</b></div>
        )}
      </div>
    </Card>,
  );
  return cards;
}

function Story({ data, title, onExit }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [saving, setSaving] = useState(false);
  const cardRef = useRef(null);
  const down = useRef(null);
  const colors = {
    artist: useCoverColor(data.topArtists[0]?.image),
    obsession: useCoverColor(data.obsession?.image),
  };
  const cards = buildCards(data, colors, title);
  const go = (d) => { setDir(d); setI((n) => Math.min(cards.length - 1, Math.max(0, n + d))); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onExit();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  // Tap left third = back, rest = next; or swipe sideways.
  function onPointerUp(e) {
    if (!down.current) return;
    const dx = e.clientX - down.current.x;
    down.current = null;
    if (Math.abs(dx) > 40) return go(dx < 0 ? 1 : -1);
    const r = e.currentTarget.getBoundingClientRect();
    go(e.clientX - r.left < r.width / 3 ? -1 : 1);
  }

  async function save() {
    setSaving(true);
    try {
      // 360px card × 3 = a 1080 × 1920 story image
      const url = await toPng(cardRef.current.querySelector('.story-card'), { pixelRatio: 3, cacheBust: true });
      const link = Object.assign(document.createElement('a'), { href: url, download: `echoes-wrapped-${i + 1}.png` });
      link.click();
      play('ok');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="story">
      <div className="story-bars" aria-hidden="true">
        {cards.map((_, n) => <i key={n} className={n <= i ? 'on' : ''} />)}
      </div>
      <div
        className="story-stage"
        ref={cardRef}
        onPointerDown={(e) => { down.current = { x: e.clientX }; }}
        onPointerUp={onPointerUp}
        aria-live="polite"
      >
        <div className={`story-slide ${dir > 0 ? 'from-right' : 'from-left'}`} key={i}>{cards[i]}</div>
      </div>
      <div className="story-actions">
        <button className="pill" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous card">Back</button>
        <span className="sub">{i + 1} / {cards.length}</span>
        <button className="pill" onClick={() => go(1)} disabled={i === cards.length - 1} aria-label="Next card">Next</button>
      </div>
      <div className="story-actions">
        <button className="button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save image'}</button>
        <button className="button ghost" onClick={onExit}>Done</button>
      </div>
    </div>
  );
}

export default function Wrapped() {
  const [choice, setChoice] = useState('year');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [state, setState] = useState({ data: null, error: null, loading: false });

  const pick = CHOICES.find((c) => c[0] === choice);
  const query = choice === 'custom' ? (from && to && from <= to ? `range=custom&from=${from}&to=${to}` : null) : pick[2]();
  const title = choice === 'year' ? `In ${new Date().getFullYear()}` : choice === '6m' ? 'In the last 6 months' : choice === 'life' ? 'Since you started' : 'In this stretch';

  async function play() {
    setState({ data: null, error: null, loading: true });
    try {
      const data = await get(`/api/stats/wrapped?${query}`);
      setState({ data: data.streams ? data : null, error: data.streams ? null : new Error('empty'), loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
  }

  if (state.data) return <div className="page"><Story data={state.data} title={title} onExit={() => setState({ data: null, error: null, loading: false })} /></div>;

  return (
    <div className="page">
      <section className="wrapped-start">
        <p className="logo">Echoes Wrapped</p>
        <p className="hero-name">Your story, any time.</p>
        <div className="pills" role="group" aria-label="Wrapped range">
          {CHOICES.map(([id, label]) => (
            <button key={id} className="pill" aria-pressed={choice === id} onClick={() => setChoice(id)}>{label}</button>
          ))}
        </div>
        {choice === 'custom' && (
          <div className="dates">
            <label className="sub">From <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="sub">To <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
        <button className="button" onClick={play} disabled={!query || state.loading}>{state.loading ? 'Wrapping…' : 'Play my Wrapped'}</button>
        {state.error?.message === 'empty' && <p className="sub">No streams in this range yet. Try All time, or import your history on the Your data page.</p>}
        {state.error && state.error.message !== 'empty' && <p className="error">Couldn't build your Wrapped: {state.error.message}</p>}
      </section>
    </div>
  );
}
