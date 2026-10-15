import {mkdirSync,writeFileSync,renameSync,readFileSync,existsSync,unlinkSync,rmdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ToolError} from './errors.mjs';
function replaceFile(source,target){
  // Windows scanners can briefly hold a just-written checkpoint. Retry only the local rename,
  // never the preceding HTTP mutation; the previous complete checkpoint remains intact.
  for(let attempt=0;;attempt++){try{renameSync(source,target);return;}catch(error){if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=10)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);}}
}
export function writeJson(path,value){mkdirSync(dirname(path),{recursive:true});const temporary=path+'.'+randomUUID()+'.tmp';try{writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});replaceFile(temporary,path);}finally{if(existsSync(temporary))unlinkSync(temporary);}}
export function readJson(path){try{return JSON.parse(readFileSync(path,'utf8'));}catch{throw new ToolError('INVALID_STATE_FILE');}}
export function newState(path,value){mkdirSync(dirname(path),{recursive:true});try{writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}catch{throw new ToolError('STATE_ALREADY_EXISTS');}return value;}
export async function locked(path,work){mkdirSync(dirname(path),{recursive:true});try{mkdirSync(path+'.lock');}catch{throw new ToolError('STATE_LOCKED');}try{return await work();}finally{rmdirSync(path+'.lock');}}
