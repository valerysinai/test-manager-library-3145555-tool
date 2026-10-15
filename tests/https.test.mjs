import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,readFileSync,readdirSync,unlinkSync,rmdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {Api} from '../src/api.mjs';
import {safeError} from '../src/errors.mjs';

test('native HTTPS verifies trust, preserves password and measures until the final body byte',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'library-tool-tls-'));
  t.after(()=>{for(const name of readdirSync(directory))unlinkSync(join(directory,name));rmdirSync(directory);});
  const windows='C:/Program Files/Git/usr/bin/openssl.exe';const openssl=process.env.OPENSSL_BIN||(process.platform==='win32'&&existsSync(windows)?windows:'openssl');
  execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem')],{stdio:'ignore'});
  const password=' '+randomBytes(16).toString('hex')+' ';let passwordPreserved=false;
  const server=createServer({key:readFileSync(join(directory,'key.pem')),cert:readFileSync(join(directory,'cert.pem'))},async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/v1/auth/login'){let text='';for await(const chunk of req)text+=chunk;passwordPreserved=JSON.parse(text).password===password;const iat=Math.floor(Date.now()/1000);const payload=Buffer.from(JSON.stringify({iat,exp:iat+28800,role:'admin'})).toString('base64url');res.end(JSON.stringify({access_token:'fixture.'+payload+'.fixture',token_type:'Bearer',expires_in:28800,role:'admin'}));}
    else if(req.url==='/api/v1/delayed'){res.write('{"ok":');setTimeout(()=>res.end('true}'),60);}
    else{res.statusCode=403;res.end(JSON.stringify({code:'UNTRUSTED_UNSAFE_CODE',message:password,details:[password]}));}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const config={url:`https://127.0.0.1:${server.address().port}/api/v1`,username:'admin',password};
  const trusted=new Api({...config,caFile:join(directory,'cert.pem')}),untrusted=new Api(config);t.after(()=>{trusted.close();untrusted.close();});
  assert.equal((await untrusted.sample('/delayed')).error,'TRANSPORT_ERROR');await trusted.login();assert.equal(passwordPreserved,true);
  const sample=await trusted.sample('/delayed');assert.equal(sample.status,200);assert.equal(sample.body.ok,true);assert.ok(sample.elapsed_ms>=55);
  await assert.rejects(trusted.call('/forbidden'),error=>safeError(error)==='HTTP_ERROR (HTTP 403)');
  assert.throws(()=>trusted.sample('https://elsewhere.invalid/api/v1/secret'),{code:'INVALID_PATH'});assert.throws(()=>trusted.sample('../secret'),{code:'INVALID_PATH'});
  assert.throws(()=>new Api({...config,url:'http://127.0.0.1/api/v1'}),{code:'HTTPS_REQUIRED'});
});
