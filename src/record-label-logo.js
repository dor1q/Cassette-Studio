import logos from '../studio-logos.json' with {type: 'json'};
import fallback from '../studio-logo-fallback.json' with {type: 'json'};
import {recordLabelMetadata,normalizeRecordLabels} from '../music-labels.mjs';
import {makeLayer,dimensions} from './model.js';
import {REFERENCE_UNIT} from './reference-format.js';
import {loadReferenceImage,referenceImageDimensions,referenceImageSource} from './reference-image-source.js';
import {paintFallbackColor,autoPaintColor} from './color-paint.js';

const DEFAULT_LOGO=logos.find(logo=>logo.name==='Lo-Fi Stereo');
// Explicit brand aliases only. Similar-looking names and an artist's other
// releases must never determine the label of this particular release.
const ALIASES={
 'Sony Music':['Sony Music Entertainment','Sony Music Entertainment UK'],
 'Columbia Records':['Columbia'],
 'Warner Records':['Warner Bros. Records','Warner Bros Records'],
 'Atlantic Records':['Atlantic','Atlantic Recording Corporation'],
 'Universal Music':['Universal Music Group','Universal Music Operations'],
 'Capitol Records':['Capitol'], 'RCA Records':['RCA','RCA Records Label'],
 'Interscope Records':['Interscope'], 'Def Jam Recordings':['Def Jam'],
 'Republic Records':['Republic'], 'Motown Records':['Motown'],
 'Island Records':['Island'], 'Elektra Records':['Elektra'],
 'Virgin Records':['Virgin'], 'Parlophone':['Parlophone Records'],
 'Polydor Records':['Polydor','Polydor Ltd. (UK)'],
 'Decca Records':['Decca'], 'Geffen Records':['Geffen'],
 'XL Recordings':['XL'], 'Epitaph Records':['Epitaph'],
 'Aftermath':['Aftermath Entertainment','Aftermath Records'],
 'Death Row Records':['Death Row'], 'Rimas Entertainment':['Rimas'],
 'Arista Records':['Arista'], 'Stmpd Rcrds':['STMPD Records'],
 'Factory Records':['Factory'], 'Jeepster Records':['Jeepster'],
 'Carpark Records':['Carpark'], 'A&M Records':['A&M','A and M Records'],
 'Philips Records':['Philips'], 'Liberty Records':['Liberty'],
 'Michael Jackson':['MJJ Productions','MJJ Music'], 'Ray Bull':['Raybull']
};
const normalizedName=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/&/g,' and ').replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+(?:incorporated|inc|limited|ltd|llc|corp|corporation)$/,'').trim();
const candidates=new Map();
for(const logo of logos.filter(logo=>logo.path.startsWith('/_music-company-logos/'))){
 for(const name of [logo.name,...(ALIASES[logo.name]||[])]){
  const key=normalizedName(name);if(!candidates.has(key))candidates.set(key,new Map());candidates.get(key).set(logo.path,logo);
 }
}

export function matchRecordLabelLogo(album={}){
 const labels=normalizeRecordLabels(album.recordLabels??album.recordLabel),matches=new Map();
 for(const label of labels){
  // Match the whole name before examining a list of co-labels (A&M is a name).
  const exact=candidates.get(normalizedName(label));
  if(exact){for(const [key,logo]of exact)matches.set(key,logo);continue}
  for(const part of label.split(/\s*(?:\/|;|\||\s+&\s+|\s+and\s+)\s*/i)){
   const found=candidates.get(normalizedName(part));if(found)for(const [key,logo]of found)matches.set(key,logo);
  }
 }
 const ambiguous=matches.size>1,matched=matches.size===1,logo=matched?[...matches.values()][0]:DEFAULT_LOGO;
 return {logo,labels,matched,ambiguous,reason:ambiguous?'ambiguous':matched?'matched':labels.length?'unavailable':'not-supplied'};
}

export async function prepareRecordLabelLogo(album,request,{cached=[],getDimensions=referenceImageDimensions}={}){
 const match=matchRecordLabelLogo(album),metadata=recordLabelMetadata(match.labels,album?.recordLabelSource||album?.importSource||''),warnings=[];
 if(match.ambiguous)warnings.push('У альбома указано несколько лейблов с разными логотипами. Выберите логотип вручную; пока используется Lo-Fi Stereo.');
 else if(match.reason==='unavailable')warnings.push('Для лейбла «'+match.labels.join(', ')+'» нет логотипа в библиотеке. Пока используется Lo-Fi Stereo.');
 let logo=match.logo,asset=null;
 try{asset=await loadReferenceImage(logo.path,request,getDimensions,cached)}catch{
  if(match.matched){
   logo=DEFAULT_LOGO;
   try{asset=await loadReferenceImage(logo.path,request,getDimensions,cached)}catch{}
   warnings.push('Логотип лейбла недоступен. Пока используется Lo-Fi Stereo.');
  }
  if(!asset){logo=DEFAULT_LOGO;asset={src:fallback.src,w:fallback.w,h:fallback.h,key:fallback.source}}
 }
 return {asset,logo,metadata,warnings,matched:match.matched&&logo===match.logo,reason:match.reason};
}

export function recordLabelLogoFrame(project,surface,asset){
 const {w:W,h:H}=dimensions(project,surface);
 if(surface.startsWith('label')){const w=W*.12,h=asset?w*asset.h/asset.w:w;return {x:5*W/251.16,y:H*.55-h/2,w,h}}
 const size=220*REFERENCE_UNIT*project.layout.spine/(300*REFERENCE_UNIT);
 return {x:project.layout.flap+(project.layout.spine-size)/2,y:26*REFERENCE_UNIT,w:size,h:size,cropRotation:90};
}
const logoLayer=layer=>layer.category==='studio'||['referenceLogo','referenceSpineLogo'].includes(layer.source);
const editableAutomatic=layer=>layer.automaticRecordLabelLogo===true&&!layer.referenceBlockCopy&&!layer.locked&&layer.visible!==false&&layer.src===layer.automaticRecordLabelLogoSrc;
const logoColor=(project,surface)=>{
 const bg=project.settings[surface==='labelB'?'bgB':surface==='inner'?'bgInside':'bg'];
 return paintFallbackColor(project.settings.fg,autoPaintColor(bg),bg);
};
function reserveDefaultSpineSpace(project,logo){
 const H=dimensions(project,'outer').h,l=project.surfaces.outer.find(layer=>layer.type==='text'&&layer.source==='spine'),same=(a,b)=>Math.abs(a-b)<1e-7;
 // The stock local layout starts the title at the top. Reference layouts center
 // it, and manually moved/styled/locked titles remain entirely authoritative.
 if(!l||l.referenceSpine||l.locked||l.rotation!==90||l.align!=='left'||l.font!=='Arial'||l.size!==3||!same(l.x,project.layout.flap+project.layout.spine/2+2)||!same(l.y,5)||!same(l.w,H-10)||!same(l.h,5))return;
 l.y=logo.y+logo.h+2;l.w=Math.max(1,H-l.y-5);
}

export function updateRecordLabelLogoColors(project){
 for(const [surface,layers]of Object.entries(project.surfaces))for(const layer of layers){
  if(!editableAutomatic(layer)||layer.tintMode!=='solid'||layer.tintColor!==layer.automaticRecordLabelLogoColor)continue;
  layer.tintColor=logoColor(project,surface);layer.automaticRecordLabelLogoColor=layer.tintColor;
 }
}

export function applyRecordLabelLogo(project,prepared,{mode='jcard',target='both',surfaces}={}){
 if(!['A','B','both'].includes(target))throw Error('Выберите сторону A или B');
 const metadata=recordLabelMetadata(prepared?.metadata?.recordLabels,prepared?.metadata?.recordLabelSource);
 if(target==='both')Object.assign(project.data,metadata);
 const selected=surfaces||(mode==='label'?(target==='both'||project.layout.sync?['labelA','labelB']:['label'+target]):target==='both'?['outer']:[]),updated=[],skipped=[];
 if(project.settings.referenceLogoHidden||!prepared?.asset)return {updated,skipped:selected};
 if(mode==='label'&&project.layout.sync&&selected.length>1&&selected.some(surface=>(project.surfaces[surface]||[]).filter(logoLayer).some(layer=>!editableAutomatic(layer))))return {updated,skipped:selected};
 for(const surface of selected){
  const layers=project.surfaces[surface];if(!Array.isArray(layers))continue;
  const existing=layers.filter(logoLayer),automatic=existing.find(editableAutomatic);
  // A manually uploaded/replaced logo, an explicitly restored URL logo, a hidden
  // logo or a locked logo is a design choice, even if another import is automatic.
  if(existing.some(layer=>!editableAutomatic(layer))){skipped.push(surface);continue}
  const props={src:prepared.asset.src,referenceAssetKey:referenceImageSource(prepared.logo.path),name:'Логотип · '+prepared.logo.name,missingReference:false,automaticRecordLabelLogo:true,automaticRecordLabelLogoSrc:prepared.asset.src,recordLabelLogoName:prepared.logo.name,recordLabelLogoMatched:!!prepared.matched,recordLabelLogoLabels:[...metadata.recordLabels]};
  if(automatic){Object.assign(automatic,props);updated.push(surface);continue}
  const tintColor=logoColor(project,surface);
  const layer=makeLayer('image',{category:'studio',source:surface.startsWith('label')?'referenceLogo':'referenceSpineLogo',fit:'meet',tintMode:'solid',tintColor,automaticRecordLabelLogoColor:tintColor,...recordLabelLogoFrame(project,surface,prepared.asset),...props});
  if(surface==='outer')reserveDefaultSpineSpace(project,layer);
  const at=layers.findIndex(layer=>layer.referenceDecalLayer==='over'||['referenceText','referenceCode','spotifyCode'].includes(layer.category));
  layers.splice(at<0?layers.length:at,0,layer);updated.push(surface);
 }
 updateRecordLabelLogoColors(project);return {updated,skipped};
}
