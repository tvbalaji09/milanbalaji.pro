import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const scope={};runInNewContext(readFileSync(new URL('../public/shanthi-portions.js',import.meta.url),'utf8'),scope);
const suggest=name=>scope.ShanthiPortions.suggest({name,basis:'g'});
test('common foods use named servings rather than 100g-per-item assumptions',()=>{
 const cases=[['Eggs, chicken, whole, fried in sunflower oil','eggs',60],['Chapatis, made without fat','chapatis',60],['Bread, wholemeal, sliced','slices',40],['Rice, white, boiled','bowls',180],['Curry, chicken korma, homemade','bowls',200],['Yoghurt, plain','pots',125],['Milk, semi-skimmed','glasses',200],['Apples, eating, raw, flesh and skin','apples',150]];
 for(const [name,count,size] of cases){const portion=suggest(name);assert.equal(portion.count,count,name);assert.equal(portion.size,size,name);}
});
test('ingredient and dish names are not mistaken for individual pieces',()=>{
 assert.equal(suggest('Flour, chapati, brown'),null);
 assert.equal(suggest('Bread, pudding'),null);
 assert.equal(suggest('Eggs, chicken, whole, dried'),null);
 assert.equal(suggest('Unrecognised homemade meal'),null);
 assert.equal(scope.ShanthiPortions.suggest({name:'Wine, red',basis:'ml'}),null);
 assert.equal(suggest('Rice, egg fried, takeaway').count,'bowls');
});
