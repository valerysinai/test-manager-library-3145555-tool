import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {categoryNames} from '../src/catalog.mjs';
import {EARLY,CURRENT} from '../src/demo.mjs';
export class FakeApi{
  baseUrl='https://fixture.invalid/api/v1';clock=EARLY;books=[];members=[];loans=[];calls=[];failAfter=Infinity;issuedAt=null;
  async login(){this.issuedAt=this.clock;return this.issuedAt;}
  async call(path,options={}){
    this.calls.push({path,...options});if(this.calls.length>this.failAfter)throw new Error('Simulated lost response');
    const url=new URL('https://fixture.invalid'+path),method=options.method||'GET',body=options.body;
    if(url.pathname==='/categories')return {items:categoryNames.map((name,i)=>({id:String(i),name}))};
    if(method==='POST'&&url.pathname==='/books'){assert.deepEqual(Object.keys(body).sort(),['author','category_id','isbn','title','total_copies']);const book={id:randomUUID(),...body,category:{id:body.category_id,name:categoryNames[Number(body.category_id)]},available_copies:5,cover_key:null};delete book.category_id;this.books.push(book);return structuredClone(book);}
    if(method==='POST'&&url.pathname==='/members'){assert.deepEqual(Object.keys(body).sort(),['document_number','full_name']);const member={id:randomUUID(),...body};this.members.push(member);return structuredClone(member);}
    if(method==='POST'&&url.pathname==='/loans'){assert.deepEqual(Object.keys(body).sort(),['items','member_id']);assert.equal(body.items.length,1);assert.deepEqual(Object.keys(body.items[0]),['book_id']);const b=this.books.find(b=>b.id===body.items[0].book_id);const item={id:randomUUID(),book_id:b.id,book_title:b.title,isbn:b.isbn,category_name:b.category.name,due_at:new Date(Date.parse(this.clock)+14*86400000).toISOString(),returned_at:null};const loan={id:randomUUID(),member_id:body.member_id,loaned_at:this.clock,status:'open',items:[item]};b.available_copies--;this.loans.push(loan);return structuredClone(loan);}
    if(url.pathname==='/loans/overdue')return {items:this.loans.filter(l=>l.loaned_at===EARLY&&this.clock===CURRENT).map(l=>({loan_id:l.id,item_id:l.items[0].id,due_at:l.items[0].due_at,days_late:1}))};
    if(url.pathname==='/reports/most-borrowed')return {rows:this.loans.map(l=>({book_id:l.items[0].book_id,book_title:l.items[0].book_title,category_name:l.items[0].category_name,times_borrowed:1}))};
    const kind=url.pathname.slice(1);let rows=this[kind];assert.ok(Array.isArray(rows));rows=rows.map(x=>structuredClone(x));
    if(kind==='loans')for(const row of rows)row.status=this.clock===CURRENT&&row.loaned_at===EARLY?'overdue':'open';
    const page=Number(url.searchParams.get('page')),size=Number(url.searchParams.get('size'));return {page,size,total:rows.length,items:rows.slice((page-1)*size,page*size)};
  }
}
