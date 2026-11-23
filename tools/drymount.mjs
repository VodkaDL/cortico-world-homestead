import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import def from '../src/index.js';
const app=process.env.COOPANION_APP_ROOT??'I:\\Coopanion\\resources\\app';
const {register}=await import(pathToFileURL(join(app,'node_modules','tsx','dist','esm','api','index.mjs')).href);const unregister=register();
const scratch=await mkdtemp(join(tmpdir(),'homestead-drymount-'));
try{
  const {parseExtensionManifest,EXTENSION_API_VERSIONS}=await import(pathToFileURL(join(app,'build','cortico','src','extensions','manifest.ts')).href);
  const {dryMountWorld,collectToolNames}=await import(pathToFileURL(join(app,'build','cortico','src','extensions','dry-mount.ts')).href);
  const packageDir=fileURLToPath(new URL('..',import.meta.url)),parsed=parseExtensionManifest(JSON.parse(await readFile(join(packageDir,'package.json'),'utf8')));
  if(!parsed.ok)throw new Error(parsed.reasons.join('; '));
  if(parsed.manifest.api!==EXTENSION_API_VERSIONS.world)throw new Error('World API 与本机不匹配');
  await import(pathToFileURL(join(app,'build','cortico','src','extensions','runtime.ts')).href);
  const otherDefs=[];
  for(const name of ['cortico-world-eat','cortico-world-bottle','cortico-world-desktop-pet']){
    const dirs=[join(app,'..','..','data','extensions','node_modules',name),join(app,'node_modules',name)];
    let found=false;
    for(const dir of dirs){try{const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));const entry=pkg.main??'index.js';const m=await import(pathToFileURL(join(dir,entry)).href);const candidate=m.default??m.definition;if(candidate?.create){otherDefs.push(candidate);found=true;break;}}catch(e){if(e.code!=='ENOENT')console.log(`兼容性提示 ${name}: ${e.message}`);}}
    if(!found)throw new Error(`未取得 ${name} 的定义，工具冲突检查不完整`);
  }
  const taken=collectToolNames(otherDefs,{scratchDir:scratch,packageDir}).taken;
  const report=await dryMountWorld(def,{scratchDir:scratch,packageDir,hasWebUiClient:true,takenToolNames:taken});
  console.log(JSON.stringify({manifest:'通过',...report},null,2));if(report.failures.length)process.exitCode=1;
}finally{await rm(scratch,{recursive:true,force:true});unregister();}
