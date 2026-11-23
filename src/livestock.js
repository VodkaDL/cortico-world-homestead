import { clamp, DAY, HOUR, random } from './time.js';
import { receiveGoods } from './inventory.js';
import { catalogFor } from './catalog.js';

// Biological ages use real species days; 30 biological days elapse per wall-clock day.
// Gestation below is already shortened into wall-clock days, at the default multiplier.
export const SPECIES = Object.freeze({
  chicken:{name:'鸡',group:'poultry',male:'公鸡',female:'母鸡',young:'雏鸡',adult:150,life:6*365,gestation:21/30,feed:120,weight:2000,carry:0,speed:.95,meat:'chicken',egg:'egg',eggHours:24,container:'coop'},
  duck:{name:'鸭',group:'poultry',male:'公鸭',female:'母鸭',young:'雏鸭',adult:180,life:8*365,gestation:28/30,feed:180,weight:3200,carry:0,speed:.9,meat:'duck_meat',egg:'duck_egg',eggHours:36,container:'coop'},
  goose:{name:'鹅',group:'poultry',male:'公鹅',female:'母鹅',young:'鹅苗',adult:240,life:15*365,gestation:30/30,feed:300,weight:5000,carry:0,speed:.85,meat:'goose_meat',egg:'goose_egg',eggHours:48,container:'coop'},
  cattle:{name:'牛',group:'mammal',male:'公牛',female:'母牛',young:'小牛',adult:450,life:18*365,gestation:283/30,feed:10000,weight:480000,carry:100000,speed:.7,meat:'beef',milk:'raw_milk',milkG:5000,lactation:305/30,container:'barn'},
  sheep:{name:'羊',group:'mammal',male:'公羊',female:'母羊',young:'羊羔',adult:360,life:12*365,gestation:150/30,feed:1800,weight:65000,carry:8000,speed:.85,meat:'lamb',wool:'wool',woolHours:72,container:'barn'},
  pig:{name:'猪',group:'mammal',male:'公猪',female:'母猪',young:'猪仔',adult:240,life:12*365,gestation:114/30,feed:2500,weight:150000,carry:0,speed:.65,meat:'pork',container:'barn'},
  fish:{name:'鱼',group:'fish',male:'公鱼',female:'母鱼',young:'鱼苗',adult:365,life:8*365,gestation:30/30,feed:15,weight:1200,carry:0,speed:0,meat:'fish',container:'pond'},
});
export const PRODUCTS=Object.freeze(Object.fromEntries(Object.entries(SPECIES).map(([id,s])=>[id,{sexes:['female','male'],weight:s.weight,price:({chicken:24,duck:40,goose:80,cattle:14400,sheep:1500,pig:2700,fish:10})[id],unit:id==='cattle'?'头':id==='fish'?'尾':'只'}])));
export const HOUSING=Object.freeze({coop:{name:'禽舍',capacity:24,unit:'只'},barn:{name:'畜棚',capacity:24,unit:'畜力位'},pond:{name:'鱼塘',capacity:100,unit:'尾'}});
export const mature=a=>a.ageDays>=SPECIES[a.species].adult;
export const healthy=a=>a?.status==='alive'&&!a.sick&&a.health>0;
export function animalIndex(state,id){const a=state.animals.find(x=>x.id===id&&x.status==='alive');if(!a)throw new Error('找不到这只存活动物');return a;}
export function animalRecord(state,id){const a=state.animals.find(x=>x.id===id);if(!a)throw new Error('找不到这只动物');return a;}
export function speciesLabel(a){const s=SPECIES[a.species];return a.status!=='alive'?`${s.name}（${a.processed?'已处理':a.deathCause==='disease'?'病死':'寿终'}）`:mature(a)?s[a.sex]:s.young;}
export function ageLabel(days){return days<30?`${Math.floor(days)}天`:days<365?`${(days/30).toFixed(1)}个月`:`${(days/365).toFixed(1)}岁`;}
export const housingUnits=species=>species==='cattle'?3:species==='pig'?2:1;
export function housingUsage(state,key){return state.animals.filter(a=>a.status==='alive'&&SPECIES[a.species].container===key).reduce((n,a)=>n+(key==='barn'?housingUnits(a.species):1),0);}
export function assertHousing(state,species,count=1){const s=SPECIES[species];if(!s)throw new Error('未知动物种类');const used=housingUsage(state,s.container);if(used+count*(s.container==='barn'?housingUnits(species):1)>HOUSING[s.container].capacity)throw new Error(`${HOUSING[s.container].name}容量不足`);}
export function animalWeight(a){const s=SPECIES[a.species];return Math.round(s.weight*(.12+.88*Math.min(1,a.ageDays/s.adult)));}
export function newAnimal(state,species,sex,at,{ageDays=0,motherId=null,fatherId=null,quality=100}={}){
  if(!SPECIES[species]||!['female','male'].includes(sex))throw new Error('动物种类或性别无效');
  const a={id:`a${++state.sequence}`,species,sex,ageDays,health:clamp(quality,35,100),appetite:90,energy:90,status:'alive',bornAt:at,motherId,fatherId,sick:false,disease:null,diseaseAt:null,treatedAt:null,treatmentUntil:0,recoveredAt:null,pregnancy:null,lastProductAt:at,productionHours:0,lastBirthAt:null,processed:false};state.animals.push(a);return a;
}
export function seedStarterLivestock(state,at){if(state.livestock.setupGranted)return;
  for(const [species,sex,age] of [['chicken','female',180],['chicken','male',210],['cattle','female',500],['cattle','male',650],['sheep','female',400],['sheep','male',450],['duck','female',200],['duck','male',220],['goose','female',300],['goose','male',330],['fish','female',450],['fish','male',450]])newAnimal(state,species,sex,at,{ageDays:age});
  state.livestock.setupGranted=true;
  for(const [itemId,quantity,container] of [['livestock_feed',60,'granary'],['animal_medicine',12,'shed'],['butcher_kit',1,'shed']]){const p={itemId,quantity,container,createdAt:at,ageHours:0};const left=receiveGoods(state,p,at,{carryLimitKg:12,babyMode:false});if(left)state.livestock.pendingProduce.push({...p,quantity:left});}
}
export function createPurchasedAnimal(state,species,sex,at){assertHousing(state,species);return newAnimal(state,species,sex,at,{ageDays:SPECIES[species].adult});}
export function breedAnimals(state,mother,father,now,cfg){
  if(mother.sex!=='female'||father.sex!=='male'||mother.species!==father.species)throw new Error('须选择同种、异性且已成年的公母动物');
  if(!healthy(mother)||!healthy(father)||mother.health<50||father.health<50||mother.appetite<30||father.appetite<30)throw new Error('患病、虚弱或饥饿的动物不宜配种');
  if(!mature(mother)||!mature(father))throw new Error('动物尚未性成熟');
  if(mother.onMarket||father.onMarket)throw new Error('请先让动物回到家中再配种');
  if(mother.pregnancy||(mother.lastBirthAt!=null&&now-mother.lastBirthAt<SPECIES[mother.species].gestation*DAY*.35/cfg.animalAgeMultiplier))throw new Error('母畜怀孕或产后尚未恢复');
  assertHousing(state,mother.species);mother.pregnancy={dueAt:now+SPECIES[mother.species].gestation*DAY/cfg.animalAgeMultiplier,fatherId:father.id,fatherHealth:father.health};mother.appetite=clamp(mother.appetite-5);
  return mother.pregnancy;
}
function ration(state,wanted,h){const l=state.livestock;l.feedBinG??=0;l.feedBinAgeHours=(l.feedBinAgeHours??0)+h;if(l.feedBinAgeHours>=720){l.spoiledFeedG=(l.spoiledFeedG??0)+l.feedBinG;l.feedBinG=0;}
  let fed=0;while(fed+1e-7<wanted){if(l.feedBinG<=1e-7){const b=state.batches.filter(b=>b.itemId==='livestock_feed'&&!['bag','trash'].includes(b.container)&&b.quantity>0&&b.ageHours<720).sort((a,b)=>b.ageHours-a.ageHours)[0];if(!b)break;b.quantity--;l.feedBinG=1000;l.feedBinAgeHours=b.ageHours;}
    const n=Math.min(wanted-fed,l.feedBinG);l.feedBinG-=n;fed+=n;}
  state.batches=state.batches.filter(b=>b.quantity>0);return wanted?fed/wanted:1;
}
export function advanceAnimals(state,from,to,cfg){const result={diseases:[],deaths:[],births:[],produced:[]};if(!state.livestock.setupGranted)return result;
  if(cfg.babyMode){const elapsed=Math.max(0,to-from);for(const a of state.animals.filter(a=>a.status==='alive')){if(a.pregnancy)a.pregnancy.dueAt+=elapsed;for(const k of ['lastProductAt','lastBirthAt','treatmentUntil','treatedAt'])if(a[k]!=null&&a[k]>0)a[k]+=elapsed;}return result;}
  const h=(to-from)/HOUR;if(h<=0)return result;const clock=h*cfg.animalAgeMultiplier;
  const live=state.animals.filter(a=>a.status==='alive'),demands=live.map(a=>SPECIES[a.species].feed*(.2+.8*Math.min(1,a.ageDays/SPECIES[a.species].adult))*h/24),feedRatio=ration(state,demands.reduce((n,g)=>n+g,0),h);
  for(const a of live){const s=SPECIES[a.species];if(a.health<=0){a.status='dead';a.deathCause=a.sick?'disease':'natural';a.deathAt=to;a.pregnancy=null;result.deaths.push(a);continue;}a.ageDays+=clock*30/24;a.appetite=clamp(a.appetite+h*(feedRatio>=.99?1.2:-3*(1-feedRatio)));a.energy=clamp(a.energy+h*(a.onMarket?-.6:a.appetite>30?1:-1));
    if(!a.sick){const slot=Math.floor(to/(6*HOUR)),newSlot=slot!==a.lastDiseaseSlot;a.lastDiseaseSlot=slot;const risk=.012+(a.appetite<20?.12:0)+(['flood','cold','drought'].includes(state.weather.id)?.04:0);if(newSlot&&random(state.seed,`illness:${a.id}:${slot}`)<risk){a.sick=true;a.disease=({poultry:'禽类呼吸道感染',mammal:'胃肠炎',fish:'鱼类水霉病'})[s.group];a.diseaseAt=to;result.diseases.push({...a});}}
    if(a.sick){const loss=.8+(100-a.health)*.012,recovery=(a.treatmentUntil??0)>from?1.8:0;a.health=clamp(a.health+(recovery-loss)*clock);if(recovery&&a.health>=85){a.sick=false;a.disease=null;a.recoveredAt=to;a.treatedAt=null;a.treatmentUntil=0;result.diseases.push({...a,recovered:true});}}
    else{if(a.ageDays>s.life*.75)a.health=clamp(a.health-clock*(.2+1.2*(a.ageDays/s.life-.75)));if(a.ageDays>=s.life)a.health=0;if(a.appetite<10){a.sick=true;a.disease='营养不良';a.diseaseAt=to;result.diseases.push({...a});}else if(a.ageDays<s.life*.75)a.health=clamp(a.health+h*.05);}
    if(a.health<=0){a.health=0;a.status='dead';a.deathCause=a.sick?'disease':'natural';a.deathAt=to;a.pregnancy=null;result.deaths.push(a);continue;}
    if(a.pregnancy&&a.pregnancy.dueAt<=to&&!a.onMarket){const p=a.pregnancy;a.pregnancy=null;a.lastBirthAt=to;a.health=clamp(a.health-4);a.appetite=clamp(a.appetite-8);const count=a.species==='pig'?5:a.species==='fish'?12:1;let born=0;
      for(let n=0;n<count;n++){try{assertHousing(state,a.species);}catch{break;}newAnimal(state,a.species,random(state.seed,`sex:${a.id}:${to}:${n}`)<.5?'female':'male',to,{motherId:a.id,fatherId:p.fatherId,quality:(a.health+p.fatherHealth)/2});born++;}
      result.births.push({mother:a,count:born});}
    if(a.onMarket||a.sick||a.appetite<30||!mature(a))continue;
    if(a.sex==='female'&&s.egg&&to-a.lastProductAt>=s.eggHours*HOUR){a.lastProductAt=to;result.produced.push({itemId:s.egg,quantity:1,container:'fridge',createdAt:to});}
    if(a.sex==='female'&&s.milk&&a.lastBirthAt!=null&&to-a.lastBirthAt<s.lactation*DAY/cfg.animalAgeMultiplier&&to-a.lastProductAt>=DAY){a.lastProductAt=to;result.produced.push({itemId:s.milk,quantity:Math.floor(s.milkG/250),container:'fridge',createdAt:to});}
    if(s.wool){a.productionHours+=h;if(a.productionHours>=s.woolHours){a.productionHours-=s.woolHours;result.produced.push({itemId:s.wool,quantity:15,container:'shed',createdAt:to});}}
  }return result;
}
export function animalCarryCapacity(a,cfg){if(!healthy(a))return 0;const s=SPECIES[a.species],age=a.ageDays<s.adult*.5?0:Math.min(1,(a.ageDays/s.adult-.5)*2),senior=a.ageDays>s.life*.65?Math.max(.1,1-(a.ageDays/s.life-.65)*2):1;return Math.floor((s.carry??0)*age*senior*(a.health/100)*(.2+.8*a.appetite/100)*(.4+.6*a.energy/100));}
export function caravanCapacity(state,cfg){return Math.floor(cfg.carryLimitKg*1000*(.6+.4*state.pet.health/100)+(cfg.babyMode?0:(state.trip.followers??[]).reduce((n,id)=>n+animalCarryCapacity(state.animals.find(x=>x.id===id),cfg),0)));}
export function companionPenalty(state,cfg){if(cfg.babyMode)return 1;const active=(state.trip.followers??[]).map(id=>state.animals.find(a=>a.id===id&&a.status==='alive')).filter(Boolean);return active.length?Math.max(...active.map(a=>{const s=SPECIES[a.species],age=Math.min(1,a.ageDays/s.adult),old=a.ageDays/s.life>.65?.75:1;return 1/Math.max(.25,s.speed*(.55+.45*age)*old*(.6+.4*a.health/100)*(.6+.4*a.appetite/100));})):1;}
export function butcherProducts(state,a,now,cfg){if(a.deathCause==='disease'||a.sick||a.processed)return [];const s=SPECIES[a.species],natural=a.deathCause==='natural',g=animalWeight(a),ageHours=natural?Math.max(0,(now-a.deathAt)/HOUR):0,grade=natural?'自然寿终':'健康屠宰';
  // Shares are of live weight. The remainder is water/process loss and non-saleable waste.
  const rows=[[s.meat,natural?.3:.45,'fridge',natural?.5:2],[`offal_${a.species}`,.04,'fridge',natural?.25:1],[`fat_${a.species}`,.04,'fridge',24],[`hide_${a.species}`,.04,'shed',null]];
  if(s.group==='poultry')rows.push(['feather',.03,'shed',null]);if(a.species==='cattle')rows.push(['bone_cattle',.12,'fridge',2]);if(a.species==='sheep')rows.push(['wool',.025,'shed',null]);
  if(a.species==='fish')rows.splice(1,3);
  const items=catalogFor(state).items;return rows.map(([itemId,share,container,shelfHoursOverride])=>{const unit=items[itemId].g,quantity=Math.floor(g*share/unit);return {itemId,quantity,grams:quantity*unit,container,createdAt:natural?a.deathAt:now,ageHours,shelfHoursOverride,grade,animalId:a.id,satietyMultiplier:natural&&itemId===s.meat?1.3:1,rawEdibleOverride:false};}).filter(p=>p.quantity>0);
}
