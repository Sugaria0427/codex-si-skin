import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {launchSkin,LaunchError,waitFor,waitForService} from './launcher-core.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),profile=path.join(root,'cdp-profile'),serviceFile=path.join(here,'skin-service.mjs');
const exec=promisify(execFile),launchStarted=Date.now();
async function json(file,fallback=null){try{return JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function atomic(file,value){const temporary=file+'.'+process.pid+'.tmp';await fs.writeFile(temporary,JSON.stringify(value,null,2));await fs.rename(temporary,file);}
async function record(result){
  const value={...result,at:new Date().toISOString(),durationMs:Date.now()-launchStarted};
  await atomic(path.join(root,'launcher-result.json'),value);
  const log=path.join(root,'launcher-history.log');
  try{if((await fs.stat(log)).size>128*1024){const lines=(await fs.readFile(log,'utf8')).trim().split('\n');await fs.writeFile(log,lines.slice(-100).join('\n')+'\n');}}catch{}
  await fs.appendFile(log,JSON.stringify(value)+'\n').catch(()=>{});return value;
}
async function windows(action,port){const args=['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(here,'launcher-windows.ps1'),'-Action',action,'-Root',root];if(port)args.push('-Port',String(port));const result=await exec(path.join(process.env.WINDIR,'System32','WindowsPowerShell','v1.0','powershell.exe'),args,{windowsHide:true,timeout:12000,maxBuffer:1024*1024,encoding:'utf8'});return JSON.parse(result.stdout.replace(/^\uFEFF/,''));}
async function endpoint(instance){
  const response=await fetch(`http://127.0.0.1:${instance.port}/json/version`,{redirect:'error',signal:AbortSignal.timeout(1200)});
  if(!response.ok)return null;
  const version=await response.json(),url=new URL(version.webSocketDebuggerUrl);
  if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1'||Number(url.port)!==instance.port||!/^\/devtools\/browser\/[\w-]+$/.test(url.pathname)||url.search||url.hash)return null;
  const owners=await windows('Owner',instance.port);
  if(!owners.some(row=>row.OwningProcess===instance.pid&&row.LocalAddress==='127.0.0.1')||owners.some(row=>row.LocalAddress!=='127.0.0.1'&&row.LocalAddress!=='::1'))throw new LaunchError('ENDPOINT_OWNER','换肤连接端口与当前 Codex 进程不匹配。请手动关闭 Codex 后重新启动换肤入口。');
  return {browserId:url.pathname.split('/').at(-1)};
}
function detached(exe,args,stdio='ignore'){return new Promise((resolve,reject)=>{const child=spawn(exe,args,{cwd:here,windowsHide:true,detached:true,stdio});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve(child.pid);});});}
async function freePort(){for(const candidate of [9335,0]){try{return await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen({host:'127.0.0.1',port:candidate,exclusive:true},()=>{const port=server.address().port;server.close(()=>resolve(port));});});}catch{}}throw new Error('没有可用的本地换肤连接端口。');}
const io={profile,node:process.execPath,serviceFile,inventory:()=>windows('Inventory'),connection:endpoint,freePort,
  readState:()=>json(path.join(root,'state.json'),{}),writeState:value=>atomic(path.join(root,'state.json'),value),
  serviceStatus:()=>json(path.join(root,'service-v2.json')),
  serviceAlive:pid=>{try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}},
  async startCodex(pkg,port){await fs.mkdir(profile,{recursive:true});const args=['--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+profile];const pid=await detached(pkg.exe,args);return {pid,exe:pkg.exe,port,args};},
  waitConnection:instance=>waitFor(()=>endpoint(instance),60000,'Codex 已启动，本地换肤连接在等待时间内仍未就绪。当前窗口和对话已保留。'),
  async ensureService(connection,services){
    if(services.length>1)throw new LaunchError('DUPLICATE_HELPER','检测到多个换肤后台，请先手动退出 Codex，等待后台结束后重新点击换肤入口。');
    if(services.length===1){
      const status=await json(path.join(root,'service-v2.json'));
      if(status?.pid===services[0].pid&&status.browserId===connection.browserId&&!status.stoppedAt)return waitForService(io,connection.browserId,services[0].pid);
      // A helper from the just-closed browser exits by itself. Wait for that exit.
      await waitFor(()=>!io.serviceAlive(services[0].pid),15000,'前一个换肤后台尚未结束。当前窗口和对话已保留。');
    }
    await fs.rm(path.join(root,'stop-v2'),{force:true});
    const out=await fs.open(path.join(root,'service-v2.log'),'a'),error=await fs.open(path.join(root,'service-v2-error.log'),'a');let pid;
    try{pid=await detached(process.execPath,[serviceFile,root],['ignore',out.fd,error.fd]);}finally{await Promise.all([out.close(),error.close()]);}
    return waitForService(io,connection.browserId,pid);
  }
};
try{
  if(process.argv.slice(2).some(v=>!['--reuse-only','--no-focus','--quiet'].includes(v)))throw new Error('不支持的启动参数。');
  const result=await launchSkin(io,{reuseOnly:process.argv.includes('--reuse-only')});await record(result);process.stdout.write(JSON.stringify(result));
}catch(e){const result={ok:false,code:e.code||'LAUNCH_FAILED',error:e.message};await record(result).catch(()=>{});process.stdout.write(JSON.stringify(result));process.exitCode=1;}
