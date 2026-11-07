'use strict';
const $ = id => document.getElementById(id);
const categories = ['reading', 'academics', 'exercise'];
const colors = ['#dc785b', '#8e86bd', '#63a28c'];
const labels = ['Reading', 'Academics', 'Exercise'];
const localDate = d => `${String(d.getFullYear()).padStart(4,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
let state, child = 0, selected = localDate(new Date()), month = selected.slice(0,7), busy = false;
const empty = () => ({reading:0, academics:0, exercise:0});
function message(text, error=false) { $('status').textContent=text; $('status').className=error?'error':''; }
async function request(options) {
  const response=await fetch('/api/activities', options);
  const data=await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
async function save(candidate) {
  if (busy) return;
  const draftName=$('name').value;
  const draftMinutes=categories.map(k=>$(`minutes-${k}`).value);
  let failed=false;
  busy=true; render(); message('Saving…');
  try {
    state=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(candidate)});
    message('Saved on this computer.');
  } catch(error) { failed=true; message(`Save failed: ${error.message} Please retry.`,true); }
  finally {
    busy=false; render();
    if(failed){$('name').value=draftName;categories.forEach((k,i)=>{$(`minutes-${k}`).value=draftMinutes[i];});}
  }
}
function render() {
  document.querySelectorAll('button,input').forEach(el=>el.disabled=busy || !state);
  if (!state) return;
  document.querySelectorAll('[data-child]').forEach((button,i)=>{
    button.textContent=state.children[i].name;
    const small=document.createElement('small'); small.textContent=i===child?'Your daily activity journal':'Open activity journal';button.append(small);
    button.setAttribute('aria-pressed',String(i===child));
  });
  $('name').value=state.children[child].name;
  $('date').max=localDate(new Date()); $('date').value=selected;
  const values=state.children[child].days[selected] || empty();
  $('day-title').textContent=new Date(selected+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric',year:'numeric'});
  $('daily-total').textContent=`${categories.filter(k=>values[k]>=30).length} / 3 goals met`;
  $('activities').replaceChildren(); $('minute-fields').replaceChildren();
  categories.forEach((key,i)=>{
    const activity=document.createElement('div');activity.className='activity';
    activity.innerHTML=`<div class="ring" style="--color:${colors[i]};--progress:${Math.min(values[key]/30,1)*360}deg"><div class="ring-inner"><strong>${values[key]}</strong><span>/ 30 min</span></div></div><h3>${labels[i]}</h3>`;
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
    const date=`${month}-${String(day).padStart(2,'0')}`, record=state.children[child].days[date]||empty();
    const button=document.createElement('button');button.textContent=day;button.disabled=busy || date>localDate(new Date());
    button.className=(date===selected?'selected ':'')+(date===localDate(new Date())?'current':'');
    button.setAttribute('aria-pressed',String(date===selected));
    button.setAttribute('aria-label',`${date}: ${categories.map((k,i)=>`${labels[i]} ${record[k]} minutes`).join(', ')}`);
    const bars=document.createElement('span');bars.className='bars';
    categories.forEach((key,i)=>{const bar=document.createElement('span');bar.className='bar';bar.innerHTML=`<i style="--color:${colors[i]};--fill:${Math.min(record[key]/30,1)*100}%"></i>`;bars.append(bar);});
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
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`activities-${localDate(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('JSON backup exported.');};
$('restore').onclick=()=>$('backup').click();
$('backup').onchange=async()=>{
  const file=$('backup').files[0];if(!file)return;
  try{if(file.size>5000000)throw new Error('Backup is larger than 5 MB.');const candidate=JSON.parse(await file.text());if(confirm('Replace both children’s names and all activity records with this backup? Export first if you want to keep the current records.'))await save(candidate);}
  catch(error){message(`Restore failed: ${error.message}`,true);}
  finally{$('backup').value='';}
};
render();request().then(data=>{state=data;render();message('Connected. Changes save on this computer.');}).catch(error=>message(`Cannot connect: ${error.message} Start server.py and reload this page.`,true));
