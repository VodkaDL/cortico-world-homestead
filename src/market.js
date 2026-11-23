import { catalogFor, WORKSHOPS } from './catalog.js';
import { COIN_GRAMS, addInventory, assertSpace, batch, batchValue, carryLimit, containerWeight, expired, freshness } from './inventory.js';
import { HOUR, localTime, marketOpen, money, nextDay, random, requireNumber, weight } from './time.js';
export function marketRequired(state,now,cfg) {
  if(state.trip.phase!=='market')throw new Error('需要先带上货物和金币赶到集市');
  if(!marketOpen(now,cfg.timezone))throw new Error('现在闭市；营业时间 06:30–11:30、14:00–17:00');
}
export function restock(state,at,cfg) {
  const day=localTime(at,cfg.timezone).day;
  if(state.market.day===day)return;
  const {items}=catalogFor(state),active=Object.values(items).filter(i=>i.availableDay<=day&&!i.id.startsWith('dish_'));
  const stock=[];
  for(const i of active.filter(i=>i.workshop)) {
    const quantity=['tool','kitchenware'].includes(i.kind)?2:i.kind==='seed'?12:50;
    stock.push({id:`${i.workshop}:${i.id}`,vendor:i.workshop,itemId:i.id,quantity,price:i.price,ageHours:0,container:['meat','dairy','egg','processed'].includes(i.kind)?'fridge':'pantry'});
  }
  const requested=[...new Set(state.notices.filter(n=>n.targetDay===day).flatMap(n=>n.itemIds))];
  const cap=cfg.merchantCapacityKg*1000;let used=0;
  // 先各生成一单位，并按重量升序：相同单品价值目标下保证可生成的种类数最多。
  const forced=requested.map(id=>items[id]).filter(i=>i&&i.availableDay<=day).sort((a,b)=>a.g-b.g||a.id.localeCompare(b.id));
  function put(i,q=1) {
    q=Math.min(q,Math.floor((cap-used)/i.g));if(q<1)return false;
    const entry=stock.find(s=>s.vendor==='merchant'&&s.itemId===i.id);
    if(entry)entry.quantity+=q;
    else stock.push({id:`merchant:${i.id}`,vendor:'merchant',itemId:i.id,quantity:q,price:money(i.price*1.12),ageHours:0,container:['meat','dairy','egg','food'].includes(i.kind)?'fridge':'pantry'});
    used+=i.g*q;return true;
  }
  for(const i of forced)put(i);
  const pool=active.filter(i=>!i.workshop&&!requested.includes(i.id)).sort((a,b)=>random(state.seed,`${day}:${a.id}`)-random(state.seed,`${day}:${b.id}`));
  for(const i of pool.slice(0,32))put(i,1+Math.floor(random(state.seed,`${day}:q:${i.id}`)*5));
  // 余下空间补日用品，始终不挤掉公告要求的种类。
  for(const i of active.filter(i=>i.workshop).sort((a,b)=>random(state.seed,`${day}:extra:${a.id}`)-random(state.seed,`${day}:extra:${b.id}`)).slice(0,12))put(i,2);
  state.market={day,stock,merchantCapacityG:cap,merchantLoadedG:used,requested,unfilled:forced.filter(i=>!stock.some(s=>s.vendor==='merchant'&&s.itemId===i.id)).map(i=>i.id)};
  state.notices=state.notices.filter(n=>n.targetDay>=day);
}
export function tripDuration(state,cfg) {
  const ratio=containerWeight(state,'bag')/carryLimit(state,cfg);
  return Math.round(12*60_000*(1+2.5*ratio*ratio)*(1+(100-state.pet.health)/200));
}
export function depart(state,args,now,cfg) {
  if(state.trip.phase!=='home')throw new Error('桌宠已经在外面');
  if(!marketOpen(now,cfg.timezone))throw new Error('仅在营业时间允许出发赶集');
  const coins=requireNumber(args.coins??0,'携带金币',0,state.coins);
  if(Math.abs(coins*100-Math.round(coins*100))>1e-6)throw new Error('金币最多两位小数');
  if(!Array.isArray(args.items??[])||(args.items??[]).length>100)throw new Error('请提供不超过100个货物批次');
  const seen=new Set();
  for(const x of args.items??[]) {
    if(seen.has(x.batchId))throw new Error('同一批次不可重复装包');seen.add(x.batchId);
    const b=batch(state,x.batchId),i=catalogFor(state).items[b.itemId];
    if(['trash','bag'].includes(b.container))throw new Error('只能装入家中的有效库存');
    if(expired(b,i))throw new Error('过期物品不能带去出售');
    requireNumber(x.quantity,'携带数量',1,b.quantity,true);
    if(state.jobs.some(j=>j.tool===i.id))throw new Error('正在烹饪的厨具不能带走');
    state.batches.push({...b,id:`b${++state.sequence}`,quantity:x.quantity,container:'bag'});b.quantity-=x.quantity;
  }
  state.batches=state.batches.filter(b=>b.quantity>0);
  state.coins=money(state.coins-coins);state.carriedCoins=money(state.carriedCoins+coins);
  if(containerWeight(state,'bag')>carryLimit(state,cfg)+1e-7)throw new Error(`超过当前负重上限 ${weight(carryLimit(state,cfg))}；金币也计重`);
  const duration=tripDuration(state,cfg);state.trip={phase:'outbound',departedAt:now,arriveAt:now+duration};
  state.pet.energy=Math.max(0,state.pet.energy-4);
  return `已出发，背包 ${weight(containerWeight(state,'bag'))}（含金币），约 ${Math.ceil(duration/60000)} 分钟后抵达。${marketOpen(now+duration,cfg.timezone)?'':'注意：抵达时可能已经闭市。'}`;
}
export function returnHome(state,now,cfg) {
  if(state.trip.phase!=='market')throw new Error('需要先抵达集市才能返程');
  const duration=tripDuration(state,cfg);state.trip={phase:'returning',departedAt:now,arriveAt:now+duration};
  return `已踏上归途，约 ${Math.ceil(duration/60000)} 分钟后回家；货物到家后仍在背包，需整理入库`;
}
function offers(state,offer,items) {
  if(!Array.isArray(offer)||!offer.length||offer.length>100)throw new Error('请提供1–100个交换批次');
  const seen=new Set();let value=0,grams=0;
  for(const x of offer) {
    if(seen.has(x.batchId))throw new Error('同一批次不能重复抵价');seen.add(x.batchId);
    const b=batch(state,x.batchId),i=items[b.itemId];
    if(b.container!=='bag')throw new Error('只能交易随身背包里的物件');
    requireNumber(x.quantity,'交易数量',1,b.quantity,true);
    if(expired(b,i))throw new Error('商人不接收过期食物，请用厨余垃圾桶处理');
    if(i.kind==='recipe'&&state.learnedRecipes.includes(i.recipeId)) { /* 纸质副本仍可出售 */ }
    value+=batchValue(b,i,x.quantity);grams+=i.g*x.quantity;
  }
  return {value:money(value),grams};
}
function removeOffer(state,offer) { for(const x of offer)batch(state,x.batchId).quantity-=x.quantity;state.batches=state.batches.filter(b=>b.quantity>0); }
export function trade(state,args,now,cfg) {
  marketRequired(state,now,cfg);const {items}=catalogFor(state);
  if(args.mode==='sell') {
    const offer=args.offer??[{batchId:args.batchId,quantity:args.quantity}],v=offers(state,offer,items);
    // 卖出后得到的金币亦占重量；极低重量高价物品也不能绕过背包上限。
    const after=containerWeight(state,'bag')-v.grams+(v.value*COIN_GRAMS);
    if(after>carryLimit(state,cfg)+1e-7)throw new Error('出售后金币重量超载，请减少出售数量');
    removeOffer(state,offer);state.carriedCoins=money(state.carriedCoins+v.value);
    return `出售成功，获得 ${v.value} 金币`;
  }
  if(!['buy','barter'].includes(args.mode))throw new Error('交易模式应为 buy、sell 或 barter');
  const s=state.market.stock.find(s=>s.id===args.stockId),q=requireNumber(args.quantity,'购买数量',1,1000,true);
  if(!s||s.quantity<q)throw new Error('库存不足或货物已刷新');
  const i=items[s.itemId];if(expired(s,i))throw new Error('这批货物已过期，不能购买');
  const cost=money(s.price*q);let credit=0;
  if(args.mode==='barter') { const v=offers(state,args.offer,items);credit=v.value;removeOffer(state,args.offer); }
  const due=money(Math.max(0,cost-credit));
  if(state.carriedCoins<due)throw new Error(`随身金币不足，还需 ${due} 金币`);
  state.carriedCoins=money(state.carriedCoins-due);
  // 明确交换超过价格的部分不找零；购买新菜谱也产生有重量的纸质物品。
  addInventory(state,i.id,q,'bag',now,cfg,{ageHours:s.ageHours});s.quantity-=q;
  if(i.kind==='recipe'&&!state.learnedRecipes.includes(i.recipeId))state.learnedRecipes.push(i.recipeId);
  return `获得 ${i.name} ×${q}，支付 ${due} 金币${credit?`及价值 ${credit} 金币的物件（多余抵价不找零）`:''}${i.kind==='recipe'?'；已阅读并掌握新菜谱':''}`;
}
export function postNotice(state,args,now,cfg) {
  marketRequired(state,now,cfg);const {items}=catalogFor(state),ids=args.itemIds;
  if(!Array.isArray(ids)||ids.length<1||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>!Object.hasOwn(items,id)||items[id].availableDay>state.market.day))throw new Error('公告须填写1–20个已生效且不重复的世界物品ID');
  if(state.notices.filter(n=>n.targetDay===nextDay(state.market.day)).length>=10)throw new Error('每天最多发布10则公告');
  if(args.offer?.length) { const v=offers(state,args.offer,items);if(v.value<2)throw new Error('抵费物件价值不足2金币');removeOffer(state,args.offer); }
  else { if(state.carriedCoins<2)throw new Error('发布一则布告需要2金币或足值物件');state.carriedCoins=money(state.carriedCoins-2); }
  state.notices.push({id:`n${++state.sequence}`,itemIds:[...ids],targetDay:nextDay(state.market.day)});
  return '布告已张贴；次日商人优先各带一份，若超载按最轻优先保证种类最多。管理员不找回超额物件价值。';
}
export function marketView(state,now,cfg) {
  const {items}=catalogFor(state);
  return {...state.market,open:marketOpen(now,cfg.timezone),hours:'06:30–11:30 / 14:00–17:00',timezone:cfg.timezone,workshops:WORKSHOPS,stock:state.market.stock.map(s=>({...s,name:items[s.itemId].name,kind:items[s.itemId].kind,g:items[s.itemId].g,freshness:freshness(s,items[s.itemId]),expired:expired(s,items[s.itemId])}))};
}
