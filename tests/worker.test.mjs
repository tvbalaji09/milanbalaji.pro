import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import worker, {validate, validateBalaji, lookupDictionary} from '../cloudflare/worker.mjs';
const initial = () => ({version:4, children:[1,2].map(i=>({id:`child-${i}`,name:`Child ${i}`,days:{},entries:{},words:{}}))});
const day = values => ({reading:0, academics:0, exercise:0, family_fun:0, guitar:0, journal:0, ...values});
const auth = 'Basic '+Buffer.from('family:test-password').toString('base64');
function setup(t) {
  const folder=mkdtempSync(join(tmpdir(),'activities-worker-'));
  let db;
  function reopen() { db?.close(); db=new DatabaseSync(join(folder,'test.sqlite')); }
  reopen();
  for(const file of ['0001_activities.sql','0002_balaji.sql'])db.exec(readFileSync(new URL('../cloudflare/migrations/'+file,import.meta.url),'utf8'));
  t.after(()=>{db.close();rmSync(folder,{recursive:true});});
  // Execute the Worker's exact prepared SQL against a real file-backed SQLite database.
  const env={APP_USERNAME:'family',APP_PASSWORD:'test-password',TIME_ZONE:'Europe/London',
    DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;}};}},
    ASSETS:{async fetch(request){return new Response(new URL(request.url).pathname);}}};
  const request=(path='/',options={})=>worker.fetch(new Request('https://example.test'+path,{
    ...options,headers:{Authorization:auth,...options.headers}
  }),env);
  const get=()=>request('/api/activities');
  const save=(data,etag='"0"',headers={})=>request('/api/activities',{method:'POST',headers:{'Content-Type':'application/json','If-Match':etag,...headers},body:JSON.stringify(data)});
  return {env,request,get,save,reopen};
}
test('saving, restart, restoring and separate child records',async t=>{
  const app=setup(t);const data=initial();
  data.children[0].name='Alex';data.children[1].name='Robin';
  data.children[0].days['2020-01-01']=day({reading:35,academics:10,exercise:30});
  data.children[1].days['2020-01-01']=day({reading:5,academics:30,exercise:60});
  const first=await app.get();assert.equal(first.headers.get('ETag'),'"0"');
  const saved=await app.save(data);assert.equal(saved.status,200);assert.equal(saved.headers.get('ETag'),'"1"');
  app.reopen();const backup=await (await app.get()).json();assert.deepEqual(backup,data);
  const changed=structuredClone(data);changed.children[0].days['2020-01-01'].reading=0;
  assert.equal((await app.save(changed,'"1"')).status,200);
  assert.deepEqual((await (await app.get()).json()).children[1],data.children[1]);
  assert.equal((await app.save(backup,'"2"')).status,200);
  app.reopen();assert.deepEqual(await (await app.get()).json(),backup);
});
test('stale saves, invalid restores, cross-origin requests leave data intact',async t=>{
  const app=setup(t);assert.equal((await app.save(initial())).status,200);
  assert.equal((await app.save(initial())).status,409);
  assert.equal((await app.save(initial(),'')).status,428);
  assert.equal((await app.save(initial(),'"1"',{Origin:'https://evil.test'})).status,403);
  for(const value of [null,{},[],{version:1,children:[]}]) assert.equal((await app.save(value,'"1"')).status,400);
  const bad=initial();bad.children[0].days['2020-02-30']=day({reading:0,academics:0,exercise:0});
  assert.equal((await app.save(bad,'"1"')).status,400);
  assert.deepEqual(await (await app.get()).json(),initial());
  assert.equal((await app.get()).headers.get('ETag'),'"1"');
});
test('application revision works without ETags and legacy weak ETags remain compatible',async t=>{
  const app=setup(t);
  const response=await app.get();assert.equal(response.headers.get('X-Activities-Revision'),'0');
  const renamed=initial();renamed.children[0].name='New name';
  const saved=await app.request('/api/activities',{method:'POST',headers:{
    'Content-Type':'application/json','X-Activities-Revision':'0'
  },body:JSON.stringify(renamed)});
  assert.equal(saved.status,200);assert.equal(saved.headers.get('X-Activities-Revision'),'1');
  const stale=await app.request('/api/activities',{method:'POST',headers:{
    'Content-Type':'application/json','X-Activities-Revision':'0'
  },body:JSON.stringify(initial())});
  assert.equal(stale.status,409);
  assert.equal((await app.save(renamed,'W/"1"')).status,200);
  app.reopen();assert.deepEqual(await (await app.get()).json(),renamed);
});
test('authentication protects API, HTML, assets, and unconfigured deployments',async t=>{
  const app=setup(t);
  for(const path of ['/','/app.js','/styles.css','/api/activities']) {
    const denied=await app.request(path,{headers:{Authorization:''}});assert.equal(denied.status,401);
    assert.match(denied.headers.get('WWW-Authenticate'),/^Basic/);assert.equal(denied.headers.get('Cache-Control'),'no-store');
    assert.equal((await app.request(path,{headers:{Authorization:'Basic !!!'}})).status,401);
    assert.equal((await app.request(path,{headers:{Authorization:'Basic '+btoa('family:wrong')}})).status,401);
  }
  assert.equal(await (await app.request('/')).text(),'/kids-activity.html');
  assert.equal((await app.request('/data/activities.json')).status,404);
  delete app.env.APP_PASSWORD;assert.equal((await app.get()).status,503);
});
test('storage errors and oversized restores return controlled errors',async t=>{
  const app=setup(t);
  assert.equal((await app.save({padding:'x'.repeat(1_000_001)})).status,400);
  app.env.DB.prepare=()=>{throw new Error('private database details');};
  const failed=await app.get();assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private database/);
});
test('validation matches local goals and backup schema',()=>{
  for(const value of [-1,1.5,true,1441,'30']) {
    const bad=initial();bad.children[0].days['2020-01-01']=day({reading:value,academics:0,exercise:0});assert.throws(()=>validate(bad));
  }
  for(const date of ['9999-01-01','0000-01-01','2023-02-29','2020-1-1']) {
    const bad=initial();bad.children[0].days[date]=day({reading:0,academics:0,exercise:0});assert.throws(()=>validate(bad,'2026-11-07'));
  }
  const bad=initial();bad.children[0].days['2020-01-01']=day({reading:1000,academics:1000,exercise:0});assert.throws(()=>validate(bad));
});

test('legacy three-activity records load and restore without losing original minutes',async t=>{
  const app=setup(t);
  const legacy=initial();legacy.version=1;
  legacy.children[0].name='Legacy child';
  legacy.children[0].days['2020-01-01']={reading:35,academics:20,exercise:10};
  await app.env.DB.prepare('UPDATE activities SET body = ? WHERE id = 1 RETURNING id').bind(JSON.stringify(legacy)).first();
  const upgraded=await (await app.get()).json();
  assert.equal(upgraded.version,4);
  assert.equal(upgraded.children[0].name,'Legacy child');
  assert.deepEqual(upgraded.children[0].days['2020-01-01'],day({reading:35,academics:20,exercise:10}));
  assert.equal((await app.save(legacy)).status,200);
  const expanded=await (await app.get()).json();
  expanded.children[0].days['2020-01-01'].family_fun=10;
  expanded.children[0].days['2020-01-01'].guitar=20;
  expanded.children[0].days['2020-01-01'].journal=5;
  assert.equal((await app.save(expanded,'"1"')).status,200);
  app.reopen();assert.deepEqual(await (await app.get()).json(),expanded);
  const invalid=structuredClone(expanded);invalid.children[0].days['2020-01-01'].guitar=-1;
  assert.equal((await app.save(invalid,'"2"')).status,400);
  assert.deepEqual(await (await app.get()).json(),expanded);
});

test('journals persist, restore, isolate children and reject invalid entries atomically',async t=>{
  const app=setup(t), data=initial();
  const entry={mood:'Happy 😊',tomorrow_goal:'Try a new chord',thankful:'My family',challenge:'A tricky sum',proud:'I asked for help'};
  data.children[0].entries['2020-01-01']=entry;
  data.children[0].entries['2020-01-02']={...entry,mood:'A little nervous'};
  data.children[1].entries['2020-01-01']={...entry,mood:'Calm'};
  assert.equal((await app.save(data)).status,200);
  app.reopen();assert.deepEqual(await (await app.get()).json(),data);
  const backup=await (await app.get()).json();
  const changed=structuredClone(data);delete changed.children[0].entries['2020-01-01'];
  assert.equal((await app.save(changed,'"1"')).status,200);
  assert.equal((await app.save(backup,'"2"')).status,200);
  app.reopen();assert.deepEqual(await (await app.get()).json(),backup);
  for(const value of [null,{...entry,mood:42},{...entry,proud:'a'.repeat(2001)},{...entry,extra:'unexpected'}]){
    const invalid=structuredClone(data);invalid.children[0].entries['2020-01-01']=value;
    assert.equal((await app.save(invalid,'"3"')).status,400);
  }
  const future=structuredClone(data);future.children[0].entries['9999-01-01']=entry;
  assert.equal((await app.save(future,'"3"')).status,400);
  assert.deepEqual(await (await app.get()).json(),data);
  const v2=initial();v2.version=2;v2.children.forEach(child=>delete child.entries);
  assert.deepEqual(validate(v2).children.map(child=>child.entries),[{},{}]);
});

test('Balaji goals and six journal fields persist without altering Milan or archived records',async t=>{
  const app=setup(t), original=await (await app.get()).json();
  const response=await app.request('/api/balaji');assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data,{version:2,name:'Balaji',days:{},entries:{},expenses:{},diesel:{},health_checks:{},priority_done:{}});
  data.days['2020-01-01']={connect:true,move:false,health:true,learn:false};
  data.entries['2020-01-01']={mood_energy:'Calm',win:'Finished a task',work_learning:'Learned something',health_fitness:'Walked',gratitude:'Family',tomorrow_priority:'Connect'};
  const post=(value,rev='0')=>app.request('/api/balaji',{method:'POST',headers:{'Content-Type':'application/json','X-Activities-Revision':rev},body:JSON.stringify(value)});
  assert.equal((await post(data)).status,200);
  app.reopen();assert.deepEqual(await (await app.request('/api/balaji')).json(),data);
  assert.deepEqual(await (await app.get()).json(),original);
  assert.equal((await app.get()).headers.get('X-Activities-Revision'),'0');
  assert.equal((await post(data)).status,409);
  const invalid=structuredClone(data);invalid.days['2020-01-01'].move=30;
  assert.equal((await post(invalid,'1')).status,400);
  assert.equal((await post(original,'1')).status,400);
  const cleared={version:1,name:'Balaji',days:{},entries:{}};
  assert.equal((await post(cleared,'1')).status,200);
  assert.equal((await post(data,'2')).status,200);
  assert.deepEqual(await (await app.request('/api/balaji')).json(),data);
  assert.equal((await app.request('/api/balaji',{headers:{Authorization:''}})).status,401);
  assert.equal((await app.request('/balaji',{headers:{Authorization:''}})).status,401);
  assert.equal((await app.request('/assets/black-panther.png',{headers:{Authorization:''}})).status,401);
  assert.equal(await (await app.request('/balaji')).text(),'/balaji.html');
  const wrong=structuredClone(data);wrong.entries['2020-01-01'].gratitude='x'.repeat(2001);assert.throws(()=>validateBalaji(wrong));
});

test('spending and diesel survive restart and preserve exact pence across months',async t=>{
  const app=setup(t),data=await(await app.request('/api/balaji')).json();
  data.expenses['2020-01-31']=[{id:'a',description:'Coffee',category:'Food',amount_pence:10},{id:'b',description:'Lunch',category:'Food',amount_pence:20}];
  data.diesel['2020-01-31']=[{id:'fuel-a',amount_pence:4500}];
  data.expenses['2020-02-01']=[{id:'c',description:'Bus',category:'Travel',amount_pence:200}];
  const post=(value,rev='0')=>app.request('/api/balaji',{method:'POST',headers:{'Content-Type':'application/json','X-Activities-Revision':rev},body:JSON.stringify(value)});
  assert.equal((await post(data)).status,200);app.reopen();assert.deepEqual(await(await app.request('/api/balaji')).json(),data);
  for(const amount of [-1,0,0.1,true,'30',100000000]){
    const bad=structuredClone(data);bad.expenses['2020-01-31'][0].amount_pence=amount;assert.equal((await post(bad,'1')).status,400);
  }
  const duplicate=structuredClone(data);duplicate.diesel['2020-01-31'].push({id:'fuel-a',amount_pence:10});assert.equal((await post(duplicate,'1')).status,400);
  assert.deepEqual(await(await app.request('/api/balaji')).json(),data);
  const legacy={version:1,name:'Balaji',days:{},entries:{}};assert.deepEqual(validateBalaji(legacy),{version:2,name:'Balaji',days:{},entries:{},expenses:{},diesel:{},health_checks:{},priority_done:{}});
});
test('words persist with meanings, export shape and backward-compatible journals',async t=>{
  const app=setup(t),data=initial();data.children[0].words['2020-01-01']=[{id:'word-a',word:'curious',meaning:'Wanting to learn more.'}];
  assert.equal((await app.save(data)).status,200);app.reopen();assert.deepEqual(await(await app.get()).json(),data);
  assert.deepEqual(data.children[1].words,{});
  const bad=structuredClone(data);bad.children[0].words['2020-01-01'][0].meaning='x'.repeat(2001);assert.equal((await app.save(bad,'"1"')).status,400);
  const legacy=initial();legacy.version=3;legacy.children.forEach(child=>delete child.words);legacy.children[0].entries['2020-01-01']={mood:'Happy',tomorrow_goal:'Read',thankful:'Family',challenge:'Maths',proud:'Tried'};
  const upgraded=validate(legacy);assert.equal(upgraded.version,4);assert.deepEqual(upgraded.children[0].entries,legacy.children[0].entries);assert.deepEqual(upgraded.children[0].words,{});
});
test('dictionary lookups validate input and handle provider errors without exposing journals',async()=>{
  let contacted=false;
  const rejected=await lookupDictionary('../private',async()=>{contacted=true;});assert.equal(rejected.status,400);assert.equal(contacted,false);
  const success=await lookupDictionary('curious',async (url,options)=>{assert.equal(options.headers['User-Agent'],'MilanDailyMissions/1.0');assert.equal(options.headers.Accept,'application/json');assert.equal(url,'https://api.dictionaryapi.dev/api/v2/entries/en/curious');return Response.json([{meanings:[{partOfSpeech:'adjective',definitions:[{definition:'Wanting to learn more.'}]}]}]);});
  assert.equal(success.status,200);assert.match((await success.json()).meaning,/Wanting to learn/);
  assert.equal((await lookupDictionary('unknown',async()=>new Response('',{status:404}))).status,404);
  assert.equal((await lookupDictionary('unknown',async()=>new Response('',{status:429}))).status,503);
  assert.equal((await lookupDictionary('unknown',async()=>{throw new Error('network');})).status,503);
});

test('health routines save by date and complete Health only when all four are checked',async t=>{
  const app=setup(t),data=await(await app.request('/api/balaji')).json();
  const date='2020-01-01';
  data.days[date]={connect:false,move:false,health:false,learn:false};
  data.health_checks[date]={diet:true,medicine:false,supplements:false,skin_care:false};
  const post=(value,rev)=>app.request('/api/balaji',{method:'POST',headers:{'Content-Type':'application/json','X-Activities-Revision':rev},body:JSON.stringify(value)});
  assert.equal((await post(data,'0')).status,200);app.reopen();assert.deepEqual(await(await app.request('/api/balaji')).json(),data);
  for(const key of Object.keys(data.health_checks[date]))data.health_checks[date][key]=true;
  data.days[date].health=true;
  assert.equal((await post(data,'1')).status,200);
  const invalid=structuredClone(data);invalid.health_checks[date].medicine='yes';assert.equal((await post(invalid,'2')).status,400);
  invalid.health_checks[date].medicine=false;assert.equal((await post(invalid,'2')).status,400);
  assert.deepEqual(await(await app.request('/api/balaji')).json(),data);
  const legacy={version:1,name:'Balaji',days:{'2020-01-02':{connect:false,move:false,health:true,learn:false}},entries:{}};
  const upgraded=validateBalaji(legacy);assert.equal(upgraded.days['2020-01-02'].health,true);assert.deepEqual(upgraded.health_checks,{});
});

test('priority completion persists independently and rejects malformed backups',async t=>{
 const app=setup(t),data=await(await app.request('/api/balaji')).json();
 data.entries['2020-01-01']={mood_energy:'',win:'',work_learning:'',health_fitness:'',gratitude:'',tomorrow_priority:'Call family\nGo for a walk'};
 data.priority_done['2020-01-02']=['Call family'];
 const post=(value,rev)=>app.request('/api/balaji',{method:'POST',headers:{'Content-Type':'application/json','X-Activities-Revision':rev},body:JSON.stringify(value)});
 assert.equal((await post(data,'0')).status,200);app.reopen();assert.deepEqual(await(await app.request('/api/balaji')).json(),data);
 for(const invalid of [['Repeated','Repeated'],[true],[''],['x'.repeat(2001)]]){
  const bad=structuredClone(data);bad.priority_done['2020-01-02']=invalid;assert.equal((await post(bad,'1')).status,400);
 }
 assert.deepEqual(await(await app.request('/api/balaji')).json(),data);
});
