import { catalogFor, CROPS, METHODS } from './catalog.js';
import { accessible, addInventory, assertContainer, assertSpace, available, batch, consume, expired, freshness, hasTool, makeBatch, moveBatch, receiveGoods, STORAGE } from './inventory.js';
import { depart, hirePorter, marketButcher, postNotice, returnHome, trade } from './market.js';
import { animalIndex, animalRecord, breedAnimals, butcherProducts, createPurchasedAnimal, SPECIES, speciesLabel } from './livestock.js';
import { recordActivity } from './diary.js';
import { event, advance } from './simulation.js';
import { clamp, DAY, HOUR, localTime, nextDay, requireNumber, requireText } from './time.js';
import { validateItem, validateRecipe } from './validation.js';

function home(s) { if(s.trip.phase!=='home')throw new Error('请先回家再进行田间、厨房或仓储操作'); }
function awake(s) { if(s.pet.restUntil>s.lastAt)throw new Error('正在休息，请等待或先结束休息'); }
function effort(s,n) { if(s.pet.energy<n)throw new Error('体力不足，请先休息、补水进食');s.pet.energy=clamp(s.pet.energy-n);s.pet.hygiene=clamp(s.pet.hygiene-n*.3); }
function field(s,id) { const f=s.fields.find(x=>x.id===id);if(!f)throw new Error('未知田块');return f; }
function usableField(s,id) { const f=field(s,id);if(!f.reclaimed)throw new Error('这块田尚未开垦');return f; }
function growingField(s,id) { const f=usableField(s,id);if(!f.cropId)throw new Error('请先播种');if(f.progress>=100)throw new Error('作物已经成熟，请收获');if(f.health<=0)throw new Error('作物已枯死，请清田');return f; }
function water(s,liters) {if(s.waterLiters<liters)throw new Error('水池水量不足，请先从井里打水');s.waterLiters-=liters;}
function livestockEnabled(s,cfg){if(cfg.babyMode)throw new Error('宝宝模式开启中：养殖和屠宰已停用，可在World配置中关闭宝宝模式');if(!s.livestock.setupGranted)throw new Error('先在设置中完成养殖模式引导');}
function butcherAnimal(s,a,now,cfg){
  hasTool(s,'butcher_kit');
  if(a.processed)throw new Error('这只动物已处理，不能重复获得产物');
  if(a.status==='alive'){if(a.sick)throw new Error('病畜不能屠宰食用，应先治疗或等待兽医处置');if(a.health<45)throw new Error('健康过低，先治疗和照料，不宜屠宰');if(a.pregnancy)throw new Error('怀孕动物不能屠宰');a.status='dead';a.deathCause='slaughter';a.deathAt=now;a.slaughterHealth=a.health;}
  if(a.status!=='dead'||a.deathCause==='disease')throw new Error('只有健康屠宰或自然寿终的动物可制成食材；病死动物禁食');
  const output=butcherProducts(s,a,now,cfg);if(!output.length)throw new Error('该动物没有可食用的屠宰产物');
  for(const p of output){const left=receiveGoods(s,p,now,cfg);if(left)s.livestock.pendingProduce.push({...p,quantity:left,container:'doorstep'});}a.processed=true;
  return {output,summary:output.reduce((n,x)=>n+x.grams,0)};
}
function recipeCook(s,a,now,cfg) {
  home(s);awake(s);const {items,recipes}=catalogFor(s),r=recipes[a.recipeId];
  if(!r||!s.learnedRecipes.includes(r.id))throw new Error('尚未掌握这份菜谱，请先向商人购买');
  const quantity=requireNumber(a.quantity??1,'烹饪份数',1,6,true),to=a.container??'fridge',tool=METHODS[r.method].tool;
  if(to==='bag')throw new Error('请把成品放入家中食品容器');
  assertContainer(items[`dish_${r.id}`],to);hasTool(s,tool);
  if(s.jobs.some(j=>j.tool===tool))throw new Error('该厨具正在使用，请等待这锅完成');
  assertSpace(s,to,r.yieldGrams*quantity,cfg);
  const minutes=r.minutes*(1+(quantity-1)*.15);let minFresh=1,nutritionG=0,inputG=0;
  for(const ing of r.ingredients)minFresh=Math.min(minFresh,consume(s,ing.itemId,ing.quantity*quantity,{maxSpoil:.8,onBatch:(b,q,i)=>{inputG+=q*i.g;nutritionG+=q*i.g*(b.satietyMultiplier??1);}}));
  water(s,r.waterMl*quantity/1000);
  if(r.method!=='cold') {
    const packs=Math.max(0,Math.ceil((minutes-s.fuelMinutes)/60));if(packs)consume(s,'fuel',packs);
    s.fuelMinutes=s.fuelMinutes+packs*60-minutes;
  }
  effort(s,3);
  s.jobs.push({id:`j${++s.sequence}`,type:'cook',tool,recipeId:r.id,outputId:`dish_${r.id}`,quantity,outputG:r.yieldGrams*quantity,container:to,startedAt:now,finishAt:now+minutes*60_000,initialAgeHours:(1-minFresh)*r.shelfHours,satietyMultiplier:inputG?nutritionG/inputG:1});
  return `开始${METHODS[r.method].name}${r.name} ×${quantity}，约 ${Math.ceil(minutes)} 分钟后完成；食材已扣除，成品空间已预留`;
}
function doAction(s,name,a={},now,cfg,{owner=false}={}) {
  if(!a||typeof a!=='object'||Array.isArray(a))throw new Error('动作参数必须是对象');
  if(name==='add_item'||name==='add_recipe') {
    if(!owner)throw new Error('这是主人专属管理功能，桌宠不能添加物品或菜谱');
    const day=nextDay(localTime(now,cfg.timezone).day);
    if(name==='add_item') { const i=validateItem(a,s);if(i.crop){s.customCrops[i.crop.id]=i.crop;i.cropId=i.crop.id;delete i.crop;}i.availableDay=day;s.customItems[i.id]=i;return `${i.name}已加入世界目录，${day}起${i.workshop?'在对应固定作坊销售':'进入流动商人随机货池'}`; }
    const r=validateRecipe(a,s);r.availableDay=day;s.customRecipes[r.id]=r;
    return `菜谱「${r.name}」已交给商人，${day}起可能出现；桌宠尚未掌握，需赶集购买`;
  }
  if(name==='cancel_rest') {home(s);s.pet.restUntil=0;return '已结束休息';}
  awake(s);
  switch(name) {
    case 'reclaim': {home(s);const f=field(s,a.fieldId);if(f.reclaimed)throw new Error('这块田已经开垦');hasTool(s,'hoe');effort(s,12);Object.assign(f,{reclaimed:true,weeds:0,moisture:45});event(s,'life',`开垦了${f.name}，可以播种了。`,now);s.pet.joy=clamp(s.pet.joy+4);return '开垦完成，荒草已清除';}
    case 'sow': {home(s);const f=usableField(s,a.fieldId),c=catalogFor(s).crops[a.cropId];if(!c)throw new Error('未知作物');if(f.cropId)throw new Error('本季作物尚未收获或清田');hasTool(s,'hoe');consume(s,c.seed,1);effort(s,4);Object.assign(f,{cropId:c.id,progress:0,health:100,fertilized:false,sownAt:now,pests:0});return `${c.name}播种完成；理想生长周期 ${c.growHours/cfg.growthMultiplier} 小时，缺水杂草会延缓`;}
    case 'water': {home(s);const f=growingField(s,a.fieldId);hasTool(s,'watering_can');if(f.moisture>=95)throw new Error('土壤已很湿，无需继续浇水');water(s,f.cropId==='paddy'?8:5);effort(s,2);f.moisture=clamp(f.moisture+40);return '已浇水；生长仍需要真实时间，不会靠反复浇水瞬间成熟';}
    case 'weed': {home(s);const f=usableField(s,a.fieldId);if(f.weeds<1)throw new Error('现在没有需要清理的杂草');hasTool(s,'hoe');effort(s,3);f.weeds=0;return '除草完成，作物得到更多养分和光照';}
    case 'fertilize': {home(s);const f=growingField(s,a.fieldId);if(f.fertilized)throw new Error('一季只施一次肥，过量施肥有害');consume(s,'fertilizer',1);effort(s,2);f.fertility=clamp(f.fertility+30);f.fertilized=true;return '消耗一份有机肥，肥力上升，收成提高';}
    case 'drain': {home(s);const f=usableField(s,a.fieldId);if(f.waterlogging<1)throw new Error('田中没有积水');hasTool(s,'hoe');effort(s,4);f.waterlogging=0;return '已疏通沟渠，排除积水';}
    case 'pest': {home(s);const f=growingField(s,a.fieldId);if(f.pests<1)throw new Error('当前没有虫害');consume(s,'pest_control',1);effort(s,2);f.pests=clamp(f.pests-65);return '施用了生物防虫剂，虫口下降';}
    case 'scarecrow': {home(s);const f=usableField(s,a.fieldId);if(f.scarecrowUntil>now)throw new Error('稻草人仍然有效');consume(s,'scarecrow',1);effort(s,3);f.scarecrowUntil=now+72*HOUR;return '稻草人已立好，未来72小时减少鸟类啄食；不能防蝗虫';}
    case 'clear_field': {home(s);const f=usableField(s,a.fieldId);if(!f.cropId)throw new Error('田里没有作物');effort(s,3);Object.assign(f,{cropId:null,progress:0,sownAt:null,health:100,pests:0,fertilized:false});return '已清田，放弃本季作物，可重新播种';}
    case 'harvest': {home(s);const f=usableField(s,a.fieldId);if(!f.cropId||f.progress<100||f.health<=0)throw new Error('只有健康且成熟的作物才能收获');hasTool(s,'sickle');const c=catalogFor(s).crops[f.cropId],to=a.container??(['grain','legume'].includes(catalogFor(s).items[c.product].kind)?'granary':'cellar');if(to==='bag')throw new Error('收成请先放入家中仓储');const q=Math.max(1,Math.floor(c.yieldUnits*(.5+f.fertility/200)*(f.fertilized?1.25:1)*f.health/100*(1-f.weeds*.003)));addInventory(s,c.product,q,to,now,cfg);effort(s,5);Object.assign(f,{cropId:null,progress:0,sownAt:null,pests:0,fertilized:false,weeds:10});s.pet.joy=clamp(s.pet.joy+9);event(s,'harvest',`丰收的喜悦：${c.name}收获 ${q*catalogFor(s).items[c.product].g} g，愉悦值增加。`,now);return `收获 ${c.name} ×${q}，已入库`;}
    case 'fill_water': {home(s);const liters=requireNumber(a.liters??20,'打水升数',1,50);if(s.waterLiters+liters>200)throw new Error('水池上限200 L，请减少打水量');effort(s,Math.ceil(liters/10));s.waterLiters+=liters;return `从井里打来 ${liters} L 水`;}
    case 'cook':return recipeCook(s,a,now,cfg);
    case 'process': {home(s);hasTool(s,'hand_mill');const rules={paddy:['rice',.8],wheat:['flour',.8]},rule=rules[a.itemId];if(!rule)throw new Error('可加工稻谷为大米、小麦为面粉');const q=requireNumber(a.quantity??5,'加工份数',5,100,true),out=Math.floor(q*rule[1]),to=a.container??'granary';const f=consume(s,a.itemId,q,{maxSpoil:.8});const i=catalogFor(s).items[rule[0]];addInventory(s,rule[0],out,to,now,cfg,{ageHours:(1-f)*i.shelfHours});effort(s,5);return `加工完成，${q*100} g 原粮制得 ${out*100} g 成品，损耗为麸皮稻壳`;}
    case 'move': {home(s);moveBatch(s,a.batchId,a.quantity,a.container,cfg);return '已移动，原有腐败程度保留';}
    case 'unpack': {home(s);const b=batch(s,a.batchId);if(b.container!=='bag')throw new Error('请先选择背包中的物品');moveBatch(s,b.id,a.quantity,a.container,cfg);return '已从背包整理入库';}
    case 'eat': {
      if(['outbound','returning'].includes(s.trip.phase))throw new Error('赶路时先专心走路，到达后再进食');
      const b=batch(s,a.batchId),i=catalogFor(s).items[b.itemId];if(!accessible(s,b))throw new Error('当前无法取用这个容器里的食物');
      const q=requireNumber(a.quantity??1,'食用份数',1,3,true);if(b.quantity<q)throw new Error('份数不足');if(expired(b,i))throw new Error('已经完全腐败，不可食用，必须丢入厨余垃圾桶');
      if(!(b.rawEdibleOverride??i.rawEdible))throw new Error('这件物品不能直接食用，需要先烹饪或加工');
      const f=freshness(b,i),before=s.pet.satiety;s.pet.satiety=clamp(s.pet.satiety+(b.satietyOverride??i.satiety)*(b.satietyMultiplier??1)*q*f);s.pet.energy=clamp(s.pet.energy+2*f*q);
      if(f<.35){s.pet.joy=clamp(s.pet.joy-8*(1-f)*q);s.pet.health=clamp(s.pet.health-15*(1-f)*q);event(s,'health','吃了临近腐败的食物，口感很差，健康和愉悦受到影响。',now);}
      else s.pet.joy=clamp(s.pet.joy+i.joy*q*f);
      b.quantity-=q;s.batches=s.batches.filter(b=>b.quantity>0);return `吃下${i.name}，饱腹增加 ${(s.pet.satiety-before).toFixed(1)}；新鲜度 ${(f*100).toFixed(0)}%`;
    }
    case 'discard': {const b=batch(s,a.batchId),i=catalogFor(s).items[b.itemId];home(s);if(!expired(b,i)||b.container==='trash')throw new Error('只允许把过期食材放入厨余垃圾桶');const q=requireNumber(a.quantity??b.quantity,'丢弃数量',1,b.quantity,true);assertSpace(s,'trash',i.g*q,cfg);makeBatch(s,i.id,q,'trash',b.createdAt,{ageHours:b.ageHours});b.quantity-=q;s.batches=s.batches.filter(b=>b.quantity>0);return '已放入厨余垃圾桶，记得清空或堆肥';}
    case 'empty_trash': {home(s);const {items}=catalogFor(s),g=s.batches.filter(b=>b.container==='trash').reduce((n,b)=>n+items[b.itemId].g*b.quantity,0);if(!g)throw new Error('厨余垃圾桶已经是空的');s.batches=s.batches.filter(b=>b.container!=='trash');s.trashTotalG+=g;if(a.compost){const q=Math.floor(g/1000);if(q)addInventory(s,'fertilizer',q,'shed',now,cfg);}effort(s,2);s.pet.hygiene=clamp(s.pet.hygiene+3);return `已处理 ${g} g 厨余${a.compost?'，每满1kg制得一份有机肥，其余已清运':''}`;}
    case 'drink': {if(['outbound','returning'].includes(s.trip.phase))throw new Error('抵达后再饮水');home(s);water(s,.25);s.pet.hydration=clamp(s.pet.hydration+25);return '喝下250mL清水，补充水分';}
    case 'wash': {home(s);water(s,5);effort(s,1);s.pet.hygiene=clamp(s.pet.hygiene+35);s.pet.joy=clamp(s.pet.joy+2);return '洗漱完成，清洁度提高';}
    case 'rest': {home(s);const hours=requireNumber(a.hours??2,'休息小时',.25,12);s.pet.restUntil=now+hours*HOUR;return `开始休息 ${hours} 小时；期间不能种田、做饭或出发`;}
    case 'play': {if(['outbound','returning'].includes(s.trip.phase))throw new Error('赶路中不能玩耍');effort(s,4);s.pet.joy=clamp(s.pet.joy+7);s.pet.social=clamp(s.pet.social+8);if(a.outdoors&&['rain','flood','cold'].includes(s.weather.id)){s.pet.coldUntil=Math.max(s.pet.coldUntil,now+12*HOUR);s.pet.health=clamp(s.pet.health-6);s.pet.warmth=clamp(s.pet.warmth-20);event(s,'health','在冷雨中贪玩着凉了，需要保暖、休息，必要时服药。',now);}return '玩耍后心情愉快；户外遇冷雨会感冒';}
    case 'medicine': {if(s.pet.coldUntil<=now)throw new Error('当前没有感冒，无需服药');if(now-s.pet.medicineAt<6*HOUR)throw new Error('距离上次服药不足6小时');consume(s,'medicine',1);s.pet.medicineAt=now;s.pet.coldUntil=now+Math.max(0,(s.pet.coldUntil-now)/2);s.pet.health=clamp(s.pet.health+5);return '已服药并缩短感冒持续时间，请继续休息保暖';}
    case 'depart':return depart(s,a,now,cfg);
    case 'return':return returnHome(s,now,cfg);
    case 'trade':return trade(s,a,now,cfg);
    case 'notice':return postNotice(s,a,now,cfg);
    case 'husbandry': {
      livestockEnabled(s,cfg);home(s);
      switch(a.action){
        case 'feed': {const animal=animalIndex(s,a.animalId),q=requireNumber(a.quantity??1,'饲料公斤数',1,20,true);consume(s,'livestock_feed',q);animal.appetite=clamp(animal.appetite+Math.min(80,18*q));animal.energy=clamp(animal.energy+5);return `喂了${speciesLabel(animal)} ${q}kg饲料，食欲恢复至 ${Math.round(animal.appetite)}%`;}
        case 'treat': {const animal=animalIndex(s,a.animalId);if(!animal.sick)throw new Error('动物目前没有生病，不需要使用兽药');if(animal.treatedAt!=null&&now-animal.treatedAt<6*HOUR)throw new Error('距离上次用药不足6小时');consume(s,'animal_medicine',1);animal.treatedAt=now;animal.treatmentUntil=now+24*HOUR;animal.health=clamp(animal.health+6);effort(s,2);event(s,'animal_treatment',`已给${SPECIES[animal.species].name}用药，治疗${animal.disease}，疗程24小时。`,now,{animalId:animal.id});return `治疗进行中，健康 ${Math.round(animal.health)}%。6小时后可补药；严重病损可能超过恢复速度，请及时照料。`;}
        case 'breed': {const mother=animalIndex(s,a.femaleId),father=animalIndex(s,a.maleId),p=breedAnimals(s,mother,father,now,cfg);return `已安排${SPECIES[mother.species].group==='poultry'?'受精与孵化':'配种'}，约 ${((p.dueAt-now)/DAY).toFixed(1)} 天后出生（真实时间）`;}
        case 'slaughter': {const animal=animalRecord(s,a.animalId),result=butcherAnimal(s,animal,now,cfg);effort(s,Math.min(15,3+result.summary/30000));if(animal.deathCause==='slaughter')s.pet.joy=clamp(s.pet.joy-3);event(s,'butcher',`在家完成屠宰：${SPECIES[animal.species].name}，产物${result.output.length}类、共${Math.round(result.summary/1000*10)/10}kg，已分开放入冷藏与储藏。`,now,{animalId:animal.id,grams:result.summary});return `屠宰完成，分得${result.output.length}类副产物，共 ${Math.round(result.summary/1000*10)/10}kg。健康屠宰肉品等级高、寿终肉饱腹较高且须更快食用；病死动物完全禁食。`;}
        case 'release': {const b=batch(s,a.batchId),i=catalogFor(s).items[b.itemId];if(i.kind!=='animal'||!['bag','doorstep'].includes(b.container))throw new Error('请选择仓库中合法的活体动物运输箱');const quantity=requireNumber(a.quantity??1,'动物数量',1,b.quantity,true),created=[];for(let n=0;n<quantity;n++)created.push(createPurchasedAnimal(s,i.species,i.sex,now));b.quantity-=created.length;s.batches=s.batches.filter(x=>x.quantity>0);return `已将${created.length}只${i.name}安置到${SPECIES[i.species].container==='coop'?'禽舍':SPECIES[i.species].container==='pond'?'鱼塘':'畜棚'}。`}
        case 'dispose': {const animal=animalRecord(s,a.animalId);if(animal.status!=='dead'||animal.processed)throw new Error('只处理尚未处理的死亡动物');animal.processed=true;animal.disposedAt=now;effort(s,4);return `已无害化处理${SPECIES[animal.species].name}遗体，没有产生任何可食物品`;}
        case 'collect': {const pending=s.livestock.pendingProduce??[];if(!pending.length)throw new Error('目前没有待收取的动物产物');let n=0;for(const p of [...pending]){const left=receiveGoods(s,p,now,cfg);n+=p.quantity-left;p.quantity=left;}s.livestock.pendingProduce=pending.filter(p=>p.quantity>0);return `已收取 ${n}单位动物产物；剩余 ${s.livestock.pendingProduce.length} 批等待腾出空间`;}
        default: throw new Error('无效养殖操作');
      }
    }
    case 'porter':return hirePorter(s,a,now,cfg);
    default:throw new Error(`未知动作：${name}`);
  }
}
export function applyAction(s,name,a={},now,cfg,rights){const message=doAction(s,name,a,now,cfg,rights);recordActivity(s,message,now,name);return message;}
/** 供测试和独立预览使用；失败时原状态完全不变。 */
export function execute(state,name,args,now,cfg,rights) {const next=structuredClone(state);advance(next,now,cfg);const message=applyAction(next,name,args,now,cfg,rights);return {state:next,message};}
