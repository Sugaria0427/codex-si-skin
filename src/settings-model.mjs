// Parameter validation is deliberately separate from archive and image validation.
export const PALETTE = {
  background:'#102823', panel:'#16352E', panelAlt:'#20453C', accent:'#7CDAC1',
  accentAlt:'#B5EACF', secondary:'#8ACBC6', highlight:'#B8D790', text:'#EFF9F2',
  muted:'#B8D0C5', line:'#78BDA85C'
};
export const COMPONENTS = ['main','home','sidebar','navigation','header','composer','messages','assistant','tools','code','panels','settings','dialogs','menus'];
export const COPY_FIELDS = ['brandSubtitle','tagline','quote','statusText','projectPrefix','projectLabel'];
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const bounded = (v, fallback, min, max) => {
  if(v === undefined) return fallback;
  if(typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`参数应介于 ${min} 和 ${max} 之间。`);
  return Math.round(v * 1000) / 1000;
};
const bool = (v,fallback) => {if(v === undefined)return fallback;if(typeof v !== 'boolean')throw new Error('开关参数无效。');return v;};
const text = (v,fallback,max) => {if(v === undefined)return fallback;if(typeof v !== 'string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw new Error('文本参数无效或过长。');return v;};
const choice = (v, choices, fallback) => {if(v === undefined)return fallback;if(!choices.includes(v))throw new Error('选项参数无效。');return v;};
export function colorHex(value, fallback) {
  if(value === undefined)return fallback;
  if(typeof value !== 'string')throw new Error('颜色参数无效。');
  if(/^#[a-f\d]{6}([a-f\d]{2})?$/i.test(value))return value.toUpperCase();
  const m=value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?))?\s*\)$/);
  if(m && m.slice(1,4).every(n=>+n<=255))return '#'+m.slice(1,4).map(n=>(+n).toString(16).padStart(2,'0')).join('').toUpperCase();
  throw new Error('请输入 #RRGGBB 或 #RRGGBBAA 颜色。');
}
export function normalizeSettings(input) {
  if(!obj(input))throw new Error('主题参数无效。');
  const b=obj(input.background)?input.background:{};
  const ui=obj(input.interface)?input.interface:{};
  const art=obj(input.art)?input.art:{};
  const type=obj(input.typography)?input.typography:{};
  const out={schemaVersion:2,id:text(input.id,'',100),name:text(input.name,'一池春水',80).trim()||'未命名主题',appearance:choice(input.appearance,['dark','light','system'],'dark'),colors:{},art:{
    focusX:bounded(art.focusX,.45,0,1),focusY:bounded(art.focusY,.45,0,1),
    safeArea:choice(art.safeArea,['none','left','right','center'],'none'),taskMode:choice(art.taskMode,['ambient','quiet','full'],'ambient')
  },background:{
    asset:text(b.asset,'',128),enabled:bool(b.enabled,true),opacity:bounded(b.opacity,1,0,1),blur:bounded(b.blur,0,0,64),zoom:bounded(b.zoom,1,1,2),fit:choice(b.fit,['cover','contain'],'cover')
  },interface:{opacity:bounded(ui.opacity,.65,0,1),blur:bounded(ui.blur,14,0,48),radius:bounded(ui.radius,16,0,32),border:bounded(ui.border,1,0,4),shadow:choice(ui.shadow,['none','soft','strong'],'soft'),components:{}},typography:{
    enabled:bool(type.enabled,false),font:choice(type.font,['native','sans','serif','mono'],'native'),size:bounded(type.size,14,11,24),lineHeight:bounded(type.lineHeight,1.5,1,2.4)
  },copy:{},customCss:text(input.customCss,'',262144)};
  if(out.background.asset&&!/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(out.background.asset))throw new Error('背景图片引用无效。');
  for(const key of Object.keys(PALETTE))out.colors[key]=colorHex(input.colors?.[key],PALETTE[key]);
  for(const key of COMPONENTS){const c=obj(ui.components?.[key])?ui.components[key]:{};const clear=['main','home','navigation','assistant'].includes(key),settings=key==='settings';out.interface.components[key]={custom:bool(c.custom,clear||settings),opacity:bounded(c.opacity,clear?0:out.interface.opacity,0,1),blur:bounded(c.blur,clear?0:out.interface.blur,0,48),color:settings&&c.color===undefined?out.colors.panelAlt.slice(0,7):c.color==null?null:colorHex(c.color).slice(0,7)};}
  for(const key of COPY_FIELDS)out.copy[key]=text(input.copy?.[key],'',240);
  return out;
}
