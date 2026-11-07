'use strict';
const $=id=>document.getElementById(id);
const goalDefs=[
  {key:'connect',label:'Connect',hint:'Make time for someone who matters.',image:'spider-man',tint:'#30344c'},
  {key:'move',label:'Move',hint:'Give your body a little momentum.',image:'batman',tint:'#364135'},
  {key:'health',label:'Health',hint:'One kind choice for your wellbeing.',image:'black-panther',tint:'#3b3345'},
  {key:'learn',label:'Learn',hint:'Stay curious. Discover something new.',image:'deadpool',tint:'#493436'}
];
const prompts=[
  ['mood_energy','😊 Mood & energy','How are you feeling? What’s your energy like?','A few words about how I feel…'],
  ['win','🏆 Today’s win','Small wins deserve a little recognition.','Something that went well…'],
  ['work_learning','💼 Work & learning','A useful lesson, a discovery, or work worth noting.','Today I worked on or learned…'],
  ['health_fitness','💪 Health & fitness','Movement, rest, nourishment. What did you notice?','How I looked after myself…'],
  ['gratitude','🙏 Gratitude','A person, a moment, or something you appreciate.','Today I’m thankful for…'],
  ['tomorrow_priority','🎯 Tomorrow’s priority','One item per line. These become the next day’s to-dos.','Tomorrow, my first small step is…']
];
const dateKey=d=>`${String(d.getFullYear()).padStart(4,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const healthDefs=[['diet','Diet'],['medicine','Medicine'],['supplements','Supplements'],['skin_care','Skin care']];
const emptyHealth=()=>Object.fromEntries(healthDefs.map(([key])=>[key,false]));
const emptyGoals=()=>Object.fromEntries(goalDefs.map(g=>[g.key,false]));
const emptyEntry=()=>Object.fromEntries(prompts.map(p=>[p[0],'']));
let state, revision, selected=dateKey(new Date()), busy=false;
const drafts=new Map();
const expenseDrafts=new Map(), dieselDrafts=new Map();
function status(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
for(const [key,label,hint,placeholder] of prompts){
  const item=document.createElement('label');item.htmlFor=`entry-${key}`;item.textContent=label;
  const subtitle=document.createElement('span');subtitle.className='prompt-hint';subtitle.textContent=hint;
  const field=document.createElement('textarea');field.id=`entry-${key}`;field.maxLength=2000;field.rows=4;field.placeholder=placeholder;
  item.append(subtitle,field);$('journal-fields').append(item);
}
const readEntry=()=>Object.fromEntries(prompts.map(([key])=>[key,$(`entry-${key}`).value]));
async function request(options){
  if(options && revision!==null && revision!==undefined)options.headers['X-Activities-Revision']=revision;
  const response=await fetch('/api/balaji',options);
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed.');
  revision=response.headers.get('X-Activities-Revision');return data;
}
async function save(candidate,{journal=false,message='Progress saved.'}={}){
  if(busy)return;busy=true;render();status('Saving…');
  try{state=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(candidate)});if(journal)drafts.delete(selected);status(message);return true;}
  catch(error){status(`Save failed: ${error.message}`,true);return false;}
  finally{busy=false;render();}
}
function render(){
  document.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=busy||!state);
  if(!state)return;
  $('date').value=selected;$('date').max=dateKey(new Date());
  const formatted=new Date(selected+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  $('date-title').textContent=formatted;$('journal-date').textContent=formatted;
  const values=state.days[selected]||emptyGoals();
  $('goal-count').textContent=`${goalDefs.filter(g=>values[g.key]).length} of 4 complete`;
  $('goals').replaceChildren();
  goalDefs.forEach((goal,i)=>{
    const card=document.createElement('article');card.className='goal-card'+(values[goal.key]?' done':'');card.dataset.goal=goal.key;card.style.setProperty('--tint',goal.tint);
    const number=document.createElement('span');number.className='goal-number';number.textContent=`0${i+1}`;
    const title=document.createElement('h3');title.textContent=goal.label;
    const hint=document.createElement('p');hint.textContent=goal.hint;
    const image=document.createElement('img');image.src=`/assets/${goal.image}.png`;image.alt='';image.loading='lazy';
    const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=values[goal.key];box.disabled=busy;box.setAttribute('aria-label',goal.label);
    const text=document.createElement('span');text.textContent=box.checked?'Done for today':'Mark complete';label.append(box,text);
    box.onchange=()=>{const candidate=structuredClone(state);candidate.days[selected]={...values,[goal.key]:box.checked};save(candidate);};
    if(goal.key==='health'){
      const checks=state.health_checks[selected]||emptyHealth();
      hint.className='health-progress';
      hint.textContent=!state.health_checks[selected]&&values.health?'Previously complete':`${healthDefs.filter(([key])=>checks[key]).length} / 4 routines`;
      if(!state.health_checks[selected]&&values.health)hint.title='This Health goal was marked complete before the routine checklist was added.';
      const group=document.createElement('div');group.className='health-checks';group.setAttribute('role','group');group.setAttribute('aria-label','Health routines');
      for(const [key,name] of healthDefs){
        const routine=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='checkbox';input.checked=checks[key];input.disabled=busy;input.setAttribute('aria-label',name);text.textContent=name;routine.append(input,text);
        input.onchange=()=>{const candidate=structuredClone(state),updated={...checks,[key]:input.checked};candidate.health_checks[selected]=updated;candidate.days[selected]={...values,health:healthDefs.every(([key])=>updated[key])};save(candidate,{message:'Health routine saved.'});};
        group.append(routine);
      }
      card.append(number,title,hint,image,group);
    }else card.append(number,title,hint,image,label);
    $('goals').append(card);
  });
  const entry=drafts.get(selected)||state.entries[selected]||emptyEntry();prompts.forEach(([key])=>$(`entry-${key}`).value=entry[key]);
  $('journal-status').textContent=drafts.has(selected)?'Unsaved draft. Save your reflection to keep it.':state.entries[selected]?'Saved for this day. You can come back and edit it.':'All prompts are optional. Up to 2,000 characters per answer.';
  renderFieldNotes();
  renderPriorityTodos();
  renderFinances();
}
$('today').onclick=()=>{selected=dateKey(new Date());render();};
$('date').onchange=()=>{if($('date').value&&$('date').checkValidity()){selected=$('date').value;render();}};
$('journal-form').oninput=()=>{
  const entry=readEntry(),original=state.entries[selected]||emptyEntry();
  if(prompts.every(([key])=>entry[key]===original[key]))drafts.delete(selected);else drafts.set(selected,entry);
  $('journal-status').textContent=drafts.has(selected)?'Unsaved draft. Save your reflection to keep it.':'No unsaved changes.';
};
$('journal-form').onsubmit=event=>{event.preventDefault();const candidate=structuredClone(state),entry=readEntry();if(prompts.some(([key])=>entry[key].trim()))candidate.entries[selected]=entry;else delete candidate.entries[selected];save(candidate,{journal:true,message:'Reflection saved.'});};
window.addEventListener('beforeunload',event=>{if(drafts.size||expenseDrafts.size||dieselDrafts.size){event.preventDefault();event.returnValue='';}});
function download(text,name,type='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function noDrafts(){if(drafts.size||expenseDrafts.size||dieselDrafts.size){status('Save or cancel your drafts before exporting or restoring.',true);return false;}return true;}
function entryText(date,entry){return `${date}\n${'='.repeat(22)}\n\n`+prompts.map(([key,label])=>`${label}\n${entry[key]||'(Not answered)'}\n`).join('\n');}
$('export-entry').onclick=()=>{if(!noDrafts())return;const entry=state.entries[selected];if(!entry){status('No saved reflection for this date yet.',true);return;}download('Balaji — Daily reflection\n\n'+entryText(selected,entry),`balaji-journal-${selected}.txt`);status('Reflection exported.');};
$('export-journals').onclick=()=>{if(!noDrafts())return;const entries=Object.entries(state.entries).sort(([a],[b])=>a.localeCompare(b));if(!entries.length){status('No saved reflections yet.',true);return;}download('Balaji — Daily reflections\n\n'+entries.map(([date,entry])=>entryText(date,entry)).join('\n\n'),'balaji-journals.txt');status('All reflections exported.');};
$('export').onclick=()=>{if(noDrafts()){download(JSON.stringify(state,null,2),`balaji-backup-${dateKey(new Date())}.json`,'application/json');status('Balaji backup exported.');}};
$('restore').onclick=()=>{if(noDrafts())$('backup').click();};
$('backup').onchange=async()=>{
  const file=$('backup').files[0];if(!file)return;
  try{if(!noDrafts())return;if(file.size>1000000)throw new Error('Backup must be at most 1 MB.');const candidate=JSON.parse(await file.text());if(confirm('Replace Balaji’s goals, reflections, priorities, spending and diesel logs with this backup? Milan’s records will stay as they are.'))await save(candidate,{message:'Balaji backup restored.'});}
  catch(error){status(`Restore failed: ${error.message}`,true);}finally{$('backup').value='';}
};
render();request().then(data=>{state=data;render();status('Your daily space is ready.');}).catch(error=>status(`Cannot open your space: ${error.message} Check the server and reload.`,true));


// Money is stored in whole pence, never floating-point pounds.
const pounds=new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'});
const asPounds=value=>pounds.format(value/100);
function toPence(value){
  if(!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))throw new Error('Enter pounds with at most two decimal places.');
  const [whole,fraction='']=value.trim().split('.'),pence=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(pence)||pence<1||pence>99999999)throw new Error('Enter an amount from £0.01 to £999,999.99.');
  return pence;
}
function monthlyRows(collection,prefix){return Object.entries(collection).filter(([date])=>date.startsWith(prefix+'-')).flatMap(([date,items])=>items.map(item=>({date,...item})));}
function renderFinances(){
  const period=selected.slice(0,7),dayExpenses=state.expenses[selected]||[],dayDiesel=state.diesel[selected]||[];
  const expenses=monthlyRows(state.expenses,period),diesel=monthlyRows(state.diesel,period);
  const sum=items=>items.reduce((total,item)=>total+item.amount_pence,0);
  const monthTotal=sum(expenses)+sum(diesel),today=dateKey(new Date());
  const [year,m]=period.split('-').map(Number),date=new Date(0);date.setFullYear(year,m,0);
  const elapsedDays=period===today.slice(0,7)?Number(today.slice(8)):date.getDate();
  $('money-date').value=selected;$('money-date').max=today;
  $('money-period').textContent=new Date(selected+'T12:00:00').toLocaleDateString(undefined,{month:'long',year:'numeric'});
  $('spent-day').textContent=asPounds(sum(dayExpenses)+sum(dayDiesel));
  $('spent-month').textContent=asPounds(monthTotal);$('diesel-month').textContent=asPounds(sum(diesel));$('spent-average').textContent=asPounds(Math.round(monthTotal/elapsedDays));
  $('expense-total').textContent=asPounds(sum(dayExpenses));$('diesel-total').textContent=asPounds(sum(dayDiesel));
  document.querySelectorAll('.log-date').forEach(element=>element.textContent='Entries for '+new Date(selected+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'}));
  renderMoneyList('expenses',dayExpenses);renderMoneyList('diesel',dayDiesel);
  const expenseDraft=expenseDrafts.get(selected),dieselDraft=dieselDrafts.get(selected);
  $('expense-description').value=expenseDraft?.description||'';$('expense-category').value=expenseDraft?.category||'Other';$('expense-amount').value=expenseDraft?.amount||'';
  $('diesel-amount').value=dieselDraft?.amount||'';
  $('expense-submit').textContent=expenseDraft?.id?'Save change':'Add spend +';$('diesel-submit').textContent=dieselDraft?.id?'Save change':'Add diesel +';
  $('expense-cancel').hidden=!expenseDraft;$('diesel-cancel').hidden=!dieselDraft;
  const categories={};for(const item of expenses)categories[item.category]=(categories[item.category]||0)+item.amount_pence;
  if(diesel.length)categories.Diesel=sum(diesel);
  $('spend-categories').replaceChildren();
  for(const [category,total] of Object.entries(categories).sort((a,b)=>b[1]-a[1])){
    const pill=document.createElement('span');pill.className='category-pill';pill.textContent=category+' ';
    const amount=document.createElement('strong');amount.textContent=asPounds(total);pill.append(amount);$('spend-categories').append(pill);
  }
  if(!Object.keys(categories).length){const empty=document.createElement('p');empty.className='money-note';empty.textContent='A fresh month. Add your first entry to see the breakdown.';$('spend-categories').append(empty);}
  $('money-status').textContent=expenseDrafts.size||dieselDrafts.size?'You have an unsaved spending draft. Save or cancel it before exporting.':'Changes save with each Add, Edit or Remove. Up to 100 entries per day in each log.';
}
function renderMoneyList(collection,items){
  const isDiesel=collection==='diesel',prefix=isDiesel?'diesel':'expense',container=$(prefix+'-list');container.replaceChildren();
  if(!items.length){const empty=document.createElement('p');empty.className='money-empty';empty.textContent=isDiesel?'No diesel spending logged for this day.':'No spending added for this day.';container.append(empty);return;}
  for(const item of items){
    const row=document.createElement('div');row.className='money-item';const details=document.createElement('div');
    const description=document.createElement('p');description.className='item-description';description.textContent=isDiesel?'Diesel':item.description;
    const category=document.createElement('small');category.textContent=isDiesel?'Included in your spending totals':item.category;
    const actions=document.createElement('div');actions.className='item-buttons';
    const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.disabled=busy;edit.setAttribute('aria-label',`Edit ${isDiesel?'diesel':item.description}`);
    edit.onclick=()=>{const draft={id:item.id,amount:(item.amount_pence/100).toFixed(2)};if(!isDiesel)Object.assign(draft,{description:item.description,category:item.category});(isDiesel?dieselDrafts:expenseDrafts).set(selected,draft);renderFinances();$(prefix+'-amount').focus();};
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.disabled=busy;remove.setAttribute('aria-label',`Remove ${isDiesel?'diesel':item.description}`);
    remove.onclick=async()=>{const candidate=structuredClone(state);candidate[collection][selected]=items.filter(value=>value.id!==item.id);if(!candidate[collection][selected].length)delete candidate[collection][selected];if(await save(candidate,{message:'Spending entry removed.'})){const map=isDiesel?dieselDrafts:expenseDrafts;if(map.get(selected)?.id===item.id)map.delete(selected);renderFinances();}};
    actions.append(edit,remove);details.append(description,category,actions);const amount=document.createElement('strong');amount.textContent=asPounds(item.amount_pence);row.append(details,amount);container.append(row);
  }
}
function updateExpenseDraft(){expenseDrafts.set(selected,{id:expenseDrafts.get(selected)?.id,description:$('expense-description').value,category:$('expense-category').value,amount:$('expense-amount').value});$('expense-cancel').hidden=false;$('money-status').textContent='Unsaved spend. Select Add spend to save.';}
$('expense-form').oninput=updateExpenseDraft;$('expense-category').onchange=updateExpenseDraft;
$('diesel-form').oninput=()=>{dieselDrafts.set(selected,{id:dieselDrafts.get(selected)?.id,amount:$('diesel-amount').value});$('diesel-cancel').hidden=false;$('money-status').textContent='Unsaved diesel spend. Select Add diesel to save.';};
$('expense-cancel').onclick=()=>{expenseDrafts.delete(selected);renderFinances();};$('diesel-cancel').onclick=()=>{dieselDrafts.delete(selected);renderFinances();};
for(const [prefix,collection,map] of [['expense','expenses',expenseDrafts],['diesel','diesel',dieselDrafts]]){
  $(prefix+'-form').onsubmit=async event=>{
    event.preventDefault();
    try{
      const draft=map.get(selected)||{},amount_pence=toPence($(prefix+'-amount').value);
      const item={id:draft.id||crypto.randomUUID(),amount_pence};
      if(collection==='expenses'){item.description=$('expense-description').value.trim();item.category=$('expense-category').value;if(!item.description)throw new Error('Add a short description.');}
      const candidate=structuredClone(state),items=candidate[collection][selected]||[];
      if(draft.id){const index=items.findIndex(value=>value.id===draft.id);if(index<0)throw new Error('This entry changed. Cancel and reload.');items[index]=item;}else{if(items.length>=100)throw new Error('This day already has 100 entries in this log.');items.push(item);}
      candidate[collection][selected]=items;
      if(await save(candidate,{message:collection==='diesel'?'Diesel spend saved.':'Spending saved.'})){map.delete(selected);renderFinances();}
    }catch(error){status(error.message,true);$('money-status').textContent=error.message;}
  };
}
function csvCell(value){let text=String(value);if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
$('export-spending').onclick=()=>{
  if(!noDrafts())return;
  const period=selected.slice(0,7),rows=[...monthlyRows(state.expenses,period).map(item=>[item.date,'Spend',item.description,item.category,(item.amount_pence/100).toFixed(2)]),...monthlyRows(state.diesel,period).map(item=>[item.date,'Diesel','Diesel','Diesel',(item.amount_pence/100).toFixed(2)])].sort((a,b)=>a[0].localeCompare(b[0]));
  const csv=[['Date','Type','Description','Category','Amount (GBP)'],...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
  download('\uFEFF'+csv,`balaji-spending-${period}.csv`,'text/csv;charset=utf-8');status('Selected month’s spending and diesel exported.');
};
let lastToday=dateKey(new Date());
window.addEventListener('focus',()=>{const current=dateKey(new Date());if(current!==lastToday){if(selected===lastToday){selected=current;if(state&&!busy)render();}lastToday=current;}});

$('money-date').onchange=()=>{if($('money-date').value&&$('money-date').checkValidity()){selected=$('money-date').value;render();}};


const fieldVocabulary=[
 ['equanimity','A calm, steady state of mind, especially in a difficult situation.','I tried to approach the unexpected change with equanimity.'],
 ['deliberate','Done thoughtfully and intentionally, rather than by chance.','I made a deliberate choice to take a break before replying.'],
 ['discernment','The ability to judge carefully and notice what matters.','Discernment helped me choose which task needed my attention.'],
 ['tenacity','The quality of continuing with determination when something is difficult.','Her tenacity helped her finish a challenging project.'],
 ['pragmatic','Focused on practical solutions that can work in real situations.','We took a pragmatic approach and started with one small change.'],
 ['serendipity','A fortunate discovery or event that happens by chance.','Finding that useful book was a moment of serendipity.'],
 ['nuance','A small but meaningful difference in feeling, meaning, or expression.','Listening carefully helped me understand the nuance in his reply.'],
 ['resilient','Able to recover or adapt after difficulties.','Being resilient can include asking for help when things are hard.'],
 ['intentional','Done with a clear purpose or conscious choice.','I want to be more intentional about spending time with family.'],
 ['perspective','A particular way of seeing or understanding something.','A short walk gave me a different perspective on the problem.'],
 ['incremental','Happening through small additions or steps.','Incremental improvements made the routine easier to maintain.'],
 ['conscientious','Careful, responsible, and concerned with doing something well.','He was conscientious about checking the details.'],
 ['receptive','Willing to listen to or consider new ideas.','I stayed receptive to feedback while learning a new skill.'],
 ['resourceful','Good at finding effective ways to solve problems.','A resourceful colleague found a simpler way to do the task.'],
 ['articulate','Able to express ideas clearly and effectively.','Writing a few notes helped me articulate my thoughts.'],
 ['fortitude','Courage and strength when facing difficulty.','She showed fortitude while working through an uncertain time.'],
 ['sustainable','Able to continue over time without using up the resources it needs.','A shorter daily routine felt more sustainable than an ambitious plan.'],
 ['reciprocity','A mutual exchange of help, kindness, or consideration.','Reciprocity helps a friendship feel supportive on both sides.'],
 ['candid','Honest and direct in a sincere way.','We had a candid conversation about what needed to change.'],
 ['circumspect','Careful to consider possible consequences before acting.','I took a circumspect approach before committing to another project.']
];
let fieldNotesDate='',vocabularyOffset=0;
function renderFieldNotes(){
 if(fieldNotesDate!==selected){fieldNotesDate=selected;vocabularyOffset=0;}
 const seed=Math.floor(new Date(selected+'T12:00:00Z').getTime()/86400000),values=state.days[selected]||emptyGoals(),checks=state.health_checks[selected]||emptyHealth();
 const index=(length,offset)=>((seed+offset)%length+length)%length;
 $('header-checkin-title').textContent=`${goalDefs.filter(goal=>values[goal.key]).length} of 4 goals complete`;
 $('header-checkin-date').textContent=new Date(selected+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
 $('header-goal-status').replaceChildren();
 for(const goal of goalDefs){const pill=document.createElement('span');pill.className='status-pill'+(values[goal.key]?' complete':'');pill.textContent=`${values[goal.key]?'✓':'○'} ${goal.label}`;pill.setAttribute('aria-label',`${goal.label}: ${values[goal.key]?'complete':'not complete'}`);$('header-goal-status').append(pill);}
 $('header-health-status').replaceChildren();
 const title=document.createElement('p');title.textContent='Health routines';$('header-health-status').append(title);
 for(const [key,label] of healthDefs){const status=document.createElement('span');status.textContent=`${checks[key]?'✓':'○'} ${label}`;status.className=checks[key]?'complete':'';$('header-health-status').append(status);}
 if(!state.health_checks[selected]&&values.health){const legacy=document.createElement('p');legacy.className='note-foot';legacy.textContent='Health was previously marked complete; individual routines were not recorded.';$('header-health-status').append(legacy);}
 const [word,meaning,example]=fieldVocabulary[index(fieldVocabulary.length,vocabularyOffset)];
 $('header-vocabulary-word').textContent=word;$('header-vocabulary-meaning').textContent=meaning;$('header-vocabulary-example').textContent='“'+example+'”';
}
$('next-header-word').onclick=()=>{vocabularyOffset++;renderFieldNotes();};


function previousPriorityDate(date){
  if(date==='0001-01-01')return null;
  const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()-1);return value.toISOString().slice(0,10);
}
function splitPriorities(value){
  return [...new Set((value||'').split(/\r?\n/).map(line=>line.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/,'').trim()).filter(Boolean))].slice(0,100);
}
function renderPriorityTodos(){
  const sourceDate=previousPriorityDate(selected),text=sourceDate?state.entries[sourceDate]?.tomorrow_priority:'',tasks=splitPriorities(text),done=state.priority_done[selected]||[];
  const friendly=date=>new Date(date+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'});
  $('todo-source').textContent=sourceDate?`For ${friendly(selected)} · from your reflection on ${friendly(sourceDate)}`:'No previous day is available for this date.';
  $('priority-todos').replaceChildren();
  if(!tasks.length){const empty=document.createElement('p');empty.className='todo-empty';empty.textContent='No priorities were saved for this day. Add them in the previous day’s “Tomorrow’s priority”.';$('priority-todos').append(empty);}
  for(const text of tasks){
    const label=document.createElement('label');label.className='priority-task'+(done.includes(text)?' done':'');
    const box=document.createElement('input');box.type='checkbox';box.checked=done.includes(text);box.disabled=busy;box.setAttribute('aria-label',`Priority: ${text}`);
    const content=document.createElement('span');content.textContent=text;label.append(box,content);
    box.onchange=()=>{const candidate=structuredClone(state),complete=new Set(done.filter(item=>tasks.includes(item)));if(box.checked)complete.add(text);else complete.delete(text);candidate.priority_done[selected]=[...complete];save(candidate,{message:'Priority updated.'});};
    $('priority-todos').append(label);
  }
  $('edit-priority-source').disabled=busy||!sourceDate;
  $('edit-priority-source').onclick=()=>{if(!sourceDate)return;selected=sourceDate;render();$('entry-tomorrow_priority').scrollIntoView({block:'center'});$('entry-tomorrow_priority').focus();};
  const upcoming=splitPriorities(state.entries[selected]?.tomorrow_priority);$('tomorrow-preview').replaceChildren();
  if(upcoming.length){const title=document.createElement('h3');title.textContent='Already planned for tomorrow';const list=document.createElement('ul');for(const text of upcoming){const item=document.createElement('li');item.textContent=text;list.append(item);}$('tomorrow-preview').append(title,list);}
}
