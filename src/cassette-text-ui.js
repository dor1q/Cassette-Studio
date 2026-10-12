export function cassetteTextOverflowControls(layer,{propCheck}){
 if(layer?.type!=='text')return '';
 return '<details class="inspector-details"><summary>Переносы и границы текста</summary>'+propCheck('Без переноса строк','nowrap')+propCheck('Обрезать по рамке','clipText')+'<p class="hint">В ссылках оригинала названия наклеек сохраняют одну строку, а список треков обрезается по рамке. Для уменьшения текста включите вписывание; для переноса отключите «Без переноса строк».</p></details>';
}
