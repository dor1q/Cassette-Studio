import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseMusicLink, resolveMusicLink, isMusicLinkText} from '../music-links.mjs';
import {createServiceRequest, MusicServiceError} from '../music-network.mjs';
import {createMusicImporter, parseSpotifyEmbed, isoDuration} from '../music-importer.mjs';
import {prepareAlbumImport, importMusicData} from '../src/music-import.js';
import {createProject} from '../src/model.js';
import {createSpotifySessionStore} from '../desktop/spotify-session.mjs';
import {startStudioServer} from '../server.mjs';
import {playerEmbed} from '../src/player.js';

const id = '5SknXhmjHijD0uU1Pm2HBr', trackId = '4cOdK2wGLETKBW3PvgPWqT';
const response = data => new Response(JSON.stringify(data), {headers: {'Content-Type': 'application/json'}});
const rawTrack = (name, duration = 123400) => ({type: 'track', name, artists: [{name: 'Artist'}], duration_ms: duration});
const embed = (type = 'album', overrides = {}) => `<script type="application/json" id="__NEXT_DATA__">${JSON.stringify({props: {pageProps: {state: {data: {entity: {uri: `spotify:${type}:${id}`, type, title: 'Album', subtitle: 'Artist', trackList: [{title: 'One', subtitle: 'Artist', duration: 123400}], visualIdentity: {image: [{url: 'https://i.scdn.co/small', maxWidth: 64}, {url: 'https://i.scdn.co/large', maxWidth: 640}]}, ...overrides}}}}}})}</script>`;
const importer = (fetchImpl, options = {}) => createMusicImporter({request: createServiceRequest({fetchImpl, sleep: async () => {}}), spotifyToken: async () => {throw Error('Connect Spotify');}, ...options});

test('Spotify accepts locale, embed, URI, bare and pasted share links', () => {
  for (const url of [`https://open.spotify.com/intl-ru/album/${id}?si=x`, `https://open.spotify.com/embed/album/${id}`, `spotify:album:${id}`, `open.spotify.com/album/${id}`, `Слушай: https://open.spotify.com/album/${id}.`, `[альбом](https://open.spotify.com/album/${id})`]) {
    const link = parseMusicLink(url);
    assert.equal(link.provider, 'spotify'); assert.equal(link.id, id); assert.equal(link.url, `https://open.spotify.com/album/${id}`);
    assert.equal(isMusicLinkText(url), true);
  }
  assert.equal(parseMusicLink(`https://open.spotify.com/track/${trackId}`).type, 'track');
  assert.equal(parseMusicLink(`https://open.spotify.com/user/me/playlist/${id}`).type, 'playlist');
  assert.equal(isMusicLinkText('fakemink London’s Saviour'), false);
});

test('YouTube accepts mobile, music, shorts, live and short video links', () => {
  for (const url of ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?si=x', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/live/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ']) assert.equal(parseMusicLink(url).id, 'dQw4w9WgXcQ');
  assert.equal(parseMusicLink('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890').type, 'playlist');
});

test('Apple song and album share links retain storefront and exact track selection', () => {
  assert.deepEqual(parseMusicLink('https://music.apple.com/gb/album/name/123?i=456').country, 'GB');
  assert.equal(parseMusicLink('https://music.apple.com/gb/album/name/123?i=456').id, '456');
  assert.equal(parseMusicLink('https://music.apple.com/us/song/name/456').type, 'track');
  assert.equal(parseMusicLink('https://itunes.apple.com/ru/album/name/id123').id, '123');
  assert.equal(parseMusicLink('https://www.deezer.com/ru/playlist/123').provider, 'deezer');
  assert.equal(parseMusicLink('https://musicbrainz.org/release-group/01234567-89ab-cdef-0123-456789abcdef').type, 'release-group');
});

test('unsupported and malformed links fail before any network requests', () => {
  for (const link of ['file:///C:/Windows', 'javascript:alert(1)', 'https://user:password@open.spotify.com/album/' + id, 'https://open.spotify.com.evil.example/album/' + id, 'https://127.0.0.1:8769/api/status', 'https://open.spotify.com/artist/' + id, 'https://open.spotify.com/album/123', 'https://music.apple.com/us/playlist/example/pl.123']) assert.throws(() => parseMusicLink(link));
});

test('short redirects resolve without fetching the landing page and reject foreign targets', async () => {
  let calls = 0;
  const request = async () => {calls++; return new Response(null, {status: 302, headers: {Location: 'https://open.spotify.com/intl-ru/album/' + id}});};
  assert.equal((await resolveMusicLink('https://spotify.link/example', request)).id, id); assert.equal(calls, 1);
  for (const location of ['http://127.0.0.1:8769/', 'https://evil.example/', 'https://www.deezer.com/album/123']) {
    calls = 0;
    await assert.rejects(resolveMusicLink('https://spotify.link/example', async () => {calls++; return new Response(null, {status: 302, headers: {Location: location}});}));
    assert.equal(calls, 1);
  }
});

test('network retries temporary failures, honors bounded Retry-After and never retries auth errors', async () => {
  let count = 0; const delays = [];
  const request = createServiceRequest({fetchImpl: async () => ++count === 1 ? new Response(null, {status: 429, headers: {'Retry-After': '1'}}) : response({ok: true}), sleep: async ms => delays.push(ms)});
  assert.equal((await request('https://api.spotify.com/v1/albums/' + id)).status, 200); assert.equal(count, 2); assert.deepEqual(delays, [1000]);
  for (const status of [401, 403, 404, 429]) {
    count = 0;
    const failing = createServiceRequest({fetchImpl: async () => {count++; return new Response(null, {status, headers: {'Retry-After': '30'}});}, sleep: async () => {throw Error('Unexpected sleep');}});
    await assert.rejects(failing('https://api.spotify.com/v1/albums/' + id), e => e instanceof MusicServiceError && e.status === status); assert.equal(count, 1);
  }
});

test('network retries disconnects but does not repeat token POST requests', async () => {
  let count = 0;
  const request = createServiceRequest({fetchImpl: async () => {if (++count < 3) throw Error('fetch failed'); return response({});}, sleep: async () => {}});
  await request('https://api.deezer.com/album/1'); assert.equal(count, 3);
  count = 0;
  const auth = createServiceRequest({fetchImpl: async () => {count++; throw Error('fetch failed');}, sleep: async () => {}});
  await assert.rejects(auth('https://accounts.spotify.com/api/token', {method: 'POST'})); assert.equal(count, 1);
});

test('Spotify public metadata preserves exact track order, durations, artist and largest cover', () => {
  const a = parseSpotifyEmbed(embed('album', {trackList: [{title: 'Second', subtitle: 'B', duration: 187966}, {title: 'First', subtitle: 'A', duration: 86520}]}), {type: 'album', id, url: 'spotify-url'});
  assert.deepEqual(a.tracks.map(t => [t.title, t.artist, t.seconds]), [['Second', 'B', 187], ['First', 'A', 86]]);
  assert.equal(a.cover, 'https://i.scdn.co/large'); assert.equal(a.url, 'spotify-url'); assert.equal(a.artist, 'Artist');
  assert.throws(() => parseSpotifyEmbed(embed(), {type: 'album', id: trackId}), /отдал/);
  assert.throws(() => parseSpotifyEmbed('<script>bad</script>', {type: 'album', id}), /отдал/);
});

test('Spotify public playlists carry a persistent partial-list warning', () => {
  const a = parseSpotifyEmbed(embed('playlist'), {type: 'playlist', id, url: 'url'});
  assert.match(a.warnings.join(' '), /частично/);
  const track = parseSpotifyEmbed(embed('track', {trackList: undefined, artists: [{name: 'Singer'}], duration: 213573}), {type: 'track', id, url: 'url'});
  assert.equal(track.tracks.length, 1); assert.equal(track.tracks[0].seconds, 213); assert.equal(track.artist, 'Singer');
});

test('Spotify falls back to exact public embed data when API access is absent or restricted', async () => {
  const m = importer(async url => {assert.match(url, /open.spotify.com\/embed/); return new Response(embed());});
  const a = await m.importLink('spotify:album:' + id); assert.equal(a.album, 'Album'); assert.equal(a.importSource, 'Spotify Embed');
  const restricted = importer(async url => url.startsWith('https://api.spotify.com/') ? new Response(null, {status: 403}) : new Response(embed()), {spotifyToken: async () => 'token'});
  assert.equal((await restricted.importLink('spotify:album:' + id)).tracks[0].title, 'One');
});

test('Spotify authenticated import follows all playlist pages and supports old and new item fields', async () => {
  const next = 'https://api.spotify.com/v1/playlists/' + id + '/items?offset=2';
  const m = importer(async url => response(url === next ? {items: [{track: rawTrack('Three')}], next: null} : {name: 'Playlist', images: [{width: 640, url: 'cover'}], items: {items: [{item: rawTrack('One')}, {track: rawTrack('Two')}], total: 3, next}}), {spotifyToken: async () => 'token'});
  const a = await m.importLink('https://open.spotify.com/playlist/' + id);
  assert.deepEqual(a.tracks.map(t => t.title), ['One', 'Two', 'Three']); assert.deepEqual(a.warnings, []);
});

test('Spotify API refreshes a rejected token once and tracks include album artwork', async () => {
  const tokens = []; let count = 0;
  const m = importer(async () => ++count === 1 ? new Response(null, {status: 401}) : response({...rawTrack('Song'), album: {images: [{width: 640, url: 'cover'}]}}), {spotifyToken: async force => {tokens.push(force === true); return force ? 'new-token' : 'old-token';}});
  const a = await m.importLink('https://open.spotify.com/track/' + trackId);
  assert.deepEqual(tokens, [false, true]); assert.equal(count, 2); assert.equal(a.cover, 'cover'); assert.equal(a.tracks.length, 1);
});

test('Spotify pagination cannot send tokens to another host', async () => {
  const calls = [];
  const m = importer(async url => {calls.push(url); if (url.includes('/embed/')) return new Response(embed('playlist')); return response({name: 'List', items: {items: [{item: rawTrack('One')}], next: 'https://evil.example/secret'}});}, {spotifyToken: async () => 'token'});
  const a = await m.importLink('https://open.spotify.com/playlist/' + id);
  assert.equal(a.importSource, 'Spotify Embed'); assert.ok(!calls.some(url => url.includes('evil.example')));
});

test('Apple album import uses the URL storefront and disc order, with incomplete availability warning', async () => {
  const m = importer(async url => {
    assert.equal(new URL(url).searchParams.get('country'), 'GB');
    return response({results: [{wrapperType: 'collection', collectionName: 'Album', artistName: 'Singer', trackCount: 3, artworkUrl100: 'https://example.mzstatic.com/100x100bb.jpg'}, {wrapperType: 'track', kind: 'song', trackId: 2, trackName: 'Two', discNumber: 2, trackNumber: 1, trackTimeMillis: 200000}, {wrapperType: 'track', kind: 'song', trackId: 1, trackName: 'One', discNumber: 1, trackNumber: 1, trackTimeMillis: 100000}]});
  });
  const a = await m.importLink('https://music.apple.com/gb/album/name/123');
  assert.deepEqual(a.tracks.map(t => t.title), ['One', 'Two']); assert.match(a.cover, /1200x1200bb/); assert.match(a.warnings[0], /2 из 3/);
});

test('Apple album links with i import the selected song only', async () => {
  const m = importer(async url => {assert.equal(new URL(url).searchParams.get('id'), '456'); return response({results: [{wrapperType: 'track', kind: 'song', trackId: 456, trackName: 'Chosen', artistName: 'Artist', trackTimeMillis: 125000}]});});
  const a = await m.importLink('https://music.apple.com/us/album/name/123?i=456'); assert.equal(a.album, 'Chosen'); assert.equal(a.tracks.length, 1);
});

test('Deezer reads all pages, tracks and API errors without relying on HTTP status alone', async () => {
  const m = importer(async url => response(url.includes('offset=1') ? {data: [{title: 'Two', artist: {name: 'B'}, duration: 20}]} : {title: 'Album', cover_xl: 'cover', nb_tracks: 2, tracks: {data: [{title: 'One', artist: {name: 'A'}, duration: 10}], next: 'http://api.deezer.com/album/123/tracks?offset=1'}}));
  assert.deepEqual((await m.importLink('https://www.deezer.com/en/album/123')).tracks.map(t => t.title), ['One', 'Two']);
  const bad = importer(async () => response({error: {code: 800, message: 'no data'}})); await assert.rejects(bad.importLink('https://www.deezer.com/track/123'), /Deezer/);
  const single = importer(async () => response({title: 'Single', duration: 80, artist: {name: 'Artist'}, album: {cover_xl: 'cover'}})); assert.equal((await single.importLink('https://www.deezer.com/track/123')).cover, 'cover');
});

test('YouTube without API key imports public video metadata and explicitly marks unknown duration', async () => {
  const m = importer(async url => {assert.match(url, /youtube.com\/oembed/); return response({title: 'Video', author_name: 'Channel', thumbnail_url: 'cover'});});
  const a = await m.importLink('https://youtu.be/dQw4w9WgXcQ'); assert.equal(a.tracks[0].seconds, 0); assert.match(a.warnings[0], /длительность/);
  await assert.rejects(m.importLink('https://www.youtube.com/playlist?list=PL1234567890'), /ключ/);
});

test('YouTube playlist pagination preserves duplicate videos and skips inaccessible videos with a warning', async () => {
  const m = importer(async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('/playlists')) return response({items: [{snippet: {title: 'List', channelTitle: 'Owner'}}]});
    if (u.pathname.endsWith('/playlistItems')) return response(u.searchParams.has('pageToken') ? {items: [{contentDetails: {videoId: 'one'}}]} : {items: [{contentDetails: {videoId: 'one'}}, {contentDetails: {videoId: 'missing'}}], nextPageToken: 'next'});
    return response({items: [{id: 'one', snippet: {title: 'Song', channelTitle: 'Artist'}, contentDetails: {duration: 'PT3M7S'}}]});
  }, {youtubeKey: () => 'test-key'});
  const a = await m.importLink('https://music.youtube.com/playlist?list=PL1234567890'); assert.deepEqual(a.tracks.map(t => t.seconds), [187, 187]); assert.match(a.warnings[0], /1/);
  assert.equal(isoDuration('P1DT2H3M4.5S'), 93785); assert.equal(isoDuration('bad'), 0);
});

test('ambiguous MusicBrainz release groups ask for an edition instead of importing a different record', async () => {
  const m = importer(async () => response({}), {musicbrainzRequest: async () => ({releases: [{id: 'one'}, {id: 'two'}]}), musicbrainzAlbum: async () => {throw Error('Must not pick a random edition');}});
  await assert.rejects(m.importLink('https://musicbrainz.org/release-group/01234567-89ab-cdef-0123-456789abcdef'), /несколько изданий/);
});

test('artwork retries smaller sources and a complete cover failure never loses track data', async () => {
  const album = {album: 'Album', artist: 'Artist', cover: 'large', coverAlternatives: ['small'], tracks: [{title: 'One', seconds: 10}]}, calls = [];
  const loaded = await prepareAlbumImport(album, async url => {calls.push(url); if (url === 'large') throw Error('Unavailable'); return {src: 'data:image/jpeg;base64,AA=='};});
  assert.deepEqual(calls, ['large', 'small']); assert.equal(loaded.warnings.length, 0);
  const failed = await prepareAlbumImport(album, async () => {throw Error('Unavailable');});
  assert.equal(failed.artwork, null); assert.match(failed.warnings[0], /обложка/);
  const p = createProject(); importMusicData(p, album); assert.equal(p.data.A.length + p.data.B.length, 1);
  await assert.rejects(prepareAlbumImport({tracks: []}, async () => {throw Error('Must not run');}), /нет доступных/);
});

test('import cache is isolated from caller mutations and can be cleared after reconnecting', async () => {
  let count = 0; const m = importer(async () => {count++; return new Response(embed());});
  const a = await m.importLink('spotify:album:' + id); a.tracks[0].title = 'Changed';
  assert.equal((await m.importLink('spotify:album:' + id)).tracks[0].title, 'One'); assert.equal(count, 1);
  m.clearCache(); await m.importLink('spotify:album:' + id); assert.equal(count, 2);
});

test('Windows session store uses OS encryption and removes saved tokens on disconnect', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cassette-session-'));
  try {
    const storage = {isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text.split('').reverse().join('')), decryptString: bytes => bytes.toString().split('').reverse().join('')};
    const store = createSpotifySessionStore(dir, storage), data = {clientId: 'a'.repeat(32), refreshToken: 'private-refresh-token'};
    await store.save(data); assert.deepEqual(await store.load(), data);
    assert.ok(!(await readFile(path.join(dir, 'spotify-session.bin'), 'utf8')).includes(data.refreshToken));
    await store.clear(); assert.equal(await store.load(), null);
    const unavailable = createSpotifySessionStore(dir, {...storage, isEncryptionAvailable: () => false}); assert.equal(await unavailable.save(data), false);
  } finally {assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep + 'cassette-session-')); await rm(dir, {recursive: true, force: true});}
});

test('reopened server restores refresh session, keeps secrets private and clears session on Client ID change', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cassette-import-http-')); let server, saved;
  try {
    await writeFile(path.join(dir, '.env'), 'SPOTIFY_CLIENT_ID=' + 'a'.repeat(32) + '\n');
    const spotifySession = {load: async () => ({clientId: 'a'.repeat(32), refreshToken: 'private-refresh'}), save: async value => {saved = value;}, clear: async () => {saved = null;}};
    server = await startStudioServer({port: 0, configDir: dir, useEnvironment: false, spotifySession, fetchImpl: async url => url.includes('/api/token') ? response({access_token: 'private-access', refresh_token: 'rotated-refresh', expires_in: 3600}) : response({...rawTrack('Track'), album: {images: []}})});
    const status = await fetch(server.origin + '/api/status').then(r => r.json()); assert.equal(status.spotifyConnected, true);
    const a = await fetch(server.origin + '/api/import?url=' + encodeURIComponent('spotify:track:' + trackId)).then(r => r.json()); assert.equal(a.tracks[0].title, 'Track'); assert.equal(saved.refreshToken, 'rotated-refresh');
    assert.ok(!JSON.stringify(status).includes('private-'));
    assert.equal((await fetch(server.origin + '/spotify-session.bin')).status, 404);
    const changed = await fetch(server.origin + '/api/settings', {method: 'POST', headers: {Origin: server.origin, 'Content-Type': 'application/json', 'X-Settings-Token': status.settingsToken}, body: JSON.stringify({SPOTIFY_CLIENT_ID: 'b'.repeat(32)})});
    assert.equal(changed.status, 200); assert.equal(saved, null); assert.equal((await fetch(server.origin + '/api/status').then(r => r.json())).spotifyConnected, false);
  } finally {await server?.close(); assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep + 'cassette-import-http-')); await rm(dir, {recursive: true, force: true});}
});

test('player uses the same normalized Spotify and YouTube links as import', () => {
  assert.equal(playerEmbed('spotify:album:' + id).url, 'https://open.spotify.com/embed/album/' + id);
  assert.equal(playerEmbed('https://open.spotify.com/intl-ru/track/' + trackId).service, 'Spotify');
  assert.equal(playerEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ').url, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
});
