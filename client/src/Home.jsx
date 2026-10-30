import { useApi, fmt, pctChange, plural } from './api.js';
import { useCoverColor } from './coverColor.js';
import { Art, Pct, RowLink, OpenIcon, RankedRows } from './ui.jsx';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function ago(date) {
  const min = Math.round((Date.now() - new Date(date)) / 60_000);
  if (min < 60) return `${min} min ago`;
  if (min < 1440) return `${Math.round(min / 60)} hr ago`;
  return new Date(date).toLocaleDateString();
}

export default function Home({ me }) {
  const today = useApi('/api/stats/summary?range=today');
  const week = useApi('/api/stats/summary?range=7d');
  const artists = useApi('/api/stats/top/artists?range=7d&limit=12');
  const tracks = useApi('/api/stats/top/tracks?range=7d&limit=5');
  const recent = useApi('/api/stats/recent?limit=10');

  const w = week.data;
  const topArtist = artists.data?.items[0];
  const change = w?.previous ? pctChange(w.minutes, w.previous.minutes) : null; // null = nothing to compare with
  const heroColor = useCoverColor(topArtist?.image);

  return (
    <div className="page">
      <h1>{greeting()}, {me.displayName}</h1>

      <section className="hero" style={{ '--hero': heroColor ?? undefined }} aria-label="Last 7 days">
        <div>
          <p className="hero-label">In the last 7 days you listened for</p>
          <p className="hero-big">{fmt(w?.minutes)}<small>min</small></p>
          <p className="hero-meta">
            {topArtist && <>Mostly <b>{topArtist.name}</b></>}
            {topArtist && change != null && ' · '}
            {change != null && <><Pct value={change} /> vs the 7 days before</>}
          </p>
        </div>
        {topArtist && <Art src={topArtist.image} round className="hero-art" />}
      </section>

      <div className="pills">
        <span className="pill stat-pill"><b>{fmt(today.data?.minutes)}</b> min today</span>
        <span className="pill stat-pill"><b>{fmt(w?.streams)}</b> streams {w?.previous && <Pct value={pctChange(w.streams, w.previous.streams)} />}</span>
        <span className="pill stat-pill"><b>{fmt(w?.hours)}</b> hrs {w?.previous && <Pct value={pctChange(w.hours, w.previous.hours)} />}</span>
      </div>

      {artists.data?.items.length > 0 && (
        <section>
          <div className="shelf-head"><h2>Your top artists this week</h2><a href="#/top">Show all</a></div>
          <div className="tiles one-row">
            {artists.data.items.map((a) => (
              <RowLink key={a.id} href={a.spotifyUrl} className="tile">
                <Art src={a.image} round />
                <p>{a.name}</p>
                <span className="sub">{plural(a.streams, 'stream')}</span>
              </RowLink>
            ))}
          </div>
        </section>
      )}

      <div className="pair">
      {tracks.data?.items.length > 0 && (
        <section>
          <div className="shelf-head"><h2>Top tracks this week</h2><a href="#/top">Show all</a></div>
          <RankedRows items={tracks.data.items} />
        </section>
      )}

      {recent.data?.length > 0 && (
        <section>
          <div className="shelf-head"><h2>Recently played</h2></div>
          <div className="rows">
            {recent.data.map((p) => (
              <RowLink key={`${p.trackId}-${p.playedAt}`} href={p.spotifyUrl} className="row simple">
                <Art src={p.image} />
                <span className="title"><b>{p.name}</b><span className="sub">{p.artist}</span></span>
                <span className="sub">{ago(p.playedAt)}</span>
                <OpenIcon />
              </RowLink>
            ))}
          </div>
        </section>
      )}
      </div>

      {week.error && <p className="error">Couldn't load your stats: {week.error.message}</p>}
    </div>
  );
}
