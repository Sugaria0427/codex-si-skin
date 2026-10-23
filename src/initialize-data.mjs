import path from 'node:path';
import {SettingsStore} from './settings-store.mjs';
const root=process.argv[2];
if(!root)throw new Error('Usage: node initialize-data.mjs <data-root>');
const store=await new SettingsStore(path.resolve(root)).init();
console.log(JSON.stringify({ok:true,theme:store.state.current.name,revision:store.state.revision}));
