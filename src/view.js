import { catalogFor, METHODS } from './catalog.js';
import { available, capacity, carryLimit, containerWeight, inventoryView, reservedWeight, STORAGE } from './inventory.js';
import { marketView } from './market.js';
import { localTime } from './time.js';
import { ageLabel, animalCarryCapacity, animalWeight, HOUSING, speciesLabel, SPECIES } from './livestock.js';

export function snapshot(state,now,cfg) {
  if(!state)return {started:false};
  const {items,recipes,crops}=catalogFor(state),batches=inventoryView(state,cfg);
  return {started:true,now,clock:localTime(now,cfg.timezone).text,timezone:cfg.timezone,babyMode:cfg.babyMode,babyModeConfigured:cfg.babyModeConfigured,pet:{...state.pet},coins:state.coins,carriedCoins:state.carriedCoins,
    waterLiters:state.waterLiters,fuelMinutes:state.fuelMinutes,trip:{...state.trip},weather:{...state.weather},
    fields:state.fields.map(f=>{const c=crops[f.cropId];return {...f,cropName:c?.name,stage:!f.reclaimed?'荒芜':!c?'待播种':f.health<=0?'已枯死':f.progress>=100?'成熟':c.stages[Math.min(3,Math.floor(f.progress/25))],idealHours:c?c.growHours/cfg.growthMultiplier:null};}),
    batches,containers:Object.entries(STORAGE).map(([id,s])=>({id,...s,capacityG:capacity(state,id,cfg),usedG:containerWeight(state,id,items),reservedG:reservedWeight(state,id)})),
    jobs:state.jobs.map(j=>({...j,name:items[j.outputId].name,remainingMs:Math.max(0,j.finishAt-now)})),
    market:{...marketView(state,now,cfg),pendingGoods:state.market.pendingGoods.map(p=>({...p,name:items[p.itemId].name,g:items[p.itemId].g,weightG:p.quantity*items[p.itemId].g,price:items[p.itemId].price,ageHours:p.ageHours??0})),porterJobs:state.market.porterJobs,pendingAnimals:state.market.pendingAnimals},notices:state.notices,events:state.events.slice(-50).reverse(),
    animals:state.animals.map(a=>({...a,name:speciesLabel(a),speciesName:SPECIES[a.species].name,ageText:ageLabel(a.ageDays),weightG:animalWeight(a),biologicalAgeDays:a.ageDays,carryCapacityG:!cfg.babyMode?animalCarryCapacity(a,cfg):0,gestationHours:a.pregnancy?Math.max(0,(a.pregnancy.dueAt-now)/3_600_000):null,gestationProgress:a.pregnancy?Math.max(0,Math.min(1,1-(a.pregnancy.dueAt-now)/(SPECIES[a.species].gestation*86_400_000/cfg.animalAgeMultiplier))):null})),
    diary:{entries:[...(state.diary?.entries??[])].reverse(),nextAt:state.diary?.nextAt,timezone:cfg.timezone},
    livestock:{...state.livestock,housing:Object.entries(HOUSING).map(([id,x])=>({id,...x,used:state.animals.filter(a=>a.status==='alive'&&SPECIES[a.species].container===id).reduce((n,a)=>n+(id==='barn'?(a.species==='cattle'?3:a.species==='pig'?2:1):1),0)}))},
    items:Object.values(items),crops:Object.values(crops),methods:METHODS,
    recipes:Object.values(recipes).map(r=>({...r,learned:state.learnedRecipes.includes(r.id),methodName:METHODS[r.method].name,toolName:items[METHODS[r.method].tool].name,
      ingredients:r.ingredients.map(x=>({...x,name:items[x.itemId].name,g:items[x.itemId].g,kind:items[x.itemId].kind,available:available(state,x.itemId)})),
      available:state.learnedRecipes.includes(r.id)&&r.ingredients.every(x=>available(state,x.itemId)>=x.quantity),
    })),
  };
}
