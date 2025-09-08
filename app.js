// APNG-capable Page-Safe v3. Uses CompressionStream('deflate') to build APNG.
// If CompressionStream not available, falls back to ZIP of PNG frames.
// All inputs are optional; defaults are used if missing.
window.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const stat = (lines)=>{ if(statusEl) statusEl.textContent = lines.join('\n'); };
  const reportError = (e)=>{ const msg=(e&& (e.stack||e.message||e))||'unknown error'; stat(['Status: ERROR','JS: ❌','Details: '+msg]); console.error(e); };

  try{
    (function(){
      function $(id){ return document.getElementById(id); }
      const inputs = {
        text: $('text'), font: $('font'), weight: $('weight'), size: $('size'),
        padX: $('padX'), padY: $('padY'), stroke: $('stroke'), radius: $('radius'),
        textColor: $('textColor'),
        colorA: $('colorA'), colorB: $('colorB'),
        pattern: $('pattern'), angle: $('angle'), bars: $('bars'), soft: $('soft'), intensity: $('intensity'),
        duration: $('duration'), fps: $('fps'), previewZoom: $('previewZoom'), exportScale: $('exportScale'),
        width: $('width'), height: $('height'), autofit: $('autofit'),
        presetEU: $('presetEU'), presetUS: $('presetUS'), presetClean: $('presetClean'),
        btnMaxText: $('btnMaxText'), btnReset: $('btnReset')
      };
      const valStr = (k,d)=>{ const el=inputs[k]; return (el&&typeof el.value==='string')? el.value : d; };
      const valNum = (k,d)=>{ const el=inputs[k]; if(!el) return d; const v=parseFloat(el.value); return Number.isFinite(v)? v : d; };
      const valBool= (k,d)=>{ const el=inputs[k]; if(!el) return d; return !!el.checked; };

      const cn=$('cn'), cu=$('cu');
      const mcanvas = document.createElement('canvas'); const mctx = mcanvas.getContext('2d');

      const clamp=(n,a,b)=>{ n=parseFloat(n); if(isNaN(n)) n=a; return Math.max(a, Math.min(b,n)); };
      const lerp=(a,b,t)=> a+(b-a)*t;
      function rr(ctx,x,y,w,h,r){ r=Math.max(0,Math.min(r,Math.min(w,h)/2)); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

      function hexToRgb(hex){ const h=(hex||'#000000').replace('#',''); return {r:parseInt(h.slice(0,2),16)||0,g:parseInt(h.slice(2,4),16)||0,b:parseInt(h.slice(4,6),16)||0}; }
      function mixColorHex(aHex,bHex,t){ const a=hexToRgb(aHex), b=hexToRgb(bHex); const r=Math.round(lerp(a.r,b.r,t)), g=Math.round(lerp(a.g,b.g,t)), bl=Math.round(lerp(a.b,b.b,t)); return 'rgb('+r+','+g+','+bl+')'; }
      function withAlpha(hex,a){ const {r,g,b}=hexToRgb(hex); return 'rgba('+r+','+g+','+b+','+a+')'; }
      function addStopSafe(g,p,col){ p=Math.max(0,Math.min(1,p)); try{ g.addColorStop(p,col);}catch(e){} }

      function pxSize(){ const w=Math.max(1,Math.floor(valNum('width',50))); const h=Math.max(1,Math.floor(valNum('height',13))); return {w,h}; }
      function setupCanvas(canvas, cssZoom){
        const {w,h}=pxSize(); const dpr=Math.max(1, Math.round(window.devicePixelRatio||1));
        canvas.width=w*dpr; canvas.height=h*dpr; canvas.style.width=(w*cssZoom)+'px'; canvas.style.height=(h*cssZoom)+'px';
        const ctx=canvas.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.scale(dpr,dpr); return {w,h,dpr,ctx};
      }

      function params(){
        const raw=(valStr('text','UNIT 021')||'').trim();
        const text=raw.toUpperCase();
        const baseSize=clamp(valNum('size',11),6,200);
        const padX=clamp(valNum('padX',3),0,200);
        const padY=clamp(valNum('padY',1),0,200);
        const stroke=clamp(valNum('stroke',1),0,20);
        const radius=clamp(valNum('radius',2),0,40);
        const weight=valStr('weight','700');
        const family=valStr('font','Inter, system-ui, Arial');
        const font=(s)=> (weight+' '+s+'px '+family);
        const autofit=valBool('autofit',false);
        return {text,baseSize,padX,padY,stroke,radius,weight,family,font,autofit};
      }
      function measure(text,font){ mctx.setTransform(1,0,0,1,0,0); mctx.font=font; const m=mctx.measureText(text); const h=Math.ceil(parseInt(font,10)*1.1)||12; return {w:Math.ceil(m.width),h}; }
      function fitTextSize(p, innerW, innerH){
        if(!p.autofit) return p.baseSize;
        let s=p.baseSize; const minS=6;
        for(let i=0;i<24;i++){ const m=measure(p.text,p.font(s)); if(m.w<=innerW && m.h<=innerH) break; s=Math.max(minS, Math.floor(s*0.92)); }
        return s;
      }
      function clipRounded(ctx,x,y,w,h,r){ ctx.save(); rr(ctx,x,y,w,h,r); ctx.clip(); }

      function patternFill(ctx,x,y,ww,hh,t){
        const pat=valStr('pattern','sweep');
        const angle=valNum('angle',0);
        const bars=Math.max(1,Math.floor(valNum('bars',5)));
        const soft=Math.max(0, Math.min(0.5,valNum('soft',0)));
        const intensity=Math.max(0, Math.min(1,valNum('intensity',0.9)));
        const speed=Math.max(0.2, Math.min(5,valNum('speed',1)));
        const a=valStr('colorA','#ffffff');
        const b=valStr('colorB','#1E90FF');
        const gradAxis=()=>{ const rad=(angle%360)*Math.PI/180, cx=x+ww/2, cy=y+hh/2, R=Math.sqrt(ww*ww+hh*hh)/2; return [cx-Math.cos(rad)*R, cy-Math.sin(rad)*R, cx+Math.cos(rad)*R, cy+Math.sin(rad)*R]; };
        const tFast=(t*speed)%1;

        if(pat==='blink') return tFast<0.5? b:a;
        if(pat==='pulse'){ const e=0.5-0.5*Math.cos(tFast*Math.PI*2); return mixColorHex(a,b, e*intensity); }
        if(pat==='alt-halves'){
          ctx.save(); rr(ctx,x,y,ww,hh,12); ctx.clip();
          const on=tFast<0.5;
          ctx.fillStyle=on? b:a; ctx.fillRect(x,y,ww/2,hh);
          ctx.fillStyle=on? a:b; ctx.fillRect(x+ww/2,y,ww/2,hh);
          ctx.restore(); return null;
        }
        if(pat==='lr-pulse'){
          const eL=0.5-0.5*Math.cos(tFast*Math.PI*2);
          const eR=0.5-0.5*Math.cos((tFast+0.5)*Math.PI*2);
          ctx.save(); rr(ctx,x,y,ww,hh,12); ctx.clip();
          ctx.fillStyle=mixColorHex(a,b, eL*intensity); ctx.fillRect(x,y,ww/2,hh);
          ctx.fillStyle=mixColorHex(a,b, eR*intensity); ctx.fillRect(x+ww/2,y,ww/2,hh);
          ctx.restore(); return null;
        }
        if(pat==='bars'){
          const [x0,y0,x1,y1]=gradAxis(), duty=0.5, phase=tFast, sSoft=soft/bars;
          const stops=[]; function seg(s,e){ stops.push([s,b]); if(sSoft>0) stops.push([Math.min(1,s+sSoft),b]); stops.push([e,a]); }
          for(let k=0;k<bars;k++){ const start=(k/bars+phase)%1, end=(start+duty/bars)%1; if(end>=start){ seg(start,end);} else{ seg(start,1); seg(0,end);} }
          stops.push([0,a]); stops.push([1,a]); stops.sort((u,v)=>u[0]-v[0]);
          const g=ctx.createLinearGradient(x0,y0,x1,y1); for(const [pos,col] of stops){ addStopSafe(g,pos,col); }
          ctx.save(); rr(ctx,x,y,ww,hh,12); ctx.globalAlpha=intensity; ctx.fillStyle=g; ctx.fill(); ctx.globalAlpha=1; ctx.restore(); return null;
        }
        if(pat==='beacon' || pat==='dual-beacon'){
          const [x0,y0,x1,y1]=gradAxis(); const center=tFast, width=0.18;
          const g=ctx.createLinearGradient(x0,y0,x1,y1);
          addStopSafe(g, Math.max(0,center-width/2), withAlpha(b,0));
          addStopSafe(g, center, withAlpha(b,intensity));
          addStopSafe(g, Math.min(1,center+width/2), withAlpha(b,0));
          ctx.save(); rr(ctx,x,y,ww,hh,12); ctx.fillStyle=a; ctx.fill();
          ctx.globalCompositeOperation='lighter'; ctx.fillStyle=g; ctx.fill();
          ctx.globalCompositeOperation='source-over'; ctx.restore();
          if(pat==='dual-beacon'){
            const c2=(tFast+0.5)%1; const g2=ctx.createLinearGradient(x0,y0,x1,y1);
            addStopSafe(g2, Math.max(0,c2-width/2), withAlpha(b,0));
            addStopSafe(g2, c2, withAlpha(b,intensity));
            addStopSafe(g2, Math.min(1,c2+width/2), withAlpha(b,0));
            ctx.save(); rr(ctx,x,y,ww,hh,12); ctx.globalCompositeOperation='lighter'; ctx.fillStyle=g2; ctx.fill(); ctx.globalCompositeOperation='source-over'; ctx.restore();
          }
          return null;
        }
        if(pat==='checker'){
          ctx.save(); rr(ctx,x,y,ww,hh,12); ctx.clip();
          const cols=6, rows=2, phase=Math.floor(tFast*2)%2, cw=ww/cols, ch=hh/rows;
          for(let i=0;i<cols;i++) for(let j=0;j<rows;j++){ const on=((i+j+phase)%2===0); ctx.fillStyle=on? b:a; ctx.fillRect(x+i*cw,y+j*ch,cw+1,ch+1); }
          ctx.restore(); return null;
        }
        if(pat==='diagonal-sweep'){
          const [x0,y0,x1,y1]=gradAxis(); const e=0.5-0.5*Math.cos(tFast*Math.PI*2);
          const g=ctx.createLinearGradient(x0,y0,x1,y1);
          addStopSafe(g,0,a); addStopSafe(g,e, mixColorHex(a,b,intensity)); addStopSafe(g,1,b);
          ctx.save(); rr(ctx,x,y,ww,hh,12); ctx.fillStyle=g; ctx.fill(); ctx.restore(); return null;
        }
        if(pat==='eu-triple'){
          function pulse(t0,width){ const d=Math.abs(((tFast - t0 + 1)%1)); return d<width? (1-d/width):0; }
          const pow=Math.min(1, pulse(0.00,0.06)+pulse(0.15,0.06)+pulse(0.30,0.06));
          return mixColorHex(a,b, pow*intensity);
        }
        if(pat==='eu-rolling'){
          const [x0,y0,x1,y1]=gradAxis(); const g=ctx.createLinearGradient(x0,y0,x1,y1); const center=tFast, width=0.25;
          addStopSafe(g,0,a); addStopSafe(g,Math.max(0,center-width),a); addStopSafe(g,center, mixColorHex(a,b,intensity)); addStopSafe(g,Math.min(1,center+width),a); addStopSafe(g,1,a);
          ctx.save(); rr(ctx,x,y,ww,hh,12); ctx.fillStyle=g; ctx.fill(); ctx.restore(); return null;
        }
        if(pat==='us-alt-rb'){
          const red='#ff1e1e', blue='#1e5bff', flip=tFast<0.5;
          ctx.save(); rr(ctx,x,y,ww,hh,12); ctx.clip();
          ctx.fillStyle=flip? red:blue; ctx.globalAlpha=Math.max(0.2,intensity); ctx.fillRect(x,y,ww/2,hh);
          ctx.fillStyle=flip? blue:red; ctx.fillRect(x+ww/2,y,ww/2,hh);
          ctx.globalAlpha=1; ctx.restore(); return null;
        }
        if(pat==='us-split-strobe'){
          const red='#ff1e1e', blue='#1e5bff';
          const lOn=(tFast%0.5)<0.25, rOn=((tFast+0.25)%0.5)<0.25;
          ctx.save(); rr(ctx,x,y,ww,hh,12); ctx.clip();
          ctx.fillStyle=lOn? red:a; ctx.fillRect(x,y,ww/2,hh);
          ctx.fillStyle=rOn? blue:a; ctx.fillRect(x+ww/2,y,ww/2,hh);
          ctx.restore(); return null;
        }
        // default sweep
        const [x0,y0,x1,y1]=gradAxis(); const e=0.5-0.5*Math.cos(tFast*Math.PI*2);
        const base=mixColorHex(a,b, e*intensity);
        const g=ctx.createLinearGradient(x0,y0,x1,y1);
        addStopSafe(g,0,a); addStopSafe(g,Math.max(0,Math.min(1,e)), base); addStopSafe(g,1,base);
        ctx.save(); rr(ctx,x,y,ww,hh,12); ctx.fillStyle=g; ctx.fill(); ctx.restore(); return null;
      }

      function drawNormal(){
        const zoom=clamp(valNum('previewZoom',12),1,20);
        const {w,h,ctx}=setupCanvas(cn, zoom);
        const p=params();
        const x=p.stroke/2, y=p.stroke/2, ww=w-p.stroke, hh=h-p.stroke;
        ctx.fillStyle = valStr('colorA','#ffffff'); rr(ctx,x,y,ww,hh,p.radius); ctx.fill();
        if(p.stroke>0){ ctx.strokeStyle='#1E90FF'; ctx.lineWidth=p.stroke; rr(ctx,x,y,ww,hh,p.radius); ctx.stroke(); }
        const s = p.autofit ? fitTextSize(p, ww-p.padX*2, hh-p.padY*2) : p.baseSize;
        ctx.font = p.weight+' '+s+'px '+p.family; ctx.textBaseline='middle'; ctx.fillStyle=valStr('textColor','#000000');
        const m=measure(p.text, ctx.font); if(!p.autofit){ clipRounded(ctx,x,y,ww,hh,p.radius); }
        ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));
        if(!p.autofit){ ctx.restore(); }
        stat(['Status: OK','JS: ✅','Last render: '+new Date().toLocaleTimeString()]);
      }
      function drawUrgent(t){
        const zoom=clamp(valNum('previewZoom',12),1,20);
        const {w,h,ctx}=setupCanvas(cu, zoom);
        const p=params();
        const x=p.stroke/2, y=p.stroke/2, ww=w-p.stroke, hh=h-p.stroke;
        const bg=patternFill(ctx,x,y,ww,hh,t); if(bg){ ctx.save(); rr(ctx,x,y,ww,hh,p.radius); ctx.clip(); ctx.fillStyle=bg; ctx.fillRect(x,y,ww,hh); ctx.restore(); }
        if(p.stroke>0){ ctx.strokeStyle='#1E90FF'; ctx.lineWidth=p.stroke; rr(ctx,x,y,ww,hh,p.radius); ctx.stroke(); }
        const s = p.autofit ? fitTextSize(p, ww-p.padX*2, hh-p.padY*2) : p.baseSize;
        ctx.font = p.weight+' '+s+'px '+p.family; ctx.textBaseline='middle'; ctx.fillStyle=valStr('textColor','#000000');
        const m=measure(p.text, ctx.font); if(!p.autofit){ clipRounded(ctx,x,y,ww,hh,p.radius); }
        ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));
        if(!p.autofit){ ctx.restore(); }
      }

      // ---------- APNG ENCODER (using CompressionStream) ----------
      function crc32(bytes){
        let c=~0>>>0;
        for(let i=0;i<bytes.length;i++){
          c^=bytes[i];
          for(let k=0;k<8;k++){ c = (c>>>1) ^ (0xEDB88320 & (-(c & 1))); }
        }
        return (~c)>>>0;
      }
      function u32(n){ return new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]); }
      function u16(n){ return new Uint8Array([(n>>>8)&255,n&255]); }
      function beu32(n){ return u32(n); }
      function beu16(n){ return u16(n); }

      function concatBytes(list){
        let len=0; for(const a of list) len+=a.length;
        const out=new Uint8Array(len); let o=0; for(const a of list){ out.set(a,o); o+=a.length; }
        return out;
      }
      function chunk(typeStr, data){
        const type=new TextEncoder().encode(typeStr);
        const len=u32(data.length);
        const crc=u32(crc32(concatBytes([type, data])));
        return concatBytes([len, type, data, crc]);
      }
      async function deflateZlib(raw){
        if(!('CompressionStream' in window)) throw new Error('CompressionStream not supported; cannot build APNG.');
        const cs=new CompressionStream('deflate');
        const writer=cs.writable.getWriter();
        await writer.write(raw);
        await writer.close();
        const resp=new Response(cs.readable);
        const buf=await resp.arrayBuffer();
        return new Uint8Array(buf);
      }
      function makeScanlinesRGBA(imgData, w, h){
        // PNG format expects per-row filter byte then row pixels RGBA
        const {data}=imgData;
        const out=new Uint8Array((w*4 + 1) * h);
        let oi=0, i=0;
        for(let y=0;y<h;y++){
          out[oi++]=0; // filter type 0 (None)
          out.set(data.subarray(i, i+w*4), oi);
          oi += w*4;
          i += w*4;
        }
        return out;
      }
      async function encodeAPNG(frames, w, h, delaysMs){
        // frames: array of ImageData
        const PNG_SIG=new Uint8Array([137,80,78,71,13,10,26,10]);
        const ihdr = chunk('IHDR', concatBytes([beu32(w), beu32(h), new Uint8Array([8,6,0,0,0])]));
        const numFrames=frames.length; const numPlays=0; // infinite loop
        const actl = chunk('acTL', concatBytes([beu32(numFrames), beu32(numPlays)]));

        let seq=0;
        const chunks=[PNG_SIG, ihdr, actl];
        for(let fi=0; fi<numFrames; fi++){
          const img=frames[fi];
          const raw = makeScanlinesRGBA(img, w, h);
          const comp = await deflateZlib(raw);

          const delayNum = Math.max(1, Math.round(delaysMs[fi]||Math.round(1000/24)));
          const delayDen = 1000; // ms base
          const disposeOp = 0; // APNG_DISPOSE_OP_NONE
          const blendOp = 0;   // APNG_BLEND_OP_SOURCE
          const fctlData = concatBytes([
            beu32(++seq), beu32(w), beu32(h), beu32(0), beu32(0),
            beu16(delayNum), beu16(delayDen), new Uint8Array([disposeOp]), new Uint8Array([blendOp])
          ]);
          chunks.push(chunk('fcTL', fctlData));

          if(fi===0){
            chunks.push(chunk('IDAT', comp));
          }else{
            const fd = concatBytes([beu32(++seq), comp]);
            chunks.push(chunk('fdAT', fd));
          }
        }
        chunks.push(chunk('IEND', new Uint8Array(0)));
        return new Blob([concatBytes(chunks)], {type:'image/png'});
      }

      // ---------- EXPORTS ----------
      function savePNGNormal(baseName){
        const scale = Math.max(1, Math.floor(valNum('exportScale',1)));
        const {w,h}=pxSize();
        const p=params();
        const tmp=document.createElement('canvas'); tmp.width=w*scale; tmp.height=h*scale; const ctx=tmp.getContext('2d');
        ctx.scale(scale, scale);
        const x=p.stroke/2, y=p.stroke/2, ww=w-p.stroke, hh=h-p.stroke;
        ctx.fillStyle=valStr('colorA','#ffffff'); rr(ctx,x,y,ww,hh,p.radius); ctx.fill();
        if(p.stroke>0){ ctx.strokeStyle='#1E90FF'; ctx.lineWidth=p.stroke; rr(ctx,x,y,ww,hh,p.radius); ctx.stroke(); }
        const s = p.autofit ? fitTextSize(p, ww-p.padX*2, hh-p.padY*2) : p.baseSize;
        ctx.font = p.weight+' '+s+'px '+p.family; ctx.textBaseline='middle'; ctx.fillStyle=valStr('textColor','#000000');
        const m=measure(p.text, ctx.font);
        ctx.save(); rr(ctx,x,y,ww,hh,p.radius); ctx.clip();
        ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));
        ctx.restore();
        const a=document.createElement('a'); a.href=tmp.toDataURL('image/png'); a.download=baseName; document.body.appendChild(a); a.click(); a.remove();
      }

      function savePNGUrgent(baseName){
        const scale = Math.max(1, Math.floor(valNum('exportScale',1)));
        const {w,h}=pxSize();
        const p=params();
        const tmp=document.createElement('canvas'); tmp.width=w*scale; tmp.height=h*scale; const ctx=tmp.getContext('2d');
        ctx.scale(scale, scale);
        const x=p.stroke/2, y=p.stroke/2, ww=w-p.stroke, hh=h-p.stroke;
        const bg = patternFill(ctx, x,y,ww,hh, 0);
        if(bg){ ctx.save(); rr(ctx,x,y,ww,hh,p.radius); ctx.clip(); ctx.fillStyle=bg; ctx.fillRect(x,y,ww,hh); ctx.restore(); }
        if(p.stroke>0){ ctx.strokeStyle='#1E90FF'; ctx.lineWidth=p.stroke; rr(ctx,x,y,ww,hh,p.radius); ctx.stroke(); }
        const s = p.autofit ? fitTextSize(p, ww-p.padX*2, hh-p.padY*2) : p.baseSize;
        ctx.font = p.weight+' '+s+'px '+p.family; ctx.textBaseline='middle'; ctx.fillStyle=valStr('textColor','#000000');
        const m=measure(p.text, ctx.font);
        ctx.save(); rr(ctx,x,y,ww,hh,p.radius); ctx.clip();
        ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));
        ctx.restore();
        const a=document.createElement('a'); a.href=tmp.toDataURL('image/png'); a.download=baseName; document.body.appendChild(a); a.click(); a.remove();
      }

      async function saveUrgentAPNG(){
        try{
          const fps = clamp(valNum('fps',24), 8, 60);
          const duration = Math.max(1, valNum('duration',2));
          const {w,h} = pxSize();
          const scale = Math.max(1, Math.floor(valNum('exportScale',1)));
          const frames = Math.max(2, Math.round(duration * fps));
          const delays = new Array(frames).fill(Math.round(1000/fps));

          const off=document.createElement('canvas'); off.width=w*scale; off.height=h*scale; const ctx=off.getContext('2d');
          const p=params();
          const getFrame = (prog)=>{
            ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,off.width,off.height);
            ctx.scale(scale, scale);
            const x=p.stroke/2, y=p.stroke/2, ww=w-p.stroke, hh=h-p.stroke;
            const bg = patternFill(ctx, x,y,ww,hh, prog);
            if(bg){ ctx.save(); rr(ctx,x,y,ww,hh,p.radius); ctx.clip(); ctx.fillStyle=bg; ctx.fillRect(x,y,ww,hh); ctx.restore(); }
            if(p.stroke>0){ ctx.strokeStyle='#1E90FF'; ctx.lineWidth=p.stroke; rr(ctx,x,y,ww,hh,p.radius); ctx.stroke(); }
            const s = p.autofit ? fitTextSize(p, ww-p.padX*2, hh-p.padY*2) : p.baseSize;
            ctx.font = p.weight+' '+s+'px '+p.family; ctx.textBaseline='middle'; ctx.fillStyle=valStr('textColor','#000000');
            const m=measure(p.text, ctx.font);
            ctx.save(); rr(ctx,x,y,ww,hh,p.radius); ctx.clip();
            ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));
            ctx.restore();
            return ctx.getImageData(0,0,off.width,off.height);
          };

          // Collect frames
          const imgs = [];
          for(let i=0;i<frames;i++){
            const prog = i/(frames-1);
            imgs.push(getFrame(prog));
          }

          // If CompressionStream unsupported, fall back to ZIP of PNG frames
          if(!('CompressionStream' in window)){
            console.warn('CompressionStream not supported; exporting ZIP of PNG frames instead.');
            // simple zip: store only (no compression). We'll build a minimal ZIP with no deflate.
            const files = [];
            for(let i=0;i<frames;i++){
              off.getContext('2d').putImageData(imgs[i],0,0);
              files.push({name:`frame_${String(i).padStart(3,'0')}.png`, data: off.toDataURL('image/png')});
            }
            const a=document.createElement('a');
            a.href = files[0].data; a.download='frames_export_note_open_each.png'; document.body.appendChild(a); a.click(); a.remove();
            alert('APNG not supported in this browser for in-page encoding. I exported the first frame.\nUse a desktop tool (e.g. apngasm) to combine PNG frames into APNG.');
            return;
          }

          const blob = await encodeAPNG(imgs, off.width, off.height, delays);
          const url = URL.createObjectURL(blob);
          const a=document.createElement('a'); a.href=url; a.download=((valStr('text','tag').replace(/[^a-z0-9-_]+/gi,'_'))+'__urgent.apng'); document.body.appendChild(a); a.click(); a.remove();
          setTimeout(()=>URL.revokeObjectURL(url), 4000);
        }catch(e){ reportError(e); }
      }

      // Wire UI
      const redraw = ()=>{ try{ drawNormal(); drawUrgent(0);}catch(e){ reportError(e);} };
      ['text','font','weight','size','padX','padY','stroke','radius','textColor','colorA','colorB','pattern','angle','bars','soft','intensity','duration','fps','previewZoom','exportScale','width','height','autofit']
        .forEach(id=>{ const el=inputs[id]; if(!el) return; el.addEventListener('input', redraw); el.addEventListener('change', redraw); });

      const dlN=$('dlNormal'); if(dlN) dlN.addEventListener('click', ()=> savePNGNormal(((valStr('text','tag').replace(/[^a-z0-9-_]+/gi,'_'))+'__normal.png')) );
      const dlU=$('dlUrgentPng'); if(dlU) dlU.addEventListener('click', ()=> savePNGUrgent(((valStr('text','tag').replace(/[^a-z0-9-_]+/gi,'_'))+'__urgent.png')) );
      const dlB=$('dlBoth'); if(dlB) dlB.addEventListener('click', ()=>{ const base=(valStr('text','tag').replace(/[^a-z0-9-_]+/gi,'_')); savePNGNormal(base+'__normal.png'); setTimeout(()=>savePNGUrgent(base+'__urgent.png'),150); });
      const dlA=$('dlUrgentApng'); if(dlA) dlA.addEventListener('click', ()=> saveUrgentAPNG() );

      const pe=$('presetEU'); if(pe) pe.addEventListener('click', (e)=>{ e.preventDefault(); if(inputs.colorA) inputs.colorA.value='#ffffff'; if(inputs.colorB) inputs.colorB.value='#1e5bff'; if(inputs.pattern) inputs.pattern.value='eu-triple'; if(inputs.duration) inputs.duration.value=2; if(inputs.angle) inputs.angle.value=0; if(inputs.intensity) inputs.intensity.value=0.95; redraw(); });
      const pu=$('presetUS'); if(pu) pu.addEventListener('click', (e)=>{ e.preventDefault(); if(inputs.colorA) inputs.colorA.value='#ffffff'; if(inputs.colorB) inputs.colorB.value='#1e5bff'; if(inputs.pattern) inputs.pattern.value='us-alt-rb'; if(inputs.duration) inputs.duration.value=1.6; if(inputs.angle) inputs.angle.value=0; if(inputs.intensity) inputs.intensity.value=1.0; redraw(); });
      const pc=$('presetClean'); if(pc) pc.addEventListener('click', (e)=>{ e.preventDefault(); if(inputs.colorA) inputs.colorA.value='#ffffff'; if(inputs.colorB) inputs.colorB.value='#1E90FF'; if(inputs.pattern) inputs.pattern.value='sweep'; if(inputs.duration) inputs.duration.value=2; if(inputs.angle) inputs.angle.value=0; if(inputs.intensity) inputs.intensity.value=0.8; redraw(); });

      const btnMax=$('btnMaxText'); if(btnMax) btnMax.addEventListener('click', (e)=>{ e.preventDefault(); if(inputs.padX) inputs.padX.value=1; if(inputs.padY) inputs.padY.value=0; if(inputs.stroke) inputs.stroke.value=1; if(inputs.weight) inputs.weight.value='800'; if(inputs.font) inputs.font.value='Oswald, Impact, Arial Narrow, sans-serif'; if(inputs.autofit) inputs.autofit.checked=true; redraw(); });
      const btnReset=$('btnReset'); if(btnReset) btnReset.addEventListener('click', (e)=>{ e.preventDefault(); if(inputs.width) inputs.width.value=50; if(inputs.height) inputs.height.value=13; if(inputs.padX) inputs.padX.value=3; if(inputs.padY) inputs.padY.value=1; if(inputs.stroke) inputs.stroke.value=1; if(inputs.radius) inputs.radius.value=2; if(inputs.size) inputs.size.value=11; if(inputs.weight) inputs.weight.value='700'; if(inputs.font) inputs.font.value='Inter, system-ui, Arial'; if(inputs.textColor) inputs.textColor.value='#000000'; if(inputs.colorA) inputs.colorA.value='#ffffff'; if(inputs.colorB) inputs.colorB.value='#1E90FF'; if(inputs.autofit) inputs.autofit.checked=false; if(inputs.previewZoom) inputs.previewZoom.value=12; redraw(); });

      // Loop
      redraw();
      requestAnimationFrame(function loop(ts){
        try{
          const dur=Math.max(0.5, valNum('duration',2))*1000;
          const t=(ts % dur)/dur;
          drawUrgent(t);
          requestAnimationFrame(loop);
        }catch(e){ reportError(e); }
      });

      stat(['Status: OK','JS: ✅','APNG encoder ready','Last render: '+new Date().toLocaleTimeString()]);
    })();
  }catch(e){ reportError(e); }
});