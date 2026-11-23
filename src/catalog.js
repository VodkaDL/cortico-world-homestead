import { PRODUCTS, SPECIES } from './livestock.js';

/** 数量均以一个销售单位计；g / price 为该单位的重量 / 金币价格。 */
export const WORKSHOPS = {
  oil: '油坊', salt: '盐坊', tea: '茶坊', tools: '器具坊', crops: '作物坊', grocer: '食材坊', livestock:'畜牧坊',
};
export const METHODS = {
  steam: { name: '蒸', tool: 'steamer' }, stir: { name: '炒', tool: 'wok' },
  boil: { name: '煮', tool: 'pot' }, fry: { name: '炸', tool: 'fryer' },
  bake: { name: '烤', tool: 'oven' }, cold: { name: '凉拌', tool: 'knife' },
};
// 现实天数、缩短后理想小时数、百克产量单位、常温保鲜小时、每百克饱腹、口感。
const cropRows = [
  ['paddy','水稻','grain',120,96,28,2160,12,0],
  ['wheat','小麦','grain',120,96,26,2160,12,0],
  ['corn','玉米','grain',85,68,22,48,9,2],
  ['potato','土豆','vegetable',90,72,28,336,8,1],
  ['sweet_potato','红薯','vegetable',110,88,30,336,9,3],
  ['tomato','番茄','vegetable',75,60,22,72,2,3],
  ['cucumber','黄瓜','vegetable',55,44,22,48,2,2],
  ['eggplant','茄子','vegetable',80,64,20,72,3,1],
  ['pepper','青椒','vegetable',75,60,18,96,2,2],
  ['cabbage','白菜','vegetable',65,52,32,96,2,1],
  ['spinach','菠菜','vegetable',35,28,14,24,2,1],
  ['lettuce','生菜','vegetable',40,32,14,24,2,2],
  ['carrot','胡萝卜','vegetable',75,60,24,168,4,2],
  ['radish','白萝卜','vegetable',40,32,28,120,3,1],
  ['onion','洋葱','vegetable',100,80,24,720,4,1],
  ['pumpkin','南瓜','vegetable',100,80,38,720,5,3],
  ['broccoli','西兰花','vegetable',70,56,18,48,3,2],
  ['cauliflower','花菜','vegetable',75,60,20,48,3,1],
  ['celery','芹菜','vegetable',80,64,16,72,2,1],
  ['beans','四季豆','legume',55,44,18,48,4,1],
  ['peas','豌豆','legume',65,52,16,48,8,2],
  ['soybean','黄豆','legume',100,80,20,1440,15,0],
  ['peanut','花生','legume',120,96,18,1440,22,3],
  ['watermelon','西瓜','fruit',85,68,50,168,3,5],
  ['strawberry','草莓','fruit',90,72,14,24,3,6],
  ['melon','甜瓜','fruit',80,64,32,120,4,5],
  ['ginger','生姜','vegetable',150,120,16,336,1,0],
  ['garlic','大蒜','vegetable',120,96,18,720,1,0],
  ['scallion','小葱','vegetable',40,32,12,48,1,1],
  ['sesame','芝麻','grain',95,76,14,1440,20,2],
];
const prices = { paddy:.35,wheat:.4,corn:.65,potato:.45,sweet_potato:.6,tomato:.8,cucumber:.6,eggplant:.7,pepper:1,cabbage:.3,spinach:1,lettuce:.8,carrot:.5,radish:.3,onion:.45,pumpkin:.4,broccoli:1.2,cauliflower:.8,celery:.8,beans:1.2,peas:1.6,soybean:.7,peanut:1.2,watermelon:.35,strawberry:3,melon:.8,ginger:1.5,garlic:1.5,scallion:1,sesame:1.8 };
const unsafeRaw = new Set(['paddy','wheat','potato','eggplant','beans','soybean','sesame']);
export const CROPS = Object.fromEntries(cropRows.map(([id,name,kind,realDays,growHours,yieldUnits]) => [id, {
  id,name,product:id,seed:`seed_${id}`,realDays,growHours,yieldUnits:yieldUnits*(['ginger','garlic','scallion'].includes(id)?10:1),
  waterNeed:id==='paddy'?70:45,stages:['萌芽','幼苗','营养生长','开花结实','成熟'],
}]));
function item(id,name,kind,g,price,extra={}) { return {id,name,kind,g,price:Math.round((price+Number.EPSILON)*100)/100,shelfHours:null,satiety:0,joy:0,rawEdible:false,tags:[],workshop:null,availableDay:'0000-00-00',...extra}; }
const items = [];
for (const [id,name,kind,, , ,shelfHours,satiety,joy] of cropRows) {
  const aromatic=['ginger','garlic','scallion'].includes(id);
  items.push(item(id,name,kind,aromatic?10:100,aromatic?prices[id]/10:prices[id], {shelfHours,satiety:aromatic?satiety/10:satiety,joy,rawEdible:!unsafeRaw.has(id),workshop:'grocer',tags:[kind]}));
  items.push(item(`seed_${id}`,`${name}种子（每包一田）`,'seed',20,Math.max(1.5,prices[id]*3),{shelfHours:8760,workshop:'crops',tags:['seed'],cropId:id}));
}
items.push(
  item('rice','大米','grain',100,.65,{shelfHours:2160,satiety:13,tags:['grain'],workshop:'grocer'}),
  item('flour','面粉','processed',100,.6,{shelfHours:1440,satiety:13,tags:['grain'],workshop:'grocer'}),
  item('noodles','面条','processed',100,1.2,{shelfHours:720,satiety:14,tags:['grain'],workshop:'grocer'}),
  item('yeast','烘焙酵母','processed',5,.3,{shelfHours:2160,tags:['baking'],workshop:'grocer'}),
  item('tofu','豆腐','processed',100,.8,{shelfHours:6,satiety:5,rawEdible:false,tags:['soy'],workshop:'grocer'}),
  item('egg','鸡蛋','egg',60,1,{shelfHours:72,satiety:7,workshop:'grocer'}),
  item('pork','猪肉','meat',100,3.5,{shelfHours:2,satiety:12,workshop:'grocer'}),
  item('chicken','鸡肉','meat',100,2.5,{shelfHours:2,satiety:11,workshop:'grocer'}),
  item('fish','鲜鱼','meat',100,2.8,{shelfHours:2,satiety:9,workshop:'grocer'}),
  item('beef','牛肉','meat',100,8,{shelfHours:2,satiety:13,workshop:'grocer'}),
  item('duck_meat','鸭肉','meat',100,3.1,{shelfHours:2,satiety:11,workshop:'grocer'}),
  item('goose_meat','鹅肉','meat',100,4.6,{shelfHours:2,satiety:12,workshop:'grocer'}),
  item('lamb','羊肉','meat',100,5.2,{shelfHours:2,satiety:12,workshop:'grocer'}),
  item('duck_egg','鸭蛋','egg',70,1.6,{shelfHours:96,satiety:9,workshop:'grocer'}),
  item('goose_egg','鹅蛋','egg',150,3.5,{shelfHours:120,satiety:14,workshop:'grocer'}),
  item('offal_chicken','鸡杂','meat',100,1.1,{shelfHours:1,satiety:11,workshop:'grocer'}),
  item('offal_duck','鸭内脏','meat',100,1.5,{shelfHours:1,satiety:11,workshop:'grocer'}),
  item('offal_goose','鹅内脏','meat',100,2,{shelfHours:1,satiety:11,workshop:'grocer'}),
  item('offal_cattle','牛杂','meat',100,1.8,{shelfHours:1,satiety:11,workshop:'grocer'}),
  item('offal_sheep','羊杂','meat',100,1.3,{shelfHours:1,satiety:11,workshop:'grocer'}),
  item('offal_pig','猪杂','meat',100,1.5,{shelfHours:1,satiety:11,workshop:'grocer'}),
  item('milk','巴氏鲜奶','dairy',250,3,{shelfHours:2,satiety:9,rawEdible:true,workshop:'grocer'}),
  item('raw_milk','生鲜牛乳（需煮沸）','dairy',250,2,{shelfHours:1,satiety:9,rawEdible:false,workshop:'grocer'}),
  item('wool','羊毛','processed',100,.45,{tags:['animal_product'],workshop:'grocer'}),
  item('feather','禽羽','processed',100,.1,{tags:['animal_product'],workshop:'grocer'}),
  item('fat_chicken','禽脂','oil',100,.2,{shelfHours:240,tags:['animal_product'],workshop:'grocer'}),
  item('fat_duck','鸭脂','oil',100,.24,{shelfHours:240,tags:['animal_product'],workshop:'grocer'}),
  item('fat_goose','鹅脂','oil',100,.3,{shelfHours:240,tags:['animal_product'],workshop:'grocer'}),
  item('fat_cattle','牛脂','oil',100,.35,{shelfHours:240,tags:['animal_product'],workshop:'grocer'}),
  item('fat_sheep','羊脂','oil',100,.3,{shelfHours:240,tags:['animal_product'],workshop:'grocer'}),
  item('fat_pig','猪油','oil',100,.3,{shelfHours:240,tags:['animal_product'],workshop:'grocer'}),
  item('hide_chicken','禽皮','processed',100,.2,{tags:['animal_product'],workshop:'grocer'}),
  item('hide_duck','鸭皮','processed',100,.24,{tags:['animal_product'],workshop:'grocer'}),
  item('hide_goose','鹅皮','processed',100,.35,{tags:['animal_product'],workshop:'grocer'}),
  item('hide_cattle','牛皮','processed',100,.55,{tags:['animal_product'],workshop:'grocer'}),
  item('hide_sheep','羊皮','processed',100,.45,{tags:['animal_product'],workshop:'grocer'}),
  item('hide_pig','猪皮','processed',100,.28,{tags:['animal_product'],workshop:'grocer'}),
  item('bone_cattle','牛骨','meat',100,.16,{shelfHours:2,tags:['animal_product'],workshop:'grocer'}),
  item('mushroom','蘑菇','vegetable',100,1.5,{shelfHours:24,satiety:3,workshop:'grocer'}),
  item('oil','菜籽油','oil',10,.18,{shelfHours:2160,tags:['oil'],workshop:'oil'}),
  item('sesame_oil','香油','oil',10,.6,{shelfHours:2160,tags:['oil'],workshop:'oil'}),
  item('salt','食盐','spice',2,.01,{tags:['salt','seasoning'],workshop:'salt'}),
  item('sugar','白糖','spice',10,.1,{shelfHours:4320,tags:['seasoning'],workshop:'salt'}),
  item('soy_sauce','酱油','spice',10,.15,{shelfHours:2160,tags:['seasoning'],workshop:'salt'}),
  item('vinegar','米醋','spice',10,.12,{shelfHours:4320,tags:['seasoning'],workshop:'salt'}),
  item('chili','干辣椒','spice',5,.3,{shelfHours:2160,tags:['seasoning'],workshop:'salt'}),
  item('black_pepper','黑胡椒','spice',1,.12,{shelfHours:2160,tags:['seasoning'],workshop:'salt'}),
  item('tea','绿茶','tea',3,.6,{shelfHours:2160,tags:['tea'],workshop:'tea'}),
  item('black_tea','红茶','tea',3,.75,{shelfHours:4320,tags:['tea'],workshop:'tea'}),
  item('fertilizer','有机肥','fertilizer',200,2,{tags:['fertilizer'],workshop:'crops'}),
  item('pest_control','生物防虫剂','material',100,5,{tags:['pest'],workshop:'crops'}),
  item('fuel','厨房燃料包（可用60分钟）','material',200,2,{tags:['fuel'],workshop:'tools'}),
  item('medicine','感冒药（一份）','material',20,8,{tags:['medicine']}),
  item('livestock_feed','青贮与精饲料（1kg）','feed',1000,.55,{shelfHours:720,tags:['livestock','feed'],workshop:'livestock'}),
  item('animal_medicine','兽药（一疗程）','veterinary',100,3,{tags:['medicine','livestock'],workshop:'livestock'}),
  item('animal_supplement','矿物质补充料（100g）','feed',100,.35,{shelfHours:2160,tags:['feed','livestock'],workshop:'livestock'}),
  item('butcher_kit','屠宰工具与卫生套件','tool',2400,85,{tags:['butcher','livestock'],workshop:'tools'}),
);
for (const [id,name,kind,g,price,tags] of [
  ['hoe','锄头','tool',1400,28,['farm']],['watering_can','浇水壶','tool',500,18,['farm']],
  ['sickle','镰刀','tool',400,15,['farm']],['scarecrow','稻草人材料包','tool',600,12,['farm']],
  ['knife','菜刀和砧板','kitchenware',900,35,['kitchen']],['pot','汤锅','kitchenware',1500,55,['kitchen']],
  ['wok','炒锅','kitchenware',1800,65,['kitchen']],['steamer','蒸锅','kitchenware',2200,80,['kitchen']],
  ['fryer','炸锅','kitchenware',2500,110,['kitchen']],['oven','小烤箱','kitchenware',4500,260,['kitchen']],
  ['hand_mill','手摇磨谷机','tool',2800,85,['processing']],['tea_set','茶具','kitchenware',600,45,['tea','kitchen']],
]) items.push(item(id,name,kind,g,price,{workshop:id==='tea_set'?'tea':'tools',tags}));
for(const i of items){if(i.id.startsWith('hide_')||['wool','feather'].includes(i.id))i.kind='byproduct';if(i.id.startsWith('offal_')||i.id.startsWith('fat_')||['hide_chicken','hide_duck','hide_goose','feather'].includes(i.id)){i.g=10;i.price=Math.max(.01,Math.round(i.price*10)/100);}}
for(const [species,s] of Object.entries(PRODUCTS))for(const sex of s.sexes)items.push(item(`livestock_${species}_${sex}`,`${SPECIES[species][sex]}（${s.unit}）`,'animal',s.weight,s.price,{workshop:'livestock',tags:['livestock',species],species,sex,liveWeightG:s.weight}));
export const BASE_ITEMS = Object.fromEntries(items.map(i=>[i.id,i]));

// 每个配方显式列出材料、调料、方式及分钟；不是任意食材笛卡尔积。
const recipes = [];
function recipe(id,name,method,minutes,ingredients,extra={}) {
  const entries = Object.entries(ingredients).map(([itemId,quantity])=>({itemId,quantity}));
  const inputG = entries.reduce((s,x)=>s+BASE_ITEMS[x.itemId].g*x.quantity,0);
  const waterMl = extra.waterMl??(method==='boil'?250:method==='steam'?180:0);
  const prepare='按配方称量食材与佐料，清洗、切配；生熟器具分开';
  const techniques={steam:[`在蒸锅内加入配方用水，将食材摆盘，盖盖上汽`,`以中火蒸${extra.minutes??minutes}分钟，确认熟透后出锅`],boil:[`将食材与配方用水加入汤锅，煮开后转小火`,`煮${extra.minutes??minutes}分钟至食材熟透，按配方调味`],stir:[`炒锅热油，依次下入需加热的主料和配料`,`中火翻炒约${extra.minutes??minutes}分钟；四季豆等务必炒熟，最后调味`],fry:[`食材沥干，按配方裹粉或蛋液，炸锅中加油加热`,`分批炸约${extra.minutes??minutes}分钟至内外熟透，捞出沥油并调味`],bake:[`烤箱预热至180℃，食材或面坯放入烤盘`,`烤约${extra.minutes??minutes}分钟至熟，面包配方时间包括整形与醒发`],cold:[`只使用适合生食的食材，清洗后切成适口大小`,`加入配方调料拌匀，约${extra.minutes??minutes}分钟完成，尽快食用`]};
  const defaultOutput=method==='steam'?Math.round(inputG+(extra.waterMl?waterMl*.8:0)):method==='boil'?Math.round(inputG+waterMl*.7):Math.round(inputG*.95+waterMl*.7);
  recipes.push({id,name,method,minutes,ingredients:entries,waterMl,yieldGrams:defaultOutput,shelfHours:method==='cold'?2:4,satiety:Math.min(65,Math.round(entries.reduce((s,x)=>s+BASE_ITEMS[x.itemId].satiety*x.quantity,0)*1.12)),joy:7,price:Math.max(2,Math.round(entries.reduce((s,x)=>s+BASE_ITEMS[x.itemId].price*x.quantity,0)*1.7*100)/100),starter:false,availableDay:'0000-00-00',steps:[prepare,...techniques[method]],...extra});
}
recipe('plain_rice','白米饭','steam',25,{rice:1},{starter:true,waterMl:150,yieldGrams:220,satiety:26,joy:2});
recipe('rice_porridge','白米粥','boil',30,{rice:1},{starter:true,waterMl:400,yieldGrams:450,satiety:24,joy:3});
recipe('steam_potato','蒸土豆','steam',25,{potato:2},{starter:true,satiety:22});
recipe('boiled_corn','水煮玉米','boil',18,{corn:2},{starter:true,satiety:24});
recipe('tomato_egg','番茄炒蛋','stir',8,{tomato:2,egg:2,oil:1,salt:1},{starter:true,joy:9});
recipe('cucumber_salad','拍黄瓜','cold',5,{cucumber:2,garlic:1,salt:1,vinegar:1,sesame_oil:1},{starter:true});
for (const [id,label] of [['cabbage','白菜'],['spinach','菠菜'],['lettuce','生菜'],['broccoli','西兰花'],['cauliflower','花菜'],['celery','芹菜'],['pepper','青椒'],['eggplant','茄子'],['beans','四季豆'],['carrot','胡萝卜'],['onion','洋葱'],['peas','豌豆'],['pumpkin','南瓜'],['potato','土豆']]) {
  recipe(`stir_${id}`,`清炒${label}`,'stir',id==='beans'?15:8,{[id]:2,oil:1,salt:1});
  recipe(`garlic_${id}`,`蒜香${label}`,'stir',id==='beans'?16:10,{[id]:2,garlic:1,oil:1,salt:1,soy_sauce:1},{joy:8});
}
for (const [id,label] of [['pumpkin','南瓜'],['sweet_potato','红薯'],['corn','玉米'],['carrot','胡萝卜'],['potato','土豆']]) {
  recipe(`steam_${id}_plate`,`清蒸${label}`,'steam',25,{[id]:3},{joy:5});
  recipe(`rice_${id}`,`${label}焖饭`,'steam',30,{rice:1,[id]:1,salt:1},{waterMl:180,joy:8});
  recipe(`porridge_${id}`,`${label}粥`,'boil',30,{rice:1,[id]:1},{waterMl:350,joy:6});
}
recipe('egg_custard','鸡蛋羹','steam',12,{egg:2,salt:1},{waterMl:120,joy:8});
recipe('egg_fried_rice','蛋炒饭','stir',12,{rice:1,egg:2,scallion:1,oil:2,salt:1},{steps:['先将大米蒸熟','打散鸡蛋，切葱','下油炒蛋后加入米饭翻炒'],minutes:35,waterMl:140});
recipe('yangzhou_rice','什锦炒饭','stir',38,{rice:1,egg:1,carrot:1,peas:1,oil:2,salt:1},{waterMl:140,joy:12});
recipe('tomato_noodles','番茄鸡蛋面','boil',15,{noodles:1,tomato:1,egg:1,salt:1,oil:1});
recipe('mushroom_noodles','鲜菇汤面','boil',15,{noodles:1,mushroom:2,salt:1,soy_sauce:1});
recipe('beef_noodles','牛肉汤面','boil',45,{noodles:1,beef:1,radish:1,salt:1,soy_sauce:1},{joy:14});
recipe('scallion_noodles','葱油拌面','boil',15,{noodles:1,scallion:1,oil:2,soy_sauce:1});
recipe('tomato_soup','番茄蛋花汤','boil',12,{tomato:2,egg:1,salt:1});
recipe('radish_soup','萝卜清汤','boil',25,{radish:2,scallion:1,salt:1});
recipe('corn_chicken_soup','玉米鸡汤','boil',50,{corn:1,chicken:2,ginger:1,salt:1},{joy:13});
recipe('mushroom_chicken','香菇炖鸡','boil',45,{chicken:2,mushroom:2,ginger:1,salt:1,soy_sauce:1},{joy:14});
recipe('beef_potato','土豆炖牛肉','boil',55,{beef:2,potato:2,carrot:1,soy_sauce:1,salt:1},{joy:15});
recipe('cabbage_tofu','白菜炖豆腐','boil',20,{cabbage:2,tofu:2,salt:1,oil:1});
recipe('mapo_tofu','家常麻婆豆腐','stir',15,{tofu:2,pork:1,chili:1,oil:2,soy_sauce:1,salt:1},{joy:12});
recipe('fried_tofu','香煎豆腐','stir',12,{tofu:2,oil:2,salt:1,soy_sauce:1});
recipe('pepper_pork','青椒肉丝','stir',12,{pepper:2,pork:1,oil:1,salt:1,soy_sauce:1},{joy:10});
recipe('celery_pork','芹菜炒肉','stir',12,{celery:2,pork:1,oil:1,salt:1});
recipe('onion_beef','洋葱炒牛肉','stir',12,{onion:2,beef:1,oil:1,salt:1,black_pepper:1},{joy:12});
recipe('kungpao','家常宫保鸡丁','stir',18,{chicken:2,peanut:1,cucumber:1,oil:2,chili:1,sugar:1,soy_sauce:1},{joy:15});
recipe('fish_steam','清蒸鱼','steam',18,{fish:3,ginger:1,scallion:1,soy_sauce:1},{joy:13});
recipe('fish_soup','鱼片豆腐汤','boil',20,{fish:2,tofu:2,ginger:1,salt:1},{joy:11});
recipe('braised_eggplant','红烧茄子','stir',16,{eggplant:2,oil:2,garlic:1,soy_sauce:1,sugar:1});
recipe('sour_potato','醋溜土豆丝','stir',12,{potato:2,oil:1,vinegar:1,chili:1,salt:1});
recipe('three_fresh','地三鲜','stir',18,{potato:1,eggplant:1,pepper:1,oil:3,soy_sauce:1,salt:1},{joy:11});
recipe('fries','炸薯条','fry',18,{potato:3,oil:8,salt:1},{joy:10});
recipe('fried_chicken','香酥炸鸡','fry',25,{chicken:2,flour:1,egg:1,oil:10,salt:1,black_pepper:1},{joy:15});
recipe('tempura','时蔬天妇罗','fry',20,{pumpkin:1,carrot:1,eggplant:1,flour:1,egg:1,oil:10,salt:1},{joy:12});
recipe('fried_peanut','油炸花生米','fry',10,{peanut:2,oil:4,salt:1},{joy:8});
recipe('fried_dough','家常小油条','fry',30,{flour:2,egg:1,oil:10,salt:1},{waterMl:80,joy:10});
recipe('roast_sweet_potato','烤红薯','bake',50,{sweet_potato:3},{joy:10});
recipe('roast_potato','黑椒烤土豆','bake',35,{potato:3,oil:2,salt:1,black_pepper:1},{joy:9});
recipe('roast_corn','香烤玉米','bake',25,{corn:2,oil:1,salt:1},{joy:9});
recipe('roast_pumpkin','蜜糖烤南瓜','bake',30,{pumpkin:3,sugar:2,oil:1},{joy:10});
recipe('milk_bread','牛奶小面包','bake',75,{flour:2,milk:1,egg:1,sugar:2,oil:2,yeast:1},{joy:13,shelfHours:24,steps:['混合面粉、牛奶、鸡蛋、糖、油和酵母，揉成面团','保温醒发45分钟并整形','烤箱预热180℃，烤约25分钟至内外熟透']});
recipe('sesame_cookie','芝麻薄饼','bake',30,{flour:1,sesame:1,egg:1,sugar:2,oil:2},{joy:11,shelfHours:72});
recipe('tomato_salad','糖拌番茄','cold',3,{tomato:2,sugar:1},{joy:8});
recipe('fruit_salad','时令水果拼盘','cold',5,{watermelon:2,strawberry:1,melon:1},{joy:12});
recipe('lettuce_salad','田园生菜沙拉','cold',6,{lettuce:2,cucumber:1,tomato:1,vinegar:1,sesame_oil:1},{joy:9});
recipe('carrot_salad','凉拌萝卜丝','cold',8,{radish:2,carrot:1,salt:1,vinegar:1,sesame_oil:1});
recipe('sweet_strawberry','草莓牛奶饮','cold',4,{strawberry:2,milk:1,sugar:1},{joy:12,shelfHours:2});
recipe('green_tea','清香绿茶','boil',5,{tea:1},{waterMl:300,yieldGrams:300,satiety:0,joy:8});
recipe('milk_tea','红茶奶茶','boil',10,{black_tea:1,milk:1,sugar:2},{waterMl:120,joy:12});
recipe('ginger_tea','姜糖热饮','boil',15,{ginger:1,sugar:2},{waterMl:300,joy:7});
recipe('steamed_bun','白面馒头','steam',50,{flour:2,yeast:1},{waterMl:120,satiety:34,joy:5,shelfHours:12,steps:['面粉、酵母和温水揉匀','醒发约25分钟，揉匀整形成小馒头','蒸锅上汽后蒸20分钟，焖5分钟出锅']});
recipe('egg_pancake','葱香鸡蛋饼','stir',15,{flour:1,egg:2,scallion:1,oil:1,salt:1},{waterMl:80,joy:9});
recipe('boiled_fresh_milk','煮鲜牛乳','boil',8,{raw_milk:1},{waterMl:0,yieldGrams:240,satiety:9,joy:4,starter:true});
recipe('braised_lamb','清炖羊肉','boil',90,{lamb:3,ginger:1,salt:1},{waterMl:350,satiety:38,joy:10});
recipe('steamed_duck','清蒸鸭肉','steam',50,{duck_meat:3,ginger:1,salt:1},{waterMl:150,satiety:34,joy:9});
recipe('goose_stew','萝卜炖鹅','boil',100,{goose_meat:3,radish:2,ginger:1,salt:1},{waterMl:400,satiety:38,joy:11});
recipe('beef_offal_soup','牛杂汤','boil',60,{offal_cattle:2,ginger:1,salt:1},{waterMl:300,satiety:28,joy:7});
recipe('cattle_bone_soup','牛骨汤','boil',120,{bone_cattle:3,radish:2,salt:1},{waterMl:500,satiety:18,joy:8});
export const BASE_RECIPES = Object.fromEntries(recipes.map(r=>[r.id,r]));
export function recipeItem(r) { return item(`recipe_${r.id}`,`菜谱·${r.name}`,'recipe',20,Math.max(6,Math.round(r.price*2)),{recipeId:r.id,availableDay:r.availableDay,tags:['recipe']}); }
export function foodItem(r) { return item(`dish_${r.id}`,r.name,'food',r.yieldGrams,r.price,{shelfHours:r.shelfHours,satiety:r.satiety,joy:r.joy,rawEdible:true,recipeId:r.id,availableDay:r.availableDay,tags:['cooked']}); }
export function catalogFor(state) {
  const recipes = {...BASE_RECIPES,...state.customRecipes};
  const items = {...BASE_ITEMS,...state.customItems};
  for (const r of Object.values(recipes)) { items[`recipe_${r.id}`]=recipeItem(r); items[`dish_${r.id}`]=foodItem(r); }
  return {items,recipes,crops:{...CROPS,...state.customCrops}};
}
