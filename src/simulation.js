import { BASE_RECIPES, catalogFor, CROPS } from './catalog.js';
import { makeBatch, receiveGoods, spoilRate } from './inventory.js';
import { restock } from './market.js';
import { clamp, config, HOUR, localDateTime, localTime, nextDay, random, STEP } from './time.js';
import { advanceAnimals, createPurchasedAnimal, seedStarterLivestock, SPECIES } from './livestock.js';
import { initDiary, recordActivity, writeDueDiary } from './diary.js';

export function event(state,type,text,at,meta={}) {
  const e={id:`e${++state.sequence}`,type:`homestead.${type}`,text,at,meta};
  state.events.push(e);if(state.events.length>160)state.events.splice(0,state.events.length-160);
  if(type!=='diary')recordActivity(state,text,at,type);
  return e;
}
export function newState(at=Date.now(),raw={}) {
  const cfg=config(raw),state={version:1,sequence:0,seed:(Math.floor(at)%4294967295)>>>0,lastAt:at,createdAt:at,
    pet:{satiety:85,joy:75,health:95,energy:90,hydration:90,hygiene:90,social:75,warmth:85,coldUntil:0,restUntil:0,medicineAt:0},
    coins:120,carriedCoins:0,waterLiters:120,fuelMinutes:0,
    fields:Array.from({length:6},(_,i)=>({id:`field_${i+1}`,name:`第${i+1}块田`,reclaimed:false,cropId:null,progress:0,moisture:35,fertility:60,weeds:75,pests:0,health:100,waterlogging:0,fertilized:false,scarecrowUntil:0,sownAt:null})),
    batches:[],jobs:[],customItems:{},customRecipes:{},customCrops:{},learnedRecipes:Object.values(BASE_RECIPES).filter(r=>r.starter).map(r=>r.id),
    market:{day:null,stock:[],pendingGoods:[],porterJobs:[]},notices:[],events:[],trip:{phase:'home',followers:[],purchasedAnimals:[]},
    animals:[],livestock:{setupGranted:false,nextFeedingAt:at+HOUR,spoiledFeedG:0,pendingProduce:[],shipmentSequence:0},
    weather:{id:'clear',name:'晴朗',slot:Math.floor(at/(3*HOUR)),since:at},trashTotalG:0,
  };
  const give=(id,q,to)=>makeBatch(state,id,q,to,at);
  for(const id of ['hoe','watering_can','sickle','knife','pot','wok','steamer','hand_mill'])give(id,1,'shed');
  for(const id of ['paddy','wheat','tomato','spinach','potato','cucumber'])give(`seed_${id}`,2,'granary');
  give('rice',10,'granary');give('noodles',5,'granary');give('egg',6,'fridge');
  give('oil',40,'pantry');give('salt',30,'pantry');give('soy_sauce',10,'pantry');
  give('fertilizer',10,'shed');give('fuel',10,'shed');
  state.market.pendingGoods=[];state.market.porterJobs=[];
  initDiary(state,cfg);restock(state,at,cfg);event(state,'welcome','六块荒田等待开垦。工具棚已有基础农具厨具，食品柜有少量口粮；先看库存与已掌握菜谱。',at);
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
    const i=items[b.itemId],life=b.shelfHoursOverride??i.shelfHours;if(life&&b.container!=='trash')b.ageHours=Math.min(life,b.ageHours+h*spoilRate(i,b.container));
  }
  for(const s of state.market.stock) {const i=items[s.itemId];if(i.shelfHours)s.ageHours=Math.min(i.shelfHours,s.ageHours+h*spoilRate(i,s.container));}
  for(const p of state.market.pendingGoods??[]){const i=items[p.itemId];if(i?.shelfHours)p.ageHours=Math.min(p.shelfHoursOverride??i.shelfHours,(p.ageHours??0)+h*spoilRate(i,'fridge'));}
  for(const j of state.market.porterJobs??[]){const i=items[j.itemId];if(i?.shelfHours)j.ageHours=Math.min(j.shelfHoursOverride??i.shelfHours,(j.ageHours??0)+h*spoilRate(i,'fridge'));}
  for(const p of state.livestock.pendingProduce??[]){const i=items[p.itemId],life=p.shelfHoursOverride??i.shelfHours;if(life)p.ageHours=Math.min(life,(p.ageHours??0)+h*spoilRate(i,'doorstep'));}
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
      const weatherFactor=state.weather.id==='sunny'?1.18:state.weather.id==='bees'&&['fruit','vegetable'].includes(items[c.product].kind)?1.2:state.weather.id==='cold'?.65:1;
      f.progress=clamp(f.progress+100*h/c.growHours*cfg.growthMultiplier*moisture*weedFactor*pestFactor*(.5+f.health/200)*weatherFactor);
    }
    if(before<100&&f.progress>=100) {event(state,'harvest',`${f.name}的${c.name}成熟，可以收获了。`,to,{fieldId:f.id});p.joy=clamp(p.joy+3);}
    if(f.progress>=100){f.health=clamp(f.health-h*.12);if(f.scarecrowUntil<to&&random(state.seed,`bird:${f.id}:${Math.floor(to/HOUR)}`)<.05)f.health=clamp(f.health-h*.4);} // 稻草人仅防鸟，不防虫。
  }
  const husbandry=advanceAnimals(state,from,to,cfg);
  for(const p of husbandry.produced){const left=receiveGoods(state,p,to,cfg);if(left)state.livestock.pendingProduce.push({...p,quantity:left,ageHours:0});}
  for(const e of husbandry.diseases)event(state,e.recovered?'animal_recovery':'animal_illness',e.recovered?`${SPECIES[e.species].name}治疗后恢复。`:`${SPECIES[e.species].name}出现${e.disease}，请使用兽药并及时治疗。`,to,{animalId:e.id,disease:e.disease});
  for(const e of husbandry.births){event(state,'animal_birth',e.count?`${SPECIES[e.mother.species].name}顺利生产，新增${e.count}只幼崽。`:`${SPECIES[e.mother.species].name}完成生产，但住房已满，幼崽由畜牧坊接收。`,to,{animalId:e.mother.id,count:e.count});state.pet.joy=clamp(state.pet.joy+(e.count?7:0));}
  for(const a of husbandry.deaths){event(state,'animal_death',`${SPECIES[a.species].name}${a.deathCause==='disease'?'病死，不能食用，请无害化处理':'已自然寿终，可由主人选择处理并冷藏'}。`,to,{animalId:a.id,cause:a.deathCause});state.pet.joy=clamp(state.pet.joy-6);}
}
function boundary(state,at,cfg) {
  for(const j of [...state.jobs])if(j.finishAt<=at) {
    state.jobs=state.jobs.filter(x=>x.id!==j.id);
    const i=catalogFor(state).items[j.outputId];
    makeBatch(state,j.outputId,j.quantity,j.container,j.finishAt,{ageHours:j.initialAgeHours??0,satietyMultiplier:j.satietyMultiplier??1});
    event(state,'cooked',`${i.name}已完成，放入${j.container}；离线完成也从实际出锅时间开始保鲜。`,j.finishAt,{jobId:j.id});
  }
  if(state.trip.arriveAt&&state.trip.arriveAt<=at) {
    if(state.trip.phase==='outbound') {state.trip={...state.trip,phase:'market',arrivedAt:at,arriveAt:null};state.pet.social=clamp(state.pet.social+8);event(state,'travel','已抵达集市。请先看营业状态和随身负重，再交易。',at);}
    else if(state.trip.phase==='returning') {
      for(const b of state.batches)if(b.container==='bag')delete b.carrierId;
      const purchased=state.trip.purchasedAnimals??[];state.trip={phase:'home',followers:[],purchasedAnimals:[],transportGrams:0};state.coins=moneySafe(state.coins+state.carriedCoins);state.carriedCoins=0;
      for(const a of state.animals.filter(a=>a.onMarket)){a.onMarket=false;a.homeAt=at;}
      for(const a of purchased)try{createPurchasedAnimal(state,a.species,a.sex,at);}catch{state.market.pendingAnimals??=[];state.market.pendingAnimals.push(a);}
      event(state,'travel','已回家，随身金币已放回钱箱；背包物品请手动整理。',at);
    }
  }
  for(const j of state.market.porterJobs??[])if(!Number.isFinite(j.deliverAt))j.deliverAt=nextMarketDelivery(at,cfg);
  for(const j of state.market.porterJobs??[])if(j.deliverAt<=at){const left=receiveGoods(state,{...j,porterDelivery:true},at,cfg),delivered=j.quantity-left;j.quantity=left;if(delivered)event(state,'delivery',`跑腿小厮已送到${catalogFor(state).items[j.itemId].name} ×${delivered}；已放入家中容器，超出冷藏空间的部分在门廊收货箱。`,at);if(left){j.delayed=true;j.deliverAt=at+HOUR;}}
  state.market.porterJobs=(state.market.porterJobs??[]).filter(j=>j.quantity>0);
  if(state.pet.restUntil&&state.pet.restUntil<=at){state.pet.restUntil=0;event(state,'life','休息结束，精神恢复了一些。',at);}
  restock(state,at,cfg);weatherAt(state,at,cfg);
  const diary=writeDueDiary(state,at,cfg);if(diary)event(state,'diary',`今晚的日记写好了：${diary.title}。可在「小院日记」查看。`,diary.at,{diaryId:diary.id});
}
const moneySafe=n=>Math.round(n*100)/100;
function nextMarketDelivery(at,cfg){return localDateTime(nextDay(localTime(at,cfg.timezone).day),8,0,cfg.timezone);}
export function advance(state,now,raw={}) {
  const cfg=config(raw);if(typeof now!=='number'||!Number.isFinite(now))throw new Error('无效时钟');
  initDiary(state,cfg);
  if(now<state.lastAt)return state; // 时钟回拨时不回滚年龄，也不重复刷新市场。
  let t=state.lastAt;
  // 固定15分钟边界 + 精确出锅/抵达/起床边界，不丢弃任何离线时间。
  // 这里保留完整补算，超过十年的存档异常须由用户检查系统时钟，而不静默跳过。
  if(now-t>10*366*24*HOUR)throw new Error('系统时钟前跳超过十年，请先检查电脑时间；存档未覆盖');
  while(t<now) {
    let end=Math.min(now,(Math.floor(t/STEP)+1)*STEP);
    for(const at of [...state.jobs.map(j=>j.finishAt),state.trip.arriveAt,state.pet.restUntil,state.pet.coldUntil,state.diary.nextAt,...(state.market.porterJobs??[]).map(j=>j.deliverAt)])if(Number.isFinite(at)&&at>t&&at<end)end=at;
    continuous(state,t,end,cfg);t=end;state.lastAt=t;boundary(state,t,cfg);
  }
  return state;
}
