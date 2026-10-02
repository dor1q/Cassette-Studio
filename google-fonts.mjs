let catalogCache;
export async function fontCatalog(){
 if(catalogCache)return catalogCache;
 const r=await fetch('https://fonts.google.com/metadata/fonts',{signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Каталог шрифтов недоступен');
 const data=JSON.parse((await r.text()).replace(/^\)\]\}'\s*/,''));
 catalogCache=data.familyMetadataList.filter(f=>f.isOpenSource!==false).map(f=>({name:f.family,category:f.category,variants:Object.keys(f.fonts),cyrillic:f.subsets.includes('cyrillic')}));
 return catalogCache;
}
export async function fetchGoogleFont(name,variant='400'){
 const family=(await fontCatalog()).find(f=>f.name===name);
 if(!family||!family.variants.includes(variant))throw Error('Выберите шрифт и начертание из каталога');
 const style=variant.endsWith('i')?'italic':'normal',weight=parseInt(variant,10);
 const css=await fetch('https://fonts.googleapis.com/css?'+new URLSearchParams({family:name+':'+weight+(style==='italic'?'italic':''),subset:'latin,cyrillic'}),{headers:{'User-Agent':'CassetteStudio/2.0'},signal:AbortSignal.timeout(20000)});
 if(!css.ok)throw Error('Не удалось получить шрифт');
 const urls=[...(await css.text()).matchAll(/src:\s*url\((https:[^)]+)\)/g)].map(m=>m[1]);
 if(urls.length!==1)throw Error('Этот формат шрифта пока не поддерживается. Загрузите TTF вручную.');
 const url=new URL(urls[0]);
 if(url.hostname!=='fonts.gstatic.com'||url.protocol!=='https:')throw Error('Неизвестный источник шрифта');
 const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok||Number(r.headers.get('content-length'))>8000000)throw Error('Шрифт недоступен или больше 8 МБ');
 const chunks=[];let size=0;
 for await(const chunk of r.body){size+=chunk.length;if(size>8000000)throw Error('Шрифт больше 8 МБ');chunks.push(chunk)}
 const bytes=Buffer.concat(chunks),signature=bytes.subarray(0,4).toString('hex');
 const format={'00010000':'ttf','4f54544f':'otf','774f4646':'woff','774f4632':'woff2'}[signature];
 if(!format)throw Error('Неизвестный формат шрифта');
 return {name,weight,style,data:`data:font/${format};base64,${bytes.toString('base64')}`};
}
