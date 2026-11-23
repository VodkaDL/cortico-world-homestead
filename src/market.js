import { catalogFor, WORKSHOPS } from './catalog.js';
import { COIN_GRAMS, addInventory, assertSpace, batch, batchValue, carryLimit, containerWeight, expired, freshness } from './inventory.js';
import { HOUR, localDateTime, localTime, marketOpen, money, nextDay, random, requireNumber, weight } from './time.js';
import { butcherProducts, animalCarryCapacity, animalWeight, assertHousing, caravanCapacity, companionPenalty, createPurchasedAnimal, housingUnits, housingUsage, HOUSING, SPECIES } from './livestock.js';
import { event } from './simulation.js';
export function marketRequired(state,now,cfg) {
  if(state.trip.phase!=='market')throw new Error('需要先带上货物和金币赶到集市');
  if(!marketOpen(now,cfg.timezone))throw new Error('现在闭市；营业时间 06:30–11:30、14:00–17:00');
}
export function restock(state,at,cfg) {
  const day=localTime(at,cfg.timezone).day;
  const {items}=catalogFor(state),active=Object.values(items).filter(i=>i.availableDay<=day&&!i.id.startsWith('dish_'));
  // On an upgrade, introduce missing fixed goods without refilling sold stock.
  if(state.market.day===day){for(const i of active.filter(i=>i.workshop))if(!state.market.stock.some(s=>s.vendor===i.workshop&&s.itemId===i.id))state.market.stock.push({id:`${i.workshop}:${i.id}`,vendor:i.workshop,itemId:i.id,quantity:i.kind==='animal'?3:['tool','kitchenware'].includes(i.kind)?2:i.kind==='seed'?12:50,price:i.price,ageHours:0,container:['meat','dairy','egg','processed'].includes(i.kind)?'fridge':'pantry'});return;}
  const stock=[];
  for(const i of active.filter(i=>i.workshop)) {
    const quantity=i.kind==='animal'?3:['tool','kitchenware'].includes(i.kind)?2:i.kind==='seed'?12:50;
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
  state.market={...state.market,day,stock,merchantCapacityG:cap,merchantLoadedG:used,requested,unfilled:forced.filter(i=>!stock.some(s=>s.vendor==='merchant'&&s.itemId===i.id)).map(i=>i.id)};
  state.notices=state.notices.filter(n=>n.targetDay>=day);
}
export function tripDuration(state,cfg) {
  const ratio=containerWeight(state,'bag')/Math.max(1,caravanCapacity(state,cfg));
  return Math.round(12*60_000*(1+2.5*ratio*ratio)*(1+(100-state.pet.health)/200)*(!cfg.babyMode?companionPenalty(state,cfg):1));
}
/** Pack each physical batch onto the pet or an animal; never just add capacities. */
export function arrangeCargo(state,cfg){const items=catalogFor(state).items,carriers=new Map([['pet',carryLimit(state,cfg)-state.carriedCoins*COIN_GRAMS-(state.trip.transportGrams??0)]]);
  if(!cfg.babyMode)for(const id of state.trip.followers??[])carriers.set(id,animalCarryCapacity(state.animals.find(a=>a.id===id),cfg));
  if(carriers.get('pet')<0)throw new Error('金币与运输箱已超过主人负重');
  const cargo=state.batches.filter(b=>b.container==='bag'),packed=[];
  for(const b of cargo){let left=b.quantity;const preferred=b.carrierId&&carriers.has(b.carrierId)?b.carrierId:'pet';for(const id of [...new Set([preferred,...carriers.keys()])]){const q=Math.min(left,Math.floor((carriers.get(id)+1e-7)/items[b.itemId].g));if(!q)continue;const p={...b,id:left===b.quantity?b.id:`b${++state.sequence}`,quantity:q};if(id==='pet')delete p.carrierId;else p.carrierId=id;packed.push(p);carriers.set(id,carriers.get(id)-q*items[b.itemId].g);left-=q;if(!left)break;}if(left)throw new Error('物件超过主人与随行家畜的实际负重；请减少货物或雇佣跑腿');}
  state.batches=[...state.batches.filter(b=>b.container!=='bag'),...packed];return carriers;
}
export function depart(state,args,now,cfg) {
  if(state.trip.phase!=='home')throw new Error('桌宠已经在外面');
  if(!marketOpen(now,cfg.timezone))throw new Error('仅在营业时间允许出发赶集');
  if(cfg.babyMode&&(args.followers?.length||args.items?.some(x=>x.carrierId)))throw new Error('宝宝模式中不提供牲畜跟随或驮运功能');
  const followers=args.followers??[];if(!Array.isArray(followers)||followers.length>8||new Set(followers).size!==followers.length)throw new Error('随行牲畜数量或身份无效');
  for(const id of followers){const a=state.animals.find(x=>x.id===id&&x.status==='alive');if(!a)throw new Error('随行牲畜必须是家中存活的动物');if(a.species==='fish')throw new Error('鱼类不能自行随行赶路');if(a.sick||a.health<25||a.appetite<15)throw new Error(`${SPECIES[a.species].name}生病、虚弱或饥饿，不能赶路`);}
  state.trip.followers=followers;
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
    if(x.carrierId&&!followers.includes(x.carrierId))throw new Error('驮运牲畜必须先加入本次随行名单');
    state.batches.push({...b,id:`b${++state.sequence}`,quantity:x.quantity,container:'bag',...(x.carrierId?{carrierId:x.carrierId}:{})});b.quantity-=x.quantity;
  }
  if(followers.length){for(const id of followers)state.animals.find(a=>a.id===id).onMarket=true;}
  state.batches=state.batches.filter(b=>b.quantity>0);
  state.coins=money(state.coins-coins);state.carriedCoins=money(state.carriedCoins+coins);
  arrangeCargo(state,cfg);
  const duration=tripDuration(state,cfg);state.trip={...state.trip,phase:'outbound',departedAt:now,arriveAt:now+duration,followers,purchasedAnimals:[],transportGrams:0};
  state.pet.energy=Math.max(0,state.pet.energy-4);
  return `已出发，背包 ${weight(containerWeight(state,'bag'))}（含金币），约 ${Math.ceil(duration/60000)} 分钟后抵达。${marketOpen(now+duration,cfg.timezone)?'':'注意：抵达时可能已经闭市。'}`;
}
export function returnHome(state,now,cfg) {
  if(state.trip.phase!=='market')throw new Error('需要先抵达集市才能返程');
  arrangeCargo(state,cfg);
  const followers=[...(state.trip.followers??[])];const purchasedAnimals=[...(state.trip.purchasedAnimals??[])];const duration=tripDuration(state,cfg);state.trip={...state.trip,phase:'returning',departedAt:now,arriveAt:now+duration,followers,purchasedAnimals};
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

function feePayment(state,args,cost,items){
  const offer=args.offer??[];let credit=0;if(offer.length){const v=offers(state,offer,items);credit=v.value;removeOffer(state,offer);}
  const due=money(Math.max(0,cost-credit));if(state.carriedCoins<due)throw new Error(`随身金币或抵费物品不足，至少还需 ${due} 金币`);state.carriedCoins=money(state.carriedCoins-due);return {due,credit};
}
function loadAtMarket(state,p,now,cfg){const i=catalogFor(state).items[p.itemId],q=Math.max(0,Math.min(p.quantity,Math.floor((caravanCapacity(state,cfg)-containerWeight(state,'bag'))/i.g)));if(q)state.batches.push({...p,id:`b${++state.sequence}`,quantity:q,container:'bag',createdAt:p.createdAt??now});if(q<p.quantity)state.market.pendingGoods.push({...p,id:`pg${++state.sequence}`,quantity:p.quantity-q,createdAt:p.createdAt??now});return q*i.g;}
export function marketButcher(state,args,now,cfg){
  marketRequired(state,now,cfg);if(cfg.babyMode)throw new Error('宝宝模式开启期间不提供集市屠宰服务');
  if(!Array.isArray(args.animalIds)||!args.animalIds.length||args.animalIds.length>8||new Set(args.animalIds).size!==args.animalIds.length)throw new Error('请选择1–8只动物');
  const animals=args.animalIds.map(id=>{const a=state.animals.find(x=>x.id===id&&x.status==='alive'&&state.trip.followers.includes(id));if(!a)throw new Error('要屠宰的动物须是本次随行牲畜');if(a.sick||a.pregnancy||a.health<45)throw new Error(`${SPECIES[a.species].name}生病、虚弱或怀孕，不能屠宰`);return a;});
  const items=catalogFor(state).items,totalGrams=animals.reduce((n,a)=>n+animalWeight(a),0),fee=money(Math.max(4,totalGrams/1000*.12)),payment=feePayment(state,args,fee,items);
  const all=[];for(const a of animals){a.status='dead';a.deathCause='slaughter';a.deathAt=now;all.push(...butcherProducts(state,a,now,cfg));}
  for(const a of animals)a.processed=true;state.trip.followers=state.trip.followers.filter(id=>!args.animalIds.includes(id));
  const previousCargo=state.batches.filter(b=>b.container==='bag');state.batches=state.batches.filter(b=>b.container!=='bag');for(const b of previousCargo)loadAtMarket(state,{...b,container:items[b.itemId].shelfHours?'fridge':'doorstep',carrierId:undefined},now,cfg);
  let loadedG=0,pendingG=0;for(const p of all){const loaded=loadAtMarket(state,p,now,cfg);loadedG+=loaded;pendingG+=p.grams-loaded;}arrangeCargo(state,cfg);
  event(state,'butcher',`集市食材坊屠宰${animals.length}只健康牲畜，屠宰产物已分装。`,now,{animalIds:args.animalIds,loadedG,pendingG});
  return `代宰 ${animals.length} 只，费用 ${fee} 金币（支付 ${payment.due} 金币${payment.credit?`和价值${payment.credit}金币的物品`:''}）；${weight(loadedG)} 放入背包，${weight(pendingG)} 留在食材坊待跑腿配送。病死牲畜不能屠宰，正常寿终肉品等级较低且保鲜更短。`;
}

export function hirePorter(state,args,now,cfg){
  marketRequired(state,now,cfg);if(!Array.isArray(args.goods)||!args.goods.length||args.goods.length>60)throw new Error('请选择1–60批待托运货物或随身货物');
  const seen=new Set(),selected=[];let totalG=0;
  for(const x of args.goods){const id=x.pendingId??x.batchId;if(seen.has(id))throw new Error('同一货物不能重复托运');seen.add(id);const p=x.pendingId?state.market.pendingGoods.find(p=>p.id===id):state.batches.find(b=>b.id===id&&b.container==='bag');if(!p)throw new Error('待托运货物已不存在');const i=catalogFor(state).items[p.itemId];if(i.kind==='animal')throw new Error('跑腿小厮不承运活体动物');if(expired(p,i))throw new Error('过期货物不能托运');requireNumber(x.quantity,'托运单位数',1,p.quantity,true);selected.push({pending:p,quantity:x.quantity});totalG+=i.g*x.quantity;}
  if(totalG>100_000)throw new Error('一名小厮每次最多托运100kg');
  const cost=money(Math.max(2,totalG/1000*.4)),payment=feePayment(state,args,cost,catalogFor(state).items),local=localTime(now,cfg.timezone),deliverAt=localDateTime(nextDay(local.day),8,0,cfg.timezone);
  for(const {pending:p,quantity} of selected){if(p.quantity<quantity)throw new Error('抵费物品不能同时作为托运货物');const i=catalogFor(state).items[p.itemId];state.market.porterJobs.push({...p,id:`porter${++state.sequence}`,quantity,container:['tool','kitchenware','material','fertilizer','veterinary','byproduct'].includes(i.kind)?'shed':i.kind==='feed'?'granary':i.shelfHours?'fridge':'pantry',deliverAt,hireAt:now,cost});p.quantity-=quantity;}
  state.market.pendingGoods=state.market.pendingGoods.filter(p=>p.quantity>0);
  state.batches=state.batches.filter(p=>p.quantity>0);arrangeCargo(state,cfg);
  return `已雇佣跑腿小厮托运 ${weight(totalG)}，费用 ${cost} 金币（实际支付 ${payment.due} 金币${payment.credit?`和价值${payment.credit}金币的物件`:''}）；预计 ${localTime(deliverAt,cfg.timezone).text} 送到家门口并放入冰箱或食品柜。`;
}
export function trade(state,args,now,cfg) {
  marketRequired(state,now,cfg);const {items}=catalogFor(state);
  if(args.mode==='sell') {
    const offer=args.offer??[{batchId:args.batchId,quantity:args.quantity}],v=offers(state,offer,items);
    // 卖出后得到的金币亦占重量；极低重量高价物品也不能绕过背包上限。
    const after=containerWeight(state,'bag')-v.grams+(v.value*COIN_GRAMS);
    if(after>caravanCapacity(state,cfg)+1e-7)throw new Error('出售后金币重量超载，请减少出售数量');
    removeOffer(state,offer);state.carriedCoins=money(state.carriedCoins+v.value);arrangeCargo(state,cfg);
    return `出售成功，获得 ${v.value} 金币`;
  }
  if(args.mode==='butcher')return marketButcher(state,args,now,cfg);
  if(args.mode==='porter')return hirePorter(state,args,now,cfg);
  if(!['buy','barter'].includes(args.mode))throw new Error('交易模式应为 buy、sell 或 barter');
  const s=state.market.stock.find(s=>s.id===args.stockId),q=requireNumber(args.quantity,'购买数量',1,1000,true);
  if(!s||s.quantity<q)throw new Error('库存不足或货物已刷新');
  const i=items[s.itemId];if(expired(s,i))throw new Error('这批货物已过期，不能购买');
  const cost=money(s.price*q);let credit=0;
  if(args.mode==='barter') { const v=offers(state,args.offer,items);credit=v.value;removeOffer(state,args.offer); }
  const due=money(Math.max(0,cost-credit));
  if(state.carriedCoins<due)throw new Error(`随身金币不足，还需 ${due} 金币`);
  if(i.kind==='animal'&&!cfg.babyMode){
    state.trip.purchasedAnimals??=[];state.trip.transportGrams??=0;
    const key=SPECIES[i.species].container,projected=housingUsage(state,key)+(key==='barn'?housingUnits(i.species):1)*q+state.trip.purchasedAnimals.filter(a=>SPECIES[a.species].container===key).length;
    if(projected>HOUSING[key].capacity)throw new Error('本次购入后禽舍、畜棚或鱼塘将超出容量');
    if((state.trip.boughtCount??0)+q>8||i.species!=='fish'&&state.trip.followers.length+q>8)throw new Error('一次赶集最多购买8只动物，随行上限8只');
    state.carriedCoins=money(state.carriedCoins-due);
    for(let n=0;n<q;n++)if(i.species==='fish')state.trip.purchasedAnimals.push({species:i.species,sex:i.sex});else {const a=createPurchasedAnimal(state,i.species,i.sex,now);a.onMarket=true;state.trip.followers.push(a.id);}
    state.trip.transportGrams=(state.trip.transportGrams??0)+(i.species==='fish'?(i.g+300)*q:0);state.trip.boughtCount=(state.trip.boughtCount??0)+q;s.quantity-=q;
    arrangeCargo(state,cfg);
    return `购得${i.name} ×${q}，已装入赶集运输栏，回家后安置入栏。`;
  }
  state.carriedCoins=money(state.carriedCoins-due);
  // 明确交换超过价格的部分不找零；购买新菜谱也产生有重量的纸质物品。
  addInventory(state,i.id,q,'bag',now,cfg,{ageHours:s.ageHours});s.quantity-=q;arrangeCargo(state,cfg);
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
  return {...state.market,open:marketOpen(now,cfg.timezone),hours:'06:30–11:30 / 14:00–17:00',timezone:cfg.timezone,workshops:WORKSHOPS,stock:state.market.stock.filter(s=>!cfg.babyMode||!['feed','veterinary'].includes(items[s.itemId].kind)&&s.itemId!=='butcher_kit').map(s=>({...s,name:items[s.itemId].name,kind:items[s.itemId].kind,g:items[s.itemId].g,freshness:freshness(s,items[s.itemId]),expired:expired(s,items[s.itemId])}))};
}
