import test from 'node:test';
import assert from 'node:assert/strict';
import {exactAlbumMatches,uniqueExactAlbum} from '../catalog-match.mjs';

test('Spotify title matches one exact catalog release across apostrophe styles',()=>{
 const matches=[{album:'London’s Saviour',artist:'fakemink',id:'one'},{album:'Saviour',artist:'Other',id:'two'}];
 assert.equal(uniqueExactAlbum("London's Saviour",matches)?.id,'one');
 const ambiguous=[matches[0],{...matches[0],id:'alternate'}];
 assert.equal(exactAlbumMatches('London’s Saviour',ambiguous).length,2);
 assert.equal(uniqueExactAlbum('London’s Saviour',ambiguous),null);
 assert.equal(uniqueExactAlbum('Unknown',matches),null);
});
