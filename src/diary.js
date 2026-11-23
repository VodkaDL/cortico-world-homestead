import { localDateTime, localTime, nextDay } from './time.js';

export function initDiary(state,cfg){
  state.diary??={entries:[],notes:[],nextAt:null};state.diary.entries??=[];state.diary.notes??=[];
  if(!Number.isFinite(state.diary.nextAt)){const day=localTime(state.lastAt,cfg.timezone).day,today=localDateTime(day,21,0,cfg.timezone);state.diary.nextAt=today<state.lastAt?localDateTime(nextDay(day),21,0,cfg.timezone):today;}
  return state.diary;
}
export function recordActivity(state,text,at,kind='生活'){
  const d=state.diary;if(!d)return;
  d.notes.push({at,text:String(text).slice(0,360),kind});
  // The daily digest is separate from the short notification ring buffer.
  if(d.notes.length>500)d.notes.splice(0,d.notes.length-500);
}
export function writeDueDiary(state,at,cfg){const d=initDiary(state,cfg);if(at<d.nextAt)return null;
  const due=d.nextAt,date=localTime(due,cfg.timezone).day;d.nextAt=localDateTime(nextDay(date),21,0,cfg.timezone);
  if(d.entries.some(e=>e.date===date))return null;
  const notes=d.notes.filter(n=>n.at<=due),remaining=d.notes.filter(n=>n.at>due),last=d.entries.at(-1)?.at??state.createdAt;
  const activities=notes.filter(n=>n.at>=last&&!['hunger','diary','welcome'].includes(n.kind));
  const unique=[...new Set(activities.map(n=>n.text))];
  const p=state.pet;const mood=p.joy>=65?'心情舒畅':p.joy>=35?'心情平静':'有些低落';
  const detail=unique.length?`翻看今天的小院记录，这些事情让我记忆清楚：\n\n${unique.slice(-18).map(x=>x.replace(/\s+/g,' ')).join('\n\n')}`:'今天没有新的劳作记录，我在小院安静地度过了一天。';
  const entry={id:`diary_${date}`,date,at:due,timezone:cfg.timezone,title:`${date} · 我的小院日记`,text:`晚上九点了，${state.weather.name}，我翻开日记本。\n\n${detail}\n\n此刻我${mood}，饱腹 ${Math.round(p.satiety)}，健康 ${Math.round(p.health)}，体力 ${Math.round(p.energy)}。${p.health<35?'明天要先好好休息，照顾身体。':p.satiety<30?'写完日记，得记得好好吃饭。':'愿明天也能把小院照顾好。'}`,activityCount:activities.length,pet:{satiety:p.satiety,joy:p.joy,health:p.health,energy:p.energy}};
  d.entries.push(entry);d.notes=remaining;return entry;
}
