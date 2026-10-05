import {albumArtLayer} from './album-art.js';

export function captureImageImportTarget(project,surface,{kind='art',revision=0,mode='jcard',selected='',tab='art'}={}){
 const layer=kind==='replace'?project.surfaces[surface]?.find(item=>item.id===selected):kind==='art'?albumArtLayer(project,surface):null;
 if(kind==='replace'&&layer?.type!=='image')throw Error('Выберите картинку для замены.');
 const target={project,surface,kind,revision,mode,tab,layerId:layer?.id||''};
 assertImageImportTarget(target,project,surface,mode,revision);return target;
}

export function assertImageImportTarget(target,project,surface,mode,revision){
 if(!target||target.project!==project||target.surface!==surface||target.mode!==mode||target.revision!==revision)throw Error('За время загрузки макет изменился. Повторите добавление изображения.');
 const layer=target.layerId?project.surfaces[surface]?.find(item=>item.id===target.layerId):null;
 if(target.layerId&&layer?.type!=='image')throw Error('Картинка для замены больше не существует.');
 if(layer?.locked)throw Error('Картинка закреплена. Сначала снимите закрепление.');
 return layer;
}
