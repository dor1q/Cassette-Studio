// The public J-card renderer distinguishes playlist-style source metadata from
// album IDs. A later artwork lookup does not change that original distinction.
export function referenceJCardPlaylistSpineFromParams(params){
 return !!(params.get('playlistUrl')||['spotify','youtube'].includes(params.get('source')));
}

export function referenceJCardSpineMetric(project){
 const artist=String(project.data?.artist||''),album=String(project.data?.album||'');
 return project.referenceJCardPlaylistSpine===true?album:artist?artist+' '+album:album;
}

export function referenceJCardSpineText(project,layer){
 const artist=layer.hideArtist?'':String(project.data?.artist||''),album=layer.hideAlbum?'':String(project.data?.album||'');
 if(layer.spineTwoLines&&artist&&album)return artist+'\n'+album;
 return project.referenceJCardPlaylistSpine===true?album:[artist,album].filter(Boolean).join(' ');
}
