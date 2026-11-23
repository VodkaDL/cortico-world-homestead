import { catalogFor, METHODS, WORKSHOPS } from './catalog.js';
import { requireNumber, requireText } from './time.js';
const kinds=new Set(['grain','vegetable','fruit','legume','seed','spice','oil','tea','egg','meat','dairy','processed','food','tool','kitchenware','material','fertilizer']);
const keys=new Set(['id','name','kind','g','price','shelfHours','satiety','joy','rawEdible','tags','workshop','crop']);
function object(v) { if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('请输入对象');return v; }
function identifier(id) { if(typeof id!=='string'||!/^[a-z][a-z0-9_]{1,47}$/.test(id)||['constructor','prototype','__proto__'].includes(id)||id.startsWith('dish_')||id.startsWith('recipe_')||id.startsWith('seed_'))throw new Error('ID 须为2–48位小写字母数字或下划线，不得使用系统保留前缀');return id; }
function normalize(s) { return s.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase(); }
export function validateItem(input,state) {
  const p=object(input),{items}=catalogFor(state);
  for(const k of Object.keys(p))if(!keys.has(k))throw new Error(`未知物品字段：${k}`);
  const id=identifier(p.id),name=requireText(p.name,'物品名称',60);
  if(Object.hasOwn(items,id)||Object.values(items).some(i=>normalize(i.name)===normalize(name)))throw new Error('该物品ID或名称已存在，不能重复添加');
  if(!kinds.has(p.kind))throw new Error('请选择有效物品分类');
  const g=requireNumber(p.g,'单位重量(g)',1,100_000),price=requireNumber(p.price,'单价(金币)',.01,1_000_000);
  if(Math.abs(price*100-Math.round(price*100))>1e-6)throw new Error('金币价格最多两位小数');
  const satiety=requireNumber(p.satiety??0,'饱腹值',0,100),joy=requireNumber(p.joy??0,'愉悦值',0,30);
  const edible=['food','fruit','vegetable','grain','legume','meat','egg','dairy','processed'].includes(p.kind);
  const shelfHours=p.shelfHours==null?null:requireNumber(p.shelfHours,'常温保质小时',.25,87_600);
  if(edible&&shelfHours===null)throw new Error('食材和食物必须填写常温保质期');
  if(!edible&&(satiety!==0||joy!==0||p.rawEdible===true))throw new Error('非食品不能填写食用效果');
  if(p.rawEdible!==undefined&&typeof p.rawEdible!=='boolean')throw new Error('能否直接食用必须为布尔值');
  if(['meat','egg'].includes(p.kind)&&p.rawEdible)throw new Error('生肉和生鸡蛋不能标记为可直接食用');
  const tags=p.tags??[];if(!Array.isArray(tags)||tags.length>8||tags.some(t=>typeof t!=='string'||! /^[a-z_]{1,24}$/.test(t)))throw new Error('标签须为不超过8个英文单词');
  const workshop=p.workshop||null;if(workshop&&!Object.hasOwn(WORKSHOPS,workshop))throw new Error('未知作坊');
  const matches={oil:p.kind==='oil',salt:p.kind==='spice'&&tags.some(t=>['salt','seasoning'].includes(t)),tea:p.kind==='tea'||(p.kind==='kitchenware'&&tags.includes('tea')&&/茶|tea/i.test(name)),tools:['tool','kitchenware','material'].includes(p.kind),crops:['fertilizer','seed'].includes(p.kind)||p.kind==='material'&&tags.some(t=>['pest','farm'].includes(t)),grocer:edible&&p.kind!=='food'};
  if(workshop&&!matches[workshop])throw new Error(`分类、名称或标签与${WORKSHOPS[workshop]}不匹配`);
  let crop;
  if(p.kind==='seed'){
    const c=object(p.crop),product=items[c.product];
    if(!product||!['grain','vegetable','fruit','legume'].includes(product.kind))throw new Error('新种子须选择已存在的谷物、蔬菜、水果或豆类为收获物');
    crop={id,seed:id,product:product.id,name:product.name,realDays:requireNumber(c.realDays,'现实生长天数',7,1000),growHours:requireNumber(c.growHours,'缩短后的生长小时',6,720),yieldUnits:requireNumber(c.yieldUnits,'每田收获单位',1,100,true),waterNeed:requireNumber(c.waterNeed,'适宜水分',20,90),stages:['萌芽','幼苗','营养生长','开花结实','成熟']};
  }else if(p.crop!==undefined)throw new Error('只有种子可以填写作物生长属性');
  return {id,name,kind:p.kind,g,price,shelfHours,satiety,joy,rawEdible:p.rawEdible===true,tags:[...new Set(tags)],workshop,...(crop?{crop}:{} )};
}
export function validateRecipe(input,state) {
  const p=object(input),{items,recipes}=catalogFor(state),allowed=new Set(['id','name','method','minutes','ingredients','waterMl','yieldGrams','shelfHours','satiety','joy','price','steps']);
  for(const k of Object.keys(p))if(!allowed.has(k))throw new Error(`未知菜谱字段：${k}`);
  const id=identifier(p.id),name=requireText(p.name,'菜名',60);
  if(Object.hasOwn(recipes,id)||Object.values(recipes).some(r=>normalize(r.name)===normalize(name)))throw new Error('该菜谱ID或名称已存在');
  if(!Object.hasOwn(METHODS,p.method))throw new Error('请选择蒸、炒、煮、炸、烤或凉拌');
  const minutes=requireNumber(p.minutes,'烹饪分钟',1,240),waterMl=requireNumber(p.waterMl??0,'加水毫升',0,3000);
  const shelfHours=requireNumber(p.shelfHours,'常温保质小时',.25,720),satiety=requireNumber(p.satiety,'饱腹值',0,100),joy=requireNumber(p.joy,'愉悦值',0,30);
  const price=requireNumber(p.price,'成品参考价',.01,1_000_000);
  if(Math.abs(price*100-Math.round(price*100))>1e-6)throw new Error('金币价格最多两位小数');
  if(!Array.isArray(p.ingredients)||!p.ingredients.length||p.ingredients.length>20)throw new Error('每份菜谱须有1–20种食材');
  const seen=new Set();const ingredients=p.ingredients.map(x=>{
    object(x);const i=items[x.itemId];if(!i||['recipe','tool','kitchenware','material','fertilizer','seed'].includes(i.kind))throw new Error(`无效食材：${x.itemId}`);
    if(seen.has(i.id))throw new Error('同一食材请合并数量');seen.add(i.id);
    if(p.method==='cold'&&!i.rawEdible&&!['spice','oil','tea'].includes(i.kind))throw new Error(`${i.name}不能用于免加热凉拌`);
    return {itemId:i.id,quantity:requireNumber(x.quantity,'食材份数',1,100,true)};
  });
  const maxG=ingredients.reduce((n,x)=>n+items[x.itemId].g*x.quantity,0)+waterMl;
  const yieldGrams=requireNumber(p.yieldGrams,'成品克重',1,5000);if(yieldGrams>maxG)throw new Error('成品重量不能超过食材与加水总重量');
  if(!Array.isArray(p.steps)||!p.steps.length||p.steps.length>20)throw new Error('请填写1–20条烹饪步骤');
  const steps=p.steps.map(x=>requireText(x,'步骤',240));
  return {id,name,method:p.method,minutes,ingredients,waterMl,yieldGrams,shelfHours,satiety,joy,price,steps,starter:false};
}
