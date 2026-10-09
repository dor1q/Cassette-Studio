import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {createProject,importReference,clone,validateProject,panelRects} from '../src/model.js';
import {updateCDLayout,resetCDSurfaces,cdReferenceTrayTrackFrame,cdTrayTrackActive} from '../src/cd-layout.js';
import {flowText,renderSvg} from '../src/render.js';

const unit=25.4/600,near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
const imported=params=>importReference(createProject(),'https://vhs.texs.org/en/cd-tray?'+new URLSearchParams({musicArtist:'ARTISTTOKEN',musicAlbum:'ALBUMTOKEN',musicA:'TRACKTOKEN (1:00)',color:'263238',...params}));
const tracks=p=>p.surfaces.cdTray.filter(layer=>layer.source==='cdTracks'&&!layer.referenceBlockCopy);
const change=(p,patch)=>{const old=clone(p.layout);Object.assign(p.layout,patch);updateCDLayout(p,'cd-tray',old)};
const frame=layer=>Object.fromEntries(['x','y','w','h','rotation'].map(key=>[key,layer[key]]));

test('original CD Tray body has tracks and credits above its old title area while headings stay only on spines',()=>{
 const p=imported({musicProd:'PRODUCTIONTOKEN'}),layer=tracks(p)[0],panel=panelRects(p,'cdTray').find(panel=>panel.index===2);
 assert.ok(p.surfaces.cdTray.filter(layer=>['artist','album'].includes(layer.source)).every(layer=>layer.visible===false));
 near(layer.size,72*unit);near(layer.x,panel.x+324*unit);near(layer.y,279*unit);near(layer.w,panel.w-648*unit);near(layer.h,(2787-279-40-279)*unit);near(layer.lineHeight,1.5);assert.equal(layer.align,'left');assert.equal(layer.referenceCDTrayTrack,true);
 assert.deepEqual(frame(layer),layer.referenceCDTrayTrackFrame);
 const before=JSON.stringify(p),body={...p,surfaces:{...p.surfaces,cdTray:p.surfaces.cdTray.filter(layer=>layer.source!=='cdSpine')}};
 const rendered=renderSvg(body,'cdTray',{guides:false});assert.ok(rendered.svg.includes('TRACKTOKEN'));assert.ok(rendered.svg.includes('PRODUCTIONTOKEN'));assert.equal(rendered.svg.includes('ARTISTTOKEN'),false);assert.equal(rendered.svg.includes('ALBUMTOKEN'),false);assert.equal(rendered.warnings.length,0);
 assert.ok(new Resvg(rendered.svg,{fitTo:{mode:'width',value:700}}).render().asPng().length>1000);assert.equal(JSON.stringify(p),before);
 assert.ok(renderSvg(p,'cdTray',{guides:false}).svg.includes('ARTISTTOKEN'));
});

test('original two-column tray uses zero gap, actual font padding and requested height without showing body titles after reflow',()=>{
 const p=imported({dc:'1',ch:'50',musicProd:'PRODUCTIONTOKEN'}),columns=tracks(p);assert.equal(columns.length,2);
 for(const layer of columns)near(layer.h,(2787-279-40-279)*unit*.5);near(columns[1].x,columns[0].x+columns[0].w);
 const first=columns[0],second=columns[1],ids=columns.map(layer=>layer.id);second.font='Georgia';second.color='#fa0000';const saved=clone(second);
 change(p,{columns:1});assert.equal(cdTrayTrackActive(p,second,'cdTray'),false);assert.deepEqual(second,saved);near(first.h,(2787-279-40-279)*unit);
 change(p,{columns:2});assert.deepEqual(tracks(p).map(layer=>layer.id),ids);assert.deepEqual(second,saved);assert.ok(p.surfaces.cdTray.filter(layer=>['artist','album'].includes(layer.source)).every(layer=>layer.visible===false));
 const reopened=validateProject(JSON.parse(JSON.stringify(p))),restored=tracks(reopened)[0];assert.equal(restored.referenceCDTrayTrack,true);change(reopened,{columnHeight:75});near(restored.h,(2787-279-40-279)*unit*.75);
});

test('reference tray tracks reflow using their own padding while manual and locked frames and generic templates stay unchanged',()=>{
 const p=imported({}),original=tracks(p)[0];change(p,{columns:2,columnHeight:60});assert.equal(tracks(p).length,2);for(const layer of tracks(p)){assert.equal(layer.referenceCDTrayTrack,true);assert.deepEqual(frame(layer),layer.referenceCDTrayTrackFrame)}
 const second=tracks(p)[1];second.x+=3;second.font='Georgia';const saved=clone(second);change(p,{cdTrayHeight:132,cdTrayLeftSpine:false,columnHeight:70});assert.deepEqual(second,saved);
 original.locked=true;const locked=clone(original);change(p,{cdTrayHeight:125});assert.deepEqual(original,locked);
 const generic=createProject();generic.editorMode='cd-tray';resetCDSurfaces(generic,'cd-tray');const normal=tracks(generic)[0];assert.equal(normal.y,36);assert.equal(normal.referenceCDTrayTrack,undefined);
 const font100={...normal,size:72*unit,cdColumnIndex:0},frame100=cdReferenceTrayTrackFrame(generic,'cdTray',font100);near(frame100.y,279*unit);near(frame100.x,panelRects(generic,'cdTray').find(panel=>panel.index===2).x+324*unit);
});

test('new and legacy free-place tray copies display independently and retain their manual frames during column changes',()=>{
 const p=imported({bx:'bdefault-tracklist*2_50_70_100_0_80_0_0'}),original=tracks(p)[0],copy=p.surfaces.cdTray.find(layer=>layer.referenceBlockCopy),expected=flowText(p,original,'cdTray').text,saved=clone(copy);
 assert.ok(expected.includes('TRACKTOKEN'));assert.equal(copy.source,undefined);assert.equal(copy.referenceCDTrayTrack,undefined);assert.equal(copy.text,expected);change(p,{columns:2});change(p,{columns:1,columnHeight:50});assert.deepEqual(copy,saved);assert.equal(flowText(p,copy,'cdTray').text,expected);
 const legacy={...clone(original),id:'legacy-tray-copy',referenceBlockCopy:2,x:17,y:63,w:66,h:22,locked:false};p.surfaces.cdTray.unshift(legacy);const stored=clone(legacy);
 assert.equal(flowText(p,legacy,'cdTray').text,expected);change(p,{columns:2});assert.deepEqual(legacy,stored);assert.equal(flowText(p,original,'cdTray').text,expected);assert.equal(flowText(p,legacy,'cdTray').text,expected);
});
