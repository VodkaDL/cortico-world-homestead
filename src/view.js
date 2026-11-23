import { catalogFor, METHODS } from './catalog.js';
import { available, carryLimit, containerWeight, inventoryView, reservedWeight, STORAGE } from './inventory.js';
import { marketView } from './market.js';
import { localTime } from './time.js';

export function snapshot(state,now,cfg) {
  if(!state)return {started:false};
  const {items,recipes,crops}=catalogFor(state),batches=inventoryView(state,cfg);
  return {started:true,now,clock:localTime(now,cfg.timezone).text,timezone:cfg.timezone,pet:{...state.pet},coins:state.coins,carriedCoins:state.carriedCoins,
    waterLiters:state.waterLiters,fuelMinutes:state.fuelMinutes,trip:{...state.trip},weather:{...state.weather},
    fields:state.fields.map(f=>{const c=crops[f.cropId];return {...f,cropName:c?.name,stage:!f.reclaimed?'荒芜':!c?'待播种':f.health<=0?'已枯死':f.progress>=100?'成熟':c.stages[Math.min(3,Math.floor(f.progress/25))],idealHours:c?c.growHours/cfg.growthMultiplier:null};}),
    batches,containers:Object.entries(STORAGE).map(([id,s])=>({id,...s,capacityG:id==='bag'?carryLimit(state,cfg):s.capacityG,usedG:containerWeight(state,id,items),reservedG:reservedWeight(state,id)})),
    jobs:state.jobs.map(j=>({...j,name:items[j.outputId].name,remainingMs:Math.max(0,j.finishAt-now)})),
    market:marketView(state,now,cfg),notices:state.notices,events:state.events.slice(-50).reverse(),
    items:Object.values(items),crops:Object.values(crops),methods:METHODS,
    recipes:Object.values(recipes).map(r=>({...r,learned:state.learnedRecipes.includes(r.id),methodName:METHODS[r.method].name,toolName:items[METHODS[r.method].tool].name,
      ingredients:r.ingredients.map(x=>({...x,name:items[x.itemId].name,g:items[x.itemId].g,kind:items[x.itemId].kind,available:available(state,x.itemId)})),
      available:state.learnedRecipes.includes(r.id)&&r.ingredients.every(x=>available(state,x.itemId)>=x.quantity),
    })),
  };
}
