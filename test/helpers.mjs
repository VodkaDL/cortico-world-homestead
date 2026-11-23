import { newState } from '../src/simulation.js';
import { config } from '../src/time.js';
import { makeBatch } from '../src/inventory.js';
export const AT=Date.parse('2026-11-23T08:00:00+08:00');
export const cfg=config({weatherEnabled:false,hungerPerHour:0});
export const fresh=()=>newState(AT,cfg);
export const give=(s,id,q=1,container='pantry',ageHours=0)=>makeBatch(s,id,q,container,s.lastAt,{ageHours});
export const market=s=>{s.trip={phase:'market'};s.carriedCoins=100;s.coins=20;return s;};
