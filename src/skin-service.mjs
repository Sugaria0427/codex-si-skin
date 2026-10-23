import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { CdpSession, managedTargets, defaultStateRoot } from './cdp-client.mjs';
import { SettingsStore } from './settings-store.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const VERSION='2026.10.22.1';
const stateRoot=process.argv[2]||defaultStateRoot;
const store=await new SettingsStore(stateRoot).init();
const sessions=new Map(),probeAfter=new Map();let stopping=false,lastFailure='',reloadStamp=0,statusTail=Promise.resolve(),statusKey='';
const identity=JSON.parse(await fs.readFile(path.join(stateRoot,'state.json'),'utf8')).browserId,startedAt=new Date().toISOString();
await atomicStatus({pid:process.pid,browserId:identity,startedAt,version:VERSION,phase:'starting',readyTargets:[]});
const anchor=await connectBrowser();
anchor.ws.addEventListener('close',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
const operations=new Set(['list','load','draft','save','saveAs','activate','enabled','image','import','export','delete','validateCss']);
async function atomicStatus(value){const file=path.join(stateRoot,'service-v2.json'),temp=file+'.'+process.pid+'.tmp';await fs.writeFile(temp,JSON.stringify(value));await fs.rename(temp,file);}
async function connectBrowser(){
  const until=Date.now()+15000;let last;
  while(Date.now()<until){let session;try{
    const initial=await managedTargets(stateRoot);if(initial.state.browserId!==identity)throw new Error('Managed CDP identity changed');
    session=new CdpSession(`ws://127.0.0.1:${initial.state.port}/devtools/browser/${identity}`);await session.open(2000);return session;
  }catch(e){session?.close();last=e;if(e.message==='Managed CDP identity changed')break;await new Promise(r=>setTimeout(r,200));}}
  await atomicStatus({pid:process.pid,browserId:identity,startedAt,version:VERSION,phase:'failed',readyTargets:[],lastError:last?.message});throw last;
}
function publishStatus(){
  const readyTargets=[...sessions].filter(([,entry])=>entry.ready&&entry.session.ws.readyState===WebSocket.OPEN).map(([id])=>id).sort();
  const value={pid:process.pid,browserId:identity,startedAt,version:VERSION,phase:stopping?'stopped':readyTargets.length?'ready':'connecting',readyTargets,lastError:readyTargets.length?'':lastFailure};
  const key=JSON.stringify(value);if(key===statusKey)return statusTail;statusKey=key;
  statusTail=statusTail.catch(()=>{}).then(()=>atomicStatus({...value,updatedAt:new Date().toISOString()})).catch(e=>{statusKey='';throw e;});return statusTail;
}
async function sources(){const[runtime,ui]=await Promise.all([fs.readFile(path.join(here,'skin-runtime.js'),'utf8'),fs.readFile(path.join(here,'settings-ui.js'),'utf8')]);return{runtime,ui};}
let source=await sources();
function earlySource(entry,data){
  const cfg=JSON.stringify(data);
  return `(()=>{const start=()=>{window.__CODEX_DREAM_SKIN_STATE__?.cleanup?.();window.__dreamSkinSettingsCleanup?.();
    ${source.runtime}
    const seed=${cfg};try{const cached=JSON.parse(sessionStorage.getItem('codex-skin-v2-draft')||'null');if(cached&&cached.revision>seed.revision){seed.current=cached.current;seed.enabled=cached.enabled;seed.revision=cached.revision;}}catch{}
    window.__skinSettingsBootstrap=seed;
    const token=${JSON.stringify(entry.nonce)};window.__dreamSkinSettingsRequest=wire=>{const value=JSON.parse(wire);value.bridgeNonce=token;window.__skinNativeV2(JSON.stringify(value));};
    const configured=window.__skinRuntime.configure(seed);
    ${source.ui}
    return configured.then(()=>{window.__skinServiceConnection=${JSON.stringify(entry.nonce)};return true;});
  };if(document.documentElement)return start();else{const ready=new MutationObserver(()=>{if(document.documentElement){ready.disconnect();start().catch(e=>console.error('[appearance]',e.message));}});ready.observe(document,{childList:true,subtree:true});}})();`;
}
async function refreshEarly(entry){
  const data=await store.view(true);entry.asset=data.image.asset;const code=earlySource(entry,data);
  const registered=await entry.session.send('Page.addScriptToEvaluateOnNewDocument',{source:code},3000);
  if(entry.earlyId)await entry.session.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:entry.earlyId},1000).catch(()=>{});entry.earlyId=registered.identifier;entry.earlyAsset=data.image.asset;return code;
}
const shellExpression=`!!document.querySelector('aside.app-shell-left-panel,main[data-app-shell-main-surface],input[name="appearance-theme"]')`;
async function mounted(entry){return entry.session.evaluate(`Boolean(${shellExpression} && window.__skinServiceConnection===${JSON.stringify(entry.nonce)} && window.__skinRuntime && window.__dreamSkinSettingsVersion && typeof window.__dreamSkinSettingsRequest==='function')`,2000);}
async function bootstrap(entry){const code=await refreshEarly(entry);await entry.session.evaluate(code,10000);if(!await mounted(entry))throw new Error('界面仍在加载，等待自动重新连接。');entry.ready=true;}
async function release(entry){if(entry.earlyId&&entry.session.ws.readyState===WebSocket.OPEN)await entry.session.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:entry.earlyId},1000).catch(()=>{});entry.session.close();}
function defer(target){const attempts=(probeAfter.get(target.id)?.attempts||0)+1;probeAfter.set(target.id,{attempts,at:Date.now()+Math.min(1600,200*2**Math.min(attempts-1,3))});}
async function update(entry,state,kind){
  const data={revision:state.revision,enabled:state.enabled,current:state.current,selectedId:state.selectedId};
  if(entry.asset!==state.current.background.asset){data.image={asset:state.current.background.asset,url:await store.imageData(state.current.background.asset)};entry.asset=data.image.asset;}
  await entry.session.evaluate(`(async()=>{const next=${JSON.stringify(data)};try{sessionStorage.setItem('codex-skin-v2-draft',JSON.stringify({revision:next.revision,current:next.current,enabled:next.enabled}));}catch{}await window.__skinRuntime?.configure(next);window.__skinSettingsChanged?.(next);return true;})()`);
  if(entry.earlyAsset!==state.current.background.asset)await refreshEarly(entry);
}
store.onChange(async(state,kind)=>{for(const entry of sessions.values())try{await update(entry,state,kind);}catch(e){console.error('[appearance] live update:',e.message);}});
async function attach(target){
  const session=new CdpSession(target.webSocketDebuggerUrl),entry={session,nonce:randomUUID(),earlyId:null,queued:0,asset:'',ready:false};let attached=false;
  try{
  await session.open(1500);
  const valid=await session.evaluate(shellExpression,2000);
  if(!valid){defer(target);return;}
  session.on('Runtime.executionContextsCleared',()=>{entry.ready=false;void publishStatus().catch(e=>console.error('[appearance] status:',e.message));});
  session.on('Runtime.bindingCalled',event=>{
    if(event.name!=='__skinNativeV2')return;
    let request;try{if(event.payload.length>46*1024*1024)throw 0;request=JSON.parse(event.payload);if(request.bridgeNonce!==entry.nonce||!operations.has(request.op)||!/^[\w-]{1,100}$/.test(request.requestId))return;}catch{return;}
    const deliver=response=>session.send('Runtime.evaluate',{expression:`window.__dreamSkinSettingsReceive?.(${JSON.stringify({requestId:request.requestId,...response})})`,contextId:event.executionContextId,returnByValue:true}).catch(()=>{});
    if(entry.queued>=8){void deliver({ok:false,error:'已有外观操作正在处理。'});return;}entry.queued++;
    void(async()=>{try{
      const context=await session.send('Runtime.evaluate',{expression:'location.protocol === "app:" && window.top === window',contextId:event.executionContextId,returnByValue:true});if(context.result?.value!==true)return;
    const result=await store.request(request);if(request.op==='image')entry.asset=result.asset;await deliver({ok:true,data:result});
    }catch(e){await deliver({ok:false,error:String(e.message||'外观操作失败。').slice(0,1000),code:e.code});}finally{entry.queued--;}})();
  });
  await session.send('Runtime.enable',{},2000);await session.send('Page.enable',{},2000);await session.send('Runtime.addBinding',{name:'__skinNativeV2'},2000);
  await bootstrap(entry);sessions.set(target.id,entry);probeAfter.delete(target.id);attached=true;await publishStatus();console.log(JSON.stringify({event:'attached',target:target.id,version:VERSION,at:new Date().toISOString()}));
  }catch(e){defer(target);lastFailure=e.message;console.error(JSON.stringify({event:'attach-retry',target:target.id,error:e.message,at:new Date().toISOString()}));}
  finally{if(!attached)await release(entry);}
}
try{
  while(!stopping){
    try{
      if(await fs.stat(path.join(stateRoot,'stop-v2')).then(()=>true,()=>false)){await fs.rm(path.join(stateRoot,'stop-v2'),{force:true});break;}
      const snapshot=await managedTargets(stateRoot);if(snapshot.state.browserId!==identity){stopping=true;throw new Error('原会话身份已变更；服务已停止自动连接。');}
      const targets=new Set(snapshot.targets.map(t=>t.id));
      for(const[id,entry]of sessions)if(!targets.has(id)||entry.session.ws.readyState!==WebSocket.OPEN){entry.session.close();sessions.delete(id);}
      for(const id of probeAfter.keys())if(!targets.has(id))probeAfter.delete(id);
      const stamp=(await fs.stat(path.join(stateRoot,'reload-v2')).catch(()=>({mtimeMs:0}))).mtimeMs;
      const reloaded=stamp>reloadStamp;if(reloaded){reloadStamp=stamp;source=await sources();}
      await Promise.all([...sessions].map(async([id,entry])=>{try{if(reloaded)await bootstrap(entry);else if(!entry.ready){if(await mounted(entry))entry.ready=true;else await bootstrap(entry);}}catch(e){sessions.delete(id);lastFailure=e.message;await release(entry);}}));
      await publishStatus();
      await Promise.all(snapshot.targets.filter(t=>!sessions.has(t.id)&&(probeAfter.get(t.id)?.at||0)<=Date.now()).map(attach));
      await publishStatus();
      lastFailure='';
    }catch(e){if(e.message!==lastFailure){console.error('[appearance]',e.message);lastFailure=e.message;}}
    await new Promise(r=>setTimeout(r,[...sessions.values()].some(entry=>entry.ready)?1600:200));
  }
}finally{
  await Promise.all([...sessions.values()].map(release));anchor.close();await statusTail.catch(()=>{});
  await atomicStatus({pid:process.pid,browserId:identity,startedAt,stoppedAt:new Date().toISOString(),version:VERSION,phase:'stopped',readyTargets:[]});
}
