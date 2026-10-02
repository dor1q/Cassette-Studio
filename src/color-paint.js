// The public editor's "rainbow" value means automatic black/white text.
// It is not a gradient. Its URL color codec has no gradient paint format.
const DEFAULT_PAINT='#000000';

function hexColor(value){
 if(typeof value!=='string')return null;
 const hex=value.trim().replace(/^#/,'');
 if(/^[0-9a-f]{6}$/i.test(hex))return '#'+hex.toLowerCase();
 if(/^[0-9a-f]{3}$/i.test(hex))return '#'+hex.toLowerCase().split('').map(c=>c+c).join('');
 return null;
}
function knownPaint(value){
 if(typeof value!=='string')return null;
 const token=value.trim();
 if(token==='rainbow')return 'rainbow';
 if(token==='clear'||token==='transparent')return 'transparent';
 return hexColor(token);
}

/** Preserve the automatic-color marker in saved projects; reject arbitrary CSS. */
export function normalizePaint(value,fallback=DEFAULT_PAINT){
 return knownPaint(value)??knownPaint(fallback)??DEFAULT_PAINT;
}

/** Match the original editor's weighted RGB brightness, including neutral cases. */
export function paintLuminance(value){
 const color=hexColor(value);
 if(!color)return .5;
 const [r,g,b]=color.slice(1).match(/../g).map(c=>parseInt(c,16));
 return (.299*r+.587*g+.114*b)/255;
}
export function isPaintDark(value){
 return !!hexColor(value)&&paintLuminance(value)<.4;
}
export function autoPaintColor(backgroundColor='#ffffff'){
 return isPaintDark(backgroundColor)?'#ffffff':'#000000';
}

/** Supply a real hex value to a native color input without losing saved markers. */
export function paintFallbackColor(value,fallback=DEFAULT_PAINT,backgroundColor='#ffffff'){
 const paint=normalizePaint(value,fallback);
 if(paint==='rainbow')return autoPaintColor(backgroundColor);
 if(paint==='transparent')return hexColor(fallback)??DEFAULT_PAINT;
 return paint;
}

/** Resolve paint against the current surface, keeping the renderer contract stable. */
export function svgPaint(value,id,options={}){
 const config=options&&typeof options==='object'?options:{};
 const paint=normalizePaint(value,config.fallback??DEFAULT_PAINT);
 const fill=paint==='rainbow'?autoPaintColor(config.backgroundColor??config.background??'#ffffff'):paint;
 return {fill,defs:''};
}
