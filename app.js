// PAGE-SAFE version: every input is optional and has a default.
window.addEventListener('DOMContentLoaded', function(){
  const statusEl = document.getElementById('status');
  function stat(lines){ statusEl.textContent = lines.join('\n'); }
  function reportError(e){
    const msg = (e && (e.stack || e.message || e)) || 'unknown error';
    stat(['Status: ERROR','JS: ❌','Details: '+msg]);
    console.error(e);
  }
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
        presetEU: $('presetEU'), presetUS: $('presetUS'), presetClean: $('presetClean')
      };

      function valStr(key, def){ const el = inputs[key]; return (el && typeof el.value === 'string') ? el.value : def; }
      function valNum(key, def){ const el = inputs[key]; if(!el) return def; const v = parseFloat(el.value); return Number.isFinite(v) ? v : def; }
      function valBool(key, def){ const el = inputs[key]; if(!el) return def; return !!el.checked; }

      const cn = $('cn'), cu = $('cu');
      const ctxN = cn.getContext('2d'), ctxU = cu.getContext('2d');
      const mcanvas = document.createElement('canvas');
      const mctx = mcanvas.getContext('2d');

      function clamp(n,a,b){ n=parseFloat(n); if(isNaN(n)) n=a; return Math.max(a, Math.min(b, n)); }
      function lerp(a,b,t){ return a + (b-a)*t; }
      function rr(ctx,x,y,w,h,r){ r=Math.max(0,Math.min(r,Math.min(w,h)/2)); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

      function hexToRgb(hex){
        const h = (hex||'#000000').replace('#','');
        return { r: parseInt(h.slice(0,2),16)||0, g: parseInt(h.slice(2,4),16)||0, b: parseInt(h.slice(4,6),16)||0 };
      }
      function mixColorHex(aHex, bHex, t){
        const a = hexToRgb(aHex), b = hexToRgb(bHex);
        const r = Math.round(lerp(a.r, b.r, t)), g = Math.round(lerp(a.g, b.g, t)), bl = Math.round(lerp(a.b, b.b, t));
        return 'rgb('+r+','+g+','+bl+')';
      }
      function withAlpha(hex, a){
        const {r,g,b} = hexToRgb(hex);
        return 'rgba('+r+','+g+','+b+','+a+')';
      }
      function addStopSafe(g, pos, col){ const p = Math.max(0,Math.min(1,pos)); try{ g.addColorStop(p,col);}catch(e){} }

      function pxSize(){
        const w = Math.max(1, Math.floor(valNum('width', 50)));
        const h = Math.max(1, Math.floor(valNum('height', 13)));
        return {w,h};
      }

      function setupCanvas(canvas, cssZoom){
        const {w,h} = pxSize();
        const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = (w * cssZoom) + 'px';
        canvas.style.height = (h * cssZoom) + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.scale(dpr,dpr);
        return {w,h,dpr,ctx};
      }

      function params(){
        const raw = (valStr('text','UNIT 021') || '').trim();
        const text = raw.toUpperCase();
        const baseSize = clamp(valNum('size',9), 6, 200);
        const padX = clamp(valNum('padX',4),0,200);
        const padY = clamp(valNum('padY',1),0,200);
        const stroke = clamp(valNum('stroke',1),0,20);
        const radius = clamp(valNum('radius',2),0,40);
        const weight = valStr('weight','600');
        const family = valStr('font','Inter, system-ui, Arial');
        const font = (s)=> (weight+' '+s+'px '+family);
        const autofit = valBool('autofit', true);
        return {text,baseSize,padX,padY,stroke,radius,weight,family,font,autofit};
      }

      function measure(text,font){ mctx.setTransform(1,0,0,1,0,0); mctx.font = font; const m = mctx.measureText(text); const h = Math.ceil(parseInt(font,10)*1.1); return { w: Math.ceil(m.width), h: isFinite(h)?h:Math.ceil(9*1.1) }; }

      function fitTextSize(p, innerW, innerH){
        if(!p.autofit) return p.baseSize;
        let s = p.baseSize;
        const minS = 6;
        for(let i=0;i<24;i++){
          const m = measure(p.text, p.font(s));
          if(m.w <= innerW && m.h <= innerH) break;
          s = Math.max(minS, Math.floor(s*0.92));
        }
        return s;
      }

      function fillRounded(ctx, x,y,w,h,r, fillStyle){
        ctx.save(); rr(ctx,x,y,w,h,r); ctx.clip(); ctx.fillStyle = fillStyle; ctx.fillRect(x,y,w,h); ctx.restore();
      }

      function patternFill(ctx, x,y,w,h, t){
        const pat = valStr('pattern','sweep');
        const angle = valNum('angle',0);
        const bars = Math.max(1, Math.floor(valNum('bars',5)));
        const soft = clamp(valNum('soft',0), 0, 0.5);
        const intensity = clamp(valNum('intensity',0.8), 0, 1);
        const speed = clamp(valNum('speed',1), 0.2, 5);
        const a = valStr('colorA','#ffffff');
        const b = valStr('colorB','#1E90FF');

        const gradAxis = ()=>{
          const rad=(angle%360)*Math.PI/180, cx=x+w/2, cy=y+h/2, R=Math.sqrt(w*w+h*h)/2;
          return [cx-Math.cos(rad)*R, cy-Math.sin(rad)*R, cx+Math.cos(rad)*R, cy+Math.sin(rad)*R];
        };
        const tFast = (t*speed)%1;

        if(pat === 'blink'){ return tFast < 0.5 ? b : a; }
        if(pat === 'pulse'){ const e = 0.5 - 0.5 * Math.cos(tFast * Math.PI*2); return mixColorHex(a,b, e*intensity); }
        if(pat === 'alt-halves'){
          ctx.save(); rr(ctx,x,y,w,h,12); ctx.clip();
          const on = tFast < 0.5;
          ctx.fillStyle = on ? b : a; ctx.fillRect(x,y,w/2,h);
          ctx.fillStyle = on ? a : b; ctx.fillRect(x+w/2,y,w/2,h);
          ctx.restore(); return null;
        }
        if(pat === 'lr-pulse'){
          const eL = 0.5 - 0.5 * Math.cos(tFast * Math.PI*2);
          const eR = 0.5 - 0.5 * Math.cos((tFast+0.5) * Math.PI*2);
          ctx.save(); rr(ctx,x,y,w,h,12); ctx.clip();
          ctx.fillStyle = mixColorHex(a,b, eL*intensity); ctx.fillRect(x,y,w/2,h);
          ctx.fillStyle = mixColorHex(a,b, eR*intensity); ctx.fillRect(x+w/2,y,w/2,h);
          ctx.restore(); return null;
        }
        if(pat === 'bars'){
          const [x0,y0,x1,y1] = gradAxis();
          const g = ctx.createLinearGradient(x0,y0,x1,y1);
          const duty = 0.5;
          const phase = tFast;
          const sSoft = soft/bars;
          const stops = [];
          function seg(s,e){
            stops.push([s, b]);
            if(sSoft>0) stops.push([Math.min(1, s+sSoft), b]);
            stops.push([e, a]);
          }
          for(let k=0;k<bars;k++){
            const start = (k/bars + phase)%1;
            const end = (start + duty/bars)%1;
            if(end>=start){ seg(start,end); } else { seg(start,1); seg(0,end); }
          }
          stops.push([0,a]); stops.push([1,a]);
          stops.sort((u,v)=>u[0]-v[0]);
          ctx.save(); rr(ctx,x,y,w,h,12); 
          const g2 = ctx.createLinearGradient(x0,y0,x1,y1);
          for(const [pos,col] of stops){ addStopSafe(g2,pos,col); }
          ctx.globalAlpha = intensity; ctx.fillStyle=g2; ctx.fill(); ctx.globalAlpha=1; ctx.restore();
          return null;
        }
        if(pat === 'beacon' || pat === 'dual-beacon'){
          const [x0,y0,x1,y1] = gradAxis();
          const g = ctx.createLinearGradient(x0,y0,x1,y1);
          const center = tFast;
          const width = 0.18;
          const edge = Math.max(0, Math.min(1, center-width/2));
          const mid  = Math.max(0, Math.min(1, center));
          const edge2= Math.max(0, Math.min(1, center+width/2));
          addStopSafe(g, edge, withAlpha(b, 0));
          addStopSafe(g, mid,  withAlpha(b, intensity));
          addStopSafe(g, edge2,withAlpha(b, 0));
          ctx.save(); rr(ctx,x,y,w,h,12); ctx.fillStyle = a; ctx.fill();
          ctx.globalCompositeOperation='lighter'; ctx.fillStyle = g; ctx.fill();
          ctx.globalCompositeOperation='source-over'; ctx.restore();
          if(pat==='dual-beacon'){
            const center2 = (tFast+0.5)%1;
            const g2 = ctx.createLinearGradient(x0,y0,x1,y1);
            const e = Math.max(0, Math.min(1, center2-width/2));
            const m  = Math.max(0, Math.min(1, center2));
            const e2 = Math.max(0, Math.min(1, center2+width/2));
            addStopSafe(g2, e, withAlpha(b, 0));
            addStopSafe(g2, m, withAlpha(b, intensity));
            addStopSafe(g2, e2, withAlpha(b, 0));
            ctx.save(); rr(ctx,x,y,w,h,12); ctx.globalCompositeOperation='lighter'; ctx.fillStyle=g2; ctx.fill(); ctx.globalCompositeOperation='source-over'; ctx.restore();
          }
          return null;
        }
        if(pat === 'checker'){
          ctx.save(); rr(ctx,x,y,w,h,12); ctx.clip();
          const cols = 6, rows = 2;
          const phase = Math.floor(tFast*2)%2;
          for(let i=0;i<cols;i++){
            for(let j=0;j<rows;j++){
              const on = ((i+j+phase)%2===0);
              ctx.fillStyle = on ? b : a;
              const cw = w/cols, ch = h/rows;
              ctx.fillRect(x + i*cw, y + j*ch, cw+1, ch+1);
            }
          }
          ctx.restore(); return null;
        }
        if(pat === 'diagonal-sweep'){
          const [x0,y0,x1,y1] = gradAxis();
          const e = 0.5 - 0.5 * Math.cos(tFast * Math.PI*2);
          const g = ctx.createLinearGradient(x0,y0,x1,y1);
          addStopSafe(g, 0, a);
          addStopSafe(g, e, mixColorHex(a,b, intensity));
          addStopSafe(g, 1, b);
          ctx.save(); rr(ctx,x,y,w,h,12); ctx.fillStyle=g; ctx.fill(); ctx.restore();
          return null;
        }
        if(pat === 'eu-triple'){
          function pulse(t0, width){
            const d = Math.abs(((tFast - t0 + 1)%1));
            return d < width ? (1 - d/width) : 0;
          }
          const p1 = pulse(0.00, 0.06), p2 = pulse(0.15, 0.06), p3 = pulse(0.30, 0.06);
          const pow = Math.min(1, p1 + p2 + p3);
          return mixColorHex(a, b, pow * intensity);
        }
        if(pat === 'eu-rolling'){
          const [x0,y0,x1,y1] = gradAxis();
          const g = ctx.createLinearGradient(x0,y0,x1,y1);
          const center = tFast;
          const width = 0.25;
          addStopSafe(g, 0, a);
          addStopSafe(g, Math.max(0, center-width), a);
          addStopSafe(g, center, mixColorHex(a,b, intensity));
          addStopSafe(g, Math.min(1, center+width), a);
          addStopSafe(g, 1, a);
          ctx.save(); rr(ctx,x,y,w,h,12); ctx.fillStyle=g; ctx.fill(); ctx.restore();
          return null;
        }
        if(pat === 'us-alt-rb'){
          const red = '#ff1e1e', blue = '#1e5bff';
          ctx.save(); rr(ctx,x,y,w,h,12); ctx.clip();
          const flip = tFast < 0.5;
          ctx.fillStyle = flip ? red : blue; ctx.globalAlpha = intensity; ctx.fillRect(x,y,w/2,h);
          ctx.fillStyle = flip ? blue : red; ctx.fillRect(x+w/2,y,w/2,h);
          ctx.globalAlpha = 1; ctx.restore();
          return null;
        }
        if(pat === 'us-split-strobe'){
          const red = '#ff1e1e', blue = '#1e5bff';
          const lOn = (tFast%0.5) < 0.25;
          const rOn = ((tFast+0.25)%0.5) < 0.25;
          ctx.save(); rr(ctx,x,y,w,h,12); ctx.clip();
          ctx.fillStyle = lOn ? red : a; ctx.fillRect(x,y,w/2,h);
          ctx.fillStyle = rOn ? blue : a; ctx.fillRect(x+w/2,y,w/2,h);
          ctx.restore(); return null;
        }

        // default sweep
        const [x0,y0,x1,y1] = gradAxis();
        const e = 0.5 - 0.5 * Math.cos(tFast * Math.PI*2);
        const base = mixColorHex(a,b, e*intensity);
        const g = ctx.createLinearGradient(x0,y0,x1,y1);
        addStopSafe(g, 0, a);
        addStopSafe(g, Math.max(0, Math.min(1, e)), base);
        addStopSafe(g, 1, base);
        ctx.save(); rr(ctx,x,y,w,h,12); ctx.fillStyle=g; ctx.fill(); ctx.restore();
        return null;
      }

      function drawNormal(){
        const zoom = clamp(valNum('previewZoom',6),1,20);
        const {w,h,ctx} = setupCanvas(cn, zoom);
        const p = params();
        const x=p.stroke/2, y=p.stroke/2, ww=w-p.stroke, hh=h-p.stroke;
        const colA = valStr('colorA','#ffffff');
        ctx.fillStyle = colA; rr(ctx,x,y,ww,hh,p.radius); ctx.fill();
        if(p.stroke>0){ ctx.strokeStyle='#1E90FF'; ctx.lineWidth=p.stroke; rr(ctx,x,y,ww,hh,p.radius); ctx.stroke(); }
        let s = fitTextSize(p, ww - p.padX*2, hh - p.padY*2);
        ctx.font = p.weight+' '+s+'px '+p.family;
        ctx.textBaseline='middle'; ctx.fillStyle = valStr('textColor','#000000');
        const m = measure(p.text, ctx.font);
        ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));
        stat(['Status: OK','JS: ✅','Last render: '+new Date().toLocaleTimeString()]);
      }

      function drawUrgent(t){
        const zoom = clamp(valNum('previewZoom',6),1,20);
        const {w,h,ctx} = setupCanvas(cu, zoom);
        const p = params();
        const x=p.stroke/2, y=p.stroke/2, ww=w-p.stroke, hh=h-p.stroke;
        const bg = patternFill(ctx, x,y,ww,hh, t);
        if(bg){ fillRounded(ctx, x,y,ww,hh,p.radius, bg); }
        if(p.stroke>0){ ctx.strokeStyle='#1E90FF'; ctx.lineWidth=p.stroke; rr(ctx,x,y,ww,hh,p.radius); ctx.stroke(); }
        let s = fitTextSize(p, ww - p.padX*2, hh - p.padY*2);
        ctx.font = p.weight+' '+s+'px '+p.family;
        ctx.textBaseline='middle'; ctx.fillStyle = valStr('textColor','#000000');
        const m = measure(p.text, ctx.font);
        ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));
      }

      function savePNGNormal(baseName){
        const scale = Math.max(1, Math.floor(valNum('exportScale',1)));
        const {w,h} = pxSize();
        const p = params();
        const tmp = document.createElement('canvas');
        const ctx = tmp.getContext('2d');
        tmp.width = w*scale; tmp.height = h*scale;
        ctx.scale(scale, scale);
        const x=p.stroke/2, y=p.stroke/2, ww=w-p.stroke, hh=h-p.stroke;
        const colA = valStr('colorA','#ffffff');
        ctx.fillStyle = colA; rr(ctx,x,y,ww,hh,p.radius); ctx.fill();
        if(p.stroke>0){ ctx.strokeStyle='#1E90FF'; ctx.lineWidth=p.stroke; rr(ctx,x,y,ww,hh,p.radius); ctx.stroke(); }
        let s = fitTextSize(p, ww - p.padX*2, hh - p.padY*2);
        ctx.font = p.weight+' '+s+'px '+p.family;
        ctx.textBaseline='middle'; ctx.fillStyle = valStr('textColor','#000000');
        const m = measure(p.text, ctx.font);
        ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));
        const a=document.createElement('a'); a.href=tmp.toDataURL('image/png'); a.download=baseName; document.body.appendChild(a); a.click(); a.remove();
      }

      function savePNGUrgent(baseName){
        const scale = Math.max(1, Math.floor(valNum('exportScale',1)));
        const {w,h} = pxSize();
        const p = params();
        const tmp = document.createElement('canvas');
        const ctx = tmp.getContext('2d');
        tmp.width = w*scale; tmp.height = h*scale;
        ctx.scale(scale, scale);
        const x=p.stroke/2, y=p.stroke/2, ww=w-p.stroke, hh=h-p.stroke;
        const bg = patternFill(ctx, x,y,ww,hh, 0);
        if(bg){ fillRounded(ctx, x,y,ww,hh,p.radius, bg); }
        if(p.stroke>0){ ctx.strokeStyle='#1E90FF'; ctx.lineWidth=p.stroke; rr(ctx,x,y,ww,hh,p.radius); ctx.stroke(); }
        let s = fitTextSize(p, ww - p.padX*2, hh - p.padY*2);
        ctx.font = p.weight+' '+s+'px '+p.family;
        ctx.textBaseline='middle'; ctx.fillStyle = valStr('textColor','#000000');
        const m = measure(p.text, ctx.font);
        ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));
        const a=document.createElement('a'); a.href=tmp.toDataURL('image/png'); a.download=baseName; document.body.appendChild(a); a.click(); a.remove();
      }

      async function saveUrgentWebM(){
        try{
          const fps = clamp(valNum('fps',24), 8, 60);
          const duration = Math.max(1, valNum('duration',2));
          const {w,h} = pxSize();
          const scale = Math.max(1, Math.floor(valNum('exportScale',1)));
          const off = document.createElement('canvas');
          off.width = w*scale; off.height = h*scale;
          const ctx = off.getContext('2d');
          const p = params();
          const drawFrame = (prog)=>{
            ctx.setTransform(1,0,0,1,0,0);
            ctx.clearRect(0,0,off.width,off.height);
            ctx.scale(scale, scale);
            const x=p.stroke/2, y=p.stroke/2, ww=w-p.stroke, hh=h-p.stroke;
            const bg = patternFill(ctx, x,y,ww,hh, prog);
            if(bg){ fillRounded(ctx, x,y,ww,hh,p.radius, bg); }
            if(p.stroke>0){ ctx.strokeStyle='#1E90FF'; ctx.lineWidth=p.stroke; rr(ctx,x,y,ww,hh,p.radius); ctx.stroke(); }
            let s = fitTextSize(p, ww - p.padX*2, hh - p.padY*2);
            ctx.font = p.weight+' '+s+'px '+p.family;
            ctx.textBaseline='middle'; ctx.fillStyle = valStr('textColor','#000000');
            const m = measure(p.text, ctx.font);
            ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));
          };
          drawFrame(0);
          if(!('captureStream' in off) || !('MediaRecorder' in window)) throw new Error('MediaRecorder/captureStream not supported by this browser.');
          let mime = 'video/webm;codecs=vp9';
          if(!MediaRecorder.isTypeSupported(mime)){
            mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
          }
          const stream = off.captureStream(fps);
          const rec = new MediaRecorder(stream, {mimeType:mime, videoBitsPerSecond: 3_000_000});
          const chunks = []; rec.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
          let done; rec.onstop = ()=> done && done(); rec.start();
          const start = performance.now();
          function step(now){
            const t = (now - start)/1000, prog = Math.min(1, t/duration);
            drawFrame(prog);
            if(prog < 1) requestAnimationFrame(step); else rec.stop();
          }
          await new Promise(res => { done = res; requestAnimationFrame(step); });
          const blob = new Blob(chunks, {type:mime});
          const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=((valStr('text','tag').replace(/[^a-z0-9-_]+/gi,'_'))+'__urgent.webm'); document.body.appendChild(a); a.click(); a.remove();
          setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
        }catch(e){ reportError(e); }
      }

      function wire(id, fn){ const el = inputs[id]; if(!el) return; el.addEventListener('input', fn); el.addEventListener('change', fn); }

      const redraw = ()=>{ try{ drawNormal(); drawUrgent(0); }catch(e){ reportError(e);} };
      ['text','font','weight','size','padX','padY','stroke','radius','textColor','colorA','colorB','pattern','angle','bars','soft','intensity','duration','fps','previewZoom','exportScale','width','height','autofit']
        .forEach(id=> wire(id, redraw));

      const dlN = document.getElementById('dlNormal');
      if(dlN) dlN.addEventListener('click', ()=>{ savePNGNormal(((valStr('text','tag').replace(/[^a-z0-9-_]+/gi,'_'))+'__normal.png')); });
      const dlU = document.getElementById('dlUrgentPng');
      if(dlU) dlU.addEventListener('click', ()=>{ savePNGUrgent(((valStr('text','tag').replace(/[^a-z0-9-_]+/gi,'_'))+'__urgent.png')); });
      const dlB = document.getElementById('dlBoth');
      if(dlB) dlB.addEventListener('click', ()=>{ savePNGNormal(((valStr('text','tag').replace(/[^a-z0-9-_]+/gi,'_'))+'__normal.png')); setTimeout(()=>savePNGUrgent(((valStr('text','tag').replace(/[^a-z0-9-_]+/gi,'_'))+'__urgent.png'), 150)); });
      const dlW = document.getElementById('dlUrgentWebm');
      if(dlW) dlW.addEventListener('click', ()=>{ saveUrgentWebM(); });

      const pe = document.getElementById('presetEU');
      if(pe) pe.addEventListener('click', (e)=>{ e.preventDefault(); if(inputs.colorA) inputs.colorA.value = '#ffffff'; if(inputs.colorB) inputs.colorB.value = '#1e5bff'; if(inputs.pattern) inputs.pattern.value = 'eu-triple'; if(inputs.duration) inputs.duration.value = 2; if(inputs.angle) inputs.angle.value = 0; if(inputs.intensity) inputs.intensity.value = 0.9; redraw(); });
      const pu = document.getElementById('presetUS');
      if(pu) pu.addEventListener('click', (e)=>{ e.preventDefault(); if(inputs.colorA) inputs.colorA.value = '#ffffff'; if(inputs.colorB) inputs.colorB.value = '#1e5bff'; if(inputs.pattern) inputs.pattern.value = 'us-alt-rb'; if(inputs.duration) inputs.duration.value = 1.6; if(inputs.angle) inputs.angle.value = 0; if(inputs.intensity) inputs.intensity.value = 1.0; redraw(); });
      const pc = document.getElementById('presetClean');
      if(pc) pc.addEventListener('click', (e)=>{ e.preventDefault(); if(inputs.colorA) inputs.colorA.value = '#ffffff'; if(inputs.colorB) inputs.colorB.value = '#1E90FF'; if(inputs.pattern) inputs.pattern.value = 'sweep'; if(inputs.duration) inputs.duration.value = 2; if(inputs.angle) inputs.angle.value = 0; if(inputs.intensity) inputs.intensity.value = 0.8; redraw(); });

      // Initial render + loop
      redraw();
      requestAnimationFrame(function loop(ts){
        try{
          const dur = Math.max(0.5, valNum('duration',2)) * 1000;
          const t = (ts % dur) / dur;
          drawUrgent(t);
          requestAnimationFrame(loop);
        }catch(e){ reportError(e); }
      });

      // Missing control diagnostics (console-only)
      const required = ['pattern','angle','bars','soft','intensity','speed','colorA','colorB'];
      const miss = required.filter(id => !inputs[id]);
      if(miss.length){ console.warn('Missing optional controls (using defaults):', miss.join(', ')); }
      stat(['Status: OK','JS: ✅','Last render: '+new Date().toLocaleTimeString()]);
    })();
  }catch(e){ reportError(e); }
});