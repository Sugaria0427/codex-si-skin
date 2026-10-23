/* Stable selectors and a fixed stylesheet give newly mounted UI its final paint. */
(() => {
  'use strict';
  const VERSION='2026.10.20.5';
  const cachedImage=window.__skinRuntime?.image;
  window.__skinRuntime?.cleanup();
  const S={
    main:'main:is(.main-surface,[data-app-shell-main-surface],[class*="_MainContentSurface_"])',
    home:'main [role="main"]',
    sidebar:'aside.app-shell-left-panel',
    navigation:'nav[data-app-navigation-rail]',
    header:'header:is(.app-header-tint,[data-app-shell-header-edge-scroll],[class*="_Header_"])',
    composer:':is(.composer-surface-chrome,[class*="_ComposerLayoutRoot_"],[data-composer-surface-variant][data-composer-radius-variant])',
    messages:'[data-user-message-bubble]',
    assistant:'[data-local-conversation-final-assistant]',
    tools:'[data-local-conversation-item-target-ids]',
    code:':is([data-code-block],.thread-scroll-container pre)',
    panels:':is(aside[data-app-shell-focus-area="right-panel"],[data-app-shell-titlebar-slot="content"][data-app-shell-focus-area="right-panel"])',
    settings:':is([class~="group/settings"] .rounded-2xl:has(>[class~="@container/settings-row"]),#dreamskin-integrated-settings .ds-tab-panel>.ds-card)',
    dialogs:'[role="dialog"]',
    menus:':is([role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]>*)'
  };
  const gate='html[data-skin-v2="on"]';
  const styles=[];const sheet=(id)=>{const s=document.createElement('style');s.id=id;(document.head||document.documentElement).append(s);styles.push(s);return s;};
  const base=sheet('skin-v2-structure'),vars=sheet('skin-v2-values'),custom=sheet('skin-v2-custom');
  const scoped=selector=>`${gate} ${selector}`;
  const partCss=Object.entries(S).map(([key,sel])=>`${scoped(sel)} {
    background-color:var(--skin-${key}-color) !important;
    backdrop-filter:var(--skin-${key}-filter) !important;
    -webkit-backdrop-filter:var(--skin-${key}-filter) !important;
    transition-property:none !important;
  }`).join('\n');
  base.textContent=`
${gate} { color-scheme:var(--skin-scheme); color:var(--skin-text); background:var(--skin-background); }
${gate} body { background:var(--skin-background) !important; color:var(--skin-text) !important; isolation:isolate; }
${gate} #root { background:transparent !important; }
${gate} :is([data-app-shell-frame],[class*="_MainContentClip_"],[class*="_Workspace_"]) {background-color:transparent !important;}
${gate} #skin-v2-background {position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;contain:strict;}
${gate} #skin-v2-background img {width:100%;height:100%;display:block;object-fit:var(--skin-image-fit);object-position:var(--skin-image-position);opacity:var(--skin-image-opacity);filter:var(--skin-image-filter);transform:scale(var(--skin-image-scale));}
${gate} .thread-scroll-container {background:transparent !important;}
${partCss}
${scoped(S.composer)},${scoped(S.tools)},${scoped(S.dialogs)},${scoped(S.menus)},${scoped(S.panels)} {border-radius:var(--skin-radius) !important;border:var(--skin-border) solid var(--skin-line) !important;box-shadow:var(--skin-shadow) !important;}
${scoped(S.messages)},${scoped(S.assistant)} {border-radius:var(--skin-radius) !important;}
/* The side conversation and its tab strip are separate shell nodes. Paint each
   once; nested viewports must stay clear so zero opacity/blur really clears it. */
${gate} aside[data-app-shell-focus-area="right-panel"] :is([data-app-shell-pane-content-viewport],[data-review-panel],[data-terminal-panel],[data-sidebar-panel]) {background-color:transparent !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;border:0 !important;border-radius:0 !important;box-shadow:none !important;}
${gate} aside[data-app-shell-focus-area="right-panel"] {border-start-start-radius:0 !important;border-start-end-radius:0 !important;border-block-start-width:0 !important;}
${gate} [data-app-shell-titlebar-slot="content"][data-app-shell-focus-area="right-panel"] {border-end-start-radius:0 !important;border-end-end-radius:0 !important;border-block-end-width:0 !important;box-shadow:none !important;}
${scoped(S.composer)} :is([data-composer-footer-responsive],[class*="_ComposerLayoutFooter_"],[class*="_footer_"]) {background:transparent !important;backdrop-filter:none !important;}
${scoped(S.tools)} {padding:8px 12px;}
${scoped(S.tools)} :is(.bg-surface-elevated-secondary,.bg-surface-elevated-primary) {background-color:transparent !important;}
/* Native reveal opacity/transform creates a temporary backdrop root. Keep the
   backdrop stable while preserving layout/height behavior and focus handling. */
${gate} .thread-scroll-container [style*="opacity:"][style*="translateY("] {opacity:1 !important;transform:none !important;}
${gate} .thread-scroll-container :is([data-state="open"],[data-state="closed"])[data-radix-collapsible-content] {animation:none !important;}
${gate} :is(.app-shell-main-content-top-fade,[data-app-shell-main-content-top-fade]) {background:transparent !important;}
${gate} [data-skin-copy]:empty {display:none;}
${gate}[data-skin-typography="on"] :is(body,#root) {font-family:var(--skin-font) !important;font-size:var(--skin-font-size) !important;line-height:var(--skin-line-height) !important;}
${gate}[data-skin-typography="on"] .thread-scroll-container {--font-ui-size:var(--skin-font-size);--font-size-chat:var(--skin-font-size);}
`;
  const tokenMap={
    '--color-token-bg-primary':'background','--color-text-primary-solid':'background','--color-text-primary-solid-hover':'background','--color-text-primary-solid-active':'background',
    '--color-background-primary-solid':'text','--color-background-primary-solid-hover':'text','--color-background-primary-solid-active':'text',
    '--color-token-foreground':'text','--color-token-text-primary':'text','--color-token-text-secondary':'muted','--color-token-text-tertiary':'muted',
    '--color-text-primary':'text','--color-text-secondary':'muted','--color-text-tertiary':'muted','--color-text':'text','--color-text-primary-surface':'text',
    '--color-token-text-link-foreground':'accent','--color-token-focus-border':'accentAlt','--color-token-interactive-border-focus':'accentAlt',
    '--color-text-info-surface':'secondary','--color-text-discovery-surface':'highlight',
    '--color-token-border':'line','--color-token-border-default':'line','--color-token-border-heavy':'line','--color-token-border-light':'line','--color-border':'line',
    '--color-token-input-border':'line','--color-background-user-message':'panelAlt','--color-background-user-message-compact':'panelAlt',
    '--color-background-composer-surface':'panel','--color-background-composer-action-bar':'panel','--color-background-execution-output':'panel',
    '--color-token-diff-surface':'panelAlt','--color-token-text-code-block-background':'panelAlt','--codeblock-background-color':'panelAlt',
    '--app-color-background-elevated-primary':'panel','--app-color-background-elevated-primary-opaque':'panel',
    '--app-color-background-elevated-secondary':'panelAlt','--app-color-background-elevated-secondary-opaque':'panelAlt'
  };
  const transparentTokens=['--color-token-bg-secondary','--color-token-bg-tertiary','--color-token-main-surface-primary','--app-color-background-surface','--app-color-background-surface-under'];
  let current=null,enabled=true,frame=0,disposed=false,imageAsset=cachedImage?.asset||'',imageUrl=cachedImage?.url||'',imageLayer=null,imageNode=null,imageGeneration=0;
  const metrics={applies:0,lastApplyMs:0,maximumApplyMs:0,imageDecodes:0,previewRequests:0};
  const rgba=(hex,opacity)=>{const color=hex.slice(1,7);return `rgb(${parseInt(color.slice(0,2),16)} ${parseInt(color.slice(2,4),16)} ${parseInt(color.slice(4,6),16)} / ${opacity})`;};
  function ensureLayer(){
    if(imageLayer?.isConnected)return;
    if(!document.body)return;
    imageLayer=document.getElementById('skin-v2-background')||document.createElement('div');imageLayer.id='skin-v2-background';imageLayer.setAttribute('aria-hidden','true');
    imageNode=imageLayer.querySelector('img')||document.createElement('img');imageNode.alt='';imageNode.decoding='async';imageNode.draggable=false;imageLayer.append(imageNode);document.body.prepend(imageLayer);if(imageUrl)imageNode.src=imageUrl;
  }
  async function setImage(asset,url){
    if(asset===imageAsset&&imageUrl)return;
    const generation=++imageGeneration;
    if(!url){imageAsset=asset;imageUrl='';imageNode?.removeAttribute('src');return;}
    const decoded=new Image();decoded.src=url;metrics.imageDecodes++;
    try{await decoded.decode();}catch{throw new Error('背景图片无法解码。');}
    if(generation!==imageGeneration||disposed)return;
    imageAsset=asset;imageUrl=url;ensureLayer();if(imageNode)imageNode.src=url;
  }
  function customCss(source){
    const aliases={root:gate,sidebar:scoped(S.sidebar),main:scoped(S.main),header:scoped(S.header),home:scoped(S.home),'home-hero':`${gate} [data-testid="home-icon"]`,'project-list':`${gate} .group\\/project-selector`,thread:`${gate} .thread-scroll-container`,message:scoped(S.messages),composer:scoped(S.composer),'composer-toolbar':`${scoped(S.composer)} [data-composer-footer-responsive]`,dialog:scoped(S.dialogs)};
    // Only server-validated community CSS reaches this method.
    return source.replace(/\[data-ds-part\s*=\s*["']([a-z-]+)["']\]/g,(_,name)=>aliases[name]||`${gate} [data-skin-unused]`).replace(/([\w-]+\s*:\s*[^;{}]+?)(;|(?=\}))/g,(_,declaration,end)=>declaration.replace(/\s*!important\s*$/,'')+' !important'+end);
  }
  function applyNow(){
    if(frame)cancelAnimationFrame(frame);frame=0;if(!current||disposed)return;
    const started=performance.now(),d=current,ui=d.interface,b=d.background;
    const css=[];const set=(k,v)=>css.push(`${k}:${v} !important;`);
    for(const [k,value]of Object.entries(d.colors)){
      set('--skin-'+k,value);set('--ds-theme-color-'+k.replace(/[A-Z]/g,l=>'-'+l.toLowerCase()),value);
    }
    for(const [key,color]of Object.entries(tokenMap))set(key,`var(--skin-${color})`);
    for(const key of transparentTokens)set(key,'transparent');
    set('--skin-scheme',d.appearance==='system'?(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):d.appearance);
    set('--skin-radius',ui.radius+'px');set('--skin-border',ui.border+'px');
    set('--skin-shadow',ui.shadow==='none'?'none':ui.shadow==='strong'?'0 8px 28px rgb(0 0 0 / .24)':'0 4px 16px rgb(0 0 0 / .12)');
    for(const key of Object.keys(S)){
      const override=ui.components[key],c=override?.custom?override:ui;
      const color=key==='main'||key==='home'?'background':key==='code'||key==='panels'||key==='settings'?'panelAlt':'panel';
      set(`--skin-${key}-color`,rgba(override?.color||d.colors[color],c.opacity));
      set(`--skin-${key}-filter`,c.blur===0?'none':`blur(${c.blur}px)`);
    }
    set('--skin-image-opacity',b.enabled?b.opacity:0);set('--skin-image-filter',b.blur?`blur(${b.blur}px)`:'none');set('--skin-image-scale',Math.max(b.zoom,1+b.blur/300));set('--skin-image-fit',b.fit);set('--skin-image-position',`${d.art.focusX*100}% ${d.art.focusY*100}%`);
    const fonts={native:'var(--font-ui-family,system-ui)',sans:'"Segoe UI","Microsoft YaHei UI",sans-serif',serif:'"Noto Serif CJK SC","SimSun",serif',mono:'"Cascadia Code",Consolas,monospace'};
    set('--skin-font',fonts[d.typography.font]);set('--skin-font-size',d.typography.size+'px');set('--skin-line-height',d.typography.lineHeight);
    const next=`${gate},${gate} body {${css.join('')}}`;if(vars.textContent!==next)vars.textContent=next;
    const customText=customCss(d.customCss||'');if(custom.textContent!==customText)custom.textContent=customText;
    document.documentElement.setAttribute('data-skin-typography',d.typography.enabled?'on':'off');
    if(enabled){document.documentElement.setAttribute('data-skin-v2','on');if(imageLayer)imageLayer.hidden=false;}
    else{document.documentElement.removeAttribute('data-skin-v2');if(imageLayer)imageLayer.hidden=true;}
    metrics.applies++;metrics.lastApplyMs=performance.now()-started;metrics.maximumApplyMs=Math.max(metrics.maximumApplyMs,metrics.lastApplyMs);
  }
  function preview(value){current=value;metrics.previewRequests++;if(!frame)frame=requestAnimationFrame(applyNow);}
  async function configure(data){
    if(data.current)current=data.current;if(typeof data.enabled==='boolean')enabled=data.enabled;ensureLayer();applyNow();
    if(data.image&&data.image.asset!==imageAsset)await setImage(data.image.asset,data.image.url);
  }
  function setEnabled(value){enabled=value;applyNow();}
  function cleanup(){disposed=true;if(frame)cancelAnimationFrame(frame);for(const s of styles)s.remove();imageLayer?.remove();document.documentElement.removeAttribute('data-skin-v2');document.documentElement.removeAttribute('data-skin-typography');document.removeEventListener('DOMContentLoaded',ready);if(window.__skinRuntime?.version===VERSION)delete window.__skinRuntime;}
  const ready=()=>{ensureLayer();applyNow();};document.addEventListener('DOMContentLoaded',ready,{once:true});
  window.__skinRuntime={version:VERSION,preview,flush:applyNow,configure,setEnabled,setImage,cleanup,selectors:S,metrics,get current(){return current;},get image(){return{asset:imageAsset,url:imageUrl};}};
})();
