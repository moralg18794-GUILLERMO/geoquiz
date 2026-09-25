// GeoQuiz — pantalla de menú: categorías, dificultad y modos.
// ── MENU BUILD ────────────────────────────────────────────────────────────
const CATEGORIES={};
ALL_Q.forEach(q=>{if(!CATEGORIES[q.cat])CATEGORIES[q.cat]={};});
const catGrid=document.getElementById('cat-grid');
Object.keys(CATEGORIES).forEach(cat=>{
  const card=document.createElement('div');
  card.className='cat-card';card.dataset.cat=cat;
  card.innerHTML=`<div class="cat-check">✓</div><div class="cat-icon">${CAT_ICONS[cat]||'📌'}</div><div class="cat-name">${cat}</div>`;
  card.addEventListener('click',()=>toggleCat(cat,card));
  catGrid.appendChild(card);
});

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
  // Hide categories & difficulty in crono mode (they don't apply), show info instead
  const isCrono=gameMode==='crono';
  document.getElementById('cat-diff-section').style.display=isCrono?'none':'block';
  document.getElementById('crono-info').style.display=isCrono?'block':'none';
  updateStartBtn();
});

function toggleAllCats(){
  const allCats=Object.keys(CATEGORIES);
  const allSelected=allCats.every(c=>selectedCats.has(c));
  const btn=document.getElementById('select-all-btn');
  if(allSelected){
    selectedCats.clear();
    document.querySelectorAll('.cat-card').forEach(c=>c.classList.remove('selected'));
    btn.textContent='Seleccionar todas';
  } else {
    allCats.forEach(c=>selectedCats.add(c));
    document.querySelectorAll('.cat-card').forEach(c=>c.classList.add('selected'));
    btn.textContent='Deseleccionar todas';
  }
  updateStartBtn();
}

function toggleCat(cat,card){
  if(selectedCats.has(cat)){selectedCats.delete(cat);card.classList.remove('selected');}
  else{selectedCats.add(cat);card.classList.add('selected');}
  const allCats=Object.keys(CATEGORIES);
  const btn=document.getElementById('select-all-btn');
  btn.textContent=allCats.every(c=>selectedCats.has(c))?'Deseleccionar todas':'Seleccionar todas';
  updateStartBtn();
}
function buildPool(){return ALL_Q.filter(q=>selectedCats.has(q.cat)&&(selectedDiff==='all'||q.diff===selectedDiff));}
function updateStartBtn(){
  const btn=document.getElementById('start-btn');
  if(gameMode==='crono'){
    btn.disabled=false;
    btn.textContent=`Empezar — ${cronoTotal} rondas cronológicas`;
    return;
  }
  const pool=buildPool();
  btn.disabled=pool.length===0||selectedCats.size===0;
  const max=gameMode==='survival'?'∞':Math.min(pool.length,10);
  btn.textContent=pool.length>0?`Empezar — ${max} preguntas`:'Sin preguntas con estos filtros';
}
document.getElementById('start-btn').addEventListener('click',()=>{
  if(gameMode==='crono'){startCrono();}
  else{startGame();}
});
