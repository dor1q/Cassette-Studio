export const IMAGE_BLEND_MODES=['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'];

// A single SVG pattern fills the image frame; the normal layer/cassette clips
// still apply. Keeping the image embedded also makes exported files standalone.
export function imageTileSvg(layer,id){
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const w=layer.tileWidth||layer.w,h=layer.tileHeight||layer.h;
 const transform=`translate(${layer.w/2+(layer.cropX||0)} ${layer.h/2+(layer.cropY||0)}) scale(${layer.cropZoom||1}) rotate(${layer.cropRotation||0}) translate(${-layer.w/2} ${-layer.h/2})`;
 return {
  defs:`<pattern id="${id}-tile" patternUnits="userSpaceOnUse" width="${w}" height="${h}" patternTransform="${transform}"><image href="${escape(layer.src)}" width="${w}" height="${h}" preserveAspectRatio="none"/></pattern>`,
  content:`<rect width="${layer.w}" height="${layer.h}" fill="url(#${id}-tile)"/>`,
 };
}
