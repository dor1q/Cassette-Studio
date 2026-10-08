// CD insert content shares one ordered text stream across its printed panels.
// Keep formatting options local to the block and leave the album data intact.
export function cdContentsText(project,layer,trackText){
 const data=project.data,option=key=>layer.trackOptions?.[key]??layer[key]??project.settings[key];
 const artist=option('hideArtist')?'':String(data.artist||'').trim(),album=option('hideAlbum')?'':String(data.album||'').trim();
 const separator=project.settings.referenceSeparator??'-';
 const title=artist&&album?artist+(separator==='\u2002'?separator:' '+separator+' ')+album:artist||album;
 let tracks=option('hideTracks')?'':String(trackText||'');
 if(tracks&&!option('inlineTracks')&&!option('numbers')&&option('bullets'))tracks=tracks.split('\n').map(line=>'- '+line).join('\n');
 return [title?'## '+title:'',!option('hideLyrics')&&data.lyrics,tracks?'### Tracklist\n'+tracks:'',option('showProduction')!==false&&data.production].filter(Boolean).join('\n\n');
}
