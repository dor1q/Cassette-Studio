import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,referenceMode,dimensions,boundText,validateProject} from '../src/model.js';
import {decodeReferenceCD,rebuildReferenceCDContents} from '../src/reference-cd.js';
import {updateCDLayout} from '../src/cd-layout.js';
import {referenceSurface,referenceSurfaces} from '../src/reference-format.js';
import {restoreReferenceBackgrounds} from '../src/reference-background.js';
import {restoreReferenceCover,restoreReferenceLogo} from '../src/reference-images.js';
import {restoreReferenceDecals} from '../src/reference-assets.js';
import {restoreReferenceExtras} from '../src/reference-extras.js';
import {applyReferenceBlocks} from '../src/reference-freeplace.js';
import {albumArtLayer} from '../src/album-art.js';
import {restoreReferenceMusicMetadata,restoreReferenceMusicArtwork} from '../src/reference-music.js';
import {restoreReferenceSideMusic} from '../src/reference-side-music.js';

const unit=25.4/600,point=25.4/72,image='data:image/png;base64,AA==';
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} ≠ ${expected}`);
const reference=(route,params={})=>'https://vhs.texs.org/en/'+route+'?'+new URLSearchParams(params);
test('public CD routes select separate editor families and retain cassette route validation',()=>{
 for(const [route,mode]of [['cd','cd-label'],['cd-insert','cd-insert'],['cd-tray','cd-tray'],['cassette','label'],['jcard','jcard']])assert.equal(referenceMode(reference(route)),mode);
 assert.throws(()=>referenceMode('https://example.com/en/cd'));
 assert.throws(()=>referenceMode('https://vhs.texs.org/en/vinyl'));
});
test('CD label URL restores Hub, track layout, unified tracks, typography and CD hidden flags',()=>{
 const p=createProject();importReference(p,reference('cd',{id:'sa.5SknXhmjHijD0uU1Pm2HBr',dh:'1',tl:'1',musicArtist:'Artist',musicAlbum:'Album',musicA:'First - Artist (3:01)',musicB:'Second (2:30)',musicPL:'Credits',fb:'~Arial.2s.7.2s.0',f2:'~Arial.2s.4.2s.0',f3:'~Times+New+Roman.2s.6.2s.4',cdh:'1',color:'123456',bg:'ffffff'}));
 assert.equal(p.editorMode,'cd-label');assert.equal(p.referenceView.surface,'cdLabel');assert.equal(p.layout.cdLabelHub,true);assert.equal(p.layout.cdTrackLayout,'right');
 const artist=p.surfaces.cdLabel.find(layer=>layer.source==='artist'),album=p.surfaces.cdLabel.find(layer=>layer.source==='album'),tracks=p.surfaces.cdLabel.find(layer=>layer.source==='cdTracks');
 assert.equal(artist.visible,false);near(artist.size,14*point);assert.equal(album.font,'Times New Roman');assert.equal(album.italic,true);
 assert.match(boundText(p,tracks,'cdLabel'),/First.*3:01/);assert.match(boundText(p,tracks,'cdLabel'),/Second.*2:30/);assert.doesNotMatch(boundText(p,tracks,'cdLabel'),/SIDE/);assert.equal(tracks.maxTracks,18);near(tracks.x,238.22*point);
 assert.equal(p.data.production,'Credits');assert.equal(p.settings.bg,'#ffffff');assert.equal(p.settings.fg,'#123456');
 assert.equal(validateProject(p).editorMode,'cd-label');
});
test('insert modes restore physical panels, reverse scope and canonical anchored captions',()=>{
 for(const [mode,width,count,double]of [['s1',2850,1,false],['s2',5700,2,false],['s3',8476,3,false],['d1',2850,1,true],['d2',5700,2,true],['d3',8476,3,true]]){
  const p=createProject();importReference(p,reference('cd-insert',{mode,dc:'2',musicA:'One (1:00)',musicB:'Two (2:00)',cxt:'Front|83.19|50|0|20|~Arial.2s.4.2s.0|140||c|c~Inside|20|50|0|20|~Arial.2s.4.2s.0|140||c|b'}));
  near(dimensions(p,'cdFront').w,width*unit);near(dimensions(p,'cdFront').h,2850*unit);assert.equal(p.layout.cdInsertPanels,count);assert.equal(p.layout.cdInsertDouble,double);assert.equal(p.layout.columns,mode==='s1'?1:2);
  const caption=p.surfaces.cdFront.find(layer=>layer.category==='referenceText');near(caption.x+caption.w/2,Math.min(width*.98,Math.max(width*.02,8476*.8319-(8476-width)))*unit);
  assert.equal(p.surfaces.cdInside.find(layer=>layer.category==='referenceText').text,'Inside');assert.equal(referenceSurface(p,'cd-insert','back'),'cdInside');
  assert.equal(p.surfaces.cdFront.filter(layer=>layer.source==='cdContents').length,(count-1)*p.layout.columns);
 }
 const decoded=decodeReferenceCD(new URLSearchParams({mode:'d99'}),'cd-insert');assert.equal(decoded.cdInsertPanels,2);assert.equal(decoded.cdInsertDouble,false);
});
test('tray URL restores reverse side, image effect and independent spine free blocks',()=>{
 const p=createProject();importReference(p,reference('cd-tray',{ds:'1',s2l:'1',tp:'37_48_1.25',musicArtist:'A',musicAlbum:'B',musicA:'Track (2:01)',cdh:'2',fb:'~Arial.2s.4.2s.0'}));
 assert.equal(p.layout.cdTrayDouble,true);near(dimensions(p,'cdTray').w,3564*unit);near(dimensions(p,'cdTray').h,2787*unit);assert.equal(p.layout.cdTrayPosterOpacity,37);assert.equal(p.layout.cdTrayPosterBlur,48);assert.equal(p.layout.cdTrayPosterScale,1.25);
 const spines=p.surfaces.cdTray.filter(layer=>layer.source==='cdSpine');assert.equal(spines.length,2);assert.ok(spines.every(layer=>layer.hideAlbum&&layer.spineTwoLines));assert.equal(boundText(p,spines[0],'cdTray'),'A');
 const q=new URLSearchParams({bx:'bdefault-spineText1_25_50_100_0_5_0_1'}),result=applyReferenceBlocks(p,q,'cd-tray');assert.equal(result.applied,1);assert.equal(spines[0].locked,true);assert.equal(spines[1].locked,false);
 const stored=validateProject(p);assert.equal(stored.referenceFreePlace.mode,'cd-tray');assert.equal(stored.layout.cdTrayDouble,true);
 assert.deepEqual(referenceSurfaces(p,'cd-tray',{active:true}),['cdTray','cdTrayInside']);
});
test('CD common code URL parameters use CD units and place reverse codes on reverse surfaces',()=>{
 const p=createProject();importReference(p,reference('cd',{qr:'50_50_100_0_https%3A%2F%2Fexample.com',bv:'1',cid:'541252545430',bp:'50_70_50_0'}));
 const qr=p.surfaces.cdLabel.find(layer=>layer.type==='qr'),barcode=p.surfaces.cdLabel.find(layer=>layer.type==='barcode');near(qr.w,350*.18*point);near(qr.x+qr.w/2,dimensions(p,'cdLabel').w/2);assert.equal(qr.text,'https://example.com');assert.equal(barcode.visible,true);
 const tray=createProject();importReference(tray,reference('cd-tray',{ds:'1',qr:'b~50_50_100_0_https%3A%2F%2Fexample.com'}));assert.equal(tray.surfaces.cdTrayInside.filter(layer=>layer.type==='qr').length,1);assert.equal(tray.surfaces.cdTray.filter(layer=>layer.type==='qr').length,0);
});
test('CD reference image restore targets selected format and keeps unavailable assets editable',async()=>{
 const p=createProject(),q=new URLSearchParams({mode:'d2',cp:'https://example.com/cover.png',mp:'0.1.00.0.0'});importReference(p,reference('cd-insert',Object.fromEntries(q)));
 const result=await restoreReferenceCover(p,q,async()=>({src:image}),'cd-insert',[],async()=>[600,600]);assert.equal(result.restored,1);assert.equal(albumArtLayer(p,'cdFront').src,image);assert.equal(albumArtLayer(p,'cdInside'),undefined);
 const saved=validateProject(p);assert.equal(albumArtLayer(saved,'cdFront').src,image);
 const label=createProject();importReference(label,reference('cd',{cp:'https://example.com/missing.png'}));const missing=await restoreReferenceCover(label,new URLSearchParams({cp:'https://example.com/missing.png'}),async()=>{throw Error('Offline')},'cd-label',[],async()=>[600,600]);assert.equal(missing.missing,1);assert.equal(albumArtLayer(label,'cdLabel').missingReference,true);assert.equal(albumArtLayer(label,'cdLabel').referenceAssetKey,'https://example.com/missing.png');
});
test('CD backgrounds map masks over insert folds and mirrored reverse folds and cache real files',async()=>{
 const p=createProject(),q=new URLSearchParams({mode:'d3',cb:'https://example.com/bg.png',bgp:'1',bf:'s'});importReference(p,reference('cd-insert',Object.fromEntries(q)));
 let calls=0;const result=await restoreReferenceBackgrounds(p,q,async()=>{calls++;return {src:image}},'cd-insert',[],async()=>[600,600]);assert.equal(result.restored,1);assert.equal(calls,1);
 const front=p.surfaces.cdFront.find(layer=>layer.referenceBackground),inside=p.surfaces.cdInside.find(layer=>layer.referenceBackground);near(front.w,2776*unit);assert.deepEqual(front.panelTargets,[0]);assert.equal(front.visible,true);assert.equal(inside.visible,false);assert.equal(front.src,image);
 const reverse=new URLSearchParams({mode:'d3',cb:'https://example.com/bg.png',bgp:'w',bf:'s'});await restoreReferenceBackgrounds(p,reverse,async()=>{throw Error('No network')},'cd-insert',[front],async()=>[600,600]);const back=p.surfaces.cdInside.find(layer=>layer.referenceBackground);assert.equal(back.visible,true);assert.deepEqual(back.panelTargets,[0]);near(back.w,2850*unit);assert.equal(back.src,image);
});
test('CD custom decals, Spotify codes and logos restore in the active format',async()=>{
 const p=createProject();importReference(p,reference('cd-tray',{ds:'1',musicArtist:'Artist',musicAlbum:'Album'}));
 const q=new URLSearchParams({id:'sa.5SknXhmjHijD0uU1Pm2HBr',sc:'b~50_50_100_0',d:'custom-1_50_50_0_100_o_b',cd:JSON.stringify([{id:'custom-1',src:image}]),cl:'https://example.com/logo.png'});
 const decal=await restoreReferenceDecals(p,q,async()=>{throw Error('No network')},async()=>[800,400],'cdTray');assert.equal(decal.restored,1);assert.equal(p.surfaces.cdTrayInside.find(layer=>layer.referenceId==='custom-1').src,image);
 const code=await restoreReferenceExtras(p,q,async()=>({src:image}),'cd-tray');assert.equal(code.restored,1);assert.equal(p.surfaces.cdTrayInside.find(layer=>layer.category==='spotifyCode').src,image);
 const logo=await restoreReferenceLogo(p,q,async()=>({src:image}),'cd-tray',[],async()=>[400,200]);assert.equal(logo.restored,1);assert.equal(p.surfaces.cdTray.filter(layer=>layer.category==='studio').length,2);assert.ok(p.surfaces.cdTray.filter(layer=>layer.category==='studio').every(layer=>/^spineLogo[12]$/.test(layer.referenceBlockKey)));
});
test('bare CD music links restore complete tracks and artwork once and reopen from saved cache offline',async()=>{
 const url=new URL(reference('cd-insert',{id:'sa.5SknXhmjHijD0uU1Pm2HBr',mode:'d2',mp:'0.1.00.0.0'})),album={artist:'Main artist',album:'Main album',cover:'https://example.com/main.png',tracks:[{title:'First',artist:'Singer',seconds:81},{title:'Second',artist:'Singer',seconds:122}],recordLabels:['Columbia']};
 const p=createProject();importReference(p,url.href);let imports=0,images=0;
 const request=async path=>{if(path.startsWith('/api/import?')){imports++;return album}images++;return {src:image}};
 await restoreReferenceMusicMetadata(p,url,request);await restoreReferenceMusicArtwork(p,url,request,'cd-insert',p,async()=>[1200,1200]);
 assert.equal(imports,1);assert.equal(images,1);assert.equal(p.data.artist,'Main artist');assert.equal(p.data.album,'Main album');assert.deepEqual(p.data.A.map(track=>[track.title,track.artist,track.seconds]),[['First','Singer',81],['Second','Singer',122]]);assert.deepEqual(p.data.B,[]);assert.equal(albumArtLayer(p,'cdFront').src,image);assert.equal(albumArtLayer(p,'cdInside'),undefined);
 const saved=validateProject(p),next=createProject();importReference(next,url.href);const offline=async()=>{throw Error('Unexpected network')};
 await restoreReferenceMusicMetadata(next,url,offline,saved);const result=await restoreReferenceMusicArtwork(next,url,offline,'cd-insert',saved,async()=>[1200,1200]);assert.equal(result.restored,1);assert.equal(next.data.A[1].seconds,122);assert.equal(next.data.artist,'Main artist');assert.equal(albumArtLayer(next,'cdFront').src,image);
});
test('CD main metadata preserves explicit empty text and tracks and separate source tracks',async()=>{
 const url=new URL(reference('cd',{id:'sa.5SknXhmjHijD0uU1Pm2HBr',musicArtist:'',musicAlbum:'Custom',musicA:'',musicB:'Manual (4:01)',sai:'spotify-album:5SknXhmjHijD0uU1Pm2HBr'})),p=createProject(),album={artist:'Provider artist',album:'Provider album',cover:'https://example.com/main.png',tracks:[{title:'Provider',artist:'Singer',seconds:90}]};
 importReference(p,url.href);await restoreReferenceSideMusic(p,url.searchParams,async()=>album);await restoreReferenceMusicMetadata(p,url,async()=>album);
 assert.equal(p.data.artist,'');assert.equal(p.data.album,'Custom');assert.deepEqual(p.data.A,[]);assert.deepEqual(p.data.B.map(track=>track.title),['Manual']);assert.equal(p.data.B[0].seconds,241);
 const sideURL=new URL(reference('cd',{id:'sa.5SknXhmjHijD0uU1Pm2HBr',sbi:'spotify-album:5SknXhmjHijD0uU1Pm2HBr'}));importReference(p,sideURL.href);await restoreReferenceSideMusic(p,sideURL.searchParams,async()=>album);await restoreReferenceMusicMetadata(p,sideURL,async()=>album);assert.deepEqual(p.data.A,[]);assert.deepEqual(p.data.B.map(track=>track.title),['Provider']);
});
test('reference CD insert layout changes rebuild only untouched content frames and preserve edited and locked frames',()=>{
 const p=createProject();importReference(p,reference('cd-insert',{mode:'s2',musicA:'One (1:00)'}));const original=p.surfaces.cdFront[0],id=original.id,old={...p.layout};p.layout.cdInsertPanels=3;updateCDLayout(p,'cd-insert',old);const result=rebuildReferenceCDContents(p);assert.equal(result.created,1);assert.equal(result.updated,1);assert.equal(p.surfaces.cdFront.filter(layer=>layer.referenceCDContent).length,2);assert.equal(p.surfaces.cdFront.some(layer=>layer.id===id),true);near(original.x,2776*unit+96*unit);
 original.x+=2;original.locked=true;const frame=[original.x,original.y,original.w,original.h],before={...p.layout};p.layout.cdInsertPanels=2;p.layout.cdInsertDouble=true;p.layout.columns=2;updateCDLayout(p,'cd-insert',before);const rebuilt=rebuildReferenceCDContents(p);assert.ok(rebuilt.preserved>=1);assert.deepEqual([original.x,original.y,original.w,original.h],frame);assert.equal(original.locked,true);assert.equal(p.surfaces.cdInside.filter(layer=>layer.referenceCDContent).length,4);assert.equal(p.surfaces.cdInside.some(layer=>layer.cdTemplate),false);
 const cover=createProject();importReference(cover,reference('cd-insert',{mode:'s1'}));const plain={...cover.layout};cover.layout.cdInsertPanels=3;updateCDLayout(cover,'cd-insert',plain);assert.equal(rebuildReferenceCDContents(cover).created,2);assert.equal(cover.surfaces.cdFront.filter(layer=>layer.referenceCDContent).length,2);
});
