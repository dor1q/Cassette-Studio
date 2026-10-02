let promise;
function db(){return promise||=(new Promise((resolve,reject)=>{const r=indexedDB.open('cassette-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}))}
export async function saveProject(id,project){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('projects','readwrite');tx.objectStore('projects').put({id,project,updated:Date.now()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
export async function saveLibraryProject(id,project){
 const d=await db(),snapshot={...project,libraryId:id},updated=Date.now();
 return new Promise((resolve,reject)=>{
  const tx=d.transaction('projects','readwrite'),store=tx.objectStore('projects');
  // Both records commit together, so a reload retains the same library identity.
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Сохранение отменено'));
  try{store.put({id,project:snapshot,updated});store.put({id:'autosave',project:snapshot,updated})}catch(error){tx.abort();reject(error)}
 });
}
export async function loadProjects(){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.updated-a.updated));r.onerror=()=>reject(r.error)})}
export async function removeProject(id){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('projects','readwrite');tx.objectStore('projects').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
