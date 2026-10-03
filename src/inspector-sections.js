import {esc} from './model.js';

// Open sections are a workspace preference, separate from the saved artwork.
const openSections=new Map();
const boundInspectors=new WeakSet();

export function inspectorSection(type,key,title,content,{open=false}={}){
 const stateKey=type+':'+key;
 const expanded=openSections.has(stateKey)?openSections.get(stateKey):open;
 return `<details class="inspector-section" data-inspector-section="${esc(stateKey)}"${expanded?' open':''}><summary>${esc(title)}</summary><div class="inspector-section-body">${content}</div></details>`;
}

export function rememberInspectorSection(section){
 if(section?.tagName!=='DETAILS'||!section.dataset?.inspectorSection)return false;
 openSections.set(section.dataset.inspectorSection,Boolean(section.open));
 return true;
}

export function bindInspectorSections(inspector){
 if(boundInspectors.has(inspector))return;
 boundInspectors.add(inspector);
 // Native toggle events do not bubble. Capture survives innerHTML rebuilds.
 inspector.addEventListener('toggle',event=>rememberInspectorSection(event.target),true);
}
