import { catalogFor } from './catalog.js';
import { clamp, money, requireNumber, weight } from './time.js';
import { caravanCapacity } from './livestock.js';
export const COIN_GRAMS=.5;
export const STORAGE = Object.freeze({
  pantry:{name:'食品柜',capacityG:20_000,description:'常温干燥；普通食材按基准保鲜'},
  granary:{name:'粮仓',capacityG:80_000,description:'谷物老化 ×0.20，种子 ×0.30；湿鲜食材 ×1.30'},
  cellar:{name:'地窖',capacityG:40_000,description:'根茎 ×0.35，果蔬 ×0.65；熟食 ×0.80'},
  fridge:{name:'冰箱',capacityG:25_000,description:'熟食 ×0.04，肉奶 ×0.03，果蔬 ×0.30；谷物不宜受潮 ×1.10'},
  shed:{name:'工具棚',capacityG:60_000,description:'仅放工具、厨具、材料、肥料；不可保存食品'},
  bag:{name:'背包',capacityG:12_000,description:'随身携带；老化 ×1.20，金币也计重'},
  trash:{name:'厨余垃圾桶',capacityG:10_000,description:'仅接收过期食材；需手动清空，可堆肥'},
  doorstep:{name:'门廊收货箱',capacityG:350_000,description:'屠宰和托运的大宗货物暂存；没有冷藏效果，请尽快整理'},
});
const roots=new Set(['potato','sweet_potato','carrot','radish','onion','pumpkin','ginger','garlic']);
const equipment=new Set(['tool','kitchenware','material','fertilizer','veterinary','byproduct']);
export function isFood(i) { return i.satiety>0||['food','fruit','vegetable','grain','legume','meat','egg','dairy','processed'].includes(i.kind); }
export function spoilRate(i,container) {
  if(!i.shelfHours) return 0;
  if(container==='bag') return 1.2;
  if(container==='fridge') return i.kind==='food'?.04:['meat','dairy'].includes(i.kind)?.03:i.kind==='egg'?.1:i.id==='tofu'?.08:['vegetable','fruit','legume'].includes(i.kind)?.30:i.kind==='grain'?1.1:.5;
  if(container==='granary') return i.kind==='grain'||['soybean','peanut','sesame','flour','noodles'].includes(i.id)?.2:i.kind==='seed'?.3:1.3;
  if(container==='cellar') return roots.has(i.id)?.35:['vegetable','fruit'].includes(i.kind)?.65:i.kind==='food'?.8:1;
  return 1;
}
export function freshness(b,i) { const shelf=b.shelfHoursOverride??i.shelfHours;return shelf?clamp(1-b.ageHours/shelf,0,1):1; }
export function expired(b,i) { const shelf=b.shelfHoursOverride??i.shelfHours;return !!shelf&&b.ageHours>=shelf-1e-9; }
export function batchValue(b,i,quantity=b.quantity) { return money(i.price*quantity*freshness(b,i)*.65); }
export function location(state) { return state.trip.phase; }
export function carryLimit(state,cfg) { return cfg.carryLimitKg*1000*(.6+.4*state.pet.health/100); }
export function containerWeight(state,key,items=catalogFor(state).items) { return state.batches.filter(b=>b.container===key).reduce((n,b)=>n+items[b.itemId].g*b.quantity,0)+(key==='bag'?state.carriedCoins*COIN_GRAMS+(state.trip.transportGrams??0):0); }
export function reservedWeight(state,key) { return state.jobs.filter(j=>j.container===key).reduce((n,j)=>n+j.outputG,0); }
export function capacity(state,key,cfg) { if(!STORAGE[key]) throw new Error('未知容器');return key==='bag'?caravanCapacity(state,cfg):STORAGE[key].capacityG; }
export function assertSpace(state,key,g,cfg,items=catalogFor(state).items) {
  if(containerWeight(state,key,items)+reservedWeight(state,key)+g>capacity(state,key,cfg)+1e-7) throw new Error(`${STORAGE[key].name}容量不足；需要额外 ${weight(g)}`);
}
export function assertContainer(i,key) {
  if(!STORAGE[key]||key==='trash') throw new Error('目标必须是可使用的储存容器');
  if(key==='doorstep')return;
  if(i.kind==='animal'&&!['bag','doorstep'].includes(key))throw new Error('活体动物只能放运输箱或安置入栏，不能放入食品容器');
  if(i.kind==='feed'&&!['granary','bag'].includes(key))throw new Error('饲料请放粮仓或背包');
  if(key==='shed'&&!equipment.has(i.kind)) throw new Error('工具棚不能放食材或菜谱');
  if(key!=='shed'&&key!=='bag'&&equipment.has(i.kind)) throw new Error('工具与非食品材料请放工具棚或背包');
}
export function makeBatch(state,itemId,quantity,container,at,extra={}) {
  const b={id:`b${++state.sequence}`,itemId,quantity,container,createdAt:at,ageHours:0,...extra};state.batches.push(b);return b;
}
export function batch(state,id) { const b=state.batches.find(b=>b.id===id&&b.quantity>0);if(!b)throw new Error('找不到该库存批次，请刷新');return b; }
export function accessible(state,b) { return state.trip.phase==='home'?b.container!=='bag'&&b.container!=='trash':b.container==='bag'; }
export function available(state,itemId,{fresh=true,homeOnly=false}={}) {
  const i=catalogFor(state).items[itemId];if(!i)return 0;
  return state.batches.filter(b=>b.itemId===itemId&&accessible(state,b)&&(!homeOnly||b.container!=='bag')&&(!fresh||!expired(b,i))).reduce((n,b)=>n+b.quantity,0);
}
export function consume(state,itemId,quantity,{maxSpoil=1,onBatch=null}={}) {
  requireNumber(quantity,'数量',1,10_000,true);
  const i=catalogFor(state).items[itemId];if(!i)throw new Error('未知物品');
  const list=state.batches.filter(b=>b.itemId===itemId&&accessible(state,b)&&!expired(b,i)&&1-freshness(b,i)<=maxSpoil+1e-9).sort((a,b)=>b.ageHours-a.ageHours||a.createdAt-b.createdAt);
  if(list.reduce((n,b)=>n+b.quantity,0)<quantity)throw new Error(`${i.name}数量不足或过于陈旧`);
  let n=quantity,minFresh=1;
  for(const b of list) { const q=Math.min(n,b.quantity);if(q){minFresh=Math.min(minFresh,freshness(b,i));onBatch?.(b,q,i);b.quantity-=q;n-=q;}if(!n)break; }
  state.batches=state.batches.filter(b=>b.quantity>0);return minFresh;
}
export function hasTool(state,id) { if(available(state,id)<1)throw new Error(`需要 ${catalogFor(state).items[id]?.name??id}，可以去器具坊购买`); }
export function moveBatch(state,id,quantity,to,cfg) {
  const b=batch(state,id);requireNumber(quantity,'数量',1,b.quantity,true);
  if(state.trip.phase!=='home'&&(b.container!=='bag'||to!=='bag'))throw new Error('外出时只能使用背包，回家后再整理仓储');
  if(b.container===to)throw new Error('物品已经在该容器');
  const i=catalogFor(state).items[b.itemId];if(expired(b,i))throw new Error('过期物品只能丢入厨余垃圾桶');
  assertContainer(i,to);assertSpace(state,to,quantity*i.g,cfg);
  const {id:oldId,quantity:oldQuantity,container:oldContainer,carrierId,...meta}=b;
  const created=makeBatch(state,b.itemId,quantity,to,b.createdAt,meta);
  b.quantity-=quantity;state.batches=state.batches.filter(x=>x.quantity>0);return created;
}
export function addInventory(state,id,q,to,at,cfg,extra={}) {
  const i=catalogFor(state).items[id];if(!i)throw new Error('未知物品');requireNumber(q,'数量',1,10000,true);assertContainer(i,to);assertSpace(state,to,i.g*q,cfg);return makeBatch(state,id,q,to,at,extra);
}
export function inventoryView(state,cfg) {
  const {items}=catalogFor(state);
  return state.batches.map(b=>{const i=items[b.itemId],f=freshness(b,i),shelf=b.shelfHoursOverride??i.shelfHours;return {...b,name:i.name,kind:i.kind,unitG:i.g,weightG:i.g*b.quantity,weight:weight(i.g*b.quantity),freshness:f,expired:expired(b,i),remainingHours:shelf?Math.max(0,(shelf-b.ageHours)/spoilRate(i,b.container)):null,satiety:Math.round((b.satietyOverride??i.satiety)*(b.satietyMultiplier??1)*f*10)/10,value:batchValue(b,i),rawEdible:b.rawEdibleOverride??i.rawEdible,accessible:accessible(state,b),rate:spoilRate(i,b.container)};});
}

/** Fill finite home storage, keeping overflow in the uncooled receiving crate. */
export function receiveGoods(state,p,at,cfg){const i=catalogFor(state).items[p.itemId];let left=p.quantity;const preferred=p.container==='bag'?'pantry':p.container;
  for(const key of [...new Set([preferred,'doorstep'])]){const free=Math.max(0,capacity(state,key,cfg)-containerWeight(state,key)-reservedWeight(state,key)),q=Math.min(left,Math.floor(free/i.g));if(!q)continue;const {id,quantity,container,...meta}=p;makeBatch(state,p.itemId,q,key,p.createdAt??at,meta);left-=q;if(!left)break;}return left;
}
