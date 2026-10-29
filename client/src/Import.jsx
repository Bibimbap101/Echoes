import { useEffect, useState } from 'react';

export default function Import({ me, onLogout }) {
  const [status, setStatus] = useState(null);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  const refresh = () => fetch('/api/import/status').then((r) => (r.ok ? r.json() : null)).then(setStatus, () => {});

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10_000);
    return () => clearInterval(timer);
  }, []);

  async function upload(e) {
    const input = e.target;
    setBusy(true);
    for (const file of input.files) {
      setLog((l) => [...l, `${file.name}: importing…`]);
      let line;
      try {
        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: await file.text(),
        });
        const body = await res.json();
        line = res.ok ? `${file.name}: ${body.added} new plays (${body.plays - body.added} already saved)` : `${file.name}: ${body.error}`;
      } catch (err) {
        line = `${file.name}: failed (${err.message})`;
      }
      setLog((l) => [...l.slice(0, -1), line]);
    }
    input.value = '';
    setBusy(false);
    refresh();
  }

  const plays = status ? (status.plays.import ?? 0) + (status.plays.poll ?? 0) : 0;

  return (
    <div className="page">
      <h1>Your data</h1>

      <section className="panel">
        <div className="account">
          {me.imageUrl && <img src={me.imageUrl} alt="" />}
          <div><b>{me.displayName}</b><p className="sub">Connected to Spotify</p></div>
        </div>
        <button className="button ghost" onClick={onLogout}>Log out</button>
      </section>

      <section className="panel">
        <h2>Listening history</h2>
        {status && (
          <ul className="stats">
            <li><b>{plays.toLocaleString()}</b> plays saved ({(status.plays.poll ?? 0).toLocaleString()} from the 30-minute check)</li>
            <li><b>{status.tracks.done.toLocaleString()}</b> / {status.tracks.total.toLocaleString()} songs have covers</li>
            <li><b>{status.artists.done.toLocaleString()}</b> / {status.artists.total.toLocaleString()} artists have photos</li>
          </ul>
        )}
        <label className="button">
          {busy ? 'Importing…' : 'Import Streaming_History_Audio files'}
          <input type="file" accept=".json,application/json" multiple className="sr-only" disabled={busy} onChange={upload} />
        </label>
        {log.length > 0 && (
          <ul className="log" aria-live="polite">
            {log.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
