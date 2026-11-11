'use strict';
const $ = id => document.getElementById(id);
const categories = ['reading', 'academics', 'exercise', 'family_fun', 'guitar', 'journal'];
const goals = [30, 30, 30, 10, 20, 5];
const colors = ['#d92136', '#1763c6', '#e5ad19', '#bd3d91', '#177f77', '#7756b7'];
const labels = ['Reading', 'Academics', 'Exercise', 'Family & Fun', 'Guitar', 'Journal'];
const journalFields = ['mood', 'tomorrow_goal', 'thankful', 'challenge', 'proud'];
const journalLabels = ['😊 Today’s mood', '🎯 Tomorrow’s little goal', '🙏 Something I’m thankful for', '🧩 Something challenging', '⭐ My proud moment'];
const journalDrafts = new Map();
const wordDrafts = new Map();
let wordLookupTimer, wordLookupGeneration=0, milanWiserDate='', milanWiserOffset=0;
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
    return true;
  } catch(error) { failed=true; message(`Save failed: ${error.message} Please retry.`,true); return false; }
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
  renderWords();
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
    const hasEntry=Boolean(state.children[child].entries[date] || state.children[child].words[date]?.length);
    button.setAttribute('aria-label',`${date}: ${categories.map((k,i)=>`${labels[i]} ${record[k]} minutes`).join(', ')}${hasEntry?', journal or words saved':''}`);
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
$('export').onclick=()=>{if(journalDrafts.size||wordDrafts.size){message('Save or cancel your journal and word drafts before exporting a backup.',true);return;}const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`activities-${localDate(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('JSON backup exported.');};
$('restore').onclick=()=>$('backup').click();
$('backup').onchange=async()=>{
  const file=$('backup').files[0];if(!file)return;
  try{if(file.size>5000000)throw new Error('Backup is larger than 5 MB.');const candidate=JSON.parse(await file.text());if(journalDrafts.size||wordDrafts.size){message('Save or cancel your journal and word drafts before restoring a backup.',true);return;}if(confirm('Replace Milan’s records and archived second-child records, including journals and words with this backup? Export first if you want to keep the current records.'))await save(candidate);}
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
window.addEventListener('beforeunload',event=>{if(journalDrafts.size||wordDrafts.size){event.preventDefault();event.returnValue='';}});
function downloadText(text,filename){
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function journalText(date,entry){const words=state.children[child].words[date]||[];return `${date}\n${'='.repeat(20)}\n\n`+journalFields.map((key,i)=>`${journalLabels[i]}\n${entry[key] || '(Not answered)'}\n`).join('\n')+(words.length?'\n📚 My words\n'+words.map(item=>`${item.word}: ${item.meaning}`).join('\n\n'):'');}
$('export-entry').onclick=()=>{
  if(journalDrafts.has(journalKey())||wordDrafts.has(journalKey())){message('Save this journal and its words before exporting it.',true);return;}
  const entry=state.children[child].entries[selected] || (state.children[child].words[selected]?.length?blankEntry():null);
  if(!entry){message('There is no saved journal for this day yet.',true);return;}
  downloadText(`${state.children[child].name} — My journal\n\n`+journalText(selected,entry),`journal-${state.children[child].id}-${selected}.txt`);
  message('This day’s journal exported.');
};
$('export-journals').onclick=()=>{
  if([...journalDrafts.keys(),...wordDrafts.keys()].some(key=>key.startsWith(`${child}:`))){message('Save this child’s journal drafts before exporting.',true);return;}
  const dates=[...new Set([...Object.keys(state.children[child].entries),...Object.keys(state.children[child].words)])].sort();
  const entries=dates.map(date=>[date,state.children[child].entries[date]||blankEntry()]);
  if(!entries.length){message('This child has no saved journals yet.',true);return;}
  downloadText(`${state.children[child].name} — My journal\n\n`+entries.map(([date,entry])=>journalText(date,entry)).join('\n\n'),`journals-${state.children[child].id}.txt`);
  message('All saved journals for this child exported.');
};


function dailyWord(){
  const day=Math.floor(new Date(selected+'T12:00:00Z').getTime()/86400000);
  return window.MilanWords[((day%window.MilanWords.length)+window.MilanWords.length)%window.MilanWords.length];
}
function renderWords(){
  if(milanWiserDate!==selected){milanWiserDate=selected;milanWiserOffset=0;}
  const daily=dailyWord(),items=state.children[child].words[selected]||[],draft=wordDrafts.get(journalKey());
  renderMilanWiser(items);
  $('daily-word').textContent=daily.word;$('daily-meaning').textContent=daily.meaning;
  $('add-daily-word').disabled=busy||items.some(item=>item.word.toLowerCase()===daily.word.toLowerCase());
  $('add-daily-word').textContent=items.some(item=>item.word.toLowerCase()===daily.word.toLowerCase())?'Added ✓':'Add to my words +';
  $('new-word').value=draft?.word||'';$('new-meaning').value=draft?.meaning||'';
  $('save-word').textContent=draft?.id?'Save word':'Add word +';$('cancel-word').hidden=!draft;
  $('saved-words').replaceChildren();
  if(!items.length){const empty=document.createElement('p');empty.className='word-empty';empty.textContent='Your word collection for this day starts here.';$('saved-words').append(empty);}
  for(const item of items){
    const card=document.createElement('div');card.className='saved-word';const content=document.createElement('div'),title=document.createElement('h4'),meaning=document.createElement('p');title.textContent=item.word;meaning.textContent=item.meaning;content.append(title,meaning);
    const controls=document.createElement('div');controls.className='word-controls';
    const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.disabled=busy;edit.setAttribute('aria-label',`Edit word ${item.word}`);edit.onclick=()=>{wordDrafts.set(journalKey(),{...item});renderWords();$('new-word').focus();};
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.disabled=busy;remove.setAttribute('aria-label',`Remove word ${item.word}`);remove.onclick=async()=>{const candidate=structuredClone(state);candidate.children[child].words[selected]=items.filter(value=>value.id!==item.id);if(!candidate.children[child].words[selected].length)delete candidate.children[child].words[selected];if(await save(candidate,{successMessage:'Word removed.'})){if(wordDrafts.get(journalKey())?.id===item.id)wordDrafts.delete(journalKey());renderWords();}};
    controls.append(edit,remove);card.append(content,controls);$('saved-words').append(card);
  }
}
function captureWordDraft(){
  const word=$('new-word').value,meaning=$('new-meaning').value,existing=wordDrafts.get(journalKey());
  if(!word&&!meaning&&!existing?.id)wordDrafts.delete(journalKey());else wordDrafts.set(journalKey(),{id:existing?.id,word,meaning});
  $('cancel-word').hidden=!wordDrafts.has(journalKey());
}
async function findMeaning(){
  const word=$('new-word').value.trim(),key=journalKey(),generation=++wordLookupGeneration;
  if(!/^[a-zA-Z]+(?:['-][a-zA-Z]+)*$/.test(word)||word.length>80){$('word-status').textContent='Enter one English word to find its meaning.';return;}
  $('word-status').textContent='Finding the meaning…';
  try{
    const childWord=window.MilanWords.find(item=>item.word.toLowerCase()===word.toLowerCase());
    const shared=globalThis.BalajiVocabulary.find(item=>item[0].toLowerCase()===word.toLowerCase());
    const offline=childWord || (shared?{meaning:shared[1]+'\nExample: '+shared[2]}:null);
    let meaning;
    if(offline)meaning=offline.meaning;
    else{
      const data=await globalThis.MilanDictionary.lookup(word);meaning=data.meaning;
    }
    if(key!==journalKey()||generation!==wordLookupGeneration)return;
    $('new-meaning').value=meaning;captureWordDraft();$('word-status').textContent=offline?'Meaning ready from the offline word list. Select Add word to save it.':'Meaning ready from Free Dictionary API. You can edit it before adding.';
  }catch(error){if(key===journalKey()&&generation===wordLookupGeneration)$('word-status').textContent=error.name==='TimeoutError'?'The dictionary took too long. Try again or enter a meaning yourself.':error.message;}
}
$('new-word').oninput=()=>{clearTimeout(wordLookupTimer);wordLookupGeneration++;$('new-meaning').value='';captureWordDraft();if($('new-word').value.trim().length>=2)wordLookupTimer=setTimeout(findMeaning,700);};
$('new-meaning').oninput=()=>{wordLookupGeneration++;captureWordDraft();};
$('new-word').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$('save-word').click();}};
$('lookup-word').onclick=()=>{clearTimeout(wordLookupTimer);findMeaning();};
$('cancel-word').onclick=()=>{clearTimeout(wordLookupTimer);wordLookupGeneration++;wordDrafts.delete(journalKey());renderWords();$('word-status').textContent='Word draft cleared.';};
async function addWord(word,meaning,id=null){
  word=word.trim();meaning=meaning.trim();
  if(!word||!meaning){$('word-status').textContent='Add a word and its meaning first.';return;}
  const items=state.children[child].words[selected]||[];
  if(items.some(item=>item.id!==id&&item.word.toLowerCase()===word.toLowerCase())){$('word-status').textContent='That word is already saved for this day.';return;}
  if(!id&&items.length>=100){$('word-status').textContent='You have saved 100 words for this day.';return;}
  const candidate=structuredClone(state),item={id:id||crypto.randomUUID(),word,meaning};
  candidate.children[child].words[selected]=id?items.map(value=>value.id===id?item:value):[...items,item];
  if(await save(candidate,{successMessage:'Word saved.'})){wordDrafts.delete(journalKey());renderWords();$('word-status').textContent='Word and meaning saved for this day.';}
}
$('save-word').onclick=()=>{clearTimeout(wordLookupTimer);wordLookupGeneration++;addWord($('new-word').value,$('new-meaning').value,wordDrafts.get(journalKey())?.id);};
$('add-daily-word').onclick=()=>{const daily=dailyWord();if(wordDrafts.has(journalKey())){$('word-status').textContent='Save or cancel your typed word before adding the daily word.';return;}addWord(daily.word,daily.meaning);};


function milanWiserWord(){
 const day=Math.floor(new Date(selected+'T12:00:00Z').getTime()/86400000),words=globalThis.BalajiVocabulary;
 const index=((day+milanWiserOffset)%words.length+words.length)%words.length;
 return {index,word:words[index][0],meaning:words[index][1],example:words[index][2]};
}
function renderMilanWiser(items){
 const entry=milanWiserWord(),added=items.some(item=>item.word.toLowerCase()===entry.word.toLowerCase());
 $('milan-wiser-position').textContent=`${entry.index+1} / ${globalThis.BalajiVocabulary.length}`;
 $('milan-wiser-word').textContent=entry.word;$('milan-wiser-meaning').textContent=entry.meaning;$('milan-wiser-example').textContent='“'+entry.example+'”';
 $('add-milan-wiser').disabled=busy||added;$('next-milan-wiser').disabled=busy;$('add-milan-wiser').textContent=added?'Added ✓':'Add this word +';
}
$('next-milan-wiser').onclick=()=>{milanWiserOffset++;renderMilanWiser(state.children[child].words[selected]||[]);};
$('add-milan-wiser').onclick=()=>{if(wordDrafts.has(journalKey())){$('word-status').textContent='Save or cancel your typed word first.';return;}const entry=milanWiserWord();addWord(entry.word,entry.meaning+'\nExample: '+entry.example);};
