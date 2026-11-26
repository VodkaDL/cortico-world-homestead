import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeCare } from '../src/autonomy.js';
import { AT,cfg,fresh } from './helpers.mjs';

test('低清洁度时主动洗漱，低饱腹时先尝试做已有菜谱',()=>{
  const s=fresh();s.pet.hygiene=20;assert.equal(maybeCare(s,AT,cfg),'wash');assert(s.pet.hygiene>20);
  s.pet.satiety=15;assert.equal(maybeCare(s,AT,cfg),'cook');assert.equal(s.jobs.length,1);assert.equal(s.batches.find(b=>b.itemId==='rice').quantity,9);
});
test('低社交时在家室内玩耍，外出或休息时不擅自行动',()=>{
  const s=fresh();s.pet.social=10;assert.equal(maybeCare(s,AT,cfg),'play');assert(s.pet.social>10);
  const away=fresh();away.pet.social=10;away.trip.phase='outbound';assert.equal(maybeCare(away,AT,cfg),null);assert.equal(away.pet.social,10);
  const resting=fresh();resting.pet.social=10;resting.pet.restUntil=AT+60_000;assert.equal(maybeCare(resting,AT,cfg),null);
});
