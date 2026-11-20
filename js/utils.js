// GeoQuiz — utilidades compartidas.
// ── SHUFFLE ───────────────────────────────────────────────────────────────
function shuffle(a){const r=[...a];for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;}

// Mezcla las opciones de una pregunta para que la correcta no caiga siempre en la misma
// posición. Reordena opts y recoloca ans a la vez, de modo que el resto del código
// (pick, 50:50, tiempo agotado) sigue funcionando sin cambios.
function shuffleOptions(q){
  const correcta=q.opts[q.ans];
  q.opts=shuffle(q.opts);
  q.ans=q.opts.indexOf(correcta);
}

// Escapa texto para meterlo en innerHTML. Imprescindible desde que el ranking es
// global: los nombres los escribe cualquiera y se pintan en el navegador de todos.
function esc(v){
  return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Abre WhatsApp con el texto ya escrito: en el móvil lo recoge la aplicación y en
// el escritorio, WhatsApp Web. No hace falta número: wa.me sin destinatario deja
// elegir el chat.
function compartirWhatsApp(texto){
  window.open('https://wa.me/?text='+encodeURIComponent(texto),'_blank','noopener');
}

// Texto para invitar a jugar, sin puntuación: el que se manda desde el menú.
// Redactado por Guillermo palabra por palabra; no reescribirlo sin pedírselo.
function textoInvitacion(){
  const url=window.location.href.split('?')[0];
  return `🗺️ Te he retado en GeoQuiz: preguntas de guerras, conflictos y geopolítica, de la Antigüedad a Ucrania.\nSeis modos y ranking compartido. ¿Listo para la batalla, soldado?\n${url}`;
}

function toast(msg){
  const t=document.getElementById('share-toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2500);
}

// ── IMAGEN PARA COMPARTIR ─────────────────────────────────────────────────
// Una tarjeta cuadrada con la nota del jugador, dibujada con canvas en su propio móvil: no
// se sube a ningún sitio. Va por WhatsApp junto al texto del reto, y una imagen con tu nota
// llama más la atención en un grupo que un enlace suelto. Cada pantalla de resultado deja en
// `ultimaTarjeta` lo que hay que pintar: {titulo, puntos, detalle, neon, legal, texto}.
let ultimaTarjeta = null;

function cargarImagen(src) {
  return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
}

// Parte un texto en líneas que quepan en `ancho` píxeles con la fuente ya puesta en `ctx`.
function lineasDeTexto(ctx, texto, ancho) {
  const lineas = []; let actual = '';
  for (const palabra of String(texto).split(/\s+/)) {
    const prueba = actual ? actual + ' ' + palabra : palabra;
    if (actual && ctx.measureText(prueba).width > ancho) { lineas.push(actual); actual = palabra; }
    else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

async function tarjetaResultado(d) {
  const W = 1080, H = 1080;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  // Las fuentes de la página tienen que estar listas antes de pintar con ellas.
  try {
    await Promise.all([document.fonts.load('700 60px "Libre Baskerville"'), document.fonts.load('italic 700 60px "Libre Baskerville"'), document.fonts.load('600 40px Inter')]);
  } catch {}

  x.fillStyle = '#0b0f17'; x.fillRect(0, 0, W, H);
  if (d.neon) {
    // La ilustración propia del torneo, recortada como un «cover» a mano, y fundida con el fondo.
    const arte = await cargarImagen('img/atardecer.svg?v=1');
    const ah = 540, k = Math.max(W / 720, ah / 320), w = 720 * k, h = 320 * k;
    x.drawImage(arte, (W - w) / 2, ah - h, w, h);
    const f = x.createLinearGradient(0, ah - 170, 0, ah + 4);
    f.addColorStop(0, 'rgba(11,15,23,0)'); f.addColorStop(1, '#0b0f17');
    x.fillStyle = f; x.fillRect(0, ah - 170, W, 176);
  } else {
    const g = x.createRadialGradient(W / 2, 230, 10, W / 2, 230, 720);
    g.addColorStop(0, 'rgba(201,168,76,0.30)'); g.addColorStop(1, 'rgba(11,15,23,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(201,168,76,0.22)'; x.lineWidth = 3;
    x.beginPath(); x.arc(W / 2, 250, 190, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.ellipse(W / 2, 250, 80, 190, 0, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(W / 2 - 190, 250); x.lineTo(W / 2 + 190, 250); x.moveTo(W / 2, 60); x.lineTo(W / 2, 440); x.stroke();
  }

  // Marca
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.font = '700 54px "Libre Baskerville"'; x.fillStyle = '#fff'; x.fillText('Geo', 64, 104);
  const gw = x.measureText('Geo').width;
  x.font = 'italic 700 54px "Libre Baskerville"'; x.fillStyle = '#e0b94f'; x.fillText('Quiz', 64 + gw, 104);

  // Título (el del torneo o el rango ganado), centrado, hasta dos líneas
  x.textAlign = 'center'; x.fillStyle = '#fff';
  x.font = 'italic 700 50px "Libre Baskerville"';
  const lineas = lineasDeTexto(x, d.titulo, 900).slice(0, 2);
  lineas.forEach((l, i) => x.fillText(l, W / 2, 610 + i * 62));

  // Puntuación, en degradado
  const yP = 610 + (lineas.length - 1) * 62 + 205;
  const gp = x.createLinearGradient(0, yP - 160, 0, yP);
  if (d.neon) { gp.addColorStop(0, '#ffe27a'); gp.addColorStop(1, '#ff3d81'); }
  else { gp.addColorStop(0, '#f1d98a'); gp.addColorStop(1, '#c9a84c'); }
  x.fillStyle = gp; x.font = '700 190px "Libre Baskerville"';
  x.fillText(d.puntos, W / 2, yP);
  x.fillStyle = 'rgba(255,255,255,0.8)'; x.font = '600 40px Inter';
  x.fillText(d.detalle, W / 2, yP + 64);

  // Reto y, si procede, la aclaración de que no es oficial
  const yR = yP + 140, rw = 560;
  const gr = x.createLinearGradient(W / 2 - rw / 2, 0, W / 2 + rw / 2, 0);
  if (d.neon) { gr.addColorStop(0, '#ff3d81'); gr.addColorStop(1, '#ff9a3c'); } else { gr.addColorStop(0, '#e7c96e'); gr.addColorStop(1, '#c9a84c'); }
  x.fillStyle = gr; x.beginPath(); x.roundRect(W / 2 - rw / 2, yR - 48, rw, 74, 37); x.fill();
  x.fillStyle = '#1a0626'; x.font = '700 38px Inter'; x.fillText('¿Puedes superarme?', W / 2, yR);
  if (d.legal) { x.fillStyle = 'rgba(255,255,255,0.5)'; x.font = '500 24px Inter'; x.fillText(d.legal, W / 2, H - 34); }

  return new Promise((ok, ko) => c.toBlob(b => b ? ok(b) : ko(new Error('canvas')), 'image/png'));
}

// En el móvil abre la hoja de compartir (WhatsApp incluido) con la imagen adjunta; donde no
// se puede, la descarga para subirla a mano.
async function compartirImagen() {
  if (!ultimaTarjeta) return;
  try {
    const blob = await tarjetaResultado(ultimaTarjeta);
    const archivo = new File([blob], 'geoquiz-resultado.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], text: ultimaTarjeta.texto || '' });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'geoquiz-resultado.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Imagen guardada: súbela a tu chat');
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // cerró la hoja de compartir: no es un error
    toast('No se pudo crear la imagen');
  }
}

// ── NOMBRE DE JUGADOR ─────────────────────────────────────────────────────
// El nombre se guarda UNA vez en este dispositivo y se usa solo en el ranking, los duelos y como
// relleno del torneo, igual que una sesión iniciada. Es el mismo valor que ya usaba el torneo
// ('gq_torneo_mote'), así que quien ya había jugado uno lo conserva. Se cambia o se quita desde la
// pestaña Perfil. Si no hay nombre guardado se pregunta como siempre y, si responde algo, se queda.
function gqNombreGuardado(){
  try{return localStorage.getItem('gq_torneo_mote')||'';}catch{return '';}
}
function gqGuardarNombre(n){
  n=String(n||'').replace(/\s+/g,' ').trim().slice(0,24);
  try{if(n)localStorage.setItem('gq_torneo_mote',n);else localStorage.removeItem('gq_torneo_mote');}catch{}
  return n;
}
function gqNombre(pregunta){
  const n=gqNombreGuardado();
  if(n)return n;
  const r=(prompt(pregunta,'')||'').trim();
  return r?gqGuardarNombre(r):'';
}

// ── CUADROS PROPIOS (sustituyen a prompt() y confirm()) ───────────────────
// Algunos navegadores incrustados (el de Instagram, TikTok, etc.) bloquean las ventanitas nativas:
// el torneo se quedaba sin poder pedir el nombre. Estos cuadros viven dentro de la página, devuelven
// una promesa y se cierran con Intro, Escape o tocando fuera. El texto se pinta con textContent
// (nunca como HTML), así que un título de torneo o un nombre no pueden colar nada.
//   gqPedir({titulo, texto, previo, placeholder, boton, max, mayus}) → texto escrito, o null si cancela
//   gqConfirmar({titulo, texto, si, no}) → true / false
function gqCuadro(opc){
  return new Promise(resolve=>{
    let cerrado=false;
    const previoFoco=document.activeElement;
    const velo=document.createElement('div');velo.className='gq-velo';
    const caja=document.createElement('div');caja.className='gq-caja';
    caja.setAttribute('role','dialog');caja.setAttribute('aria-modal','true');
    const t=document.createElement('div');t.className='gq-titulo';t.textContent=opc.titulo||'';
    const p=document.createElement('div');p.className='gq-texto';p.textContent=opc.texto||'';
    caja.appendChild(t);if(opc.texto)caja.appendChild(p);
    let campo=null;
    if(opc.pedir){
      campo=document.createElement('input');campo.className='gq-campo';campo.type='text';
      campo.value=opc.previo||'';campo.placeholder=opc.placeholder||'';
      campo.maxLength=opc.max||24;campo.autocomplete='off';campo.setAttribute('autocapitalize',opc.mayus?'characters':'sentences');
      campo.setAttribute('aria-label',opc.titulo||'Escribe aquí');
      caja.appendChild(campo);
    }
    const fila=document.createElement('div');fila.className='gq-botones';
    const no=document.createElement('button');no.type='button';no.className='gq-no';no.textContent=opc.no||'Cancelar';
    const si=document.createElement('button');si.type='button';si.className='gq-si';si.textContent=opc.si||'Aceptar';
    fila.appendChild(no);fila.appendChild(si);caja.appendChild(fila);
    velo.appendChild(caja);
    function cerrar(valor){
      if(cerrado)return;cerrado=true;
      document.removeEventListener('keydown',tecla,true);
      velo.remove();
      try{if(previoFoco&&previoFoco.focus)previoFoco.focus();}catch{}
      resolve(valor);
    }
    function aceptar(){
      if(!opc.pedir){cerrar(true);return;}
      let v=campo.value.replace(/\s+/g,' ').trim();
      if(opc.mayus)v=v.toUpperCase();
      cerrar(v);
    }
    function tecla(e){
      if(e.key==='Escape'){e.preventDefault();cerrar(opc.pedir?null:false);}
      else if(e.key==='Enter'&&e.target!==no){e.preventDefault();aceptar();}
      else if(e.key==='Tab'){
        const f=[campo,no,si].filter(Boolean),i=f.indexOf(document.activeElement);
        e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus();
      }
    }
    no.addEventListener('click',()=>cerrar(opc.pedir?null:false));
    si.addEventListener('click',aceptar);
    velo.addEventListener('mousedown',e=>{if(e.target===velo)cerrar(opc.pedir?null:false);});
    document.addEventListener('keydown',tecla,true);
    document.body.appendChild(velo);
    (campo||si).focus();
    if(campo)campo.select();
  });
}
function gqPedir(opc){return gqCuadro(Object.assign({pedir:true,si:'Aceptar'},opc||{}));}
function gqConfirmar(opc){return gqCuadro(Object.assign({pedir:false},opc||{}));}

// Igual que gqNombre, pero con cuadro propio. Si ya hay nombre guardado, lo devuelve sin preguntar.
async function gqNombreAsync(pregunta){
  const n=gqNombreGuardado();
  if(n)return n;
  const r=await gqPedir({titulo:'Tu nombre',texto:pregunta,placeholder:'Tu nombre o mote',boton:'Aceptar',max:24});
  return r?gqGuardarNombre(r):'';
}

// Adaptadores con la misma forma que prompt() y confirm(), para cambiar cada llamada sin tocar el resto.
// Un texto con salto de línea se parte en título (primera línea) y cuerpo (el resto).
function gqPartir(texto){
  const t=String(texto||''),i=t.indexOf('\n');
  return i<0?{titulo:t,texto:''}:{titulo:t.slice(0,i).trim(),texto:t.slice(i+1).trim()};
}
async function gqPromptPropio(texto,previo,opc){
  return gqPedir(Object.assign(gqPartir(texto),{previo:previo||'',placeholder:'Escribe aquí',si:'Aceptar'},opc||{}));
}
async function gqConfirmPropio(texto,si,no){
  return gqConfirmar(Object.assign(gqPartir(texto),{si:si||'Aceptar',no:no||'Cancelar'}));
}

// ── ACABADOS (marcador que sube, confeti y vibración) ─────────────────────────────
// Todo es adorno: si el móvil pide «reducir movimiento» no se anima nada, y si falla algo se
// queda el resultado tal cual, sin avisar. La vibración solo la tienen algunos Android (iPhone
// la ignora) y respeta el botón de sonido: sin sonido, tampoco vibra.
function gqSinMovimiento(){try{return matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){return false;}}
function vibrar(patron){
  try{if(soundOn&&navigator.vibrate&&!gqSinMovimiento())navigator.vibrate(patron);}catch(e){}
}
// Cuenta desde 0 hasta la cifra que ya hay escrita, con el mismo formato de miles.
function marcadorSube(el,ms){
  if(!el)return;
  const fin=parseInt(el.textContent.replace(/\D/g,''),10),txt=el.textContent;
  if(!(fin>0)||gqSinMovimiento())return;
  const t0=performance.now();
  el.style.fontVariantNumeric='tabular-nums';
  (function paso(t){
    const k=Math.min(1,(t-t0)/(ms||1100)),e=1-Math.pow(1-k,3);
    el.textContent=k<1?Math.round(fin*e).toLocaleString():txt;
    if(k<1)requestAnimationFrame(paso);
  })(t0);
}
// Lluvia de confeti en un lienzo que no tapa los toques y se borra solo.
function confeti(){
  if(gqSinMovimiento())return;
  try{
    const cv=document.createElement('canvas');
    cv.setAttribute('aria-hidden','true');
    cv.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9000';
    const W=cv.width=innerWidth,H=cv.height=innerHeight,cx=cv.getContext('2d');
    if(!cx)return;
    document.body.appendChild(cv);
    const col=['#ff3d81','#ff9a3c','#2de2e6','#e7c96e','#ffffff'];
    const ps=Array.from({length:90},()=>({
      x:W/2+(Math.random()-0.5)*W*0.3,y:H*0.32,
      vx:(Math.random()-0.5)*9,vy:-Math.random()*9-3,
      w:5+Math.random()*5,h:3+Math.random()*4,r:Math.random()*6,vr:(Math.random()-0.5)*0.4,
      c:col[(Math.random()*col.length)|0]}));
    const t0=performance.now();
    (function paso(t){
      const k=(t-t0)/2800;
      cx.clearRect(0,0,W,H);
      ps.forEach(p=>{p.vy+=0.22;p.vx*=0.992;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;
        cx.save();cx.globalAlpha=Math.max(0,1-Math.max(0,k-0.6)/0.4);cx.translate(p.x,p.y);cx.rotate(p.r);
        cx.fillStyle=p.c;cx.fillRect(-p.w/2,-p.h/2,p.w,p.h);cx.restore();});
      if(k<1)requestAnimationFrame(paso);else cv.remove();
    })(t0);
  }catch(e){}
}
// Se llama al abrir la pantalla de resultado: la cifra sube; en el torneo y con la nota
// máxima además llueve confeti y vibra.
function acabadosResultado(){
  try{
    const hero=document.getElementById('result-hero');
    if(!hero)return;
    marcadorSube(hero.querySelector('.result-score-num'),1100);
    const gran=/Gran Estratega/.test((hero.querySelector('.result-rank')||{}).textContent||'');
    if(hero.classList.contains('evento')||gran){setTimeout(confeti,350);vibrar([60,40,60,40,120]);}
  }catch(e){}
}
