// GeoQuiz — pantalla de menú: épocas, temáticas, dificultad y modos.
// El banco se puede filtrar de dos formas excluyentes entre sí: por categoría
// cronológica (las 13 de siempre) o por temática transversal (campo `t` de cada
// pregunta). La variable global filterMode dice cuál está activa.

// ── REJILLA DE ÉPOCAS ─────────────────────────────────────────────────────
const CATEGORIES={};
ALL_Q.forEach(q=>{CATEGORIES[q.cat]=(CATEGORIES[q.cat]||0)+1;});
const catGrid=document.getElementById('cat-grid');
Object.keys(CATEGORIES).forEach(cat=>{
  const card=document.createElement('div');
  card.className='cat-card';card.dataset.cat=cat;
  card.innerHTML=`<div class="cat-check">✓</div><div class="cat-icon">${CAT_ICONS[cat]||'📌'}</div><div class="cat-name">${cat}</div><div class="cat-count">${CATEGORIES[cat]} preguntas</div>`;
  card.addEventListener('click',()=>toggleCat(cat,card));
  catGrid.appendChild(card);
});

// ── REJILLA DE TEMÁTICAS ──────────────────────────────────────────────────
const THEME_COUNTS={};
Object.keys(THEMES).forEach(t=>{THEME_COUNTS[t]=0;});
ALL_Q.forEach(q=>{(q.t||[]).forEach(t=>{if(t in THEME_COUNTS)THEME_COUNTS[t]++;});});
const THEME_KEYS=Object.keys(THEMES).filter(t=>THEME_COUNTS[t]>0);
const themeGrid=document.getElementById('theme-grid');
THEME_KEYS.forEach(code=>{
  const card=document.createElement('div');
  card.className='cat-card';card.dataset.theme=code;
  card.innerHTML=`<div class="cat-check">✓</div><div class="cat-icon">${THEMES[code].icon}</div><div class="cat-name">${THEMES[code].name}</div><div class="cat-count">${THEME_COUNTS[code]} preguntas</div>`;
  card.addEventListener('click',()=>toggleTheme(code,card));
  themeGrid.appendChild(card);
});
// Si todavía no hay ninguna pregunta etiquetada, el selector no tendría sentido.
if(!THEME_KEYS.length)document.getElementById('filter-switch').style.display='none';

// ── SELECTOR ÉPOCAS / TEMÁTICAS ───────────────────────────────────────────
document.getElementById('filter-switch').addEventListener('click',e=>{
  const b=e.target.closest('.fs-btn');if(!b||b.dataset.filter===filterMode)return;
  document.querySelectorAll('.fs-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');filterMode=b.dataset.filter;
  const esTema=filterMode==='tematicas';
  catGrid.style.display=esTema?'none':'grid';
  themeGrid.style.display=esTema?'grid':'none';
  document.getElementById('grid-label').textContent=esTema?'Temáticas:':'Categorías:';
  updateSelectAllBtn();updateStartBtn();
});

// ── SELECCIÓN ─────────────────────────────────────────────────────────────
function currentKeys(){return filterMode==='tematicas'?THEME_KEYS:Object.keys(CATEGORIES);}
function currentSelection(){return filterMode==='tematicas'?selectedThemes:selectedCats;}
function currentCards(){return document.querySelectorAll(filterMode==='tematicas'?'#theme-grid .cat-card':'#cat-grid .cat-card');}

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
}

function toggleCat(cat,card){
  if(selectedCats.has(cat)){selectedCats.delete(cat);card.classList.remove('selected');}
  else{selectedCats.add(cat);card.classList.add('selected');}
  updateSelectAllBtn();updateStartBtn();
}

function toggleTheme(code,card){
  if(selectedThemes.has(code)){selectedThemes.delete(code);card.classList.remove('selected');}
  else{selectedThemes.add(code);card.classList.add('selected');}
  updateSelectAllBtn();updateStartBtn();
}

// Texto de la selección activa, para los récords y para compartir resultado.
function selectionLabel(){
  if(gameMode==='crono')return'Todos los periodos';
  if(gameMode==='fechas')return'Eventos y fechas';
  return filterMode==='tematicas'
    ?[...selectedThemes].map(t=>THEMES[t]?THEMES[t].name:t).join(', ')
    :[...selectedCats].join(', ');
}

// Resumen numérico de la selección, que es lo que viaja al ranking global. No se manda
// el nombre de las categorías por dos motivos: no cabe en la tabla, y sería texto libre
// escrito por cualquiera y pintado en el navegador de todos los demás.
function selectionCode(){
  if(gameMode==='crono'||gameMode==='fechas')return{eje:'n',nsel:0,ntot:0};
  return filterMode==='tematicas'
    ?{eje:'t',nsel:selectedThemes.size,ntot:THEME_KEYS.length}
    :{eje:'e',nsel:selectedCats.size,ntot:Object.keys(CATEGORIES).length};
}

// Congela en `partida` lo que se ha elegido en el menú. Lo llaman los tres arranques
// (startGame, startCrono, startFechas) justo antes de la primera pregunta.
function congelarPartida(){
  partida={modo:gameMode,dif:gameMode==='crono'||gameMode==='fechas'?'na':selectedDiff,...selectionCode(),cats:selectionLabel()};
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
  document.getElementById('duel-names').style.display=gameMode==='duel'?'flex':'none';
  // Cronológico y Fechas juegan con los eventos, no con el banco de preguntas: ahí no
  // aplican ni las épocas ni las temáticas ni la dificultad.
  const isCrono=gameMode==='crono', isFechas=gameMode==='fechas';
  document.getElementById('cat-diff-section').style.display=isCrono||isFechas?'none':'block';
  document.getElementById('crono-info').style.display=isCrono?'block':'none';
  document.getElementById('fechas-info').style.display=isFechas?'block':'none';
  updateStartBtn();
});

// ── POOL Y BOTÓN DE INICIO ────────────────────────────────────────────────
function buildPool(){
  const base=filterMode==='tematicas'
    ?ALL_Q.filter(q=>(q.t||[]).some(t=>selectedThemes.has(t)))
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
    btn.textContent=filterMode==='tematicas'?'Selecciona al menos una temática':'Selecciona al menos una categoría';
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
