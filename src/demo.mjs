import {existsSync} from 'node:fs';
import {all,query} from './api.mjs';
import {bookInput,categories,checkBook,emptyTarget} from './catalog.mjs';
import {ensure,safeError} from './errors.mjs';
import {locked,newState,readJson,writeJson} from './files.mjs';

export const EARLY='2026-09-29T14:15:00Z';
export const CURRENT='2026-10-14T14:15:00Z';
const due=at=>new Date(Date.parse(at)+14*86400000).toISOString();
const sameTime=(a,b)=>Date.parse(a)===Date.parse(b);
function stateFor(api,path,phase){const state=readJson(path);ensure(state.version===1&&state.base_url===api.baseUrl&&state.phase===phase,'INVALID_DEMO_PHASE');return state;}
async function tracked(state,path,work){try{return await work();}catch(error){state.phase='failed';state.failure=safeError(error);writeJson(path,state);throw error;}}
async function lend(api,state,bookIndex,memberIndex,at){
  const book=state.books[bookIndex],member=state.members[memberIndex];
  const loan=await api.call('/loans',{method:'POST',body:{member_id:member.id,items:[{book_id:book.id}]}});
  checkLoan(loan,book,member,at);state.loans.push(loan);
}
function checkLoan(loan,book,member,at){
  ensure(typeof loan.id==='string'&&loan.member_id===member.id&&sameTime(loan.loaned_at,at)&&loan.items?.length===1);
  const item=loan.items[0];ensure(typeof item.id==='string'&&item.book_id===book.id&&item.book_title===book.title&&item.isbn===book.isbn&&item.category_name===book.category.name&&sameTime(item.due_at,due(at))&&item.returned_at===null);
}
export async function demoEarly(api,path){return locked(path,async()=>{
  ensure(!existsSync(path),'STATE_ALREADY_EXISTS');await api.login();ensure(sameTime(api.issuedAt,EARLY),'WRONG_DEMO_CLOCK');
  await emptyTarget(api);const list=await categories(api);
  const state=newState(path,{version:1,base_url:api.baseUrl,phase:'early-in-progress',books:[],members:[],loans:[]});
  return tracked(state,path,async()=>{
    for(let i=1;i<=40;i++){const input=bookInput(i,list);const book=await api.call('/books',{method:'POST',body:input});checkBook(book,input);state.books.push(book);writeJson(path,state);}
    for(let i=1;i<=10;i++){const input={full_name:`Socio de demostración ${String(i).padStart(2,'0')}`,document_number:`DEMO-${String(i).padStart(3,'0')}`};const member=await api.call('/members',{method:'POST',body:input});ensure(typeof member.id==='string'&&member.full_name===input.full_name&&member.document_number===input.document_number);state.members.push(member);writeJson(path,state);}
    for(let i=0;i<3;i++){await lend(api,state,i,i,EARLY);writeJson(path,state);}
    state.phase='early-complete';writeJson(path,state);return {books:40,members:10,loans:3,clock:EARLY};
  });
});}
async function inventory(api,state,loanCount){
  const books=await all(api,'/books'),members=await all(api,'/members'),loans=await all(api,'/loans');
  for(const [actual,expected,count] of [[books,state.books,40],[members,state.members,10],[loans,state.loans,loanCount]]){
    ensure(actual.length===count&&new Set(actual.map(x=>x.id)).size===count&&expected.length===count&&expected.every(x=>actual.some(y=>y.id===x.id)),'TARGET_CHANGED');
  }
  for(const book of books){const index=state.books.findIndex(x=>x.id===book.id);const original=state.books[index];ensure(book.title===original.title&&book.isbn===original.isbn&&book.category?.name===original.category.name&&book.total_copies===5&&book.available_copies===5-(index<loanCount?1:0),'INVALID_DEMO_STOCK');}
  return {books,members,loans};
}
export async function demoCurrent(api,path){return locked(path,async()=>{
  const state=stateFor(api,path,'early-complete');await api.login();ensure(sameTime(api.issuedAt,CURRENT),'WRONG_DEMO_CLOCK');
  await inventory(api,state,3);ensure((await api.call('/loans/overdue')).items?.length===3,'INVALID_OVERDUE_COUNT');
  state.phase='current-in-progress';writeJson(path,state);
  return tracked(state,path,async()=>{
    for(let i=0;i<12;i++){await lend(api,state,i+3,3+i%7,CURRENT);writeJson(path,state);}
    state.phase='complete';writeJson(path,state);return verifyState(api,state);
  });
});}
async function verifyState(api,state){
  ensure(sameTime(api.issuedAt,CURRENT),'WRONG_DEMO_CLOCK');
  const {loans}=await inventory(api,state,15);const perMember=new Map();
  for(const loan of loans){const index=state.loans.findIndex(x=>x.id===loan.id);const book=state.books[index];const member=state.members[index<3?index:3+(index-3)%7];checkLoan(loan,book,member,index<3?EARLY:CURRENT);ensure(loan.status===(index<3?'overdue':'open'));perMember.set(loan.member_id,(perMember.get(loan.member_id)||0)+loan.items.length);}
  ensure(perMember.size===10&&[...perMember.values()].every(n=>n<=3),'INVALID_MEMBER_DISTRIBUTION');
  const late=await api.call('/loans/overdue');ensure(late.items?.length===3&&late.items.every(x=>x.days_late===1&&sameTime(x.due_at,'2026-10-13T14:15:00Z')&&state.loans.slice(0,3).some(l=>l.id===x.loan_id&&l.items[0].id===x.item_id)),'INVALID_OVERDUE_COUNT');
  const report=await api.call('/reports/most-borrowed'+query({from:'2026-09-29',to:'2026-10-14'}));
  const keys=['book_id','book_title','category_name','times_borrowed'].sort().join(',');
  ensure(report.rows?.length===15&&report.rows.every(row=>Object.keys(row).sort().join(',')===keys&&row.times_borrowed===1&&state.books.slice(0,15).some(b=>b.id===row.book_id&&b.title===row.book_title&&b.category.name===row.category_name))&&new Set(report.rows.map(x=>x.book_id)).size===15,'INVALID_REPORT');
  return {books:40,members:10,loans:15,overdue_lines:3,open_loans:12,max_lines_per_member:Math.max(...perMember.values()),report_rows:15,early_clock:EARLY,current_clock:CURRENT,passed:true};
}
export async function demoVerify(api,path){const state=stateFor(api,path,'complete');await api.login();return verifyState(api,state);}
