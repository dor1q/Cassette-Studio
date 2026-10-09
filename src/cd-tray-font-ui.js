export function cdTrayFontState(project,surface){
 if(surface!=='cdTray')return null;
 const family=(project.surfaces[surface]||[]).filter(layer=>layer.source==='cdTracks'&&layer.referenceCDTrayTrack&&!layer.referenceBlockCopy).sort((a,b)=>(a.cdColumnIndex||0)-(b.cdColumnIndex||0));
 const layer=family[0];if(!layer)return null;
 const automatic=peer=>peer.referenceCDTrayRequestedFontScale===75&&Math.abs(peer.size-peer.referenceCDTrayFontSize)<.0001;
 const mixed=family.some(peer=>automatic(peer)!==automatic(layer)||Math.abs(peer.size-layer.size)>.0001);
 return {layer,locked:family.some(peer=>peer.locked),automatic:family.every(automatic),mixed};
}
export function cdTrayFontHint(state){return state?state.mixed?'У колонок разные размеры или режимы подбора':(state.automatic?'Размер треклиста подобран автоматически':'Размер треклиста задан вручную')+' · '+Number(state.layer.size.toFixed(3))+' мм':''}
export function cdTrayFontInspectorControls(project,layer,surface,{btn,propCheck}){
 if(surface!=='cdTray'||layer.source!=='cdTracks'||!layer.referenceCDTrayTrack||layer.referenceBlockCopy)return propCheck('Автоподбор размера','autoFit');
 const state=cdTrayFontState(project,surface);
 return '<p class="hint">'+cdTrayFontHint(state)+'</p>'+btn('Подобрать размер треклиста автоматически','cd-tray-auto-font','class="wide" '+(state.locked?'disabled':''))+'<p class="hint">Размер подбирается по длине списка. Введите размер в миллиметрах, чтобы настроить его вручную.</p>';
}
