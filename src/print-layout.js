// All coordinates are millimetres; PDF and browser printing share this plan.
export function printLayout(items,{mode='jcard',paper='a4',copies=1,bleed=0,sheet='auto',offsetX=0,offsetY=0,duplexFlip='long'}={}){
 const sizes={a4:[210,297],letter:[215.9,279.4],a3:[297,420],legal:[215.9,355.6],tabloid:[279.4,431.8]};
 let [w,h]=sizes[paper]||[Math.max(...items.map(i=>i.w))+20,Math.max(...items.map(i=>i.h))+20];
 if(sheet==='12up'&&mode==='label')[w,h]=sizes.letter;
 if(mode==='jcard'&&items[0].w>w-20&&items[0].w<=h-20)[w,h]=[h,w];
 const pages=[[]];const add=(item,x,y,rotation=0,clip)=>pages.at(-1).push({item,x:x+Number(offsetX),y:y+Number(offsetY),rotation,...(clip?{clip:{...clip,x:clip.x+Number(offsetX),y:clip.y+Number(offsetY)}}:{})});
 copies=Math.max(1,Math.min(30,Math.floor(Number(copies)||1)));
 if(mode==='jcard'){
  const slots=sheet==='2up'?2:1;
  for(let c=0;c<copies;c+=slots)for(let i=0;i<items.length;i++){
   const r=items[i];if(r.w>w-20||r.h>h-20)throw Error('Макет не помещается на лист. Выберите лист по размеру макета.');
   if(slots===2&&r.h*2+10>h-20)throw Error('Два вкладыша не помещаются на лист. Выберите больший лист или одну копию на страницу.');
   if(pages.at(-1).length)pages.push([]);
   // Exporting the current inside still needs the same binding-edge rotation
   // as the inside of a complete pair. Unnamed legacy items retain pair order.
   const reverse=r.s==='inner'||(!r.s&&i%2===1);
   const rotate=reverse&&((w>h&&duplexFlip==='long')||(w<=h&&duplexFlip==='short'));
   for(let slot=0;slot<Math.min(slots,copies-c);slot++){
    const y=slots===1?(h-r.h)/2:(h-2*r.h-10)/2+slot*(r.h+10);
    add(i,(w-r.w)/2,rotate?h-r.h-y:y,rotate?180:0);
   }
  }
 }else if(sheet==='12up'){
  if(items.some(r=>Math.abs(r.w-2*bleed-88.6)>.05||Math.abs(r.h-2*bleed-41.8)>.05))throw Error('Для 12 наклеек используйте размер 88,6 × 41,8 мм.');
  // Centers from the public Letter 12-up template, specified at 600 dpi.
  const unit=25.4/600,columns=[1352,3745].map(x=>x*unit),rows=[824,1816,2808,3800,4792,5783].map(y=>y*unit);
  for(let n=0;n<copies*items.length;n++){
   const slot=n%12;if(n&&slot===0)pages.push([]);
   const item=n%items.length,r=items[item],column=slot%2,row=Math.floor(slot/2),x=columns[column]-r.w/2,y=rows[row]-r.h/2;
   const left=column?(columns[0]+columns[1])/2:0,right=column?w:(columns[0]+columns[1])/2,top=row?(rows[row-1]+rows[row])/2:0,bottom=row===5?h:(rows[row]+rows[row+1])/2;
   const clip=bleed?{x:Math.max(x,left),y:Math.max(y,top),w:Math.min(x+r.w,right)-Math.max(x,left),h:Math.min(y+r.h,bottom)-Math.max(y,top)}:undefined;
   add(item,x,y,0,clip);
  }
 }else{
  let x=10,y=10,rowH=0;
  for(let c=0;c<copies;c++)for(let i=0;i<items.length;i++){
   const r=items[i];if(r.w>w-20||r.h>h-20)throw Error('Наклейка не помещается на лист.');
   if(x+r.w>w-10){x=10;y+=rowH+5;rowH=0}
   if(y+r.h>h-10){pages.push([]);x=10;y=10;rowH=0}
   add(i,x,y);x+=r.w+5;rowH=Math.max(rowH,r.h);
  }
 }
 for(const page of pages)for(const pos of page){const r=items[pos.item];if(pos.x<0||pos.y<0||pos.x+r.w>w+.001||pos.y+r.h>h+.001)throw Error('Смещение выводит макет за пределы листа.')}
 return {w,h,pages};
}
