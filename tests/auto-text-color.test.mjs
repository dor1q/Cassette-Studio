import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference,migrate,makeLayer} from '../src/model.js';
import {renderSvg} from '../src/render.js';
import {setProjectTextColor} from '../src/text-color.js';
import {applyAlbumColors} from '../src/album-colors.js';

function layerSvg(project,surface,layer){const svg=renderSvg(project,surface).svg;return svg.slice(svg.indexOf(`<g  transform="translate(${layer.x} ${layer.y})`))}

test('inherited automatic text follows the background of each surface and survives JSON',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/cassette?musicArtist=Artist&bg=131139&color=rainbow');
 p.settings.bgB='#ffffff';const saved=migrate(JSON.parse(JSON.stringify(p)));
 assert.equal(saved.settings.fg,'rainbow');
 assert.equal(saved.surfaces.labelA.find(l=>l.source==='artist').color,'rainbow');
 assert.match(layerSvg(saved,'labelA',saved.surfaces.labelA.find(l=>l.source==='artist')),/fill="#ffffff"/);
 assert.match(layerSvg(saved,'labelB',saved.surfaces.labelB.find(l=>l.source==='artist')),/fill="#000000"/);
});

test('changing the shared color preserves explicitly colored layers and restores clear text',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/cassette?musicArtist=Artist&color=clear');
 const custom=makeLayer('text',{text:'Custom',color:'#ff0000',referenceOwnColor:true});p.surfaces.labelA.push(custom);
 const artist=p.surfaces.labelA.find(l=>l.source==='artist');assert.equal(artist.visible,false);
 setProjectTextColor(p,'rainbow');assert.equal(artist.visible,true);assert.equal(artist.color,'rainbow');assert.equal(custom.color,'#ff0000');
});

test('clear inherited spine text does not hide the independently colored album',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?'+new URLSearchParams({musicArtist:'Artist',musicAlbum:'Album',color:'clear',fc:'...ff0000',f3:'1.2s.7.2s.0'}));
 const spine=p.surfaces.outer.find(l=>l.referenceSpine);assert.equal(spine.visible,true);assert.equal(spine.color,'transparent');assert.equal(spine.albumStyle.color,'#ff0000');
 assert.match(renderSvg(p,'outer').svg,/<tspan[^>]+fill="#ff0000"[^>]*>Album/);
});

test('album color picking changes an inherited album style but retains its own section color',()=>{
 for(const own of [false,true]){
  const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?'+new URLSearchParams({musicArtist:'Artist',musicAlbum:'Album',f3:'1.2s.7.2s.0',...(own?{fc:'...00ff00'}:{})}));
  applyAlbumColors(p,{bg:'#ff0000',fg:'#000000'});
  assert.equal(p.surfaces.outer.find(l=>l.referenceSpine).albumStyle.color,own?'#00ff00':'rainbow');
 }
});

test('new album colors keep automatic text active for later background edits',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/cassette?musicArtist=Artist&bg=131139&color=rainbow');
 applyAlbumColors(p,{bg:'#ffffff',fg:'#000000'});
 assert.equal(p.settings.fg,'rainbow');assert.match(renderSvg(p,'labelA').svg,/fill="#000000"/);
 p.settings.bg='#131139';const saved=migrate(JSON.parse(JSON.stringify(p)));
 assert.equal(saved.surfaces.labelA.find(l=>l.source==='artist').color,'rainbow');
 assert.match(layerSvg(saved,'labelA',saved.surfaces.labelA.find(l=>l.source==='artist')),/fill="#ffffff"/);
});

test('automatic tint produces valid QR and barcode colors on dark and light backgrounds',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?'+new URLSearchParams({bg:'131139',bv:'1',cid:'5901234123457',bcz:'1',qr:'50.50.100.0.front',qcz:'1'}));
 const code=p.surfaces.outer.find(l=>l.type==='barcode');assert.equal(code.color,'rainbow');
 assert.equal(renderSvg(p,'outer').warnings.length,0);
 const saved=migrate(JSON.parse(JSON.stringify(p)));assert.equal(saved.surfaces.outer.find(l=>l.type==='barcode').color,'rainbow');
 saved.settings.bg='#ffffff';assert.equal(renderSvg(saved,'outer').warnings.length,0);
});

test('album-specific shadow has a separate SVG filter',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?'+new URLSearchParams({musicArtist:'Artist',musicAlbum:'Album',f3:'1.2s.7.2s.8'}));
 const svg=renderSvg(p,'outer').svg;assert.match(svg,/<filter id="[^"]+-album-shadow"/);assert.match(svg,/<tspan[^>]+filter="url\(#[^)]+-album-shadow\)"/);
});

test('tinted codes follow shared colors while explicit and untinted code colors stay unchanged',()=>{
 for(const [flags,expected]of [[{bcz:'1'},'#0000ff'],[{bcz:'1',bcc:'ff0000'},'#ff0000'],[{},'#000000']]){
  const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?'+new URLSearchParams({color:'ff0000',bv:'1',cid:'5901234123457',...flags}));
  setProjectTextColor(p,'#0000ff');assert.equal(p.surfaces.outer.find(l=>l.type==='barcode').color,expected);
  applyAlbumColors(p,{bg:'#ffffff',fg:'#000000'});
  assert.equal(p.surfaces.outer.find(l=>l.type==='barcode').color,flags.bcc?'#ff0000':'#000000');
 }
});

test('apply to all text removes old own-color overrides and restores text hidden by clear',()=>{
 const p=createProject();importReference(p,'https://vhs.texs.org/en/jcard?'+new URLSearchParams({color:'clear',musicArtist:'Artist',musicAlbum:'Album',fc:'...ff0000',f3:'1.2s.7.2s.0'}));
 setProjectTextColor(p,'#0000ff',{all:true});
 const spine=p.surfaces.outer.find(l=>l.referenceSpine);assert.equal(spine.albumStyle.color,'#0000ff');assert.equal(spine.referenceAlbumOwnColor,false);
 setProjectTextColor(p,'rainbow');assert.equal(spine.albumStyle.color,'rainbow');
 assert.ok(p.surfaces.outer.filter(l=>l.referenceHiddenByTextColor).every(l=>l.visible));
});
