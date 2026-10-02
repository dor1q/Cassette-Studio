import test from 'node:test';
import assert from 'node:assert/strict';
import {playerEmbed} from '../src/player.js';

test('music links create safe embeds without forwarding query parameters',()=>{
 assert.deepEqual(playerEmbed('https://open.spotify.com/album/5SknXhmjHijD0uU1Pm2HBr?si=test'),{service:'Spotify',url:'https://open.spotify.com/embed/album/5SknXhmjHijD0uU1Pm2HBr'});
 assert.deepEqual(playerEmbed('https://music.apple.com/us/album/example/12345?uo=4'),{service:'Apple Music',url:'https://embed.music.apple.com/us/album/example/12345'});
 assert.deepEqual(playerEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),{service:'YouTube',url:'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'});
 assert.equal(playerEmbed('https://open.spotify.com.evil.example/album/5SknXhmjHijD0uU1Pm2HBr'),null);
 assert.equal(playerEmbed('javascript:alert(1)'),null);
});

test('Apple playlist embeds use normalized public IDs and retain the storefront',()=>{
 const editorial='pl.f4d106fed2bd41149aaacabb233eb5eb',user='pl.u-90gLTG0Me1';
 for(const raw of [`https://music.apple.com/gb/playlist/todays-hits/${editorial}?l=en-GB&uo=4`,`music.apple.com/gb/playlist/${editorial}`]){
  assert.deepEqual(playerEmbed(raw),{service:'Apple Music',url:`https://embed.music.apple.com/gb/playlist/${editorial}`});
 }
 assert.deepEqual(playerEmbed(`https://music.apple.com/us/playlist/user-list/${user}`),{service:'Apple Music',url:`https://embed.music.apple.com/us/playlist/${user}`});
 assert.equal(playerEmbed('https://music.apple.com/us/playlist/list/pl.123'),null);
 assert.equal(playerEmbed(`https://music.apple.com.evil.example/us/playlist/list/${editorial}`),null);
});
