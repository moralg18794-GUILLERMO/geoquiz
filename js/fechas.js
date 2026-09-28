// GeoQuiz — modo Fechas: emparejar cada evento con su año.
// Interacción por toques, no arrastre: se toca el evento y luego su año. En el modo
// Cronológico el arrastre obligó a escribir manejadores táctiles aparte; aquí no hace
// falta y funciona igual en ratón y en dedo.

// ── ESTADO ────────────────────────────────────────────────────────────────
let fechasRound=0, fechasScore=0, fechasTotal=5, fechasTimerInt=null, fechasTimeLeft=45;
let fechasItems=[], fechasPool=[], fechasAsignado=[], fechasActivo=-1;
let fechasSeen=new Set(), fechasResuelta=false;

function anyoTexto(y){return y<0?Math.abs(y)+' a.C.':String(y);}

function startFechas(){
  playStart();
  fechasRound=0; fechasScore=0; fechasSeen=new Set();
  showScreen('screen-fechas');
  setHeaderStyle('Antigüedad');
  renderFechasRound();
}

// Elige 5 eventos CERCANOS en el tiempo y de años distintos. Si se cogieran 5 al azar
// del banco entero, emparejar la batalla de Maratón con el -490 sería trivial: la
// gracia está en tener que distinguir entre años parecidos.
function pickFechasEvents(){
  let avail=CRONO_EVENTS.filter(e=>!fechasSeen.has(e.name));
  if(avail.length<10){fechasSeen=new Set();avail=[...CRONO_EVENTS];}
  const ordenados=[...avail].sort((a,b)=>a.year-b.year);
  const ventana=Math.min(14,ordenados.length);
  const inicio=Math.floor(Math.random()*(ordenados.length-ventana+1));
  const elegidos=[], vistos=new Set();
  shuffle(ordenados.slice(inicio,inicio+ventana)).forEach(e=>{
    if(elegidos.length<5&&!vistos.has(e.year)){vistos.add(e.year);elegidos.push(e);}
  });
  // Si la ventana no daba para cinco años distintos, se completa con el resto del banco.
  if(elegidos.length<5){
    shuffle([...CRONO_EVENTS]).forEach(e=>{
      if(elegidos.length<5&&!vistos.has(e.year)){vistos.add(e.year);elegidos.push(e);}
    });
  }
  elegidos.forEach(e=>fechasSeen.add(e.name));
  return shuffle(elegidos);
}

function renderFechasRound(){
  fechasRound++;
  fechasResuelta=false;
  document.getElementById('fechas-prog-label').textContent=`Ronda ${fechasRound} de ${fechasTotal}`;
  document.getElementById('fechas-prog-fill').style.width=`${((fechasRound-1)/fechasTotal)*100}%`;
  document.getElementById('fechas-score').textContent=fechasScore;
  document.getElementById('fechas-next-btn').style.display='none';
  document.getElementById('fechas-feedback').innerHTML='';
  const btn=document.getElementById('fechas-confirm-btn');
  btn.style.display='block'; btn.disabled=true;

  fechasItems=pickFechasEvents();
  fechasAsignado=fechasItems.map(()=>null);
  fechasActivo=0;
  fechasPool=shuffle(fechasItems.map(e=>e.year));

  renderFechasList(); renderFechasPool();
  startFechasTimer();
}

function renderFechasList(){
  document.getElementById('fechas-list').innerHTML=fechasItems.map((ev,i)=>`
    <div class="fecha-item${fechasActivo===i?' activo':''}" data-idx="${i}" onclick="tocarEventoFecha(${i})">
      <div class="fecha-texto">
        <div class="fecha-nombre">${ev.name}</div>
        <div class="fecha-desc">${ev.desc}</div>
        <div class="fecha-correcta">Era ${anyoTexto(ev.year)}</div>
      </div>
      <div class="fecha-slot${fechasAsignado[i]!==null?' lleno':''}">${fechasAsignado[i]!==null?anyoTexto(fechasAsignado[i]):'—'}</div>
    </div>`).join('');
}

function renderFechasPool(){
  document.getElementById('fechas-pool').innerHTML=fechasPool.map(y=>
    `<button class="year-chip${fechasAsignado.indexOf(y)>=0?' usado':''}" onclick="tocarAnyoFecha(${y})">${anyoTexto(y)}</button>`
  ).join('');
}

// Tocar un evento lo selecciona. Si ya tenía año, lo devuelve al montón.
function tocarEventoFecha(i){
  if(fechasResuelta)return;
  if(fechasAsignado[i]!==null)fechasAsignado[i]=null;
  fechasActivo=i;
  renderFechasList(); renderFechasPool(); actualizarBotonFechas();
}

// Tocar un año lo coloca en el evento activo; si no hay ninguno, en el primer hueco.
function tocarAnyoFecha(y){
  if(fechasResuelta)return;
  if(fechasAsignado.indexOf(y)>=0)return;
  let destino=fechasActivo;
  if(destino<0||fechasAsignado[destino]!==null)destino=fechasAsignado.indexOf(null);
  if(destino<0)return;
  fechasAsignado[destino]=y;
  fechasActivo=fechasAsignado.indexOf(null);
  renderFechasList(); renderFechasPool(); actualizarBotonFechas();
}

function actualizarBotonFechas(){
  document.getElementById('fechas-confirm-btn').disabled=fechasAsignado.indexOf(null)>=0;
}

// ── TEMPORIZADOR ──────────────────────────────────────────────────────────
function startFechasTimer(){
  clearInterval(fechasTimerInt);
  fechasTimeLeft=45;
  updateFechasTimerUI();
  fechasTimerInt=setInterval(()=>{
    fechasTimeLeft--;
    updateFechasTimerUI();
    if(fechasTimeLeft<=5)playTick();
    if(fechasTimeLeft<=0){clearInterval(fechasTimerInt);confirmFechas();}
  },1000);
}
function updateFechasTimerUI(){
  const arc=document.getElementById('fechas-timer-arc');
  const num=document.getElementById('fechas-timer-num');
  arc.style.strokeDashoffset=113.1*(1-fechasTimeLeft/45);
  arc.style.stroke=fechasTimeLeft<=5?'#f85149':fechasTimeLeft<=15?'#e8a020':'#c9a84c';
  num.textContent=fechasTimeLeft;
}

// ── CORREGIR ──────────────────────────────────────────────────────────────
function confirmFechas(){
  if(fechasResuelta)return;
  fechasResuelta=true;
  clearInterval(fechasTimerInt);
  fechasActivo=-1;
  document.getElementById('fechas-confirm-btn').style.display='none';
  renderFechasList(); renderFechasPool();

  const items=document.querySelectorAll('.fecha-item');
  let aciertos=0;
  fechasItems.forEach((ev,i)=>{
    const ok=fechasAsignado[i]===ev.year;
    items[i].classList.add(ok?'correct-pos':'wrong-pos');
    items[i].classList.add('revelado');
    if(ok)aciertos++;
  });

  const total=fechasItems.length;
  // Mismo baremo que el modo Cronológico: 100 por acierto y 300 de bonus si están los cinco.
  const pts=aciertos*100+(aciertos===total?300:0);
  fechasScore+=pts;
  document.getElementById('fechas-score').textContent=fechasScore;

  const perfecto=aciertos===total;
  if(perfecto)playCorrect(); else if(aciertos>0)playTimeout(); else playWrong();
  flashHeader(perfecto?'rgba(63,185,80,0.4)':'rgba(248,81,73,0.2)');

  document.getElementById('fechas-feedback').innerHTML=`
    <div class="crono-score-pop">${perfecto?'🏆 ¡Pleno!':aciertos>0?`✓ ${aciertos}/${total} correctos`:'✗ Ninguno correcto'}</div>
    <div style="font-size:13px;color:${perfecto?'var(--green)':aciertos>0?'var(--accent)':'var(--red)'};">+${pts} puntos</div>`;

  if(fechasRound>=fechasTotal){
    setTimeout(showFechasResult,400);
  } else {
    document.getElementById('fechas-next-btn').style.display='block';
  }
}

function nextFechas(){renderFechasRound();}

function showFechasResult(){
  playFinish();
  const pct=Math.round((fechasScore/(fechasTotal*800))*100);
  let rank,msg;
  if(pct>=80){rank="Archivero Infalible";msg="Le pones fecha a todo sin pestañear.";}
  else if(pct>=55){rank="Cronista Solvente";msg="Sitúas bien los hechos, aunque alguna década se te escape.";}
  else if(pct>=30){rank="Aprendiz de Archivo";msg="Te suenan todos los eventos; los años son otra historia.";}
  else{rank="Despistado Temporal";msg="Los siglos te bailan. Eso se arregla jugando.";}

  const playerName=prompt('¿Tu nombre para el ranking? (deja vacío para no guardar)','');
  if(playerName&&playerName.trim())saveRanking(playerName.trim(),fechasScore,pct,'—');
  saveRecord({score:fechasScore,correct:'-',total:fechasTotal+'r',mode:'fechas',diff:'—',cats:'Eventos y fechas',date:new Date().toLocaleDateString('es-ES')});

  document.getElementById('result-hero').innerHTML=`
    <div style="font-size:40px;margin-bottom:0.5rem">🔗</div>
    <div><span class="result-score-num">${fechasScore.toLocaleString()}</span></div>
    <div style="font-size:13px;color:var(--muted);margin-top:4px">${fechasTotal} rondas · ${pct}% de puntuación máxima</div>
    <div class="result-rank">${rank}</div>
    <div class="result-msg">${msg}</div>
    <div class="result-actions" style="margin-top:1.5rem">
      <button class="btn-secondary" onclick="copyFechasResult()">📋 Copiar</button>
      <button class="btn-primary" onclick="goMenu()">Jugar de nuevo</button>
    </div>`;
  showScreen('screen-result');
}

function copyFechasResult(){
  const pct=Math.round((fechasScore/(fechasTotal*800))*100);
  const gameURL=window.location.href.split('?')[0];
  const text=`🗺️ GeoQuiz — Modo Fechas\n🔗 Emparejé eventos históricos con su año\n⭐ ${fechasScore.toLocaleString()} puntos · ${fechasTotal} rondas (${pct}%)\n\n¿Puedes superarme? Juega aquí:\n${gameURL}`;
  navigator.clipboard.writeText(text).then(()=>toast('¡Resultado copiado!')).catch(()=>toast('No se pudo copiar'));
}
