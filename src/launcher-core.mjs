import path from 'node:path';

export class LaunchError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
export async function waitFor(fn,timeout,message,{interval=150,now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  const until=now()+timeout;let last;
  while(now()<until){
    try{const value=await fn(until-now());if(value)return value;}catch(e){if(e instanceof LaunchError)throw e;last=e;}
    await pause(Math.min(interval,Math.max(0,until-now())));
  }
  throw new LaunchError('NOT_READY',(typeof message==='function'?message():message)+(last?'（'+last.message+'）':''));
}
export async function waitForService(io,browserId,pid,timeout=60000){
  let latest;
  return waitFor(async()=>{
    if(!await io.serviceAlive(pid))throw new LaunchError('HELPER_EXITED','换肤后台在连接界面前已退出，请检查换肤后台的错误记录。当前 Codex 窗口已保留。');
    latest=await io.serviceStatus();
    if(latest?.pid!==pid||latest.browserId!==browserId)return null;
    if(latest.stoppedAt||latest.phase==='failed')throw new LaunchError('HELPER_STOPPED','换肤后台已停止。'+(latest.lastError||'当前 Codex 窗口已保留。'));
    return latest.phase==='ready'&&latest.readyTargets?.length?latest:null;
  },timeout,()=> 'Codex 的界面在等待时间内仍未完成换肤连接。后台会继续自动连接，当前窗口和对话已保留。'+(latest?.lastError?'最近的连接状态：'+latest.lastError:''));
}
const normalized=value=>path.win32.resolve(value).toLowerCase();
export function instanceFor(process,profile){
  const option=name=>process.args.find(v=>v.startsWith(name+'='))?.slice(name.length+1);
  const port=Number(option('--remote-debugging-port'));
  const directory=option('--user-data-dir');
  return directory&&normalized(directory)===normalized(profile)&&Number.isInteger(port)&&port>=1024&&port<=65535&&option('--remote-debugging-address')==='127.0.0.1'?{...process,port}:null;
}

// All OS effects live in the adapter. This policy never terminates a Codex process.
export async function launchSkin(io,{reuseOnly=false}={}){
  const inventory=await io.inventory();
  const candidates=inventory.codex.map(p=>instanceFor(p,io.profile)).filter(Boolean);
  let instance,connection;
  for(const candidate of candidates){
    try{const found=await io.connection(candidate);if(found){instance=candidate;connection=found;break;}}catch{}
  }
  if(!instance&&candidates.length){instance=candidates[0];connection=await io.waitConnection(instance);}
  let mode='reused';
  if(!instance){
    if(inventory.codex.length)throw new LaunchError('MANUAL_EXIT_REQUIRED','当前已有通过普通入口启动的 Codex 窗口。请先自行退出这些窗口，再点击“Codex（祀）”。当前窗口和对话已保留。');
    if(reuseOnly)throw new LaunchError('NO_MANAGED_INSTANCE','当前没有可复用的换肤 Codex。本次检查没有启动应用。');
    const port=await io.freePort();
    instance=await io.startCodex(inventory.package,port);
    // Once started, a connection failure is reported. There is no stop/retry cycle.
    connection=await io.waitConnection(instance);
    mode='started';
  }
  const prior=await io.readState();
  await io.writeState({...prior,schemaVersion:4,platform:'windows',port:instance.port,browserId:connection.browserId,
    profilePath:io.profile,codexPid:instance.pid,codexExe:instance.exe,nodePath:io.node,
    codexPackageRoot:inventory.package.root,codexPackageFullName:inventory.package.fullName,
    codexPackageFamilyName:inventory.package.family,codexVersion:inventory.package.version,
    injectorPath:io.serviceFile,updatedAt:new Date().toISOString()});
  const service=await io.ensureService(connection,inventory.services);
  await io.writeState({...await io.readState(),injectorPid:service.pid,injectorPath:io.serviceFile,injectorStartedAt:service.startedAt});
  return {ok:true,mode,codexPid:instance.pid,servicePid:service.pid,browserId:connection.browserId};
}
