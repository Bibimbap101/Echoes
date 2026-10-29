import { useEffect, useState } from 'react';

// Average color of an image, weighted toward its most colorful pixels (Spotify-style header color).
function averageColor(img) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  let r = 0, g = 0, b = 0, total = 0;
  for (let i = 0; i < d.length; i += 4) {
    const w = 1 + (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])) / 16;
    r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; total += w;
  }
  return [r / total, g / total, b / total];
}

// Turns any color into a dark, calm version so white text on it stays readable.
export function darkTone([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return `hsl(${Math.round(h)} ${Math.round(Math.min(s, 0.6) * 100)}% ${Math.round(Math.min(Math.max(l, 0.2), 0.3) * 100)}%)`;
}

export function useCoverColor(src) {
  const [color, setColor] = useState(null);
  useEffect(() => {
    if (!src) return setColor(null);
    let live = true;
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Spotify's image CDN allows this, so the canvas isn't blocked
    img.onload = () => live && setColor(darkTone(averageColor(img)));
    img.src = src;
    return () => { live = false; };
  }, [src]);
  return color;
}
