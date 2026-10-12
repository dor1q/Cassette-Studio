const LABEL_FIELDS=new Set(['artist','album','sideText','side','tracks','note','production','stereo']);

// Standard fields on the public cassette template are plain metadata strings.
// Keep the rule narrow so custom captions and the J-card contents retain formatting.
export function cassetteStandardLiteralText(layer,surface){
 if(layer.type!=='text')return false;
 if(surface==='labelA'||surface==='labelB')return LABEL_FIELDS.has(layer.source);
 if(surface!=='outer'&&surface!=='inner')return false;
 return layer.referenceSpine===true||layer.source==='flapTracks'||layer.source==='flapProduction'||
  layer.source==='stereo'&&layer.category==='referenceStereo';
}
