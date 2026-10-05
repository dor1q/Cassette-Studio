import {uid,parseTrackDuration} from './model.js';

export const cdTracks=project=>[...project.data.A,...project.data.B];
export function replaceCDTracks(project,tracks){project.data.A=tracks;project.data.B=[];return tracks}
export function editCDTrack(project,index,key,value){
 const track=cdTracks(project)[index];if(!track||!['title','artist','seconds'].includes(key))return false;
 if(key==='seconds'){value=parseTrackDuration(value);if(value===null)return false}
 track[key]=value;return true;
}
export function moveCDTrack(project,from,to){
 const tracks=cdTracks(project);if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=tracks.length||to>=tracks.length||from===to)return false;
 tracks.splice(to,0,...tracks.splice(from,1));replaceCDTracks(project,tracks);return true;
}
export function deleteCDTrack(project,index){const tracks=cdTracks(project);if(!Number.isInteger(index)||index<0||index>=tracks.length)return false;tracks.splice(index,1);replaceCDTracks(project,tracks);return true}
export function addCDTrack(project){const tracks=cdTracks(project);tracks.push({id:uid(),title:'Новый трек',artist:'',seconds:0});replaceCDTracks(project,tracks)}
