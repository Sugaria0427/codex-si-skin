import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { normalizeSettings, COMPONENTS } from './settings-model.mjs';
import { packThemeZip, unpackThemeZip } from './theme-zip.mjs';

const clone=v=>structuredClone(v);
async function plainPath(file){for(let p=path.resolve(file);;p=path.dirname(p)){const st=await fs.lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(st?.isSymbolicLink())throw new Error('换肤目录包含链接，请检查数据目录。');if(path.dirname(p)===p)break;}}
async function readJson(file){return JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));}
export async function atomicJson(file,value){
  const temp=file+'.'+randomUUID()+'.tmp';
  try{const handle=await fs.open(temp,'wx');try{await handle.writeFile(JSON.stringify(value)+'\n','utf8');await handle.sync();}finally{await handle.close();}await fs.rename(temp,file);}
  finally{await fs.rm(temp,{force:true});}
}
export class SettingsStore {
  constructor(root,engineRoot=path.join(root,'engine')){this.root=path.resolve(root);this.engineRoot=engineRoot;this.catalog=new Map();this.assets=new Map();this.cssCache=new Map();this.listeners=new Set();this.tail=Promise.resolve();this.metrics={drafts:0,saves:0,lastSaveMs:0,lastDraftMs:0,imageReads:0};}
  cacheAsset(asset,url){this.assets.delete(asset);this.assets.set(asset,url);while(this.assets.size>4){const candidate=[...this.assets.keys()].find(k=>k!==this.state?.current.background.asset&&k!==asset);if(!candidate)break;this.assets.delete(candidate);}return url;}
  async init(){
    await plainPath(this.root);
    this.stateFile=path.join(this.root,'settings-v2.json');this.savedRoot=path.join(this.root,'themes-v2');this.imageRoot=path.join(this.root,'images-v2');
    await plainPath(this.savedRoot);await plainPath(this.imageRoot);await fs.mkdir(this.savedRoot,{recursive:true});await fs.mkdir(this.imageRoot,{recursive:true});
    const validation=await import(pathToFileURL(path.join(this.engineRoot,'assets','safe-css-validator.mjs')));this.validateCss=validation.validateSafeCss;
    this.readImageMetadata=(await import(pathToFileURL(path.join(this.engineRoot,'scripts','image-metadata.mjs')))).readImageMetadata;
    const saved=await fs.readdir(this.savedRoot);
    for(const filename of saved){if(!/^[a-zA-Z0-9-]{1,100}\.json$/.test(filename))continue;await plainPath(path.join(this.savedRoot,filename));const entry=await readJson(path.join(this.savedRoot,filename));const current=this.validate(entry.current);if(current.id+'.json'!==filename)throw new Error('保存的主题标识与文件不一致。');this.catalog.set(current.id,{...entry,current});}
    try{this.state=await readJson(this.stateFile);this.state.current=this.validate(this.state.current);if(typeof this.state.enabled!=='boolean'||!Number.isSafeInteger(this.state.revision))throw new Error('当前外观配置无效。');}
    catch(error){if(error.code!=='ENOENT')throw error;if(await fs.access(path.join(this.root,'active-theme','theme.json')).then(()=>true,()=>false))await this.migrate();else await this.seed();}
    await this.imageData(this.state.current.background.asset);
    return this;
  }
  validate(value){const normalized=normalizeSettings(value);if(normalized.customCss.trim()&&!this.cssCache.has(normalized.customCss)){const result=this.validateCss(normalized.customCss);if(result?.valid===false||result?.ok===false)throw new Error('自定义样式无效。');if(this.cssCache.size>32)this.cssCache.clear();this.cssCache.set(normalized.customCss,true);}return normalized;}
  async assetFromBytes(bytes,extension){
    if(bytes.length>10*1024*1024||!this.readImageMetadata(bytes,extension))throw new Error('图片格式、尺寸或大小无效。');
    extension=extension==='.jpeg'?'.jpg':extension;if(!['.jpg','.png','.webp'].includes(extension))throw new Error('请选择 JPG、PNG 或 WebP 图片。');
    const asset=createHash('sha256').update(bytes).digest('hex')+extension;const file=path.join(this.imageRoot,asset);await plainPath(file);
    try{await fs.writeFile(file,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
    const url=`data:image/${extension==='.jpg'?'jpeg':extension.slice(1)};base64,${bytes.toString('base64')}`;this.cacheAsset(asset,url);return asset;
  }
  async imageData(asset){if(!asset)return '';if(this.assets.has(asset))return this.assets.get(asset);if(!/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(asset))throw new Error('图片引用无效。');const file=path.join(this.imageRoot,asset);await plainPath(file);const bytes=await fs.readFile(file);this.metrics.imageReads++;if(!this.readImageMetadata(bytes,path.extname(asset)))throw new Error('保存的背景图片损坏。');const url=`data:image/${asset.endsWith('.jpg')?'jpeg':path.extname(asset).slice(1)};base64,${bytes.toString('base64')}`;return this.cacheAsset(asset,url);}
  async fromLegacy(directory){
    await plainPath(directory);
    const theme=await readJson(path.join(directory,'theme.json'));if(!/^[a-zA-Z0-9._-]{1,128}\.(jpg|jpeg|png|webp)$/i.test(theme.image||''))throw new Error('旧主题图片引用无效。');
    await plainPath(path.join(directory,theme.image));const asset=await this.assetFromBytes(await fs.readFile(path.join(directory,theme.image)),path.extname(theme.image).toLowerCase());
    const styleKey=createHash('sha256').update(theme.id).digest('hex');let sidecar={};try{sidecar=await readJson(path.join(this.root,'advanced-settings',styleKey+'.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
    const style=sidecar.Style||{};const current=normalizeSettings({...theme,background:{asset,opacity:(style.Transparency??35)/100},interface:{opacity:1-(style.Transparency??35)/100,blur:style.Blur??14,radius:style.Radius??16,border:style.Border??1,shadow:style.Shadow??'soft'},typography:{enabled:style.Typography??false,font:style.Font??'native',size:style.FontSize??14,lineHeight:style.LineHeight??1.5},copy:theme,customCss:sidecar.OriginalCss||''});
    // The previous main surface and user bubbles did not blur the entire page.
    for(const key of ['main','home','messages','code'])current.interface.components[key]={custom:true,opacity:key==='messages'?.12:key==='code'?.5:0,blur:0};
    // Four rules generated by our previous panel are represented by the sliders now.
    const generated=/^\s*\[data-ds-part="(?:sidebar|header|composer|dialog)"\]\s*\{\s*backdrop-filter:\s*blur\(\d+(?:\.\d+)?px\);\s*(?:border-radius:\s*\d+(?:\.\d+)?px;\s*)?\}\s*$/gm;
    current.customCss=current.customCss.replace(generated,'').trim();return this.validate(current);
  }
  async migrate(){
    const current=await this.fromLegacy(path.join(this.root,'active-theme'));
    const legacy=path.join(this.root,'themes');for(const item of await fs.readdir(legacy,{withFileTypes:true})){if(!item.isDirectory()||item.name.startsWith('.'))continue;const theme=await this.fromLegacy(path.join(legacy,item.name));const entry={revision:1,updatedAt:new Date().toISOString(),current:theme};this.catalog.set(theme.id,entry);await atomicJson(path.join(this.savedRoot,theme.id+'.json'),entry);}
    let enabled=true;try{await fs.access(path.join(this.root,'paused'));enabled=false;}catch{}
    this.state={schemaVersion:2,revision:1,enabled,selectedId:current.id,current};await atomicJson(this.stateFile,this.state);
  }
  async seed(){
    const directory=path.join(this.root,'bundled-themes','si-yichi-chunshui');await plainPath(directory);
    const current=this.validate(await readJson(path.join(directory,'settings.json')));
    // Only named, bundled artwork is considered. No user profile is read or copied.
    const image=path.join(directory,'background.jpg');
    if(await fs.access(image).then(()=>true,()=>false)){await plainPath(image);current.background.asset=await this.assetFromBytes(await fs.readFile(image),'.jpg');current.background.enabled=true;}
    const entry=this.catalog.get(current.id)||{revision:1,updatedAt:new Date().toISOString(),current};
    if(!this.catalog.has(current.id)){this.catalog.set(current.id,entry);await atomicJson(path.join(this.savedRoot,current.id+'.json'),entry);}
    this.state={schemaVersion:2,revision:1,enabled:true,selectedId:current.id,current:clone(entry.current)};await atomicJson(this.stateFile,this.state);
  }
  onChange(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  async notify(kind){for(const fn of this.listeners)await fn(this.state,kind);}
  list(){return {revision:this.state.revision,enabled:this.state.enabled,selectedId:this.state.selectedId,current:clone(this.state.current),themes:[...this.catalog.values()].map(v=>({id:v.current.id,name:v.current.name,revision:v.revision})),metrics:{...this.metrics}};}
  async view(withImage=false){const data=this.list();if(withImage)data.image={asset:this.state.current.background.asset,url:await this.imageData(this.state.current.background.asset)};return data;}
  request(request){const task=()=>this.handle(request);const result=this.tail.then(task,task);this.tail=result.catch(()=>{});return result;}
  assertRevision(request){if(request.revision!==undefined&&request.revision!==this.state.revision){const error=new Error('外观已在另一个窗口更新，请重新载入后继续。');error.code='conflict';throw error;}}
  async persist(current,kind,extra={}){
    const next={...this.state,...extra,revision:this.state.revision+1,current};await atomicJson(this.stateFile,next);this.state=next;await this.notify(kind);
  }
  async handle(request){
    const start=performance.now();const op=request.op;
    if(op==='list'||op==='load')return this.view(request.knownAsset!==this.state.current.background.asset);
    if(op==='validateCss'){this.validate({...this.state.current,customCss:request.customCss});return {valid:true};}
    if(op==='draft'){
      this.assertRevision(request);const current=this.validate(request.current);await this.imageData(current.background.asset);await this.persist(current,'draft');this.metrics.drafts++;this.metrics.lastDraftMs=performance.now()-start;return {revision:this.state.revision,metrics:{...this.metrics}};
    }
    if(op==='save'||op==='saveAs'){
      this.assertRevision(request);const current=this.validate(request.current);await this.imageData(current.background.asset);
      current.id=op==='saveAs'||!this.catalog.has(this.state.selectedId)?randomUUID():this.state.selectedId;
      const previous=this.catalog.get(current.id);const entry={revision:(previous?.revision||0)+1,updatedAt:new Date().toISOString(),current};
      await atomicJson(path.join(this.savedRoot,current.id+'.json'),entry);this.catalog.set(current.id,entry);await this.persist(current,'save',{selectedId:current.id});this.metrics.saves++;this.metrics.lastSaveMs=performance.now()-start;return this.view();
    }
    if(op==='activate'){
      const entry=this.catalog.get(request.id);if(!entry)throw new Error('主题不存在。');const current=clone(entry.current);await this.imageData(current.background.asset);await this.persist(current,'activate',{selectedId:current.id,enabled:true});return this.view(true);
    }
    if(op==='enabled'){
      if(typeof request.enabled!=='boolean')throw new Error('外观开关无效。');await this.persist(this.state.current,'enabled',{enabled:request.enabled});return this.view();
    }
    if(op==='image'){
      if(typeof request.imageUpload?.name!=='string'||typeof request.imageUpload?.dataBase64!=='string'||request.imageUpload.dataBase64.length>14*1024*1024)throw new Error('图片上传无效。');
      const bytes=Buffer.from(request.imageUpload.dataBase64,'base64');if(bytes.toString('base64')!==request.imageUpload.dataBase64)throw new Error('图片编码无效。');const asset=await this.assetFromBytes(bytes,path.extname(request.imageUpload.name).toLowerCase());return {asset,url:await this.imageData(asset)};
    }
    if(op==='delete'){
      if(request.confirmed!==true)throw new Error('请确认删除主题。');if(request.id===this.state.selectedId)throw new Error('请先切换到另一个主题。');if(!this.catalog.has(request.id))throw new Error('主题不存在。');
      // Keep a recoverable snapshot instead of permanently deleting the theme.
      const archive=path.join(this.root,'themes-v2-archive');await fs.mkdir(archive,{recursive:true});await fs.rename(path.join(this.savedRoot,request.id+'.json'),path.join(archive,request.id+'-'+Date.now()+'.json'));this.catalog.delete(request.id);return this.view();
    }
    if(op==='export'){
      const current=this.validate(request.current||this.state.current);const url=await this.imageData(current.background.asset);const ext=current.background.asset?path.extname(current.background.asset):'.jpg';
      const legacy={schemaVersion:1,id:current.id||randomUUID(),name:current.name,appearance:current.appearance,colors:current.colors,art:current.art,...current.copy,image:url?'background'+ext:''};
      const files={'theme.json':JSON.stringify(legacy,null,2),'settings.json':JSON.stringify(current,null,2)};if(url)files['background'+ext]=Buffer.from(url.split(',')[1],'base64');if(current.customCss)files['theme.css']=current.customCss;
      if(current.background.asset){
        const bundled=path.join(this.root,'bundled-themes','si-yichi-chunshui');
        const shipped=await readJson(path.join(bundled,'theme.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
        if(shipped?.artwork?.sha256===current.background.asset.split('.')[0]){
          await plainPath(path.join(bundled,'ASSETS.md'));files['ASSETS.md']=await fs.readFile(path.join(bundled,'ASSETS.md'));legacy.artwork=clone(shipped.artwork);legacy.license=shipped.license;files['theme.json']=JSON.stringify(legacy,null,2);
        }
      }
      return {export:{name:current.name.replace(/[<>:"/\\|?*]/g,'_')+'.zip',dataBase64:packThemeZip(files).toString('base64')}};
    }
    if(op==='import'){
      const upload=request.archiveUpload;if(typeof upload?.dataBase64!=='string'||upload.dataBase64.length>45*1024*1024)throw new Error('主题包无效。');const files=unpackThemeZip(Buffer.from(upload.dataBase64,'base64'));const legacy=JSON.parse(files['theme.json'].toString('utf8').replace(/^\uFEFF/,''));
      const artwork=Object.keys(files).find(n=>n===legacy.image&&/\.(jpg|jpeg|png|webp)$/i.test(n));if(legacy.image&&!artwork)throw new Error('主题包缺少匹配的背景图片。');
      const asset=artwork?await this.assetFromBytes(files[artwork],path.extname(artwork).toLowerCase()):'';
      const source=files['settings.json']?JSON.parse(files['settings.json'].toString('utf8')):{...legacy,copy:legacy,customCss:files['theme.css']?.toString('utf8')||''};
      const current=this.validate({...source,id:randomUUID(),background:{...source.background,asset}});const entry={revision:1,updatedAt:new Date().toISOString(),current};await atomicJson(path.join(this.savedRoot,current.id+'.json'),entry);this.catalog.set(current.id,entry);return this.view();
    }
    throw new Error('不支持的外观操作。');
  }
}
