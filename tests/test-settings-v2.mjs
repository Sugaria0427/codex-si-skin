import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SettingsStore } from '../src/settings-store.mjs';
import { normalizeSettings } from '../src/settings-model.mjs';
import { packThemeZip, unpackThemeZip } from '../src/theme-zip.mjs';

const root=await fs.mkdtemp(path.resolve('tmp','codex-skin-v2-test-'));
// Synthetic legacy input; never read the developer's installed themes.
const legacy={id:'legacy-fixture',name:'Legacy fixture',image:'pixel.png',colors:{accent:'#7CDAC1',background:'#102823'},art:{focusX:.45}};
for(const folder of ['active-theme','themes/legacy-fixture','advanced-settings'])await fs.mkdir(path.join(root,folder),{recursive:true});
for(const folder of ['active-theme','themes/legacy-fixture']){await fs.writeFile(path.join(root,folder,'theme.json'),JSON.stringify(legacy));await fs.writeFile(path.join(root,folder,'pixel.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));}
const engine=path.resolve('vendor/codex-dream-skin');
const store=await new SettingsStore(root,engine).init();
const initial=store.list(),originalAsset=initial.current.background.asset;
assert.equal(initial.current.colors.accent,'#7CDAC1');assert.equal(initial.current.colors.background,'#102823');assert.equal(initial.current.interface.opacity,.65);assert.equal(initial.current.interface.blur,14);assert.equal(initial.current.art.focusX,.45);
assert.deepEqual(initial.current.interface.components.settings,{custom:true,opacity:.65,blur:14,color:'#20453C'},'legacy themes seed an independent settings surface with the previous effective appearance');
const baseImageReads=store.metrics.imageReads,assetsBefore=await fs.readdir(path.join(root,'images-v2'));
let current=structuredClone(initial.current);current.interface.components.tools={custom:true,opacity:.42,blur:9,color:'#204050'};current.interface.components.settings={custom:true,opacity:.78,blur:6,color:'#123C45'};current.background.opacity=.71;current.background.blur=4;
await store.request({op:'draft',current,revision:store.state.revision});
assert.deepEqual(store.state.current.interface.components.tools,current.interface.components.tools);
assert.deepEqual(store.state.current.interface.components.settings,current.interface.components.settings);
assert.equal(store.catalog.get(initial.selectedId).current.background.blur,0,'draft must not overwrite a named theme');
const timings=[];
for(let i=0;i<20;i++){
  current.interface.blur=10+i%3;const start=performance.now();const response=await store.request({op:'save',current,revision:store.state.revision});timings.push(performance.now()-start);assert.equal(response.current.background.asset,originalAsset);
}
assert.equal(store.metrics.imageReads,baseImageReads,'parameter saves must reuse verified artwork');
assert.deepEqual(await fs.readdir(path.join(root,'images-v2')),assetsBefore,'parameter saves must not copy artwork');
assert.equal((await fs.readdir(root)).some(f=>f.endsWith('.zip')),false);
const oldRevision=store.state.revision;
await assert.rejects(store.request({op:'draft',current,revision:oldRevision-1}),/另一个窗口/);
for(const bad of [NaN,Infinity,-1,49])await assert.rejects(store.request({op:'draft',current:{...current,interface:{...current.interface,blur:bad}},revision:oldRevision}));
assert.equal(store.state.revision,oldRevision);
await assert.rejects(store.request({op:'draft',current:{...current,background:{...current.background,asset:'../../secret.png'}},revision:oldRevision}),/引用无效/);
await assert.rejects(store.request({op:'validateCss',customCss:'body { display:none; }'}));
await assert.rejects(store.request({op:'validateCss',customCss:'[data-ds-part="root"] { background-image:url(https://evil.test/a); }'}));
await store.request({op:'validateCss',customCss:'[data-ds-part="composer"] { border-radius: 12px; }'});
const exported=await store.request({op:'export',current});
const archive=Buffer.from(exported.export.dataBase64,'base64');const files=unpackThemeZip(archive);assert.equal(JSON.parse(files['settings.json']).background.blur,4);assert.deepEqual(JSON.parse(files['settings.json']).interface.components.settings,current.interface.components.settings,'export includes independently saved settings appearance');
const imported=await store.request({op:'import',archiveUpload:{name:'theme.zip',dataBase64:archive.toString('base64')}});assert.equal(imported.themes.length,2);
const importedId=imported.themes.find(t=>t.id!==initial.selectedId).id;
await store.request({op:'activate',id:importedId});assert.equal(store.state.current.background.asset,originalAsset);assert.equal(store.state.current.interface.components.tools.blur,9);assert.deepEqual(store.state.current.interface.components.settings,current.interface.components.settings,'import and theme activation preserve settings appearance');
await store.request({op:'enabled',enabled:false});assert.equal(store.state.enabled,false);
const reopened=await new SettingsStore(root,engine).init();assert.equal(reopened.state.enabled,false);assert.equal(reopened.state.current.interface.components.tools.opacity,.42);assert.deepEqual(reopened.state.current.interface.components.settings,current.interface.components.settings,'settings appearance survives backend startup');
await assert.rejects(reopened.request({op:'delete',id:importedId,confirmed:true}),/另一个主题/);
await reopened.request({op:'activate',id:initial.selectedId});await reopened.request({op:'delete',id:importedId,confirmed:true});assert.equal(reopened.catalog.size,1);assert.equal((await fs.readdir(path.join(root,'themes-v2-archive'))).length,1);
const secondTheme=structuredClone(reopened.state.current);secondTheme.name='独立设置页变体';secondTheme.interface.components.settings={custom:true,opacity:.31,blur:19,color:'#334455'};
const secondSaved=await reopened.request({op:'saveAs',current:secondTheme,revision:reopened.state.revision});await reopened.request({op:'activate',id:initial.selectedId});assert.deepEqual(reopened.state.current.interface.components.settings,current.interface.components.settings,'switching back restores the first theme settings appearance');await reopened.request({op:'activate',id:secondSaved.selectedId});assert.deepEqual(reopened.state.current.interface.components.settings,secondTheme.interface.components.settings,'switching themes restores the second independent settings appearance');
const restarted=await new SettingsStore(root,engine).init();assert.deepEqual(restarted.state.current.interface.components.settings,secondTheme.interface.components.settings,'the selected theme settings survive reopening the store');
const corrupted=Buffer.from(archive);corrupted[50]^=0x80;assert.throws(()=>unpackThemeZip(corrupted));
assert.throws(()=>unpackThemeZip(packThemeZip({'theme.json':'{}','../escape':'bad'})));
assert.throws(()=>normalizeSettings({...current,colors:{text:'var(--hack)'}}));
const sorted=timings.toSorted((a,b)=>a-b);
console.log(JSON.stringify({pass:true,checks:'migration to independent settings surface, draft/snapshot separation, atomic save, revision conflict, hostile parameters, CSS validation, archive integrity, settings appearance import/export, independent settings saved and switched per theme, image reuse, restore, settings persistence across backend startup, recoverable delete',parameterOnlySaveMs:{minimum:sorted[0],median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.floor(sorted.length*.95)],maximum:sorted.at(-1)},imageReadsDuringSaves:store.metrics.imageReads-baseImageReads,themeBytes:Buffer.byteLength(JSON.stringify(store.state.current)),fixture:root},null,2));
