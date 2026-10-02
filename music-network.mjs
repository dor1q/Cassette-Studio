export class MusicServiceError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export function createServiceRequest({fetchImpl = globalThis.fetch, sleep = wait, timeout = 15000} = {}) {
  return async function request(url, options = {}) {
    const service = ({'open.spotify.com': 'Spotify', 'api.spotify.com': 'Spotify', 'accounts.spotify.com': 'Spotify', 'itunes.apple.com': 'Apple Music', 'www.googleapis.com': 'YouTube', 'api.deezer.com': 'Deezer', 'musicbrainz.org': 'MusicBrainz'})[new URL(url).hostname] || 'Музыкальный сервис';
    const attempts = !options.method || options.method === 'GET' ? 3 : 1;
    for (let n = 0; n < attempts; n++) {
      let response;
      try {
        response = await fetchImpl(url, {...options, signal: options.signal || AbortSignal.timeout(timeout), headers: {'User-Agent': 'CassetteStudio/2.2 (local personal editor)', ...options.headers}});
      } catch {
        if (options.signal?.aborted) throw new MusicServiceError('Загрузка отменена');
        if (n + 1 < attempts) { await sleep(500 * (n + 1)); continue; }
        throw new MusicServiceError(`${service}: нет соединения. Проверьте интернет и повторите импорт.`);
      }
      if (response.ok || options.redirect === 'manual' && [301, 302, 303, 307, 308].includes(response.status)) return response;
      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      const retryAfter = response.headers.get('retry-after');
      const delay = retryAfter ? Math.max(0, /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 500 * (n + 1);
      if (retryable && n + 1 < attempts && Number.isFinite(delay) && delay <= 5000) { await response.body?.cancel(); await sleep(delay); continue; }
      await response.body?.cancel();
      const detail = response.status === 429 ? 'слишком много запросов. Повторите импорт позже.'
        : response.status === 401 ? 'вход истёк. Переподключите сервис в «Подключениях».'
        : response.status === 403 ? 'сервис ограничил доступ к этим данным. Проверьте доступ и настройки подключения.'
        : response.status === 404 ? 'альбом, трек или плейлист не найден либо закрыт.'
        : `временно недоступен (ответ ${response.status}). Повторите импорт.`;
      throw new MusicServiceError(`${service}: ${detail}`, response.status);
    }
  };
}

export async function serviceJson(request, url, options) {
  const response = await request(url, options);
  try { return await response.json(); } catch { throw new MusicServiceError('Сервис вернул некорректные данные. Повторите импорт.'); }
}
