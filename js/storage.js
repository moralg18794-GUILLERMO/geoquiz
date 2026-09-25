// GeoQuiz — récords y ranking (localStorage), pestañas y reto por URL.
// ── RECORDS ──────────────────────────────────────────────────────────────
function getRecords(){try{return JSON.parse(localStorage.getItem('gq_records')||'[]');}catch{return[];}}
function diffLabel(d){return d==='all'?'Todas':d==='facil'?'Fácil':d==='medio'?'Medio':d==='dificil'?'Difícil':d;}
function saveRecord(r){const recs=getRecords();recs.push(r);recs.sort((a,b)=>b.score-a.score);localStorage.setItem('gq_records',JSON.stringify(recs.slice(0,10)));}
function getRanking(){try{return JSON.parse(localStorage.getItem('gq_ranking')||'[]');}catch{return[];}}
function saveRanking(name,score,pct,diff){const r=getRanking();r.push({name,score,pct,diff:diff||'—',date:new Date().toLocaleDateString('es-ES')});r.sort((a,b)=>b.score-a.score);localStorage.setItem('gq_ranking',JSON.stringify(r.slice(0,20)));}

// ── TABS ─────────────────────────────────────────────────────────────────
function showTab(tab){
  showScreen('screen-'+tab);
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const nb=document.querySelector(`.nav-btn[onclick="showTab('${tab}')"]`);
  if(nb)nb.classList.add('active');
  if(tab==='records')renderRecords();
  if(tab==='ranking')renderRanking();
}

function tbl(headers,rows,emptyMsg){
  if(!rows.length)return`<div class="no-records">${emptyMsg}</div>`;
  return`<div style="overflow-x:auto"><table class="records-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderRecords(){
  const recs=getRecords();
  const medals=['🥇','🥈','🥉'];
  const recDiv=document.getElementById('screen-records');
  if(!recs.length){recDiv.innerHTML='<div class="no-records">Aún no hay récords. ¡Juega tu primera partida!</div>';return;}
  recDiv.innerHTML=`<div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Puntos</th><th>Correctas</th><th>Modo</th><th>Dificultad</th><th>Categorías</th><th>Fecha</th></tr></thead><tbody>${recs.map((r,i)=>`<tr><td>${medals[i]||i+1}</td><td style="color:var(--accent);font-weight:600">${r.score.toLocaleString()}</td><td>${r.correct}/${r.total}</td><td>${r.mode}</td><td>${r.diff||'—'}</td><td style="font-size:11px;color:var(--muted)">${r.cats}</td><td style="font-size:11px;color:var(--muted)">${r.date}</td></tr>`).join('')}</tbody></table></div><button class="clear-btn" onclick="clearRecords()">🗑 Borrar récords</button>`;
}

function renderRanking(){
  const r=getRanking();
  const medals=['🥇','🥈','🥉'];
  const div=document.getElementById('screen-ranking');
  if(!r.length){div.innerHTML='<div class="no-records">El ranking está vacío.<br>¡Sé el primero en puntuarlo!</div>';return;}
  div.innerHTML=`<div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Aciertos</th><th>Dificultad</th><th>Fecha</th></tr></thead><tbody>${r.map((e,i)=>`<tr><td>${medals[i]||i+1}</td><td style="font-weight:600">${e.name}</td><td style="color:var(--accent);font-weight:600">${e.score.toLocaleString()}</td><td>${e.pct}%</td><td>${e.diff||'—'}</td><td style="font-size:11px;color:var(--muted)">${e.date}</td></tr>`).join('')}</tbody></table></div><button class="clear-btn" onclick="clearRanking()">🗑 Borrar ranking</button>`;
}

function clearRecords(){localStorage.removeItem('gq_records');renderRecords();}
function clearRanking(){localStorage.removeItem('gq_ranking');renderRanking();}

// ── CHALLENGE (URL params) ────────────────────────────────────────────────
function checkChallenge(){
  try{
    const p=new URLSearchParams(window.location.search);
    if(p.get('challenge')){
      const score=parseInt(p.get('s')||0);
      const correct=parseInt(p.get('c')||0);
      const total=parseInt(p.get('t')||0);
      const banner=document.getElementById('challenge-banner');
      document.getElementById('cb-score').textContent=`${score.toLocaleString()} puntos`;
      document.getElementById('cb-detail').textContent=`${correct}/${total} correctas · ¿Puedes superarlo?`;
      banner.classList.add('show');
    }
  }catch(e){}
}

function generateChallengeURL(){
  const base=window.location.href.split('?')[0];
  return`${base}?challenge=1&s=${score}&c=${correct}&t=${gameQ.length}`;
}
