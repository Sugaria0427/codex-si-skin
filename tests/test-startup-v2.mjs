import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {launchSkin,waitForService} from '../src/launcher-core.mjs';
import {isSkinPage} from '../src/cdp-client.mjs';
import {normalizeSettings} from '../src/settings-model.mjs';

// A local CDP protocol fixture exercises the real daemon without opening Codex.
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src'),pause=ms=>new Promise(r=>setTimeout(r,ms));
function frame(value,opcode=1){
  const body=Buffer.from(value),head=Buffer.alloc(body.length<126?2:body.length<65536?4:10);head[0]=0x80|opcode;
  if(head.length===2)head[1]=body.length;else if(head.length===4){head[1]=126;head.writeUInt16BE(body.length,2);}else{head[1]=127;head.writeBigUInt64BE(BigInt(body.length),2);}
  return Buffer.concat([head,body]);
}
async function fixture({shellDelay=0,failFirst=false,stalledPage=false,flakyListing=false}={}){
  const root=await fs.mkdtemp(path.resolve('tmp','skin-startup-')),runtime=path.join(root,'v2'),sockets=new Set(),started=Date.now(),metrics={boots:0,connects:0,overlayConnects:0,removedScripts:0},contexts=new Set();
  let child,port,output='',error='',failed=false,listRequests=0;
  const server=http.createServer((req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.url==='/json/version')res.end(JSON.stringify({webSocketDebuggerUrl:`ws://127.0.0.1:${port}/devtools/browser/fixture-browser`}));
    else if(req.url==='/json/list'){
      if(flakyListing&&++listRequests<3){res.statusCode=503;res.end('{}');return;}
      res.end(JSON.stringify([
        {id:'avatar',type:'page',url:'app://-/index.html?initialRoute=%2Favatar-overlay'},
        ...(stalledPage?[{id:'stalled',type:'page',url:'app://-/index.html?initialRoute=%2Fstalled'}]:[]),
        {id:'main',type:'page',url:'app://-/index.html'}
      ].map(t=>({...t,webSocketDebuggerUrl:`ws://127.0.0.1:${port}/devtools/page/${t.id}`}))));
    }else{res.statusCode=404;res.end('{}');}
  });
  server.on('upgrade',(req,socket)=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
    const id=req.url.split('/').at(-1),context={window:{},location:{protocol:'app:'},document:{documentElement:{},querySelector:()=>Date.now()-started>=shellDelay?{}:null},sessionStorage:{getItem:()=>null},console};context.window.top=context.window;
    if(id==='avatar')metrics.overlayConnects++;
    if(id==='main')metrics.connects++;
    vm.createContext(context);const scripts=new Set();let sequence=0,buffer=Buffer.alloc(0),fragments=[];
    const send=value=>{if(!socket.destroyed)socket.write(frame(JSON.stringify(value)));};
    const command=async message=>{
      const {id:commandId,method,params={}}=message;if(id==='stalled'||id==='avatar')return;
      let result={};
      try{
        if(method==='Runtime.addBinding')context.window[params.name]=payload=>send({method:'Runtime.bindingCalled',params:{name:params.name,payload,executionContextId:1}});
        if(method==='Page.addScriptToEvaluateOnNewDocument'){const key=String(++sequence);scripts.add(key);result={identifier:key};}
        if(method==='Page.removeScriptToEvaluateOnNewDocument'){scripts.delete(params.identifier);metrics.removedScripts++;}
        if(method==='Runtime.evaluate'){
          if(params.expression.includes('__skinSettingsBootstrap')){
            metrics.boots++;
            if(failFirst&&!failed){failed=true;throw new Error('fixture: navigation interrupted initial injection');}
          }
          const value=await vm.runInContext(params.expression,context);result={result:{value}};
        }
        send({id:commandId,result});
      }catch(e){send({id:commandId,result:{exceptionDetails:{text:e.message}}});}
    };
    const live={id,context,socket,send};contexts.add(live);socket.on('close',()=>contexts.delete(live));
    socket.on('data',chunk=>{
      buffer=Buffer.concat([buffer,chunk]);
      while(buffer.length>=2){
        const first=buffer[0],masked=!!(buffer[1]&128);let length=buffer[1]&127,offset=2;
        if(length===126){if(buffer.length<4)return;length=buffer.readUInt16BE(2);offset=4;}
        else if(length===127){if(buffer.length<10)return;length=Number(buffer.readBigUInt64BE(2));offset=10;}
        if(buffer.length<offset+(masked?4:0)+length)return;
        const mask=masked?buffer.subarray(offset,offset+4):null;if(masked)offset+=4;
        const body=Buffer.from(buffer.subarray(offset,offset+length));buffer=buffer.subarray(offset+length);
        if(mask)for(let i=0;i<body.length;i++)body[i]^=mask[i%4];
        const opcode=first&15;
        if(opcode===8){socket.end(frame('',8));return;}
        if(opcode===9){socket.write(frame(body,10));continue;}
        fragments.push(body);if(first&128){const payload=Buffer.concat(fragments);fragments=[];void command(JSON.parse(payload.toString()));}
      }
    });
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;
  await fs.mkdir(runtime,{recursive:true});await fs.mkdir(path.join(root,'engine','assets'),{recursive:true});await fs.mkdir(path.join(root,'engine','scripts'),{recursive:true});
  for(const name of ['skin-service.mjs','cdp-client.mjs','settings-store.mjs','settings-model.mjs','theme-zip.mjs'])await fs.copyFile(path.join(source,name),path.join(runtime,name));
  await fs.writeFile(path.join(root,'engine','assets','safe-css-validator.mjs'),'export const validateSafeCss=()=>({valid:true});');
  await fs.writeFile(path.join(root,'engine','scripts','image-metadata.mjs'),'export const readImageMetadata=()=>null;');
  await fs.writeFile(path.join(runtime,'skin-runtime.js'),`window.__skinRuntime={configure:async()=>true};`);
  await fs.writeFile(path.join(runtime,'settings-ui.js'),`window.__dreamSkinSettingsVersion='fixture';window.__dreamSkinSettingsReceive=value=>{window.received=value;};`);
  const state={port,browserId:'fixture-browser'},settings={schemaVersion:2,revision:1,enabled:true,current:normalizeSettings({id:'fixture',name:'fixture'})};
  await fs.writeFile(path.join(root,'state.json'),JSON.stringify(state));await fs.writeFile(path.join(root,'settings-v2.json'),JSON.stringify(settings));
  const readStatus=async()=>{try{return JSON.parse(await fs.readFile(path.join(root,'service-v2.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  const serviceIO={serviceAlive:()=>child?.exitCode===null,serviceStatus:readStatus};
  const start=()=>{child=spawn(process.execPath,[path.join(runtime,'skin-service.mjs'),root],{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);return child.pid;};
  const stop=async()=>{
    if(child&&child.exitCode===null){await fs.writeFile(path.join(root,'stop-v2'),'test');const until=Date.now()+5000;while(child.exitCode===null&&Date.now()<until)await pause(50);if(child.exitCode===null)child.kill();}
    for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));
  };
  return {root,state,settings,metrics,start,stop,readStatus,serviceIO,contexts,logs:()=>({output,error}),elapsed:()=>Date.now()-started};
}

assert(isSkinPage({type:'page',url:'app://-/index.html'}));
assert(!isSkinPage({type:'page',url:'app://-/index.html?initialRoute=%2Favatar-overlay'}));
assert(!isSkinPage({type:'page',url:'app://codex/avatar-overlay'}));
assert(!isSkinPage({type:'webview',url:'app://-/index.html'}));
assert(!isSkinPage({type:'page',url:'https://example.com/'}));

const reports=[];
async function scenario(name,options,verify){const f=await fixture(options);try{await verify(f);reports.push({name,ms:f.elapsed(),...f.metrics});}catch(e){console.error(f.logs());throw e;}finally{await f.stop();}}
await Promise.all([
  scenario('one click waits past the previous 12-second cutoff',{shellDelay:14500},async f=>{
    let starts=0,serviceStarts=0,saved={};
    const result=await launchSkin({profile:'C:\\fixture',node:process.execPath,serviceFile:'fixture-service',
      inventory:async()=>({codex:[],services:[],package:{}}),freePort:async()=>f.state.port,
      startCodex:async()=>{starts++;return{pid:7,port:f.state.port,exe:'fixture'};},waitConnection:async()=>({browserId:f.state.browserId}),
      readState:async()=>saved,writeState:async v=>{saved=v;},
      ensureService:async()=>{serviceStarts++;const pid=f.start();return waitForService(f.serviceIO,f.state.browserId,pid,25000);}
    });
    assert(result.ok);assert.equal(starts,1);assert.equal(serviceStarts,1);assert(f.elapsed()>=14500);assert.equal(f.metrics.boots,1);assert.equal(f.metrics.overlayConnects,0);
    const main=[...f.contexts].find(c=>c.id==='main');
    vm.runInContext(`window.__dreamSkinSettingsRequest(JSON.stringify({requestId:'first-click',op:'list'}))`,main.context);
    const until=Date.now()+1500;while(!main.context.window.received&&Date.now()<until)await pause(10);
    assert.equal(main.context.window.received?.requestId,'first-click');assert.equal(main.context.window.received?.ok,true);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root,'settings-v2.json'),'utf8')),f.settings);
  }),
  scenario('failed first bootstrap is released and retried',{failFirst:true},async f=>{
    const pid=f.start(),status=await waitForService(f.serviceIO,f.state.browserId,pid,8000);
    assert.deepEqual(status.readyTargets,['main']);assert.equal(f.metrics.boots,2);assert(f.metrics.removedScripts>=1);assert.equal(f.metrics.overlayConnects,0);
    assert(f.logs().error.includes('attach-retry'));
  }),
  scenario('unresponsive auxiliary page cannot block main window',{stalledPage:true},async f=>{
    const pid=f.start();await waitForService(f.serviceIO,f.state.browserId,pid,4000);assert(f.elapsed()<2000);assert.equal(f.metrics.boots,1);assert.equal(f.metrics.overlayConnects,0);
  }),
  scenario('transient startup endpoint failures reconnect automatically',{flakyListing:true},async f=>{
    const pid=f.start();await waitForService(f.serviceIO,f.state.browserId,pid,8000);assert.equal(f.metrics.boots,1);
  }),
  scenario('renderer replacement invalidates and renews readiness',{},async f=>{
    const pid=f.start();await waitForService(f.serviceIO,f.state.browserId,pid,5000);
    const main=[...f.contexts].find(c=>c.id==='main');delete main.context.window.__skinRuntime;delete main.context.window.__skinServiceConnection;
    main.send({method:'Runtime.executionContextsCleared',params:{}});
    const until=Date.now()+1000;while((await f.readStatus())?.phase==='ready'&&Date.now()<until)await pause(10);
    assert.equal((await f.readStatus()).phase,'connecting');
    await waitForService(f.serviceIO,f.state.browserId,pid,5000);assert.equal(f.metrics.boots,2);
  })
]);
console.log(JSON.stringify({pass:true,reports},null,2));
