import { writeFile, readFile } from 'node:fs/promises';
import def from '../src/index.js';
const content=await readFile(new URL('../src/ENV_PROMPT.md',import.meta.url),'utf8');
await writeFile(new URL('../describe.json',import.meta.url),JSON.stringify({...def.describe,prompts:[{key:'worlds.homestead.env',title:'田园烟火',role:'envPrompt',content}]},null,2)+'\n');
console.log(`describe.json：${def.describe.tools.length} 工具，${def.describe.events.length} 事件`);
