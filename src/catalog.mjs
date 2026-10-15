import {ensure} from './errors.mjs';
export const categoryNames=['Novela','Ciencia','Tecnología','Historia','Infantil'];
export async function categories(api){const data=await api.call('/categories');ensure(Array.isArray(data.items)&&data.items.length===5);return categoryNames.map(name=>{const matches=data.items.filter(c=>c.name===name);ensure(matches.length===1&&typeof matches[0].id==='string');return matches[0];});}
export function bookInput(index,list,mode='demo'){
  ensure(Number.isInteger(index)&&index>=1&&index<=5000);
  const category=list[(index-1)%5];const label=mode==='demo'?'demostración':'prueba';
  return {title:`Libro de ${label} ${String(index).padStart(5,'0')} — ${category.name}`,author:`Autor de ${label} ${String((index-1)%50+1).padStart(2,'0')}`,isbn:(mode==='demo'?'910':'920')+String(index).padStart(10,'0'),category_id:category.id,total_copies:5};
}
export function checkBook(book,input){ensure(typeof book.id==='string'&&book.title===input.title&&book.author===input.author&&book.isbn===input.isbn&&book.category?.id===input.category_id&&book.total_copies===5&&book.available_copies===5&&book.cover_key===null);return book.id;}
export async function emptyTarget(api){for(const path of ['/books','/members','/loans']){const result=await api.call(path+'?page=1&size=1');ensure(result.total===0&&Array.isArray(result.items)&&result.items.length===0,'TARGET_NOT_EMPTY');}}
