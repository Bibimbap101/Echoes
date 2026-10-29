import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHistory } from './importer.js';

test('parseHistory keeps tracks, drops podcasts, detects skips', () => {
  const rows = [
    {
      ts: '2024-03-01T10:00:00Z', ms_played: 12000, spotify_track_uri: 'spotify:track:abc',
      master_metadata_track_name: 'Song', master_metadata_album_artist_name: 'Artist',
      master_metadata_album_album_name: 'Album', skipped: null, reason_end: 'fwdbtn', ip_addr: '1.2.3.4',
    },
    { ts: '2024-03-01T11:00:00Z', ms_played: 999, spotify_track_uri: null, spotify_episode_uri: 'spotify:episode:x' },
    { ts: '2024-03-01T12:00:00Z', ms_played: 200000, spotify_track_uri: 'spotify:track:def', reason_end: 'trackdone' },
  ];
  const plays = parseHistory(rows);
  assert.equal(plays.length, 2);
  assert.equal(plays[0].trackId, 'abc');
  assert.equal(plays[0].skipped, true);
  assert.equal(plays[0].msPlayed, 12000); // short plays are kept; the 30s rule is applied when counting
  assert.equal(plays[0].ip_addr, undefined);
  assert.equal(plays[1].skipped, false);
  assert.equal(plays[1].playedAt.toISOString(), '2024-03-01T12:00:00.000Z');
});
