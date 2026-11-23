import { writeFile } from 'node:fs/promises';
import { BASE_ITEMS,BASE_RECIPES,CROPS,METHODS,WORKSHOPS } from '../src/catalog.js';
let out='# 作物、物品与菜谱目录\n\n由 `node tools/catalog.mjs` 从源码生成。数量为一个销售单位，价格为金币；基准保质小时为常温模型，容器另乘老化倍率。\n\n## 作物\n\n|作物|现实近似天数|理想真实小时|每田基础产量|适宜水分|\n|---|---:|---:|---:|---:|\n';
for(const c of Object.values(CROPS))out+=`|${c.name}|${c.realDays}|${c.growHours}|${c.yieldUnits*BASE_ITEMS[c.product].g/1000} kg|${c.waterNeed}%|\n`;
out+='\n## 基础商品\n\n|ID|名称|单位g|单价|常温小时|饱腹|愉悦|可直接吃|固定作坊|\n|---|---|---:|---:|---:|---:|---:|---|---|\n';
for(const i of Object.values(BASE_ITEMS))out+=`|${i.id}|${i.name}|${i.g}|${i.price}|${i.shelfHours??'耐储存'}|${i.satiety}|${i.joy}|${i.rawEdible?'是':'否'}|${WORKSHOPS[i.workshop]??'流动商人'}|\n`;
out+='\n## 菜谱\n\n每份材料以下列克重展示，油盐等佐料包括在内。主人可在页面逐一修改新配方参数；内置配方见src/catalog.js。\n\n|菜名 / ID|方式/分钟|材料与调料|加水mL|成品g|保鲜h|饱腹/愉悦|初始掌握|\n|---|---|---|---:|---:|---:|---|---|\n';
for(const r of Object.values(BASE_RECIPES))out+=`|${r.name} / ${r.id}|${METHODS[r.method].name} ${r.minutes}分|${r.ingredients.map(x=>`${BASE_ITEMS[x.itemId].name}${x.quantity*BASE_ITEMS[x.itemId].g}g`).join('、')}|${r.waterMl}|${r.yieldGrams}|${r.shelfHours}|${r.satiety} / ${r.joy}|${r.starter?'是':'否'}|\n`;
await writeFile(new URL('../docs/CATALOG.md',import.meta.url),out);console.log('目录已生成');
