import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {packThemeZip} from '../src/theme-zip.mjs';
import {root,metadata,releaseName,runtimeFiles,filesUnder,sourceFiles} from './release-files.mjs';
if(process.platform!=='win32')throw new Error('Windows release builds require the Windows .NET Framework C# compiler.');
const dist=path.join(root,'dist'),stage=path.join(dist,releaseName),payload=path.join(stage,'payload');
// A new stage directory on every build avoids including leftover assets.
const buildRoot=await fs.mkdtemp(path.join(await fs.mkdir(path.join(root,'tmp'),{recursive:true}).then(()=>path.join(root,'tmp')),'build-'));
const fresh=path.join(buildRoot,releaseName),freshPayload=path.join(fresh,'payload');
await fs.mkdir(path.join(freshPayload,'v2'),{recursive:true});
for(const file of runtimeFiles){
  let contents=await fs.readFile(path.join(root,'src',file),'utf8');
  if(['skin-service.mjs','skin-runtime.js','settings-ui.js'].includes(file))contents=contents.replace(/const VERSION='[^']+'/,`const VERSION='${metadata.version}'`);
  const bom=file.endsWith('.ps1')?'\uFEFF':'';await fs.writeFile(path.join(freshPayload,'v2',file),bom+contents.replace(/^\uFEFF/,''));
}
await fs.cp(path.join(root,'vendor','codex-dream-skin'),path.join(freshPayload,'engine'),{recursive:true});
await fs.cp(path.join(root,'themes'),path.join(freshPayload,'bundled-themes'),{recursive:true});
await fs.copyFile(path.join(root,'LICENSE'),path.join(freshPayload,'LICENSE'));
await fs.copyFile(path.join(root,'THIRD_PARTY_NOTICES.md'),path.join(freshPayload,'THIRD_PARTY_NOTICES.md'));
for(const file of ['README.md','LICENSE','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','SECURITY.md','CHANGELOG.md','Install.cmd','install.ps1'])await fs.copyFile(path.join(root,file),path.join(fresh,file));
await fs.mkdir(path.join(fresh,'assets'),{recursive:true});await fs.copyFile(path.join(root,'assets','si-skin.svg'),path.join(fresh,'assets','si-skin.svg'));
const notice=await fs.readFile(path.join(root,'THIRD_PARTY_NOTICES.md'),'utf8');
await fs.writeFile(path.join(fresh,'THIRD_PARTY_NOTICES.md'),notice.replaceAll('](vendor/codex-dream-skin/LICENSE)','](payload/engine/LICENSE)').replaceAll('](themes/si-yichi-chunshui/ASSETS.md)','](payload/bundled-themes/si-yichi-chunshui/ASSETS.md)'));
await fs.writeFile(path.join(freshPayload,'THIRD_PARTY_NOTICES.md'),notice.replaceAll('](vendor/codex-dream-skin/LICENSE)','](engine/LICENSE)').replaceAll('](themes/si-yichi-chunshui/ASSETS.md)','](bundled-themes/si-yichi-chunshui/ASSETS.md)'));
const readme=await fs.readFile(path.join(root,'README.md'),'utf8'),license=await fs.readFile(path.join(root,'LICENSE'),'utf8');
await fs.writeFile(path.join(fresh,'README.md'),readme.replaceAll('](themes/si-yichi-chunshui/ASSETS.md)','](payload/bundled-themes/si-yichi-chunshui/ASSETS.md)'));
await fs.writeFile(path.join(fresh,'LICENSE'),license.replaceAll('themes/si-yichi-chunshui/','payload/bundled-themes/si-yichi-chunshui/'));
await fs.writeFile(path.join(freshPayload,'LICENSE'),license.replaceAll('themes/si-yichi-chunshui/','bundled-themes/si-yichi-chunshui/'));
const compiler=path.join(process.env.WINDIR,'System32','WindowsPowerShell','v1.0','powershell.exe');
await promisify(execFile)(compiler,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts','compile-launcher.ps1'),'-SourceFile',path.join(root,'src','codex-skin-launcher.cs'),'-OutputDirectory',path.join(freshPayload,'v2')],{windowsHide:true,timeout:30000});
const manifest={name:metadata.name,version:metadata.version,platform:'windows-x64',files:{}};
for(const file of await filesUnder(freshPayload))manifest.files[file]=createHash('sha256').update(await fs.readFile(path.join(freshPayload,file))).digest('hex');
await fs.writeFile(path.join(freshPayload,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.mkdir(dist,{recursive:true});
// Preserve a previous build for inspection rather than removing it recursively.
if(await fs.access(stage).then(()=>true,()=>false))await fs.rename(stage,path.join(buildRoot,'previous-build'));
await fs.rename(fresh,stage);
const windows={};for(const file of await filesUnder(stage))windows[releaseName+'/'+file]=await fs.readFile(path.join(stage,file));
const source={};for(const file of await sourceFiles())source[`${metadata.name}-${metadata.version}-source/${file}`]=await fs.readFile(path.join(root,file));
const themes={};for(const file of ['theme.json','settings.json','background.jpg','ASSETS.md'])themes[file]=await fs.readFile(path.join(root,'themes','si-yichi-chunshui',file));
const products={
  [`${releaseName}.zip`]:packThemeZip(windows),
  [`${metadata.name}-${metadata.version}-source.zip`]:packThemeZip(source),
  [`si-yichi-chunshui-${metadata.version}.zip`]:packThemeZip(themes)
};
for(const [file,data]of Object.entries(products))await fs.writeFile(path.join(dist,file),data);
await fs.writeFile(path.join(dist,'SHA256SUMS.txt'),Object.entries(products).map(([file,data])=>createHash('sha256').update(data).digest('hex')+'  '+file).join('\n')+'\n');
console.log(JSON.stringify({ok:true,version:metadata.version,artifacts:Object.entries(products).map(([name,data])=>({name,bytes:data.length})),stage:payload},null,2));
