import test from 'node:test';
import assert from 'node:assert/strict';
import {canEditLayer,canRunLayerAction,centerLayerHorizontally} from '../src/editor-actions.js';
import {layerCenter} from '../src/transforms.js';

test('locked layers reject inspector edits and destructive actions until unlocked',()=>{
 const layer={locked:true};
 for(const property of ['x','y','w','rotation','text','visible','trackOptions','panelTargets'])assert.equal(canEditLayer(layer,property),false);
 for(const action of ['delete','center','align-left','forward','reset-crop','replace-image','visibility','google-fonts'])assert.equal(canRunLayerAction(layer,action),false);
 assert.equal(canEditLayer(layer,'locked'),true);
 assert.equal(canRunLayerAction(layer,'lock-layer'),true);
 assert.equal(canRunLayerAction(layer,'copy-other'),true);
 layer.locked=false;assert.equal(canEditLayer(layer,'x'),true);assert.equal(canRunLayerAction(layer,'delete'),true);
});

test('horizontal centering uses the visible center of a rotated layer',()=>{
 for(const rotation of [0,45,90,-45,180,270]){
  const layer={x:5,y:7,w:40,h:20,rotation};
  Object.assign(layer,centerLayerHorizontally(layer,88.6));
  assert.ok(Math.abs(layerCenter(layer).x-44.3)<1e-9);
  assert.equal(layer.y,7);
 }
});
