// Settings page choices. Stored in this browser only.
const KEY = 'echoes-prefs';
const DEFAULTS = { glow: true, motion: true, start: 'home', range: '' }; // range '' = each page's own default

export function prefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULTS }; }
}

export function setPref(key, value) {
  const next = { ...prefs(), [key]: value };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  applyPrefs(next);
}

// Glow and motion are switched in CSS through these attributes on <html>.
export function applyPrefs(p = prefs()) {
  document.documentElement.dataset.glow = p.glow ? 'on' : 'off';
  document.documentElement.dataset.motion = p.motion ? 'on' : 'off';
}
