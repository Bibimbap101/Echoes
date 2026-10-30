import { useState } from 'react';
import { prefs, setPref } from './prefs.js';
import { RANGES, useSound } from './ui.jsx';

const START_PAGES = [['home', 'Home'], ['top', 'Top'], ['stats', 'Stats'], ['wrapped', 'Wrapped']];
const DEFAULT_RANGES = [['', 'Each page decides'], ...RANGES.filter(([id]) => id !== 'custom').map(([id, label]) => [id, label])];

function Switch({ label, hint, on, onChange }) {
  return (
    <label className="setting">
      <span><b>{label}</b><span className="sub">{hint}</span></span>
      <input type="checkbox" role="switch" className="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Choice({ label, hint, value, options, onChange }) {
  return (
    <label className="setting">
      <span><b>{label}</b><span className="sub">{hint}</span></span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

export default function Settings({ onLogout }) {
  const [p, setP] = useState(prefs);
  const [sound, setSound] = useSound();
  const set = (key) => (value) => { setPref(key, value); setP(prefs()); };

  return (
    <div className="page settings">
      <h1>Settings</h1>

      <section className="panel">
        <h2>Look and feel</h2>
        <Switch label="Click sounds" hint="Soft ticks when you tap" on={sound} onChange={setSound} />
        <Switch label="Album-color glow" hint="Tint pages with cover colors" on={p.glow} onChange={set('glow')} />
        <Switch label="Reduce motion" hint="Fewer slides, fades and shimmer" on={!p.motion} onChange={(v) => set('motion')(!v)} />
      </section>

      <section className="panel">
        <h2>Your stats</h2>
        <Choice label="Start page" hint="What opens first" value={p.start} options={START_PAGES} onChange={set('start')} />
        <Choice label="Default time range" hint="For Top and Stats" value={p.range} options={DEFAULT_RANGES} onChange={set('range')} />
      </section>

      <section className="panel">
        <h2>Account</h2>
        <p className="sub">These settings are saved on this device only.</p>
        <div className="account-actions">
          <a className="button ghost" href="#/import">Import history</a>
          <a className="button ghost" href="#/privacy">Privacy</a>
          <button className="button ghost" onClick={onLogout}>Log out</button>
        </div>
      </section>
    </div>
  );
}
