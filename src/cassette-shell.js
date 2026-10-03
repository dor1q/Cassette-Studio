// Physical dimensions measured from the public cassette body template, in points.
export const CASSETTE_POINT=25.4/72;
export const CASSETTE_SHELL=Object.freeze({width:285.12,height:182.04,radius:6,labelX:16.98,labelY:16.88});
export const CASSETTE_BODY_RECT=Object.freeze({x:5.34,y:15.42,w:272.88,h:116.76});
export const CASSETTE_PRINT_AREAS=Object.freeze(['label','body','full']);

export function cassettePrintArea(value){return CASSETTE_PRINT_AREAS.includes(value)?value:'label'}
export function cassetteDimensions(layout){
 return cassettePrintArea(layout.printArea)==='label'?{w:layout.labelW,h:layout.labelH}:{w:CASSETTE_SHELL.width*CASSETTE_POINT,h:CASSETTE_SHELL.height*CASSETTE_POINT};
}
export function cassetteArtworkOffset(area){
 return cassettePrintArea(area)==='label'?{x:0,y:0}:{x:CASSETTE_SHELL.labelX*CASSETTE_POINT,y:CASSETTE_SHELL.labelY*CASSETTE_POINT};
}

function rectangle(x,y,w,h,r=0){
 if(w<=0||h<=0)return '';
 r=Math.min(Math.max(0,r),w/2,h/2);
 if(!r)return `M${x},${y}H${x+w}V${y+h}H${x}Z`;
 return `M${x+r},${y}H${x+w-r}A${r},${r} 0 0,1 ${x+w},${y+r}V${y+h-r}A${r},${r} 0 0,1 ${x+w-r},${y+h}H${x+r}A${r},${r} 0 0,1 ${x},${y+h-r}V${y+r}A${r},${r} 0 0,1 ${x+r},${y}Z`;
}
function circle(x,y,r){return r>0?`M${x-r},${y}a${r},${r} 0 1,0 ${r*2},0a${r},${r} 0 1,0 ${-r*2},0Z`:''}
function pointRectangle(x,y,w,h,r,bleed=0){
 return rectangle(x*CASSETTE_POINT+bleed,y*CASSETTE_POINT+bleed,w*CASSETTE_POINT-bleed*2,h*CASSETTE_POINT-bleed*2,Math.max(0,r*CASSETTE_POINT-bleed));
}
function pointCircle(x,y,r,bleed=0){return circle(x*CASSETTE_POINT,y*CASSETTE_POINT,r*CASSETTE_POINT-bleed)}

export function cassetteShellOutline(bleed=0){
 return rectangle(-bleed,-bleed,CASSETTE_SHELL.width*CASSETTE_POINT+bleed*2,CASSETTE_SHELL.height*CASSETTE_POINT+bleed*2,CASSETTE_SHELL.radius*CASSETTE_POINT+bleed);
}
export function cassetteBodyOutline(bleed=0){
 const {x,y,w,h}=CASSETTE_BODY_RECT;
 return rectangle(x*CASSETTE_POINT-bleed,y*CASSETTE_POINT-bleed,w*CASSETTE_POINT+bleed*2,h*CASSETTE_POINT+bleed*2);
}
export function cassetteShellCutouts(area='full',bleed=0){
 let result=pointCircle(82.86,83.7,17.88,bleed)+pointCircle(202.62,83.7,17.88,bleed)+pointRectangle(109.08,65.4,66.84,36.12,0,bleed);
 if(area==='full')result+=pointRectangle(97.32,163.92,7.92,7.92,1.8,bleed)+pointRectangle(177.84,163.92,7.92,7.92,1.8,bleed)+pointCircle(73.74,171.54,5.16,bleed)+pointCircle(210.06,171.54,5.16,bleed);
 return result;
}
export function cassetteShellCutPath(area='full',bleed=0){
 return (area==='body'?cassetteBodyOutline(bleed):cassetteShellOutline(bleed))+cassetteShellCutouts(area,bleed);
}
export function cassetteShellTrapezoid(){
 return [[44.6,182.04],[53.3,136.9],[231.8,136.9],[240.5,182.04]].map(([x,y],i)=>`${i?'L':'M'}${x*CASSETTE_POINT},${y*CASSETTE_POINT}`).join('')+'Z';
}

// Keep all editable layer positions in the coordinate system shown by the canvas.
// Ordinary artwork stays in its label location; full-frame pictures cover the shell.
export function setCassettePrintArea(project,value){
 const before=cassettePrintArea(project.layout.printArea),after=cassettePrintArea(value);
 if(before===after){project.layout.printArea=after;return project}
 const oldSize=cassetteDimensions({...project.layout,printArea:before}),newSize=cassetteDimensions({...project.layout,printArea:after});
 const oldOffset=cassetteArtworkOffset(before),newOffset=cassetteArtworkOffset(after);
 const dx=newOffset.x-oldOffset.x,dy=newOffset.y-oldOffset.y;
 for(const surface of ['labelA','labelB'])for(const layer of project.surfaces[surface]||[]){
  const fillsCanvas=layer.type==='image'&&Math.abs(layer.x)<.001&&Math.abs(layer.y)<.001&&Math.abs(layer.w-oldSize.w)<.001&&Math.abs(layer.h-oldSize.h)<.001;
  if(fillsCanvas){layer.x=0;layer.y=0;layer.w=newSize.w;layer.h=newSize.h}
  else{layer.x+=dx;layer.y+=dy}
 }
 project.layout.printArea=after;
 return project;
}
