import { useState } from 'react';
import { fmt } from './api.js';

const RANGES = [
  ['4w', '4 Weeks', 'last 4 weeks'],
  ['6m', '6 Months', 'last 6 months'],
  ['1y', '1 Year', 'last year'],
  ['life', 'Lifetime', 'all time'],
  ['custom', 'Custom', 'custom range'],
];

// Range state shared by Top and Stats. `query` is null until a custom range has both dates.
export function useRange(initial = '4w') {
  const [range, setRange] = useState(initial);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const ready = range !== 'custom' || (from && to && from <= to);
  return {
    range, setRange, from, setFrom, to, setTo,
    label: RANGES.find((r) => r[0] === range)[2],
    query: !ready ? null : range === 'custom' ? `range=custom&from=${from}&to=${to}` : `range=${range}`,
  };
}

export function RangePicker({ r }) {
  return (
    <>
      <div className="pills" role="group" aria-label="Time range">
        {RANGES.map(([id, label]) => (
          <button key={id} className="pill" aria-pressed={r.range === id} onClick={() => r.setRange(id)}>{label}</button>
        ))}
      </div>
      {r.range === 'custom' && (
        <div className="dates">
          <label className="sub">From <input type="date" value={r.from} max={r.to || undefined} onChange={(e) => r.setFrom(e.target.value)} /></label>
          <label className="sub">To <input type="date" value={r.to} min={r.from || undefined} onChange={(e) => r.setTo(e.target.value)} /></label>
          {!r.query && <span className="sub">Pick a start and end date.</span>}
        </div>
      )}
    </>
  );
}

export function Art({ src, round, className = '' }) {
  const cls = `${className} ${round ? 'round' : ''}`;
  return src ? <img src={src} alt="" loading="lazy" className={cls} /> : <div className={`ph ${cls}`} />;
}

// Rank change like a music chart. prevRank undefined = no comparison (Lifetime).
export function Change({ rank, prevRank }) {
  if (prevRank === undefined) return <span />;
  if (prevRank === null) return <span className="chg up">NEW</span>;
  const d = prevRank - rank;
  if (d === 0) return <span className="chg same" aria-label="No change">—</span>;
  return (
    <span className={`chg ${d > 0 ? 'up' : 'down'}`} aria-label={`${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)}`}>
      {d > 0 ? '↑' : '↓'} {Math.abs(d)}
    </span>
  );
}

export function Pct({ value }) {
  if (value == null) return null;
  return <span className={value >= 0 ? 'up' : 'down'}>{value >= 0 ? '↑' : '↓'} {Math.abs(value)}%</span>;
}

// A row (or a plain div when there's no Spotify link, e.g. genres).
export function RowLink({ href, className, children }) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer" title="Open in Spotify">
      {children}
    </a>
  );
}

export const OpenIcon = () => (
  <span className="open" aria-hidden="true">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  </span>
);

export function RankedRows({ items, round, showCounts = true }) {
  return (
    <div className="rows">
      <div className="row head" aria-hidden="true">
        <span className="rank">#</span><span /><span /><span>Title</span>
        <span className="num">Streams</span><span className="num mins">Minutes</span><span />
      </div>
      {items.map((it) => (
        <RowLink key={it.id} href={it.spotifyUrl} className="row">
          <span className="rank">{it.rank}</span>
          <Change rank={it.rank} prevRank={it.prevRank} />
          <Art src={it.image} round={round} />
          <span className="title"><b>{it.name}</b>{it.artist && <span className="sub">{it.artist}</span>}</span>
          <span className="num">{showCounts ? fmt(it.streams) : '—'}</span>
          <span className="num sub mins">{showCounts ? fmt(it.minutes) : '—'}</span>
          <OpenIcon />
        </RowLink>
      ))}
    </div>
  );
}
