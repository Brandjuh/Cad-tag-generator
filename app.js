// SAFE boot: defer + try/catch + status logging
window.addEventListener('DOMContentLoaded', function(){
  const statusEl = document.getElementById('status');
  function stat(lines){ statusEl.textContent = lines.join('\n'); }
  function reportError(e){
    const msg = (e && (e.stack || e.message || e)) || 'onbekende fout';
    stat(['Status: ERROR','JS geladen: ❌','Detail: '+msg]);
    console.error(e);
  }
  try{
    (function(){
      function $(id){ return document.getElementById(id); }
      var inputs = {
        text: $('text'), font: $('font'), weight: $('weight'), size: $('size'),
        padX: $('padX'), padY: $('padY'), stroke: $('stroke'), radius: $('radius'),
        textColor: $('textColor'), strokeColor: $('strokeColor'),
        blue: $('blue'), angle: $('angle'), duration: $('duration'), fps: $('fps'),
        pattern: $('pattern'), bars: $('bars'), soft: $('soft')
      };
      var cn = $('cn'), cu = $('cu');
      var ctxN = cn.getContext('2d'), ctxU = cu.getContext('2d');
      var mcanvas = document.createElement('canvas');
      var mctx = mcanvas.getContext('2d');

      function clamp(n,a,b){ n=parseFloat(n); if(isNaN(n)) n=a; return Math.max(a, Math.min(b, n)); }
      function lerp(a,b,t){ return a + (b-a)*t; }
      function rr(ctx,x,y,w,h,r){ r=Math.max(0,Math.min(r,Math.min(w,h)/2)); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
      function measure(text,font){ mctx.setTransform(1,0,0,1,0,0); mctx.font = font; return { w: Math.ceil(mctx.measureText(text).width), h: Math.ceil(parseInt(font,10)*1.2) }; }
      function setup(canvas, w, h, dpr){ canvas.width=Math.max(1,Math.floor(w*dpr)); canvas.height=Math.max(1,Math.floor(h*dpr)); canvas.style.width=Math.round(w)+'px'; canvas.style.height=Math.round(h)+'px'; }
      function mixColor(white, blue, t){
        var br = parseInt(blue.slice(1,3),16), bg = parseInt(blue.slice(3,5),16), bb = parseInt(blue.slice(5,7),16);
        var r = Math.round(lerp(255, br, t)), g = Math.round(lerp(255, bg, t)), b = Math.round(lerp(255, bb, t));
        return 'rgb(' + r + ',' + g + ',' + b + ')';
      }
      function addStopSafe(g, pos, col){
        var p = Math.max(0, Math.min(1, pos));
        try { g.addColorStop(p, col); } catch(e){ /* ignore out-of-order/duplicate */ }
      }
      function fillRounded(ctx, x,y,w,h,r, fillStyle){
        ctx.save(); rr(ctx,x,y,w,h,r); ctx.clip(); ctx.fillStyle = fillStyle; ctx.fillRect(x,y,w,h); ctx.restore();
      }

      function renderPattern(ctx, x,y,w,h, t, blueHex){
        var pattern = inputs.pattern.value;
        var angle = parseFloat(inputs.angle.value)||0;
        var bars = Math.max(1, Math.floor(parseFloat(inputs.bars.value)||5));
        var soft = clamp(inputs.soft.value, 0, 0.5);

        if(pattern === 'blink'){
          var on = t < 0.5; return on ? blueHex : '#ffffff';
        }

        if(pattern === 'pulse'){
          var ease = 0.5 - 0.5 * Math.cos(t * Math.PI*2);
          return mixColor('#ffffff', blueHex, ease);
        }

        if(pattern === 'alt-halves'){
          ctx.save(); rr(ctx,x,y,w,h,12); ctx.clip();
          var on = t < 0.5;
          ctx.fillStyle = on ? blueHex : '#ffffff'; ctx.fillRect(x,y,w/2,h);
          ctx.fillStyle = on ? '#ffffff' : blueHex; ctx.fillRect(x+w/2,y,w/2,h);
          ctx.restore();
          return null;
        }

        if(pattern === 'lr-pulse'){
          var easeL = 0.5 - 0.5 * Math.cos(t * Math.PI*2);
          var easeR = 0.5 - 0.5 * Math.cos((t+0.5) * Math.PI*2);
          ctx.save(); rr(ctx,x,y,w,h,12); ctx.clip();
          ctx.fillStyle = mixColor('#ffffff', blueHex, easeL); ctx.fillRect(x,y,w/2,h);
          ctx.fillStyle = mixColor('#ffffff', blueHex, easeR); ctx.fillRect(x+w/2,y,w/2,h);
          ctx.restore();
          return null;
        }

        // Compute gradient axis
        var rad=(angle%360)*Math.PI/180, cx=x+w/2, cy=y+h/2, R=Math.sqrt(w*w+h*h)/2;
        var x0=cx-Math.cos(rad)*R, y0=cy-Math.sin(rad)*R, x1=cx+Math.cos(rad)*R, y1=cy+Math.sin(rad)*R;

        if(pattern === 'bars'){
          // Moving bars: build many color stops along axis in JS
          var g = ctx.createLinearGradient(x0,y0,x1,y1);
          var duty = 0.5;           // fraction of bar that is blue
          var phase = t % 1;        // animate offset
          var stops = [];
          for (var k=0; k<bars; k++){
            var start = (k/bars + phase) % 1.0;
            var end   = (start + duty/bars) % 1.0;
            var sSoft = soft/bars;

            function segment(s, e){
              // blue from s .. e, with optional soft leading edge
              stops.push([s, blueHex]);
              if(sSoft>0) stops.push([Math.min(1, s + sSoft), blueHex]);
              stops.push([e, '#ffffff']);
            }

            if(end >= start){
              segment(start, end);
            } else {
              // wrap-around: split into [start..1] and [0..end]
              segment(start, 1.0);
              segment(0.0, end);
            }
          }
          // Ensure baseline white at edges
          stops.push([0.0, '#ffffff']); stops.push([1.0, '#ffffff']);
          // Sort & add
          stops.sort(function(a,b){ return a[0]-b[0]; });
          for (var i=0;i<stops.length;i++){ addStopSafe(g, stops[i][0], stops[i][1]); }
          ctx.save(); rr(ctx,x,y,w,h,12); ctx.fillStyle = g; ctx.fill(); ctx.restore();
          return null;
        }

        // Default: gradient sweep with moving midpoint
        var ease = 0.5 - 0.5 * Math.cos(t * Math.PI*2);
        var base = mixColor('#ffffff', blueHex, ease);
        var gs = ctx.createLinearGradient(x0,y0,x1,y1);
        addStopSafe(gs, 0, '#ffffff');
        addStopSafe(gs, Math.max(0, Math.min(1, ease)), base);
        addStopSafe(gs, 1, base);
        ctx.save(); rr(ctx,x,y,w,h,12); ctx.fillStyle = gs; ctx.fill(); ctx.restore();
        return null;
      }

      function params(){
        var raw=(inputs.text.value||'LAFD 021').trim();
        var text = raw.toUpperCase();
        var size = clamp(inputs.size.value,8,200);
        var padX = clamp(inputs.padX.value,0,200);
        var padY = clamp(inputs.padY.value,0,200);
        var stroke = clamp(inputs.stroke.value,0,20);
        var radius = clamp(inputs.radius.value,0,40);
        var weight = (inputs.weight.value+'').trim();
        var family = (inputs.font.value+'').trim();
        var font = weight+' '+size+'px '+family;
        return {text,size,padX,padY,stroke,radius,weight,family,font};
      }

      function drawNormal(ctx, canvas){
        var p = params();
        var m = measure(p.text, p.font);
        var w = m.w + p.padX*2 + p.stroke*2;
        var h = m.h + p.padY*2 + p.stroke*2;
        var dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
        setup(canvas, w, h, dpr);
        ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.scale(dpr,dpr);
        var x=p.stroke/2, y=p.stroke/2, ww=w-p.stroke, hh=h-p.stroke;
        ctx.fillStyle = '#ffffff'; rr(ctx,x,y,ww,hh,p.radius); ctx.fill();
        if(p.stroke>0){ ctx.strokeStyle=inputs.strokeColor.value||'#1E90FF'; ctx.lineWidth=p.stroke; rr(ctx,x,y,ww,hh,p.radius); ctx.stroke(); }
        ctx.font=p.font; ctx.textBaseline='middle'; ctx.fillStyle=inputs.textColor.value||'#000000';
        ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));
        stat(['Status: OK','JS geladen: ✅','Laatst gerenderd: '+new Date().toLocaleTimeString()]);
      }

      function drawUrgent(ctx, canvas, t){
        var p = params();
        var m = measure(p.text, p.font);
        var w = m.w + p.padX*2 + p.stroke*2;
        var h = m.h + p.padY*2 + p.stroke*2;
        var dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
        setup(canvas, w, h, dpr);
        ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.scale(dpr,dpr);
        var x=p.stroke/2, y=p.stroke/2, ww=w-p.stroke, hh=h-p.stroke;
        var blue = inputs.blue.value || '#1E90FF';
        var bg = renderPattern(ctx, x,y,ww,hh, t, blue);
        if(bg){ fillRounded(ctx, x,y,ww,hh,p.radius, bg); }
        if(p.stroke>0){ ctx.strokeStyle=inputs.strokeColor.value||'#1E90FF'; ctx.lineWidth=p.stroke; rr(ctx,x,y,ww,hh,p.radius); ctx.stroke(); }
        ctx.font=p.font; ctx.textBaseline='middle'; ctx.fillStyle=inputs.textColor.value||'#000000';
        ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));
      }

      function drawAllOnce(){ drawNormal(ctxN, cn); drawUrgent(ctxU, cu, 0); }

      function savePNG(canvas, name){
        var a=document.createElement('a'); a.href=canvas.toDataURL('image/png'); a.download=name; document.body.appendChild(a); a.click(); a.remove();
      }

      async function saveSpoedWebM(){
        try{
          var fps = clamp(inputs.fps.value, 8, 60);
          var duration = Math.max(1, parseFloat(inputs.duration.value)||2);
          drawUrgent(ctxU, cu, 0);
          if(!('captureStream' in cu) || !('MediaRecorder' in window)) throw new Error('MediaRecorder/captureStream niet ondersteund door deze browser.');
          var stream = cu.captureStream(fps);
          var mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' :
                     MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' :
                     'video/webm';
          var rec = new MediaRecorder(stream, {mimeType:mime, videoBitsPerSecond: 3_000_000});
          var chunks = []; rec.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
          var done; rec.onstop = () => done && done(); rec.start();
          var start = performance.now();
          function step(now){
            var t = (now - start)/1000, prog = Math.min(1, t/duration);
            drawUrgent(ctxU, cu, prog);
            if(prog < 1) requestAnimationFrame(step); else rec.stop();
          }
          await new Promise(res => { done = res; requestAnimationFrame(step); });
          var blob = new Blob(chunks, {type:mime});
          var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=((inputs.text.value||'tag').replace(/[^a-z0-9-_]+/gi,'_'))+'__spoed.webm'; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
        }catch(e){ reportError(e); }
      }

      ['text','font','weight','size','padX','padY','stroke','radius','textColor','strokeColor','blue','angle','duration','fps','pattern','bars','soft']
        .forEach(function(id){ var el = inputs[id]; if(el){ el.addEventListener('input', drawAllOnce); el.addEventListener('change', drawAllOnce); }});

      $('dlNormaal').addEventListener('click', function(){ savePNG(cn, (inputs.text.value||'tag')+'__normaal.png'); });
      $('dlSpoedPng').addEventListener('click', function(){ savePNG(cu, (inputs.text.value||'tag')+'__spoed.png'); });
      $('dlBeide').addEventListener('click', function(){ savePNG(cn, (inputs.text.value||'tag')+'__normaal.png'); setTimeout(function(){ savePNG(cu, (inputs.text.value||'tag')+'__spoed.png'); }, 200); });
      $('dlSpoedWebm').addEventListener('click', function(){ saveSpoedWebM(); });

      // Init + guarded loop
      drawAllOnce();
      requestAnimationFrame(function loop(ts){
        try{
          var dur = Math.max(1, parseFloat(inputs.duration.value)||2) * 1000;
          var t = (ts % dur) / dur;
          drawUrgent(ctxU, cu, t);
          requestAnimationFrame(loop);
        }catch(e){ reportError(e); }
      });
    })();
  }catch(e){ reportError(e); }
});