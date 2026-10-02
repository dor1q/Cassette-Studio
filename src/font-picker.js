export async function fontPicker({modal,request,esc,apply}){
 modal('Google Fonts','<p>Загрузка каталога…</p>');
 const $=id=>document.getElementById(id);
 try{
 const catalog=await request('/api/fonts');
 modal('Google Fonts','<label class="field">Поиск шрифта<input id="fontSearch" placeholder="Teko, Montserrat, Noto Sans…"></label><label class="inlinecheck"><input id="fontCyrillic" type="checkbox">Только с кириллицей</label><p class="hint">Выбранное начертание сохраняется в проекте и доступно без интернета.</p><div id="fontResults" style="max-height:45vh;overflow:auto"></div><p id="fontStatus" role="status"></p>');
 function results(){
 const found=catalog.filter(f=>f.name.toLowerCase().includes($('fontSearch').value.toLowerCase())&&(!$('fontCyrillic').checked||f.cyrillic));
 $('fontResults').innerHTML=`<p>${found.length} шрифтов${found.length>80?' · уточните поиск':''}</p>`+found.slice(0,80).map((f,i)=>`<div class="projectrow"><b>${esc(f.name)}</b><small>${esc(f.category)}${f.cyrillic?' · Кириллица':''}</small><select id="variant${i}" aria-label="Начертание ${esc(f.name)}">${f.variants.map(v=>`<option value="${v}" ${v==='400'?'selected':''}>${parseInt(v,10)}${v.endsWith('i')?' курсив':''}</option>`).join('')}</select><button data-google-font="${i}">Применить ${esc(f.name)}</button></div>`).join('');
 document.querySelectorAll('[data-google-font]').forEach(b=>b.onclick=async()=>{
 const i=Number(b.dataset.googleFont),name=found[i].name,variant=$('variant'+i).value;
 b.disabled=true;$('fontStatus').textContent='Загрузка '+name+'…';
 try{const f=await request('/api/font?'+new URLSearchParams({name,variant}));const face=new FontFace(f.name,`url(${f.data})`,{weight:String(f.weight),style:f.style});await face.load();document.fonts.add(face);await apply(f);$('modal').close()}
 catch(e){$('fontStatus').textContent=e.message;b.disabled=false}
 });
 }
 $('fontSearch').oninput=results;$('fontCyrillic').onchange=results;results();$('fontSearch').focus();
 }catch(e){$('modalBody').textContent=e.message}
}
