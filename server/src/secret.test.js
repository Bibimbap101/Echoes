import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal } from './secret.js';

test('seal/unseal round trip, and old plain values pass through', () => {
  process.env.SESSION_SECRET = 'one';
  const sealed = seal('token-123');
  assert.ok(sealed.startsWith('enc:') && !sealed.includes('token-123'));
  assert.equal(unseal(sealed), 'token-123');
  assert.equal(seal(sealed), sealed); // never double-sealed
  assert.equal(unseal('plain-old-token'), 'plain-old-token');
});

test('a token sealed with another secret reads as null instead of crashing', () => {
  process.env.SESSION_SECRET = 'one';
  const sealed = seal('token-123');
  process.env.SESSION_SECRET = 'two';
  assert.equal(unseal(sealed), null);
});
