import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FakeApi} from './fixtures.mjs';
import {demoEarly,demoCurrent,demoVerify,EARLY,CURRENT} from '../src/demo.mjs';
import {readJson} from '../src/files.mjs';
function temporary(t){const dir=mkdtempSync(join(tmpdir(),'library-tool-test-'));t.after(()=>{for(const name of readdirSync(dir))unlinkSync(join(dir,name));rmdirSync(dir);});return join(dir,'state.json');}
test('C-04 creates exact fixtures through the existing request contract and verifies snapshots',async t=>{
  const path=temporary(t),api=new FakeApi();assert.equal((await demoEarly(api,path)).loans,3);assert.equal(readJson(path).phase,'early-complete');api.clock=CURRENT;
  const result=await demoCurrent(api,path);assert.equal(result.loans,15);assert.equal(result.overdue_lines,3);assert.equal(result.max_lines_per_member,2);assert.equal(result.report_rows,15);assert.equal((await demoVerify(api,path)).passed,true);
  await assert.rejects(demoEarly(api,path),{code:'STATE_ALREADY_EXISTS'});await assert.rejects(demoCurrent(api,path),{code:'INVALID_DEMO_PHASE'});
  api.books[0].available_copies++;await assert.rejects(demoVerify(api,path),{code:'INVALID_DEMO_STOCK'});
});
test('wrong clock and nonempty destination refuse writes',async t=>{const path=temporary(t),api=new FakeApi();api.clock=CURRENT;await assert.rejects(demoEarly(api,path),{code:'WRONG_DEMO_CLOCK'});assert.ok(!api.calls.some(c=>c.method==='POST'));api.clock=EARLY;api.books.push({id:'existing'});await assert.rejects(demoEarly(api,path),{code:'TARGET_NOT_EMPTY'});assert.ok(!api.calls.some(c=>c.method==='POST'));});
test('partial failure retains checkpoint and cannot duplicate writes on retry',async t=>{const path=temporary(t),api=new FakeApi();api.failAfter=8;await assert.rejects(demoEarly(api,path));const state=readJson(path);assert.equal(state.phase,'failed');assert.ok(state.books.length>0&&state.books.length<40);const calls=api.calls.length;await assert.rejects(demoEarly(api,path),{code:'STATE_ALREADY_EXISTS'});assert.equal(api.calls.length,calls);assert.equal(state.failure,'UNEXPECTED_ERROR');});
test('clock transition checks saved identity against target before continuing',async t=>{const path=temporary(t),api=new FakeApi();await demoEarly(api,path);api.clock=CURRENT;api.books[0].id='other';await assert.rejects(demoCurrent(api,path),{code:'TARGET_CHANGED'});assert.equal(api.loans.length,3);});
test('report privacy failure does not claim successful verification',async t=>{const path=temporary(t),api=new FakeApi();await demoEarly(api,path);api.clock=CURRENT;const call=api.call.bind(api);api.call=async(...args)=>{const result=await call(...args);if(args[0].startsWith('/reports/'))result.rows[0].member_name='extra';return result;};await assert.rejects(demoCurrent(api,path),{code:'INVALID_REPORT'});assert.equal(readJson(path).phase,'failed');});
