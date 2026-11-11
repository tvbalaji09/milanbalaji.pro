import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {validateShanthi} from '../cloudflare/shanthi.mjs';
const scope={};runInNewContext(readFileSync(new URL('../public/shanthi-foods.js',import.meta.url),'utf8'),scope);
test('fourteen menu ideas use real catalogue portions and stay within the daily target',()=>{
 const {ShanthiFoods:foods,ShanthiMenus:menus}=scope;
 assert.equal(new Set(foods.map(f=>f.id)).size,foods.length);assert.ok(foods.length>=60);assert.equal(menus.length,14);
 for(const menu of menus){assert.equal(menu.meals.length,4);let sum=0;
  for(const parts of menu.meals)for(const [id,quantity] of parts){const food=foods.find(f=>f.id===id);assert.ok(food,id);sum+=Math.round(food.kcal*quantity);}
  assert.ok(sum>=1500&&sum<=1550,menu.name+': '+sum);
 }
});
test('food validation rejects future dates, duplicate IDs, malformed calories and excessive precision',()=>{
 const base={version:1,target:1550,days:{'2020-01-01':[{id:'one',name:'Rice',unit:'100 g cooked',kcal:130,quantity:1.5,meal:'Lunch'}]}};
 assert.deepEqual(validateShanthi(base,'2020-01-01'),base);
 for(const [field,value] of [['quantity',NaN],['quantity',0],['quantity',1.001],['kcal',-1],['kcal',1.5],['meal','Other'],['name','']]){
  const data=structuredClone(base);data.days['2020-01-01'][0][field]=value;assert.throws(()=>validateShanthi(data));
 }
 assert.throws(()=>validateShanthi(base,'2019-12-31'));
 const duplicate=structuredClone(base);duplicate.days['2020-01-01'].push(duplicate.days['2020-01-01'][0]);assert.throws(()=>validateShanthi(duplicate));
});
