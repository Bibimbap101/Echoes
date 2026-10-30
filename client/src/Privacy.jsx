export default function Privacy() {
  return (
    <div className="page privacy">
      <h1>Privacy</h1>
      <p>Echoes shows you stats about your own Spotify listening. Here's exactly what it keeps.</p>
      <h2>What Echoes saves</h2>
      <ul>
        <li>Your Spotify name and profile picture.</li>
        <li>The songs you play (song, artist, album, when, and for how long).</li>
        <li>Your Liked Songs, the artists you follow, and how many albums and playlists you have saved.</li>
        <li>History files you upload yourself. Echoes keeps only the songs, never the IP address or country in them.</li>
        <li>A login key from Spotify so Echoes can check your plays every 30 minutes. It's stored encrypted.</li>
      </ul>
      <h2>What Echoes never does</h2>
      <ul>
        <li>It never sells or shares your data, and shows it to no one but you.</li>
        <li>It never changes anything in your Spotify account. It can only read.</li>
      </ul>
      <h2>Leaving</h2>
      <p>
        Remove Echoes at <a className="up" href="https://www.spotify.com/account/apps/" target="_blank" rel="noreferrer">spotify.com/account/apps</a> to stop it reading your account.
        Ask the person who runs this Echoes to delete what's already saved.
      </p>
    </div>
  );
}
