import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sign } from './lastfm.js';

test('sign sorts params by name, skips format, appends the secret', () => {
  const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
  assert.equal(sign({ token: 't', method: 'auth.getSession', api_key: 'k', format: 'json' }, 's'), md5('api_keykmethodauth.getSessiontokents'));
});
