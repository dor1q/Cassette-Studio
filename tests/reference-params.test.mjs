import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,dimensions,panelRects,migrate,boundText,makeLayer} from '../src/model.js';
import {referenceFont,referenceSynced} from '../src/reference-format.js';
import {restoreReferenceDecals} from '../src/reference-assets.js';
import {renderSvg,codeSvg,textLayout} from '../src/render.js';
import {applyAlbumArt,applyReferenceArtwork} from '../src/album-art.js';
const url=(mode,params)=>'https://vhs.texs.org/en/'+mode+'?'+new URLSearchParams({musicArtist:'Artist',musicAlbum:'Album',musicA:'First - Artist (2:00)',musicB:'Finale - Artist (3:00)',...params});
const image='data:image/png;base64,iVBORw0KGgo=';

test('J-card URL restores tapered folds, nonuniform panels, spine and duplex geometry',()=>{
 const p=createProject();importReference(p,url('jcard',{face:'p8',sb:'1',tb:'1',sw:'750',ds:'1',dc:'1',s2l:'1'}));
 assert.equal(p.layout.panels,8);assert.equal(p.layout.double,true);assert.equal(p.layout.columns,2);assert.equal(p.layout.flapShape,'short');
 assert.ok(Math.abs(p.layout.spine-19.05)<1e-9);assert.ok(Math.abs(p.layout.flap-16.002)<1e-9);
 assert.ok(Math.abs(dimensions(p,'outer').w-(378+450+1537+1500+1462+1426+1387+1350)*25.4/600)<1e-9);
 const front=panelRects(p),back=panelRects(p,'inner');assert.equal(back[0].index,7);assert.ok(Math.abs(back.at(-1).x+back.at(-1).w-dimensions(p,'inner').w)<1e-9);
 assert.equal(front[3].w,63.5);assert.equal(front[7].w,57.15);
 const saved=migrate(JSON.parse(JSON.stringify(p)));assert.deepEqual(saved.layout.panelWidths,p.layout.panelWidths);assert.deepEqual(dimensions(saved,'inner'),dimensions(p,'inner'));
 const spine=saved.surfaces.outer.find(l=>l.source==='spine');assert.equal(boundText(saved,spine,'outer'),'Artist\nAlbum');
 const extended=createProject();importReference(extended,url('jcard',{eb:'1',sw:'1000',face:'p3'}));assert.equal(extended.layout.flap,1537*25.4/600);assert.equal(migrate(extended).layout.spine,25.4);
});
test('J-card visibility flags hide titles and side A inside, and Stereo uses 1 for hidden',()=>{
 const p=createProject(),flags=1|2|16|32|64;importReference(p,url('jcard',{jh:flags.toString(36),musicProd:'Credits',musicLyrics:'Lyrics',musicDS:'Stereo',musicDSh:'1',ds:'1',hsif:'1',hsib:'1'}));
 const flap=p.surfaces.outer.find(l=>l.source==='flapTracks');assert.equal(boundText(p,flap,'outer'),'Credits');
 assert.equal(p.surfaces.outer.find(l=>l.source==='spine').visible,false);assert.equal(p.surfaces.outer.find(l=>l.referenceFlow).hideA,true);assert.equal(p.surfaces.outer.find(l=>l.referenceFlow).hideB,false);
 assert.equal(p.surfaces.outer.find(l=>l.source==='stereo').visible,false);
 const contents=boundText(p,p.surfaces.inner.find(l=>l.source==='referenceContents'),'inner');assert.doesNotMatch(contents,/First|Artist - Album|Side /);assert.match(contents,/Finale/);assert.match(contents,/Lyrics/);assert.match(contents,/Credits/);
 const shown=createProject();importReference(shown,url('jcard',{musicDS:'Stereo',musicDSh:'0'}));assert.equal(shown.surfaces.outer.find(l=>l.source==='stereo').visible,true);
});
test('URL font families, horizontal width and letter spacing survive rendering and reload',()=>{
 const style=referenceFont('5.2s.4.1e.4.-50',3,1);assert.equal(style.font,'Roboto Flex');assert.equal(style.fontStretch,50);assert.equal(style.spacing,-5);assert.equal(style.italic,true);
 assert.equal(referenceFont('2.2s.4.2s.0',3).font,'Times New Roman');assert.equal(referenceFont('zz.2s.4.2s.0',3).font,'Futura');
 const p=createProject();p.surfaces.outer=[makeLayer('text',{...style,text:'Wide lettering',w:20,h:10,autoFit:false})];const saved=migrate(p),l=saved.surfaces.outer[0];assert.equal(l.fontStretch,50);
 assert.match(renderSvg(saved,'outer').svg,/transform="scale\(0.5 1\)"/);assert.ok(textLayout('WWWW WWWW',l).lines.length<=textLayout('WWWW WWWW',{...l,fontStretch:200}).lines.length);
});
test('custom J-card captions distinguish legacy positions, canonical positions and reverse side',()=>{
 const p=createProject(),cxt='Front|50|50|0|20|1.2s.4.2s.0|140||c~Reverse|30|40|90|20|1.2s.4.2s.0|140|abcdef|l|b|c';
 importReference(p,url('jcard',{face:'p6',eb:'1',sw:'750',ds:'1',cxt}));
 const a=p.surfaces.outer.find(l=>l.category==='referenceText'),b=p.surfaces.inner.find(l=>l.category==='referenceText');assert.equal(a.text,'Front');assert.ok(Math.abs(a.x+a.w/2-dimensions(p,'outer').w/2)<1e-9);
 const centerX=b.x-b.h/2;assert.ok(Math.abs(centerX-(406.4*.3+(p.layout.flap-638*25.4/600)+(p.layout.spine-12.7)))<1e-9);assert.equal(b.color,'#abcdef');assert.equal(b.rotation,90);
});
test('Cassette URL restores independent sides, hidden blocks, labels and active view',async()=>{
 const params={sd:'AB',ch:(1|4|16).toString(36),hsi:'1',sll:'Face',sla:'I',slb:'II',cxt:'A text|50|50|0|40|1.2s.4.2s.0|140||c~B text|50|50|0|40|1.2s.4.2s.0|140||c|b',d:'front_30_40_0_100_o_f|rear_60_70_0_100_u_b'};
 const p=createProject();importReference(p,url('cassette',params));assert.equal(p.layout.sync,false);assert.equal(p.referenceView.both,true);
 await restoreReferenceDecals(p,new URLSearchParams(params),async path=>path==='/api/decals'?[{id:'cat',items:[{id:'front',name:'Front'},{id:'rear',name:'Rear'}]}]:{src:image},async()=>[100,50],'labelA');
 for(const side of ['A','B']){const list=p.surfaces['label'+side];assert.equal(list.find(l=>l.source==='artist').visible,false);assert.equal(list.find(l=>l.source==='production').visible,false);assert.equal(list.find(l=>l.source==='side').visible,false);assert.equal(list.find(l=>l.source==='tracks').visible,side==='B');assert.deepEqual(list.filter(l=>l.category==='referenceText').map(l=>l.text),[side+' text']);assert.equal(list.find(l=>l.referenceId).referenceId,side==='A'?'front':'rear');}
 const saved=migrate(p);assert.equal(saved.layout.sync,false);assert.equal(saved.surfaces.labelB[0].referenceId,'rear');
 assert.equal(referenceSynced(new URLSearchParams({...params,ss:'1'})),true);
});
test('explicit cassette synchronization copies side-marked captions and decals to both surfaces',async()=>{
 const params={ss:'1',sd:'B',cxt:'Both|50|50|0|40|1.2s.4.2s.0|140||c|b',d:'rear_60_70_0_100_u_b'},p=createProject();importReference(p,url('cassette',params));
 await restoreReferenceDecals(p,new URLSearchParams(params),async path=>path==='/api/decals'?[{id:'cat',items:[{id:'rear',name:'Rear'}]}]:{src:image},async()=>[100,50],'labelA');
 assert.equal(p.referenceView.surface,'labelB');for(const side of ['A','B']){assert.equal(p.surfaces['label'+side].filter(l=>l.category==='referenceText').length,1);assert.equal(p.surfaces['label'+side].filter(l=>l.referenceId==='rear').length,1)}
});
test('decal URL restores side, tint, stretch and stable layer ordering',async()=>{
 const p=createProject(),params=new URLSearchParams({ds:'1',d:'first_30_40_0_100_b_f_s_xff0000_r200|second_30_40_0_100_u_f_c|back_60_70_90_100_o_b'});importReference(p,url('jcard',Object.fromEntries(params)));
 await restoreReferenceDecals(p,params,async path=>path==='/api/decals'?[{id:'cat',items:['first','second','back'].map(id=>({id,name:id}))}]:{src:image},async()=>[800,200]);
 assert.deepEqual(p.surfaces.outer.slice(0,2).map(l=>l.referenceId),['first','second']);const l=p.surfaces.outer[0];assert.equal(l.tintMode,'solid');assert.equal(l.tintColor,'#ff0000');assert.equal(l.fit,'stretch');assert.ok(Math.abs(l.w/l.h-8)<1e-9);
 assert.equal(p.surfaces.inner.at(-1).referenceId,'back');assert.equal(p.surfaces.outer.some(l=>l.referenceId==='back'),false);assert.match(renderSvg(migrate(p),'outer').svg,/preserveAspectRatio="none"/);
});
test('URL imports several QR codes, custom destinations, colors and back barcode placement',()=>{
 const p=createProject();importReference(p,url('jcard',{ds:'1',qr:'10_80_72_45_'+encodeURIComponent('https://example.com/a_b?q=1')+'|b~40_60_100_-90',qrU:'https://unused.example',playlistUrl:'https://album.example',bp:'b~40_70_120_0',bcm:'c',bcv:encodeURIComponent('CAT-01'),bcf:'39',bv:'1',qcz:'1',qcc:'112233',bcz:'1',bcc:'abcdef'}));
 const a=p.surfaces.outer.find(l=>l.type==='qr'),b=p.surfaces.inner.find(l=>l.type==='qr'),code=p.surfaces.inner.find(l=>l.type==='barcode');assert.equal(a.text,'https://example.com/a_b?q=1');assert.equal(b.text,'https://album.example');assert.equal(a.color,'#112233');assert.equal(a.rotation,45);assert.equal(code.text,'CAT-01');assert.equal(code.barcodeType,'code39');assert.equal(code.color,'#abcdef');
 assert.match(codeSvg(code),/<svg/);assert.match(codeSvg(a),/fill="none"/);assert.equal(migrate(p).surfaces.inner.filter(l=>l.type==='qr').length,1);
});
test('Cassette codes use local units and custom formats produce valid SVG',()=>{
 const p=createProject();importReference(p,url('cassette',{ss:'0',qr:'b~50_75_100_0',cid:'541252545430',bv:'1'}));
 assert.equal(p.surfaces.labelA.some(l=>l.type==='qr'),false);const qr=p.surfaces.labelB.find(l=>l.type==='qr');assert.ok(Math.abs(qr.w-350*.13*88.6/251.16)<1e-9);
 for(const [bcf,text]of [['128','CAT-01'],['39','CAT-01'],['93','CAT-01'],['itf','10012345678902'],['msi','12345'],['cdb','A123B']]){const other=createProject();importReference(other,url('cassette',{bcm:'c',bcv:text,bcf,bv:'1'}));assert.match(codeSvg(other.surfaces.labelA.find(l=>l.type==='barcode')),/<svg/)}
});
test('legacy fit and stretch preserve original crop while transparent artwork flags survive export',()=>{
 const p=createProject();importReference(p,url('jcard',{bg:'clear',color:'clear',cxt:'Visible|50|50|0|40|1.2s.4.2s.0|140|ff0000|c',mp:'0.1.50.3.-4.30',pf:'s'}));applyAlbumArt(p,image);applyReferenceArtwork(p,new URLSearchParams({mp:'0.1.50.3.-4.30',pf:'s'}),1200,600);
 assert.equal(p.surfaces.outer[0].fit,'stretch');assert.equal(p.surfaces.outer[0].cropZoom,1.5);assert.equal(p.surfaces.outer.find(l=>l.category==='referenceText').visible,true);assert.equal(p.surfaces.outer.find(l=>l.source==='spine').visible,false);assert.match(renderSvg(migrate(p),'outer').svg,/fill="none"/);
});
test('sample J-card URL puts its unavailable uploaded artwork on the reverse and hides Stereo',async()=>{
 const p=createProject(),params=new URLSearchParams({musicArtist:'fakemink',musicAlbum:"fakemink London's Saviour",musicA:'Kill Everything - fakemink (3:07)',musicB:'London Life - fakemink (3:33)',bg:'131139',opacity:'.3',musicDS:'EtnaVeraVela',musicDSh:'1',ds:'1',d:'custom-under-1790193336820_14.1_51.3_-90_356_u_b_r90',cxt:"fakemink%20london's%20savior|33.66|63.92|0|33|~Kells+SD.60.7.2s.0|140||c|c~%C2%A9%20etna%20vera%20vela|8.27|3.15|0|16|3.1j.6.2s.0|140||c|c",cl:'hidden',tf:'5',fb:'~Kells+SD.3c.4.2s.0.-50',f2:'~Kells+SD.2v.7.2s.0',fi:'~Kells+SD.3a.7.2s.0',cid:'541252545430',bv:'0',qr:''});
 importReference(p,'https://vhs.texs.org/en/jcard?'+params);await restoreReferenceDecals(p,params,async()=>[]);
 assert.equal(p.layout.double,true);assert.equal(p.settings.referenceLogoHidden,true);assert.equal(p.surfaces.outer.find(l=>l.source==='stereo').visible,false);assert.equal(p.surfaces.outer.find(l=>l.type==='barcode').visible,false);
 assert.equal(p.surfaces.outer.some(l=>l.referenceId),false);const artwork=p.surfaces.inner.find(l=>l.missingReference);assert.equal(artwork.rotation,-90);assert.equal(artwork.fit,'stretch');assert.equal(p.surfaces.outer.filter(l=>l.category==='referenceText').length,2);
 assert.equal(migrate(p).surfaces.inner.find(l=>l.missingReference).referenceId,artwork.referenceId);
});
test('global track flags and title separator use ts/sep independently of flap tf',()=>{
 const p=createProject();importReference(p,url('jcard',{ts:'7',tf:'0',sep:'1'}));const back=p.surfaces.outer.find(l=>l.referenceFlow),flap=p.surfaces.outer.find(l=>l.source==='flapTracks');
 assert.doesNotMatch(boundText(p,back,'outer'),/1\. |— Artist|2:00/);assert.match(boundText(p,flap,'outer'),/1\. First — Artist \(2:00\)/);assert.equal(boundText(p,p.surfaces.outer.find(l=>l.source==='spine'),'outer'),'Artist | Album');
 const label=createProject();importReference(label,url('cassette',{ts:'7',tf:'0'}));assert.doesNotMatch(boundText(label,label.surfaces.labelA.find(l=>l.source==='tracks'),'labelA'),/1\. |— Artist|2:00/);
});
test('default cover framing, opacity, hidden cover and sixfold cassette zoom survive reload',()=>{
 const p=createProject();applyAlbumArt(p,image);applyReferenceArtwork(p,new URLSearchParams(),1200,1200,'label');assert.equal(p.surfaces.labelA[0].opacity,.3);assert.ok(Math.abs(p.surfaces.labelA[0].cropZoom-2*1.06/(88.6/41.8))<1e-9);
 applyReferenceArtwork(p,new URLSearchParams({mp:'_'}),1200,1200);assert.equal(p.surfaces.outer[0].visible,false);
 applyReferenceArtwork(p,new URLSearchParams({mp:'0.6.00.0.0.0',pf:'f'}),1200,1200,'label');assert.equal(migrate(p).surfaces.labelA[0].cropZoom,6*1.06);
});
test('background decals sit behind artwork and graphic decals sit between artwork and text',async()=>{
 const p=createProject(),params=new URLSearchParams({d:'graphic_40_50_0_100_u_f|background_40_50_0_100_b_f'});applyAlbumArt(p,image);
 await restoreReferenceDecals(p,params,async path=>path==='/api/decals'?[{id:'cat',items:['graphic','background'].map(id=>({id,name:id}))}]:{src:image},async()=>[800,200]);
 assert.equal(p.surfaces.outer[0].referenceId,'background');assert.equal(p.surfaces.outer[1].category,'albumCover');assert.equal(p.surfaces.outer[2].referenceId,'graphic');assert.equal(p.surfaces.outer[3].type,'text');
});
test('global track changes reach back content while flap keeps its independent URL options',()=>{
 const p=createProject();importReference(p,url('jcard',{ts:'0',tf:'0'}));p.settings.numbers=false;p.settings.artists=false;p.settings.durations=false;
 assert.doesNotMatch(boundText(p,p.surfaces.outer.find(l=>l.referenceFlow),'outer'),/1\. |— Artist|2:00/);
 assert.match(boundText(p,p.surfaces.outer.find(l=>l.source==='flapTracks'),'outer'),/1\. First — Artist \(2:00\)/);
});
test('repeat URL import retains a replacement upload and moves it to its correct reverse side',async()=>{
 const p=createProject(),params=new URLSearchParams({ds:'1',d:'custom-under-123_30_40_90_120_u_b_r90'}),cached=[makeLayer('image',{name:'My upload',referenceId:'custom-under-123',src:image})];
 importReference(p,url('jcard',Object.fromEntries(params)));
 const result=await restoreReferenceDecals(p,params,async()=>{throw Error('Offline')},async()=>[1200,800],'outer',cached);
 assert.equal(result.restored,1);assert.equal(result.missing,0);assert.equal(p.surfaces.outer.some(l=>l.referenceId),false);const layer=p.surfaces.inner.find(l=>l.referenceId);assert.equal(layer.src,image);assert.equal(layer.missingReference,undefined);assert.equal(layer.rotation,90);assert.ok(Math.abs(layer.w/layer.h-1.35)<1e-9);
});
