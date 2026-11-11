'use strict';
const $=id=>document.getElementById(id),foods=globalThis.ShanthiFoods,menus=globalThis.ShanthiMenus;
const meals=['Breakfast','Lunch','Dinner','Snacks'];
const londonToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let data=null,revision=null,busy=false,editing=null,menuOffset=0,onlineFoods=[],searchGeneration=0,searching=false;
$('date').value=$('date').max=londonToday();
const selected=()=>$('date').value;
const items=()=>data?.days[selected()]||[];
const calories=entry=>Math.round(entry.kcal*entry.quantity);
const number=value=>value.toLocaleString('en-GB');
function node(tag,text,cls){const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;}
function status(text){$('status').textContent=text;}
function controls(){
 $('food-fields').disabled=busy||!data;
 for(const id of ['export','restore','another-menu','menu-style','previous','today','date'])$(id).disabled=busy||!data;
 $('next').disabled=busy||!data||selected()>=londonToday();
 document.querySelectorAll('[data-write]').forEach(el=>el.disabled=busy||!data);
}
const currentFood=()=>[...foods,...onlineFoods].find(f=>f.id===$('food').value);
function invalidateSearch(){searchGeneration++;searching=false;onlineFoods=[];$('search-online').disabled=false;}
async function searchOnline(){
 const query=$('food-search').value.trim();if(query.length<2){$('search-status').textContent='Enter at least two letters to search.';return;}
 const generation=++searchGeneration;searching=true;$('search-online').disabled=true;$('search-status').textContent='Searching the UK CoFID food list…';
 try{
  const response=await fetch('/api/nutrition?query='+encodeURIComponent(query),{signal:AbortSignal.timeout(12000)}),result=await response.json();
  if(generation!==searchGeneration)return;if(!response.ok)throw new Error(result.error||'Food search failed.');
  onlineFoods=result.foods.map(f=>({id:'cofid-'+f.id,name:(f.name+(f.brand?' · '+f.brand:'')).slice(0,100),unit:`100 ${f.basis} · CoFID ${f.id}`,kcal:Math.round(f.kcalPer100),basis:f.basis,online:true}));
  options();$('search-status').textContent=onlineFoods.length?`Found ${onlineFoods.length} matches. Choose the correct food, then choose a portion size and number of portions.`:'No calorie matches found. Try a simpler food name or use Indian & everyday estimates / Custom food.';
 }catch(error){if(generation===searchGeneration)$('search-status').textContent=error.name==='TimeoutError'?'The search took too long. Please try again.':error.message;}
 finally{if(generation===searchGeneration){searching=false;$('search-online').disabled=false;}}
}
function options(){
 const before=$('food').value,query=$('food-search').value.toLowerCase().trim();
 $('food').replaceChildren();
 const online=$('food-source').value==='online';
 const prompt=node('option',online?'Choose a UK food match…':'Choose a food…');prompt.value='';prompt.disabled=true;$('food').append(prompt);
 for(const food of (online?onlineFoods:foods.filter(f=>(f.name+' '+f.group).toLowerCase().includes(query)))){const option=node('option',`${food.name} · ${food.unit}`);option.value=food.id;$('food').append(option);}
 const custom=node('option','Custom food / use a packet label');custom.value='custom';$('food').append(custom);
 if(before&&[...$('food').options].some(o=>o.value===before))$('food').value=before;else $('food').value='';
 $('food-count').textContent=online?'UK CoFID 2021':`${foods.length} built-in food estimates`;
 $('search-online').hidden=!online;
 chooseFood();
}
function servingSuggestion(food){return globalThis.ShanthiPortions.suggest(food);}
function chosenServing(){
 const food=currentFood();if(!food?.online)return null;
 const value=$('portion-size').value,suggested=servingSuggestion(food);
 if(value==='suggested'&&suggested)return suggested;
 if(value==='custom')return {label:$('named-portion-label').value.trim(),count:'portions',size:Number($('named-portion-weight').value)};
 return value?{label:'1 portion',count:'portions',size:Number(value)}:null;
}
function updateServing(){
 const food=currentFood();if(!food?.online)return;
 const custom=$('portion-size').value==='custom',serving=chosenServing();
 $('named-portion-fields').hidden=!custom;$('named-portion-label').required=custom;$('named-portion-weight').required=custom;
 $('portion-weight-label').textContent=food.basis==='ml'?'Volume of one portion (ml)':'Weight of one portion (g)';
 const valid=serving&&serving.size>0&&serving.label;
 $('kcal').value=valid?Math.round(food.kcal*serving.size/100):'';
 $('quantity-label').textContent=valid?'Number of '+serving.count:'Number of portions';
 $('portion-help').textContent=valid?`One portion = ${serving.label} (${serving.size} ${food.basis}). This is an editable serving estimate, not an official CoFID measure. Check your actual portion or packet label. Calories use CoFID’s per-100 ${food.basis} value.`:'Choose a named serving or define your own portion size. One piece, bowl or slice is not automatically 100 g.';
 estimate();
}
function chooseFood(){
 const food=currentFood(),custom=$('food').value==='custom',online=!!food?.online;
 $('quantity-label').textContent='Number of portions';$('quantity').max='100';$('quantity').step='0.01';$('quantity').min='0.01';$('quantity').value='1';
 $('calorie-label').textContent='kcal per portion';$('portion-size-field').hidden=!online;$('portion-size').required=online;
 $('named-portion-fields').hidden=true;$('named-portion-label').required=false;$('named-portion-weight').required=false;
 $('portion-size').replaceChildren();
 if(online){
  const prompt=node('option','Choose what one portion means…');prompt.value='';prompt.disabled=true;$('portion-size').append(prompt);
  const suggested=servingSuggestion(food);
  if(suggested){const option=node('option',`${suggested.label} (estimated ${suggested.size} ${food.basis})`);option.value='suggested';$('portion-size').append(option);}
  const own=node('option','Define my own bowl / piece / serving');own.value='custom';$('portion-size').append(own);
  for(const size of [25,50,60,75,100,125,150,175,200,250,300]){const option=node('option',`Weighed portion: ${size} ${food.basis}`);option.value=size;$('portion-size').append(option);}
  $('portion-size').value=suggested?'suggested':'';
 }
 $('custom-fields').hidden=!custom;$('custom-name').required=custom;$('custom-unit').required=custom;
 $('kcal').value=food?food.kcal:'';
 $('portion-help').textContent=!food&&!custom?'Search for a food and select its matching preparation, or choose Custom food.':food?`1 portion = ${food.unit}. Adjust for your recipe or packet label.`:'Enter a name, portion and kcal from the label or your recipe. Unknown foods are never assigned invented calories.';
 if(online)updateServing();else estimate();
}
function estimate(){const value=Number($('quantity').value)*Number($('kcal').value);$('estimate').textContent=Number.isFinite(value)?number(Math.round(value)):'0';}
function resetForm(){editing=null;invalidateSearch();$('food-form').reset();$('food').value='';$('search-status').textContent='Search the Indian & everyday food estimates, then choose a food and portion.';$('food-search').value='';options();$('add-food').replaceChildren(node('span','Add food ＋'));$('cancel-edit').hidden=true;}
function render(){
 const entries=items(),total=entries.reduce((sum,e)=>sum+calories(e),0);
 $('day-title').textContent=new Date(selected()+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
 $('consumed').textContent=number(total);$('remaining').textContent=number(Math.abs(1550-total));$('remaining-label').textContent=total>1550?'above target':'remaining';
 $('ring').style.setProperty('--progress',Math.min(total/1550*100,100)+'%');$('ring').classList.toggle('over-target',total>1550);$('ring').setAttribute('aria-label',`${total} of 1550 calories logged`);
 $('entry-count').textContent=`${entries.length} food${entries.length===1?'':'s'}`;
 const log=$('food-log');log.replaceChildren();
 if(!entries.length)log.append(node('p','A fresh page for your day. Add your first food above.','empty'));
 for(const meal of meals){
  const list=entries.filter(e=>e.meal===meal);if(!list.length)continue;
  const section=node('div','','meal-log'),heading=node('div','','meal-heading');heading.append(node('span',meal),node('span',number(list.reduce((s,e)=>s+calories(e),0))+' kcal'));section.append(heading);
  for(const entry of list){const row=node('div','','food-row'),detail=node('div','');detail.append(node('strong',entry.name),node('p',`${entry.quantity} × ${entry.unit} · ${entry.kcal} kcal per portion`));const actions=node('div','','row-actions');
   for(const [label,action] of [['Edit',()=>edit(entry)],['Remove',()=>save({...data,days:{...data.days,[selected()]:items().filter(e=>e.id!==entry.id)}},'Food removed.')]]){const button=node('button',label);button.dataset.write='true';button.setAttribute('aria-label',label+' '+entry.name);button.onclick=action;actions.append(button);}
   const source=/^100 g · CoFID ([0-9-]+)$/.exec(entry.unit),suggested=source?servingSuggestion({name:entry.name,basis:'g',id:'cofid-'+source[1]}):null;
   if(suggested&&suggested.size!==100){
    const fix=node('button',`Count as ${suggested.count} (${suggested.size} g each)`);fix.dataset.write='true';fix.onclick=()=>{
     const corrected={...entry,unit:`${suggested.label} (~${suggested.size} g) · CoFID ${source[1]}`,kcal:Math.round(entry.kcal*suggested.size/100)};
     save({...data,days:{...data.days,[selected()]:items().map(e=>e.id===entry.id?corrected:e)}},'Entry corrected using the selected serving estimate.');
    };actions.append(fix);
   }
   row.append(detail,node('span',number(calories(entry))+' kcal','row-kcal'),actions);section.append(row);
  }log.append(section);
 }
 renderMenu();controls();
}
function edit(entry){
 resetForm();editing=entry.id;$('food').value='custom';chooseFood();$('custom-name').value=entry.name;$('custom-unit').value=entry.unit;$('meal').value=entry.meal;$('quantity').value=entry.quantity;$('kcal').value=entry.kcal;estimate();$('add-food').textContent='Save changes';$('cancel-edit').hidden=false;$('food-form').scrollIntoView({behavior:'smooth',block:'center'});
}
async function save(next,message){
 if(busy||!data)return false;busy=true;controls();status('Saving your food diary…');
 try{
  const response=await fetch('/api/shanthi',{method:'POST',headers:{'Content-Type':'application/json',...(revision!==null?{'X-Activities-Revision':revision}:{})},body:JSON.stringify(next)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not save.');
  data=result;revision=response.headers.get('X-Activities-Revision');render();status(message);return true;
 }catch(error){status('Save failed: '+error.message+' Your previous saved records are unchanged.');return false;}
 finally{busy=false;controls();}
}
$('food-form').onsubmit=async event=>{
 event.preventDefault();if(busy||!data)return;
 const food=currentFood();
 const entry={id:editing||crypto.randomUUID(),name:food?food.name:$('custom-name').value.trim(),unit:food?.online?`${chosenServing().label} (~${chosenServing().size} ${food.basis}) · CoFID ${food.id.replace('cofid-','')}`:food?food.unit:$('custom-unit').value.trim(),meal:$('meal').value,kcal:Number($('kcal').value),quantity:Number($('quantity').value)};
 if(!entry.name||!entry.unit){status('Enter the food name and portion.');return;}
 const list=items().slice();if(editing)list[list.findIndex(e=>e.id===editing)]=entry;else list.push(entry);
 if(await save({...data,days:{...data.days,[selected()]:list}},'Food saved. Your diary is up to date.'))resetForm();
};
function renderMenu(){
 const style=$('menu-style').value,available=menus.filter(m=>style==='all'||(m.style||'indian')===style);
 const day=Math.floor(Date.parse(selected()+'T12:00:00Z')/86400000),menu=available[((day+menuOffset)%available.length+available.length)%available.length];
 $('menu-name').textContent=menu.name;$('menu-cards').replaceChildren();let total=0;
 menu.meals.forEach((parts,index)=>{
  const meal=['Breakfast','Lunch','Snacks','Dinner'][index],entries=parts.map(([id,quantity])=>({...foods.find(f=>f.id===id),quantity})),sum=entries.reduce((s,e)=>s+calories(e),0);total+=sum;
  const card=node('article','','menu-card'),heading=node('div','','meal-heading');heading.append(node('strong',meal),node('span',sum+' kcal'));card.append(heading);
  const ul=node('ul','');for(const entry of entries){const li=node('li',`${entry.quantity} × ${entry.name} (${entry.unit})`);if(entry.tip)li.append(node('p',entry.tip+' Calories include the stated dressing.','recipe-tip'));ul.append(li);}card.append(ul);
  const button=node('button','I ate this · add meal ＋');button.dataset.write='true';button.onclick=async()=>{
   const extra=entries.map(e=>({id:crypto.randomUUID(),name:e.name,unit:e.unit,kcal:e.kcal,quantity:e.quantity,meal}));
   if(await save({...data,days:{...data.days,[selected()]:[...items(),...extra]}},meal+' saved from the menu idea.'))resetForm();
  };card.append(button);$('menu-cards').append(card);
 });
 $('menu-total').textContent=`${number(total)} / 1,550 kcal · estimated`;
}
function changeDate(){if(!selected()||selected()>londonToday()||selected()<'0001-01-01'){$('date').value=londonToday();}menuOffset=0;resetForm();render();status('Viewing saved foods for '+selected()+'.');}
function shift(delta){const date=new Date(selected()+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+delta);$('date').value=date.toISOString().slice(0,10);changeDate();}
$('previous').onclick=()=>shift(-1);$('next').onclick=()=>shift(1);$('today').onclick=()=>{$('date').value=londonToday();changeDate();};$('date').onchange=changeDate;
$('food-search').oninput=()=>{invalidateSearch();options();$('search-status').textContent=$('food-source').value==='online'?'Select Search foods to find online matches.':'Filtering built-in food estimates.';};
$('food-search').onkeydown=event=>{if(event.key==='Enter'&&$('food-source').value==='online'){event.preventDefault();searchOnline();}};
$('food-source').onchange=()=>{invalidateSearch();options();$('search-status').textContent=$('food-source').value==='online'?'Type a food name and select Search foods.':'Choose a built-in food estimate or Custom food.';};
$('search-online').onclick=searchOnline;$('food').onchange=chooseFood;$('portion-size').onchange=updateServing;for(const id of ['named-portion-label','named-portion-weight'])$(id).oninput=updateServing;for(const id of ['kcal','quantity'])$(id).oninput=estimate;$('cancel-edit').onclick=resetForm;
$('menu-style').onchange=()=>{menuOffset=0;renderMenu();controls();};
$('another-menu').onclick=()=>{menuOffset++;renderMenu();controls();};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a','');a.href=url;a.download='shanthi-food-diary-'+londonToday()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('restore').onclick=()=>$('backup').click();
$('backup').onchange=async()=>{const file=$('backup').files[0];$('backup').value='';if(!file)return;if(file.size>1000000){status('Choose a JSON backup no larger than 1 MB.');return;}
 try{const backup=JSON.parse(await file.text());if(!confirm('Replace Shanthi’s saved food diary with this backup? Export your current records first if needed.'))return;if(await save(backup,'Backup restored.'))resetForm();}catch{status('Could not read that JSON backup. No records were changed.');}
};
async function load(){status('Opening your food diary…');$('retry').hidden=true;try{const response=await fetch('/api/shanthi');const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not load records.');data=result;revision=response.headers.get('X-Activities-Revision');render();status('Your food diary is up to date.');}catch(error){status('Could not open your diary: '+error.message);$('retry').hidden=false;}controls();}
$('retry').onclick=load;options();controls();load();
