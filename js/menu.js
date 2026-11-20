// GeoQuiz — pantalla de menú: épocas, temáticas, geografía, dificultad y modos.
// El banco se puede filtrar de tres formas excluyentes entre sí: por época (las nueve
// categorías cronológicas), por temática transversal (campo `t` de cada pregunta) o por
// continente (campo `g`). La variable global filterMode dice cuál está activa.
// Los tres ejes clasifican las mismas 521 preguntas por cuándo, por qué y por dónde, así
// que cada pregunta aparece en los tres: Pearl Harbor es II Guerra Mundial, Batallas y
// Asia y Pacífico a la vez. Antes vivía solo en «Asia y Pacífico» y no salía nunca
// jugando a la II Guerra Mundial.

// ── REJILLA DE ÉPOCAS ─────────────────────────────────────────────────────
// Las claves salen de CAT_STYLES (js/theme.js) y NO de recorrer las 521 preguntas.
// Dibujar el menú obligaba antes a tener el banco entero descargado y parseado: 67 KB,
// el 59% del JavaScript, de los que aquí solo se leían `cat` y `t` —el 7%— y todo ello
// antes de que el jugador pudiera pulsar nada. Son las mismas nueve claves, en el mismo
// orden, y cada una tiene su color y su icono declarados en ese archivo: una categoría
// nueva en el banco sin entrada allí saldría igualmente sin estilo, así que la lista
// buena es esa.
const CAT_KEYS=Object.keys(CAT_STYLES);
const catGrid=document.getElementById('cat-grid');
CAT_KEYS.forEach(cat=>{
  const card=document.createElement('div');
  card.className='cat-card';card.dataset.cat=cat;
  card.innerHTML=`<div class="cat-check">✓</div><div class="cat-icon">${CAT_ICONS[cat]||'📌'}</div><div class="cat-name">${cat}</div>`;
  // El icono de cada época se apoya en el degradado de su cabecera (js/theme.js).
  card.style.setProperty('--era',CAT_STYLES[cat].bg);
  card.addEventListener('click',()=>toggleCat(cat,card));
  catGrid.appendChild(card);
});

// ── REJILLA DE TEMÁTICAS ──────────────────────────────────────────────────
// Igual que arriba: las nueve salen de THEMES, sin recorrer el banco. La red de
// seguridad que dejaba fuera una temática sin preguntas se mantiene, pero se pasa más
// abajo (torneoTematicasVacias), ya con el banco cargado y sin bloquear el menú.
const THEME_KEYS=Object.keys(THEMES);
const themeGrid=document.getElementById('theme-grid');
THEME_KEYS.forEach(code=>{
  const card=document.createElement('div');
  card.className='cat-card';card.dataset.theme=code;
  card.innerHTML=`<div class="cat-check">✓</div><div class="cat-icon">${THEMES[code].icon}</div><div class="cat-name">${THEMES[code].name}</div>`;
  card.addEventListener('click',()=>toggleTheme(code,card));
  themeGrid.appendChild(card);
});
// Si todavía no hay ninguna pregunta etiquetada, el selector no tendría sentido.
if(!THEME_KEYS.length)document.getElementById('filter-switch').style.display='none';

// ── REJILLA DE GEOGRAFÍA ──────────────────────────────────────────────────
// Igual que las dos de arriba: las seis salen de GEOS (js/theme.js), sin recorrer el
// banco. Cada tarjeta lleva el degradado de su continente, como las épocas.
const GEO_KEYS=Object.keys(GEOS);
const geoGrid=document.getElementById('geo-grid');
GEO_KEYS.forEach(code=>{
  const card=document.createElement('div');
  card.className='cat-card';card.dataset.geo=code;
  // Con silueta de mapa de la región (geoMapaSvg, js/theme.js) y, si falta, el emoji de siempre.
  const mapa=(typeof geoMapaSvg==='function')?geoMapaSvg(code):null;
  card.innerHTML=`<div class="cat-check">✓</div><div class="cat-icon${mapa?' cat-icon-mapa':''}">${mapa||GEOS[code].icon}</div><div class="cat-name">${GEOS[code].name}</div>`;
  card.style.setProperty('--era',GEOS[code].bg);
  card.addEventListener('click',()=>toggleGeo(code,card));
  geoGrid.appendChild(card);
});

// El banco llega después de pintar el menú (va con defer, al final de index.html). Cuando
// está, se repasa que cada temática tenga preguntas de verdad y se esconde la que no: es
// la red que antes daba el recuento, ahora sin bloquear nada. Y se refresca el botón de
// Empezar por si alguien llegó a tocar una categoría en ese parpadeo.
document.addEventListener('DOMContentLoaded',()=>{
  if(typeof ALL_Q==='undefined')return;
  const vistas=new Set();
  ALL_Q.forEach(q=>(q.t||[]).forEach(t=>vistas.add(t)));
  THEME_KEYS.forEach(code=>{
    if(vistas.has(code))return;
    const card=themeGrid.querySelector(`[data-theme="${code}"]`);
    if(card)card.style.display='none';
  });
  // La misma red para los continentes: uno sin preguntas no se muestra.
  const geoVistas=new Set();
  ALL_Q.forEach(q=>(q.g||[]).forEach(g=>geoVistas.add(g)));
  GEO_KEYS.forEach(code=>{
    if(geoVistas.has(code))return;
    const card=geoGrid.querySelector(`[data-geo="${code}"]`);
    if(card)card.style.display='none';
  });
  updateStartBtn();
});

// ── SELECTOR ÉPOCAS / TEMÁTICAS / GEOGRAFÍA ───────────────────────────────
document.getElementById('filter-switch').addEventListener('click',e=>{
  const b=e.target.closest('.fs-btn');if(!b||b.dataset.filter===filterMode)return;
  document.querySelectorAll('.fs-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');filterMode=b.dataset.filter;
  const esTema=filterMode==='tematicas';
  catGrid.style.display=filterMode==='epocas'?'grid':'none';
  themeGrid.style.display=esTema?'grid':'none';
  geoGrid.style.display=filterMode==='geografia'?'grid':'none';
  document.getElementById('grid-label').textContent=
    esTema?'Temáticas':filterMode==='geografia'?'Continentes':'Categorías';
  // El aviso de que con una sola temática la partida entra en el ranking de esa temática.
  // Sin decirlo aquí, nadie lo descubre: la diferencia entre elegir una y elegir tres no se
  // ve en ninguna parte hasta que la partida ya está enviada.
  const info=document.getElementById('tema-info');
  if(info)info.style.display=esTema?'block':'none';
  updateSelectAllBtn();updateStartBtn();
  refrescarFotoMenu();
});

// ── SELECCIÓN ─────────────────────────────────────────────────────────────
function currentKeys(){return filterMode==='tematicas'?THEME_KEYS:filterMode==='geografia'?GEO_KEYS:CAT_KEYS;}
function currentSelection(){return filterMode==='tematicas'?selectedThemes:filterMode==='geografia'?selectedGeos:selectedCats;}
function currentCards(){return document.querySelectorAll(filterMode==='tematicas'?'#theme-grid .cat-card':filterMode==='geografia'?'#geo-grid .cat-card':'#cat-grid .cat-card');}

function updateSelectAllBtn(){
  const sel=currentSelection();
  document.getElementById('select-all-btn').textContent=
    currentKeys().length&&currentKeys().every(k=>sel.has(k))?'Deseleccionar todas':'Seleccionar todas';
}

function toggleAllCats(){
  const keys=currentKeys(),sel=currentSelection();
  const todas=keys.every(k=>sel.has(k));
  if(todas){keys.forEach(k=>sel.delete(k));currentCards().forEach(c=>c.classList.remove('selected'));}
  else{keys.forEach(k=>sel.add(k));currentCards().forEach(c=>c.classList.add('selected'));}
  updateSelectAllBtn();updateStartBtn();
  refrescarFotoMenu();
}

// La cabecera del menú lleva foto desde el 20/11/2026. Al tocar una época pasa a ser la
// suya, que es la forma de ver de un vistazo qué estás eligiendo; al quitarla, vuelve a la
// que toque (fotoDelMenu, en theme.js).
function refrescarFotoMenu(cat){try{setHeaderFoto(cat||'menu');}catch(e){}}

function toggleCat(cat,card){
  if(selectedCats.has(cat)){selectedCats.delete(cat);card.classList.remove('selected');}
  else{selectedCats.add(cat);card.classList.add('selected');}
  updateSelectAllBtn();updateStartBtn();
  refrescarFotoMenu(selectedCats.has(cat)?cat:null);
}

function toggleTheme(code,card){
  if(selectedThemes.has(code)){selectedThemes.delete(code);card.classList.remove('selected');}
  else{selectedThemes.add(code);card.classList.add('selected');}
  updateSelectAllBtn();updateStartBtn();
}

function toggleGeo(code,card){
  if(selectedGeos.has(code)){selectedGeos.delete(code);card.classList.remove('selected');}
  else{selectedGeos.add(code);card.classList.add('selected');}
  updateSelectAllBtn();updateStartBtn();
}

// Texto de la selección activa, para los récords y para compartir resultado.
function selectionLabel(){
  if(gameMode==='crono')return'Todos los periodos';
  if(gameMode==='fechas')return'Eventos y fechas';
  if(filterMode==='tematicas')return[...selectedThemes].map(t=>THEMES[t]?THEMES[t].name:t).join(', ');
  if(filterMode==='geografia')return[...selectedGeos].map(g=>GEOS[g]?GEOS[g].name:g).join(', ');
  return[...selectedCats].join(', ');
}

// Resumen numérico de la selección, que es lo que viaja al ranking global. No se manda
// el nombre de las categorías por dos motivos: no cabe en la tabla, y sería texto libre
// escrito por cualquiera y pintado en el navegador de todos los demás.
//
// La única excepción es `tema`, y solo cuando hay UNA temática elegida: ahí sí viaja, pero
// como código de tres letras ('bat', 'esp'), que el servidor comprueba contra su propia
// lista cerrada (GQ_TEMAS en api/db.php). Es lo que mete la partida en el ranking de esa
// temática; con dos o más elegidas no hay un ranking al que pertenecer y la partida va a la
// lista de otras partidas, como siempre.
function selectionCode(){
  if(gameMode==='crono'||gameMode==='fechas')return{eje:'n',nsel:0,ntot:0};
  if(filterMode==='epocas')return{eje:'e',nsel:selectedCats.size,ntot:CAT_KEYS.length};
  if(filterMode==='geografia')return{eje:'g',nsel:selectedGeos.size,ntot:GEO_KEYS.length};
  const cod={eje:'t',nsel:selectedThemes.size,ntot:THEME_KEYS.length};
  if(selectedThemes.size===1)cod.tema=[...selectedThemes][0];
  return cod;
}

// Congela en `partida` lo que se ha elegido en el menú. Lo llaman los tres arranques
// (startGame, startCrono, startFechas) justo antes de la primera pregunta.
function congelarPartida(){
  // Antes de nada, cortar los cronómetros de cualquier partida anterior que siguiera viva.
  // La barra Jugar/Récords/Ranking está en el <header>, fuera de las pantallas, así que se
  // puede volver al menú a mitad de partida y empezar otra sin que la primera se entere: sus
  // cronómetros seguían corriendo y, al agotarse, llamaba a showResult() con el `partida`
  // de la SEGUNDA, de modo que una ronda de Cronológico podía guardarse como si fuera una
  // partida oficial de modo solo. Empezar una partida cancela la anterior, que es lo que el
  // jugador está haciendo de todas formas.
  pararCronometros();
  partida={modo:gameMode,dif:gameMode==='crono'||gameMode==='fechas'?'na':selectedDiff,...selectionCode(),cats:selectionLabel(),torneo:''};
}

// ── DIFICULTAD Y MODO ─────────────────────────────────────────────────────
document.getElementById('diff-row').addEventListener('click',e=>{
  const b=e.target.closest('.diff-btn');if(!b)return;
  document.querySelectorAll('.diff-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');selectedDiff=b.dataset.diff;updateStartBtn();
});

document.getElementById('mode-row').addEventListener('click',e=>{
  const b=e.target.closest('.mode-btn');if(!b)return;
  document.querySelectorAll('.mode-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');gameMode=b.dataset.mode;
  // Cronológico y Fechas juegan con los eventos, no con el banco de preguntas: ahí no
  // aplican ni las épocas ni las temáticas ni la dificultad.
  const isCrono=gameMode==='crono', isFechas=gameMode==='fechas', isDuel=gameMode==='duel';
  document.getElementById('cat-diff-section').style.display=isCrono||isFechas?'none':'block';
  document.getElementById('crono-info').style.display=isCrono?'block':'none';
  document.getElementById('fechas-info').style.display=isFechas?'block':'none';
  document.getElementById('duelo-info').style.display=isDuel?'block':'none';
  document.getElementById('start-actions').style.display=isDuel?'none':'block';
  document.getElementById('duelo-actions').style.display=isDuel?'flex':'none';
  updateStartBtn();
});

// ── POOL Y BOTÓN DE INICIO ────────────────────────────────────────────────
function buildPool(){
  const base=filterMode==='tematicas'
    ?ALL_Q.filter(q=>(q.t||[]).some(t=>selectedThemes.has(t)))
    :filterMode==='geografia'
    ?ALL_Q.filter(q=>(q.g||[]).some(g=>selectedGeos.has(g)))
    :ALL_Q.filter(q=>selectedCats.has(q.cat));
  return base.filter(q=>selectedDiff==='all'||q.diff===selectedDiff);
}

function updateStartBtn(){
  const btn=document.getElementById('start-btn');
  if(gameMode==='crono'){
    btn.disabled=false;
    btn.textContent=`Empezar — ${cronoTotal} rondas cronológicas`;
    return;
  }
  if(gameMode==='fechas'){
    btn.disabled=false;
    btn.textContent=`Empezar — ${fechasTotal} rondas de fechas`;
    return;
  }
  if(!currentSelection().size){
    btn.disabled=true;
    btn.textContent=filterMode==='tematicas'?'Selecciona al menos una temática':filterMode==='geografia'?'Selecciona al menos un continente':'Selecciona al menos una categoría';
    return;
  }
  // El banco ya no bloquea el menú, así que en el instante entre que se pinta y que
  // termina de llegar podría pulsarse algo. Dura un parpadeo, pero sin esto reventaría.
  if(typeof ALL_Q==='undefined'){
    btn.disabled=true;
    btn.textContent='Cargando preguntas…';
    return;
  }
  const pool=buildPool();
  btn.disabled=pool.length===0;
  const max=gameMode==='survival'?'∞':Math.min(pool.length,10);
  btn.textContent=pool.length>0?`Empezar — ${max} preguntas`:'Sin preguntas con estos filtros';
}

document.getElementById('start-btn').addEventListener('click',()=>{
  if(gameMode==='crono'){startCrono();}
  else if(gameMode==='fechas'){startFechas();}
  else{startGame();}
});

// ── BIENVENIDA ────────────────────────────────────────────────────────────
// Una vez por dispositivo; si no hay almacenamiento, se enseña siempre hasta que se cierre.
function iniciarBienvenida() {
  const caja = document.getElementById('bienvenida');
  if (!caja) return;
  let vista = false;
  try { vista = localStorage.getItem('gq_bienvenida') === '1'; } catch {}
  const reto = document.getElementById('challenge-banner');
  if (!vista && !(reto && reto.classList.contains('show'))) caja.classList.add('show');
}
function cerrarBienvenida() {
  const caja = document.getElementById('bienvenida');
  if (caja) caja.classList.remove('show');
  try { localStorage.setItem('gq_bienvenida', '1'); } catch {}
}
