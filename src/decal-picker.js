import {exportImageAsset} from './image-asset-export.js';
export async function remix(parts,ratio,seed=1){
 const images=await Promise.all(parts.map(src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Не удалось открыть часть фактуры'));image.src=src})));
 const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=Math.round(2048/ratio);const c=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
 let randomState=Number(seed)>>>0;const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296};
 c.fillStyle='#000';c.fillRect(0,0,W,H);c.globalCompositeOperation='screen';
 const edge=Math.min(90,H*.08);c.drawImage(images[0],0,0,W,edge);c.drawImage(images[1],0,H-edge,W,edge);
 for(const base of [.25,.67]){const x=base+(seed===1?0:(random()-.5)*.2);c.drawImage(images[2],x*W-28,0,56,H)}
 c.globalAlpha=.72;c.drawImage(images[3],W*.05,H*.12,W*.39,H*.72);c.drawImage(images[4],W*.55,H*.08,W*.33,H*.8);
 c.globalAlpha=.18;for(let x=0;x<W;x+=512)for(let y=0;y<H;y+=512)c.drawImage(images[5],x,y,512,512);
 return canvas.toDataURL('image/png');
}
export async function decalPicker({modal,request,esc,apply,initialCategory='popular',ratio=1.65}){
 const $=id=>document.getElementById(id);modal('Библиотека декалей','<p>Загрузка…</p>');
 try{const catalog=await request('/api/decals');
 modal('Библиотека декалей',`<div class="two"><label class="field">Категория<select id="decalCategory"><option value="popular">Популярные</option><option value="all">Все категории</option>${catalog.map(c=>`<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}</select></label><label class="field">Поиск декали<input id="decalSearch" placeholder="stereo, cassette, rock…"></label></div><label class="field">При выборе картинки<select id="decalOperation"><option value="place">Добавить на макет</option><option value="download">Скачать PNG в исходном размере</option><option value="copy">Копировать картинку</option></select></label><div id="decalResults" class="tiles" style="max-height:55vh;overflow:auto"></div><p id="decalStatus" role="status"></p>`);
 function results(){const cat=$('decalCategory').value,q=$('decalSearch').value.toLowerCase(),items=catalog.flatMap(c=>c.items.map(i=>({...i,category:c.id}))).filter(i=>(cat==='all'||cat==='popular'&&i.popular||cat===i.category)&&i.name.toLowerCase().includes(q));
 $('decalResults').innerHTML=items.map((i,n)=>`<button data-catalog-decal="${n}"><img loading="lazy" src="${esc(i.thumb)}" alt="${esc(i.name)}">${esc(i.name)}</button>`).join('');$('decalStatus').textContent=items.length+' изображений';
 document.querySelectorAll('[data-catalog-decal]').forEach(b=>b.onclick=async()=>{const item=items[Number(b.dataset.catalogDecal)],operation=$('decalOperation').value;b.disabled=true;$('decalStatus').textContent='Загрузка изображения…';try{const image=await request('/api/decal?'+new URLSearchParams({category:item.category,id:item.id}));if(image.parts){image.src=await remix(image.parts,ratio);delete image.parts}if(operation==='place'){await apply(image);$('modal').close()}else{const size=await exportImageAsset({...image,name:item.name},operation==='copy');$('decalStatus').textContent=(operation==='copy'?'Скопировано':'PNG подготовлен')+` · ${size.width} × ${size.height} px`;b.disabled=false}}catch(e){$('decalStatus').textContent=e.message;b.disabled=false}});
 }
 $('decalCategory').value=initialCategory;$('decalCategory').onchange=results;$('decalSearch').oninput=results;results();
 }catch(e){$('modalBody').textContent=e.message}
}
