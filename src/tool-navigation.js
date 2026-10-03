export const TOOL_PANELS=Object.freeze({
 text:['Текст','Названия, подписи и текстовые блоки.'],
 tracks:['Треки','Редактирование списка и распределение по сторонам.'],
 art:['Обложка','Картинка альбома, её размер и положение.'],
 background:['Фон','Цвет, изображение или текстура под элементами.'],
 overlay:['Наложения','Текстуры и эффекты поверх оформления.'],
 studio:['Маркировка','Лейблы, логотипы и технические обозначения.'],
 decals:['Декор и фигуры','Графические элементы, наклейки и фигуры.'],
 codes:['Коды','Ссылки, QR-коды, штрихкоды и Spotify Code.'],
 layout:['Размеры и окно','Размеры печати, панели, сгибы и вырезы.'],
 layers:['Слои','Выбор, порядок, видимость и закрепление элементов.']
});

export function bindToolNavigation(nav,{title,hint}={}){
 const groups=[...nav.querySelectorAll('[data-tool-group]')];
 const update=tab=>{
  const button=[...nav.querySelectorAll('[data-tab]')].find(item=>item.dataset.tab===tab);
  if(!button||!TOOL_PANELS[tab])return false;
  const group=button.closest('[data-tool-group]');
  for(const section of groups)section.open=section===group;
  if(title)title.textContent=TOOL_PANELS[tab][0];
  if(hint)hint.textContent=TOOL_PANELS[tab][1];
  return true;
 };
 nav.addEventListener('toggle',event=>{
  const opened=event.target;
  if(!groups.includes(opened)||!opened.open)return;
  for(const section of groups)if(section!==opened)section.open=false;
 },true);
 nav.addEventListener('click',event=>{
  const button=event.target.closest('[data-tab]');
  if(button&&nav.contains(button))update(button.dataset.tab);
 });
 return update;
}
