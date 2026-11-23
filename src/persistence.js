import { mkdir, readFile, rename, copyFile, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { catalogFor } from './catalog.js';

export function validateState(s) {
  if(!s||s.version!==1)throw new Error('不支持的存档版本，原文件已保留');
  if(!Number.isFinite(s.lastAt)||!Number.isSafeInteger(s.sequence)||!Number.isFinite(s.seed)||!Array.isArray(s.fields)||!s.fields.length||!Array.isArray(s.batches)||!Array.isArray(s.jobs)||!Array.isArray(s.events)||!Array.isArray(s.notices)||!Array.isArray(s.learnedRecipes))throw new Error('存档结构不完整');
  for(const k of ['customItems','customRecipes','customCrops'])if(!s[k]||typeof s[k]!=='object'||Array.isArray(s[k]))throw new Error(`存档缺少 ${k}`);
  if(!s.pet||!s.trip||!s.weather||!s.market||!Array.isArray(s.market.stock))throw new Error('存档缺少人物、行程、天气或集市');
  // Existing 1.0.0 farms predate husbandry; add empty animal records without resetting any previous progress.
  s.animals??=[];s.livestock??={setupGranted:false,nextFeedingAt:s.lastAt+3_600_000,spoiledFeedG:0,pendingProduce:[],shipmentSequence:0};
  s.livestock.pendingProduce??=[];s.livestock.feedBinG??=0;s.livestock.feedBinAgeHours??=0;s.market.pendingGoods??=[];s.market.porterJobs??=[];s.market.pendingAnimals??=[];
  s.diary??={entries:[],notes:[],nextAt:null};
  if(!Array.isArray(s.diary.entries)||!Array.isArray(s.diary.notes)||s.diary.nextAt!==null&&!Number.isFinite(s.diary.nextAt))throw new Error('日记存档异常');
  const diaryDates=new Set();for(const d of s.diary.entries){if(typeof d.date!=='string'||diaryDates.has(d.date)||typeof d.text!=='string'||!Number.isFinite(d.at))throw new Error('日记条目异常');diaryDates.add(d.date);}
  s.trip.followers??=[];s.trip.purchasedAnimals??=[];s.trip.transportGrams??=0;
  if(!Array.isArray(s.animals)||!Array.isArray(s.trip.followers)||!Array.isArray(s.market.pendingGoods)||!Array.isArray(s.market.porterJobs))throw new Error('养殖存档结构异常');
  for(const k of ['satiety','joy','health','energy','hydration','hygiene','social','warmth'])if(!Number.isFinite(s.pet[k])||s.pet[k]<0||s.pet[k]>100)throw new Error(`人物 ${k} 数据异常`);
  for(const k of ['coins','carriedCoins','waterLiters','fuelMinutes','trashTotalG'])if(!Number.isFinite(s[k])||s[k]<0)throw new Error(`存档 ${k} 数据异常`);
  if(!['home','market','outbound','returning'].includes(s.trip.phase))throw new Error('存档行程异常');
  if(['outbound','returning'].includes(s.trip.phase)&&!Number.isFinite(s.trip.arriveAt))throw new Error('存档缺少抵达时间');
  const {items,crops,recipes}=catalogFor(s),ids=new Set();
  for(const b of s.batches) {
    if(ids.has(b.id)||!items[b.itemId]||!Number.isSafeInteger(b.quantity)||b.quantity<=0||!Number.isFinite(b.ageHours)||b.ageHours<0||!Number.isFinite(b.createdAt)||!['pantry','granary','fridge','cellar','shed','trash','bag','doorstep'].includes(b.container))throw new Error('存档库存批次异常');ids.add(b.id);
  }
  for(const f of s.fields) {if(f.cropId&&!crops[f.cropId])throw new Error('田间存在未知作物');for(const k of ['progress','moisture','fertility','weeds','pests','health','waterlogging'])if(!Number.isFinite(f[k])||f[k]<0||f[k]>100)throw new Error('田块数值异常');}
  for(const j of s.jobs)if(!items[j.outputId]||!Number.isFinite(j.finishAt)||!Number.isFinite(j.outputG)||!Number.isSafeInteger(j.quantity)||j.quantity<1)throw new Error('存档厨房任务异常');
  const animalIds=new Set();for(const a of s.animals){if(animalIds.has(a.id)||!['chicken','duck','goose','cattle','sheep','pig','fish'].includes(a.species)||!['female','male'].includes(a.sex)||!['alive','dead'].includes(a.status)||!Number.isFinite(a.ageDays)||a.ageDays<0||!Number.isFinite(a.health)||a.health<0||a.health>100||!Number.isFinite(a.appetite)||a.appetite<0||a.appetite>100||(a.pregnancy&&(!Number.isFinite(a.pregnancy.dueAt)||a.sex!=='female')))throw new Error('存档动物异常');animalIds.add(a.id);}
  for(const p of s.market.pendingGoods)if(!items[p.itemId]||!Number.isSafeInteger(p.quantity)||p.quantity<1)throw new Error('代宰待托运货物异常');
  for(const p of [...s.market.porterJobs,...s.livestock.pendingProduce])if(!items[p.itemId]||!Number.isSafeInteger(p.quantity)||p.quantity<1||!Number.isFinite(p.createdAt)||!Number.isFinite(p.ageHours??0))throw new Error('托运或待收取物品异常');
  for(const id of s.learnedRecipes)if(!recipes[id])throw new Error('存在未知已学菜谱');
  return s;
}
export async function loadState(file) {
  let text;try{text=await readFile(file,'utf8');}catch(err){if(err.code==='ENOENT')return null;throw err;}
  try{return validateState(JSON.parse(text.replace(/^\uFEFF/,'')));}catch(err){
    const backup=`${file}.invalid-${Date.now()}`;await copyFile(file,backup);
    throw new Error(`存档无法读取，未覆盖原文件，另备份至 ${backup}：${err.message}`);
  }
}
export async function saveState(file,state) {
  validateState(state);await mkdir(dirname(file),{recursive:true});
  const temp=`${file}.tmp`,h=await open(temp,'w');try{await h.writeFile(JSON.stringify(state,null,2)+'\n','utf8');await h.sync();}finally{await h.close();}
  try{await copyFile(file,`${file}.bak`);}catch(err){if(err.code!=='ENOENT')throw err;}
  await rename(temp,file);
}
