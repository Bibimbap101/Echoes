import crypto from 'node:crypto';

// Spotify tokens are stored encrypted (AES-256-GCM), keyed off SESSION_SECRET.
// Changing SESSION_SECRET makes old tokens unreadable; people just log in again.
const PREFIX = 'enc:';
const key = () => crypto.createHash('sha256').update(`spotify-tokens:${process.env.SESSION_SECRET}`).digest();

export function seal(text) {
  if (!text || text.startsWith(PREFIX)) return text;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}

// Plain (pre-encryption) values pass through, so old rows keep working until they're next saved.
// Sealed with a different SESSION_SECRET -> null, which means "log in again" (never a crash).
export function unseal(text) {
  if (!text?.startsWith(PREFIX)) return text;
  try {
    const buf = Buffer.from(text.slice(PREFIX.length), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
