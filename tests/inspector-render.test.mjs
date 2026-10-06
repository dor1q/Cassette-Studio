import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {esc,makeLayer,panelRects,createProject} from '../src/model.js';
import {inspectorSection,bindInspectorSections} from '../src/inspector-sections.js';
import {groupFor} from '../src/flow-editing.js';
import {selectionFrame} from '../src/selection-edit.js';
import {cdContentControls} from '../src/cd-content-edit.js';

// Exercise the actual inspector renderer without a browser or music service.
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const renderer=app.slice(app.indexOf('function renderInspector(){'),app.indexOf('\nfunction add('));

function render(layer,{mode='jcard',project=createProject(),joinColumns=true,surface='outer'}={}){
 const controls=[];
 const inspector={
  innerHTML:'',addEventListener(){},
  querySelectorAll(){
   controls.length=0;
   for(const [,attributes] of this.innerHTML.matchAll(/<(?:input|select|textarea|button)\b([^>]*)>/g)){
    const dataset={};
    for(const [,name,value] of attributes.matchAll(/data-([\w-]+)="([^"]*)"/g))dataset[name.replace(/-([a-z])/g,(_,char)=>char.toUpperCase())]=value;
    controls.push({dataset,disabled:false});
   }
   return controls;
  }
 };
 const p=project,names=['current','$','prop','propCheck','propSelect','btn','fonts','p','esc','imageZoomControls','cropEditing','mode','panelRects','surface','albumStyleControls','syncImageZoom','inspectorSection','bindInspectorSections','editFrame','groupFor','joinColumns','cdContentControls'];
 const prop=(label,key,type='number',attrs='')=>`<label>${esc(label)}<${type==='textarea'?'textarea':'input'} data-prop="${key}" ${attrs}></label>`;
 const propCheck=(label,key)=>`<label><input type="checkbox" data-prop="${key}">${esc(label)}</label>`;
 const propSelect=(label,key,options)=>`<label>${esc(label)}<select data-prop="${key}">${options.map(([value,text])=>`<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select></label>`;
 const btn=(label,action)=>`<button data-action="${action}">${esc(label)}</button>`;
 const values=[()=>layer,()=>inspector,prop,propCheck,propSelect,btn,['Arial'],p,esc,
  ()=>'<input data-image-zoom type="range"><button data-action="reset-crop">Целиком</button>',false,mode,panelRects,surface,
  ()=>'<input data-album-style="font"><input data-album-style="size">',()=>{},inspectorSection,bindInspectorSections,()=>selectionFrame(p,layer,surface,joinColumns),groupFor,joinColumns,cdContentControls];
 new Function(...names,renderer+';renderInspector();')(...values);
 if(!controls.length)inspector.querySelectorAll();
 return {html:inspector.innerHTML,controls};
}

function section(html,key){return html.match(new RegExp(`<details[^>]*data-inspector-section="[^:"]+:${key}"[^>]*>([\\s\\S]*?)</details>`))?.[1]||''}
function properties(html){return [...html.matchAll(/data-prop="([^"]+)"/g)].map(match=>match[1])}

test('text style is immediately accessible and geometry remains available inside its section',()=>{
 const {html}=render(makeLayer('text'));
 for(const key of ['source','text','font','size','color','align','bold','italic','uppercase','autoFit']){
  assert.ok(html.indexOf(`data-prop="${key}"`)<html.indexOf('data-inspector-section="text:position"'),key);
 }
 for(const key of ['x','y','w','h','rotation'])assert.match(section(html,'position'),new RegExp(`data-prop="${key}"`));
 for(const key of ['opacity','fontWeight','fontStretch','lineHeight','spacing','smallcaps','outline','outlineColor','shadow','shadowColor'])assert.match(section(html,'effects'),new RegExp(`data-prop="${key}"`));
 assert.equal(properties(html).length,new Set(properties(html)).size);
 assert.match(section(html,'position'),/data-action="copy-other"/);
});

test('background scale and fit are primary while image effects and panel masks stay grouped',()=>{
 const {html}=render(makeLayer('image',{category:'background'}));
 const position=html.indexOf('data-inspector-section="image:position"');
 for(const key of ['data-image-zoom','data-action="reset-crop"','data-prop="fit"','data-action="replace-image"','data-action="crop-edit"'])assert.ok(html.indexOf(key)<position,key);
 for(const key of ['blendMode','tintMode','tintColor','flipX','flipY','imageTile','tileWidth','tileHeight','blur'])assert.match(section(html,'effects'),new RegExp(`data-prop="${key}"`));
 for(const key of ['cropX','cropY','cropRotation'])assert.match(section(html,'position'),new RegExp(`data-prop="${key}"`));
 assert.match(section(html,'panels'),/data-layer-panel="0"/);
 assert.doesNotMatch(render(makeLayer('image'),{mode:'label'}).html,/data-layer-panel=/);
 assert.equal(properties(html).length,new Set(properties(html)).size);
});

test('flow content and independent spine album styles keep their existing controls',()=>{
 const flow=render(makeLayer('text',{source:'referenceContents',referenceFlow:true})).html;
 for(const key of ['hideArtist','hideAlbum','hideA','hideB'])assert.match(section(flow,'contents'),new RegExp(`data-prop="${key}"`));
 for(const key of ['numbers','artists','durations','bullets','inlineTracks','showSide','hideTracks','showProduction','sideText','sideA','sideB'])assert.match(section(flow,'contents'),new RegExp(`data-track-option="${key}"`));
 assert.match(section(flow,'contents'),/data-action="reset-track-options"/);
 const spine=render(makeLayer('text',{source:'spine',referenceSpine:true})).html;
 assert.match(section(spine,'contents'),/data-prop="spineTwoLines"/);
 assert.match(section(spine,'album'),/data-album-style="font"/);
});

test('code editing is primary and locked layers retain only authorized edit actions',()=>{
 for(const type of ['qr','barcode']){
  const {html,controls}=render(makeLayer(type,{locked:true}));
  for(const key of ['text','color','transparentCode',...(type==='barcode'?['barcodeType']:[])])assert.ok(html.indexOf(`data-prop="${key}"`)<html.indexOf(`data-inspector-section="${type}:position"`));
  assert.ok(controls.length>10);
  for(const control of controls)assert.equal(control.disabled,control.dataset.prop!=='locked'&&!['duplicate','copy-other'].includes(control.dataset.action));
 }
});

test('empty selection keeps the selection hint without rendering any controls',()=>{
 const {html}=render(null);assert.match(html,/Выберите элемент/);assert.doesNotMatch(html,/data-prop=/);
});

test('actual CD contents inspector shows field visibility and no cassette A/B controls',()=>{
 const p=createProject(),layer=p.surfaces.cdFront.find(layer=>layer.source==='cdContents');
 const html=render(layer,{mode:'cd-insert',project:p,surface:'cdFront'}).html,content=section(html,'contents');
 for(const key of ['hideArtist','hideAlbum','hideTracks','hideLyrics','showProduction'])assert.match(content,new RegExp(`data-track-option="${key}"`));
 assert.doesNotMatch(content,/data-track-option="(?:sideA|sideB|sideText|showSide)"/);
 assert.match(html,/data-prop="font"/);assert.match(html,/data-prop="x"/);
});

test('a locked reverse CD column disables content without disabling current typography',()=>{
 const p=createProject(),layer=p.surfaces.cdFront.find(layer=>layer.source==='cdContents');p.surfaces.cdInside.find(layer=>layer.source==='cdContents').locked=true;
 const {html,controls}=render(layer,{mode:'cd-insert',project:p,surface:'cdFront'});
 assert.match(section(html,'contents'),/<fieldset[^>]*disabled/);
 assert.equal(controls.find(control=>control.dataset.prop==='font').disabled,false);
 assert.equal(controls.find(control=>control.dataset.prop==='x').disabled,false);
});
