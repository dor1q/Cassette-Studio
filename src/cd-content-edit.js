const options=new Set(['hideArtist','hideAlbum','hideTracks','hideLyrics','numbers','artists','durations','bullets','inlineTracks','showProduction']);
const hideOptions=['hideArtist','hideAlbum','hideTracks','hideLyrics'];

export function cdContentPeers(project,layer,surface){
 if(!layer||layer.type!=='text'||!['cdContents','cdTracks'].includes(layer.source))return [];
 if(layer.source==='cdTracks')return surface.startsWith('cdTray')&&(layer.cdTrayTrackFlow||layer.cdTemplate)?[...new Set([layer,...(project.surfaces[surface]||[]).filter(peer=>peer.type==='text'&&peer.source==='cdTracks'&&(peer.cdTrayTrackFlow||peer.cdTemplate))])]:[layer];
 if(!layer.referenceCDContent&&!layer.cdContentFlow)return [layer];
 const family=surface.startsWith('cdTray')?['cdTray','cdTrayInside']:['cdFront','cdInside'];
 const marker=layer.referenceCDContent?'referenceCDContent':'cdContentFlow';
 return [...new Set([layer,...family.flatMap(face=>project.surfaces[face]||[]).filter(peer=>peer.type==='text'&&peer.source==='cdContents'&&peer[marker])])];
}
export function canEditCDContent(project,layer,surface){
 const peers=cdContentPeers(project,layer,surface);return peers.length>0&&peers.every(peer=>!peer.locked);
}
function targets(project,layer,surface){
 const peers=cdContentPeers(project,layer,surface);
 if(layer.referenceCDContent&&project.referenceCDContentTemplate)peers.push(project.referenceCDContentTemplate);
 return peers;
}
export function setCDContentOption(project,layer,surface,key,value){
 if(!options.has(key)||typeof value!=='boolean'||!canEditCDContent(project,layer,surface))return false;
 for(const peer of targets(project,layer,surface)){
  peer.trackOptions={...peer.trackOptions,[key]:value};
  // Old shared links stored cassette A/B visibility. A CD control now changes
  // its complete ordered list, while untouched imported visibility is retained.
  if(key==='hideTracks'){delete peer.hideA;delete peer.hideB}
 }
 return true;
}
export function resetCDContentOptions(project,layer,surface){
 if(!canEditCDContent(project,layer,surface))return false;
 for(const peer of targets(project,layer,surface)){
  delete peer.trackOptions;
  for(const key of [...hideOptions,'hideA','hideB'])delete peer[key];
 }
 return true;
}
export function cdContentControls(project,layer,surface,{btn}){
 const all=cdContentPeers(project,layer,surface),editable=canEditCDContent(project,layer,surface);
 const value=key=>layer.trackOptions?.[key]??layer[key]??project.settings[key]??(key==='hideTracks'?layer.hideA&&layer.hideB:key==='showProduction'&&layer.source==='cdContents');
 const check=(key,label)=>`<label class="inlinecheck"><input type="checkbox" data-track-option="${key}" ${value(key)?'checked':''}>${label}</label>`;
 let html='<p class="hint">'+(all.length>1?(surface.startsWith('cdTray')?'Настройки треков меняются во всех колонках этой стороны. Внутренняя сторона настраивается отдельно.':'Содержимое меняется во всех колонках вкладыша, включая сохранённый оборот.')+' Шрифт и положение настраиваются у выбранного блока.':'Настройки содержимого выбранного блока CD.')+'</p>';
 if(!editable)html+='<p class="hint">Одна из колонок закреплена. Снимите закрепление в «Слоях», чтобы изменить общее содержимое.</p>';
 html+=`<fieldset class="cd-content-options" ${editable?'':'disabled'}><legend>Показывать в блоке</legend>`;
 if(layer.source==='cdContents')html+=check('hideArtist','Скрыть исполнителя')+check('hideAlbum','Скрыть альбом')+check('hideLyrics','Скрыть тексты песен');
 html+=check('hideTracks','Скрыть треклист')+check('showProduction','Выходные данные')+'</fieldset>';
 html+=`<fieldset class="cd-content-options" ${editable?'':'disabled'}><legend>Оформление треков</legend>`;
 for(const [key,label]of [['numbers','Номера'],['artists','Исполнители треков'],['durations','Длительность'],['bullets','Разделители'],['inlineTracks','Треки в строку']])html+=check(key,label);
 return html+btn('Вернуть общие настройки','reset-track-options','class="wide"')+'</fieldset>';
}
