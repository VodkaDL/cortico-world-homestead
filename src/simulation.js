import { BASE_RECIPES, catalogFor, CROPS } from './catalog.js';
import { makeBatch, spoilRate } from './inventory.js';
import { restock } from './market.js';
import { clamp, config, HOUR, localTime, random, STEP } from './time.js';

export function event(state,type,text,at,meta={}) {
  const e={id:`e${++state.sequence}`,type:`homestead.${type}`,text,at,meta};
  state.events.push(e);if(state.events.length>160)state.events.splice(0,state.events.length-160);
  return e;
}
export function newState(at=Date.now(),raw={}) {
  const cfg=config(raw),state={version:1,sequence:0,seed:(Math.floor(at)%4294967295)>>>0,lastAt:at,createdAt:at,
    pet:{satiety:85,joy:75,health:95,energy:90,hydration:90,hygiene:90,social:75,warmth:85,coldUntil:0,restUntil:0,medicineAt:0},
    coins:120,carriedCoins:0,waterLiters:120,fuelMinutes:0,
    fields:Array.from({length:6},(_,i)=>({id:`field_${i+1}`,name:`第${i+1}块田`,reclaimed:false,cropId:null,progress:0,moisture:35,fertility:60,weeds:75,pests:0,health:100,waterlogging:0,fertilized:false,scarecrowUntil:0,sownAt:null})),
    batches:[],jobs:[],customItems:{},customRecipes:{},customCrops:{},learnedRecipes:Object.values(BASE_RECIPES).filter(r=>r.starter).map(r=>r.id),
    market:{day:null,stock:[]},notices:[],events:[],trip:{phase:'home'},
    weather:{id:'clear',name:'晴朗',slot:Math.floor(at/(3*HOUR)),since:at},trashTotalG:0,
  };
  const give=(id,q,to)=>makeBatch(state,id,q,to,at);
  for(const id of ['hoe','watering_can','sickle','knife','pot','wok','steamer','hand_mill'])give(id,1,'shed');
  for(const id of ['paddy','wheat','tomato','spinach','potato','cucumber'])give(`seed_${id}`,2,'granary');
  give('rice',10,'granary');give('noodles',5,'granary');give('egg',6,'fridge');
  give('oil',40,'pantry');give('salt',30,'pantry');give('soy_sauce',10,'pantry');
  give('fertilizer',10,'shed');give('fuel',10,'shed');
  restock(state,at,cfg);event(state,'welcome','六块荒田等待开垦。工具棚已有基础农具厨具，食品柜有少量口粮；先看库存与已掌握菜谱。',at);
  return state;
}
const WEATHER=[
  [.45,'clear','晴朗'],[.64,'rain','及时雨'],[.75,'drought','干旱热浪'],[.81,'flood','暴雨洪涝'],
  [.87,'locust','蝗灾'],[.92,'sunny','和煦日照'],[.96,'bees','蜜蜂授粉'],[.985,'cold','倒春寒'],[1,'hail','冰雹'],
];
function weatherAt(state,at,cfg) {
  const slot=Math.floor(at/(3*HOUR));if(slot===state.weather.slot)return;
  const roll=cfg.weatherEnabled?random(state.seed,`weather:${slot}`):0;
  const [,id,name]=WEATHER.find(w=>roll<w[0]);
  state.weather={id,name,slot,since:at};
  if(id==='rain'||id==='flood') {
    state.waterLiters=Math.min(200,state.waterLiters+(id==='rain'?35:65));
    for(const f of state.fields){f.moisture=clamp(f.moisture+(id==='rain'?32:65));if(id==='flood'&&f.reclaimed)f.waterlogging=clamp(f.waterlogging+60);}
  }
  if(id==='locust')for(const f of state.fields)if(f.cropId)f.pests=clamp(f.pests+45);
  if(id==='hail')for(const f of state.fields)if(f.cropId)f.health=clamp(f.health-18);
  if(['rain','sunny','bees'].includes(id))state.pet.joy=clamp(state.pet.joy+2);
  if(['flood','locust','hail','drought'].includes(id))state.pet.joy=clamp(state.pet.joy-3);
  event(state,'weather',`天气变为${name}${id==='flood'?'，记得排水':id==='locust'?'，记得防虫':''}。`,at,{weather:id});
}
function continuous(state,from,to,cfg) {
  const h=(to-from)/HOUR;if(h<=0)return;const {items,crops}=catalogFor(state),p=state.pet;
  for(const b of state.batches) {
    const i=items[b.itemId];if(i.shelfHours&&b.container!=='trash')b.ageHours=Math.min(i.shelfHours,b.ageHours+h*spoilRate(i,b.container));
  }
  for(const s of state.market.stock) {const i=items[s.itemId];if(i.shelfHours)s.ageHours=Math.min(i.shelfHours,s.ageHours+h*spoilRate(i,s.container));}
  const resting=p.restUntil>from,walking=['outbound','returning'].includes(state.trip.phase);
  p.satiety=clamp(p.satiety-cfg.hungerPerHour*h*(resting?.65:walking?1.5:1));
  p.hydration=clamp(p.hydration-h*(resting?1.5:state.weather.id==='drought'?5:3));
  p.energy=clamp(p.energy+h*(resting?12:walking?-8:-1.5));
  p.hygiene=clamp(p.hygiene-h*.7);p.social=clamp(p.social-h*.6);
  const comfort=(p.satiety<20?1.2:0)+(p.hydration<20?1.5:0)+(p.hygiene<25?.7:0)+(p.social<25?.6:0)+(p.energy<20?.8:0);
  p.joy=clamp(p.joy-h*(.35+comfort)+(resting?.5*h:0));
  const sick=p.coldUntil>from;
  const healthDrain=(p.satiety<10?1.7:0)+(p.hydration<10?2:0)+(p.hygiene<15?.5:0)+(p.energy<10?.8:0)+(sick?.8:0)+(p.warmth<20?.7:0);
  p.health=clamp(p.health-h*healthDrain+(resting&&!healthDrain&&p.satiety>30?.8*h:0));
  p.warmth=clamp(p.warmth+(state.trip.phase==='home'?4:(['rain','flood','cold'].includes(state.weather.id)?-6:1))*h);
  for(const f of state.fields) {
    if(!f.reclaimed)continue;
    const dry=state.weather.id==='drought'?9:state.weather.id==='rain'?0:3.2;
    const avgM=clamp(f.moisture-dry*h/2);f.moisture=clamp(f.moisture-dry*h);
    f.weeds=clamp(f.weeds+h*(f.cropId?.65:.4));f.waterlogging=clamp(f.waterlogging-h*4);
    if(!f.cropId)continue;
    const c=crops[f.cropId];f.pests=clamp(f.pests-h*1.2);
    const stress=(avgM<12?.9:0)+(f.waterlogging>30?(c.id==='paddy'?.15:.8):0)+f.pests*.012;
    f.health=clamp(f.health-stress*h);f.fertility=clamp(f.fertility-.12*h);
    const before=f.progress;
    if(f.health>0) {
      const moisture=.22+.78*Math.min(1,avgM/c.waterNeed),weedFactor=1-f.weeds*.006,pestFactor=1-f.pests*.005;
      const weatherFactor=state.weather.id==='sunny'?1.18:state.weather.id==='bees'&&['fruit','vegetable'].includes(items[c.id].kind)?1.2:state.weather.id==='cold'?.65:1;
      f.progress=clamp(f.progress+100*h/c.growHours*cfg.growthMultiplier*moisture*weedFactor*pestFactor*(.5+f.health/200)*weatherFactor);
    }
    if(before<100&&f.progress>=100) {event(state,'harvest',`${f.name}的${c.name}成熟，可以收获了。`,to,{fieldId:f.id});p.joy=clamp(p.joy+3);}
    if(f.progress>=100){f.health=clamp(f.health-h*.12);if(f.scarecrowUntil<to&&random(state.seed,`bird:${f.id}:${Math.floor(to/HOUR)}`)<.05)f.health=clamp(f.health-h*.4);} // 稻草人仅防鸟，不防虫。
  }
}
function boundary(state,at,cfg) {
  for(const j of [...state.jobs])if(j.finishAt<=at) {
    state.jobs=state.jobs.filter(x=>x.id!==j.id);
    const i=catalogFor(state).items[j.outputId];
    makeBatch(state,j.outputId,j.quantity,j.container,j.finishAt,{ageHours:j.initialAgeHours??0});
    event(state,'cooked',`${i.name}已完成，放入${j.container}；离线完成也从实际出锅时间开始保鲜。`,j.finishAt,{jobId:j.id});
  }
  if(state.trip.arriveAt&&state.trip.arriveAt<=at) {
    if(state.trip.phase==='outbound') {state.trip={phase:'market'};state.pet.social=clamp(state.pet.social+8);event(state,'travel','已抵达集市。请先看营业状态和随身负重，再交易。',at);}
    else if(state.trip.phase==='returning') {state.trip={phase:'home'};state.coins=moneySafe(state.coins+state.carriedCoins);state.carriedCoins=0;event(state,'travel','已回家，随身金币已放回钱箱；背包物品请手动放入粮仓、冰箱或工具棚。',at);}
  }
  if(state.pet.restUntil&&state.pet.restUntil<=at){state.pet.restUntil=0;event(state,'life','休息结束，精神恢复了一些。',at);}
  restock(state,at,cfg);weatherAt(state,at,cfg);
}
const moneySafe=n=>Math.round(n*100)/100;
export function advance(state,now,raw={}) {
  const cfg=config(raw);if(typeof now!=='number'||!Number.isFinite(now))throw new Error('无效时钟');
  if(now<state.lastAt)return state; // 时钟回拨时不回滚年龄，也不重复刷新市场。
  let t=state.lastAt;
  // 固定15分钟边界 + 精确出锅/抵达/起床边界，不丢弃任何离线时间。
  // 这里保留完整补算，超过十年的存档异常须由用户检查系统时钟，而不静默跳过。
  if(now-t>10*366*24*HOUR)throw new Error('系统时钟前跳超过十年，请先检查电脑时间；存档未覆盖');
  while(t<now) {
    let end=Math.min(now,(Math.floor(t/STEP)+1)*STEP);
    for(const at of [...state.jobs.map(j=>j.finishAt),state.trip.arriveAt,state.pet.restUntil,state.pet.coldUntil])if(at>t&&at<end)end=at;
    continuous(state,t,end,cfg);t=end;state.lastAt=t;boundary(state,t,cfg);
  }
  return state;
}
