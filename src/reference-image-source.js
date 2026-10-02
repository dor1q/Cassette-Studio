// Images in public design links are embedded, never kept as remote dependencies.
export const MAX_REFERENCE_IMAGE_LENGTH=20_000_000;
export function embeddedReferenceImage(value){
 return typeof value==='string'&&value.length<=MAX_REFERENCE_IMAGE_LENGTH&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)?value:null;
}
export function referenceImageSource(value){
 if(typeof value!=='string'||!value||value.length>MAX_REFERENCE_IMAGE_LENGTH)return null;
 if(embeddedReferenceImage(value))return value;
 if(value.startsWith('storage:'))return value;
 try{const u=new URL(value,'https://vhs.texs.org');if(u.protocol!=='https:'||u.username||u.password||(!value.startsWith('/')&&!value.startsWith('https://')))return null;return u.href}catch{return null}
}
export async function referenceImageDimensions(src){const image=new Image();image.src=src;await image.decode();return [image.naturalWidth,image.naturalHeight]}
export async function loadReferenceImage(source,request,getDimensions=referenceImageDimensions,cached=[]){
 const key=referenceImageSource(source);if(!key)throw Error('Неподдерживаемый адрес изображения');
 let src=cached.find(l=>l.referenceAssetKey===key&&embeddedReferenceImage(l.src))?.src||embeddedReferenceImage(key);
 if(!src){if(key.startsWith('storage:'))throw Error('Файл находится в закрытом хранилище оригинального сайта');src=embeddedReferenceImage((await request('/api/image?url='+encodeURIComponent(key))).src)}
 if(!src)throw Error('Не удалось загрузить изображение');
 const [w,h]=await getDimensions(src);if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('Неверные размеры изображения');
 return {src,w,h,key};
}
