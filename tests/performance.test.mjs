import test from 'node:test';
import assert from 'node:assert/strict';
import {statistics,passes,benchmark,catalogLoad} from '../src/performance.mjs';
import {bookInput,categoryNames} from '../src/catalog.mjs';
import {mkdtempSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeJson,readJson} from '../src/files.mjs';
test('strict RNF-1 boundary requires every one of 400 successful samples',()=>{const samples=Array.from({length:400},()=>({status:200,valid_response:true,elapsed_ms:299.999}));assert.equal(passes(samples),true);samples[399].elapsed_ms=300;assert.equal(passes(samples),false);samples[399].elapsed_ms=1;samples[0].status=500;assert.equal(passes(samples),false);samples[0].status=200;samples[0].valid_response=false;assert.equal(passes(samples),false);samples[0].valid_response=true;samples[0].error='TIMEOUT';assert.equal(passes(samples),false);delete samples[0].error;assert.equal(passes(samples.slice(1)),false);});
test('median and nearest-rank p95 retain slow and unsuccessful samples',()=>{const data=Array.from({length:100},(_,i)=>({elapsed_ms:i+1,status:i===99?500:200}));assert.deepEqual(statistics(data),{max_ms:100,median_ms:50.5,p95_ms:95});assert.deepEqual(statistics([]),{max_ms:null,median_ms:null,p95_ms:null});});
test('5000 deterministic books yield all four expected search populations',()=>{const cats=categoryNames.map((name,i)=>({id:String(i),name}));const books=Array.from({length:5000},(_,i)=>bookInput(i+1,cats,'performance'));assert.equal(new Set(books.map(x=>x.isbn)).size,5000);for(const c of cats)assert.equal(books.filter(x=>x.category_id===c.id).length,1000);assert.equal(books.filter(x=>x.title.includes('Libro de prueba 000')).length,99);assert.equal(books.filter(x=>x.author.includes('Autor de prueba 07')).length,100);assert.equal(books.filter(x=>x.category_id==='0'&&x.title.includes('Libro de prueba')).length,1000);assert.ok(books.every(x=>/^\d{13}$/.test(x.isbn)&&x.total_copies===5));});
function temp(t){const dir=mkdtempSync(join(tmpdir(),'library-tool-performance-'));t.after(()=>{for(const file of readdirSync(dir))unlinkSync(join(dir,file));rmdirSync(dir);});return dir;}
test('C-07 retains all 400 measurements, excludes exactly 80 warmups and records 40 concurrent diagnostics',async t=>{
  const dir=temp(t),state=join(dir,'state.json'),reportFile=join(dir,'report.json');let count=0,running=0,peak=0;
  const api={baseUrl:'https://fixture.invalid/api/v1',async login(){this.issuedAt=new Date().toISOString();},async call(){return {items:categoryNames.map((name,i)=>({id:String(i),name}))};},async sample(path){const index=++count;running++;peak=Math.max(peak,running);await new Promise(resolve=>setTimeout(resolve,0));running--;const q=new URL('https://fixture.invalid'+path).searchParams;const total=q.has('category_id')?1000:q.get('q')==='Autor de prueba 07'?100:q.has('q')?99:5000;return {status:index===21?503:200,elapsed_ms:index===22?300:1,body:{page:1,size:20,total,items:Array.from({length:20},()=>({id:'fixture',title:'title',author:'author',isbn:'9200000000001',category:{name:'Novela'},available_copies:5}))}};}};
  writeJson(state,{version:1,phase:'complete',created:5000,base_url:api.baseUrl});
  const metadata={server:{logical_cpus:2,memory_bytes:1000,location:'fake only'},revisions:{api:'1'.repeat(40),infra:'2'.repeat(40),tool:'3'.repeat(40)}};
  const report=await benchmark(api,state,reportFile,metadata);assert.equal(count,520);assert.equal(report.complete,true);assert.equal(report.passed,false);assert.equal(report.queries.flatMap(x=>x.samples).length,400);assert.equal(report.queries.flatMap(x=>x.warmups).length,80);assert.equal(report.diagnostic.samples.length,40);assert.equal(peak,10);assert.equal(report.statistics.max_ms,300);assert.equal(readJson(reportFile).queries[0].samples[0].status,503);assert.equal(readJson(reportFile).queries[0].samples[1].elapsed_ms,300);
});
test('catalog loading never retries uncertain POST writes and persists the partial failure',async t=>{
  const dir=temp(t),state=join(dir,'state.json');let posts=0;
  const api={baseUrl:'https://fixture.invalid/api/v1',async login(){this.issuedAt=new Date().toISOString();},async call(path,options){if(path==='/categories')return {items:categoryNames.map((name,i)=>({id:String(i),name}))};if(options?.method==='POST'){posts++;throw new Error('uncertain result');}return {total:0,items:[]};}};
  await assert.rejects(catalogLoad(api,state));assert.equal(readJson(state).phase,'failed');assert.equal(posts,1);await assert.rejects(catalogLoad(api,state),{code:'STATE_ALREADY_EXISTS'});assert.equal(posts,1);
});
