import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function environment(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const statement=(text,args=[])=>({bind(...values){return statement(text,values)},first:async()=>sqlite.prepare(text).get(...args)||null,all:async()=>({results:sqlite.prepare(text).all(...args)}),run:async()=>({meta:sqlite.prepare(text).run(...args)})});
  return {APP_ORIGIN:'https://minjaedy.github.io',APP_URL:'https://minjaedy.github.io/cale/',FIREBASE_PROJECT:'cale-b2c40',sqlite,DB:{prepare:statement,batch:async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
}
