import dataset from '../nutrition/cofid.json' with {type:'json'};
const aliases={roti:'chapati',rotis:'chapati',chapatis:'chapati',yogurt:'yoghurt',yogurts:'yoghurt',yoghurts:'yoghurt',aubergines:'aubergine',eggplant:'aubergine',zucchini:'courgette',cilantro:'coriander'};
const terms=text=>text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean).map(t=>aliases[t]||t);
const catalogue=dataset.foods.map(food=>({...food,tokens:terms(food.name)}));
export function findFoods(query){
 const wanted=terms(query);
 if(!wanted.length)return [];
 return catalogue.filter(food=>wanted.every(term=>term==='cooked'?food.tokens.some(t=>['cooked','boiled','steamed','baked','fried','grilled','roasted'].includes(t)):food.tokens.some(t=>t.startsWith(term))))
  .sort((a,b)=>{
   const score=food=>wanted.reduce((sum,t)=>sum+(food.tokens.includes(t)?5:0),0)+(food.name.toLowerCase()===query.toLowerCase()?20:0)+(food.tokens[0]===wanted[0]?3:0);
   return score(b)-score(a)||a.name.length-b.name.length||a.id.localeCompare(b.id);
  }).slice(0,30).map(({tokens,group,...food})=>({...food,source:'UK CoFID 2021'}));
}
export async function searchNutrition(query){
 if(typeof query!=='string'||query.trim().length<2||query.length>120||/[\x00-\x1f]/.test(query))return Response.json({error:'Enter a food name of 2–120 characters.'},{status:400});
 return Response.json({foods:findFoods(query.trim()),source:'UK CoFID 2021'});
}
