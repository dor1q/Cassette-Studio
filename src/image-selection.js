import {albumArtLayer} from './album-art.js';

export function selectableImages(project,surface){
 return (project.surfaces[surface]||[]).filter(layer=>layer.type==='image'&&layer.visible);
}

export function preferredArtwork(project,surface){
 const images=selectableImages(project,surface),cover=albumArtLayer(project,surface);
 return images.includes(cover)?cover:[...images].reverse().find(layer=>layer.category==='background')||images.at(-1);
}

export function imageSelectionOptions(project,surface,selected){
 const images=selectableImages(project,surface);
 return {images,selected:images.some(layer=>layer.id===selected)?selected:''};
}
