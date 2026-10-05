const FORMATS={
 jcard:{title:'J-card',surfaces:['outer','inner']},
 label:{title:'Cassette Label',surfaces:['labelA','labelB']},
 'cd-label':{title:'CD Label',surfaces:['cdLabel']},
 'cd-insert':{title:'CD Insert',surfaces:['cdFront','cdInside']},
 'cd-tray':{title:'CD Tray',surfaces:['cdTray','cdTrayInside']}
};
export const EDITOR_MODES=Object.keys(FORMATS);
export const EDITOR_SURFACES=Object.values(FORMATS).flatMap(format=>format.surfaces);
export function normalizeEditorMode(value,fallback='jcard'){const aliases={'cassette-label':'label',cassette:'label',cd:'cd-label',cdlabel:'cd-label',cdinsert:'cd-insert',cdtray:'cd-tray'};value=aliases[value]||value;return Object.hasOwn(FORMATS,value)?value:Object.hasOwn(FORMATS,fallback)?fallback:'jcard'}
export const isCDMode=mode=>['cd-label','cd-insert','cd-tray'].includes(mode);
export const isCDSurface=surface=>['cdLabel','cdFront','cdInside','cdTray','cdTrayInside'].includes(surface);
export const modeTitle=mode=>FORMATS[normalizeEditorMode(mode)].title;
export const modeDefaultSurface=mode=>FORMATS[normalizeEditorMode(mode)].surfaces[0];
export function modeSurfaces(project,mode=project?.editorMode,selection){
 const surfaces=[...FORMATS[normalizeEditorMode(mode)].surfaces];
 if(selection==='front')return surfaces.slice(0,1);
 if(selection==='back')return surfaces.slice(1);
 return surfaces.includes(selection)?[selection]:surfaces;
}
