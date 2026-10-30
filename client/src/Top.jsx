import { useState } from 'react';
import { useApi, fmt, plural } from './api.js';
import { useAmbient } from './coverColor.js';
import { Art, Change, RankedRows, RangePicker, useRange, Skel, SkelRows } from './ui.jsx';

const TYPES = [
  ['tracks', 'Tracks', 'track'],
  ['artists', 'Artists', 'artist'],
  ['albums', 'Albums', 'album'],
  ['genres', 'Genres', 'genre'],
];

export default function Top() {
  const r = useRange();
  const [type, setType] = useState('tracks');
  const { data, error, loading } = useApi(r.query && `/api/stats/top/${type}?${r.query}`);

  const items = data?.items ?? [];
  const [first, ...rest] = items;
  const fromSpotify = data?.source === 'spotify';
  const round = type === 'artists' || type === 'genres';
  const heroColor = useAmbient(first?.image);
  const rangeLabel = r.label;
  const typeLabel = TYPES.find((t) => t[0] === type)[2];

  return (
    <div className="page">
      <h1>Top</h1>

      <div className="controls">
        <RangePicker r={r} />
        <div className="tabs" role="tablist" aria-label="Category">
          {TYPES.map(([id, label]) => (
            <button key={id} role="tab" className="tab" aria-selected={type === id} onClick={() => setType(id)}>{label}</button>
          ))}
        </div>
      </div>

      {error && <p className="error">Couldn't load this list: {error.message}</p>}

      {fromSpotify && (
        <p className="note">
          <span><b>Spotify's ranking.</b> Echoes doesn't have enough of your history for the {rangeLabel} yet, so this shows Spotify's own order without stream counts. Import your history to see real numbers.</span>
        </p>
      )}

      {!data && !error && <div style={{ display: 'grid', gap: 24 }}><Skel h={176} style={{ borderRadius: 12 }} /><SkelRows n={8} /></div>}

      {data && !first && (
        <div className="empty">
          <h2>No plays in this range yet</h2>
          <p className="sub">{type === 'genres' ? "Spotify hasn't given genres for these artists. " : ''}Try Lifetime, or import your listening history.</p>
          <a className="button ghost" href="#/import">Import history</a>
        </div>
      )}

      {first && (
        <div className={loading ? 'busy' : ''} key={`${type}-${r.query}`} style={{ display: 'grid', gap: 24 }}>
          <section className="hero art-left" style={{ '--hero': heroColor ?? undefined }} aria-label={`Your number 1 ${typeLabel}`}>
            <Art src={first.image} round={round} className="hero-art" />
            <div>
              <p className="hero-label">Your #1 {typeLabel} · {rangeLabel}</p>
              <p className="hero-name">
                {first.spotifyUrl ? <a href={first.spotifyUrl} target="_blank" rel="noreferrer">{first.name}</a> : first.name}
              </p>
              <p className="hero-meta">
                {first.artist && <>{first.artist} · </>}
                {!fromSpotify && <><b>{plural(first.streams, 'stream')}</b> · {fmt(first.minutes)} min </>}
                <Change rank={1} prevRank={first.prevRank} />
              </p>
            </div>
          </section>
          {rest.length > 0 && <RankedRows items={rest} round={round} showCounts={!fromSpotify} />}
        </div>
      )}
    </div>
  );
}
