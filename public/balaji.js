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
  ['tomorrow_priority','🎯 Tomorrow’s priority','One thing to give your attention to next.','Tomorrow, my first small step is…']
];
const dateKey=d=>`${String(d.getFullYear()).padStart(4,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const emptyGoals=()=>Object.fromEntries(goalDefs.map(g=>[g.key,false]));
const emptyEntry=()=>Object.fromEntries(prompts.map(p=>[p[0],'']));
let state, revision, selected=dateKey(new Date()), month=selected.slice(0,7), busy=false;
const drafts=new Map();
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
  try{state=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(candidate)});if(journal)drafts.delete(selected);status(message);}
  catch(error){status(`Save failed: ${error.message}`,true);}
  finally{busy=false;render();}
}
function render(){
  document.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=busy||!state);
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
    card.append(number,title,hint,image,label);$('goals').append(card);
  });
  const entry=drafts.get(selected)||state.entries[selected]||emptyEntry();prompts.forEach(([key])=>$(`entry-${key}`).value=entry[key]);
  $('journal-status').textContent=drafts.has(selected)?'Unsaved draft. Save your reflection to keep it.':state.entries[selected]?'Saved for this day. You can come back and edit it.':'All prompts are optional. Up to 2,000 characters per answer.';
  renderCalendar();
}
function renderCalendar(){
  const [y,m]=month.split('-').map(Number), first=new Date(0);first.setFullYear(y,m-1,1);first.setHours(12,0,0,0);
  $('month-title').textContent=first.toLocaleDateString(undefined,{month:'long',year:'numeric'});$('calendar').replaceChildren();
  for(let i=0;i<(first.getDay()+6)%7;i++)$('calendar').append(document.createElement('span'));
  const end=new Date(first);end.setMonth(end.getMonth()+1);end.setDate(0);
  for(let day=1;day<=end.getDate();day++){
    const date=`${month}-${String(day).padStart(2,'0')}`,values=state.days[date]||emptyGoals(),count=goalDefs.filter(g=>values[g.key]).length;
    const button=document.createElement('button');button.textContent=day;button.disabled=busy||date>dateKey(new Date());button.className=(date===selected?'selected ':'')+(date===dateKey(new Date())?'current':'');
    button.setAttribute('aria-pressed',String(date===selected));button.setAttribute('aria-label',`${date}: ${count} of 4 goals complete${state.entries[date]?', journal saved':''}`);
    if(count){const dot=document.createElement('span');dot.className='completion-dot';dot.setAttribute('aria-hidden','true');button.append(dot);}
    if(state.entries[date]){const mark=document.createElement('span');mark.className='journal-mark';mark.textContent='✎';mark.setAttribute('aria-hidden','true');button.append(mark);}
    button.onclick=()=>{selected=date;render();};$('calendar').append(button);
  }
  $('next').disabled=busy||month>=dateKey(new Date()).slice(0,7);$('prev').disabled=busy||month==='0001-01';
}
function moveMonth(offset){const [y,m]=month.split('-').map(Number),d=new Date(0);d.setFullYear(y,m-1+offset,1);month=dateKey(d).slice(0,7);render();}
$('prev').onclick=()=>moveMonth(-1);$('next').onclick=()=>moveMonth(1);
$('today').onclick=()=>{selected=dateKey(new Date());month=selected.slice(0,7);render();};
$('date').onchange=()=>{if($('date').value&&$('date').checkValidity()){selected=$('date').value;month=selected.slice(0,7);render();}};
$('journal-form').oninput=()=>{
  const entry=readEntry(),original=state.entries[selected]||emptyEntry();
  if(prompts.every(([key])=>entry[key]===original[key]))drafts.delete(selected);else drafts.set(selected,entry);
  $('journal-status').textContent=drafts.has(selected)?'Unsaved draft. Save your reflection to keep it.':'No unsaved changes.';
};
$('journal-form').onsubmit=event=>{event.preventDefault();const candidate=structuredClone(state),entry=readEntry();if(prompts.some(([key])=>entry[key].trim()))candidate.entries[selected]=entry;else delete candidate.entries[selected];save(candidate,{journal:true,message:'Reflection saved.'});};
window.addEventListener('beforeunload',event=>{if(drafts.size){event.preventDefault();event.returnValue='';}});
function download(text,name,type='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function noDrafts(){if(drafts.size){status('Save your reflection drafts before exporting or restoring.',true);return false;}return true;}
function entryText(date,entry){return `${date}\n${'='.repeat(22)}\n\n`+prompts.map(([key,label])=>`${label}\n${entry[key]||'(Not answered)'}\n`).join('\n');}
$('export-entry').onclick=()=>{if(!noDrafts())return;const entry=state.entries[selected];if(!entry){status('No saved reflection for this date yet.',true);return;}download('Balaji — Daily reflection\n\n'+entryText(selected,entry),`balaji-journal-${selected}.txt`);status('Reflection exported.');};
$('export-journals').onclick=()=>{if(!noDrafts())return;const entries=Object.entries(state.entries).sort(([a],[b])=>a.localeCompare(b));if(!entries.length){status('No saved reflections yet.',true);return;}download('Balaji — Daily reflections\n\n'+entries.map(([date,entry])=>entryText(date,entry)).join('\n\n'),'balaji-journals.txt');status('All reflections exported.');};
$('export').onclick=()=>{if(noDrafts()){download(JSON.stringify(state,null,2),`balaji-backup-${dateKey(new Date())}.json`,'application/json');status('Balaji backup exported.');}};
$('restore').onclick=()=>{if(noDrafts())$('backup').click();};
$('backup').onchange=async()=>{
  const file=$('backup').files[0];if(!file)return;
  try{if(!noDrafts())return;if(file.size>1000000)throw new Error('Backup must be at most 1 MB.');const candidate=JSON.parse(await file.text());if(confirm('Replace Balaji’s goals and reflections with this backup? Milan’s records will stay as they are.'))await save(candidate,{message:'Balaji backup restored.'});}
  catch(error){status(`Restore failed: ${error.message}`,true);}finally{$('backup').value='';}
};
render();request().then(data=>{state=data;render();status('Your daily space is ready.');}).catch(error=>status(`Cannot open your space: ${error.message} Check the server and reload.`,true));
