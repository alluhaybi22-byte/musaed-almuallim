import {emptyState} from './domain.js';
const DB_NAME='al-musaed-v1';let connection;
function open(){if(connection)return Promise.resolve(connection);return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>req.result.createObjectStore('state');req.onerror=()=>reject(req.error);req.onsuccess=()=>{connection=req.result;connection.onversionchange=()=>{connection.close();connection=null;};resolve(connection);};});}
export async function readState(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('state'),req=tx.objectStore('state').get('main');req.onsuccess=()=>resolve(req.result||emptyState());req.onerror=()=>reject(req.error);});}
export async function writeState(state){
  const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),req=store.get('main');let saved,error;
    req.onsuccess=()=>{if((req.result?.revision||0)!==state.revision){error=Error('توجد تغييرات في نافذة أخرى. أعد تحميل الصفحة قبل الحفظ.');tx.abort();return;}saved={...state,revision:state.revision+1};store.put(saved,'main');};
    tx.oncomplete=()=>resolve(saved);tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('تعذر حفظ البيانات. صدّر نسخة احتياطية وتحقق من مساحة الجهاز.'));
  });
}
