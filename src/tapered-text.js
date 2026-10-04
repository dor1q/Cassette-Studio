export function taperedInsets(layer,size,index,y=(index+.5)*size*layer.lineHeight){
 const height=layer.h;
 return {left:Math.min(layer.w*.9,layer.w*Math.max(0,1-y/(height*.2))),right:layer.trackOptions?.showProduction?0:Math.min(layer.w*.9,layer.w*Math.max(0,(y-height*.85)/(height*.15)))};
}

export function wrapTaperedText(value,layer,size,wrapLine){
 const lines=[];
 for(const paragraph of value.split('\n')){
  if(!paragraph){lines.push('');continue}
  let remaining=paragraph;
  while(remaining){
   const inset=taperedInsets(layer,size,lines.length),width=Math.max(size,layer.w-inset.left-inset.right);
   const wrapped=wrapLine(remaining,layer,size,width),line=wrapped[0];
   lines.push(line);remaining=wrapped.slice(1).join(' ');
  }
 }
 return lines;
}
