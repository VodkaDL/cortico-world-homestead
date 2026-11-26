import { applyAction } from './actions.js';
import { catalogFor } from './catalog.js';
import { accessible, expired, freshness } from './inventory.js';

function attempt(state,name,args,now,cfg){
  const trial=structuredClone(state);
  try{applyAction(trial,name,args,now,cfg);Object.assign(state,trial);return true;}catch{return false;}
}

export function maybeCare(state,now,cfg){
  const p=state.pet;
  if(state.trip.phase!=='home'||p.restUntil>now)return null;
  if(p.hygiene<=25&&state.waterLiters>=5&&p.energy>=1){if(attempt(state,'wash',{},now,cfg))return 'wash';}
  if(p.satiety<=24){
    const {items,recipes}=catalogFor(state),food=state.batches
      .filter(b=>accessible(state,b)&&b.quantity>0&&!expired(b,items[b.itemId])&&(b.rawEdibleOverride??items[b.itemId].rawEdible))
      .sort((a,b)=>freshness(b,items[b.itemId])-freshness(a,items[a.itemId]));
    for(const b of food)if(attempt(state,'eat',{batchId:b.id,quantity:1},now,cfg))return 'eat';
    if(p.satiety<=18&&!state.jobs.some(j=>j.type==='cook')){
      const meals=Object.values(recipes).filter(r=>state.learnedRecipes.includes(r.id)).sort((a,b)=>b.satiety-a.satiety||a.minutes-b.minutes);
      for(const r of meals)if(attempt(state,'cook',{recipeId:r.id,quantity:1},now,cfg))return 'cook';
    }
  }
  if(p.social<=20&&p.energy>=4&&p.hygiene>15)return attempt(state,'play',{outdoors:false},now,cfg)?'play':null;
  return null;
}
