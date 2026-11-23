import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { HomesteadWorld } from '../src/world.js';
const port=Number(process.env.PORT??4399),world=new HomesteadWorld({dataDir:fileURLToPath(new URL('../.runtime/preview/',import.meta.url))});
await world.start({log:console});
const page=await readFile(new URL('../preview/index.html',import.meta.url));
const server=http.createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"};
  const send=(status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{...headers,'Content-Type':type});res.end(data);};
  try{
    if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`)return send(403,'Forbidden');
    if(req.method==='GET'&&req.url==='/')return send(200,page,'text/html; charset=utf-8');
    if(req.method==='GET'&&req.url==='/webui.js')return send(200,await readFile(new URL('../dist/webui.js',import.meta.url)),'text/javascript; charset=utf-8');
    if(req.method==='GET'&&req.url==='/favicon.ico')return send(204,'');
    if(req.method==='POST'&&req.url==='/invoke'){
      if(req.headers.origin&&![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin))return send(403,'Forbidden');
      if(!String(req.headers['content-type']).startsWith('application/json'))return send(415,'JSON required');
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>64*1024)throw new Error('请求过大');}
      const {panel,method,args}=JSON.parse(body);const result=await world.invoke(panel,method,args);return send(200,JSON.stringify(result));
    }
    send(404,JSON.stringify({error:'Not found'}));
  }catch(e){send(400,JSON.stringify({error:e.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`田园烟火预览：http://127.0.0.1:${port}（独立测试存档）`));
async function close(){await world.stop();server.close();}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
