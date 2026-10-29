# Echoes

Your personal Spotify stats, all year round. Like Wrapped plus stats.fm, running on your own computer.

Stack: MongoDB, Express, React (Vite), Node. Research notes are in [RESEARCH.md](RESEARCH.md).

## What you need

- Node 20.6 or newer
- MongoDB running locally (or a MongoDB Atlas connection string)
- A **Spotify Premium** account. Spotify requires this for Development Mode apps.

## 1. Create the Spotify app

1. Go to https://developer.spotify.com/dashboard and log in.
2. Click **Create app**.
   - Name: `Echoes` (anything works).
   - Redirect URI: `http://127.0.0.1:5173/api/auth/callback`, then click **Add**.
     Spotify bans `localhost`, so it must be `127.0.0.1`.
   - APIs used: tick **Web API**.
3. Save, then open **Settings**. Copy the **Client ID**. Click **View client secret** and copy that too.
4. Open **User Management**. Add your own name and the email of your Spotify account.
   Up to 5 people can be added. Anyone not on this list gets an error when logging in.

## 2. Set up the project

1. Copy `.env.example` to `.env`.
2. Paste the Client ID and Client Secret into `.env`.
3. Set `SESSION_SECRET` to a long random string. One way to make one:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Install everything:
   ```bash
   npm run setup
   ```

## 3. Start MongoDB

If you installed MongoDB as a Windows service, start it from an **admin** PowerShell:
```powershell
Start-Service MongoDB
```

## 4. Run it

```bash
npm run dev
```
Open **http://127.0.0.1:5173**. Use `127.0.0.1`, not `localhost`, or the login cookie won't stick.

## 5. Request your Extended Streaming History (do this now, it takes days)

1. Go to https://www.spotify.com/account/privacy/.
2. Tick **Extended streaming history**. You don't need the other boxes.
3. Click **Request data** and confirm in the email Spotify sends you.
4. It can take up to 30 days. You'll get a zip with `Streaming_History_Audio_*.json` files.

Meanwhile, Echoes saves your plays by itself every 30 minutes, starting the moment you log in.

## 6. Import your history (once the zip arrives)

1. Unzip it.
2. Either:
   - **In the app:** click **Import Streaming_History_Audio files** and pick all the `Streaming_History_Audio_*.json` files. (Skip the `Video` ones.)
   - **Or from a terminal:** `npm run import -- "C:\path\to\the\unzipped\folder"`
3. Re-importing the same files is safe. Repeats are skipped.
4. Covers and artist photos fill in slowly in the background (about 1 lookup per second) while the server runs. Your most-played songs go first. The app shows the progress.

## Stats API

All under `/api/stats`, and all need you to be logged in. `range` is `today`, `7d`, `4w`, `6m`, `1y`, `life` or `custom` (with `from=YYYY-MM-DD&to=YYYY-MM-DD`). Add `private=hide` to leave out private sessions.

| Endpoint | What it gives |
|---|---|
| `/top/tracks?range=4w` (also `artists`, `albums`, `genres`) | `{ source, items }`. Top 100 with streams, minutes, cover, Spotify link and `prevRank` (rank in the previous equal-length period; `null` = new). If your history doesn't cover 4w/6m/1y yet, tracks/artists come from Spotify's own ranking (`source: "spotify"`, no counts) |
| `/summary?range=7d` | Streams, minutes, hours, unique tracks/artists/albums, plus `previous` for ↑/↓ |
| `/clock?range=1y` | Streams and minutes per hour × weekday |
| `/timeline?range=6m&unit=week` | Minutes per `day`, `week` or `month` |
| `/streak` | Longest and current listening streak |
| `/skips?range=life` | Skip rate and most-skipped songs (imported history only) |
| `/first?q=LE SSERAFIM` | First time you played an artist or song (exact name, any case) |
| `/recent?limit=20` | Recently played, with covers |
| `/wrapped?range=1y` | Everything for a Wrapped story: totals, top 5 artists/tracks, top album, top genres, obsession (most-played song in one week), monthly eras, listening personality |

## Build phases

1. ✅ Spotify login + token refresh + MongoDB connection
2. ✅ Plays collection + the every-30-minutes recently-played check + history import + background cover/genre filler
3. ✅ Counting endpoints (top lists for any range, stats)
4. ✅ Mockups → Home + Top pages. Until enough history exists, the 4W/6M/1Y tabs fall back to Spotify's own top lists (rank only, no counts).
5. ✅ Stats page + charts (plain SVG, no chart library)
6. ✅ Wrapped data (obsession, eras, personality)
7. ✅ Mockups → Wrapped story cards + image download (tap/swipe/arrow keys; each card saves as a 1080×1920 PNG)
