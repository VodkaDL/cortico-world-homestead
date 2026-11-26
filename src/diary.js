import { localDateTime, localTime, nextDay } from './time.js';

export function initDiary(state,cfg){
  state.diary??={entries:[],notes:[],nextAt:null};state.diary.entries??=[];state.diary.notes??=[];
  if(!Number.isFinite(state.diary.nextAt)){const day=localTime(state.lastAt,cfg.timezone).day,today=localDateTime(day,21,0,cfg.timezone);state.diary.nextAt=today<state.lastAt?localDateTime(nextDay(day),21,0,cfg.timezone):today;}
  return state.diary;
}
export function recordActivity(state,text,at,kind='生活'){
  const d=state.diary;if(!d)return;
  d.notes.push({at,text:String(text).slice(0,360),kind});
  if(d.notes.length>500)d.notes.splice(0,d.notes.length-500);
}
function clean(text){return text.replace(/^丰收的喜悦：/,'').replace(/^天气变为/,'天气转为').replace(/[。！!]+$/,'').replace(/\s+/g,' ');}
function pick(events,kinds){return events.find(e=>kinds.includes(e.kind));}
function tell(events){
  const lines=[],weather=pick(events,['weather']),harvest=pick(events,['harvest']),food=pick(events,['cooked','cook','eat']),animals=pick(events,['animal_birth','animal_recovery','animal_illness','animal_death','animal_treatment','husbandry','butcher']),market=pick(events,['travel','delivery','trade','notice']),social=pick(events,['social']),care=pick(events,['wash','play','drink','rest','medicine']);
  const farm={reclaim:'开出了一块新田',sow:'播下了新种子',water:'给作物浇了水',weed:'清理了田里的杂草',fertilize:'给田地添了肥',drain:'排掉田里的积水',pest:'处理了田间虫害',scarecrow:'在田边立起稻草人',clear_field:'清理了一块田'};
  const chores=events.filter(e=>Object.hasOwn(farm,e.kind)).map(e=>farm[e.kind]);
  if(weather)lines.push(`窗外${clean(weather.text)}，小院也跟着换了模样`);
  if(harvest)lines.push(`最让我高兴的是，${clean(harvest.text)}`);
  if(chores.length)lines.push(`田里也忙了好一阵，${chores.slice(0,2).join('，')}`);
  if(food)lines.push(`忙完后我顾上了吃饭：${clean(food.text)}`);
  if(animals)lines.push(`动物们也有新动静：${clean(animals.text)}`);
  if(market)lines.push(`今天还去了集市或收到了货物：${clean(market.text)}`);
  if(social)lines.push(clean(social.text));
  if(care)lines.push(`我也记得照顾自己，${clean(care.text)}`);
  if(lines.length<3){const other=events.find(e=>!['hunger','diary','welcome','weather','harvest','cooked','cook','eat','animal_birth','animal_recovery','animal_illness','animal_death','animal_treatment','husbandry','butcher','travel','delivery','trade','notice','social','wash','play','drink','rest','medicine',...Object.keys(farm)].includes(e.kind));if(other)lines.push(`还有件小事也值得记下：${clean(other.text)}`);}
  if(lines.length<3){
    const extra=events.filter(e=>['animal_birth','animal_recovery','animal_illness','animal_death','animal_treatment','butcher','travel','delivery','trade','notice'].includes(e.kind));
    for(const e of extra){const detail=clean(e.text);if(!lines.some(x=>x.includes(detail)))lines.push(detail);if(lines.length>=4)break;}
  }
  return lines.slice(0,5);
}
export function writeDueDiary(state,at,cfg){const d=initDiary(state,cfg);if(at<d.nextAt)return null;
  const due=d.nextAt,date=localTime(due,cfg.timezone).day;d.nextAt=localDateTime(nextDay(date),21,0,cfg.timezone);
  if(d.entries.some(e=>e.date===date))return null;
  const notes=d.notes.filter(n=>n.at<=due),remaining=d.notes.filter(n=>n.at>due),last=d.entries.at(-1)?.at??state.createdAt;
  const activities=notes.filter(n=>n.at>=last&&!['hunger','diary','welcome'].includes(n.kind));
  const unique=activities.filter((e,i,a)=>a.findIndex(x=>x.kind===e.kind&&x.text===e.text)===i),story=tell(unique);
  const p=state.pet,mood=p.joy>=65?'心里亮堂堂的':p.joy>=35?'心情还算安稳':'有些闷闷的';
  const opening=story.length?story.slice(0,3).join('。')+'。':'今天小院很安静，没有什么特别的事发生。';
  const after=story.length>3?story.slice(3).join('；')+'。':'';
  const closing=p.health<35?'身体有些吃不消，明天要先歇一歇。':p.satiety<30?'写到这里才想起肚子还空着，得想办法找点吃的。':p.social<25?'今天有点想念陪伴，希望明天能和主人多说说话。':'记下这些小事，心里踏实了些。';
  const entry={id:`diary_${date}`,date,at:due,timezone:cfg.timezone,title:`${date} · 我的小院日记`,text:`晚上九点，我把今天慢慢想了一遍。

${opening}${after?`\n\n${after}`:''}

此刻我${mood}。饱腹 ${Math.round(p.satiety)}，健康 ${Math.round(p.health)}，体力 ${Math.round(p.energy)}。${closing}`,activityCount:activities.length,pet:{satiety:p.satiety,joy:p.joy,health:p.health,energy:p.energy}};
  d.entries.push(entry);d.notes=remaining;return entry;
}
