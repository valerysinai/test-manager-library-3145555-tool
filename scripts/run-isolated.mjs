import {spawnSync,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {Api} from '../src/api.mjs';
import {demoEarly,demoCurrent,EARLY,CURRENT} from '../src/demo.mjs';
import {catalogLoad,benchmark} from '../src/performance.mjs';
import {writeJson} from '../src/files.mjs';
import {ToolError,ensure,safeError} from '../src/errors.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const infra=resolve(process.env.TOOL_INFRA_DIR||join(root,'../test-manager-library-3145555-infra'));
const apiDir=resolve(process.env.API_CONTEXT||join(root,'../test-manager-library-3145555-api'));
const appDir=resolve(process.env.APP_CONTEXT||join(root,'../test-manager-library-3145555-app'));
const tls=resolve(process.env.TLS_DIR||join(infra,'.local/tls'));
const stamp=Date.now()+'-'+randomBytes(4).toString('hex');
const output=join(root,'artifacts');const work=join(root,'.local',stamp);mkdirSync(work,{recursive:true,mode:0o700});
const projects=[];let stage='configuration';let active;
function run(args,env){const result=spawnSync('docker',args,{env,encoding:'utf8',timeout:1200000,maxBuffer:16*1024*1024});ensure(result.status===0,'DOCKER_COMMAND_FAILED');return result.stdout;}
function revision(path){try{return execFileSync('git',['-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{throw new ToolError('MISSING_REVISION');}}
function createProfile(kind){
  const project='library-tool-'+kind+'-'+stamp;ensure(/^library-tool-(demo|perf)-[0-9]+-[a-f0-9]{8}$/.test(project),'INVALID_TEST_PROJECT');
  const file=join(work,kind+'.env');const secret=()=>randomBytes(32).toString('hex');
  const env={...process.env,DB_DATABASE:'library',DB_USERNAME:'library',DB_PASSWORD:secret(),JWT_SECRET:secret(),ADMIN_USERNAME:'tool-admin',ADMIN_PASSWORD:secret(),API_CONTEXT:apiDir,APP_CONTEXT:appDir,TLS_DIR:tls,IMAGE_TAG:'tool-'+stamp,HTTPS_PORT:process.env.TOOL_HTTPS_PORT||'8443',APP_ENV:kind==='demo'?'demo':'production',CLOCK_MODE:kind==='demo'?'fixed':'system',CLOCK_FIXED_AT:kind==='demo'?EARLY:''};
  env.PUBLIC_ORIGIN='https://localhost:'+env.HTTPS_PORT;
  if(env.GITHUB_ACTIONS==='true')for(const key of ['DB_PASSWORD','JWT_SECRET','ADMIN_PASSWORD'])console.log('::add-mask::'+env[key]);
  writeFileSync(file,['DB_PASSWORD='+env.DB_PASSWORD,'JWT_SECRET='+env.JWT_SECRET,'ADMIN_USERNAME='+env.ADMIN_USERNAME,'ADMIN_PASSWORD='+env.ADMIN_PASSWORD,''].join('\n'),{mode:0o600,flag:'wx'});
  const args=['compose','--env-file',file,'--project-directory',infra,'-f',join(infra,'compose.yaml'),'--project-name',project];
  const profile={project,env,args,started:false};projects.push(profile);return profile;
}
const compose=(profile,args)=>run([...profile.args,...args],profile.env);
function client(profile){return new Api({url:profile.env.PUBLIC_ORIGIN+'/api/v1',caFile:join(tls,'root-ca.pem'),username:profile.env.ADMIN_USERNAME,password:profile.env.ADMIN_PASSWORD});}
async function ready(profile){const check=client(profile);try{for(let i=0;i<30;i++){const response=await check.sample('/health');if(response.status===200&&!response.error)return;await pause(1000);}throw new ToolError('API_NOT_READY');}finally{check.close();}}
function stop(profile){if(!profile.started)return;compose(profile,['down','--volumes','--remove-orphans']);profile.started=false;}
try{
  ensure(existsSync(join(tls,'root-ca.pem'))&&existsSync(join(tls,'key.pem')),'TLS_CONFIGURATION_REQUIRED');
  const revisions={api:revision(apiDir),infra:revision(infra),tool:revision(root)};
  const demo=createProfile('demo');stage='demo-build';console.log('Building isolated demo; business data will enter through HTTPS only.');compose(demo,['build']);
  stage='demo-start';demo.started=true;compose(demo,['up','-d','--wait','--wait-timeout','180']);await ready(demo);active=client(demo);
  const state=join(work,'demo-state.json');stage='demo-early';console.log(JSON.stringify(await demoEarly(active,state)));
  stage='demo-clock-transition';demo.env.CLOCK_FIXED_AT=CURRENT;compose(demo,['up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','120','api']);await ready(demo);
  active.reconnect();const oldToken=await active.sample('/books?page=1&size=1');ensure(oldToken.status===401&&!oldToken.error,'OLD_TOKEN_NOT_REJECTED');active.close();active=client(demo);
  stage='demo-current';const summary=await demoCurrent(active,state);writeJson(join(output,'demo-summary.json'),{...summary,old_token_rejected:true,revisions,created_at:new Date().toISOString()});console.log(JSON.stringify(summary));active.close();active=null;
  stage='demo-cleanup';stop(demo);
  const perf=createProfile('perf');stage='performance-start';perf.started=true;compose(perf,['up','-d','--wait','--wait-timeout','180']);await ready(perf);active=client(perf);
  stage='catalog-load';const catalog=join(work,'catalog-state.json');await catalogLoad(active,catalog,n=>{if(n%500===0)console.log(`Created ${n}/5000 books via HTTPS.`);});
  stage='hardware';const hardware=JSON.parse(run(['info','--format','{"logical_cpus":{{.NCPU}},"memory_bytes":{{.MemTotal}},"engine_version":"{{.ServerVersion}}","os":"{{.OSType}}"}'],perf.env));hardware.location='Docker Compose on the client host; API and PostgreSQL in isolated containers';
  stage='benchmark';const report=await benchmark(active,catalog,join(output,'benchmark.json'),{revisions,server:hardware},name=>console.log('Measured query: '+name));
  console.log(JSON.stringify({rnf1_passed:report.passed,complete:report.complete,samples:report.queries.reduce((n,x)=>n+x.samples.length,0),statistics:report.statistics,diagnostic_http_valid:report.diagnostic.http_valid}));
  if(!report.passed||!report.diagnostic.http_valid)process.exitCode=2;
}catch(error){console.error('Verification failed at '+stage+': '+safeError(error));process.exitCode=1;}
finally{active?.close();for(const profile of projects){try{stop(profile);}catch{console.error('Cleanup required for generated project '+profile.project);process.exitCode=1;}}}
