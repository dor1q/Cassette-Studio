import {normalizePaint} from './color-paint.js';

const defaults={x:0,y:0,w:1,h:1,rotation:0,opacity:1,visible:true,locked:false,color:'#000000',font:'Arial',size:3,bold:false,fontWeight:0,fontStretch:100,italic:false,uppercase:false,smallcaps:false,align:'left',lineHeight:1.4,spacing:0,outline:0,outlineColor:'#000000',shadow:0,shadowColor:'#000000',autoFit:false,text:''};
const booleanOptions=['numbers','artists','durations','bullets','inlineTracks','showSide','showProduction','hideArtist','hideAlbum','hideTracks','hideLyrics'];
const hiddenFlags=['hideArtist','hideAlbum','hideTracks','hideLyrics','hideA','hideB','referenceOwnColor','referenceHiddenByTextColor'];
const bounded=(value,fallback,min,max)=>{const number=Number(value);return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback};

// Cover-only inserts keep a text template even while they have no content
// blocks. Restrict that future layer to the same text bounds as active layers.
export function sanitizeReferenceCDContentTemplate(project){
 if(!Object.hasOwn(project,'referenceCDContentTemplate'))return project;
 const raw=project.referenceCDContentTemplate;
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.type!=='text'||raw.source!=='cdContents'){
  delete project.referenceCDContentTemplate;return project;
 }
 const clean={...defaults,type:'text',source:'cdContents',referenceCDContent:true,name:typeof raw.name==='string'?raw.name.slice(0,200):'Содержание CD'};
 if(typeof raw.id==='string'&&/^[a-z0-9-]{1,100}$/i.test(raw.id))clean.id=raw.id;
 for(const [key,min,max]of [['x',-2000,2000],['y',-2000,2000],['rotation',-2000,2000],['w',.1,1500],['h',.1,1500],['size',.1,100],['fontStretch',50,200],['opacity',0,1],['lineHeight',.5,4],['spacing',-1,10],['outline',0,2],['shadow',0,5]])clean[key]=bounded(raw[key]??defaults[key],defaults[key],min,max);
 clean.fontWeight=raw.fontWeight?bounded(raw.fontWeight,0,100,900):0;
 clean.font=typeof raw.font==='string'?raw.font.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200)||'Arial':'Arial';
 clean.text=typeof raw.text==='string'?raw.text.slice(0,100000):'';
 clean.color=normalizePaint(raw.color,defaults.color);
 for(const key of ['outlineColor','shadowColor'])clean[key]=/^#[a-f0-9]{6}$/i.test(raw[key]||'')?raw[key]:'#000000';
 for(const key of ['visible','locked','bold','italic','uppercase','smallcaps','autoFit'])clean[key]=typeof raw[key]==='boolean'?raw[key]:defaults[key];
 clean.align=['left','center','right'].includes(raw.align)?raw.align:'left';
 for(const key of hiddenFlags)if(typeof raw[key]==='boolean')clean[key]=raw[key];
 if(raw.trackOptions&&typeof raw.trackOptions==='object'&&!Array.isArray(raw.trackOptions)){
  clean.trackOptions={};
  for(const key of booleanOptions)if(typeof raw.trackOptions[key]==='boolean')clean.trackOptions[key]=raw.trackOptions[key];
 }
 project.referenceCDContentTemplate=clean;return project;
}
