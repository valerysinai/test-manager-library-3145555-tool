import {Agent,request} from 'node:https';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {ToolError,ensure} from './errors.mjs';
const codes=new Set(['INVALID_CREDENTIALS','UNAUTHENTICATED','FORBIDDEN_ROLE','NOT_FOUND','USERNAME_TAKEN','ISBN_TAKEN','DOCUMENT_TAKEN','BOOK_HAS_OPEN_LOANS','BOOK_NOT_AVAILABLE','MEMBER_HAS_OVERDUE','ITEM_ALREADY_RETURNED','MEMBER_LIMIT_EXCEEDED','DUPLICATE_BOOK_IN_LOAN','VALIDATION_ERROR','INVALID_DATE_RANGE','INTERNAL_ERROR']);
export class Api {
  #base;#agent;#username;#password;#token=null;#issuedAt=null;
  constructor({url,caFile,username,password}){
    try {this.#base=new URL(url);}catch{throw new ToolError('INVALID_CONFIGURATION');}
    ensure(this.#base.protocol==='https:'&&!this.#base.username&&!this.#base.password&&!this.#base.search&&!this.#base.hash,'HTTPS_REQUIRED');
    ensure(typeof username==='string'&&username.trim()&&typeof password==='string'&&password!=='','MISSING_CREDENTIALS');
    this.#base.pathname=this.#base.pathname.replace(/\/$/,'');
    this.#username=username;this.#password=password;
    try {this.#agent=new Agent({keepAlive:true,maxSockets:10,rejectUnauthorized:true,...(caFile?{ca:readFileSync(caFile)}:{})});}
    catch{throw new ToolError('INVALID_CA_FILE');}
  }
  get baseUrl(){return this.#base.href;}
  get issuedAt(){return this.#issuedAt;}
  reconnect(){this.#agent.destroy();}
  close(){this.#agent.destroy();this.#token=null;this.#issuedAt=null;}
  sample(path,{method='GET',body}={}){
    let target;
    try {target=new URL(path.replace(/^\//,''),this.#base.href+'/');}catch{throw new ToolError('INVALID_PATH');}
    ensure(target.origin===this.#base.origin&&target.pathname.startsWith(this.#base.pathname+'/'),'INVALID_PATH');
    const bytes=body===undefined?undefined:JSON.stringify(body);
    const headers={Accept:'application/json','Cache-Control':'no-store',Pragma:'no-cache',...(bytes?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bytes)}:{}),...(this.#token?{Authorization:'Bearer '+this.#token}:{})};
    return new Promise(resolve=>{
      const start=performance.now();let settled=false;
      const finish=(status,buffer,error)=>{if(settled)return;settled=true;const elapsed_ms=performance.now()-start;let parsed;
        if(!error){try{parsed=JSON.parse(buffer.toString('utf8'));}catch{error='INVALID_JSON';}}
        resolve({status,elapsed_ms,body:parsed,...(error?{error}:{})});};
      const req=request(target,{method,headers,agent:this.#agent,rejectUnauthorized:true,timeout:10000},res=>{
        const chunks=[];let size=0;
        res.on('data',chunk=>{size+=chunk.length;if(size>2_000_000){finish(res.statusCode,null,'RESPONSE_TOO_LARGE');req.destroy();}else chunks.push(chunk);});
        res.on('end',()=>finish(res.statusCode,Buffer.concat(chunks)));
        res.on('aborted',()=>finish(0,null,'INCOMPLETE_RESPONSE'));
        res.on('error',()=>finish(0,null,'INCOMPLETE_RESPONSE'));
      });
      req.on('timeout',()=>{finish(0,null,'TIMEOUT');req.destroy();});
      req.on('error',()=>finish(0,null,'TRANSPORT_ERROR'));
      if(bytes)req.write(bytes);req.end();
    });
  }
  async call(path,options){
    const result=await this.sample(path,options);
    if(result.error)throw new ToolError(result.error,result.status);
    if(result.status<200||result.status>=300)throw new ToolError(codes.has(result.body?.code)?result.body.code:'HTTP_ERROR',result.status);
    return result.body;
  }
  async login(){
    const body=await this.call('/auth/login',{method:'POST',body:{username:this.#username,password:this.#password}});
    ensure(body.token_type==='Bearer'&&body.expires_in===28800&&body.role==='admin'&&typeof body.access_token==='string');
    try {
      const claims=JSON.parse(Buffer.from(body.access_token.split('.')[1],'base64url').toString('utf8'));
      ensure(Number.isInteger(claims.iat)&&claims.exp-claims.iat===28800&&claims.role==='admin');
      this.#issuedAt=new Date(claims.iat*1000).toISOString();
    }catch{throw new ToolError('INVALID_LOGIN_RESPONSE');}
    this.#token=body.access_token;return this.#issuedAt;
  }
}
export const query=values=>'?'+new URLSearchParams(Object.entries(values).map(([k,v])=>[k,String(v)])).toString();
export async function all(api,path){
  const items=[];let page=1,total;
  do {const data=await api.call(path+query({page,size:50}));ensure(Array.isArray(data.items)&&data.page===page&&data.size===50&&Number.isInteger(data.total)&&data.total>=0);if(total!==undefined)ensure(data.total===total,'TARGET_CHANGED');total=data.total;ensure(data.items.length>0||items.length===total);items.push(...data.items);page++;}while(items.length<total);
  ensure(items.length===total);return items;
}
