// GeoQuiz — modo Cronológico (arrastrar y ordenar eventos).
// ── CRONO STATE ───────────────────────────────────────────────────────────
let cronoRound=0, cronoScore=0, cronoTotal=5, cronoTimerInt=null, cronoTimeLeft=45;
let cronoItems=[], cronoDragSrc=null, cronoSeen=new Set();

function startCrono(){
  playStart();
  congelarPartida();
  cronoRound=0; cronoScore=0;
  cronoSeen=new Set();
  showScreen('screen-crono');
  setHeaderStyle('Antigüedad');
  renderCronoRound();
}

function renderCronoRound(){
  cronoRound++;
  document.getElementById('crono-prog-label').textContent=`Ronda ${cronoRound} de ${cronoTotal}`;
  document.getElementById('crono-prog-fill').style.width=`${((cronoRound-1)/cronoTotal)*100}%`;
  document.getElementById('crono-score').textContent=cronoScore;
  document.getElementById('crono-next-btn').style.display='none';
  document.getElementById('crono-feedback').innerHTML='';
  document.getElementById('crono-confirm-btn').style.display='block';
  document.getElementById('crono-confirm-btn').disabled=false;

  // Pick 5 events not yet seen this game (avoid repetition across rounds)
  let avail=CRONO_EVENTS.filter(e=>!cronoSeen.has(e.name));
  if(avail.length<5){cronoSeen=new Set();avail=CRONO_EVENTS;}
  const picked=shuffle([...avail]).slice(0,5);
  picked.forEach(e=>cronoSeen.add(e.name));
  // Shuffle display order so they don't appear pre-sorted
  cronoItems=shuffle([...picked]);

  renderCronoList();
  startCronoTimer();
}

function renderCronoList(){
  const list=document.getElementById('crono-list');
  list.innerHTML=cronoItems.map((ev,i)=>`
    <div class="crono-item" draggable="true" data-idx="${i}"
      ondragstart="cronoDragStart(event,${i})"
      ondragover="cronoDragOver(event,${i})"
      ondragend="cronoDragEnd(event)"
      ondrop="cronoDrop(event,${i})"
      ontouchstart="cronoTouchStart(event,${i})"
      ontouchmove="cronoTouchMove(event)"
      ontouchend="cronoTouchEnd(event,${i})">
      <div class="crono-pos">${i+1}</div>
      <div class="crono-event">
        <div class="crono-event-name">${ev.name}</div>
        <div class="crono-event-cat">${ev.desc}</div>
        <div class="crono-event-year">${ev.year<0?Math.abs(ev.year)+' a.C.':ev.year}</div>
      </div>
      <div class="crono-drag-icon">⠿</div>
    </div>
  `).join('');
  updatePosNumbers();
}

function updatePosNumbers(){
  document.querySelectorAll('.crono-item').forEach((el,i)=>{
    el.querySelector('.crono-pos').textContent=i+1;
  });
}

// ── DRAG & DROP (desktop) ──────────────────────────────────────────────────
function cronoDragStart(e,idx){
  cronoDragSrc=idx;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed='move';
}
function cronoDragOver(e,idx){
  e.preventDefault();
  document.querySelectorAll('.crono-item').forEach(el=>el.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}
function cronoDragEnd(e){
  e.target.classList.remove('dragging');
  document.querySelectorAll('.crono-item').forEach(el=>el.classList.remove('drag-over'));
}
function cronoDrop(e,idx){
  e.preventDefault();
  if(cronoDragSrc===null||cronoDragSrc===idx)return;
  // Reorder cronoItems
  const moved=cronoItems.splice(cronoDragSrc,1)[0];
  cronoItems.splice(idx,0,moved);
  cronoDragSrc=null;
  renderCronoList();
}

// ── TOUCH DRAG (mobile) ────────────────────────────────────────────────────
let touchDragIdx=null, touchClone=null, touchStartY=0;
function cronoTouchStart(e,idx){
  touchDragIdx=idx;
  touchStartY=e.touches[0].clientY;
  e.currentTarget.classList.add('touch-dragging');
}
function cronoTouchMove(e){
  e.preventDefault();
  const touch=e.touches[0];
  const items=document.querySelectorAll('.crono-item');
  items.forEach(el=>el.classList.remove('drag-over'));
  const el=document.elementFromPoint(touch.clientX,touch.clientY);
  if(el){
    const item=el.closest('.crono-item');
    if(item&&item!==items[touchDragIdx])item.classList.add('drag-over');
  }
}
function cronoTouchEnd(e){
  const touch=e.changedTouches[0];
  document.querySelectorAll('.crono-item').forEach(el=>{
    el.classList.remove('touch-dragging','drag-over');
  });
  const el=document.elementFromPoint(touch.clientX,touch.clientY);
  if(el){
    const item=el.closest('.crono-item');
    if(item){
      const targetIdx=parseInt(item.dataset.idx);
      if(!isNaN(targetIdx)&&targetIdx!==touchDragIdx){
        const moved=cronoItems.splice(touchDragIdx,1)[0];
        cronoItems.splice(targetIdx,0,moved);
        renderCronoList();
      }
    }
  }
  touchDragIdx=null;
}

// ── CRONO TIMER ───────────────────────────────────────────────────────────
function startCronoTimer(){
  clearInterval(cronoTimerInt);
  cronoTimeLeft=45;
  updateCronoTimerUI();
  cronoTimerInt=setInterval(()=>{
    cronoTimeLeft--;
    updateCronoTimerUI();
    if(cronoTimeLeft<=5)playTick();
    if(cronoTimeLeft<=0){clearInterval(cronoTimerInt);confirmCrono();}
  },1000);
}
function updateCronoTimerUI(){
  const arc=document.getElementById('crono-timer-arc');
  const num=document.getElementById('crono-timer-num');
  arc.style.strokeDashoffset=113.1*(1-cronoTimeLeft/45);
  arc.style.stroke=cronoTimeLeft<=5?'#f85149':cronoTimeLeft<=15?'#e8a020':'#c9a84c';
  num.textContent=cronoTimeLeft;
}

// ── CONFIRM ORDER ─────────────────────────────────────────────────────────
function confirmCrono(){
  clearInterval(cronoTimerInt);
  document.getElementById('crono-confirm-btn').style.display='none';

  const sorted=[...cronoItems].sort((a,b)=>a.year-b.year);
  let correctPairs=0;
  const total=cronoItems.length;

  // Check how many are in correct position
  const items=document.querySelectorAll('.crono-item');
  cronoItems.forEach((ev,i)=>{
    const isCorrect=ev.year===sorted[i].year;
    items[i].classList.add(isCorrect?'correct-pos':'wrong-pos');
    items[i].classList.add('revealed');
    if(isCorrect)correctPairs++;
  });

  // Points: 100 per correct position, bonus for perfect
  const pts=correctPairs*100+(correctPairs===total?300:0);
  cronoScore+=pts;
  document.getElementById('crono-score').textContent=cronoScore;

  const isPerfect=correctPairs===total;
  if(isPerfect)playCorrect(); else if(correctPairs>0)playTimeout(); else playWrong();
  if(isPerfect)flashHeader('rgba(63,185,80,0.4)'); else flashHeader('rgba(248,81,73,0.2)');

  // Show correct order
  const correctOrder=sorted.map(ev=>`<strong>${ev.year<0?Math.abs(ev.year)+' a.C.':ev.year}</strong> — ${ev.name}`).join('<br>');
  document.getElementById('crono-feedback').innerHTML=`
    <div class="crono-score-pop">${isPerfect?'🏆 ¡Perfecto!':correctPairs>0?`✓ ${correctPairs}/${total} en orden`:'✗ Ninguno correcto'}</div>
    <div style="font-size:13px;color:${isPerfect?'var(--green)':correctPairs>0?'var(--accent)':'var(--red)'};">+${pts} puntos</div>
    <div class="crono-answer-reveal">
      <div style="margin-bottom:6px;color:var(--text);font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">Orden correcto:</div>
      ${correctOrder}
    </div>`;

  if(cronoRound>=cronoTotal){
    setTimeout(showCronoResult,400);
  } else {
    document.getElementById('crono-next-btn').style.display='block';
  }
}

function nextCrono(){renderCronoRound();}

function showCronoResult(){
  playFinish();
  const pct=Math.round((cronoScore/(cronoTotal*800))*100);
  let rank,msg;
  if(pct>=80){rank="Maestro del Tiempo";msg="Tienes la historia en la cabeza con fecha y todo.";}
  else if(pct>=55){rank="Cronista Avanzado";msg="Buen sentido temporal, pero algunos eventos te descuadran.";}
  else if(pct>=30){rank="Historiador Novato";msg="Conoces los eventos pero los años te confunden.";}
  else{rank="Analfabeto Temporal";msg="La línea del tiempo es tu enemigo… de momento.";}

  const playerName=prompt('¿Tu nombre para el ranking? (deja vacío para no guardar)','');
  if(playerName&&playerName.trim())saveRanking(playerName.trim(),cronoScore,pct);
  saveRecord({score:cronoScore,correct:'-',total:cronoTotal+'r',mode:partida.modo,diff:'—',cats:partida.cats,date:new Date().toLocaleDateString('es-ES')});

  document.getElementById('result-hero').innerHTML=`
    <div style="font-size:40px;margin-bottom:0.5rem">📅</div>
    <div><span class="result-score-num">${cronoScore.toLocaleString()}</span></div>
    <div style="font-size:13px;color:var(--muted);margin-top:4px">${cronoTotal} rondas · ${pct}% de puntuación máxima</div>
    <div class="result-rank">${rank}</div>
    <div class="result-msg">${msg}</div>
    <div class="result-actions" style="margin-top:1.5rem">
      <button class="btn-whatsapp" onclick="compartirWhatsApp(textoCrono())">💬 WhatsApp</button>
      <button class="btn-secondary" onclick="copyCronoResult()">📋 Copiar</button>
      <button class="btn-primary" onclick="goMenu()">Jugar de nuevo</button>
    </div>`;
  showScreen('screen-result');
}

function textoCrono(){
  const pct=Math.round((cronoScore/(cronoTotal*800))*100);
  const gameURL=window.location.href.split('?')[0];
  return `🗺️ GeoQuiz — Modo Cronológico\n📅 Ordené eventos históricos en la línea del tiempo\n⭐ ${cronoScore.toLocaleString()} puntos · ${cronoTotal} rondas (${pct}%)\n\n¿Puedes superarme? Juega aquí:\n${gameURL}`;
}

function copyCronoResult(){
  navigator.clipboard.writeText(textoCrono()).then(()=>toast('¡Resultado copiado!')).catch(()=>toast('No se pudo copiar'));
}
