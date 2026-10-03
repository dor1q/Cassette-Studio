const keys=['font','size','fontWeight','fontStretch','spacing','color','bold','italic','uppercase','smallcaps','outline','outlineColor','shadow','shadowColor'];
const limits={size:[.1,100],fontWeight:[100,900],fontStretch:[50,200],spacing:[-1,10],outline:[0,2],shadow:[0,5]};
const booleans=new Set(['bold','italic','uppercase','smallcaps']);

export function albumTextStyle(layer){
 return Object.fromEntries(keys.map(key=>[key,layer.albumStyle?.[key]??layer[key]]));
}

export function changeAlbumTextStyle(layer,key,value){
 if(!layer.referenceSpine||layer.locked||!keys.includes(key))return false;
 if(limits[key]){
  value=Number(value);if(!Number.isFinite(value))return false;
  value=Math.max(limits[key][0],Math.min(limits[key][1],value));
 }else if(booleans.has(key))value=!!value;
 else if(typeof value!=='string'||!value.trim())return false;
 layer.albumStyle={...albumTextStyle(layer),[key]:value};
 if(key==='bold')layer.albumStyle.fontWeight=value?700:400;
 if(key==='fontWeight')layer.albumStyle.bold=value>=700;
 if(key==='color')layer.referenceAlbumOwnColor=true;
 return true;
}

export function inheritAlbumTextColor(layer,color){
 if(!changeAlbumTextStyle(layer,'color',color))return false;
 layer.referenceAlbumOwnColor=false;return true;
}

export function resetAlbumTextStyle(layer){
 if(!layer.referenceSpine||layer.locked)return false;
 delete layer.albumStyle;delete layer.referenceAlbumOwnColor;return true;
}
