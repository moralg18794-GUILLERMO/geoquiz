// GeoQuiz — récords y ranking (localStorage), pestañas y reto por URL.
// ── RECORDS ──────────────────────────────────────────────────────────────
function getRecords(){try{return JSON.parse(localStorage.getItem('gq_records')||'[]');}catch{return[];}}
function diffLabel(d){return d==='all'?'Todas':d==='facil'?'Fácil':d==='medio'?'Medio':d==='dificil'?'Difícil':d;}
function saveRecord(r){const recs=getRecords();recs.push(r);recs.sort((a,b)=>b.score-a.score);localStorage.setItem('gq_records',JSON.stringify(recs.slice(0,10)));}
function getRanking(){try{return JSON.parse(localStorage.getItem('gq_ranking')||'[]');}catch{return[];}}

// Guarda siempre en local y además intenta subirlo al ranking global. Si la API
// no responde, la partida no se pierde: queda en el ranking de este dispositivo.
function saveRanking(name,score,pct,diff){
  const r=getRanking();
  r.push({name,score,pct,diff:diff||'—',date:new Date().toLocaleDateString('es-ES')});
  r.sort((a,b)=>b.score-a.score);
  localStorage.setItem('gq_ranking',JSON.stringify(r.slice(0,20)));
  enviarPuntuacionGlobal({nombre:name,puntos:score,pct,modo:gameMode,dif:diff||''})
    .then(res=>{
      if(res.ok&&res.cuerpo&&res.cuerpo.pos)toast(`Puesto #${res.cuerpo.pos} en el ranking global`);
      else if(res.estado===429)toast('Demasiados envíos seguidos: guardado solo aquí');
      else toast('Sin conexión con el ranking global: guardado aquí');
    });
}

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

const MEDALLAS=['🥇','🥈','🥉'];

function renderRecords(){
  const recs=getRecords();
  const recDiv=document.getElementById('screen-records');
  if(!recs.length){recDiv.innerHTML='<div class="no-records">Aún no hay récords. ¡Juega tu primera partida!</div>';return;}
  recDiv.innerHTML=`<p class="section-label">Tus mejores partidas en este dispositivo.</p><div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Puntos</th><th>Correctas</th><th>Modo</th><th>Dificultad</th><th>Selección</th><th>Fecha</th></tr></thead><tbody>${recs.map((r,i)=>`<tr><td>${MEDALLAS[i]||i+1}</td><td style="color:var(--accent);font-weight:600">${esc(Number(r.score).toLocaleString())}</td><td>${esc(r.correct)}/${esc(r.total)}</td><td>${esc(r.mode)}</td><td>${esc(r.diff||'—')}</td><td style="font-size:11px;color:var(--muted)">${esc(r.cats)}</td><td style="font-size:11px;color:var(--muted)">${esc(r.date)}</td></tr>`).join('')}</tbody></table></div><button class="clear-btn" onclick="clearRecords()">🗑 Borrar récords</button>`;
}

// El ranking es global: se pide a la API. Si no hay conexión se enseña el de este
// dispositivo, avisando de que es solo local para que nadie lo confunda.
//
// El contador evita que una respuesta lenta de una visita anterior pise a la de la
// visita actual: al entrar y salir de la pestaña varias veces seguidas, la primera
// petición puede llegar después de la segunda y dejar datos viejos en pantalla.
let gqRankingGen=0;
async function renderRanking(){
  const gen=++gqRankingGen;
  const div=document.getElementById('screen-ranking');
  div.innerHTML='<div class="no-records">Cargando ranking global…</div>';
  const res=await cargarRankingGlobal(50);
  if(gen!==gqRankingGen)return;

  if(res.ok&&res.cuerpo&&Array.isArray(res.cuerpo.ranking)){
    const r=res.cuerpo.ranking;
    if(!r.length){div.innerHTML='<p class="section-label">🌍 Ranking global, compartido por todo el que juega.</p><div class="no-records">Todavía no hay ninguna puntuación.<br>¡Sé el primero!</div>';return;}
    div.innerHTML=`<p class="section-label">🌍 Ranking global, compartido por todo el que juega.</p><div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Aciertos</th><th>Modo</th><th>Fecha</th></tr></thead><tbody>${r.map(e=>`<tr><td>${MEDALLAS[e.pos-1]||e.pos}</td><td style="font-weight:600">${esc(e.nombre)}</td><td style="color:var(--accent);font-weight:600">${esc(Number(e.puntos).toLocaleString())}</td><td>${esc(e.pct)}%</td><td>${esc(e.modo)}</td><td style="font-size:11px;color:var(--muted)">${esc(e.fecha)}</td></tr>`).join('')}</tbody></table></div>`;
    return;
  }

  const local=getRanking();
  const aviso='<p class="section-label" style="color:var(--orange)">⚠ No se pudo cargar el ranking global. Esto es solo lo de este dispositivo.</p>';
  if(!local.length){div.innerHTML=aviso+'<div class="no-records">Y aquí tampoco hay nada todavía.</div>';return;}
  div.innerHTML=aviso+`<div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Aciertos</th><th>Dificultad</th><th>Fecha</th></tr></thead><tbody>${local.map((e,i)=>`<tr><td>${MEDALLAS[i]||i+1}</td><td style="font-weight:600">${esc(e.name)}</td><td style="color:var(--accent);font-weight:600">${esc(Number(e.score).toLocaleString())}</td><td>${esc(e.pct)}%</td><td>${esc(e.diff||'—')}</td><td style="font-size:11px;color:var(--muted)">${esc(e.date)}</td></tr>`).join('')}</tbody></table></div><button class="clear-btn" onclick="clearRanking()">🗑 Borrar ranking local</button>`;
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
