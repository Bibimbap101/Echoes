# Echoes — Phase 0 Research

Researched 2026-10-30. Six reference repos were cloned and read (not run), and Spotify's current docs were checked directly.

---

## TL;DR — what changes our plan

1. **Spotify removed all batch lookups in Feb 2026** (`GET /tracks?ids=`, `/artists?ids=`, `/albums?ids=`) for Development Mode apps. Enrichment is now **one call per unique track + one per unique artist**. A lifetime history can mean tens of thousands of calls, i.e. hours. Enrichment must be a slow, resumable background queue that does what is on screen first.
2. **The import must not need the API.** The Extended JSON already has track URI, track name, artist name and album name. That is enough for every count, minute, streak, heatmap and top list. Images and genres are extras that fill in later.
3. **Store every play, even ones under 30s.** The 30-second stream rule is applied when we query, not at import. Otherwise skip rate and a configurable threshold are impossible.
4. **Genres are marked "deprecated"** on the artist object (no removal date). They still come back for now, often empty. Genre features must survive an empty list.
5. **No audio features** (energy, valence, etc. — removed for new apps in Nov 2024). "Listening personality" has to come from *behaviour* (time of day, variety, repeats, skips, discovery), not from the sound of the songs.
6. **`localhost` redirect URIs are banned.** Use `http://127.0.0.1:PORT/...`.
7. **Polled plays (recently-played) have no `ms_played` and no `skipped`.** Minutes for those are an estimate. Skip rate comes only from imported data.

---

## 1. The repos

| Repo | Stack | What it does well | License | What we may do |
|---|---|---|---|---|
| [Yooooomi/your_spotify](https://github.com/Yooooomi/your_spotify) | TS, Express, Mongo, React | Closest match. Import + polling + Mongo aggregations + token refresh + 429 queue | GPL-3.0 | Learn only |
| [lukasschwab/spotify-explore](https://github.com/lukasschwab/spotify-explore) | Plain JS, in-browser | Clean dedupe key, good skip detection, per-period track stats | No license file | Learn only |
| [Chareste/SpotifyHistoryParserExtended](https://github.com/Chareste/SpotifyHistoryParserExtended) | Python script | Handles podcasts vs tracks, saves progress to resume after errors | GPL-3.0 | Learn only |
| [WengYiNing/Auralytics](https://github.com/WengYiNing/Auralytics) | Express, React, Redis | Derives top albums / genres / eras from `/me/top` with rank-weighted scores | Apache-2.0 | Reuse OK with attribution |
| [makandz/MySpotify](https://github.com/makandz/MySpotify) | Next.js | Simple `/me/top` by period, token in cookie | No license file | Learn only |
| [AlexT101/wrapped](https://github.com/AlexT101/wrapped) | Android / Java | Story-style progress bar idea | No license file | Learn only. It's Android, so no help with web image export |

We write all our own code. Nothing is copied.

### your_spotify (the big one)
- **Schema:** one `Infos` doc per play: `owner, id (trackId), albumId, primaryArtistId, artistIds[], durationMs, played_at`. Separate `Track`, `Album`, `Artist` caches. Indexes on `id`, `albumId`, `primaryArtistId`, `played_at`.
- **Import:** reads all JSON files into memory, validates with zod (only 5 fields), **drops plays under 30s**, then looks every track up in the API **before** saving it. If the lookup fails, the play is silently dropped. Progress is saved (`current` index) so it can resume.
- **Dedupe:** for every single row, runs a query "same track within ±60s?" (±30s in the poller). Correct but slow: one DB query per play.
- **Polling:** a `while(true)` loop every 2 minutes. Calls `recently-played?after=<lastTimestamp − 2 hours>` and pages through `next`. The 2-hour overlap plus the ±30s dedupe means it never misses or doubles a play. `lastTimestamp` is saved on the user.
- **Minutes for polled plays:** uses the track's full `duration_ms` (it has no `ms_played`).
- **Rate limits:** a shared request queue with high/normal priority. On 429 it waits for `Retry-After` (default 1s), up to 5 tries.
- **Token refresh:** refreshes when the token expires in under 2 minutes, before every call.
- **Feb 2026 change visible in code:** `getTracks()` now loops `GET /tracks/{id}` one at a time. The batch endpoint is gone.
- **No genres in their stats.** They don't compute top genres at all.

### spotify-explore
- Dedupe key = `` `${ts}|${uri}` ``, kept in a `Set`. Simple and exact.
- **Skip = `skipped === true` OR `reason_end === 'fwdbtn'`.** Older data often has `skipped` as null, so `reason_end` is the better signal.
- Re-aggregates per selected period on the fly (works because it keeps raw plays).

### Chareste parser
- Splits rows into tracks vs podcast episodes by which URI field is set.
- Saves partial results + an error file so a failed run can continue. Same idea we need for enrichment.
- Counts a track only if played > 1/3 of its length (different rule from Spotify's 30s).

### Auralytics
- **Top genres:** take top 50 artists, give each a score of `50 − rank`, add that score to each of the artist's genres, sort.
- **Top albums:** same trick on top 50 tracks, grouped by album.
- **Eras:** fetch each album's `release_date` and bucket by decade.
- All of this is a guess from a ranked list. We can do better because we have real play counts.

### MySpotify
- Thin wrapper over `/me/top/{type}?time_range=`. Confirms the 3 fixed ranges. Nothing we need.

---

## 2. Spotify API — what still works (checked 2026-10-30)

**Still there (Dev Mode):**
- `GET /me/player/recently-played`: max 50, `after`/`before` cursors in ms, gives full track object + `played_at`. No podcasts.
- `GET /me/top/{artists|tracks}`: `short_term`, `medium_term`, `long_term`, limit 1–50.
- `GET /tracks/{id}`, `GET /artists/{id}`, `GET /albums/{id}` (single items only).
- `GET /me`: but `email`, `country`, `product`, `followers` were removed.

**Removed in Feb 2026 (Dev Mode):**
- Batch: `GET /tracks`, `/artists`, `/albums` (several at once).
- `GET /artists/{id}/top-tracks`, `/browse/*`, `/markets`, `/users/{id}`.
- Fields: `popularity` (track, album, artist), `followers` (artist), album `label`.
- Search is capped at 10 results.

**Removed in Nov 2024 (new apps):** audio features, audio analysis, recommendations, related artists, preview URLs, editorial playlists.

**Deprecated but still returned:** artist `genres` (may be empty).

**Dev Mode rules:** owner needs Premium (app stops if it lapses), 5 users max, rate limit is a rolling 30-second window with **no published number**. On 429, wait `Retry-After` seconds.

**Redirect URI:** `localhost` not allowed. `http://127.0.0.1:PORT/...` is allowed (HTTP only works on loopback IPs).

---

## 3. Extended Streaming History format

Files are named like `Streaming_History_Audio_2019-2021_0.json`. Each is a JSON array. Fields per row:

| Field | Use it? | Notes |
|---|---|---|
| `ts` | ✅ | **When the stream ENDED**, UTC |
| `ms_played` | ✅ | |
| `master_metadata_track_name` | ✅ | null for podcasts |
| `master_metadata_album_artist_name` | ✅ | The artist name. Possibly the *album* artist, not the track's main artist (check with real data) |
| `master_metadata_album_album_name` | ✅ | |
| `spotify_track_uri` | ✅ | `spotify:track:<id>`. null for podcasts/audiobooks |
| `reason_start`, `reason_end` | ✅ | `reason_end = 'fwdbtn'` means skipped |
| `skipped` | ✅ | Can be null in older rows |
| `shuffle` | ✅ | Cheap, maybe fun for personality |
| `incognito_mode` | ✅ | Private sessions. Keep and let you choose to exclude |
| `platform`, `offline`, `offline_timestamp` | ⚪ | Optional |
| `episode_*`, `audiobook_*` | ❌ | Podcasts/audiobooks. Skip for v1 |
| `ip_addr`, `conn_country`, `username` | ❌ **never store** | Personal data we don't need |

The export takes days to weeks to arrive after you request it.

---

## 4. Patterns we will adopt

1. **Plays don't need the API.** Save the name fields from the JSON on each play. Top tracks/artists/albums group by URI and names. Enrichment only adds pictures, IDs and genres. If it fails, nothing is lost.
2. **Dedupe with a unique index**, not a query per row: unique on `{ userId, trackId, playedAt }` (to the second), and insert with `insertMany(..., { ordered: false })`, ignoring duplicate-key errors. This also handles overlapping export files and re-imports.
3. **Poll with overlap** (like your_spotify): `after = lastPolledAt − 2h`, then the unique index plus a small **±60s same-track check** drops plays already imported. Only where poll data meets import data.
4. **Enrichment queue in Mongo:** a `tracks` doc with `enrichedAt: null` *is* the queue. A worker takes N at a time, calls `GET /tracks/{id}`, which gives album id/name/**cover**/release date + artist ids for free (so **no album calls needed**), then `GET /artists/{id}` for new artists (image + genres). It honours `Retry-After`, keeps going after a restart, and **jumps the queue** for whatever a page is about to show.
5. **Free enrichment from polling:** recently-played already returns full track objects. Save them into `tracks` straight away.
6. **Stream threshold at query time:** `isStream = msPlayed >= STREAM_MIN_MS` (env, default 30000).
7. **Rank change** = run the same aggregation on the previous equal-length period, compare ranks. "NEW" if it wasn't there. No arrows for Lifetime.
8. **Timezone as a setting** (`TZ=Asia/Manila` style). Pass it to Mongo's `$dateToString` / `$hour` / `$dayOfWeek`. Otherwise the heatmap, "today" and streaks are shifted by UTC.
9. **Single shared Spotify client** with token refresh before expiry + 429 retry. Same idea as your_spotify, written from scratch.

## 5. Pitfalls to avoid

- ❌ Dropping short plays at import (your_spotify does). Kills skip rate.
- ❌ Waiting on the API during import. A 20k-track import would take hours and drop plays on errors.
- ❌ One DB query per row for dedupe.
- ❌ Trusting `skipped` alone (null in old data).
- ❌ Assuming `ts` (export) and `played_at` (poll) mean the same moment. `ts` is end time. `played_at` isn't documented precisely. The ±60s window handles small gaps; **check with real data** where both overlap.
- ❌ Using `popularity`, `followers`, audio features, batch endpoints. All gone.
- ❌ `localhost` in redirect URI. And a cookie set on `127.0.0.1` isn't sent to `localhost`, so **always open the app at 127.0.0.1** and have Vite proxy `/api` to Express (one origin, no CORS).
- ❌ Gap in data: the export takes days/weeks, but recently-played only remembers 50 plays (~3 hours of listening). **Start the poller as early as possible** so the gap between "export ends" and "poller starts" stays empty.

## 6. Feature check: possible, changed, or not possible

| Feature | Verdict | How |
|---|---|---|
| Top tracks/artists/albums, any range, top 100 | ✅ | Aggregation over `plays`. No need for `/me/top` at all |
| Top genres | ⚠️ Changed | Sum streams per artist genre. Works while Spotify returns genres. If empty → show "not enough genre data". Future fallback: Last.fm `artist.getTopTags` (free key). Not building now |
| Rank-change arrows | ✅ | Previous equal-length period |
| Minutes / streams / unique counts | ✅ | Polled plays: minutes = track length, capped by the gap to the next play (estimate) |
| Listening clock heatmap | ✅ | `$hour` + `$dayOfWeek` with timezone |
| Minutes per day/week/month | ✅ | `$dateTrunc` with timezone |
| Longest streak | ✅ | Distinct listening days → count runs in JS |
| Skip rate + most skipped | ⚠️ Import only | Polled plays have no skip info. Page says "based on imported history" |
| First listened | ✅ | `$min: playedAt` for that track/artist |
| Wrapped: minutes, top artist/song/genre, eras | ✅ | Same aggregations. Genre card hides itself if no genres |
| Obsession of the period | ✅ | Group by (week, track), take the max |
| Listening personality | ⚠️ Changed | No audio features. Use behaviour: night owl vs morning, explorer (new artists %) vs loyal (top-artist share), repeat rate, skip rate |
| Card → image | ✅ | `html-to-image`. Spotify images (`i.scdn.co`) need CORS for this; **not yet checked**. Fallback: tiny server image proxy |
| Old `StreamingHistory` format | ❌ Skip | No URIs, minute-level times, matching needs search (now capped at 10). Extended already covers the same time. Recommend not supporting |
| Podcasts | ❌ v1 | Recently-played doesn't return them either, so data would be half-complete |

## 7. Sources

- [Spotify — February 2026 changelog](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
- [Spotify — February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [Spotify — Nov 2024 Web API changes](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api)
- [Spotify — Get Artist reference](https://developer.spotify.com/documentation/web-api/reference/get-an-artist)
- [Spotify — Get Recently Played](https://developer.spotify.com/documentation/web-api/reference/get-recently-played)
- [Spotify — Get User's Top Items](https://developer.spotify.com/documentation/web-api/reference/get-users-top-artists-and-tracks)
- [Spotify — Rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits)
- [Spotify — Redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- [Spotify — Understanding your data](https://support.spotify.com/us/article/understanding-your-data/)
- [TechCrunch — Dev mode now needs Premium, 5 users](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/)
- [TechCrunch — Nov 2024 recommendation features cut](https://techcrunch.com/2024/11/27/spotify-cuts-developer-access-to-several-of-its-recommendation-features)

## 8. Last.fm as a second source (checked 2026-11-07)

Why: Spotify Dev Mode allows 5 users and Extended Quota needs a company with 250k MAU. Last.fm has no user cap, so classmates can get live stats through it.

**How plays get there:** each user links Spotify once at last.fm → Settings → Applications → "Spotify Scrobbling" → Connect. From then on every Spotify play is scrobbled. Nothing before that day. Past years still come from the Streaming_History upload.

**Reading plays:** `user.getRecentTracks` needs **no auth**, only an API key + username.
- `limit` max 200, `page`, `from`/`to` (UTC seconds). Can page back through all of a user's history, not just the last 50 like Spotify.
- The current song comes back first with `nowplaying="true"` (no date). Skip it when saving plays, use it for Now Playing.
- Gives artist/track/album **names** (+ MusicBrainz ids, often empty). **No Spotify track id, no duration, no ms played.**
- Errors: `29` = rate limit (counted **per IP**), `26` = key suspended. No number is published. 5 req/s is the usual community guideline, not official.

**Login (optional):** Web auth: send user to `last.fm/api/auth/?api_key=…&cb=…` → callback gets `token` (valid 60 min, single use) → `auth.getSession` signed with `md5(sorted params + secret)` → session key that never expires. Only needed to prove the username is theirs. Reading plays works without it.

**Terms that matter (last.fm/api/tos):**
- Non-commercial only. "Research/academic" use: they ask you to email partners@last.fm **before** use. A class project falls here.
- Must credit Last.fm and link artist/track pages to last.fm; public pages are "subject to approval".
- **100 MB cap** on Last.fm data you store. Many users' full scrobble history can pass that, so keep only what stats need.
- Images/artwork from Last.fm are **excluded**: don't show them. Keep using Spotify oEmbed covers.
- No circumventing rate limits.

**What it means for Echoes code:**
| Area | Today | Needed |
|---|---|---|
| `User` | `spotifyId` + tokens required | a Last.fm user with only `lastfmName` (+ session key) |
| `Play.trackId` | Spotify id, part of the unique index | match by `artist + track` name to an id already known (from imports or `Track` cache); else a name key like `lfm:artist|track` |
| Covers (oEmbed) | need a Spotify id | only for matched tracks; unmatched show a placeholder |
| `msPlayed` | real (import) or duration (poll) | unknown: use the track's duration if matched, else ~3 min guess |
| Poller / cron | Spotify recently-played | `getRecentTracks?from=<last play>` per Last.fm user |
| Now playing | Spotify | `nowplaying="true"` row |
| Liked songs, library | Spotify | not available |
| Stats grouping | by `trackId` (top tracks, skips) and `artistName` | works if the trackId matching above is consistent |

Sources: [API ToS](https://www.last.fm/api/tos) · [user.getRecentTracks](https://www.last.fm/api/show/user.getRecentTracks) · [Web auth](https://www.last.fm/api/webauth) · [Spotify scrobbling help](https://support.last.fm/t/spotify-scrobbling/189)
