(function(){
  // Safe, minimal JS – no dependencies, external file to avoid CSP issues.
  var statusEl = document.getElementById('status');
  function stat(lines){
    statusEl.textContent = lines.join('\n');
  }

  function $(id){ return document.getElementById(id); }

  // Grab controls
  var inputs = {
    text: $('text'), uppercase: $('uppercase'), font: $('font'), weight: $('weight'), size: $('size'),
    padX: $('padX'), padY: $('padY'),
    textColor: $('textColor'), strokeColor: $('strokeColor'), stroke: $('stroke'), radius: $('radius'),
    bgAlpha: $('bgAlpha'), bgColor: $('bgColor'), transparentBg: $('transparentBg'),
    gradStart: $('gradStart'), gradEnd: $('gradEnd'), gradAngle: $('gradAngle')
  };

  var cn = $('cn'), cu = $('cu');
  var ctxN = cn.getContext('2d'), ctxU = cu.getContext('2d');

  // Separate measurement context to avoid transform interference
  var mcanvas = document.createElement('canvas');
  var mctx = mcanvas.getContext('2d');

  function clamp(n,a,b){ n=parseFloat(n); if(isNaN(n)) n=a; return Math.max(a, Math.min(b, n)); }

  function rr(ctx,x,y,w,h,r){
    r=Math.max(0,Math.min(r,Math.min(w,h)/2));
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function grad(ctx,x,y,w,h,ang,c0,c1){
    var rad=(ang%360)*Math.PI/180;
    var cx=x+w/2, cy=y+h/2;
    var R=Math.sqrt(w*w+h*h)/2;
    var x0=cx-Math.cos(rad)*R, y0=cy-Math.sin(rad)*R;
    var x1=cx+Math.cos(rad)*R, y1=cy+Math.sin(rad)*R;
    var g=ctx.createLinearGradient(x0,y0,x1,y1);
    g.addColorStop(0,c0); g.addColorStop(1,c1);
    return g;
  }

  function params(){
    var raw=(inputs.text.value||'LAFD 021').trim();
    var text = inputs.uppercase.checked ? raw.toUpperCase() : raw;
    var size = clamp(inputs.size.value,8,200);
    var padX = clamp(inputs.padX.value,0,200);
    var padY = clamp(inputs.padY.value,0,200);
    var stroke = clamp(inputs.stroke.value,0,40);
    var radius = clamp(inputs.radius.value,0,40);
    var weight = inputs.weight.value+'';
    var family = inputs.font.value+'';
    var font = weight+' '+size+'px '+family;
    return {text,size,padX,padY,stroke,radius,weight,family,font};
  }

  function measure(text,font){
    mctx.setTransform(1,0,0,1,0,0);
    mctx.font = font;
    return { w: Math.ceil(mctx.measureText(text).width), h: Math.ceil(parseInt(font,10)*1.2) };
  }

  function setup(canvas, w, h, dpr){
    canvas.width  = Math.max(1, Math.floor(w*dpr));
    canvas.height = Math.max(1, Math.floor(h*dpr));
    canvas.style.width  = Math.round(w)+'px';
    canvas.style.height = Math.round(h)+'px';
  }

  function drawOne(ctx, canvas, urgent){
    var p = params();
    var m = measure(p.text, p.font);
    var w = m.w + p.padX*2 + p.stroke*2;
    var h = m.h + p.padY*2 + p.stroke*2;
    var dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));

    setup(canvas, w, h, dpr);

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.scale(dpr,dpr);

    // background
    if(inputs.transparentBg.value !== '1'){
      if(urgent){
        var a = clamp(inputs.bgAlpha.value,0,1);
        ctx.globalAlpha = a;
        ctx.fillStyle = grad(ctx, p.stroke/2, p.stroke/2, w-p.stroke, h-p.stroke,
                             parseFloat(inputs.gradAngle.value)||0,
                             inputs.gradStart.value||'#ff2d2d',
                             inputs.gradEnd.value||'#ffd500');
        rr(ctx, p.stroke/2, p.stroke/2, w-p.stroke, h-p.stroke, p.radius);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        var a2 = clamp(inputs.bgAlpha.value,0,1);
        ctx.globalAlpha = a2;
        ctx.fillStyle = inputs.bgColor.value || '#0B1736';
        rr(ctx, p.stroke/2, p.stroke/2, w-p.stroke, h-p.stroke, p.radius);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // border
    if(p.stroke>0){
      ctx.strokeStyle = inputs.strokeColor.value || '#1E90FF';
      ctx.lineWidth = p.stroke;
      rr(ctx, p.stroke/2, p.stroke/2, w-p.stroke, h-p.stroke, p.radius);
      ctx.stroke();
    }

    // text
    ctx.font = p.font;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = inputs.textColor.value || '#fff';
    ctx.fillText(p.text, Math.round(w/2 - m.w/2 + (p.stroke/2)), Math.round(h/2));

    // update status
    stat([
      'Status: OK',
      'JS geladen: \u2705',
      'Laatst gerenderd: ' + new Date().toLocaleTimeString(),
      'DPR: ' + dpr,
      'Normal canvas: CSS ' + cn.style.width + ' x ' + cn.style.height + ' | Buffer ' + cn.width + ' x ' + cn.height,
      'Urgent canvas: CSS '  + cu.style.width + ' x ' + cu.style.height + ' | Buffer ' + cu.width + ' x ' + cu.height,
      'Text metrics: w=' + m.w + ', h=' + m.h
    ]);
  }

  function draw(){
    drawOne(ctxN, cn, false);
    drawOne(ctxU, cu, true);
  }

  function save(canvas, base){
    var name = (base||'tag').replace(/[^a-z0-9-_]+/gi,'_');
    var a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Wire events
  ['text','uppercase','font','weight','size','padX','padY','textColor','strokeColor','stroke','radius','bgAlpha','bgColor','transparentBg','gradStart','gradEnd','gradAngle']
    .forEach(function(id){
      var el = inputs[id];
      if(el){ el.addEventListener('input', draw); el.addEventListener('change', draw); }
    });

  $('dlNormaal').addEventListener('click', function(){ save(cn, (inputs.text.value||'tag')+'__normaal.png'); });
  $('dlSpoed').addEventListener('click', function(){ save(cu, (inputs.text.value||'tag')+'__spoed.png'); });
  $('dlBeide').addEventListener('click', function(){
    save(cn, (inputs.text.value||'tag')+'__normaal.png');
    setTimeout(function(){ save(cu, (inputs.text.value||'tag')+'__spoed.png'); }, 200);
  });

  // Initial draw
  draw();
})();