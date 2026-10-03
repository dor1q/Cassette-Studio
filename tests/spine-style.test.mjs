import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,importReference} from '../src/model.js';
import {albumTextStyle,changeAlbumTextStyle,inheritAlbumTextColor,resetAlbumTextStyle} from '../src/spine-style.js';
import {applyAlbumColors} from '../src/album-colors.js';
import {renderSvg} from '../src/render.js';

function spine(){const project=importReference(createProject(),'https://vhs.texs.org/en/jcard?musicArtist=Artist&musicAlbum=Album&f2=1.2s.4.2s.0&f3=2.2s.7.2s.0');return {project,layer:project.surfaces.outer.find(layer=>layer.referenceSpine)}}

test('album typography edits preserve the artist style and appear in the rendered spine',()=>{
 const {project,layer}=spine(),original=layer.font;
 assert.equal(changeAlbumTextStyle(layer,'font','Georgia'),true);changeAlbumTextStyle(layer,'size',4);changeAlbumTextStyle(layer,'italic',true);
 assert.equal(layer.font,original);assert.equal(albumTextStyle(layer).font,'Georgia');
 const svg=renderSvg(project,'outer').svg;
 assert.match(svg,/<tspan font-family="Georgia" font-size="4"[^>]*font-style="italic"/);
});

test('album own color survives a new cover palette, and auto color follows the palette again',()=>{
 const {project,layer}=spine();changeAlbumTextStyle(layer,'color','#ff6600');
 applyAlbumColors(project,{bg:'#112233',fg:'#ffffff'});assert.equal(layer.albumStyle.color,'#ff6600');
 inheritAlbumTextColor(layer,project.settings.fg);applyAlbumColors(project,{bg:'#fafafa',fg:'#000000'});
 assert.equal(layer.referenceAlbumOwnColor,false);assert.equal(layer.albumStyle.color,project.settings.fg);
});

test('album and artist letter casing can be changed independently in both directions',()=>{
 const {project,layer}=spine();project.data.album='Mixed Case Album';
 layer.uppercase=true;changeAlbumTextStyle(layer,'uppercase',false);
 let svg=renderSvg(project,'outer').svg;
 assert.match(svg,/>ARTIST/);assert.match(svg,/<tspan[^>]*>Mixed Case Album<\/tspan>/);assert.doesNotMatch(svg,/>MIXED CASE ALBUM</);
 layer.uppercase=false;changeAlbumTextStyle(layer,'uppercase',true);svg=renderSvg(project,'outer').svg;
 assert.match(svg,/>Artist/);assert.match(svg,/<tspan[^>]*>MIXED CASE ALBUM<\/tspan>/);
});

test('reset returns album style to artist style and invalid or locked edits leave the layer intact',()=>{
 const {layer}=spine();assert.equal(changeAlbumTextStyle(layer,'size',NaN),false);changeAlbumTextStyle(layer,'size',1000);assert.equal(layer.albumStyle.size,100);
 layer.locked=true;const saved=JSON.stringify(layer);assert.equal(changeAlbumTextStyle(layer,'font','Arial'),false);assert.equal(resetAlbumTextStyle(layer),false);assert.equal(JSON.stringify(layer),saved);
 layer.locked=false;assert.equal(resetAlbumTextStyle(layer),true);assert.equal(layer.albumStyle,undefined);assert.equal(albumTextStyle(layer).font,layer.font);
});
