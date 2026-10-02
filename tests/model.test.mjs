import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,dimensions,parseM3U,parseTracks,balance,total,migrate,importReference,makeLayer,boundText} from '../src/model.js';
import {renderSvg,codeSvg} from '../src/render.js';
test('physical dimensions for 3..8 panels and labels',()=>{const p=createProject();assert.ok(Math.abs(dimensions(p,'outer').w-168.3)<1e-8);p.layout.panels=8;assert.ok(Math.abs(dimensions(p,'inner').w-428.7)<1e-8);assert.deepEqual(dimensions(p,'labelB'),{w:88.6,h:41.8})});
test('balanced sides preserve order and minimize duration difference',()=>{const tracks=parseTracks('a (4:00)\nb (2:00)\nc (5:00)\nd (1:00)');const [a,b]=balance(tracks);assert.deepEqual([...a,...b],tracks);assert.equal(total(a),360);assert.equal(total(b),360)});
test('M3U with metadata, absent duration and Unicode',()=>{const a=parseM3U('\uFEFF#EXTM3U\n#EXTINF:201,Кино — Пачка сигарет\ntrack.mp3\nfolder/unknown.flac\n#EXTINF:-1,Outro\nlast.mp3');assert.equal(a.length,3);assert.equal(a[0].seconds,201);assert.equal(a[1].title,'unknown');assert.equal(a[2].seconds,0)});
test('legacy project migrates artwork and text',()=>{const p=migrate({artist:'Тест',tracksA:'Один (2:00)',front:65,art:'data:image/png;base64,AA=='});assert.equal(p.data.artist,'Тест');assert.equal(p.layout.panels,3);assert.equal(p.surfaces.outer[0].type,'image')});
test('import reference preserves URL-encoded track separators and color',()=>{const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?musicArtist=Test&musicA=One%20(1%3A00)%7CTwo%20(2%3A00)&bg=123456...0');assert.equal(p.data.A.length,2);assert.equal(p.settings.bg,'#123456')});
test('import reference restores original caption centers and font sizes',()=>{const p=createProject(),cxt="fakemink%20london's%20savior|33.66|63.92|0|33|~Kells%20SD.60.7.2s.0|140||c|c~%C2%A9%20etna%20vera%20vela|8.27|3.15|0|16|3.1j.6.2s.0|140||c|c";importReference(p,'https://vhs.texs.org/en/jcard?musicArtist=fakemink&musicDS=EtnaVeraVela&cid=541252545430&cxt='+encodeURIComponent(cxt));const captions=p.surfaces.outer.filter(l=>l.category==='referenceText'),W=dimensions(p,'outer').w;assert.equal(captions.length,2);assert.equal(captions[0].text,"fakemink london's savior");assert.equal(captions[0].font,'Kells SD');assert.ok(Math.abs((captions[0].x+captions[0].w/2)/W-.8129)<.01);assert.ok(Math.abs(captions[0].size-6.584)<.02);assert.equal(captions[1].text,'© etna vera vela');assert.equal(captions[1].font,'Impact');assert.ok(Math.abs((captions[1].x+captions[1].w/2)/W-.1997)<.01);assert.ok(Math.abs(captions[1].size-1.676)<.02);assert.equal(p.data.stereo,'EtnaVeraVela');assert.equal(p.data.note,'');assert.equal(p.surfaces.outer.find(l=>l.category==='referenceCode').text,'541252545430')});
test('label bound track source resolves side B',()=>{const p=createProject(),l=makeLayer('text',{source:'tracks'});assert.match(boundText(p,l,'labelB'),/London Life/);assert.doesNotMatch(boundText(p,l,'labelB'),/Kill Everything/)});
test('renderer escapes content and exports physical bleed dimensions',()=>{const p=createProject();p.data.artist='<script>alert("x")</script>';const r=renderSvg(p,'labelA',{bleed:2});assert.match(r.svg,/&lt;script&gt;/);assert.doesNotMatch(r.svg,/<script>/);assert.equal(r.w,92.6);assert.equal(r.h,45.8)});
test('real barcode rejects invalid check digit; QR has modules',()=>{assert.throws(()=>codeSvg(makeLayer('barcode',{text:'5901234123458',barcodeType:'ean13'})));assert.match(codeSvg(makeLayer('barcode',{text:'5901234123457',barcodeType:'ean13'})),/<svg/);assert.match(codeSvg(makeLayer('qr',{text:'https://example.com'})),/viewBox/)});
test('project round-trip retains custom layers',()=>{const p=createProject();p.surfaces.outer.push(makeLayer('text',{text:'Свой текст',rotation:35}));const q=migrate(JSON.parse(JSON.stringify(p)));assert.equal(q.surfaces.outer.at(-1).text,'Свой текст');assert.equal(q.surfaces.outer.at(-1).rotation,35)});

test('reference track flags and section typography preserve independent lists',()=>{
 const p=createProject(),q=new URLSearchParams({musicArtist:'fakemink',musicAlbum:"London's Saviour",musicA:'Kill Everything - fakemink (3:07)|Phantas-Ma-Goria - fakemink (1:26)',musicB:'Finale (2:00)',tf:'5',fb:'~Kells+SD.3c.4.2s.0.-50',f2:'~Kells+SD.2v.7.2s.0',fi:'~Kells+SD.3a.7.2s.0'});
 importReference(p,'https://vhs.texs.org/en/jcard?'+q);
 const flap=p.surfaces.outer.find(l=>l.source==='flapTracks'),back=p.surfaces.outer.find(l=>l.referenceFlow);
 assert.equal(flap.rotation,90);assert.equal(flap.font,'Kells SD');assert.ok(Math.abs(flap.size-2.2352)<.01);
 assert.match(boundText(p,flap,'outer'),/1\. Kill Everything · 2\. Phantas/);
 assert.doesNotMatch(boundText(p,flap,'outer'),/3:07|fakemink/);
 p.data.A[0].artist='fakemink';assert.match(boundText(p,back,'outer'),/Kill Everything — fakemink \(3:07\)/);
 p.data.album='Changed album';assert.match(boundText(p,back,'outer'),/^fakemink - Changed album/);
 assert.equal(boundText(p,p.surfaces.outer.find(l=>l.source==='spine'),'outer'),'fakemink - Changed album');
 const other=createProject();importReference(other,'https://vhs.texs.org/en/jcard?musicArtist=Test&tf=a');
 const options=other.surfaces.outer.find(l=>l.source==='flapTracks').trackOptions;
 assert.equal(options.numbers,false);assert.equal(options.bullets,false);assert.equal(options.artists,true);assert.equal(options.durations,true);
});

test('reference hidden codes stay editable and malformed QR placement is rejected',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?musicArtist=Test&cid=541252545430&bv=0&qr=99999_50_72_0');
 assert.equal(p.surfaces.outer.find(l=>l.type==='barcode').visible,false);
 assert.equal(p.surfaces.outer.some(l=>l.type==='qr'),false);
});

