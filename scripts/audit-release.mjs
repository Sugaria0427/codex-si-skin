import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root,metadata,releaseName,sourceFiles,filesUnder} from './release-files.mjs';
function entries(bytes){
  const end=bytes.length-22;assert.equal(bytes.readUInt32LE(end),0x06054b50);const count=bytes.readUInt16LE(end+10);let p=bytes.readUInt32LE(end+16);const result=new Map();
  for(let i=0;i<count;i++){
    assert.equal(bytes.readUInt32LE(p),0x02014b50);assert.equal(bytes.readUInt16LE(p+10),0);
    const length=bytes.readUInt32LE(p+24),nl=bytes.readUInt16LE(p+28),el=bytes.readUInt16LE(p+30),cl=bytes.readUInt16LE(p+32),offset=bytes.readUInt32LE(p+42),name=bytes.subarray(p+46,p+46+nl).toString('utf8');
    assert(!/(?:^\/|(^|\/)\.\.(?:\/|$)|\\|:)/.test(name),'Archive traversal: '+name);assert(!result.has(name));assert.equal(bytes.readUInt32LE(offset),0x04034b50);
    const begin=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28);result.set(name,bytes.subarray(begin,begin+length));p+=46+nl+el+cl;
  }
  assert.equal(p,end);return result;
}
const dist=path.join(root,'dist'),sourceName=`${metadata.name}-${metadata.version}-source`,stage=path.join(dist,releaseName);
const source=entries(await fs.readFile(path.join(dist,sourceName+'.zip')));
assert.deepEqual([...source.keys()].sort(),(await sourceFiles()).map(n=>sourceName+'/'+n).sort());
const windows=entries(await fs.readFile(path.join(dist,releaseName+'.zip')));
assert.deepEqual([...windows.keys()].sort(),(await filesUnder(stage)).map(n=>releaseName+'/'+n).sort());
const deniedPath=/(?:^|\/)(?:cdp-profile|node_modules|tmp|dist|\.git|themes-v2|images-v2|backups)(?:\/|$)|(?:^|\/)(?:state|settings-v2|service-v2|launcher-config|launcher-result)\.json$|\.log$|\.env(?:$|\.)/;
const personalPatterns=[/(?:api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[=:]\s*["'][A-Za-z0-9_-]{20,}/i,/sk-(?:proj-)?[A-Za-z0-9_-]{30,}/];
for(const archive of [source,windows])for(const [name,data]of archive){
  assert(!deniedPath.test(name),'Runtime/private file in archive: '+name);
  if(/\.(?:mjs|js|cs|ps1|cmd|json|md|yml|svg)$/.test(name)){
    const value=data.toString('utf8');for(const pattern of personalPatterns)assert(!pattern.test(value),'Personal path or credential in '+name);
    for(const match of value.matchAll(/C:[\\/]+Users[\\/]+([^\\/\s"'<>]+)/gi))assert(['fixture','test'].includes(match[1]),'Machine-specific account path in '+name);
  }
  assert(!/\.(?:jpg|jpeg|webp)$/i.test(name),'Uncleared background image in public release: '+name);
}
const manifest=JSON.parse(await fs.readFile(path.join(stage,'payload','manifest.json'),'utf8'));
for(const [file,digest]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await fs.readFile(path.join(stage,'payload',file))).digest('hex'),digest,file);
for(const line of (await fs.readFile(path.join(dist,'SHA256SUMS.txt'),'utf8')).trim().split('\n')){const [digest,file]=line.split('  ');assert.equal(createHash('sha256').update(await fs.readFile(path.join(dist,file))).digest('hex'),digest);}
assert.equal((await fs.readFile(path.join(stage,'payload','v2','CodexSkin.exe'))).subarray(0,2).toString(),'MZ');
console.log(JSON.stringify({pass:true,sourceFiles:source.size,windowsFiles:windows.size,checks:['explicit package allowlists','no runtime profiles or saved user data','no machine-specific user paths or credentials','no uncleared artwork','payload and archive SHA-256','compiled Windows GUI launcher']}));
