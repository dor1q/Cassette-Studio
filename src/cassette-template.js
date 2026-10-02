// Dimensions taken from the public Cassette Label SVG (251.16 × 118.43 units).
export const CASSETTE_TEMPLATE={labelW:88.6,labelH:41.8,holeW:170.53*88.6/251.16,holeH:42.84*41.8/118.43,holeY:45.4*41.8/118.43,holeOffsetX:-.235*88.6/251.16,hole:true};

export function cassetteOutline(width,height,bleed=0){
 const cornerX=9.2*width/251.16,cornerY=9.2*height/118.43;
 // Offset the diagonal as well as the four straight edges when adding bleed.
 const topX=cornerX+bleed*(cornerX/cornerY-Math.hypot(1,cornerX/cornerY));
 const leftY=cornerY+bleed*(cornerY/cornerX-Math.hypot(1,cornerY/cornerX));
 return `M${-bleed},${height+bleed}V${leftY}L${topX},${-bleed}H${width-topX}L${width+bleed},${leftY}V${height+bleed}Z`;
}

export function cassetteWindowPath(layout,bleed=0){
 if(!layout.hole)return '';
 const w=Math.max(0,layout.holeW-2*bleed),h=Math.max(0,layout.holeH-2*bleed);
 if(!w||!h)return '';
 const x=(layout.labelW-layout.holeW)/2+(layout.holeOffsetX||0)+bleed,y=layout.holeY+bleed;
 const radius=Math.min(w/2,h/2),control=radius*11.82/21.42,right=x+w,bottom=y+h;
 // Match the public template's capsule curves; keep the same shape for custom sizes.
 return `M${x+radius},${y}H${right-radius}C${right-radius+control},${y} ${right},${y+radius-control} ${right},${y+radius}V${bottom-radius}C${right},${bottom-radius+control} ${right-radius+control},${bottom} ${right-radius},${bottom}H${x+radius}C${x+radius-control},${bottom} ${x},${bottom-radius+control} ${x},${bottom-radius}V${y+radius}C${x},${y+radius-control} ${x+radius-control},${y} ${x+radius},${y}Z`;
}

export function cassetteCutPath(layout,bleed=0){
 return cassetteOutline(layout.labelW,layout.labelH,bleed)+cassetteWindowPath(layout,bleed);
}
