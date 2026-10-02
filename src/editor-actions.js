import {layerCenter} from './transforms.js';

const lockedActions = new Set([
 'delete','visibility','forward','backward','center','align-left','align-right',
 'align-top','align-bottom','align-middle','rotate-left','rotate-right',
 'reset-crop','crop-edit','replace-image','google-fonts','font',
 'reset-track-options','shuffle-texture','edit-rental','image-zoom-out','image-zoom-in'
]);

export function canEditLayer(layer,property){
 return !!layer && (!layer.locked || property==='locked');
}

export function canRunLayerAction(layer,action){
 return !layer?.locked || !lockedActions.has(action);
}

export function centerLayerHorizontally(layer,width){
 return {x:layer.x+width/2-layerCenter(layer).x};
}
