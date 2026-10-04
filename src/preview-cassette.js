import {esc} from './model.js';
import {CASSETTE_TEMPLATE,cassetteWindowPath} from './cassette-template.js';
import {CASSETTE_SHELL,CASSETTE_POINT,cassetteShellOutline,cassetteShellTrapezoid} from './cassette-shell.js';
import {previewCassetteArtwork} from './preview-geometry.js';

const mm=points=>points*CASSETTE_POINT;
export const PREVIEW_REELS=Object.freeze([
 Object.freeze({x:mm(82.86),y:mm(83.7),radius:mm(32),hub:mm(17.88)}),
 Object.freeze({x:mm(202.62),y:mm(83.7),radius:mm(34),hub:mm(17.88)}),
]);

function reel(reel,index,id){
 const {x,y,radius,hub}=reel;
 const teeth=Array.from({length:6},(_,i)=>`<path d="M-1 -2.9H1V-1.6H-1Z" fill="#c8ccd0" transform="rotate(${i*60+index*25})"/>`).join('');
 const tape=Array.from({length:5},(_,i)=>`<circle cx="${x}" cy="${y}" r="${radius-i*.42}" fill="none" stroke="${i%2?'#513a2c':'#231c19'}" stroke-width=".16"/>`).join('');
 return `<g data-preview-reel="${index}"><circle cx="${x}" cy="${y}" r="${radius}" fill="url(#${id}-tape)"/>${tape}<circle cx="${x}" cy="${y}" r="${hub+.45}" fill="#191c1d"/><circle cx="${x}" cy="${y}" r="${hub}" fill="url(#${id}-hub)" stroke="#5b646a" stroke-width=".35"/><g transform="translate(${x} ${y})"><circle r="3.25" fill="#121719" stroke="#555e63" stroke-width=".45"/>${teeth}<circle r="1.5" fill="#151b1e"/></g></g>`;
}
function screw(x,y,id){
 return `<g transform="translate(${x} ${y})"><circle r="1.5" fill="#171c1d"/><circle r="1.04" fill="url(#${id}-hub)" stroke="#303738" stroke-width=".2"/><path d="M-.65 0H.65M0 -.65V.65" stroke="#202629" stroke-width=".28"/></g>`;
}

// This housing is drawn independently of the printable artwork. Its mechanisms
// remain visible through the artwork's real alpha window, without flattening it.
export function cassetteFaceSvg(project,surface,artwork){
 const id=surface==='labelB'?'preview-cassette-B':'preview-cassette-A',w=mm(CASSETTE_SHELL.width),h=mm(CASSETTE_SHELL.height);
 const placement=previewCassetteArtwork(project),offset={x:mm(CASSETTE_SHELL.labelX),y:mm(CASSETTE_SHELL.labelY)};
 const window=cassetteWindowPath(CASSETTE_TEMPLATE),recess=`<path d="${window}" transform="translate(${offset.x} ${offset.y})"/>`;
 const screws=[[4,4],[w-4,4],[4,h-4],[w-4,h-4],[w/2,h-4.3]].map(([x,y])=>screw(x,y,id)).join('');
 const pins=[[73.74,171.54,5.16],[210.06,171.54,5.16]].map(([x,y,r])=>`<circle cx="${mm(x)}" cy="${mm(y)}" r="${mm(r)+.35}" fill="#111719"/><circle cx="${mm(x)}" cy="${mm(y)}" r="${mm(r)}" fill="#0b1113" stroke="#697278" stroke-width=".25"/>`).join('');
 const lowerSlots=[[97.32,163.92],[177.84,163.92]].map(([x,y])=>`<rect x="${mm(x)}" y="${mm(y)}" width="${mm(7.92)}" height="${mm(7.92)}" rx="${mm(1.8)}" fill="#0b1113" stroke="#697278" stroke-width=".22"/>`).join('');
 const ridges=Array.from({length:8},(_,i)=>`<path d="M${4+i*.65} ${h-12}V${h-6}M${w-4-i*.65} ${h-12}V${h-6}" stroke="#5c6366" stroke-width=".18"/>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" aria-label="Корпус кассеты ${surface==='labelB'?'B':'A'}"><defs><linearGradient id="${id}-plastic" x2=".2" y2="1"><stop stop-color="#535b60"/><stop offset=".2" stop-color="#343b3e"/><stop offset=".75" stop-color="#262e31"/><stop offset="1" stop-color="#4a5257"/></linearGradient><linearGradient id="${id}-hub" x2=".8" y2="1"><stop stop-color="#e1e5e7"/><stop offset=".45" stop-color="#a3adb2"/><stop offset="1" stop-color="#697780"/></linearGradient><radialGradient id="${id}-tape"><stop stop-color="#3a251b"/><stop offset=".7" stop-color="#4d3527"/><stop offset="1" stop-color="#201a17"/></radialGradient><linearGradient id="${id}-glass" x2=".25" y2="1"><stop stop-color="#c5d5de" stop-opacity=".16"/><stop offset=".4" stop-color="#d6e0e4" stop-opacity="0"/><stop offset="1" stop-color="#c5d5de" stop-opacity=".06"/></linearGradient><clipPath id="${id}-shell"><path d="${cassetteShellOutline()}"/></clipPath><clipPath id="${id}-window">${recess}</clipPath></defs><g clip-path="url(#${id}-shell)"><path d="${cassetteShellOutline()}" fill="url(#${id}-plastic)"/><rect x=".8" y=".8" width="${w-1.6}" height="${h-1.6}" rx="1.6" fill="none" stroke="#778087" stroke-width=".28"/><rect x="1.5" y="1.5" width="${w-3}" height="${h-3}" rx="1.4" fill="none" stroke="#171d20" stroke-width=".22"/><path d="${cassetteShellTrapezoid()}" fill="#2b3337" stroke="#192023" stroke-width=".3"/><g clip-path="url(#${id}-window)"><rect width="${w}" height="${h}" fill="#141b1f"/>${PREVIEW_REELS.map((r,i)=>reel(r,i,id)).join('')}<path d="M${PREVIEW_REELS[0].x} ${PREVIEW_REELS[0].y+PREVIEW_REELS[0].radius-.5}L${PREVIEW_REELS[1].x} ${PREVIEW_REELS[1].y+PREVIEW_REELS[1].radius-.5}" stroke="#573c2a" stroke-width=".8"/><path d="${window}" transform="translate(${offset.x} ${offset.y})" fill="url(#${id}-glass)"/></g><path d="${window}" transform="translate(${offset.x} ${offset.y})" fill="none" stroke="#131b20" stroke-width=".8"/><path d="${window}" transform="translate(${offset.x} ${offset.y})" fill="none" stroke="#78838b" stroke-opacity=".5" stroke-width=".25"/><image data-preview-artwork="${surface}" href="${esc(artwork)}" x="${placement.x}" y="${placement.y}" width="${placement.w}" height="${placement.h}" preserveAspectRatio="none"/>${ridges}${pins}${lowerSlots}${screws}<path d="M2.3 2H${w-2.3}" stroke="#c7cfd3" stroke-opacity=".45" stroke-width=".25"/><path d="M2.3 ${h-1.1}H${w-2.3}" stroke="#111719" stroke-width=".4"/></g></svg>`;
}

export function svgImageUrl(svg){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}
