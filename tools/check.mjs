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
for(const path of [pkg.main,pkg.cortico.webUiClient,pkg.cortico.icon,pkg.cortico.describe,'LICENSE','README.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md'])await access(new URL(path,root));
assert.deepEqual(pkg.keywords,['cortico','cortico-world','game','companion']);
assert.equal(pkg.description,'田园烟火，我要给她完整的鱼生！\n\n🌱 作物种植：播种、浇水、收获，体验农耕乐趣。\n🐄 动物养殖：饲养动物，获取各类农产品。\n🍳 烹饪料理：使用食材制作丰富美食。\n🏡 家园经营：管理物资，打造温馨家园。\n🛒 自由交易：买卖商品，积累财富。\n🎒 物品储存：管理背包与仓库资源。\n💚 角色护理：关注角色状态与日常需求。');
assert.deepEqual(pkg.cortico.screenshots,Array.from({length:8},(_,i)=>`assets/screenshots/${i+1}.png`));
for(const path of pkg.cortico.screenshots)await access(new URL(path,root));
assert.deepEqual(pkg.cortico.tags,['game','companion']);
const s=newState(Date.now());validateState(s);const {items}=catalogFor(s),names=new Set();
for(const i of Object.values(items)){assert(!names.has(i.name),`重复物品名 ${i.name}`);names.add(i.name);assert(i.g>0&&i.price>0,`重量价格 ${i.id}`);}
for(const r of Object.values(BASE_RECIPES)){
  assert(r.ingredients.length);assert(METHODS[r.method]);assert(r.minutes>0&&r.shelfHours>0);
  const g=r.ingredients.reduce((n,x)=>{assert(items[x.itemId],`${r.id}: ${x.itemId}`);return n+items[x.itemId].g*x.quantity;},r.waterMl);
  assert(r.yieldGrams<=g,`${r.id} 凭空增加重量`);
}
for(const p of def.create({}).webUi().panels)assert.equal(typeof ui.panels[p.id].mount,'function');
const result=spawnSync(process.execPath,['--test',...['engine','market','world','catalog','livestock','diary'].map(n=>`test/${n}.test.mjs`)],{cwd:fileURLToPath(root),encoding:'utf8'});
process.stdout.write(result.stdout);process.stderr.write(result.stderr);assert.equal(result.status,0,'测试未通过');
console.log(`静态检查通过：${Object.keys(items).length} 商品、${Object.keys(BASE_RECIPES).length} 菜谱、9页面`);
