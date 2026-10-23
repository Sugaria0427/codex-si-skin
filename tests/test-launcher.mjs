import assert from 'node:assert/strict';
import {launchSkin,instanceFor,LaunchError,waitForService} from '../src/launcher-core.mjs';
const profile='C:\\Users\\fixture\\.codex\\codex-dream-skin\\cdp-profile';
const app={pid:11,exe:'C:\\WindowsApps\\Codex\\ChatGPT.exe',args:['--remote-debugging-address=127.0.0.1','--remote-debugging-port=9335','--user-data-dir='+profile]};
function fixture(codex=[],services=[]){
  const calls=[];let state={enabled:false,unrelated:'preserved'},startCount=0;
  const io={profile,node:'node.exe',serviceFile:'service.mjs',
    inventory:async()=>({codex,services,package:{root:'package',exe:app.exe,fullName:'official',family:'official-family',version:'2'}}),
    connection:async instance=>(calls.push('verify:'+instance.pid),{browserId:'verified'}),
    freePort:async()=>(calls.push('port'),9444),startCodex:async(pkg,port)=>(startCount++,calls.push('start'),{...app,port,pid:22}),
    waitConnection:async instance=>(calls.push('wait:'+instance.pid),{browserId:'new-instance'}),
    readState:async()=>state,writeState:async value=>{calls.push('state');state=value;},
    ensureService:async(connection,running)=>(calls.push('service:'+connection.browserId),{pid:running[0]?.pid||33,startedAt:'now'})};
  return {io,calls,state:()=>state,startCount:()=>startCount};
}
let f=fixture([app],[{pid:77}]);let r=await launchSkin(f.io);assert.equal(r.mode,'reused');assert.equal(r.servicePid,77);assert.equal(f.startCount(),0);assert.equal(f.state().unrelated,'preserved');assert.equal(f.state().enabled,false);assert.equal(f.state().injectorPid,77);
f=fixture([{...app,pid:9,args:[]},app]);r=await launchSkin(f.io);assert.equal(r.codexPid,11);assert.equal(f.startCount(),0);
f=fixture([{...app,args:[]}]);await assert.rejects(launchSkin(f.io),e=>e.code==='MANUAL_EXIT_REQUIRED');assert.deepEqual(f.calls,[]);
f=fixture([app]);f.io.connection=async()=>null;r=await launchSkin(f.io);assert.equal(r.mode,'reused');assert(f.calls.includes('wait:11'));assert.equal(f.startCount(),0);
f=fixture([app]);f.io.connection=async()=>null;f.io.waitConnection=async()=>{throw new Error('still starting');};await assert.rejects(launchSkin(f.io),/still starting/);assert.equal(f.startCount(),0);
f=fixture();r=await launchSkin(f.io);assert.equal(r.mode,'started');assert.equal(f.startCount(),1);assert.equal(f.state().port,9444);assert.deepEqual(f.calls,['port','start','wait:22','state','service:new-instance','state']);
f=fixture();await assert.rejects(launchSkin(f.io,{reuseOnly:true}),e=>e.code==='NO_MANAGED_INSTANCE');assert.deepEqual(f.calls,[]);
f=fixture();f.io.waitConnection=async()=>{throw new Error('unavailable');};await assert.rejects(launchSkin(f.io),/unavailable/);assert.equal(f.startCount(),1);assert(!f.calls.some(v=>v.startsWith('service:')));
f=fixture([app]);f.io.ensureService=async()=>{throw new Error('helper unavailable');};await assert.rejects(launchSkin(f.io),/helper unavailable/);assert.equal(f.startCount(),0);
assert(instanceFor({...app,args:app.args.map(v=>v.startsWith('--user-data-dir=')?'--user-data-dir='+profile.toUpperCase():v)},profile));
assert.equal(instanceFor({...app,args:app.args.map(v=>v.startsWith('--user-data-dir=')?'--user-data-dir=C:\\another-profile':v)},profile),null);
assert.equal(instanceFor({...app,args:app.args.map(v=>v.startsWith('--remote-debugging-address=')?'--remote-debugging-address=0.0.0.0':v)},profile),null);
const status={pid:33,browserId:'verified',phase:'ready',readyTargets:['main']};
let checks=0;
assert.equal(await waitForService({serviceAlive:()=>true,serviceStatus:async()=>++checks===1?{...status,phase:'connecting',readyTargets:[]}:status},'verified',33,1000),status);
await assert.rejects(waitForService({serviceAlive:()=>false,serviceStatus:async()=>status},'verified',33,1000),e=>e instanceof LaunchError&&e.code==='HELPER_EXITED');
await assert.rejects(waitForService({serviceAlive:()=>true,serviceStatus:async()=>({...status,pid:34})},'verified',33,30),e=>e.code==='NOT_READY');
await assert.rejects(waitForService({serviceAlive:()=>true,serviceStatus:async()=>({...status,phase:'failed',lastError:'fixture'})},'verified',33,1000),e=>e.code==='HELPER_STOPPED'&&e.message.includes('fixture'));
console.log(JSON.stringify({pass:true,checks:['reuse without restart','reuse beside ordinary instance','manual exit for ordinary instance','wait for an already-starting managed instance','cold launch once with dynamic package and port','reuse-only never starts','failed connection never restarts','service failure preserves app','profile and loopback validation','accurate state preserving unrelated data','service acknowledgement before success','early process-exit detection','ignore another helper PID','surface backend errors immediately']},null,2));
