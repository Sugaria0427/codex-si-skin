import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {CdpSession} from '../src/cdp-client.mjs';
import {root} from './release-files.mjs';
await fs.mkdir(path.join(root,'tmp'),{recursive:true});
const candidates=[process.env.SKIN_TEST_BROWSER,...['PROGRAMFILES(X86)','PROGRAMFILES','LOCALAPPDATA'].flatMap(key=>process.env[key]?[path.join(process.env[key],'Microsoft','Edge','Application','msedge.exe'),path.join(process.env[key],'Google','Chrome','Application','chrome.exe')]:[])].filter(Boolean);
let executable;for(const file of candidates)if(await fs.access(file).then(()=>true,()=>false)){executable=file;break;}
if(!executable)throw new Error('Set SKIN_TEST_BROWSER to a Chromium/Edge executable for the isolated UI tests.');
const profile=await fs.mkdtemp(path.join(root,'tmp','browser-test-'));
const browser=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','about:blank'],{windowsHide:true,stdio:'ignore'});
let anchor;
try{
  let lines;for(let i=0;i<160;i++){try{lines=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await new Promise(r=>setTimeout(r,50));}}
  if(!lines||!/^\d+$/.test(lines[0])||!/^\/devtools\/browser\/[\w-]+$/.test(lines[1]))throw new Error('Isolated test browser did not expose a debugger');
  const port=Number(lines[0]),base='http://127.0.0.1:'+port;
  const version=await fetch(base+'/json/version').then(r=>r.json());if(version.webSocketDebuggerUrl!==`ws://127.0.0.1:${port}${lines[1]}`)throw new Error('Isolated browser identity changed');
  anchor=await new CdpSession(version.webSocketDebuggerUrl).open();
  const targets=await fetch(base+'/json/list').then(r=>r.json()),target=targets.find(t=>t.type==='page'&&t.url==='about:blank');if(!target)throw new Error('Isolated fixture page missing');
  const result=await promisify(execFile)(process.execPath,[path.join(root,'tests','test-renderer-v2.mjs'),target.webSocketDebuggerUrl],{windowsHide:true,timeout:30000,maxBuffer:40000,cwd:root});process.stdout.write(result.stdout);
}finally{if(anchor){await anchor.send('Browser.close').catch(()=>{});anchor.close();}else browser.kill();}
