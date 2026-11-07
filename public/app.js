'use strict';
const $ = id => document.getElementById(id);
const categories = ['reading', 'academics', 'exercise', 'family_fun', 'guitar', 'journal'];
const goals = [30, 30, 30, 10, 20, 5];
const colors = ['#d92136', '#1763c6', '#e5ad19', '#bd3d91', '#177f77', '#7756b7'];
const labels = ['Reading', 'Academics', 'Exercise', 'Family & Fun', 'Guitar', 'Journal'];
const journalFields = ['mood', 'tomorrow_goal', 'thankful', 'challenge', 'proud'];
const journalLabels = ['😊 Today’s mood', '🎯 Tomorrow’s little goal', '🙏 Something I’m thankful for', '🧩 Something challenging', '⭐ My proud moment'];
const journalDrafts = new Map();
const journalKey = () => `${child}:${selected}`;
const blankEntry = () => Object.fromEntries(journalFields.map(key=>[key,'']));
const readEntry = () => Object.fromEntries(journalFields.map(key=>[key,$(`entry-${key}`).value]));
const localDate = d => `${String(d.getFullYear()).padStart(4,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
let state, revision, child = 0, selected = localDate(new Date()), month = selected.slice(0,7), busy = false;
const empty = () => Object.fromEntries(categories.map(key=>[key,0]));
function message(text, error=false) { $('status').textContent=text; $('status').className=error?'error':''; }
async function request(options) {
  if (options && revision !== undefined && revision !== null) options.headers['X-Activities-Revision']=revision;
  const response=await fetch('/api/activities', options);
  const data=await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  revision=response.headers.get('X-Activities-Revision') ?? response.headers.get('ETag')?.replace(/^W\//,'').replaceAll('"','');
  return data;
}
async function save(candidate, {savedJournalKey=null, successMessage='Activities saved.'}={}) {
  if (busy) return;
  const draftName=$('name').value;
  const draftMinutes=categories.map(k=>$(`minutes-${k}`).value);
  let failed=false;
  busy=true; render(); message('Saving…');
  try {
    state=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(candidate)});
    if(savedJournalKey !== null) journalDrafts.delete(savedJournalKey);
    message(successMessage);
  } catch(error) { failed=true; message(`Save failed: ${error.message} Please retry.`,true); }
  finally {
    busy=false; render();
    if(failed){$('name').value=draftName;categories.forEach((k,i)=>{$(`minutes-${k}`).value=draftMinutes[i];});}
  }
}
function render() {
  document.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=busy || !state);
  if (!state) return;
  document.querySelectorAll('[data-child]').forEach((button,i)=>{
    button.textContent=state.children[i].name;
    const small=document.createElement('small'); small.textContent=i===child?'Your daily activity journal':'Open activity journal';button.append(small);
    button.setAttribute('aria-pressed',String(i===child));
  });
  renderAffirmations();
  renderJournal();
  $('name').value=state.children[child].name;
  $('date').max=localDate(new Date()); $('date').value=selected;
  const values={...empty(),...state.children[child].days[selected]};
  $('day-title').textContent=new Date(selected+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric',year:'numeric'});
  $('daily-total').textContent=`${categories.filter((k,i)=>values[k]>=goals[i]).length} / 6 goals met`;
  $('activities').replaceChildren(); $('minute-fields').replaceChildren();
  categories.forEach((key,i)=>{
    const activity=document.createElement('div');activity.className='activity';
    activity.innerHTML=`<div class="ring" style="--color:${colors[i]};--progress:${Math.min(values[key]/goals[i],1)*360}deg"><div class="ring-inner"><strong>${values[key]}</strong><span>/ ${goals[i]} min</span></div></div><h3>${labels[i]}</h3>`;
    for (const amount of [5,10]) {
      const button=document.createElement('button'); button.textContent=`+${amount} min`;button.disabled=busy;
      button.setAttribute('aria-label',`Add ${amount} minutes of ${labels[i]}`);
      button.onclick=()=>{
        const candidate=structuredClone(state);const days=candidate.children[child].days;
        days[selected]={...values,[key]:values[key]+amount};save(candidate);
      };activity.append(button);
    }
    $('activities').append(activity);
    const label=document.createElement('label');label.textContent=labels[i];
    const input=document.createElement('input');input.type='number';input.min='0';input.max='1440';input.step='1';input.required=true;input.value=values[key];input.id=`minutes-${key}`;input.disabled=busy;label.append(input);$('minute-fields').append(label);
  });
  const [year,m]=month.split('-').map(Number);
  const first=new Date(0);first.setFullYear(year,m-1,1);first.setHours(12,0,0,0);
  $('month-title').textContent=first.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  $('calendar').replaceChildren();
  for(let n=0;n<(first.getDay()+6)%7;n++) $('calendar').append(document.createElement('span'));
  const last=new Date(first);last.setMonth(last.getMonth()+1);last.setDate(0);
  for(let day=1;day<=last.getDate();day++) {
    const date=`${month}-${String(day).padStart(2,'0')}`, record={...empty(),...state.children[child].days[date]};
    const button=document.createElement('button');button.textContent=day;button.disabled=busy || date>localDate(new Date());
    button.className=(date===selected?'selected ':'')+(date===localDate(new Date())?'current':'');
    button.setAttribute('aria-pressed',String(date===selected));
    const hasEntry=Boolean(state.children[child].entries[date]);
    button.setAttribute('aria-label',`${date}: ${categories.map((k,i)=>`${labels[i]} ${record[k]} minutes`).join(', ')}${hasEntry?', journal entry saved':''}`);
    if(hasEntry){const marker=document.createElement('span');marker.className='entry-marker';marker.textContent='📝';marker.setAttribute('aria-hidden','true');button.append(marker);}
    const bars=document.createElement('span');bars.className='bars';
    categories.forEach((key,i)=>{const bar=document.createElement('span');bar.className='bar';bar.innerHTML=`<i style="--color:${colors[i]};--fill:${Math.min(record[key]/goals[i],1)*100}%"></i>`;bars.append(bar);});
    button.append(bars);button.onclick=()=>{selected=date;render();};$('calendar').append(button);
  }
  $('next').disabled=busy || month>=localDate(new Date()).slice(0,7);
  $('prev').disabled=busy || month==='0001-01';
}
document.querySelectorAll('[data-child]').forEach(button=>button.onclick=()=>{child=Number(button.dataset.child);render();});
$('date').onchange=()=>{if($('date').value && $('date').checkValidity()){selected=$('date').value;month=selected.slice(0,7);render();}};
$('name-form').onsubmit=event=>{event.preventDefault();const name=$('name').value.trim();if(!name){message('Enter a name.',true);return;}const candidate=structuredClone(state);candidate.children[child].name=name;save(candidate);};
$('minutes-form').onsubmit=event=>{event.preventDefault();const candidate=structuredClone(state);candidate.children[child].days[selected]=Object.fromEntries(categories.map(k=>[k,Number($(`minutes-${k}`).value)]));save(candidate);};
function moveMonth(offset){const [y,m]=month.split('-').map(Number);const d=new Date(0);d.setFullYear(y,m-1+offset,1);month=localDate(d).slice(0,7);render();}
$('prev').onclick=()=>moveMonth(-1);$('next').onclick=()=>moveMonth(1);
$('today').onclick=()=>{selected=localDate(new Date());month=selected.slice(0,7);render();};
$('export').onclick=()=>{if(journalDrafts.size){message('Save your journal drafts before exporting a backup.',true);return;}const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`activities-${localDate(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('JSON backup exported.');};
$('restore').onclick=()=>$('backup').click();
$('backup').onchange=async()=>{
  const file=$('backup').files[0];if(!file)return;
  try{if(file.size>5000000)throw new Error('Backup is larger than 5 MB.');const candidate=JSON.parse(await file.text());if(journalDrafts.size){message('Save your journal drafts before restoring a backup.',true);return;}if(confirm('Replace Milan’s records and archived second-child records, including journals with this backup? Export first if you want to keep the current records.'))await save(candidate);}
  catch(error){message(`Restore failed: ${error.message}`,true);}
  finally{$('backup').value='';}
};
render();request().then(data=>{state=data;render();message('Connected. Your journal is ready.');}).catch(error=>message(`Cannot connect: ${error.message} Check your connection and reload this page. If running locally, start server.py first.`,true));


// Encouragement is independent of minutes or completed goals.
const affirmations = [
  'I am enough, exactly as I am.',
  'My worth does not depend on what I finish today.',
  'I deserve kindness, including from myself.',
  'My feelings matter, and I can talk about them.',
  'I can be brave and feel nervous at the same time.',
  'I am learning at my own pace.',
  'Mistakes help me discover new ways to learn.',
  'I can ask for help. I do not have to do everything alone.',
  'I belong, just as I am.',
  'My ideas and my voice matter.',
  'I can speak to myself like a good friend.',
  'Rest is part of taking care of myself.',
  'I can try again when I am ready.',
  'I am more than a score, a grade, or a finished task.',
  'I bring something special to my family.',
  'I can be proud of the effort I choose to make.',
  'I do not need to be perfect to be loved.',
  'I can celebrate what makes me different.',
  'I can take one small step at a time.',
  'It is okay to say that something feels hard.',
  'I can listen to what my body needs.',
  'I am allowed to set kind, clear boundaries.',
  'I have strengths, and I am still discovering them.',
  'I can enjoy learning without comparing myself to others.',
  'I can make space for fun and laughter.',
  'My curiosity is a strength.',
  'I can notice one thing I like about myself today.',
  'A difficult moment does not define who I am.',
  'I can choose a kind action, even a small one.',
  'I deserve to feel safe and respected.',
  'I can be a good friend to myself and others.',
  'I can feel proud of being myself.',
  'My creativity does not have to look like anyone else’s.',
  'I can start fresh without being unkind to myself.',
  'I have people I can turn to when I need support.',
  'There is room for all my feelings.'
];
let affirmationStep=0;
function renderAffirmations() {
  const seed=[...selected].reduce((sum,c)=>sum+c.charCodeAt(0),0)+child*11+affirmationStep;
  $('affirmation-name').textContent=`A reminder for ${state.children[child].name}`;
  $('affirmation-main').textContent=affirmations[seed%affirmations.length];
  const cards=$('affirmation-cards');cards.replaceChildren();
  for(let offset=1;offset<=3;offset++){
    const item=document.createElement('p');item.textContent=affirmations[(seed+offset)%affirmations.length];cards.append(item);
  }
}
$('affirmation-next').onclick=()=>{affirmationStep+=4;renderAffirmations();};


function renderJournal() {
  const entry=journalDrafts.get(journalKey()) || state.children[child].entries[selected] || blankEntry();
  $('journal-title').textContent=`${state.children[child].name}’s journal`;
  $('journal-date').textContent=new Date(selected+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  journalFields.forEach(key=>{$(`entry-${key}`).value=entry[key];});
  $('journal-status').textContent=journalDrafts.has(journalKey())
    ? 'Unsaved draft — select Save journal to keep it. Drafts stay here while you browse other days.'
    : state.children[child].entries[selected] ? 'Saved entry for this day. You can edit and save it again.' : 'A fresh page for this day. Every answer is optional. Up to 2,000 characters per answer.';
}
$('journal-form').oninput=()=>{
  const entry=readEntry(), stored=state.children[child].entries[selected] || blankEntry();
  if(journalFields.every(key=>entry[key]===stored[key])) journalDrafts.delete(journalKey());
  else journalDrafts.set(journalKey(),entry);
  $('journal-status').textContent=journalDrafts.has(journalKey())?'Unsaved draft — select Save journal to keep it.':'No unsaved changes.';
};
$('journal-form').onsubmit=event=>{
  event.preventDefault();
  const candidate=structuredClone(state), entry=readEntry();
  if(journalFields.some(key=>entry[key].trim())) candidate.children[child].entries[selected]=entry;
  else delete candidate.children[child].entries[selected];
  save(candidate,{savedJournalKey:journalKey(),successMessage:'Journal saved.'});
};
window.addEventListener('beforeunload',event=>{if(journalDrafts.size){event.preventDefault();event.returnValue='';}});
function downloadText(text,filename){
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function journalText(date,entry){return `${date}\n${'='.repeat(20)}\n\n`+journalFields.map((key,i)=>`${journalLabels[i]}\n${entry[key] || '(Not answered)'}\n`).join('\n');}
$('export-entry').onclick=()=>{
  if(journalDrafts.has(journalKey())){message('Save this journal before exporting it.',true);return;}
  const entry=state.children[child].entries[selected];
  if(!entry){message('There is no saved journal for this day yet.',true);return;}
  downloadText(`${state.children[child].name} — My journal\n\n`+journalText(selected,entry),`journal-${state.children[child].id}-${selected}.txt`);
  message('This day’s journal exported.');
};
$('export-journals').onclick=()=>{
  if([...journalDrafts.keys()].some(key=>key.startsWith(`${child}:`))){message('Save this child’s journal drafts before exporting.',true);return;}
  const entries=Object.entries(state.children[child].entries).sort(([a],[b])=>a.localeCompare(b));
  if(!entries.length){message('This child has no saved journals yet.',true);return;}
  downloadText(`${state.children[child].name} — My journal\n\n`+entries.map(([date,entry])=>journalText(date,entry)).join('\n\n'),`journals-${state.children[child].id}.txt`);
  message('All saved journals for this child exported.');
};
