import test from 'node:test';
import assert from 'node:assert/strict';
import {bindToolNavigation,TOOL_PANELS} from '../src/tool-navigation.js';

test('switching tasks opens the matching group and updates the panel description',()=>{
 const groups=['content','images','design','layout'].map(id=>({id,open:id==='content'})),tabs={text:0,tracks:0,art:1,background:1,overlay:1,studio:2,decals:2,codes:2,layout:3,layers:3};
 const buttons=Object.entries(tabs).map(([tab,index])=>({dataset:{tab},closest:()=>groups[index]})),events={},title={},hint={};
 const nav={querySelectorAll:selector=>selector==='[data-tool-group]'?groups:buttons,addEventListener:(name,handler)=>events[name]=handler,contains:item=>buttons.includes(item)};
 const update=bindToolNavigation(nav,{title,hint});assert.equal(Object.keys(TOOL_PANELS).length,10);
 update('background');assert.deepEqual(groups.map(group=>group.open),[false,true,false,false]);assert.equal(title.textContent,'Фон');assert.ok(hint.textContent.includes('текстура'));
 events.click({target:{closest:()=>buttons.find(button=>button.dataset.tab==='layers')}});assert.deepEqual(groups.map(group=>group.open),[false,false,false,true]);assert.equal(title.textContent,'Слои');
 assert.equal(update('unknown'),false);
 groups[0].open=true;events.toggle({target:groups[0]});assert.deepEqual(groups.map(group=>group.open),[true,false,false,false]);
});
