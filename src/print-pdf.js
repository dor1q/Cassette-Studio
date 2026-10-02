function rotateCanvas(source){
 const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
 const ctx=canvas.getContext('2d');ctx.translate(canvas.width,canvas.height);ctx.rotate(Math.PI);ctx.drawImage(source,0,0);return canvas;
}

export function writePrintPages(doc,items,plan,rotate=rotateCanvas){
 for(let page=0;page<plan.pages.length;page++){
  if(page)doc.addPage([plan.w,plan.h],plan.w>plan.h?'landscape':'portrait');
  for(const pos of plan.pages[page]){
   const item=items[pos.item],canvas=pos.rotation?rotate(item.canvas):item.canvas;
   if(pos.clip){doc.saveGraphicsState();doc.rect(pos.clip.x,pos.clip.y,pos.clip.w,pos.clip.h,null);doc.clip();doc.discardPath()}
   doc.addImage(canvas.toDataURL('image/png'),'PNG',pos.x,pos.y,item.w,item.h,undefined,'FAST');
   if(pos.clip)doc.restoreGraphicsState();
  }
 }
}
