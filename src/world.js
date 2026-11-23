import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyAction } from './actions.js';
import { config, DEFAULTS } from './time.js';
import { advance, event, newState } from './simulation.js';
import { loadState, saveState } from './persistence.js';
import { snapshot } from './view.js';

const obj=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const str=description=>({type:'string',description});const number=(description,min=1,max=1000)=>({type:'number',description,minimum:min,maximum:max});
const integer=(description,min=1,max=1000)=>({...number(description,min,max),type:'integer'});
const cargo={type:'array',maxItems:100,items:obj({batchId:str('库存批次ID'),quantity:integer('件数')},['batchId','quantity'])};
const decl=(name,description,parameters,action=null)=>({name:`homestead_${name}`,description,parameters,tags:action?['write']:['read','snapshot'],action});
export const TOOL_DECLS=[
  decl('status','查看田园总览、人物饱腹/愉悦/健康/体力/水分/清洁/社交/保暖、天气、库存批次、菜谱与赶集行程。area=recipes仅返回已经掌握的菜谱；catalog列出已有商品供公告使用。',obj({area:{type:'string',enum:['overview','farm','inventory','kitchen','market','recipes','catalog']}})),
  decl('farm','在家管理田块。先开垦荒田，再播种；真实时间生长。浇水耗水，施肥耗库存，防虫耗药，洪水需排水。',obj({action:{type:'string',enum:['reclaim','sow','water','weed','fertilize','drain','pest','scarecrow','harvest','clear_field']},fieldId:str('田块ID'),cropId:str('仅播种时需要作物ID'),container:str('收获目标容器ID，可省略')},['action','fieldId']),'farm'),
  decl('cook','按已掌握菜谱烹饪，需要厨具、食材、调料、燃料与水；出锅前不可食用，成品会腐败。',obj({recipeId:str('已掌握菜谱ID'),quantity:integer('份数',1,6),container:str('成品容器，默认fridge')},['recipeId']),'cook'),
  decl('process','用手摇磨加工稻谷成大米或小麦成面粉，按80%出品；不能挽救变质原粮。',obj({itemId:{type:'string',enum:['paddy','wheat']},quantity:integer('百克原粮份数',5,100),container:str('目标容器，默认granary')},['itemId','quantity']),'process'),
  decl('eat','吃当前能取到的一批可直接食用食物，每次1–3份。新鲜度越低饱腹恢复越少；临期会损害愉悦和健康，完全腐败不可食用。',obj({batchId:str('库存批次ID'),quantity:integer('份数',1,3)},['batchId']),'eat'),
  decl('store','在家整理容器。move移动或卸背包，不重置腐败；discard将过期品放厨余桶；empty_trash清空，可选择堆肥。',obj({action:{type:'string',enum:['move','unpack','discard','empty_trash']},batchId:str('批次ID'),quantity:integer('数量'),container:str('目标容器ID'),compost:{type:'boolean'}},['action']),'store'),
  decl('care','照顾自己的真实生活需求：补水、打水、洗漱、休息、结束休息、玩耍或感冒服药。冷雨中户外玩耍会感冒，药物有6小时冷却。',obj({action:{type:'string',enum:['drink','fill_water','wash','rest','cancel_rest','play','medicine']},liters:number('打水升数',1,50),hours:number('休息小时',.25,12),outdoors:{type:'boolean'}},['action']),'care'),
  decl('depart','营业时从家里带货和金币赶集；金币0.5g/枚。只携带指定库存批次，已有背包物件也计重。负重越高路程越慢，可能赶到时闭市。',obj({coins:number('从家中携带的金币',0,1000000),items:cargo}),'depart'),
  decl('trade','到达开放的集市后买卖或以物易物。购买用stockId；出售或交换用offer列出背包批次与数量。交换超额价值不找零；只有随身金币和背包可用，买菜谱后才会掌握。',obj({mode:{type:'string',enum:['buy','sell','barter']},stockId:str('货架ID'),quantity:integer('购买数量'),offer:cargo},['mode']),'trade'),
  decl('notice','到开放的集市向管理员付2金币或足值随身物件，公告1–20种已有物品ID。次日商人优先带货，超载时按最轻优先使种类数最多；超额物件不找零。',obj({itemIds:{type:'array',minItems:1,maxItems:20,items:{type:'string'}},offer:cargo},['itemIds']),'notice'),
  decl('return','从集市返家，闭市也可以返程。行程取决于当前负重；到家金币入箱，货物仍在背包，需自己整理入库。',obj(),'return'),
];
export const PANELS=[['overview','田园总览'],['farm','田地与天气'],['kitchen','厨房与菜谱'],['storage','仓储与保鲜'],['market','赶集与公告'],['recipes','添加菜谱'],['items','添加物品']];
const panelMethods={overview:['care'],farm:['farm','fill_water'],kitchen:['cook','process','eat'],storage:['move','unpack','discard','empty_trash','eat'],market:['depart','return','trade','notice'],recipes:['add_recipe'],items:['add_item']};
const allowedFarm=new Set(['reclaim','sow','water','weed','fertilize','drain','pest','scarecrow','harvest','clear_field']);
const allowedCare=new Set(['drink','fill_water','wash','rest','cancel_rest','play','medicine']);
const allowedStore=new Set(['move','unpack','discard','empty_trash']);
const stage=p=>p.satiety<=0?4:p.satiety<=15?3:p.satiety<=35?2:p.satiety<=60?1:0;
export class HomesteadWorld {
  id='homestead';#state=null;#host=null;#timer=null;#queue=Promise.resolve();#started=false;#closing=false;
  constructor(opts={}) {this.cfg=opts.cfg??{...DEFAULTS};this.dataDir=opts.dataDir??process.cwd();this.packageDir=opts.packageDir??process.cwd();this.now=opts.now??(()=>Date.now());this.noTimer=opts.noTimer??false;}
  stateFile(){return join(this.dataDir,'homestead','state.json');}
  envPromptVars(){return {};}
  serial(fn){const p=this.#queue.then(fn);this.#queue=p.catch(()=>{});return p;}
  ensure(){if(!this.#started||this.#closing)throw new Error('田园烟火尚未启动，请在 World 页启用');}
  async #advanceSave() {
    const next=structuredClone(this.#state),cfg=config(this.cfg),now=this.now(),before=stage(next.pet);
    advance(next,now,cfg);if(stage(next.pet)>before)event(next,'hunger','肚子饿了，请查看库存与已掌握菜谱，优先吃新鲜食物。',now);
    await saveState(this.stateFile(),next);this.#state=next;
    return cfg;
  }
  async #deliver() {
    if(!this.#host?.pushEvent)return;
    const pending=this.#state.events.filter(e=>Number(e.id.slice(1))>(this.#state.deliveredSeq??0));
    for(const e of pending.slice(-8)) {
      try {await this.#host.pushEvent({type:e.type,source:this.id,senderKey:e.type,origin:'internal',ts:new Date(e.at).toISOString(),text:e.text,meta:e.meta},{trigger:'debounce'});}
      catch(err){this.#host.log?.warn?.('田园事件投递失败，将重试',{error:err.message});return;}
    }
    if(pending.length) {const next=structuredClone(this.#state);next.deliveredSeq=Number(pending.at(-1).id.slice(1));try{await saveState(this.stateFile(),next);this.#state=next;}catch(e){this.#host?.log?.warn?.('事件已送达但回执保存失败，重启可能重复通知',{error:e.message});}}
  }
  async act(name,args,owner=false) {
    return this.serial(async()=>{
      this.ensure();const cfg=await this.#advanceSave(),next=structuredClone(this.#state);
      const message=applyAction(next,name,args,this.now(),cfg,{owner});
      await saveState(this.stateFile(),next);this.#state=next;await this.#deliver();
      return {message,state:snapshot(this.#state,this.now(),cfg)};
    });
  }
  async read(){return this.serial(async()=>{this.ensure();const cfg=await this.#advanceSave();await this.#deliver();return snapshot(this.#state,this.now(),cfg);});}
  tools(){return TOOL_DECLS.map(({action,...decl})=>({...decl,handler:async(args={})=>{
    try {
      if(!action){const s=await this.read(),area=args.area??'overview';let value;
        if(area==='farm')value={fields:s.fields,weather:s.weather,waterLiters:s.waterLiters,crops:s.crops};
        else if(area==='inventory')value={batches:s.batches,containers:s.containers,coins:s.coins,carriedCoins:s.carriedCoins,trip:s.trip};
        else if(area==='recipes')value=s.recipes.filter(r=>r.learned);
        else if(area==='catalog')value=s.items.filter(i=>i.availableDay<=s.market.day).map(({id,name,g,price})=>({id,name,g,price}));
        else if(area==='market')value={market:s.market,trip:s.trip,coins:s.carriedCoins,bag:s.batches.filter(b=>b.container==='bag'),notices:s.notices};
        else if(area==='kitchen')value={jobs:s.jobs,fuelMinutes:s.fuelMinutes,waterLiters:s.waterLiters,recipes:s.recipes.filter(r=>r.learned)};
        else value={clock:s.clock,pet:s.pet,weather:s.weather,coins:s.coins,carriedCoins:s.carriedCoins,trip:s.trip,marketOpen:s.market.open,ripeFields:s.fields.filter(f=>f.progress>=100),jobs:s.jobs,events:s.events.slice(0,5)};
        return {text:JSON.stringify(value,null,2)};
      }
      let name=action;if(['farm','care','store'].includes(action)){const list=action==='farm'?allowedFarm:action==='care'?allowedCare:allowedStore;if(!list.has(args.action))throw new Error('无效子动作');name=args.action;}
      const res=await this.act(name,args,false);return {text:res.message};
    }catch(err){return {failed:true,text:`田园操作失败：${err.message}`};}
  }}));}
  async invoke(panel,method,args=[]) {
    if(!Object.hasOwn(panelMethods,panel))throw new Error('未知田园面板');
    if(method==='state')return this.#started?this.read():{started:false};
    if(!panelMethods[panel].includes(method))throw new Error('此面板不提供该方法');
    const a=Array.isArray(args)?args[0]??{}:args;let name=method;
    if(method==='farm'){if(!allowedFarm.has(a.action))throw new Error('无效田间动作');name=a.action;}
    if(method==='care'){if(!allowedCare.has(a.action))throw new Error('无效照料动作');name=a.action;}
    return this.act(name,a,true);
  }
  webUi(){const s=this.#state;return {label:'田园烟火',lamps:[{label:'田园世界',state:this.#started?'online':'offline'}],badges:[{label:'饱腹',value:s?Math.round(s.pet.satiety):'—',tone:'plain'},{label:'健康',value:s?Math.round(s.pet.health):'—',tone:'plain'},{label:'金币',value:s?Math.round((s.coins+s.carriedCoins)*100)/100:'—',tone:'plain'}],
    panels:PANELS.map(([id,title])=>({id,title,getMethods:[]})),invoke:(p,m,a)=>this.invoke(p,m,a),
    config:[{id:'homestead',owner:'world:homestead',title:'田园烟火',schema:{type:'object',properties:Object.fromEntries([
      ['timezone',{type:'string',title:'营业时区（IANA）'}],['growthMultiplier',{type:'number',minimum:.1,maximum:10,title:'作物生长倍率'}],['weatherEnabled',{type:'boolean',title:'随机天气'}],['hungerPerHour',{type:'number',minimum:0,maximum:20,title:'每小时饱腹消耗'}],['carryLimitKg',{type:'number',minimum:2,maximum:50,title:'健康时负重kg'}],['merchantCapacityKg',{type:'number',minimum:10,maximum:1000,title:'商人马车载重kg'}],['tickIntervalMs',{type:'number',minimum:5000,maximum:3600000,title:'结算间隔ms'}],
    ].map(([k,v])=>[`worlds.homestead.${k}`,{...v,'x-hot':true}]))}}],
    promptDocs:[{key:'worlds.homestead.env',title:'田园烟火',description:'种田、厨房、保鲜与赶集规则',path:fileURLToPath(new URL('./ENV_PROMPT.md',import.meta.url)),role:'envPrompt'}],
  };}
  async start(host) {
    return this.serial(async()=>{if(this.#started)return;this.#closing=false;this.#host=host;
      this.#state=await loadState(this.stateFile())??newState(this.now(),this.cfg);this.#started=true;
      try{await this.#advanceSave();await this.#deliver();this.#schedule();}catch(err){this.#started=false;this.#host=null;throw err;}
    });
  }
  #schedule(){if(!this.#started||this.noTimer||this.#closing)return;this.#timer=setTimeout(()=>{this.#timer=null;void this.serial(async()=>{if(!this.#started||this.#closing)return;await this.#advanceSave();await this.#deliver();}).catch(e=>this.#host?.log?.warn?.('田园结算失败',{error:e.message})).finally(()=>this.#schedule());},config(this.cfg).tickIntervalMs);this.#timer.unref?.();}
  async stop(){this.#closing=true;if(this.#timer){clearTimeout(this.#timer);this.#timer=null;}return this.serial(async()=>{if(this.#started){await this.#advanceSave();this.#started=false;}this.#host=null;});}
}
