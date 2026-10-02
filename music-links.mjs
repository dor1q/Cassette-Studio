const shortHosts = new Set(['spotify.link', 'spotify.app.link', 'deezer.page.link', 'link.deezer.com']);
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';

export function isMusicLinkText(text) {
  return /https?:\/\/|spotify:|(?:open\.spotify\.com|spotify\.link|spotify\.app\.link|music\.apple\.com|itunes\.apple\.com|youtu\.be|youtube\.com|deezer\.com|deezer\.page\.link|musicbrainz\.org)\//i.test(text);
}

export function normalizeMusicUrl(input) {
  let raw = String(input || '').trim().replace(/&amp;/g, '&');
  if (!raw || raw.length > 4096) throw Error('Вставьте ссылку на альбом, трек или плейлист');
  const uri = raw.match(/^spotify:(album|playlist|track):([A-Za-z0-9]{22})$/i);
  if (uri) raw = `https://open.spotify.com/${uri[1].toLowerCase()}/${uri[2]}`;
  const pasted = raw.match(/https?:\/\/[^\s<>"\u201c\u201d]+/i);
  if (pasted) {
    raw = pasted[0].replace(/[.,;!\]}>]+$/, '');
    while (raw.endsWith(')') && (raw.match(/\(/g)?.length || 0) < (raw.match(/\)/g)?.length || 0)) raw = raw.slice(0, -1);
  }
  else if (/^(?:www\.|open\.|music\.|m\.|itunes\.|spotify\.|youtu\.|youtube\.|deezer\.|link\.deezer\.|musicbrainz\.)/i.test(raw)) raw = 'https://' + raw;
  let u;
  try { u = new URL(raw); } catch { throw Error('Не удалось распознать ссылку. Скопируйте её через «Поделиться» в музыкальном сервисе.'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port) throw Error('Нужна обычная ссылка музыкального сервиса');
  u.protocol = 'https:';
  u.hash = '';
  return u;
}

export function parseMusicLink(input) {
  const u = normalizeMusicUrl(input), host = u.hostname.toLowerCase();
  if (shortHosts.has(host)) return {provider: 'short', url: u.href};
  if (host === 'open.spotify.com') {
    const match = u.pathname.match(/^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(album|playlist|track)\/([A-Za-z0-9]{22})\/?$/i)
      || u.pathname.match(/^\/user\/[^/]+\/(playlist)\/([A-Za-z0-9]{22})\/?$/);
    if (!match) throw Error('Вставьте ссылку Spotify на альбом, трек или плейлист');
    return {provider: 'spotify', type: match[1].toLowerCase(), id: match[2], url: `https://open.spotify.com/${match[1].toLowerCase()}/${match[2]}`};
  }
  if (youtubeHosts.has(host)) {
    const list = u.searchParams.get('list');
    const video = host === 'youtu.be' ? u.pathname.split('/')[1] : u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    if (list && /^[A-Za-z0-9_-]{10,120}$/.test(list)) return {provider: 'youtube', type: 'playlist', id: list, url: 'https://www.youtube.com/playlist?list=' + list};
    if (video && /^[A-Za-z0-9_-]{11}$/.test(video)) return {provider: 'youtube', type: 'track', id: video, url: 'https://www.youtube.com/watch?v=' + video};
    throw Error('В ссылке YouTube нет корректного видео или плейлиста');
  }
  if (['music.apple.com', 'itunes.apple.com'].includes(host)) {
    if (/\/playlist\//.test(u.pathname)) {
      const id = u.pathname.match(/\/playlist\/(?:[^/]+\/)?(pl\.(?:[a-f0-9]{32}|u-[A-Za-z0-9]{6,80}|pm-[a-f0-9]{32}))\/?$/i)?.[1];
      if (!id) throw Error('Вставьте полную публичную ссылку Apple Music на плейлист');
      const country = u.pathname.match(/^\/([a-z]{2})\//i)?.[1].toUpperCase() || 'US';
      return {provider: 'apple', type: 'playlist', id, country, url: 'https://music.apple.com' + u.pathname + u.search};
    }
    const id = u.searchParams.get('i') || u.pathname.match(/\/(?:id)?(\d+)\/?$/)?.[1] || u.searchParams.get('id');
    if (!id || !/^\d+$/.test(id)) throw Error('Вставьте ссылку Apple Music на альбом или песню');
    const country = u.pathname.match(/^\/([a-z]{2})\//i)?.[1].toUpperCase() || 'US';
    return {provider: 'apple', type: u.searchParams.has('i') || /\/song\//.test(u.pathname) ? 'track' : 'album', id, country, url: u.href};
  }
  if (['deezer.com', 'www.deezer.com'].includes(host)) {
    const match = u.pathname.match(/^\/(?:[a-z]{2}\/)?(album|playlist|track)\/(\d+)\/?$/i);
    if (!match) throw Error('Вставьте ссылку Deezer на альбом, трек или плейлист');
    return {provider: 'deezer', type: match[1].toLowerCase(), id: match[2], url: `https://www.deezer.com/${match[1].toLowerCase()}/${match[2]}`};
  }
  if (['musicbrainz.org', 'www.musicbrainz.org'].includes(host)) {
    const match = u.pathname.match(new RegExp(`^/(release|release-group)/(${uuid})/?$`, 'i'));
    if (!match) throw Error('Вставьте ссылку MusicBrainz на издание или группу изданий');
    return {provider: 'musicbrainz', type: match[1], id: match[2], url: `https://musicbrainz.org/${match[1]}/${match[2]}`};
  }
  throw Error('Поддерживаются Spotify, Apple Music, YouTube / YouTube Music, Deezer и MusicBrainz.');
}

export async function resolveMusicLink(input, request) {
  let link = parseMusicLink(input);
  for (let n = 0; link.provider === 'short' && n < 5; n++) {
    const response = await request(link.url, {redirect: 'manual'});
    if (![301, 302, 303, 307, 308].includes(response.status)) throw Error('Короткая ссылка не раскрылась. Скопируйте полный адрес альбома, трека или плейлиста.');
    const location = response.headers.get('location');
    if (!location) throw Error('Сервис не вернул адрес короткой ссылки');
    const source = new URL(link.url), destination = new URL(location, source);
    // Validate every redirect before making another request; never fetch arbitrary pasted URLs.
    const next = parseMusicLink(destination.href);
    const spotifySource = source.hostname.startsWith('spotify.');
    if (next.provider === 'short') {
      if (spotifySource !== new URL(next.url).hostname.startsWith('spotify.')) throw Error('Короткая ссылка ведёт на другой сервис');
    } else if (next.provider !== (spotifySource ? 'spotify' : 'deezer')) throw Error('Короткая ссылка ведёт на другой сервис');
    link = next;
  }
  if (link.provider === 'short') throw Error('Слишком много переадресаций короткой ссылки');
  return link;
}
