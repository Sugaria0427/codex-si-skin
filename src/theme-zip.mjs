import { inflateRawSync } from 'node:zlib';
// Small, bounded ZIP support: data files only; never extracts paths to disk.
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let v=0xffffffff;for(const byte of bytes)v=table[(v^byte)&255]^(v>>>8);return (v^0xffffffff)>>>0;}
export function packThemeZip(files){
  const locals=[],central=[];let offset=0;
  for(const [filename,data] of Object.entries(files)){
    const name=Buffer.from(filename),bytes=Buffer.from(data),crc=crc32(bytes);
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt32LE(crc,14);h.writeUInt32LE(bytes.length,18);h.writeUInt32LE(bytes.length,22);h.writeUInt16LE(name.length,26);
    locals.push(h,name,bytes);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt32LE(crc,16);c.writeUInt32LE(bytes.length,20);c.writeUInt32LE(bytes.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=h.length+name.length+bytes.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);
}
export function unpackThemeZip(bytes){
  if(bytes.length>32*1024*1024)throw new Error('主题包超过 32 MiB。');
  let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(bytes.readUInt32LE(p)===0x06054b50){end=p;break;}
  if(end<0)throw new Error('主题 ZIP 目录无效。');
  const count=bytes.readUInt16LE(end+10),start=bytes.readUInt32LE(end+16),size=bytes.readUInt32LE(end+12);
  if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||bytes.readUInt16LE(end+8)!==count||count<1||count>8||start+size!==end||end+22+bytes.readUInt16LE(end+20)!==bytes.length)throw new Error('主题 ZIP 结构无效。');
  let p=start,total=0;const out={};
  for(let i=0;i<count;i++){
    if(p+46>end||bytes.readUInt32LE(p)!==0x02014b50)throw new Error('主题目录无效。');
    const flag=bytes.readUInt16LE(p+8),method=bytes.readUInt16LE(p+10),crc=bytes.readUInt32LE(p+16),compressed=bytes.readUInt32LE(p+20),length=bytes.readUInt32LE(p+24),nl=bytes.readUInt16LE(p+28),el=bytes.readUInt16LE(p+30),cl=bytes.readUInt16LE(p+32),offset=bytes.readUInt32LE(p+42);
    const name=bytes.subarray(p+46,p+46+nl).toString('utf8');p+=46+nl+el+cl;
    const allowed=['theme.json','theme.css','settings.json','ASSETS.md'].includes(name)||/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(jpg|jpeg|png|webp)$/i.test(name);
    if(p>end||flag&1||![0,8].includes(method)||!allowed||Object.hasOwn(out,name)||length>12*1024*1024||(name==='ASSETS.md'&&length>64*1024)||(total+=length)>14*1024*1024||offset+30>start||bytes.readUInt32LE(offset)!==0x04034b50)throw new Error('主题包含不允许的文件或过大数据。');
    const localNameLength=bytes.readUInt16LE(offset+26),localExtra=bytes.readUInt16LE(offset+28),dataStart=offset+30+localNameLength+localExtra;
    if(bytes.subarray(offset+30,offset+30+localNameLength).toString('utf8')!==name||bytes.readUInt16LE(offset+8)!==method||dataStart+compressed>start)throw new Error('主题文件头不一致。');
    const compressedData=bytes.subarray(dataStart,dataStart+compressed),data=method===0?compressedData:inflateRawSync(compressedData,{maxOutputLength:Math.max(1,length)});
    if(data.length!==length||crc32(data)!==crc)throw new Error('主题文件校验失败。');out[name]=data;
  }
  if(p!==end||!out['theme.json'])throw new Error('主题缺少 theme.json。');return out;
}
