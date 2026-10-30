import { useEffect, useRef, useState } from 'react';
import { useApi, fmt, pctChange, get, plural } from './api.js';
import { Art, Liked, Pct, RangePicker, useRange } from './ui.jsx';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hourLabel = (h) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
const longDate = (s) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

// The element's real width, so chart text is drawn at true size instead of shrinking on phones.
function useWidth(fallback = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width) || fallback));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, width];
}

function Tile({ label, value, before }) {
  return (
    <div className="tile-stat">
      <span className="sub">{label}</span>
      <b>{fmt(value)}</b>
      {before != null && <span className="sub"><Pct value={pctChange(value, before)} /></span>}
    </div>
  );
}

// 7 × 24 grid; brighter green = more minutes. Mongo's day 1 = Sunday, shown here starting Monday.
function ListeningClock({ cells }) {
  const [tip, setTip] = useState(null);
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of cells) grid[(c.day + 5) % 7][c.hour] = c.minutes;
  const max = Math.max(1, ...grid.flat());
  let peak = null;
  grid.forEach((row, d) => row.forEach((m, h) => { if (m && (!peak || m > peak.m)) peak = { d, h, m }; }));

  return (
    <section className="box">
      <div className="box-head"><h2>Listening clock</h2><span className="sub">Brighter = more minutes</span></div>
      <p className="sub">
        {peak ? <>You listen most on <b className="white">{DAYS[peak.d]}s around {hourLabel(peak.h)}</b>.</> : 'No plays in this range yet.'}
      </p>
      <div className="clock-scroll">
        <div className="clock" role="img" aria-label={peak ? `Most listening on ${DAYS[peak.d]}s around ${hourLabel(peak.h)}` : 'No listening data'} onMouseLeave={() => setTip(null)}>
          {grid.map((row, d) => [
            <span key={`l${d}`} className="sub">{DAYS[d]}</span>,
            ...row.map((m, h) => (
              <div
                key={`${d}-${h}`}
                className="cell"
                style={{ background: `rgb(30 215 96 / ${(0.06 + 0.94 * (m / max)).toFixed(2)})` }}
                onMouseEnter={(e) => setTip({ text: `${DAYS[d]} ${hourLabel(h)} · ${fmt(m)} min`, x: e.currentTarget.offsetLeft, y: e.currentTarget.offsetTop })}
              />
            )),
          ])}
          {tip && <div className="tip" style={{ left: tip.x, top: tip.y - 30 }}>{tip.text}</div>}
        </div>
        <div className="clock-hours sub" aria-hidden="true"><span /><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span></div>
      </div>
    </section>
  );
}

// Fills the dates the server skipped (no plays) with 0 so the line doesn't lie.
function fillGaps(points, unit) {
  if (!points.length) return [];
  const byDate = new Map(points.map((p) => [p.date, p.minutes]));
  const out = [];
  const d = new Date(`${points[0].date}T00:00:00Z`);
  const end = points.at(-1).date;
  for (let s = points[0].date; s <= end; s = d.toISOString().slice(0, 10)) {
    out.push({ date: s, minutes: byDate.get(s) ?? 0 });
    if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCDate(d.getUTCDate() + (unit === 'week' ? 7 : 1));
  }
  return out;
}

function MinutesChart({ query }) {
  const [unit, setUnit] = useState('week');
  const [hover, setHover] = useState(null);
  const { data } = useApi(query && `/api/stats/timeline?${query}&unit=${unit}`);
  const pts = fillGaps(data ?? [], unit);
  const [box, W] = useWidth();
  const H = 200, L = 40, B = 22;
  const max = Math.max(60, ...pts.map((p) => p.minutes));
  const x = (i) => L + (pts.length > 1 ? (i * (W - L - 8)) / (pts.length - 1) : (W - L) / 2);
  const y = (v) => H - B - (v / max) * (H - B - 12);

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - 8)) * (pts.length - 1));
    setHover(Math.max(0, Math.min(pts.length - 1, i)));
  }

  const h = hover != null ? pts[hover] : null;
  return (
    <section className="box" ref={box}>
      <div className="box-head">
        <h2>Minutes over time</h2>
        <div className="pills small" role="group" aria-label="Group by">
          {['day', 'week', 'month'].map((u) => (
            <button key={u} className="pill" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u[0].toUpperCase() + u.slice(1)}</button>
          ))}
        </div>
      </div>
      {pts.length === 0 ? (
        <p className="sub">No plays in this range yet.</p>
      ) : (
        <div className="chart">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Minutes listened per ${unit}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            {[0, max / 2, max].map((g) => (
              <g key={g}>
                <line x1={L} x2={W} y1={y(g)} y2={y(g)} stroke="#2a2a2a" />
                <text x={L - 8} y={y(g) + 4} fill="#b3b3b3" fontSize="11" textAnchor="end">{fmt(Math.round(g))}</text>
              </g>
            ))}
            <polyline fill="none" stroke="#1ed760" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p, i) => `${x(i)},${y(p.minutes)}`).join(' ')} />
            <text x={L} y={H - 4} fill="#b3b3b3" fontSize="11">{longDate(pts[0].date)}</text>
            {pts.length > 1 && <text x={W} y={H - 4} fill="#b3b3b3" fontSize="11" textAnchor="end">{longDate(pts.at(-1).date)}</text>}
            {pts.length === 1 && <circle cx={x(0)} cy={y(pts[0].minutes)} r="5" fill="#1ed760" />} {/* a lone point has no line to draw */}
            {h && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={8} y2={H - B} stroke="#fff" strokeOpacity="0.35" />
                <circle cx={x(hover)} cy={y(h.minutes)} r="5" fill="#1ed760" stroke="#1a1a1a" strokeWidth="2" />
              </>
            )}
          </svg>
          {h && (
            <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.minutes) / H) * 100}%` }}>
              {unit === 'month' ? new Date(`${h.date}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : `${unit === 'week' ? 'Week of ' : ''}${longDate(h.date)}`} · {fmt(h.minutes)} min
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Streaks({ query }) {
  const { data } = useApi(query && `/api/stats/streak?${query}`);
  const l = data?.longest;
  return (
    <section className="box">
      <h2>Streaks</h2>
      <p className="big-num">{fmt(l?.days ?? 0)}<small>{l?.days === 1 ? 'day' : 'days'}</small></p>
      <p className="sub">{l?.start ? `Longest · ${longDate(l.start)} – ${longDate(l.end)}` : 'No streak in this range yet'}</p>
      {data?.current > 0 && <p className="streak-now"><span className="up">{data.current} {data.current === 1 ? 'day' : 'days'}</span> and counting</p>}
    </section>
  );
}

function Skips({ query }) {
  const { data } = useApi(query && `/api/stats/skips?${query}`);
  return (
    <section className="box">
      <div className="box-head"><h2>Skips</h2><span className="sub">imported plays only</span></div>
      {data?.skipRate == null ? (
        <p className="sub">Skips come from your imported history. Import it on the Your data page.</p>
      ) : (
        <>
          <p>You skip <b>{Math.round(data.skipRate * 100)}%</b> of songs</p>
          <div className="skip-list">
            {data.mostSkipped.slice(0, 5).map((t) => (
              <a key={t.id} className="skip-row" href={`https://open.spotify.com/track/${t.id}`} target="_blank" rel="noreferrer">
                <Art src={t.image} />
                <span className="title"><b>{t.name}</b><span className="sub">{t.artist}</span></span>
                <span className="sub" title={`${t.skips} of ${t.plays} plays`}>{Math.round(t.skipRate * 100)}%</span>
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// Songs added to Liked Songs per month. Bars, because each month is its own count.
function LikedChart({ months }) {
  const [hover, setHover] = useState(null);
  const pts = fillGaps(months.map((m) => ({ date: `${m.month}-01`, minutes: m.songs })), 'month').slice(-24);
  const [box, W] = useWidth();
  const H = 160, B = 22, gap = 2;
  const max = Math.max(1, ...pts.map((p) => p.minutes));
  const bw = W / pts.length;
  const monthLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const h = hover != null ? pts[hover] : null;
  return (
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Songs liked per month" onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={H - B} y2={H - B} stroke="#2a2a2a" />
        {pts.map((p, i) => {
          const bh = Math.max((p.minutes / max) * (H - B - 12), p.minutes ? 3 : 0);
          return (
            <g key={p.date} onMouseEnter={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H - B} fill="transparent" />
              <path
                fill={hover === i ? '#fff' : '#1ed760'}
                d={`M${i * bw + gap / 2},${H - B} v${-Math.max(bh - 4, 0)} q0,-4 4,-4 h${Math.max(bw - gap - 8, 0)} q4,0 4,4 v${Math.max(bh - 4, 0)} z`}
                opacity={bh ? 1 : 0}
              />
            </g>
          );
        })}
        <text x={0} y={H - 4} fill="#b3b3b3" fontSize="11">{monthLabel(pts[0].date)}</text>
        <text x={W} y={H - 4} fill="#b3b3b3" fontSize="11" textAnchor="end">{monthLabel(pts.at(-1).date)}</text>
      </svg>
      {h && (
        <div className="tip" style={{ left: `${(((hover + 0.5) * bw) / W) * 100}%`, top: `${((H - B - (h.minutes / max) * (H - B - 12)) / H) * 100}%` }}>
          {monthLabel(h.date)} · {fmt(h.minutes)} liked
        </div>
      )}
    </div>
  );
}

function Library({ r }) {
  const { data: l } = useApi(r.query && `/api/stats/library?${r.query}`);
  if (!l) return null;
  if (!l.syncedAt && !l.likedSongs) return <p className="sub">Your library is syncing with Spotify. Check back in a minute.</p>;
  const m = l.mostPlayedLiked;
  return (
    <>
      <h2>Your library</h2>
      <div className="stat-tiles">
        <div className="tile-stat">
          <span className="sub">Liked Songs</span>
          <b>{fmt(l.likedSongs)}</b>
          {r.range !== 'life' && <span className="sub"><span className="up">+{fmt(l.likedInRange)}</span> in the {r.label}</span>}
        </div>
        <Tile label="Saved albums" value={l.savedAlbums} />
        <Tile label="Artists you follow" value={l.following} />
        <Tile label="Playlists" value={l.playlists} />
      </div>
      <div className="two-up">
        <section className="box">
          <div className="box-head"><h2>Songs you liked</h2><span className="sub">per month</span></div>
          {l.likedPerMonth.length ? <LikedChart months={l.likedPerMonth} /> : <p className="sub">You didn't like any songs in the {r.label}.</p>}
        </section>
        <section className="box">
          <h2>Most played liked song</h2>
          {m ? (
            <a className="skip-row" href={m.spotifyUrl} target="_blank" rel="noreferrer">
              <Art src={m.image} />
              <span className="title"><b><Liked />{m.name}</b><span className="sub">{m.artist}</span></span>
              <span className="sub">{plural(m.streams, 'stream')}</span>
            </a>
          ) : <p className="sub">None of your liked songs were played in this range.</p>}
          <h2>Top artists you don't follow yet</h2>
          {l.notFollowed.length ? (
            <div className="skip-list">
              {l.notFollowed.map((a) => (
                <a key={a.id} className="skip-row" href={a.spotifyUrl ?? undefined} target="_blank" rel="noreferrer">
                  <Art src={a.image} round />
                  <span className="title"><b>{a.name}</b></span>
                  <span className="sub">{plural(a.streams, 'stream')}</span>
                </a>
              ))}
            </div>
          ) : <p className="sub">You follow all your top artists.</p>}
        </section>
      </div>
    </>
  );
}

function FirstListened() {
  const [q, setQ] = useState('');
  const [result, setResult] = useState(undefined); // undefined = not searched yet, null = not found
  const [error, setError] = useState(null);

  async function search(e) {
    e.preventDefault();
    if (!q.trim()) return setError('Type an artist or song name first.');
    setError(null);
    try { setResult(await get(`/api/stats/first?q=${encodeURIComponent(q.trim())}`)); }
    catch (err) { setError(err.message); }
  }

  const years = result && (Date.now() - new Date(result.playedAt)) / (365.25 * 86_400_000);
  return (
    <section className="box">
      <h2>When did I first play…</h2>
      <form className="search" onSubmit={search}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setError(null); }} placeholder="LE SSERAFIM" aria-label="Artist or song name" />
        <button className="pill" type="submit">Search</button>
      </form>
      {error && <p className="error sub">{error}</p>}
      {result === null && <p className="sub">No plays found for "{q}". Check the spelling. It needs the full name.</p>}
      {result && (
        <div className="first">
          <Art src={result.image} round={result.type === 'artist'} />
          <div>
            <p>First played <b>{new Date(result.playedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b></p>
            <p className="sub">
              {result.type === 'artist' ? `The song was "${result.track}"` : `by ${result.artist}`}
              {years >= 1 ? ` · ${Math.floor(years)} year${years >= 2 ? 's' : ''} ago` : ''}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Stats() {
  const r = useRange('1y');
  const { data: s } = useApi(r.query && `/api/stats/summary?${r.query}`);
  const { data: clock } = useApi(r.query && `/api/stats/clock?${r.query}`);
  const p = s?.previous;

  return (
    <div className="page">
      <h1>Stats</h1>
      <div className="controls"><RangePicker r={r} /></div>

      <div className="stat-tiles">
        <Tile label="Streams" value={s?.streams} before={p?.streams} />
        <Tile label="Minutes" value={s?.minutes} before={p?.minutes} />
        <Tile label="Hours" value={s?.hours} before={p?.hours} />
        <Tile label="Different songs" value={s?.uniqueTracks} before={p?.uniqueTracks} />
        <Tile label="Artists" value={s?.uniqueArtists} before={p?.uniqueArtists} />
        <Tile label="Albums" value={s?.uniqueAlbums} before={p?.uniqueAlbums} />
      </div>

      <div className="pair">
        {clock && <ListeningClock cells={clock} />}
        <MinutesChart query={r.query} />
      </div>
      <div className="two-up">
        <Streaks query={r.query} />
        <Skips query={r.query} />
      </div>
      <FirstListened />
      <Library r={r} />
    </div>
  );
}
