import {makeLayer} from './model.js';
import {applyAlbumArt,applyReferenceArtwork,albumArtLayer,referenceArtworkKey} from './album-art.js';
import {loadReferenceImage,referenceImageSource,referenceImageDimensions} from './reference-image-source.js';
import {prepareRecordLabelLogo,applyRecordLabelLogo,recordLabelLogoFrames} from './record-label-logo.js';
import {referenceCoverSurfaces} from './reference-format.js';
import {isCDMode} from './media-formats.js';

export async function restoreReferenceCover(project,params,request,mode='jcard',cached=[],getDimensions=referenceImageDimensions){
 const source=referenceImageSource(params.get('cp'));
 if(!source||params.get('mp')==='_')return {handled:false,restored:0,missing:0};
 let data,error='';try{data=await loadReferenceImage(source,request,getDimensions,cached)}catch(e){error=e.message}
 if(isCDMode(mode))applyAlbumArt(project,data?.src||'',{surfaces:referenceCoverSurfaces(mode)});else{applyAlbumArt(project,data?.src||'',mode==='label'?'A':'both');if(mode==='label')applyAlbumArt(project,data?.src||'','B')}
 for(const surface of referenceCoverSurfaces(mode)){
  const layer=albumArtLayer(project,surface);layer.referenceAssetKey=source;
  if(!data){layer.missingReference=true;layer.name='Обложка из ссылки — замените файл'}
 }
 const upload=project.uploads.find(u=>u.category==='albumCover');upload.referenceAssetKey=source;
 applyReferenceArtwork(project,params,data?.w||600,data?.h||600,mode);
 project.referenceArtworkSource=referenceArtworkKey(new URL('https://vhs.texs.org/en/'+({label:'cassette','cd-label':'cd','cd-insert':'cd-insert','cd-tray':'cd-tray'}[mode]||'jcard')+'?'+params));
 return {handled:true,restored:data?1:0,missing:data?0:1,error};
}

export async function restoreReferenceLogo(project,params,request,mode='jcard',cached=[],getDimensions=referenceImageDimensions){
 if(params.get('cl')==='hidden')return {restored:0,missing:0};
 if(!params.get('cl')){
  const prepared=await prepareRecordLabelLogo(project.referenceMusicMetadata||{},request,{cached,getDimensions});
  const result=applyRecordLabelLogo(project,prepared,{mode,surfaces:referenceCoverSurfaces(mode)});
  return {restored:result.updated.length?1:0,missing:prepared.asset?0:1,warnings:prepared.warnings};
 }
 const source=referenceImageSource(params.get('cl')||'/_music_logo_defaults/lofi-stereo.png');
 if(!source)return {restored:0,missing:0};
 let data;try{data=await loadReferenceImage(source,request,getDimensions,cached)}catch{}
 const label=mode==='label',surfaces=referenceCoverSurfaces(mode);
 for(const surface of surfaces){
  const layers=project.surfaces[surface],at=layers.findIndex(l=>l.referenceDecalLayer==='over'||['referenceText','referenceCode','spotifyCode'].includes(l.category));
  const newLayers=recordLabelLogoFrames(project,surface,data).map(frame=>makeLayer('image',{category:'studio',source:label?'referenceLogo':'referenceSpineLogo',name:data?'Логотип из ссылки':'Логотип из ссылки — замените файл',src:data?.src||'',referenceAssetKey:source,referenceLogoExplicit:true,fit:'meet',missingReference:!data,...frame}));
  layers.splice(at<0?layers.length:at,0,...newLayers);
 }
 return {restored:data?1:0,missing:data?0:1};
}
