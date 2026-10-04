import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,makeLayer,migrate,importReference} from '../src/model.js';
import {matchRecordLabelLogo,prepareRecordLabelLogo,applyRecordLabelLogo,updateRecordLabelLogoColors} from '../src/record-label-logo.js';
import {restoreReferenceLogo} from '../src/reference-images.js';
import {storeMusicGallery} from '../src/cover-gallery.js';
import {restoreReferenceMusicMetadata} from '../src/reference-music.js';
import {normalizeRecordLabels} from '../music-labels.mjs';
import {importMusicData} from '../src/music-import.js';
import {duplicateSelection} from '../src/selection-edit.js';
const src='data:image/png;base64,aW1hZ2U=',other='data:image/png;base64,b3RoZXI=',size=async()=>[760,500],request=async()=>({src}),offline=async()=>{throw Error('offline')};
const album={recordLabels:['Warner Bros. Records'],recordLabelSource:'Spotify API'};
const automated=p=>Object.values(p.surfaces).flat().filter(l=>l.automaticRecordLabelLogo);

test('actual label aliases and legal suffixes choose one catalog brand',()=>{
 for(const name of ['Warner Bros. Records','Warner Records Inc.','WARNER RECORDS'])assert.equal(matchRecordLabelLogo({recordLabels:[name]}).logo.name,'Warner Records');
 assert.equal(matchRecordLabelLogo({recordLabels:['A&M Records Ltd.']}).logo.name,'A&M Records');
 assert.equal(matchRecordLabelLogo({recordLabels:['MJJ Productions']}).logo.name,'Michael Jackson');
 assert.equal(matchRecordLabelLogo({recordLabels:['Sony Music Entertainment']}).logo.name,'Sony Music');
 assert.deepEqual(normalizeRecordLabels([' Polydor\nRecords ','polydor records','[no label]',{},'']),['Polydor Records']);
});

test('artist, copyright, note and partial names cannot invent a label',()=>{
 for(const value of [{artist:'Taylor Swift',note:'Republic Records',copyright:'Republic Records'},{recordLabels:['Sub Popcorn']},{recordLabels:['Not Warner Records']},{recordLabels:['Various Artists']}]){
  const match=matchRecordLabelLogo(value);assert.equal(match.matched,false);assert.equal(match.logo.name,'Lo-Fi Stereo');
 }
 // An artist's own imprint can match only when the provider actually states it as the label.
 assert.equal(matchRecordLabelLogo({artist:'Someone',recordLabels:['Taylor Swift']}).logo.name,'Taylor Swift');
});

test('co-labels with different available logos stay ambiguous rather than selecting the first',async()=>{
 for(const recordLabels of [['Republic Records','Island Records'],['Interscope Records / Aftermath Entertainment']]){
  const result=await prepareRecordLabelLogo({recordLabels},request,{getDimensions:size});
  assert.equal(result.reason,'ambiguous');assert.equal(result.logo.name,'Lo-Fi Stereo');assert.equal(result.matched,false);assert.match(result.warnings[0],/несколько лейблов/);
 }
 const same=matchRecordLabelLogo({recordLabels:['Warner Bros. Records','Warner Records']});assert.equal(same.matched,true);
});

test('preparing does not change a project, and applying an import updates one existing automatic logo',async()=>{
 const p=createProject(),before=structuredClone(p),prepared=await prepareRecordLabelLogo(album,request,{getDimensions:size});assert.deepEqual(p,before);
 assert.deepEqual(applyRecordLabelLogo(p,prepared).updated,['outer']);const first=automated(p)[0];first.x+=3;first.opacity=.7;
 const next=await prepareRecordLabelLogo({recordLabels:['Columbia Records']},async()=>({src:other}),{getDimensions:size});
 applyRecordLabelLogo(p,next);assert.equal(automated(p).length,1);assert.equal(automated(p)[0].id,first.id);assert.equal(first.src,other);assert.equal(first.opacity,.7);assert.equal(first.recordLabelLogoName,'Columbia Records');assert.deepEqual(p.data.recordLabels,['Columbia Records']);
});

test('offline automatic fallback is an embedded valid PNG and does not abort a music import',async()=>{
 const prepared=await prepareRecordLabelLogo(album,offline,{getDimensions:size});
 assert.equal(prepared.logo.name,'Lo-Fi Stereo');assert.equal(prepared.matched,false);assert.match(prepared.asset.src,/^data:image\/png;base64,/);
 const bytes=Buffer.from(prepared.asset.src.split(',')[1],'base64');assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),prepared.asset.w);assert.equal(bytes.readUInt32BE(20),prepared.asset.h);
 const p=createProject();assert.equal(applyRecordLabelLogo(p,prepared).updated.length,1);assert.equal(automated(p)[0].recordLabelLogoName,'Lo-Fi Stereo');assert.match(prepared.warnings.join(' '),/недоступен/);
});

test('saved record-label bytes and provenance restore offline and the next album can replace them',async()=>{
 const p=createProject();applyRecordLabelLogo(p,await prepareRecordLabelLogo(album,request,{getDimensions:size}));
 const saved=migrate(JSON.parse(JSON.stringify(p))),before=automated(saved)[0].id;
 assert.deepEqual(saved.data.recordLabels,album.recordLabels);assert.equal(saved.data.recordLabelSource,'Spotify API');
 const loaded=await prepareRecordLabelLogo(album,offline,{cached:automated(saved),getDimensions:size});assert.equal(loaded.matched,true);assert.equal(loaded.asset.src,src);assert.deepEqual(loaded.warnings,[]);
 const fallback=await prepareRecordLabelLogo({},offline,{getDimensions:size});applyRecordLabelLogo(saved,fallback);assert.equal(automated(saved)[0].id,before);assert.equal(automated(saved)[0].recordLabelLogoName,'Lo-Fi Stereo');assert.deepEqual(saved.data.recordLabels,[]);
});

test('uploaded, manually replaced, explicitly restored, hidden and locked logos are preserved',async()=>{
 const prepared=await prepareRecordLabelLogo(album,request,{getDimensions:size});
 for(const choice of ['upload','replaced','explicit','hidden','locked']){
  const p=createProject();
  if(choice==='upload')p.surfaces.outer.push(makeLayer('image',{category:'studio',src:other}));
  else if(choice==='explicit')await restoreReferenceLogo(p,new URLSearchParams({cl:'/_music-company-logos/columbia-records.png'}),request,'jcard',[],size);
  else{applyRecordLabelLogo(p,prepared);const l=automated(p)[0];if(choice==='replaced')l.src=other;if(choice==='hidden')l.visible=false;if(choice==='locked')l.locked=true}
  const before=structuredClone(p.surfaces);assert.deepEqual(applyRecordLabelLogo(p,prepared).updated,[]);assert.deepEqual(p.surfaces,before);
 }
 const hidden=createProject();hidden.settings.referenceLogoHidden=true;assert.equal(applyRecordLabelLogo(hidden,prepared).updated.length,0);assert.equal(automated(hidden).length,0);
});

test('cassette targets honor synchronization, selected side and protected paired logos',async()=>{
 const prepared=await prepareRecordLabelLogo(album,request,{getDimensions:size}),p=createProject();p.layout.sync=false;
 applyRecordLabelLogo(p,prepared,{mode:'label',target:'B'});assert.equal(automated(p).length,1);assert.equal(p.surfaces.labelB.at(-1).recordLabelLogoName,'Warner Records');assert.equal(p.surfaces.labelA.some(l=>l.automaticRecordLabelLogo),false);assert.equal(p.surfaces.outer.some(l=>l.automaticRecordLabelLogo),false);
 const sync=createProject();applyRecordLabelLogo(sync,prepared,{mode:'label',target:'A'});assert.equal(automated(sync).length,2);
 const next=await prepareRecordLabelLogo({recordLabels:['Atlantic Records']},async()=>({src:other}),{getDimensions:size});sync.surfaces.labelB.find(l=>l.automaticRecordLabelLogo).locked=true;
 const before=structuredClone(sync.surfaces);assert.equal(applyRecordLabelLogo(sync,next,{mode:'label',target:'A'}).updated.length,0);assert.deepEqual(sync.surfaces,before);
 const j=createProject(),old=structuredClone(j.surfaces);applyRecordLabelLogo(j,prepared,{target:'A'});assert.deepEqual(j.surfaces,old);
});

test('original links choose real metadata only without an explicit cl selection',async()=>{
 const p=createProject(),q=new URLSearchParams({musicArtist:'Artist',id:'sa.5SknXhmjHijD0uU1Pm2HBr'});importReference(p,'https://vhs.texs.org/en/jcard?'+q);p.referenceMusicMetadata=album;
 assert.equal((await restoreReferenceLogo(p,q,request,'jcard',[],size)).restored,1);assert.equal(automated(p)[0].recordLabelLogoName,'Warner Records');
 const explicit=createProject();explicit.referenceMusicMetadata=album;await restoreReferenceLogo(explicit,new URLSearchParams({cl:'/_music_logo_defaults/hifi-stereo.png'}),request,'jcard',[],size);assert.equal(automated(explicit).length,0);assert.equal(explicit.surfaces.outer.at(-1).referenceLogoExplicit,true);
 let requests=0;assert.deepEqual(await restoreReferenceLogo(createProject(),new URLSearchParams({cl:'hidden'}),async()=>{requests++}),{restored:0,missing:0});assert.equal(requests,0);
});

test('gallery and reference metadata keep label provenance separate from artwork and stale albums',async()=>{
 const p=createProject();storeMusicGallery(p,{...album,cover:'https://i.scdn.co/image/a'});assert.deepEqual(p.data.recordLabels,album.recordLabels);
 storeMusicGallery(p,{cover:'https://i.scdn.co/image/b'});assert.deepEqual(p.data.recordLabels,[]);assert.equal(p.data.recordLabelSource,'');
 const url=new URL('https://vhs.texs.org/en/jcard?id=sa.5SknXhmjHijD0uU1Pm2HBr'),loaded=await restoreReferenceMusicMetadata(p,url,async()=>({...album,cover:'https://i.scdn.co/image/a',tracks:[]}));
 assert.deepEqual(loaded.album.recordLabels,album.recordLabels);assert.equal(p.referenceMusicMetadata.recordLabelSource,'Spotify API');
 const saved=migrate(p),next=createProject();const cached=await restoreReferenceMusicMetadata(next,url,offline,saved);assert.equal(cached.cached,true);assert.deepEqual(next.data.recordLabels,album.recordLabels);
});

test('core music import, original-link reset and saved-project validation prevent stale label metadata',()=>{
 const p=createProject(),music={...album,artist:'Artist',album:'Album',tracks:[{title:'One',seconds:60}]};
 importMusicData(p,music);assert.deepEqual(p.data.recordLabels,album.recordLabels);assert.equal(p.data.recordLabelSource,'Spotify API');
 importMusicData(p,{tracks:[{title:'Side B',seconds:60}]},'B',{tracksOnly:true});assert.deepEqual(p.data.recordLabels,album.recordLabels);
 importMusicData(p,{tracks:[{title:'New',seconds:60}]});assert.deepEqual(p.data.recordLabels,[]);assert.equal(p.data.recordLabelSource,'');
 importMusicData(p,music);importReference(p,'https://vhs.texs.org/en/cassette?musicArtist=New');assert.deepEqual(p.data.recordLabels,[]);assert.equal(p.data.recordLabelSource,'');
 p.data.recordLabels=[' Columbia\nRecords ',{},'Columbia Records','[no label]'];p.data.recordLabelSource='x'.repeat(200);const validated=migrate(p);assert.deepEqual(validated.data.recordLabels,['Columbia Records']);assert.equal(validated.data.recordLabelSource.length,80);
});

test('automatic logos stay readable on theme changes while manual tint and locked logos stay unchanged',async()=>{
 const p=createProject();applyRecordLabelLogo(p,await prepareRecordLabelLogo(album,request,{getDimensions:size}));const l=automated(p)[0];assert.equal(l.tintMode,'solid');assert.equal(l.tintColor,p.settings.fg);
 p.settings.fg='rainbow';p.settings.bg='#ffffff';updateRecordLabelLogoColors(p);assert.equal(l.tintColor,'#000000');p.settings.bg='#000000';updateRecordLabelLogoColors(p);assert.equal(l.tintColor,'#ffffff');
 l.tintColor='#ff8800';p.settings.fg='#004400';updateRecordLabelLogoColors(p);assert.equal(l.tintColor,'#ff8800');
 l.tintColor=l.automaticRecordLabelLogoColor;l.locked=true;updateRecordLabelLogoColors(p);assert.equal(l.tintColor,'#ffffff');
});

test('a new logo leaves space above the stock spine title without moving an edited or locked title',async()=>{
 const prepared=await prepareRecordLabelLogo(album,request,{getDimensions:size}),p=createProject();applyRecordLabelLogo(p,prepared);const spine=p.surfaces.outer.find(l=>l.source==='spine'),logo=automated(p)[0];assert.ok(spine.y>logo.y+logo.h);assert.ok(spine.y+spine.w<p.layout.height);
 for(const property of ['y','font','locked']){
  const manual=createProject(),title=manual.surfaces.outer.find(l=>l.source==='spine');title[property]=property==='y'?7:property==='font'?'Georgia':true;const before=structuredClone(title);applyRecordLabelLogo(manual,prepared);assert.deepEqual(title,before);
 }
 const reference=createProject();importReference(reference,'https://vhs.texs.org/en/jcard');const title=reference.surfaces.outer.find(l=>l.source==='spine'),before=structuredClone(title);applyRecordLabelLogo(reference,prepared);assert.deepEqual(title,before);
});

test('a duplicated automatic logo becomes a manual graphic and stays unchanged after saving, palette and album imports',async()=>{
 const p=createProject(),prepared=await prepareRecordLabelLogo(album,request,{getDimensions:size});applyRecordLabelLogo(p,prepared,{mode:'label'});
 const original=p.surfaces.labelA.find(l=>l.automaticRecordLabelLogo),[copy]=duplicateSelection(p,original,'labelA',{dx:0,dy:0});p.surfaces.labelA.push(copy);
 for(const field of ['src','x','y','w','h','rotation','fit','tintMode','tintColor','opacity','referenceAssetKey'])assert.equal(copy[field],original[field]);
 assert.equal(Object.keys(copy).some(key=>key.startsWith('automaticRecordLabelLogo')||key.startsWith('recordLabelLogo')),false);
 const saved=migrate(JSON.parse(JSON.stringify(p))),manual=saved.surfaces.labelA.find(l=>l.name===copy.name),before=structuredClone(manual);
 saved.settings.fg='#778899';updateRecordLabelLogoColors(saved);assert.deepEqual(manual,before);
 const next=await prepareRecordLabelLogo({recordLabels:['Columbia Records']},async()=>({src:other}),{getDimensions:size});applyRecordLabelLogo(saved,next,{mode:'label'});assert.deepEqual(manual,before);assert.equal(manual.automaticRecordLabelLogo,undefined);
});
