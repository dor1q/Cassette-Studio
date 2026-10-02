export function normalizedAlbumTitle(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[’‘`´]/g,"'").replace(/\s+/g,' ').trim()}
export function exactAlbumMatches(title,items){const wanted=normalizedAlbumTitle(title);return items.filter(item=>normalizedAlbumTitle(item.album)===wanted)}
export function uniqueExactAlbum(title,items){const matches=exactAlbumMatches(title,items);return matches.length===1?matches[0]:null}
