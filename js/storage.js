// GeoQuiz — récords y ranking (localStorage), pestañas y reto por URL.
// ── RECORDS ──────────────────────────────────────────────────────────────
function getRecords(){try{return JSON.parse(localStorage.getItem('gq_records')||'[]');}catch{return[];}}
// Traduce el CÓDIGO de dificultad a lo que se pinta. El código es lo que viaja y lo que
// se guarda; la etiqueta se compone aquí, para que cambiar el texto no deje descolgadas
// las partidas ya guardadas. El último caso devuelve d tal cual porque los récords
// antiguos de este dispositivo guardaron la etiqueta, no el código.
function diffLabel(d){return d==='all'?'Todas':d==='facil'?'Fácil':d==='medio'?'Medio':d==='dificil'?'Difícil':(d==='na'||!d)?'—':d;}
function modeLabel(m){return m==='solo'?'Solo':m==='blitz'?'Blitz':m==='survival'?'Supervivencia':m==='crono'?'Cronológico':m==='fechas'?'Fechas':m==='duel'?'Duelo':m;}

// Cuántas de cuántas, que es lo único de la selección que se guarda: los nombres de las
// categorías no caben en la tabla y serían texto libre de cualquiera pintado en el
// navegador de todos.
// "2026-09-28" -> "28/09". La API devuelve la fecha entera, pero escrita así la columna
// ocupa 40 px menos y es lo que hace que la tabla quepa en un móvil de 375 px sin
// desplazarse. El año se pierde a propósito: el ranking guarda la mejor marca, no un
// histórico que haya que datar.
function fechaCorta(f){
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(f||''));
  return m?`${m[3]}/${m[2]}`:String(f||'');
}

function selLabel(eje,nsel,ntot){
  if(!ntot)return'';
  if(eje==='t')return`${nsel}/${ntot} temáticas`;
  return nsel>=ntot?'todas las épocas':`${nsel}/${ntot} épocas`;
}

// Resumen de una partida de la lista secundaria. Cronológico y Fechas no puntúan por
// aciertos sino por porcentaje de la puntuación máxima, así que no se les puede poner la
// misma etiqueta que a las demás sin mentir.
function partidaResumen(e){
  const trozos=[modeLabel(e.modo)];
  if(e.dif&&e.dif!=='na')trozos.push(diffLabel(e.dif));
  const sel=selLabel(e.eje,e.nsel,e.ntot);
  if(sel)trozos.push(sel);
  trozos.push(e.modo==='crono'||e.modo==='fechas'?`${e.pct}% de la máxima`:`${e.pct}% aciertos`);
  return trozos.join(' · ');
}
function saveRecord(r){const recs=getRecords();recs.push(r);recs.sort((a,b)=>b.score-a.score);localStorage.setItem('gq_records',JSON.stringify(recs.slice(0,10)));}
function getRanking(){try{return JSON.parse(localStorage.getItem('gq_ranking')||'[]');}catch{return[];}}

// Guarda siempre en local y además intenta subirlo al ranking global. Si la API
// no responde, la partida no se pierde: queda en el ranking de este dispositivo.
//
// Manda lo que se congeló al empezar la partida (`partida`), no lo que haya ahora en el
// menú: entre medias se puede haber cambiado la dificultad sin que la partida cambiase.
function saveRanking(name,score,pct){
  const r=getRanking();
  r.push({name,score,pct,modo:partida.modo,dif:partida.dif,eje:partida.eje,nsel:partida.nsel,ntot:partida.ntot,diff:diffLabel(partida.dif),date:new Date().toLocaleDateString("es-ES")});
  r.sort((a,b)=>b.score-a.score);
  localStorage.setItem('gq_ranking',JSON.stringify(r.slice(0,20)));
  enviarPuntuacionGlobal({
    nombre:name,puntos:score,pct,
    modo:partida.modo,dif:partida.dif,
    eje:partida.eje,nsel:partida.nsel,ntot:partida.ntot,
  }).then(res=>{
    if(res.ok&&res.cuerpo&&res.cuerpo.pos)
      toast(res.cuerpo.oficial?`Puesto #${res.cuerpo.pos} del ranking`:`Puesto #${res.cuerpo.pos} en otras partidas`);
    else if(res.ok)toast('Guardada en el ranking global');
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
  recDiv.innerHTML=`<p class="section-label">Tus mejores partidas en este dispositivo.</p><div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Puntos</th><th>Correctas</th><th>Modo</th><th>Dificultad</th><th>Selección</th><th>Fecha</th></tr></thead><tbody>${recs.map((r,i)=>`<tr><td>${MEDALLAS[i]||i+1}</td><td style="color:var(--accent);font-weight:600">${esc(Number(r.score).toLocaleString())}</td><td>${esc(r.correct)}/${esc(r.total)}</td><td>${esc(modeLabel(r.mode))}</td><td>${esc(r.diff||'—')}</td><td style="font-size:11px;color:var(--muted)">${esc(r.cats)}</td><td style="font-size:11px;color:var(--muted)">${esc(r.date)}</td></tr>`).join('')}</tbody></table></div><button class="clear-btn" onclick="clearRecords()">🗑 Borrar récords</button>`;
}

// Ranking de portada: solo PARTIDAS OFICIALES, es decir, modo solo con las 13 épocas
// puestas. Todas las filas jugaron el mismo temario y el mismo formato; la dificultad NO
// está fijada y sí multiplica los puntos (ver el comentario largo de api/ranking.php), por
// eso se pinta en su propia columna: es el dato que explica por qué dos filas no valen lo
// mismo aunque estén en la misma lista.
//
// La columna de Modo desaparece porque en la lista oficial siempre pone lo mismo, y su
// hueco lo ocupa la dificultad: seis columnas, sin ensanchar la tabla, que a 375 px ya se
// sale (410 px de tabla en 343 disponibles).
//
// Las DOS listas se pintan con esta misma función, así que no pueden divergir: mismas
// columnas, mismo orden, mismas medallas. Lo único propio de cada una es el encabezado y,
// en la de otras partidas, una línea pequeña bajo el nombre con el modo y la selección, que
// son los dos datos que ahí varían y para los que no queda columna.
function htmlTabla(r,detalle){
  return `<div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Aciertos</th><th>Dificultad</th><th class="celda-fecha">Fecha</th></tr></thead><tbody>${r.map(e=>`<tr><td>${MEDALLAS[e.pos-1]||e.pos}</td><td style="font-weight:600">${esc(e.nombre)}${detalle?`<div class="fila-detalle">${esc(detalle(e))}</div>`:''}</td><td style="color:var(--accent);font-weight:600">${esc(Number(e.puntos).toLocaleString())}</td><td>${esc(pctColumna(e))}</td><td class="celda-dif">${esc(diffLabel(e.dif))}</td><td class="celda-fecha" style="font-size:11px;color:var(--muted)">${esc(fechaCorta(e.fecha))}</td></tr>`).join('')}</tbody></table></div>`;
}

// Cronológico y Fechas no puntúan por aciertos sino por porcentaje de la puntuación máxima,
// así que debajo de la cabecera "Aciertos" no se les puede poner un número sin mentir. Se
// deja un guion y el dato real se enseña en la línea de detalle.
function pctColumna(e){return e.modo==='crono'||e.modo==='fechas'?'—':`${e.pct}%`;}

// Lo que no cabe en las columnas de la lista de otras partidas: el modo y la selección.
function detalleOtras(e){
  const t=[modeLabel(e.modo)];
  const sel=selLabel(e.eje,e.nsel,e.ntot);
  if(sel)t.push(sel);
  if(e.modo==='crono'||e.modo==='fechas')t.push(`${e.pct}% de la máxima`);
  return t.join(' · ');
}

function htmlOficial(r){
  const cab='<p class="section-label">🏆 Ranking global — partida oficial: las 13 épocas, modo solo.</p>';
  if(!r.length)return cab+'<div class="no-records">Todavía no hay ninguna partida oficial.<br>¡Sé el primero!</div>';
  return cab+htmlTabla(r,null);
}

function htmlOtras(r){
  if(!r.length)return'';
  return '<p class="section-label" style="margin-top:1.5rem">Ranking de otras partidas — blitz, supervivencia, cronológico, fechas y selecciones parciales.</p>'+htmlTabla(r,detalleOtras);
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
  const res=await cargarRankingGlobal();
  if(gen!==gqRankingGen)return;

  if(res.ok&&res.cuerpo&&Array.isArray(res.cuerpo.ranking)){
    div.innerHTML=htmlOficial(res.cuerpo.ranking)+htmlOtras(res.cuerpo.otras||[]);
    return;
  }

  const local=getRanking();
  const aviso='<p class="section-label" style="color:var(--orange)">⚠ No se pudo cargar el ranking global. Esto es solo lo de este dispositivo.</p>';
  if(!local.length){div.innerHTML=aviso+'<div class="no-records">Y aquí tampoco hay nada todavía.</div>';return;}
  // En dos líneas, igual que la lista de otras partidas: aquí conviven los seis modos y con
  // una cabecera fija de "Aciertos" se estaría llamando acierto al porcentaje de puntuación
  // máxima de Cronológico y Fechas, que es otra cosa. partidaResumen() lo distingue.
  // Las entradas guardadas antes de este cambio no traen modo, así que se pinta lo que hay.
  div.innerHTML=aviso+`<div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th></tr></thead><tbody>${local.map((e,i)=>`<tr><td>${MEDALLAS[i]||i+1}</td><td style="font-weight:600">${esc(e.name)}<div class="fila-detalle">${esc(e.modo?partidaResumen(e):`${e.diff||'—'} · ${e.pct}%`)} · ${esc(e.date)}</div></td><td style="color:var(--accent);font-weight:600">${esc(Number(e.score).toLocaleString())}</td></tr>`).join('')}</tbody></table></div><button class="clear-btn" onclick="clearRanking()">🗑 Borrar ranking local</button>`;
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
