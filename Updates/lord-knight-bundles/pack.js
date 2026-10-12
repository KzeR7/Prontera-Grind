'use strict';
// Prototype only: static PGAP bundles, one retained appearance and one decoded view.
((root) => {
  const STANCES = ['idle', 'walk', 'attack'], DIRECTIONS = ['S', 'SE', 'NE'];
  const MAX_BYTES = 25 * 1024 * 1024, PIXELS = 320 * 280 * 4;
  const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
  const ensure = (ok, message) => { if (!ok) throw Error(message); };

  function pngMeta(bytes) {
    ensure(bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b), 'Invalid PNG signature');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 8, count = 0, declared = 0, ended = false;
    const durations = [];
    while (p + 12 <= bytes.length) {
      const size = view.getUint32(p), kind = new TextDecoder().decode(bytes.subarray(p+4,p+8));
      ensure(size <= bytes.length-p-12, 'Truncated PNG chunk');
      if (kind === 'IHDR') ensure(p===8, 'Duplicate PNG header');
      if (p === 8) ensure(kind === 'IHDR' && size === 13 && view.getUint32(p+8) === 320 && view.getUint32(p+12) === 280 && bytes[p+16] === 8 && bytes[p+17] === 6 && bytes[p+20] === 0, 'Unsupported PNG geometry');
      if (kind === 'acTL') { ensure(size === 8 && !declared, 'Invalid animation header'); declared = view.getUint32(p+8); }
      if (kind === 'fcTL') {
        ensure(size === 26, 'Invalid frame header');
        const w=view.getUint32(p+12), h=view.getUint32(p+16), x=view.getUint32(p+20), y=view.getUint32(p+24);
        ensure(w>0 && h>0 && x+w<=320 && y+h<=280 && bytes[p+32]<=2 && bytes[p+33]<=1, 'Frame outside canvas');
        const delay=1000*view.getUint16(p+28)/(view.getUint16(p+30)||100);
        ensure(delay>0 && delay<=10000, 'Invalid frame delay'); durations.push(delay); count++;
      }
      p += size+12;
      if (kind === 'IEND') { ensure(size === 0, 'Invalid PNG end'); ended=true; break; }
    }
    ensure(ended && p===bytes.length && count===declared && integer(count,2,16), 'Incomplete APNG');
    return {frames:count,durations};
  }

  async function parse(buffer, record, catalogSha256) {
    const bytes = new Uint8Array(buffer);
    ensure(bytes.length === record.bytes && bytes.length <= MAX_BYTES && bytes.length >= 10, 'Bundle size mismatch');
    ensure(await hash(bytes) === record.sha256, 'Bundle checksum mismatch');
    ensure(new TextDecoder().decode(bytes.subarray(0,6)) === 'PGAP1\n', 'Unsupported bundle');
    const length = new DataView(buffer).getUint32(6);
    ensure(length > 0 && length <= 128*1024 && length <= bytes.length-10, 'Invalid header size');
    const header = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(10,10+length)));
    ensure(header.schemaVersion===1 && header.width===320 && header.height===280 && header.anchor?.[0]===160 && header.anchor?.[1]===200 && header.catalogSha256===catalogSha256, 'Unsupported catalog/geometry');
    const a=header.appearance;
    ensure(a?.job===4008 && a.sex===record.sex && a.head===record.head && a.palette===record.palette && a.weapon==='sword' && a.outfit===4008 && a.garment===1 && a.shadow===true && JSON.stringify(a.headgear)==='[69,3]', 'Appearance identity mismatch');
    ensure(Array.isArray(header.entries) && header.entries.length===9, 'Nine native views required');
    const entries = new Map(); let offset=0;
    for (const entry of header.entries) {
      const key=entry.stance+'-'+entry.direction;
      ensure(STANCES.includes(entry.stance) && DIRECTIONS.includes(entry.direction) && !entries.has(key), 'Invalid/duplicate view');
      const action={idle:0,walk:8,attack:80}[entry.stance]+{S:0,SE:7,NE:5}[entry.direction];
      const sourceKey=record.id+'-'+entry.direction+(entry.stance==='attack'?'':'-'+entry.stance);
      ensure(entry.action===action && entry.key===sourceKey,'Native action identity mismatch');
      ensure(entry.offset===offset && integer(entry.length,1,MAX_BYTES) && offset+entry.length<=bytes.length-10-length, 'Invalid payload range');
      ensure(integer(entry.frames,2,16) && Array.isArray(entry.durations) && entry.durations.length===entry.frames && entry.durations.every(d=>Number.isFinite(d)&&d>0&&d<=10000), 'Invalid timing metadata');
      const png=bytes.subarray(10+length+offset,10+length+offset+entry.length);
      ensure(await hash(png)===entry.sha256, 'Animation checksum mismatch');
      const meta=pngMeta(png);
      ensure(meta.frames===entry.frames && meta.durations.every((d,i)=>Math.abs(d-entry.durations[i])<0.001), 'Animation timing mismatch');
      entries.set(key,{...entry, png}); offset+=entry.length;
    }
    ensure(offset===bytes.length-10-length, 'Trailing bundle bytes');
    return {record,header,entries,bytes:bytes.length};
  }

  function frameAt(durations, elapsed, loop=true, swingMs=null) {
    const total=durations.reduce((a,b)=>a+b,0);
    let time=Math.max(0,elapsed);
    if (swingMs!==null) time=time*total/swingMs;
    if (loop) time%=total;
    else if (time>=total) return durations.length-1;
    for(let i=0;i<durations.length;i++) { if(time<durations[i])return i; time-=durations[i]; }
    return durations.length-1;
  }

  class ActiveLook {
    constructor({catalogSha256,decode,fetcher=(...args)=>fetch(...args),budget=32*1024*1024}) {
      this.catalogSha256=catalogSha256; this.decode=decode; this.fetcher=fetcher; this.budget=budget;
      this.generation=0; this.current=null; this.bundle=null; this.queue=Promise.resolve(); this.controller=null;
    }
    select(record,stance,direction) {
      const generation=++this.generation;
      this.controller?.abort();
      const controller=new AbortController(); this.controller=controller;
      const run=async()=>{
        if(generation!==this.generation)return null;
        let strip=null;
        const timer=setTimeout(()=>controller.abort(),20000);
        try {
          ensure(STANCES.includes(stance)&&DIRECTIONS.includes(direction),'Unknown view');
          let bundle=this.bundle;
          if(!bundle || bundle.record.sha256!==record.sha256) {
            ensure(integer(record.bytes,10,MAX_BYTES),'Invalid declared bundle size');
            ensure(/^bundles\/[a-z0-9-]+\.pgap$/.test(record.file),'Invalid local bundle path');
            const response=await this.fetcher(record.file,{signal:controller.signal,cache:'no-store'});
            ensure(response.ok,'Bundle request failed: '+response.status);
            const reader=response.body.getReader(), chunks=[]; let size=0;
            try {
              while(true) {
                const {done,value}=await reader.read(); if(done)break;
                size+=value.byteLength; ensure(size<=record.bytes,'Bundle exceeds declared size'); chunks.push(value);
              }
            } catch(error) { await reader.cancel().catch(()=>{}); throw error; }
            finally { reader.releaseLock(); }
            const bytes=new Uint8Array(size); let offset=0;
            for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
            bundle=await parse(bytes.buffer,record,this.catalogSha256);
          }
          if(generation!==this.generation)return null;
          const entry=bundle.entries.get(stance+'-'+direction), resident=this.current?.decodedBytes||0;
          ensure(entry.frames*PIXELS+resident<=this.budget,'Decoded-view memory budget exceeded');
          strip=await this.decode(entry.png);
          ensure(strip && strip.w===320 && strip.h===280 && strip.n===entry.frames,'Decoder result mismatch');
          if(generation!==this.generation || controller.signal.aborted) { if(controller.signal.aborted&&generation===this.generation)throw Error('Loading timed out'); return null; }
          const previous=this.current;
          this.current={record,entry,strip,decodedBytes:entry.frames*PIXELS};
          this.bundle=bundle; strip=null;
          if(previous) { previous.strip.cv.width=0; previous.strip.cv.height=0; }
          return this.current;
        } catch(error) { if(generation===this.generation)throw error; return null; }
        finally { clearTimeout(timer); if(strip) { strip.cv.width=0; strip.cv.height=0; } }
      };
      const result=this.queue.then(run); this.queue=result.catch(()=>{}); return result;
    }
    dispose() {
      ++this.generation; this.controller?.abort();
      if(this.current) { this.current.strip.cv.width=0; this.current.strip.cv.height=0; }
      this.current=null; this.bundle=null;
    }
    stats() { return {residentLooks:this.bundle?1:0,decodedViews:this.current?1:0,decodedBytes:this.current?.decodedBytes||0,compressedBytes:this.bundle?.bytes||0}; }
  }
  const api={parse,pngMeta,frameAt,ActiveLook,hash};
  if(typeof module!=='undefined')module.exports=api; else root.AppearancePack=api;
})(typeof window!=='undefined'?window:globalThis);
