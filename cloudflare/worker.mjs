const LEGACY_CATEGORIES = ['reading', 'academics', 'exercise'];
const CATEGORIES = [...LEGACY_CATEGORIES, 'family_fun', 'guitar', 'journal'];
const JOURNAL_FIELDS = ['mood', 'tomorrow_goal', 'thankful', 'challenge', 'proud'];
function validateDate(date, currentDate) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '0001-01-01' || !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0,10) !== date || date > currentDate) {
    throw new Error('Dates must be valid past or current dates.');
  }
}
const MAX_BYTES = 1_000_000;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function today(timeZone = 'Europe/London') {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date());
  return ['year','month','day'].map(key => parts.find(p => p.type === key).value).join('-');
}

export function validate(data, currentDate = today()) {
  if (!isObject(data) || ![1,2,3].includes(data.version) || !Array.isArray(data.children) || data.children.length !== 2) {
    throw new Error('Expected a version 1, 2 or 3 backup with exactly two children.');
  }
  return {version:3, children:data.children.map((child, i) => {
    if (!isObject(child) || child.id !== `child-${i+1}` || typeof child.name !== 'string' ||
        !child.name.trim() || [...child.name.trim()].length > 60 || !isObject(child.days)) {
      throw new Error('Invalid child identifier, name (1–60 characters), or daily records.');
    }
    const days = {};
    for (const [date, values] of Object.entries(child.days)) {
      validateDate(date, currentDate);
      const expected = data.version === 1 ? LEGACY_CATEGORIES : CATEGORIES;
      if (!isObject(values) || Object.keys(values).length !== expected.length ||
          expected.some(k => !Object.hasOwn(values,k) || !Number.isInteger(values[k]) || values[k] < 0 || values[k] > 1440) ||
          expected.reduce((sum,k) => sum + values[k],0) > 1440) {
        throw new Error('Each day needs valid whole-number activity totals, totaling at most 1440 minutes.');
      }
      days[date] = Object.fromEntries(CATEGORIES.map(k => [k,values[k] ?? 0]));
    }
    const sourceEntries = data.version === 3 ? child.entries : {};
    if (!isObject(sourceEntries)) throw new Error('Journal entries must be an object.');
    const entries = {};
    for (const [date,entry] of Object.entries(sourceEntries)) {
      validateDate(date,currentDate);
      if (!isObject(entry) || Object.keys(entry).length !== JOURNAL_FIELDS.length ||
          JOURNAL_FIELDS.some(key => !Object.hasOwn(entry,key) || typeof entry[key] !== 'string' || [...entry[key]].length > 2000)) {
        throw new Error('Journal entries need all five answers, each at most 2000 characters.');
      }
      entries[date] = Object.fromEntries(JOURNAL_FIELDS.map(key => [key,entry[key]]));
    }
    return {id:child.id, name:child.name.trim(), days, entries};
  })};
}

const BALAJI_GOALS = ['connect','move','health','learn'];
const BALAJI_FIELDS = ['mood_energy','win','work_learning','health_fitness','gratitude','tomorrow_priority'];
export function validateBalaji(data, currentDate=today()) {
  if(!isObject(data) || data.version!==1 || data.name!=='Balaji' || !isObject(data.days) || !isObject(data.entries)) {
    throw new Error('Expected a Balaji version 1 backup.');
  }
  const days={}, entries={};
  for(const [date,values] of Object.entries(data.days)) {
    validateDate(date,currentDate);
    if(!isObject(values) || Object.keys(values).length!==4 || BALAJI_GOALS.some(key=>!Object.hasOwn(values,key) || typeof values[key]!=='boolean')) {
      throw new Error('Each day needs four true/false goals.');
    }
    days[date]=Object.fromEntries(BALAJI_GOALS.map(key=>[key,values[key]]));
  }
  for(const [date,entry] of Object.entries(data.entries)) {
    validateDate(date,currentDate);
    if(!isObject(entry) || Object.keys(entry).length!==6 || BALAJI_FIELDS.some(key=>!Object.hasOwn(entry,key) || typeof entry[key]!=='string' || [...entry[key]].length>2000)) {
      throw new Error('Each journal needs six text answers, at most 2000 characters each.');
    }
    entries[date]=Object.fromEntries(BALAJI_FIELDS.map(key=>[key,entry[key]]));
  }
  return {version:1,name:'Balaji',days,entries};
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, {status, headers});
}

// Hash both values before comparing to avoid leaking credential length or prefix.
async function equalSecret(a,b) {
  const digest = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [left,right] = await Promise.all([digest(a),digest(b)]);
  const x = new Uint8Array(left), y = new Uint8Array(right);
  let difference = 0;
  for(let i=0;i<x.length;i++) difference |= x[i] ^ y[i];
  return difference === 0;
}
async function authorized(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const bytes = Uint8Array.from(atob(header.slice(6)), c => c.charCodeAt(0));
    const credentials = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
    return await equalSecret(credentials, `${env.APP_USERNAME}:${env.APP_PASSWORD}`);
  } catch { return false; }
}

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty backup.');
  const chunks = []; let total = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error('Hosted backups must be at most 1 MB.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) {
    url.protocol = 'https:';
    return Response.redirect(url.toString(),308);
  }
  // Fail closed on first deployment until both secrets have been configured.
  if (!env.APP_USERNAME || !env.APP_PASSWORD) return json({error:'Login is not configured. Set the application secrets.'},503);
  if (!await authorized(request,env)) {
    return json({error:'Sign in to your family activity journal.'},401, {'WWW-Authenticate':'Basic realm="Little steps", charset="UTF-8"'});
  }
  const isBalaji=url.pathname==='/api/balaji';
  const table=isBalaji?'balaji':'activities';
  const validator=isBalaji?validateBalaji:validate;
  if (url.pathname !== '/api/activities' && !isBalaji) {
    if (!['GET','HEAD'].includes(request.method)) return json({error:'Method not allowed.'},405,{Allow:'GET, HEAD'});
    if (!['/','/kids-activity.html','/app.js','/styles.css','/balaji','/balaji/','/balaji.html','/balaji.js','/balaji.css','/assets/black-panther.png','/assets/batman.png','/assets/deadpool.png','/assets/spider-man.png', '/assets/milan-hero.png', '/assets/milan-swing.png', '/assets/milan-leap.png'].includes(url.pathname)) return json({error:'Not found.'},404);
    if (url.pathname === '/') url.pathname = '/kids-activity.html';
    if (url.pathname === '/balaji' || url.pathname === '/balaji/') url.pathname = '/balaji.html';
    return env.ASSETS.fetch(new Request(url, request));
  }
  if (request.method === 'GET') {
    const row = await env.DB.prepare(`SELECT body, revision FROM ${table} WHERE id = 1`).first();
    if (!row) return json({error:'Database not initialized. Apply the D1 migrations.'},503);
    return json(validator(JSON.parse(row.body),today(env.TIME_ZONE)),200,{ETag:`"${row.revision}"`, 'X-Activities-Revision':String(row.revision)});
  }
  if (request.method !== 'POST') return json({error:'Method not allowed.'},405,{Allow:'GET, POST'});
  const origin = request.headers.get('Origin');
  if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return json({error:'Cross-origin writes forbidden.'},403);
  }
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return json({error:'Use application/json.'},415);
  // CDN compression can weaken or remove ETags. Use an application revision;
  // accept legacy ETags too so already-open clients can still save.
  const applicationRevision = request.headers.get('X-Activities-Revision');
  const match = applicationRevision !== null
    ? /^(\d+)$/.exec(applicationRevision)
    : /^(?:W\/)?"(\d+)"$/.exec(request.headers.get('If-Match') || '');
  if (!match || !Number.isSafeInteger(Number(match[1]))) return json({error:'Reload the page before saving.'},428);
  let data;
  try { data = validator(await readBody(request),today(env.TIME_ZONE)); }
  catch(error) { return json({error:error.message},400); }
  // A conditional single-row update keeps restores atomic and prevents stale tabs overwriting newer saves.
  const row = await env.DB.prepare(`UPDATE ${table} SET body = ?, revision = revision + 1 WHERE id = 1 AND revision = ? RETURNING revision`)
    .bind(JSON.stringify(data),Number(match[1])).first();
  if (!row) return json({error:'Another tab or device saved newer records. Reload before editing again.'},409);
  return json(data,200,{ETag:`"${row.revision}"`, 'X-Activities-Revision':String(row.revision)});
}

export default {
  async fetch(request, env) {
    let response;
    try { response = await handle(request,env); }
    catch { response = json({error:'Storage is unavailable. Your changes were not confirmed; reload and retry.'},503); }
    const result = new Response(response.body,response);
    result.headers.set('Cache-Control','no-store');
    result.headers.set('X-Content-Type-Options','nosniff');
    result.headers.set('X-Frame-Options','DENY');
    result.headers.set('Referrer-Policy','no-referrer');
    result.headers.set('X-Robots-Tag','noindex, nofollow');
    result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
    if (new URL(request.url).protocol === 'https:') result.headers.set('Strict-Transport-Security','max-age=31536000');
    return result;
  }
};
