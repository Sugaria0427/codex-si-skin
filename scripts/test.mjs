import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {root} from './release-files.mjs';
process.chdir(root);await fs.mkdir('tmp',{recursive:true});
function run(file){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file],{cwd:root,windowsHide:true,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(file+' exited '+code)));});}
for(const file of ['tests/test-launcher.mjs','tests/test-settings-v2.mjs','tests/test-distribution.mjs','tests/test-startup-v2.mjs'])await run(file);
