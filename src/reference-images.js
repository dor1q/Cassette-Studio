import {makeLayer,dimensions} from './model.js';
import {REFERENCE_UNIT} from './reference-format.js';
import {applyAlbumArt,applyReferenceArtwork,albumArtLayer,referenceArtworkKey} from './album-art.js';
import {loadReferenceImage,referenceImageSource,referenceImageDimensions} from './reference-image-source.js';

export async function restoreReferenceCover(project,params,request,mode='jcard',cached=[],getDimensions=referenceImageDimensions){
 const source=referenceImageSource(params.get('cp'));
 if(!source||params.get('mp')==='_')return {handled:false,restored:0,missing:0};
 let data,error='';try{data=await loadReferenceImage(source,request,getDimensions,cached)}catch(e){error=e.message}
 applyAlbumArt(project,data?.src||'',mode==='label'?'A':'both');if(mode==='label')applyAlbumArt(project,data?.src||'','B');
 for(const surface of mode==='label'?['labelA','labelB']:['outer']){
  const layer=albumArtLayer(project,surface);layer.referenceAssetKey=source;
  if(!data){layer.missingReference=true;layer.name='Обложка из ссылки — замените файл'}
 }
 const upload=project.uploads.find(u=>u.category==='albumCover');upload.referenceAssetKey=source;
 applyReferenceArtwork(project,params,data?.w||600,data?.h||600,mode);
 project.referenceArtworkSource=referenceArtworkKey(new URL('https://vhs.texs.org/en/'+(mode==='label'?'cassette':'jcard')+'?'+params));
 return {handled:true,restored:data?1:0,missing:data?0:1,error};
}

export async function restoreReferenceLogo(project,params,request,mode='jcard',cached=[],getDimensions=referenceImageDimensions){
 if(params.get('cl')==='hidden')return {restored:0,missing:0};
 const source=referenceImageSource(params.get('cl')||'/_music_logo_defaults/lofi-stereo.png');
 if(!source)return {restored:0,missing:0};
 let data;try{data=await loadReferenceImage(source,request,getDimensions,cached)}catch{}
 const label=mode==='label',surfaces=label?['labelA','labelB']:['outer'];
 for(const surface of surfaces){
  const W=dimensions(project,surface).w,H=dimensions(project,surface).h;
  let frame;
  if(label){const w=W*.12,h=data?w*data.h/data.w:w;frame={x:5*W/251.16,y:H*.55-h/2,w,h}}
  else{const size=220*REFERENCE_UNIT*project.layout.spine/(300*REFERENCE_UNIT);frame={x:project.layout.flap+(project.layout.spine-size)/2,y:26*REFERENCE_UNIT,w:size,h:size,cropRotation:90}}
  const layer=makeLayer('image',{category:'studio',source:label?'referenceLogo':'referenceSpineLogo',name:data?'Логотип из ссылки':'Логотип из ссылки — замените файл',src:data?.src||'',referenceAssetKey:source,fit:'meet',missingReference:!data,...frame}),layers=project.surfaces[surface],at=layers.findIndex(l=>l.referenceDecalLayer==='over'||['referenceText','referenceCode','spotifyCode'].includes(l.category));
  layers.splice(at<0?layers.length:at,0,layer);
 }
 return {restored:data?1:0,missing:data?0:1};
}
