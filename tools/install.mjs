import { cp, mkdir, readFile, writeFile, rename, copyFile, symlink, realpath, lstat } from 'node:fs/promises';
import { resolve,join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const source=fileURLToPath(new URL('..',import.meta.url)),app=resolve(process.argv[2]??'I:\\Coopanion');
const appPkg=JSON.parse(await readFile(join(app,'resources','app','package.json'),'utf8'));
if(appPkg.name!=='coopanion')throw new Error('目标不是 Coopanion 安装目录');
const name='cortico-world-homestead',extensions=join(app,'data','extensions'),target=join(extensions,'local',name),link=join(extensions,'node_modules',name),stamp=new Date().toISOString().replace(/[:.]/g,'-');
async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
if(await exists(link)){
  const actual=await realpath(link);if(actual.toLowerCase()!==target.toLowerCase())throw new Error(`同名扩展已安装在其他位置：${actual}，未覆盖`);
}
if(await exists(target)){
  const prev=JSON.parse(await readFile(join(target,'package.json'),'utf8'));if(prev.name!==name)throw new Error('目标目录不是本扩展，未覆盖');
}
await mkdir(dirname(target),{recursive:true});const stage=`${target}.stage-${stamp}`;await mkdir(stage);
for(const file of ['package.json','src','dist','assets','describe.json','README.md','docs','tools','test','preview','LICENSE','THIRD_PARTY_NOTICES.md'])await cp(join(source,file),join(stage,file),{recursive:true});
if(await exists(target))await rename(target,`${target}.backup-${stamp}`);
await rename(stage,target);await mkdir(dirname(link),{recursive:true});if(!await exists(link))await symlink(target,link,process.platform==='win32'?'junction':'dir');
const manifest=join(extensions,'package.json');let data={name:'cortico-extensions',private:true,dependencies:{}};
if(await exists(manifest)){data=JSON.parse((await readFile(manifest,'utf8')).replace(/^\uFEFF/,''));await copyFile(manifest,`${manifest}.backup-${stamp}`);}
data.dependencies??={};data.dependencies[name]=`link:local/${name}`;
await writeFile(`${manifest}.tmp`,JSON.stringify(data,null,2)+'\n','utf8');await rename(`${manifest}.tmp`,manifest);
console.log(JSON.stringify({installed:target,link,package:name,version:'1.0.0',restartRequired:true,note:'请重启Coopanion后，在World页启用田园烟火；未改动其他World或个人配置'},null,2));
