import { mkdir, readFile, rename, copyFile, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { catalogFor } from './catalog.js';

export function validateState(s) {
  if(!s||s.version!==1)throw new Error('不支持的存档版本，原文件已保留');
  if(!Number.isFinite(s.lastAt)||!Number.isSafeInteger(s.sequence)||!Number.isFinite(s.seed)||!Array.isArray(s.fields)||!s.fields.length||!Array.isArray(s.batches)||!Array.isArray(s.jobs)||!Array.isArray(s.events)||!Array.isArray(s.notices)||!Array.isArray(s.learnedRecipes))throw new Error('存档结构不完整');
  for(const k of ['customItems','customRecipes','customCrops'])if(!s[k]||typeof s[k]!=='object'||Array.isArray(s[k]))throw new Error(`存档缺少 ${k}`);
  if(!s.pet||!s.trip||!s.weather||!s.market||!Array.isArray(s.market.stock))throw new Error('存档缺少人物、行程、天气或集市');
  for(const k of ['satiety','joy','health','energy','hydration','hygiene','social','warmth'])if(!Number.isFinite(s.pet[k])||s.pet[k]<0||s.pet[k]>100)throw new Error(`人物 ${k} 数据异常`);
  for(const k of ['coins','carriedCoins','waterLiters','fuelMinutes','trashTotalG'])if(!Number.isFinite(s[k])||s[k]<0)throw new Error(`存档 ${k} 数据异常`);
  if(!['home','market','outbound','returning'].includes(s.trip.phase))throw new Error('存档行程异常');
  if(['outbound','returning'].includes(s.trip.phase)&&!Number.isFinite(s.trip.arriveAt))throw new Error('存档缺少抵达时间');
  const {items,crops,recipes}=catalogFor(s),ids=new Set();
  for(const b of s.batches) {
    if(ids.has(b.id)||!items[b.itemId]||!Number.isSafeInteger(b.quantity)||b.quantity<=0||!Number.isFinite(b.ageHours)||b.ageHours<0||!Number.isFinite(b.createdAt)||!['pantry','granary','fridge','cellar','shed','trash','bag'].includes(b.container))throw new Error('存档库存批次异常');ids.add(b.id);
  }
  for(const f of s.fields) {if(f.cropId&&!crops[f.cropId])throw new Error('田间存在未知作物');for(const k of ['progress','moisture','fertility','weeds','pests','health','waterlogging'])if(!Number.isFinite(f[k])||f[k]<0||f[k]>100)throw new Error('田块数值异常');}
  for(const j of s.jobs)if(!items[j.outputId]||!Number.isFinite(j.finishAt)||!Number.isFinite(j.outputG)||!Number.isSafeInteger(j.quantity)||j.quantity<1)throw new Error('存档厨房任务异常');
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
