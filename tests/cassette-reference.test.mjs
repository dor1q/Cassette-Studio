import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,referenceMode,makeLayer,boundText,migrate} from '../src/model.js';
import {cassetteOutline,CASSETTE_TEMPLATE} from '../src/cassette-template.js';
import {applyAlbumArt,applyReferenceArtwork} from '../src/album-art.js';
import {referenceDecalLayer,restoreReferenceFonts} from '../src/reference-assets.js';
import {importMusicData} from '../src/music-import.js';

test('cassette template matches the public outline and asymmetric window',()=>{
 assert.equal(cassetteOutline(251.16,118.43),'M0,118.43V9.2L9.2,0H241.96L251.16,9.2V118.43Z');
 const p=createProject();assert.equal(p.layout.holeW,CASSETTE_TEMPLATE.holeW);
 const x=(p.layout.labelW-p.layout.holeW)/2+p.layout.holeOffsetX;
 assert.ok(Math.abs(x-40.08*88.6/251.16)<1e-8);assert.ok(Math.abs(p.layout.holeY-16.024)<.002);
 const legacy=createProject();delete legacy.layout.holeOffsetX;assert.equal(migrate(legacy).layout.holeOffsetX,0);
});
test('cassette reference resolves typography, custom captions and both track sides',()=>{
 const p=createProject(),q=new URLSearchParams({musicArtist:'Queens',musicAlbum:'Clockwork',musicA:'Song - Artist (3:12)',musicB:'Finale (2:00)',musicPL:'2026 • Label',sll:'Face',sla:'I',slb:'II',fb:'1f.4k.7.2s.31',f2:'1f.1r.4.2s.2',fi:'1f.3l.4.2s.0',cxt:'Custom|50|50|0|50|0.8c.7.2s.4|140|123456|l'});
 const url='https://vhs.texs.org/en/cassette?'+q;assert.equal(referenceMode(url),'label');assert.throws(()=>referenceMode('https://example.com/en/cassette'));
 importReference(p,url);
 const artist=p.surfaces.labelA.find(l=>l.source==='artist'),tracks=p.surfaces.labelA.find(l=>l.source==='tracks'),caption=p.surfaces.labelA.find(l=>l.category==='referenceText');
 assert.equal(artist.font,'Teko');assert.equal(artist.fontWeight,700);assert.equal(artist.italic,true);assert.equal(artist.smallcaps,true);assert.equal(artist.uppercase,true);assert.ok(artist.outline>0&&artist.shadow>0);
 assert.ok(Math.abs(artist.size-16.4*41.8/118.43)<1e-8);assert.equal(tracks.uppercase,true);
 assert.match(boundText(p,tracks,'labelB'),/Finale/);assert.doesNotMatch(boundText(p,tracks,'labelB'),/Song/);
 assert.equal(boundText(p,p.surfaces.labelA.find(l=>l.source==='side'),'labelB'),'II');
 assert.equal(p.data.production,'2026 • Label');assert.equal(caption.color,'#123456');assert.equal(caption.align,'left');assert.equal(caption.italic,true);
 assert.equal(caption.x+caption.w/2,44.3);assert.ok(Math.abs(caption.y+caption.h/2-20.9)<1e-8);assert.equal(caption.w,44.3);
});
test('cassette reference cover uses point offsets and the original bleed scaling',()=>{
 const p=createProject();applyAlbumArt(p,'cover','A');applyAlbumArt(p,'cover','B');
 applyReferenceArtwork(p,new URLSearchParams({mp:'0.2.00.0.3.30',opacity:'.3'}),1200,1200,'label');
 for(const s of ['labelA','labelB']){const l=p.surfaces[s][0];assert.ok(Math.abs(l.cropZoom-2*1.06/(88.6/41.8))<1e-8);assert.ok(Math.abs(l.cropY-3*25.4/72)<1e-8);assert.equal(l.cropRotation,30);assert.equal(l.opacity,.3)}
});
test('cassette reference decals use the label coordinate system and width',()=>{
 const p=createProject(),l=referenceDecalLayer(p,{id:'mix!',x:50,y:50,rotation:90,scale:100},{name:'Mix'},'image',800,120,'labelA');
 assert.ok(Math.abs(l.w-130*88.6/251.16)<1e-8);
 assert.ok(Math.abs(l.x-l.h/2-44.3)<1e-8);assert.ok(Math.abs(l.y+l.w/2-20.9)<1e-8);
});
test('side import preserves other tracks, metadata and artwork even when design is unlocked',()=>{
 const p=createProject();p.settings.lockDesign=false;p.surfaces.labelA.unshift(makeLayer('image',{src:'cover'}));
 const before=structuredClone(p),count=importMusicData(p,{artist:'Other',album:'Other',tracks:[{title:'New',seconds:30}]},'B',{tracksOnly:true});
 assert.equal(count,1);assert.deepEqual(p.data.A,before.data.A);assert.deepEqual(p.surfaces,before.surfaces);assert.equal(p.data.artist,before.data.artist);assert.equal(p.data.album,before.data.album);assert.equal(p.data.B[0].title,'New');assert.notEqual(p.data.B[0].id,undefined);
 assert.throws(()=>importMusicData(p,{tracks:[]},'A',{tracksOnly:true}));assert.deepEqual(p.data.A,before.data.A);
});
test('reference fonts embed supported variants once and retain missing font names',async()=>{
 const p=createProject();p.surfaces.labelA=[makeLayer('text',{font:'Teko',fontWeight:700,italic:true}),makeLayer('text',{font:'Kells SD'})];p.surfaces.labelB=structuredClone(p.surfaces.labelA);
 let requests=0;const request=async path=>{if(path==='/api/fonts')return [{name:'Teko',variants:['400','700']}];requests++;return {name:'Teko',weight:700,style:'normal',data:'data:font/woff2;base64,AA=='}};
 const result=await restoreReferenceFonts(p,request);assert.deepEqual(result,{restored:1,missing:['Kells SD']});assert.equal(requests,1);assert.equal(p.fonts.length,1);
});
