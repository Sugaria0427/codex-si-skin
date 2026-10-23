import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const metadata=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
export const releaseName=`${metadata.name}-${metadata.version}-windows-x64`;
export const runtimeFiles=['cdp-client.mjs','settings-model.mjs','settings-store.mjs','theme-zip.mjs','skin-runtime.js','settings-ui.js','skin-service.mjs','launch-skin.mjs','launcher-core.mjs','launcher-windows.ps1','initialize-data.mjs'];
export const rootFiles=['package.json','package-lock.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','SECURITY.md','CHANGELOG.md','AGENTS.md','.gitignore','.gitattributes','Install.cmd','install.ps1'];
export async function filesUnder(directory){
  const result=[];
  for(const item of await fs.readdir(directory,{withFileTypes:true})){const full=path.join(directory,item.name);if(item.isSymbolicLink())throw new Error('Release input may not contain links: '+item.name);if(item.isDirectory())for(const file of await filesUnder(full))result.push(item.name+'/'+file);else if(item.isFile())result.push(item.name);}
  return result.sort();
}
export async function sourceFiles(){const result=[...rootFiles];for(const folder of ['src','scripts','tests','themes','vendor','assets','.github'])for(const file of await filesUnder(path.join(root,folder)))result.push(folder+'/'+file);return result.sort();}
