// Public Wild America kit asset names and native dimensions, without its renderer.
const dimensions={
 'crease-v-1':[180,4320],'crease-v-2':[180,4320],'crease-v-3':[180,4320],'crease-v-4':[125,4320],
 'crease-h-1':[2266,180],'crease-h-2':[2266,180],
 'edge-1':[4160,140],'edge-2':[2200,140],'edge-3':[2200,140],'edge-4':[2393,140],
 ...Object.fromEntries(Array.from({length:8},(_,i)=>['scuff-'+(i+1),[768,768]])),
 'scratch-1':[1100,1300],'scratch-2':[320,700],'scratch-3':[470,1000],'scratch-4':[300,800],
 'branch-1':[420,170],'branch-2':[420,200],'branch-3':[396,180],'branch-4':[396,280],
 'branch-5':[396,260],'branch-6':[396,360],'branch-7':[470,110],'branch-8':[326,110],'branch-9':[540,200],
 grain:[512,512],
};
export const WILD_REMIX_KIT=Object.freeze({id:'wild',version:1,name:'Wild America Remix',directory:'/_overlays/kits/wild',once:Object.freeze(['scratch-4']),parts:Object.freeze(Object.entries(dimensions).map(([id,[width,height]])=>Object.freeze({id,width,height})))});
export const REMIX_LEGACY_PART_IDS=Object.freeze(['edge-1','edge-2','crease-v-1','scuff-1','scratch-1','grain']);
export const REMIX_MAX_SOURCE_BYTES=15_000_000,REMIX_MAX_KIT_BYTES=64_000_000,REMIX_FETCH_CONCURRENCY=4;
export function remixPart(id){return WILD_REMIX_KIT.parts.find(part=>part.id===id)}
export function remixPartSelection(raw){
 const values=typeof raw==='string'?raw.split(','):raw;
 if(values==null)return WILD_REMIX_KIT.parts.map(part=>part.id);
 if(!Array.isArray(values)||!values.length||values.length>WILD_REMIX_KIT.parts.length)throw Error('Некорректный набор частей Remix');
 const names=[...new Set(values)];
 if(names.some(name=>typeof name!=='string'||!remixPart(name)))throw Error('Неизвестная часть Remix');
 return names;
}
