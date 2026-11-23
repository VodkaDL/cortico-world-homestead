export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const STEP = 15 * 60_000;
export const DEFAULTS = Object.freeze({enabled:false,timezone:'Asia/Shanghai',tickIntervalMs:60_000,growthMultiplier:1,weatherEnabled:true,hungerPerHour:3,carryLimitKg:12,merchantCapacityKg:180});
const formats = new Map();
export function config(raw={}) {
  const c={...DEFAULTS,...raw};
  new Intl.DateTimeFormat('en',{timeZone:c.timezone}).format();
  for (const [key,lo,hi] of [['tickIntervalMs',5000,3600000],['growthMultiplier',.1,10],['hungerPerHour',0,20],['carryLimitKg',2,50],['merchantCapacityKg',10,1000]]) {
    if(typeof c[key]!=='number'||!Number.isFinite(c[key])||c[key]<lo||c[key]>hi) throw new Error(`配置 ${key} 必须在 ${lo}–${hi} 之间`);
  }
  if(typeof c.weatherEnabled!=='boolean') throw new Error('weatherEnabled 必须为布尔值');
  return c;
}
export function localTime(at,zone='Asia/Shanghai') {
  if(!formats.has(zone)) formats.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
  const p=Object.fromEntries(formats.get(zone).formatToParts(new Date(at)).map(x=>[x.type,x.value]));
  return {day:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute),text:`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`};
}
export function nextDay(day) { return new Date(Date.parse(`${day}T12:00:00Z`)+DAY).toISOString().slice(0,10); }
export function marketOpen(at,zone) { const n=localTime(at,zone).minute; return (n>=390&&n<690)||(n>=840&&n<1020); }
export function random(seed,key) { let h=(seed>>>0)^2166136261; for(const ch of String(key)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);} h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return ((h^(h>>>16))>>>0)/4294967296; }
export function clamp(n,lo=0,hi=100) { return Math.max(lo,Math.min(hi,n)); }
export function money(n) { return Math.round((n+Number.EPSILON)*100)/100; }
export function weight(g) { return g<1000?`${Number(g.toFixed(1))} g`:`${Number((g/1000).toFixed(3))} kg`; }
export function requireNumber(n,name,min=0,max=Number.MAX_SAFE_INTEGER,integer=false) { if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isSafeInteger(n))) throw new Error(`${name} 必须是 ${min}–${max} 之间的${integer?'整数':'数值'}`); return n; }
export function requireText(s,name,max=80) { if(typeof s!=='string'||!s.trim()||s.length>max||/[\u0000-\u001f\u007f]/.test(s)) throw new Error(`${name} 必须为 1–${max} 字的单行文本`);return s.trim(); }
