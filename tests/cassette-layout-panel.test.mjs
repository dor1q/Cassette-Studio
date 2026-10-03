import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/model.js';
import {cassetteLayoutPanel} from '../src/cassette-layout-panel.js';
const helpers={field:(_label,key)=>`<input data-bind="layout.${key}">`,select:(_label,key,value)=>`<select data-bind="${key==='printArea'?'layout':'settings'}.${key}" data-value="${value}"></select>`,check:(_label,key)=>`<input data-bind="layout.${key}" type="checkbox">`,btn:(_label,action)=>`<button data-action="${action}"></button>`};
test('cassette area selector keeps custom label settings and hides unrelated fields for body printing',()=>{
 const p=createProject();let html=cassetteLayoutPanel(p,helpers);assert.match(html,/layout.printArea/);assert.match(html,/layout.labelW/);assert.match(html,/layout.holeOffsetX/);
 for(const area of ['body','full']){p.layout.printArea=area;html=cassetteLayoutPanel(p,helpers);assert.match(html,/100.58 × 64.22 мм/);assert.doesNotMatch(html,/layout.labelW|layout.holeOffsetX/);assert.match(html,/layout.sync/);assert.match(html,/standard-label/)}
});
