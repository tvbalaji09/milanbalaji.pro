import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findFoods,searchNutrition} from '../cloudflare/nutrition.mjs';
const dataset=JSON.parse(readFileSync(new URL('../nutrition/cofid.json',import.meta.url),'utf8'));
test('CoFID import preserves unique records, kcal values, zero energy and volume units',()=>{
 assert.equal(dataset.foods.length,2849);assert.equal(new Set(dataset.foods.map(f=>f.id)).size,dataset.foods.length);
 assert.equal(dataset.omittedWithoutNumericEnergy,38);
 const chapati=dataset.foods.find(f=>f.name==='Chapatis, made without fat');assert.equal(chapati.kcalPer100,202);assert.equal(chapati.basis,'g');
 const wine=dataset.foods.find(f=>f.name==='Wine, red');assert.equal(wine.kcalPer100,76);assert.equal(wine.basis,'ml');
 assert.ok(dataset.foods.some(f=>f.kcalPer100===0));
 // The official workbook reuses this code for two distinct rows. Preserve both.
 assert.equal(dataset.foods.filter(f=>f.code==='13-669').length,2);
 for(const food of dataset.foods){assert.ok(Number.isFinite(food.kcalPer100));assert.ok(['g','ml'].includes(food.basis));}
});
test('UK food matching covers aliases and preparations without inventing absent foods',()=>{
 assert.match(findFoods('chapati')[0].name,/^Chapatis/);
 assert.deepEqual(findFoods('roti'),findFoods('chapati'));
 assert.ok(findFoods('chicken curry').every(f=>/chicken/i.test(f.name)&&/curry/i.test(f.name)));
 assert.ok(findFoods('yogurt').length>0);
 assert.deepEqual(findFoods('zzzzunknownfood'),[]);assert.deepEqual(findFoods('!!!'),[]);
 assert.equal(findFoods('wine red')[0].basis,'ml');
});
test('CoFID endpoint needs no credentials or external calls and validates query lengths',async()=>{
 assert.equal((await searchNutrition('a')).status,400);assert.equal((await searchNutrition('x'.repeat(121))).status,400);
 const response=await searchNutrition('chapati');assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.source,'UK CoFID 2021');assert.ok(data.foods.length>0);
 assert.deepEqual((await(await searchNutrition('idli')).json()).foods,[]);
});
