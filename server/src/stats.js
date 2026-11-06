import { Play } from './models/Play.js';
import { Track } from './models/Track.js';
import { Artist } from './models/Artist.js';
import { LikedSong } from './models/LikedSong.js';
import { spotifyGet } from './spotify.js';

export const TZ = process.env.TIMEZONE || 'Asia/Manila';
export const STREAM_MIN_MS = Number(process.env.STREAM_MIN_MS || 30_000);
const DAY = 86_400_000;
const RANGE_DAYS = { '7d': 7, '4w': 28, '6m': 182, '1y': 365 };

const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 });
const minutes = (ms) => Math.round(ms / 60_000);
const isStream = { $cond: [{ $gte: ['$msPlayed', STREAM_MIN_MS] }, 1, 0] };

// Today's date as YYYY-MM-DD in the timezone.
export const localDate = (d = new Date(), tz = TZ) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);

// The UTC instant of midnight on a YYYY-MM-DD date in the timezone.
export function zonedMidnight(dateStr, tz = TZ) {
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(guess).map((x) => [x.type, x.value]),
  );
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess.getTime();
  return new Date(guess.getTime() - offset);
}

// ?range=today|7d|4w|6m|1y|life|custom(&from=YYYY-MM-DD&to=YYYY-MM-DD) -> { from, to, prevFrom }.
// from = null means lifetime (and there's no previous period to compare with).
export function parseRange({ range = '4w', from, to } = {}, now = new Date()) {
  let start, end = now;
  if (range === 'life') return { from: null, to: now };
  if (range === 'today') start = zonedMidnight(localDate(now));
  else if (RANGE_DAYS[range]) start = new Date(now - RANGE_DAYS[range] * DAY);
  else if (range === 'custom') {
    const valid = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !isNaN(Date.parse(s));
    if (!valid(from) || !valid(to)) throw badRequest('Custom range needs from and to as YYYY-MM-DD.');
    start = zonedMidnight(from);
    end = new Date(zonedMidnight(to).getTime() + DAY); // "to" day is included
    if (end <= start) throw badRequest('"from" must be on or before "to".');
  } else throw badRequest(`Unknown range "${range}".`);
  return { from: start, to: end, prevFrom: new Date(start - (end - start)) };
}

function matchFor(userId, { from, to }, query) {
  const m = { userId, playedAt: { $lt: to } };
  if (from) m.playedAt.$gte = from;
  if (query.private === 'hide') m.incognito = { $ne: true };
  return m;
}

// Adds `image` from the tracks cache (album cover) using each row's trackId.
const coverLookup = [
  { $lookup: { from: 'tracks', localField: 'trackId', foreignField: '_id', as: 't' } },
  { $set: { image: { $first: '$t.albumImage' }, albumId: { $first: '$t.albumId' } } },
];

// Last.fm-only songs (lfm:artist|track) have no Spotify page, so they link to Last.fm's (its terms ask for that link).
const lastfmUrl = (id) => `https://www.last.fm/music/${id.slice(4).split('|').map((s) => encodeURIComponent(s).replace(/%20/g, '+')).join('/_/')}`;
const openUrl = (kind, id) => (!id ? null : id.startsWith('lfm:') ? lastfmUrl(id) : `https://open.spotify.com/${kind}/${id}`);

const TOP = {
  tracks: {
    key: '$trackId',
    lookup: coverLookup,
    shape: (r) => ({ id: r._id, name: r.name, artist: r.artist, album: r.album, spotifyUrl: openUrl('track', r._id) }),
  },
  artists: {
    key: '$artistName', // artists are matched by name (see RESEARCH.md)
    lookup: [
      { $lookup: { from: 'artists', localField: '_id', foreignField: 'name', as: 'a' } },
      { $set: { image: { $first: '$a.image' }, artistId: { $first: '$a._id' } } },
    ],
    shape: (r) => ({ id: r._id, name: r._id, spotifyUrl: openUrl('artist', r.artistId) }),
  },
  albums: {
    key: { album: '$albumName', artist: '$artistName' },
    lookup: coverLookup,
    shape: (r) => ({ id: `${r._id.album}|${r._id.artist}`, name: r._id.album, artist: r._id.artist, spotifyUrl: openUrl('album', r.albumId) }),
  },
};

function groupPipeline(type, limit) {
  if (type === 'genres') {
    // Genres hang off artists; artists Spotify gives no genres for simply don't count.
    return [
      { $group: { _id: '$artistName', streams: { $sum: isStream }, ms: { $sum: '$msPlayed' } } },
      { $match: { streams: { $gt: 0 } } },
      { $sort: { streams: -1 } },
      { $lookup: { from: 'artists', localField: '_id', foreignField: 'name', as: 'a' } },
      { $set: { a: { $first: '$a' } } },
      { $unwind: '$a.genres' },
      { $group: { _id: '$a.genres', streams: { $sum: '$streams' }, ms: { $sum: '$ms' }, artist: { $first: '$_id' }, image: { $first: '$a.image' } } },
      { $sort: { streams: -1, ms: -1 } },
      { $limit: limit },
    ];
  }
  return [
    {
      $group: {
        _id: TOP[type].key,
        streams: { $sum: isStream },
        ms: { $sum: '$msPlayed' },
        trackId: { $first: '$trackId' },
        name: { $first: '$trackName' },
        artist: { $first: '$artistName' },
        album: { $first: '$albumName' },
      },
    },
    { $match: { streams: { $gt: 0 } } },
    { $sort: { streams: -1, ms: -1 } },
    { $limit: limit },
    ...TOP[type].lookup,
  ];
}

async function topItems(userId, type, period, query, limit) {
  const rows = await Play.aggregate([{ $match: matchFor(userId, period, query) }, ...groupPipeline(type, limit)]);
  const shape = type === 'genres' ? (r) => ({ id: r._id, name: r._id, artist: r.artist }) : TOP[type].shape;
  return rows.map((r) => ({ ...shape(r), image: r.image ?? null, streams: r.streams, minutes: minutes(r.ms) }));
}

const SPOTIFY_RANGE = { '4w': 'short_term', '6m': 'medium_term', '1y': 'long_term' };

// Spotify's own ranking: rank only, no counts. Used until Echoes' history covers the range.
// shortcut: one request = top 50; page with offset if the fallback ever needs more.
async function spotifyTop(user, type, range) {
  const { items } = await spotifyGet(user, `/me/top/${type}?time_range=${SPOTIFY_RANGE[range]}&limit=50`);
  return items.map((x, i) => ({
    rank: i + 1,
    ...(type === 'tracks'
      ? { id: x.id, name: x.name, artist: x.artists[0]?.name, album: x.album?.name, image: x.album?.images?.[0]?.url ?? null }
      : { id: x.name, name: x.name, image: x.images?.[0]?.url ?? null }),
    spotifyUrl: x.external_urls?.spotify ?? null,
    streams: null,
    minutes: null,
  }));
}

async function historyCovers(userId, from) {
  const first = await Play.findOne({ userId }).sort({ playedAt: 1 }).lean();
  return first && first.playedAt <= new Date(from.getTime() + 2 * DAY); // 2 days of slack
}

// Top 100 for a range, each with its rank in the previous equal-length period (null = not in it).
// Tracks also get `liked` (in Liked Songs).
export async function top(user, type, query) {
  const result = await rankTop(user, type, query);
  if (type !== 'tracks') return result;
  const liked = await LikedSong.find({ userId: user._id, trackId: { $in: result.items.map((t) => t.id) } }, { trackId: 1 }).lean();
  const ids = new Set(liked.map((l) => l.trackId));
  return { ...result, items: result.items.map((t) => ({ ...t, liked: ids.has(t.id) })) };
}

async function rankTop(user, type, query) {
  const userId = user._id;
  const period = parseRange(query);
  if (user.spotifyId && SPOTIFY_RANGE[query.range] && type !== 'albums' && type !== 'genres' && !(await historyCovers(userId, period.from))) {
    return { source: 'spotify', items: await spotifyTop(user, type, query.range) };
  }

  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 100);
  const items = await topItems(userId, type, period, query, limit);
  if (!period.prevFrom) return { source: 'echoes', items: items.map((it, i) => ({ rank: i + 1, ...it })) };

  const prev = await topItems(userId, type, { from: period.prevFrom, to: period.from }, query, 100);
  const prevRank = new Map(prev.map((p, i) => [p.id, i + 1]));
  return { source: 'echoes', items: items.map((it, i) => ({ rank: i + 1, ...it, prevRank: prevRank.get(it.id) ?? null })) };
}

async function totals(userId, period, query) {
  const onlyStreams = (field) => ({ $addToSet: { $cond: [{ $gte: ['$msPlayed', STREAM_MIN_MS] }, field, '$$REMOVE'] } });
  const [r] = await Play.aggregate([
    { $match: matchFor(userId, period, query) },
    {
      $group: {
        _id: null,
        streams: { $sum: isStream },
        ms: { $sum: '$msPlayed' },
        tracks: onlyStreams('$trackId'),
        artists: onlyStreams('$artistName'),
        albums: onlyStreams({ a: '$albumName', b: '$artistName' }),
      },
    },
  ]);
  const ms = r?.ms ?? 0;
  return {
    streams: r?.streams ?? 0,
    minutes: minutes(ms),
    hours: Math.round(ms / 360_000) / 10,
    uniqueTracks: r?.tracks.length ?? 0,
    uniqueArtists: r?.artists.length ?? 0,
    uniqueAlbums: r?.albums.length ?? 0,
  };
}

// Totals for the range, plus the previous equal-length period for ↑/↓ comparisons.
export async function summary(userId, query) {
  const period = parseRange(query);
  const current = await totals(userId, period, query);
  const previous = period.prevFrom ? await totals(userId, { from: period.prevFrom, to: period.from }, query) : null;
  return { ...current, previous };
}

// Hour of day × day of week (1 = Sunday … 7 = Saturday), in the app's timezone.
export async function clock(userId, query) {
  const rows = await Play.aggregate([
    { $match: matchFor(userId, parseRange(query), query) },
    {
      $group: {
        _id: { day: { $dayOfWeek: { date: '$playedAt', timezone: TZ } }, hour: { $hour: { date: '$playedAt', timezone: TZ } } },
        streams: { $sum: isStream },
        ms: { $sum: '$msPlayed' },
      },
    },
  ]);
  return rows.map((r) => ({ day: r._id.day, hour: r._id.hour, streams: r.streams, minutes: minutes(r.ms) }));
}

// Minutes per day / week / month.
export async function timeline(userId, query) {
  const unit = query.unit ?? 'day';
  if (!['day', 'week', 'month'].includes(unit)) throw badRequest('unit must be day, week or month.');
  const rows = await Play.aggregate([
    { $match: matchFor(userId, parseRange(query), query) },
    {
      $group: {
        _id: { $dateTrunc: { date: '$playedAt', unit, timezone: TZ, startOfWeek: 'monday' } },
        streams: { $sum: isStream },
        ms: { $sum: '$msPlayed' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: localDate(r._id), streams: r.streams, minutes: minutes(r.ms) }));
}

// Longest run of consecutive days, and the run still going (ending today or yesterday).
// `days` are sorted unique YYYY-MM-DD strings.
export function streaks(days, today) {
  let longest = { days: 0, start: null, end: null };
  let run = 0;
  let start = null;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && Date.parse(days[i]) - Date.parse(days[i - 1]) === DAY ? run + 1 : 1;
    if (run === 1) start = days[i];
    if (run > longest.days) longest = { days: run, start, end: days[i] };
  }
  const gap = days.length ? (Date.parse(today) - Date.parse(days.at(-1))) / DAY : Infinity;
  return { longest, current: gap <= 1 ? run : 0 };
}

export async function streak(userId, query) {
  const rows = await Play.aggregate([
    { $match: { ...matchFor(userId, parseRange({ range: 'life', ...query }), query), msPlayed: { $gte: STREAM_MIN_MS } } },
    { $group: { _id: { $dateToString: { date: '$playedAt', format: '%Y-%m-%d', timezone: TZ } } } },
    { $sort: { _id: 1 } },
  ]);
  return streaks(rows.map((r) => r._id), localDate());
}

// Skip info only exists for imported plays; polled plays have skipped = null and are left out.
export async function skips(userId, query) {
  const match = { ...matchFor(userId, parseRange(query), query), skipped: { $ne: null } };
  const skipped = { $cond: ['$skipped', 1, 0] };
  const [overall] = await Play.aggregate([{ $match: match }, { $group: { _id: null, plays: { $sum: 1 }, skips: { $sum: skipped } } }]);
  const most = await Play.aggregate([
    { $match: match },
    { $group: { _id: '$trackId', plays: { $sum: 1 }, skips: { $sum: skipped }, name: { $first: '$trackName' }, artist: { $first: '$artistName' } } },
    { $match: { plays: { $gte: 3 }, skips: { $gt: 0 } } }, // a song played once and skipped isn't "most skipped"
    { $sort: { skips: -1, plays: 1 } },
    { $limit: 20 },
    { $set: { trackId: '$_id' } },
    ...coverLookup,
  ]);
  return {
    plays: overall?.plays ?? 0,
    skipRate: overall ? overall.skips / overall.plays : null,
    mostSkipped: most.map((r) => ({ id: r._id, name: r.name, artist: r.artist, image: r.image ?? null, plays: r.plays, skips: r.skips, skipRate: r.skips / r.plays })),
  };
}

const pct = (x) => `${Math.round(x * 100)}%`;

// Listening personality from *how* you listen (Spotify removed audio features, so not from how songs sound).
export function personality({ streams, night, morning, uniqueArtists, uniqueTracks, top5Streams, skipRate }) {
  if (!streams) return null;
  const time = night / streams > 0.35 ? 'Night Owl' : morning / streams > 0.4 ? 'Early Bird' : null;
  const taste = top5Streams / streams > 0.5 ? 'Loyalist' : uniqueArtists / streams > 0.25 ? 'Explorer' : null;
  const perSong = streams / Math.max(uniqueTracks, 1);
  const replay = perSong >= 3 ? 'Replayer' : 'Variety Seeker';
  return {
    title: `The ${time ? `${time} ` : ''}${taste ?? replay}`,
    traits: [
      { name: 'Time of day', value: time ?? 'All-Day Listener', detail: `${pct(night / streams)} of your streams were between 10 PM and 4 AM` },
      { name: 'Taste', value: taste ?? 'Balanced', detail: `Your top 5 artists made up ${pct(top5Streams / streams)} of your streams` },
      { name: 'Replay', value: replay, detail: `${perSong.toFixed(1)} plays per song on average` },
      ...(skipRate == null ? [] : [{ name: 'Skips', value: skipRate > 0.3 ? 'Skipper' : 'Patient', detail: `You skipped ${pct(skipRate)} of songs` }]),
    ],
  };
}

// Everything a Wrapped story needs, for any range (defaults to the last year).
export async function wrapped(userId, query) {
  const period = parseRange({ range: '1y', ...query });
  const streamsOnly = { ...matchFor(userId, period, query), msPlayed: { $gte: STREAM_MIN_MS } };
  const one = (type, limit) => topItems(userId, type, period, query, limit);

  const [sum, artists, tracks, albums, genres, skipData, [tod], [obsession], eras] = await Promise.all([
    totals(userId, period, query),
    one('artists', 5),
    one('tracks', 5),
    one('albums', 1),
    one('genres', 3),
    skips(userId, { range: '1y', ...query }),
    Play.aggregate([
      { $match: streamsOnly },
      { $set: { h: { $hour: { date: '$playedAt', timezone: TZ } } } },
      {
        $group: {
          _id: null,
          night: { $sum: { $cond: [{ $or: [{ $gte: ['$h', 22] }, { $lt: ['$h', 4] }] }, 1, 0] } },
          morning: { $sum: { $cond: [{ $and: [{ $gte: ['$h', 5] }, { $lt: ['$h', 11] }] }, 1, 0] } },
        },
      },
    ]),
    // The song you played most within a single week.
    Play.aggregate([
      { $match: streamsOnly },
      {
        $group: {
          _id: { week: { $dateTrunc: { date: '$playedAt', unit: 'week', timezone: TZ, startOfWeek: 'monday' } }, trackId: '$trackId' },
          streams: { $sum: 1 }, name: { $first: '$trackName' }, artist: { $first: '$artistName' },
        },
      },
      { $sort: { streams: -1 } },
      { $limit: 1 },
      { $set: { trackId: '$_id.trackId' } },
      ...coverLookup,
    ]),
    // Top artist of each month.
    Play.aggregate([
      { $match: streamsOnly },
      { $group: { _id: { month: { $dateTrunc: { date: '$playedAt', unit: 'month', timezone: TZ } }, artist: '$artistName' }, streams: { $sum: 1 } } },
      { $sort: { '_id.month': 1, streams: -1 } },
      { $group: { _id: '$_id.month', artist: { $first: '$_id.artist' }, streams: { $first: '$streams' } } },
      { $sort: { _id: 1 } },
      { $lookup: { from: 'artists', localField: 'artist', foreignField: 'name', as: 'a' } },
      { $set: { image: { $first: '$a.image' } } },
    ]),
  ]);

  const liked = addedIn(userId, period);
  const [likedCount, firstLiked] = await Promise.all([
    LikedSong.countDocuments(liked),
    LikedSong.findOne(liked).sort({ addedAt: 1 }).lean().then(likedTrack),
  ]);

  return {
    from: period.from, to: period.to,
    ...sum,
    likedCount,
    firstLiked,
    topArtists: artists,
    topTracks: tracks,
    topAlbum: albums[0] ?? null,
    topGenres: genres, // empty when Spotify gives no genres
    obsession: obsession && {
      name: obsession.name, artist: obsession.artist, image: obsession.image ?? null,
      streams: obsession.streams, weekOf: localDate(obsession._id.week), spotifyUrl: openUrl('track', obsession.trackId),
    },
    eras: eras.map((e) => ({ month: localDate(e._id).slice(0, 7), artist: e.artist, streams: e.streams, image: e.image ?? null })),
    personality: personality({
      streams: sum.streams, night: tod?.night ?? 0, morning: tod?.morning ?? 0,
      uniqueArtists: sum.uniqueArtists, uniqueTracks: sum.uniqueTracks,
      top5Streams: artists.reduce((n, a) => n + a.streams, 0), skipRate: skipData.skipRate,
    }),
  };
}

// First time you played an artist or song, searched by exact name (any case). Artists win over songs.
export async function firstListened(userId, { q }) {
  const name = String(q ?? '').trim();
  if (!name) throw badRequest('Type an artist or song name.');
  const exact = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  for (const [type, field] of [['artist', 'artistName'], ['track', 'trackName']]) {
    const play = await Play.findOne({ userId, [field]: exact }).sort({ playedAt: 1 }).lean();
    if (!play) continue;
    const art = type === 'artist'
      ? await Artist.findOne({ name: play.artistName }, { image: 1 }).lean()
      : await Track.findById(play.trackId, { albumImage: 1 }).lean();
    return {
      type, playedAt: play.playedAt, track: play.trackName, artist: play.artistName,
      image: (type === 'artist' ? art?.image : art?.albumImage) ?? null,
    };
  }
  return null;
}

export async function recent(userId, query) {
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);
  const plays = await Play.find({ userId }).sort({ playedAt: -1 }).limit(limit).lean();
  const tracks = await Track.find({ _id: { $in: plays.map((p) => p.trackId) } }, { albumImage: 1 }).lean();
  const cover = new Map(tracks.map((t) => [t._id, t.albumImage]));
  return plays.map((p) => ({
    trackId: p.trackId, name: p.trackName, artist: p.artistName, album: p.albumName,
    playedAt: p.playedAt, image: cover.get(p.trackId) ?? null, spotifyUrl: openUrl('track', p.trackId),
  }));
}

// Liked Songs added inside a range.
const addedIn = (userId, { from, to }) => ({ userId, addedAt: { $lt: to, ...(from && { $gte: from }) } });

async function likedTrack(row) {
  if (!row) return null;
  const t = await Track.findById(row.trackId, { name: 1, artistNames: 1, albumImage: 1 }).lean();
  return {
    id: row.trackId, addedAt: row.addedAt, name: t?.name ?? null, artist: t?.artistNames?.[0] ?? null,
    image: t?.albumImage ?? null, spotifyUrl: openUrl('track', row.trackId),
  };
}

// Your library: Liked Songs (all time and added in the range), counts from the last sync,
// songs liked per month, your most played liked song, and top artists you don't follow.
export async function library(user, query) {
  const userId = user._id;
  const period = parseRange({ range: '1y', ...query });
  const lib = user.library ?? {};
  const added = addedIn(userId, period);
  const [likedSongs, likedInRange, perMonth, [most], artists] = await Promise.all([
    LikedSong.countDocuments({ userId }),
    LikedSong.countDocuments(added),
    LikedSong.aggregate([
      { $match: added },
      { $group: { _id: { $dateToString: { date: '$addedAt', format: '%Y-%m', timezone: TZ } }, songs: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Play.aggregate([
      { $match: { ...matchFor(userId, period, query), msPlayed: { $gte: STREAM_MIN_MS } } },
      { $group: { _id: '$trackId', streams: { $sum: 1 }, name: { $first: '$trackName' }, artist: { $first: '$artistName' } } },
      { $sort: { streams: -1 } },
      { $lookup: { from: 'likedsongs', localField: '_id', foreignField: 'trackId', pipeline: [{ $match: { userId } }], as: 'l' } },
      { $match: { l: { $ne: [] } } },
      { $limit: 1 },
      { $set: { trackId: '$_id' } },
      ...coverLookup,
    ]),
    lib.syncedAt ? topItems(userId, 'artists', period, query, 50) : [],
  ]);
  const followed = new Set(lib.followedArtists ?? []);
  return {
    syncedAt: lib.syncedAt ?? null, // null = first sync hasn't finished yet
    likedSongs, likedInRange,
    savedAlbums: lib.savedAlbums ?? null, playlists: lib.playlists ?? null, following: lib.following ?? null,
    likedPerMonth: perMonth.map((r) => ({ month: r._id, songs: r.songs })),
    mostPlayedLiked: most
      ? { id: most._id, name: most.name, artist: most.artist, image: most.image ?? null, streams: most.streams, spotifyUrl: openUrl('track', most._id) }
      : null,
    notFollowed: artists.filter((a) => !followed.has(a.name)).slice(0, 5),
  };
}
