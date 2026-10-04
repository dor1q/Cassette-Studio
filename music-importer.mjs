import {resolveMusicLink, parseMusicLink} from './music-links.mjs';
import {serviceJson, MusicServiceError} from './music-network.mjs';
import {recordLabelMetadata} from './music-labels.mjs';

const names = values => (values || []).map(a => a.name || a.artist?.name || '').filter(Boolean).join(', ');
const seconds = value => Math.max(0, Math.floor(Number(value) / 1000) || 0);
const largestImage = values => [...(values || [])].sort((a, b) => (b.width || b.maxWidth || 0) - (a.width || a.maxWidth || 0)).find(v => v.url)?.url || '';
const positiveDimension = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : undefined;
const largestImageObject = values => [...(Array.isArray(values) ? values : [])].sort((a, b) => (b?.width || b?.maxWidth || 0) - (a?.width || a?.maxWidth || 0)).find(v => artworkUrl(v?.url)) || null;
const youtubeImages = thumbnails => ['uhd', 'qhd', 'fhd', 'maxres', 'standard', 'high', 'medium', 'default'].map(key => thumbnails?.[key]).filter(Boolean);
const deezerImages = entity => {
  const prefix = entity?.cover_xl || entity?.cover_big || entity?.cover_medium || entity?.cover_small || entity?.cover ? 'cover' : 'picture';
  return ['_xl', '_big', '_medium', '_small', ''].map(suffix => entity?.[prefix + suffix]).filter(Boolean);
};
const MAX_TRACKS = 2000;
const limited = tracks => { if (tracks.length > MAX_TRACKS) throw Error('Список больше 2000 треков. Разделите его на части.'); return tracks; };

function artworkUrl(value) {
  if (typeof value !== 'string') return '';
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url.href : ''; }
  catch { return ''; }
}

function trackArtworkFields(image) {
  const thumbnail = artworkUrl(typeof image === 'string' ? image : image?.url);
  if (!thumbnail) return {};
  const width = positiveDimension(image?.width), height = positiveDimension(image?.height);
  return {thumbnail, cover: thumbnail, ...(width ? {thumbnailWidth: width} : {}), ...(height ? {thumbnailHeight: height} : {})};
}

// Server counterpart of buildTrackCoverPosters: each track supplies one actual image,
// while resolutions of the main image remain fallback sources outside poster indices.
function trackCoverPosters(tracks, {exclude = [], type = 'track-cover', limit = 12} = {}) {
  const seen = new Set(exclude.map(artworkUrl).filter(Boolean)), posters = [], maximum = Math.min(12, Math.max(0, Math.trunc(Number(limit) || 0)));
  if (!maximum) return posters;
  for (const track of tracks) {
    const file_path = artworkUrl(track.thumbnail || track.cover);
    if (!file_path || seen.has(file_path)) continue;
    seen.add(file_path);
    const width = positiveDimension(track.thumbnailWidth), height = positiveDimension(track.thumbnailHeight);
    posters.push({file_path, type, label: String(track.title || track.trackName || track.name || ''), ...(width ? {width} : {}), ...(height ? {height} : {})});
    if (posters.length === maximum) break;
  }
  return posters;
}

export function parseSpotifyEmbed(html, link) {
  const script = html.match(/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i);
  let entity;
  try { entity = script && JSON.parse(script[1]).props?.pageProps?.state?.data?.entity; } catch {}
  if (!entity || entity.uri !== `spotify:${link.type}:${link.id}`) throw Error('Spotify не отдал открытый список треков для этой ссылки');
  const source = link.type === 'track' ? [entity] : entity.trackList;
  if (!Array.isArray(source) || !source.length) throw Error('Spotify не отдал открытый список треков для этой ссылки');
  const tracks = source.filter(t => (t.entityType || t.type || 'track') === 'track' && (t.title || t.name)).map(t => ({title: t.title || t.name, artist: names(t.artists) || t.subtitle || entity.subtitle || '', seconds: seconds(t.duration)}));
  const warnings = [];
  if (link.type === 'playlist') warnings.push('Загружен открытый список Spotify. Длинный плейлист может отображаться частично; для полного импорта своего плейлиста подключите Spotify.');
  if (source.length !== tracks.length) warnings.push('Эпизоды подкастов пропущены.');
  if (tracks.some(t => !t.seconds)) warnings.push('Для некоторых треков сервис не указал длительность.');
  const images = [...(entity.visualIdentity?.image || []), ...(entity.coverArt?.sources || [])];
  return {album: entity.title || entity.name || '', artist: names(entity.artists) || entity.subtitle || '', cover: largestImage(images), coverAlternatives: images.map(i => i.url).filter(Boolean), url: link.url, note: entity.releaseDate?.isoString?.slice(0, 4) || '', ...recordLabelMetadata(link.type === 'album' ? entity.label || entity.recordLabel : '', 'Spotify Embed'), tracks: limited(tracks), warnings, importSource: 'Spotify Embed'};
}

export function isoDuration(value) {
  const m = String(value || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  return m ? Math.round(Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0)) : 0;
}

function appleArtwork(artwork, size) {
  const source = typeof artwork === 'string' ? artwork : artwork?.dictionary?.url || artwork?.url || '';
  try {
    const url = new URL(source.replace(/\{w\}/g, String(size)).replace(/\{h\}/g, String(size)).replace(/\{f\}/g, 'jpg').replace(/100x100bb/g, `${size}x${size}bb`));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !/(^|\.)mzstatic\.com$/i.test(url.hostname)) return '';
    return url.href;
  } catch { return ''; }
}

export function parseApplePlaylistPage(html, link) {
  const script = String(html).match(/<script\b(?=[^>]*\bid=(?:["']serialized-server-data["']|serialized-server-data(?=[\s>])))[^>]*>([\s\S]*?)<\/script>/i);
  let page;
  try {
    const entries = script && JSON.parse(script[1]).data;
    page = Array.isArray(entries) && entries.find(entry => entry?.intent?.contentDescriptor?.kind === 'playlist' && entry.intent.contentDescriptor.identifiers?.storeAdamID === link.id)?.data;
  } catch {}
  const sections = page?.sections;
  if (!Array.isArray(sections)) throw Error('Apple Music не отдал публичный список этого плейлиста. Он может быть закрыт, удалён или недоступен в регионе ссылки.');
  const items = section => Array.isArray(section?.items) ? section.items : [];
  const header = sections.flatMap(items).find(item => item?.contentDescriptor?.kind === 'playlist' && item.contentDescriptor.identifiers?.storeAdamID === link.id && typeof item.title === 'string' && item.title.trim());
  if (!header) throw Error('Apple Music вернул страницу другого плейлиста или изменил формат публичных данных.');
  const raw = sections.filter(section => section?.itemKind === 'trackLockup' && section.containerContentDescriptor?.kind === 'playlist' && section.containerContentDescriptor.identifiers?.storeAdamID === link.id).flatMap(items);
  const tracks = raw.filter(item => item?.contentDescriptor?.kind === 'song' && typeof item.title === 'string' && item.title.trim()).map(item => {
    const thumbnail = appleArtwork(item.artwork, 600);
    return {title: item.title, artist: typeof item.artistName === 'string' ? item.artistName : (item.subtitleLinks || []).map(link => link.title).filter(Boolean).join(', '), seconds: Number.isFinite(Number(item.duration)) ? seconds(item.duration) : 0, ...(thumbnail ? {thumbnail, cover: thumbnail} : {}), ...(item.isDisabled ? {unavailable: true} : {})};
  });
  if (!tracks.length) throw Error('Apple Music не вернул доступных названий треков. Проверьте, что плейлист опубликован и доступен в регионе ссылки.');
  limited(tracks);
  const warnings = [], expected = header.trackCount == null ? NaN : Number(header.trackCount);
  if (Number.isInteger(expected) && expected >= 0 && tracks.length < expected) warnings.push(`Apple Music отдал ${tracks.length} из ${expected} треков публичного плейлиста. Список неполный; недоступные записи не заменялись.`);
  else if (!Number.isInteger(expected) || expected < 0) warnings.push('Apple Music не указал полное число треков. Полноту открытого списка подтвердить не удалось.');
  if (raw.length > tracks.length) warnings.push(`Пропущено записей без музыкальных метаданных: ${raw.length - tracks.length}.`);
  if (tracks.some(track => !track.seconds)) warnings.push('Для некоторых треков Apple Music не сообщил длительность. Укажите её вручную.');
  const unavailable = tracks.filter(track => track.unavailable).length;
  if (unavailable) warnings.push(`Для ${unavailable} треков публичный плеер ограничил воспроизведение; исходные названия и длительности сохранены.`);
  const cover = appleArtwork(header.artwork, 1200), coverAlternatives = [appleArtwork(header.artwork, 600), appleArtwork(header.artwork, 100)].filter(Boolean);
  return {album: header.title, artist: (header.subtitleLinks || []).map(link => link.title).filter(Boolean).join(', '), url: link.url, note: '', cover, coverAlternatives, tracks, customPosters: trackCoverPosters(tracks, {exclude: [cover, ...coverAlternatives], type: 'apple-thumb'}), warnings, importSource: 'Apple Music Public Playlist'};
}

export function createMusicImporter({request, spotifyToken, youtubeKey = () => '', musicbrainzAlbum, musicbrainzRequest}) {
  const json = (url, options) => serviceJson(request, url, options);
  const cache = new Map();

  async function spotifyApi(link) {
    let token = await spotifyToken(), refreshed = false;
    const get = async url => {
      const u = new URL(url);
      if (u.origin !== 'https://api.spotify.com' || !u.pathname.startsWith('/v1/') || u.username || u.password) throw Error('Некорректная страница Spotify');
      try { return await json(u.href, {headers: {Authorization: 'Bearer ' + token}}); }
      catch (e) {
        if (e.status !== 401 || refreshed) throw e;
        refreshed = true; token = await spotifyToken(true);
        return json(u.href, {headers: {Authorization: 'Bearer ' + token}});
      }
    };
    const a = await get(`https://api.spotify.com/v1/${link.type}s/${link.id}`);
    let tracks = [], omitted = 0;
    if (link.type === 'track') tracks = [{title: a.name, artist: names(a.artists), seconds: seconds(a.duration_ms), ...trackArtworkFields(largestImageObject(a.album?.images))}];
    else {
      let page = link.type === 'playlist' ? a.items || a.tracks : a.tracks;
      if (!Array.isArray(page?.items)) page = await get(`https://api.spotify.com/v1/${link.type}s/${link.id}/${link.type === 'playlist' ? 'items' : 'tracks'}?limit=50`);
      const expected = page.total; let received = 0;
      const visited = new Set();
      for (let n = 0; n < 100; n++) {
        if (!Array.isArray(page?.items)) throw Error('Spotify не разрешил прочитать список треков. В режиме разработки доступны свои и совместные плейлисты.');
        received += page.items.length;
        for (const item of page.items) {
          const t = item?.item || item?.track || item;
          if (!t || t.type !== 'track' || !t.name) { omitted++; continue; }
          tracks.push({title: t.name, artist: names(t.artists), seconds: seconds(t.duration_ms), ...trackArtworkFields(largestImageObject(t.album?.images))});
        }
        limited(tracks);
        if (!page.next) break;
        if (visited.has(page.next) || n === 99) throw Error('Сервис вернул неполный список. Повторите импорт или разделите плейлист.');
        visited.add(page.next); page = await get(page.next);
      }
      if (Number.isFinite(expected) && received < expected) throw Error('Spotify вернул неполный список треков. Повторите импорт.');
    }
    if (!tracks.length) throw Error('Spotify не вернул доступных музыкальных треков');
    const images = a.images || a.album?.images || [];
    const cover = largestImage(images), coverAlternatives = images.map(i => i.url).filter(Boolean);
    return {album: a.name || '', artist: names(a.artists) || a.owner?.display_name || '', cover, coverAlternatives, url: a.external_urls?.spotify || link.url, note: a.label || '', ...recordLabelMetadata(link.type === 'album' ? a.label : link.type === 'track' ? a.album?.label : '', 'Spotify API'), tracks, customPosters: trackCoverPosters(tracks, {exclude: [cover, ...coverAlternatives], type: 'spotify-thumb'}), warnings: omitted ? [`Пропущено недоступных записей или подкастов: ${omitted}.`] : [], importSource: 'Spotify API'};
  }

  async function spotify(link) {
    let apiError;
    try { return await spotifyApi(link); } catch (e) { apiError = e; }
    // Read only the public embed's supplied metadata. No cookies, internal API or playback tokens.
    try {
      const response = await request(`https://open.spotify.com/embed/${link.type}/${link.id}`);
      const html = await response.text();
      if (html.length > 6000000) throw Error('Ответ Spotify слишком большой');
      return parseSpotifyEmbed(html, link);
    } catch (embedError) {
      if (apiError.status === 404) throw apiError;
      throw new MusicServiceError('Не удалось получить треки Spotify. Проверьте, что ссылка общедоступна, или переподключите Spotify в «Подключениях». ' + (apiError.status ? apiError.message : embedError.message), apiError.status);
    }
  }

  async function spotifyPreview(id, type = 'album') {
    if (!['album', 'track', 'playlist'].includes(type) || !/^[A-Za-z0-9]{22}$/.test(id)) throw Error('Некорректная ссылка Spotify');
    const info = await json('https://open.spotify.com/oembed?' + new URLSearchParams({url: `https://open.spotify.com/${type}/${id}`}));
    return {title: info.title || '', cover: info.thumbnail_url || ''};
  }

  async function apple(link) {
    if (link.type === 'playlist') {
      // Only the public HTML's supplied metadata; no account, cookies, playback tokens or internal API.
      let url = link.url;
      for (let n = 0; n < 5; n++) {
        const response = await request(url, {redirect: 'manual'});
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get('location');
          if (!location) throw Error('Apple Music не указал адрес публичного плейлиста');
          const destination = new URL(location, url);
          if (destination.protocol !== 'https:' || destination.hostname !== 'music.apple.com' || destination.username || destination.password || destination.port) throw Error('Apple Music перенаправил ссылку за пределы публичного каталога.');
          const next = parseMusicLink(destination.href);
          if (next.provider !== 'apple' || next.type !== 'playlist' || next.id !== link.id || next.country !== link.country) throw Error('Apple Music перенаправил ссылку на другой ресурс или регион. Скопируйте прямой публичный адрес плейлиста.');
          url = next.url;
          continue;
        }
        const html = await response.text();
        if (html.length > 16000000) throw Error('Ответ Apple Music слишком большой. Разделите плейлист на части.');
        return parseApplePlaylistPage(html, {...link, url});
      }
      throw Error('Слишком много переадресаций Apple Music');
    }
    const lookup = await json('https://itunes.apple.com/lookup?' + new URLSearchParams({id: link.id, country: link.country || 'US', entity: 'song', limit: '200'}));
    const rows = lookup.results || [], a = rows.find(x => x.wrapperType === 'collection') || rows.find(x => x.wrapperType === 'track');
    const raw = rows.filter(x => x.wrapperType === 'track' && x.kind === 'song');
    const list = link.type === 'track' ? raw.filter(x => String(x.trackId) === link.id) : raw;
    if (!a || !list.length) throw Error('Apple Music не нашёл доступных треков в регионе ссылки. Проверьте адрес альбома или песни.');
    // Sort multi-disc releases in their actual disc / track order.
    list.sort((a, b) => (a.discNumber || 1) - (b.discNumber || 1) || (a.trackNumber || 0) - (b.trackNumber || 0));
    const warnings = [];
    if (link.type !== 'track' && a.trackCount > list.length) warnings.push(`Apple Music отдал ${list.length} из ${a.trackCount} треков: часть записей недоступна в этом регионе или превышен лимит каталога.`);
    const cover = a.artworkUrl100?.replace(/100x100bb/, '1200x1200bb') || '', coverAlternatives = [a.artworkUrl100?.replace(/100x100bb/, '600x600bb'), a.artworkUrl100].filter(Boolean);
    const tracks = limited(list.map(t => {const thumbnail = appleArtwork(t.artworkUrl100, 600);return {title: t.trackName, artist: t.artistName || '', seconds: seconds(t.trackTimeMillis), ...(thumbnail ? {thumbnail, cover: thumbnail} : {})}}));
    return {album: link.type === 'track' ? list[0].trackName : a.collectionName, artist: a.artistName || '', url: link.type === 'track' ? list[0].trackViewUrl || link.url : a.collectionViewUrl || link.url, note: a.copyright || a.releaseDate?.slice(0, 4) || '', ...recordLabelMetadata(a.recordLabel, 'Apple Music'), cover, coverAlternatives, tracks, customPosters: trackCoverPosters(tracks, {exclude: [cover, ...coverAlternatives], type: 'apple-thumb'}), warnings, importSource: 'Apple Music'};
  }

  async function deezer(link) {
    const get = async url => {
      const u = new URL(url); u.protocol = 'https:';
      if (u.origin !== 'https://api.deezer.com' || u.username || u.password) throw Error('Некорректная страница Deezer');
      const data = await json(u.href);
      if (data.error) throw new MusicServiceError('Deezer: запись недоступна или сервис ограничил запрос. Проверьте ссылку и повторите импорт.', data.error.code);
      return data;
    };
    const a = await get(`https://api.deezer.com/${link.type}/${link.id}`);
    let raw = [];
    if (link.type === 'track') raw = [a];
    else {
      let page = a.tracks;
      if (!Array.isArray(page?.data)) page = await get(`https://api.deezer.com/${link.type}/${link.id}/tracks?limit=100`);
      const visited = new Set();
      for (let n = 0; n < 100; n++) {
        if (!Array.isArray(page?.data)) throw Error('Deezer не вернул список треков');
        raw.push(...page.data); limited(raw);
        if (!page.next) break;
        if (visited.has(page.next) || n === 99) throw Error('Deezer не отдал полный список треков');
        visited.add(page.next); page = await get(page.next);
      }
    }
    const tracks = raw.filter(t => t.title).map(t => ({title: t.title, artist: t.artist?.name || '', seconds: Math.max(0, Number(t.duration) || 0), ...trackArtworkFields(deezerImages(t.album).find(artworkUrl))}));
    const warnings = a.nb_tracks > raw.length ? [`Deezer отдал ${raw.length} из ${a.nb_tracks} записей; часть недоступна.`] : [];
    const mainImages = deezerImages(link.type === 'track' ? a.album : a), cover = mainImages[0] || '', coverAlternatives = mainImages.slice(1);
    return {album: a.title, artist: a.artist?.name || a.creator?.name || '', cover, coverAlternatives, url: a.link || link.url, note: [a.release_date, a.label].filter(Boolean).join(' · '), ...recordLabelMetadata(link.type === 'album' ? a.label : link.type === 'track' ? a.album?.label : '', 'Deezer'), tracks, customPosters: trackCoverPosters(tracks, {exclude: [cover, ...coverAlternatives], type: 'deezer-thumb'}), warnings, importSource: 'Deezer'};
  }

  async function youtube(link) {
    const key = youtubeKey();
    if (!key) {
      if (link.type === 'playlist') throw Error('Для списка и длительности треков YouTube / YouTube Music нужен ключ YouTube Data API. Добавьте его в «Подключениях» и вставьте ссылку снова.');
      const a = await json('https://www.youtube.com/oembed?' + new URLSearchParams({url: link.url, format: 'json'}));
      return {album: a.title, artist: a.author_name || '', cover: a.thumbnail_url || '', url: link.url, note: '', tracks: [{title: a.title, artist: a.author_name || '', seconds: 0}], warnings: ['Название и обложка загружены. YouTube не сообщает длительность без ключа API: добавьте его в «Подключениях» или задайте длительность вручную.'], importSource: 'YouTube oEmbed'};
    }
    const get = (kind, params) => json('https://www.googleapis.com/youtube/v3/' + kind + '?' + new URLSearchParams({...params, key}));
    let ids = [], title = '', artist = '', cover = '', mainImages = [], unavailable = 0;
    if (link.type === 'playlist') {
      const a = await get('playlists', {part: 'snippet', id: link.id});
      const snippet = a.items?.[0]?.snippet;
      if (!snippet) throw Error('YouTube: плейлист закрыт, удалён или недоступен');
      title = snippet.title; artist = snippet.channelTitle; mainImages = youtubeImages(snippet.thumbnails); cover = largestImageObject(mainImages)?.url || '';
      let pageToken = ''; const visited = new Set();
      for (let n = 0; n < 100; n++) {
        const r = await get('playlistItems', {part: 'contentDetails', playlistId: link.id, maxResults: '50', ...(pageToken ? {pageToken} : {})});
        for (const item of r.items || []) { if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId); else unavailable++; }
        limited(ids); pageToken = r.nextPageToken || '';
        if (!pageToken) break;
        if (visited.has(pageToken) || n === 99) throw Error('YouTube не отдал полный плейлист');
        visited.add(pageToken);
      }
    } else ids = [link.id];
    const tracks = [];
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50), r = await get('videos', {part: 'snippet,contentDetails', id: [...new Set(batch)].join(',')});
      const map = new Map((r.items || []).map(v => [v.id, v]));
      for (const id of batch) {
        const video = map.get(id);
        if (!video?.snippet) { unavailable++; continue; }
        tracks.push({title: video.snippet.title, artist: video.snippet.channelTitle || '', seconds: isoDuration(video.contentDetails?.duration), ...trackArtworkFields(largestImageObject(youtubeImages(video.snippet.thumbnails)))});
        if (link.type === 'track') { title = video.snippet.title; artist = video.snippet.channelTitle; mainImages = youtubeImages(video.snippet.thumbnails); cover = largestImageObject(mainImages)?.url || ''; }
      }
    }
    const coverAlternatives = mainImages.map(image => image.url).filter(url => url && url !== cover);
    return {album: title, artist, cover, coverAlternatives, url: link.url, note: '', tracks, customPosters: trackCoverPosters(tracks, {exclude: [cover, ...coverAlternatives], type: 'youtube-thumb'}), warnings: unavailable ? [`Пропущено закрытых или удалённых видео: ${unavailable}.`] : [], importSource: 'YouTube API'};
  }

  async function musicbrainz(link) {
    if (link.type === 'release') return musicbrainzAlbum(link.id);
    const data = await musicbrainzRequest(`https://musicbrainz.org/ws/2/release-group/${link.id}?fmt=json&inc=releases`);
    const releases = data.releases || [];
    if (releases.length !== 1) throw Error('В MusicBrainz есть несколько изданий альбома. Вставьте ссылку на конкретное издание (release) или выберите его через поиск.');
    return musicbrainzAlbum(releases[0].id);
  }

  async function importLink(input) {
    const link = await resolveMusicLink(input, request), cacheKey = JSON.stringify(link);
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return structuredClone(cached.data);
    const data = await ({spotify, apple, youtube, deezer, musicbrainz})[link.provider](link);
    if (!Array.isArray(data.tracks) || !data.tracks.length) throw Error('Сервис не вернул доступных треков. Проверьте, что альбом или плейлист открыт.');
    if (cache.size > 100) cache.clear();
    cache.set(cacheKey, {data, expires: Date.now() + 300000});
    return structuredClone(data);
  }
  return {importLink, spotifyPreview, apple, clearCache: () => cache.clear()};
}
