import {parentPort,workerData} from 'node:worker_threads';
import {executeHall} from './run-hall.mjs';
try{const r=await executeHall({...workerData,onProgress:p=>parentPort.postMessage({status:'running',progress:p})});parentPort.postMessage({status:'done',folder:r.folder,manifest:r.manifest});}catch(e){parentPort.postMessage({status:'failed',error:e.message,folder:e.folder??null});}
