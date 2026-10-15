import {existsSync} from 'node:fs';
import {cpus,totalmem,platform,arch} from 'node:os';
import {query} from './api.mjs';
import {categories,bookInput,checkBook,emptyTarget} from './catalog.mjs';
import {ensure,safeError} from './errors.mjs';
import {locked,newState,readJson,writeJson} from './files.mjs';

export async function catalogLoad(api,path,progress=()=>{}){return locked(path,async()=>{
  ensure(!existsSync(path),'STATE_ALREADY_EXISTS');await api.login();ensure(Math.abs(Date.now()-Date.parse(api.issuedAt))<60000,'REAL_CLOCK_REQUIRED');await emptyTarget(api);const list=await categories(api);
  const state=newState(path,{version:1,base_url:api.baseUrl,phase:'loading',created:0});let next=1,failure;
  await Promise.all(Array.from({length:8},async()=>{while(!failure){const index=next++;if(index>5000)return;try{const input=bookInput(index,list,'performance');checkBook(await api.call('/books',{method:'POST',body:input}),input);state.created++;if(state.created%100===0){writeJson(path,state);progress(state.created);}}catch(error){failure??=error;}}}));
  if(failure){state.phase='failed';state.failure=safeError(failure);writeJson(path,state);throw failure;}
  try{for(const category of list){const page=await api.call('/books'+query({category_id:category.id,page:1,size:20}));ensure(page.total===1000,'INVALID_CATALOG_COUNT');}ensure(state.created===5000);state.phase='complete';writeJson(path,state);return {books:state.created,categories:5};}
  catch(error){state.phase='failed';state.failure=safeError(error);writeJson(path,state);throw error;}
});}
export function statistics(samples){const values=samples.map(x=>x.elapsed_ms).filter(Number.isFinite).sort((a,b)=>a-b);if(!values.length)return {max_ms:null,median_ms:null,p95_ms:null};const n=values.length;return {max_ms:values.at(-1),median_ms:n%2?values[(n-1)/2]:(values[n/2-1]+values[n/2])/2,p95_ms:values[Math.ceil(.95*n)-1]};}
export function passes(samples){return samples.length===400&&samples.every(x=>x.status===200&&x.valid_response===true&&!x.error&&Number.isFinite(x.elapsed_ms)&&x.elapsed_ms>=0&&x.elapsed_ms<300);}
function validPage(body,total){return body?.page===1&&body.size===20&&body.total===total&&Array.isArray(body.items)&&body.items.length===20&&body.items.every(b=>typeof b.id==='string'&&typeof b.title==='string'&&typeof b.author==='string'&&/^\d{13}$/.test(b.isbn)&&typeof b.category?.name==='string'&&Number.isInteger(b.available_copies));}
async function measured(api,test){const result=await api.sample('/books'+query(test.query));return {status:result.status,elapsed_ms:result.elapsed_ms,valid_response:validPage(result.body,test.expected_total),...(result.error?{error:result.error}:{})};}
export function clientHardware(){return {location:'Node.js client on the Compose host',platform:platform(),architecture:arch(),logical_cpus:cpus().length,cpu_model:cpus()[0]?.model,memory_bytes:totalmem(),node:process.version};}
export async function benchmark(api,statePath,reportPath,metadata,progress=()=>{}){
  const state=readJson(statePath);ensure(state.version===1&&state.phase==='complete'&&state.created===5000&&state.base_url===api.baseUrl,'CATALOG_NOT_READY');
  ensure(Number.isInteger(metadata.server?.logical_cpus)&&metadata.server.logical_cpus>0&&Number.isFinite(metadata.server.memory_bytes)&&metadata.server.memory_bytes>0&&typeof metadata.server.location==='string'&&metadata.server.location.length>0,'MISSING_HARDWARE_METADATA');
  for(const key of ['api','infra','tool'])ensure(/^[0-9a-f]{40}$/.test(metadata.revisions?.[key]||''),'MISSING_REVISION');
  await api.login();ensure(Math.abs(Date.now()-Date.parse(api.issuedAt))<60000,'REAL_CLOCK_REQUIRED');const list=await categories(api);
  const cases=[{name:'unfiltered',query:{page:1,size:20},expected_total:5000},{name:'title',query:{page:1,size:20,q:'Libro de prueba 000'},expected_total:99},{name:'author',query:{page:1,size:20,q:'Autor de prueba 07'},expected_total:100},{name:'category-and-title',query:{page:1,size:20,category_id:list[0].id,q:'Libro de prueba'},expected_total:1000}];
  const report={version:1,started_at:new Date().toISOString(),metadata:{...metadata,client:clientHardware()},protocol:{books:5000,categories:5,warmups_per_query:20,measurements_per_query:100,threshold_ms:300,comparison:'strictly-less-than',clock:'monotonic-send-through-complete-body',https_verified:true,response_cache:false},queries:[],diagnostic:{clients:10,samples:[]},complete:false,passed:false};
  writeJson(reportPath,report);
  for(const test of cases){const group={...test,warmups:[],samples:[]};report.queries.push(group);
    for(let i=0;i<20;i++)group.warmups.push(await measured(api,test));
    for(let i=0;i<100;i++){group.samples.push(await measured(api,test));if((i+1)%25===0)writeJson(reportPath,report);}
    group.statistics=statistics(group.samples);writeJson(reportPath,report);progress(test.name);
  }
  // Ten independent keep-alive connections are supplied by the HTTPS agent's socket pool.
  await Promise.all(Array.from({length:10},async(_,client)=>{for(const test of cases)report.diagnostic.samples.push({client:client+1,query:test.name,...await measured(api,test)});}));
  const samples=report.queries.flatMap(x=>x.samples);report.statistics=statistics(samples);report.complete=true;report.finished_at=new Date().toISOString();report.passed=passes(samples);report.diagnostic.http_valid=report.diagnostic.samples.every(x=>x.status===200&&x.valid_response&&!x.error);writeJson(reportPath,report);return report;
}
