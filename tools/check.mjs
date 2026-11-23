import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import def from '../src/index.js';
import { BASE_RECIPES, catalogFor, METHODS } from '../src/catalog.js';
import { newState } from '../src/simulation.js';
import { validateState } from '../src/persistence.js';
import ui from '../dist/webui.js';
const root=new URL('../',import.meta.url),pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
assert.equal(pkg.cortico.api,6);assert.equal(def.id,'homestead');assert.equal(def.defaults().enabled,false);
for(const path of [pkg.main,pkg.cortico.webUiClient,pkg.cortico.icon,pkg.cortico.describe,'LICENSE','README.md','THIRD_PARTY_NOTICES.md'])await access(new URL(path,root));
const s=newState(Date.now());validateState(s);const {items}=catalogFor(s),names=new Set();
for(const i of Object.values(items)){assert(!names.has(i.name),`重复物品名 ${i.name}`);names.add(i.name);assert(i.g>0&&i.price>0,`重量价格 ${i.id}`);}
for(const r of Object.values(BASE_RECIPES)){
  assert(r.ingredients.length);assert(METHODS[r.method]);assert(r.minutes>0&&r.shelfHours>0);
  const g=r.ingredients.reduce((n,x)=>{assert(items[x.itemId],`${r.id}: ${x.itemId}`);return n+items[x.itemId].g*x.quantity;},r.waterMl);
  assert(r.yieldGrams<=g,`${r.id} 凭空增加重量`);
}
for(const p of def.create({}).webUi().panels)assert.equal(typeof ui.panels[p.id].mount,'function');
const result=spawnSync(process.execPath,['--test',...['engine','market','world','catalog'].map(n=>`test/${n}.test.mjs`)],{cwd:fileURLToPath(root),encoding:'utf8'});
process.stdout.write(result.stdout);process.stderr.write(result.stderr);assert.equal(result.status,0,'测试未通过');
console.log(`静态检查通过：${Object.keys(items).length} 商品、${Object.keys(BASE_RECIPES).length} 菜谱、7页面`);
