import { DEFAULTS, config } from './time.js';
import { HomesteadWorld, TOOL_DECLS } from './world.js';
export const homesteadDefinition={id:'homestead',label:'田园烟火',defaults:()=>structuredClone(DEFAULTS),preflight:ctx=>{config(ctx.cfg);},create:ctx=>new HomesteadWorld(ctx),describe:{
  tools:TOOL_DECLS.map(({action,...tool})=>({...tool,summary:{zh:tool.description,en:tool.name}})),
  events:['welcome','weather','harvest','cooked','travel','life','health','hunger'].map(t=>({type:`homestead.${t}`,description:{zh:`田园${{welcome:'欢迎',weather:'天气',harvest:'收获',cooked:'出锅',travel:'行程',life:'生活',health:'健康',hunger:'饥饿'}[t]}事件`,en:`Homestead ${t} event`},trigger:'debounce'})),
}};
export default homesteadDefinition;
