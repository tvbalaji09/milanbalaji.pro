import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('the offline vocabulary has exactly 500 unique usable words, meanings and examples',()=>{
 const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../public/balaji-vocabulary.js',import.meta.url),'utf8'),context);
 const words=context.BalajiVocabulary;
 assert.equal(words.length,500);assert.equal(new Set(words.map(entry=>entry[0].toLowerCase())).size,500);
 for(const entry of words){
  assert.equal(entry.length,3);assert.match(entry[0],/^[a-z]+(?:-[a-z]+)*$/);
  assert.ok(entry[1].trim().length>=15,entry[0]+' has no useful meaning');assert.ok(entry[2].trim().length>=20,entry[0]+' has no usage example');
  assert.match(entry[2],/[.!?]$/,entry[0]);assert.ok(Object.isFrozen(entry));
 }
 assert.ok(Object.isFrozen(words));
});
