import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/model.js';
import {exportControlState,exportDialogHtml,bindExportDialog} from '../src/export-dialog.js';
test('export options expose templates for the actual cassette area and J-card size',()=>{
 const p=createProject();let html=exportDialogHtml(p,{mode:'label'});assert.match(html,/12up-trim/);assert.doesNotMatch(html,/chalkpit-cassette-4up/);
 p.layout.printArea='full';html=exportDialogHtml(p,{mode:'label'});assert.match(html,/chalkpit-cassette-4up/);assert.doesNotMatch(html,/value="12up"/);
 p.layout.flap=25.4;p.layout.spine=12.7;p.layout.flapShape='standard';p.layout.panels=3;html=exportDialogHtml(p);assert.match(html,/chalkpit-jcard-8up/);p.layout.panels=4;assert.doesNotMatch(exportDialogHtml(p),/chalkpit-jcard-8up/);
});
test('fixed production controls reset offsets and normal settings return when leaving the template',()=>{
 const p=createProject(),values={exportSheet:'auto',exportSelection:'all',exportPaper:'a4',exportBleed:'2',exportDpi:'150',exportOffsetX:'3',exportOffsetY:'-2',exportCopies:'1'};
 const fields=Object.fromEntries(['exportSheet','exportSelection','exportPaper','exportBleed','exportDpi','exportOffsetX','exportOffsetY','exportCopies','exportGuides','exportDuplex','exportQuantityLabel','exportLayoutHint'].map(id=>[id,{value:values[id]||'',checked:true,disabled:false}]));
 bindExportDialog(p,{get:id=>fields[id]});fields.exportSheet.value='chalkpit-jcard';fields.exportSheet.onchange();assert.equal(fields.exportBleed.value,'3.175');assert.equal(fields.exportDpi.value,'600');assert.equal(fields.exportOffsetX.value,'0');assert.equal(fields.exportPaper.disabled,true);
 fields.exportSheet.value='auto';fields.exportSheet.onchange();assert.equal(fields.exportBleed.value,'2');assert.equal(fields.exportDpi.value,'150');assert.equal(fields.exportPaper.disabled,false);assert.equal(fields.exportGuides.checked,true);assert.equal(fields.exportOffsetX.value,'3');assert.equal(fields.exportOffsetY.value,'-2');
});
test('the front-only production sheet shows its actual side and restores the previous selection',()=>{
 const p=createProject();p.layout.double=true;
 const fields=Object.fromEntries(['exportSheet','exportSelection','exportPaper','exportBleed','exportDpi','exportOffsetX','exportOffsetY','exportCopies','exportGuides','exportDuplex','exportQuantityLabel','exportLayoutHint'].map(id=>[id,{value:'',checked:true,disabled:false}]));
 Object.assign(fields.exportSheet,{value:'auto'});Object.assign(fields.exportSelection,{value:'current',options:[{textContent:'Лицевая и оборот'},{textContent:'Только текущая'}]});
 bindExportDialog(p,{get:id=>fields[id]});fields.exportSheet.value='chalkpit-jcard-8up';fields.exportSheet.onchange();
 assert.equal(fields.exportSelection.disabled,true);assert.equal(fields.exportSelection.value,'all');assert.equal(fields.exportSelection.options[0].textContent,'Только лицевая');assert.equal(fields.exportDuplex.disabled,true);
 fields.exportSheet.value='auto';fields.exportSheet.onchange();assert.equal(fields.exportSelection.disabled,false);assert.equal(fields.exportSelection.value,'current');assert.equal(fields.exportSelection.options[0].textContent,'Лицевая и оборот');assert.equal(fields.exportDuplex.disabled,false);
});
test('12-up without bleed forces zero and fills A/B sheet; shell has no independent bleed',()=>{
 const p=createProject();const state=exportControlState(p,{mode:'label',sheet:'12up-trim'});assert.equal(state.bleed,0);assert.equal(state.paper,'letter');assert.equal(state.copies,6);
 p.layout.printArea='body';assert.equal(exportControlState(p,{mode:'label'}).bleed,0);
});
