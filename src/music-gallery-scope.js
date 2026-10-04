import {parseMusicLink} from '../music-links.mjs';

// A gallery index identifies an image only within one musical source.
export function musicGalleryScope({url='',id='',artist='',album='',cover=''}={}){
 if(url)try{return JSON.stringify(['url',parseMusicLink(url).url])}catch{}
 if(id)return JSON.stringify(['id',String(id).slice(0,2000)]);
 if(album)return JSON.stringify(['album',String(artist).slice(0,300),String(album).slice(0,300),String(cover).slice(0,2000)]);
 if(cover)return JSON.stringify(['cover',String(cover).slice(0,2000)]);
 return '';
}
