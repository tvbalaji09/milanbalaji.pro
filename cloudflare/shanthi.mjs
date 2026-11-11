export function validateShanthi(data,currentDate='9999-12-31') {
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 if(!object(data)||data.version!==1||data.target!==1550||!object(data.days))throw new Error('Expected a Shanthi backup with a 1550 calorie target.');
 const days={};
 for(const [date,entries] of Object.entries(data.days)){
  const parsed=new Date(date+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'0001-01-01'||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||date>currentDate)throw new Error('Choose a valid past or current date.');
  if(!Array.isArray(entries)||entries.length>100||new Set(entries.map(e=>e?.id)).size!==entries.length)throw new Error('Use at most 100 unique foods per day.');
  days[date]=entries.map(e=>{
   if(!object(e)||typeof e.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(e.id)||typeof e.name!=='string'||!e.name.trim()||e.name.length>100||typeof e.unit!=='string'||!e.unit.trim()||e.unit.length>100||!['Breakfast','Lunch','Dinner','Snacks'].includes(e.meal)||!Number.isInteger(e.kcal)||e.kcal<0||e.kcal>10000||typeof e.quantity!=='number'||!Number.isFinite(e.quantity)||e.quantity<0.01||e.quantity>100||Math.abs(e.quantity*100-Math.round(e.quantity*100))>0.000001)throw new Error('Foods need a name, portion, meal, calories (0–10000) and quantity (0.01–100).');
   return {id:e.id,name:e.name.trim(),unit:e.unit.trim(),meal:e.meal,kcal:e.kcal,quantity:e.quantity};
  });
 }
 return {version:1,target:1550,days};
}
