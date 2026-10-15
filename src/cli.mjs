import {execFileSync} from 'node:child_process';
import {Api} from './api.mjs';
import {demoEarly,demoCurrent,demoVerify} from './demo.mjs';
import {catalogLoad,benchmark} from './performance.mjs';
import {ToolError,safeError} from './errors.mjs';
let api;
try{
  const env=process.env;api=new Api({url:env.TOOL_API_URL,caFile:env.TOOL_CA_FILE,username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD});
  const state=env.TOOL_STATE_FILE||'.local/demo-state.json',catalog=env.TOOL_CATALOG_STATE_FILE||'.local/catalog-state.json';let result;
  switch(process.argv[2]){
    case 'demo-early':result=await demoEarly(api,state);break;
    case 'demo-current':result=await demoCurrent(api,state);break;
    case 'demo-verify':result=await demoVerify(api,state);break;
    case 'catalog-load':result=await catalogLoad(api,catalog,n=>console.log(`Created ${n}/5000 books.`));break;
    case 'benchmark':{const metadata={server:{logical_cpus:Number(env.TOOL_SERVER_CPU_COUNT),memory_bytes:Number(env.TOOL_SERVER_MEMORY_BYTES),location:env.TOOL_SERVER_LOCATION},revisions:{api:env.TOOL_API_REVISION,infra:env.TOOL_INFRA_REVISION,tool:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}};const report=await benchmark(api,catalog,env.TOOL_REPORT_FILE||'artifacts/benchmark.json',metadata);result={complete:report.complete,passed:report.passed,statistics:report.statistics};if(!report.passed)process.exitCode=2;break;}
    default:throw new ToolError('UNKNOWN_COMMAND');
  }
  console.log(JSON.stringify(result));
}catch(error){console.error(safeError(error));process.exitCode=1;}finally{api?.close();}
