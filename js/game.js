// GeoQuiz — bucle de juego: solo, blitz, supervivencia y duelo.
// ── GAME START ────────────────────────────────────────────────────────────
function startGame(){
  playStart();
  let pool=buildPool();
  let fresh=pool.filter(q=>!seenQ.has(q.q));
  if(fresh.length<(gameMode==='survival'?5:10)){seenQ.clear();fresh=pool;}
  const selected=gameMode==='survival'?shuffle(fresh):shuffle(fresh).slice(0,10);
  selected.forEach(q=>seenQ.add(q.q));
  congelarPartida();
  gameQ=selected;current=0;score=0;correct=0;wrong=0;lives=3;maxStreak=0;streak=0;skipped=0;
  hint5050=true;hintSkip=true;hintDato=true;answered=false;blitzLeft=60;timeLeft=20;lastCat='';
  if(gameMode==='duel'){
    duel.p1.name=document.getElementById('p1name').value||'Jugador 1';
    duel.p2.name=document.getElementById('p2name').value||'Jugador 2';
    duel.p1.score=0;duel.p2.score=0;duel.p1.lives=3;duel.p2.lives=3;duel.turn=1;
  }

  const firstCat=gameQ[0].cat;
  const arrancar=()=>{
    showScreen('screen-game');
    setupHUD();
    setHeaderStyle(firstCat);
    lastCat=firstCat;
    renderQuestion();
  };
  // Jugando por temáticas se salta de época en casi cada pregunta: la cortinilla
  // de época no aporta nada y retrasa 900 ms cada ronda.
  if(filterMode==='tematicas')arrancar();
  else showCatTransition(firstCat,arrancar);
}

function setupHUD(){
  const isSolo=gameMode!=='duel';
  document.getElementById('solo-hud').style.display=isSolo?'flex':'none';
  document.getElementById('blitz-bar').style.display=gameMode==='blitz'?'block':'none';
  document.getElementById('survival-label').style.display=gameMode==='survival'?'block':'none';
  document.getElementById('duel-hud-wrap').style.display=gameMode==='duel'?'block':'none';
  document.getElementById('timer-wrap').style.display=gameMode==='blitz'?'none':'flex';
  document.getElementById('hud-mult-wrap').style.display=gameMode==='solo'||gameMode==='survival'?'flex':'none';
  if(gameMode==='duel'){
    document.getElementById('dp1-name').textContent=duel.p1.name;
    document.getElementById('dp2-name').textContent=duel.p2.name;
  }
}

// ── HUD UPDATE ────────────────────────────────────────────────────────────
function rl(n){return[0,1,2].map(i=>`<span class="life${i>=n?' lost':''}">❤️</span>`).join('');}
function updateHUD(){
  if(gameMode==='duel'){
    document.getElementById('dp1-score').textContent=duel.p1.score;
    document.getElementById('dp2-score').textContent=duel.p2.score;
    document.getElementById('dp1-lives').innerHTML=rl(duel.p1.lives);
    document.getElementById('dp2-lives').innerHTML=rl(duel.p2.lives);
    document.getElementById('dp1').classList.toggle('active',duel.turn===1);
    document.getElementById('dp2').classList.toggle('active',duel.turn===2);
    document.getElementById('duel-turn').textContent=`Turno de ${duel.turn===1?duel.p1.name:duel.p2.name}`;
  } else {
    document.getElementById('hud-score').textContent=score;
    const mult=getMultiplier();
    document.getElementById('hud-mult').textContent='x'+mult;
    document.getElementById('hud-mult-wrap').style.color=mult>=3?'var(--orange)':mult>=2?'var(--accent)':'var(--text)';
    if(gameMode!=='survival'){
      const total=gameQ.length;
      document.getElementById('prog-label').textContent=`Pregunta ${current+1} de ${total}`;
      document.getElementById('prog-fill').style.width=`${(current/total)*100}%`;
    } else {
      document.getElementById('surv-num').textContent=current+1;
    }
    document.getElementById('lives-wrap').innerHTML=rl(lives);
  }
}

// ── TIMER ─────────────────────────────────────────────────────────────────
function startTimer(){
  clearInterval(timerInt);timeLeft=20;updateTimerUI();
  timerInt=setInterval(()=>{
    timeLeft--;updateTimerUI();
    if(timeLeft<=5)playTick();
    if(timeLeft<=0){clearInterval(timerInt);timeOutAnswer();}
  },1000);
}
function updateTimerUI(){
  const arc=document.getElementById('timer-arc'),num=document.getElementById('timer-num');
  arc.style.strokeDashoffset=113.1*(1-timeLeft/20);
  arc.style.stroke=timeLeft<=5?'#f85149':timeLeft<=10?'#e8a020':'#c9a84c';
  num.textContent=timeLeft;
}
function startBlitz(){
  clearInterval(blitzInt);blitzLeft=60;
  blitzInt=setInterval(()=>{
    blitzLeft--;
    document.getElementById('blitz-time').textContent=blitzLeft+'s';
    document.getElementById('blitz-fill').style.width=(blitzLeft/60*100)+'%';
    if(blitzLeft<=10)playTick();
    if(blitzLeft<=0){clearInterval(blitzInt);showResult();}
  },1000);
}
function timeOutAnswer(){
  if(answered)return;answered=true;
  playTimeout();
  const q=gameQ[current];
  if(gameMode==='duel'){const p=duel.turn===1?duel.p1:duel.p2;p.lives--;}
  else{lives--;wrong++;streak=0;}
  updateHUD();
  document.querySelectorAll('.opt-btn').forEach(b=>b.disabled=true);
  document.querySelectorAll('.opt-btn')[q.ans].classList.add('show-correct');
  document.getElementById('explanation').innerHTML=`<div class="explanation timeout">⏱ Tiempo agotado. ${q.exp}</div>`;
  document.getElementById('q-card').classList.add('flash-wrong');
  setTimeout(()=>document.getElementById('q-card').classList.remove('flash-wrong'),400);
  const dead=gameMode==='duel'?(duel.turn===1?duel.p1.lives:duel.p2.lives)<=0:lives<=0;
  if(dead){setTimeout(showResult,400);return;}
  document.getElementById('next-btn').style.display='block';
}

// ── RENDER QUESTION ───────────────────────────────────────────────────────
function renderQuestion(){
  answered=false;
  const q=gameQ[current];
  shuffleOptions(q);
  const catChanged=filterMode!=='tematicas'&&q.cat!==lastCat&&lastCat!=='';

  const doRender=()=>{
    setHeaderStyle(q.cat);lastCat=q.cat;
    updateHUD();
    document.getElementById('q-cat').textContent=q.cat;
    const de=document.getElementById('q-diff');
    de.textContent=q.diff==='facil'?'Fácil':q.diff==='medio'?'Medio':'Difícil';
    de.className='q-diff-tag '+q.diff;
    const mult=getMultiplier();
    document.getElementById('q-pts').textContent=`+${q.pts*mult} pts${mult>1?' (x'+mult+')':''}`;
    document.getElementById('explanation').innerHTML='';
    document.getElementById('next-btn').style.display='none';
    const h50=document.getElementById('hint-5050');
    const hdt=document.getElementById('hint-dato');
    const hsk=document.getElementById('hint-skip');
    h50.disabled=!hint5050||gameMode==='duel';h50.textContent=hint5050?'50:50':'—';
    hdt.disabled=!hintDato||gameMode==='duel';hdt.textContent=hintDato?'💬 Dato':'—';
    hsk.disabled=!hintSkip||gameMode==='duel';hsk.textContent=hintSkip?'⏭ Saltar':'—';
    // Force question text update with a small delay to ensure DOM is ready
    setTimeout(()=>{
      const qtEl=document.getElementById('q-text');
      if(qtEl)qtEl.textContent=q.q;
    },10);
    document.getElementById('options').innerHTML=q.opts.map((o,i)=>
      `<button class="opt-btn" onclick="pick(${i})"><span class="opt-letter">${'ABCD'[i]}</span><span>${o}</span></button>`
    ).join('');
    if(gameMode==='blitz'){if(current===0)startBlitz();}
    else startTimer();
  };

  if(catChanged){showCatTransition(q.cat,doRender);}
  else{doRender();}
}

// ── HINTS ─────────────────────────────────────────────────────────────────
function useHint(type){
  if(answered)return;
  if(type==='5050'&&hint5050){
    hint5050=false;
    const q=gameQ[current];
    const wrongs=shuffle(q.opts.map((_,i)=>i).filter(i=>i!==q.ans));
    const btns=document.querySelectorAll('.opt-btn');
    wrongs.slice(0,2).forEach(i=>btns[i].classList.add('eliminated'));
    document.getElementById('hint-5050').disabled=true;
    document.getElementById('hint-5050').textContent='—';
  }
  if(type==='dato'&&hintDato){
    hintDato=false;
    const q=gameQ[current];
    const pista=q.hint||'No hay pista disponible para esta pregunta.';
    document.getElementById('explanation').innerHTML=`<div class="explanation timeout" style="border-color:var(--blue);background:var(--blue-bg);color:#a5c8ff;">💬 Pista: ${pista}</div>`;
    document.getElementById('hint-dato').disabled=true;
    document.getElementById('hint-dato').textContent='—';
  }
  if(type==='skip'&&hintSkip){
    hintSkip=false;skipped++;
    clearInterval(timerInt);
    // Add a fresh question at the end so the player still answers 10 in total
    if(gameMode!=='survival'){
      const pool=buildPool();
      const usedQs=new Set(gameQ.map(x=>x.q));
      let extra=pool.filter(q=>!usedQs.has(q.q)&&!seenQ.has(q.q));
      if(!extra.length)extra=pool.filter(q=>!usedQs.has(q.q));
      if(extra.length){
        const nq=shuffle(extra)[0];
        gameQ.push(nq);seenQ.add(nq.q);
      }
    }
    document.getElementById('hint-skip').disabled=true;
    document.getElementById('hint-skip').textContent='—';
    document.getElementById('explanation').innerHTML=`<div class="explanation timeout">⏭ Pregunta saltada. Se añade otra al final.</div>`;
    document.getElementById('next-btn').style.display='block';
    answered=true;
  }
}

// ── PICK ANSWER ───────────────────────────────────────────────────────────
function pick(i){
  if(answered)return;answered=true;
  clearInterval(timerInt);
  const q=gameQ[current];
  const btns=document.querySelectorAll('.opt-btn');
  btns.forEach(b=>b.disabled=true);
  const ok=i===q.ans;
  const mult=getMultiplier();

  if(gameMode==='duel'){
    const p=duel.turn===1?duel.p1:duel.p2;
    if(ok){p.score+=q.pts;playCorrect();flashHeader('rgba(63,185,80,0.4)');}
    else{p.lives--;playWrong();flashHeader('rgba(248,81,73,0.4)');}
  } else {
    if(ok){
      const bonus=Math.max(0,Math.floor(timeLeft/20*q.pts*0.3));
      const pts=(q.pts+bonus)*mult;
      score+=pts;correct++;streak++;
      if(streak>maxStreak)maxStreak=streak;
      playCorrect();flashHeader('rgba(63,185,80,0.4)');
      document.getElementById('explanation').innerHTML=`<div class="explanation ok">✓ Correcto · +${pts} pts${mult>1?' (x'+mult+')':''}. ${q.exp}</div>`;
      if(streak===3||streak===6||streak===9)showStreakBanner(streak);
    } else {
      lives--;wrong++;streak=0;
      playWrong();flashHeader('rgba(248,81,73,0.4)');
      document.getElementById('explanation').innerHTML=`<div class="explanation fail">✗ Incorrecto. ${q.exp}</div>`;
    }
  }

  btns[i].classList.add(ok?'correct':'wrong');
  if(!ok)btns[q.ans].classList.add('show-correct');
  if(ok&&gameMode==='duel')document.getElementById('explanation').innerHTML=`<div class="explanation ok">✓ Correcto. ${q.exp}</div>`;
  if(!ok&&gameMode==='duel')document.getElementById('explanation').innerHTML=`<div class="explanation fail">✗ Incorrecto. ${q.exp}</div>`;
  document.getElementById('q-card').classList.add(ok?'flash-correct':'flash-wrong');
  setTimeout(()=>document.getElementById('q-card').classList.remove('flash-correct','flash-wrong'),400);
  updateHUD();

  const dead=gameMode==='duel'?(duel.turn===1?duel.p1.lives:duel.p2.lives)<=0:lives<=0;
  if(dead){setTimeout(showResult,400);return;}
  document.getElementById('next-btn').style.display='block';
}

document.getElementById('next-btn').addEventListener('click',()=>{
  if(gameMode==='duel')duel.turn=duel.turn===1?2:1;
  current++;
  if(gameMode!=='survival'&&current>=gameQ.length){showResult();return;}
  if(gameMode==='survival'&&current>=gameQ.length){
    // Load more questions for survival
    let pool=buildPool();
    let fresh=pool.filter(q=>!seenQ.has(q.q));
    if(fresh.length<5){seenQ.clear();fresh=pool;}
    const more=shuffle(fresh).slice(0,10);
    more.forEach(q=>seenQ.add(q.q));
    gameQ=[...gameQ,...more];
  }
  renderQuestion();
});

// ── RESULT ────────────────────────────────────────────────────────────────
function showResult(){
  clearInterval(timerInt);clearInterval(blitzInt);
  playFinish();
  const total=gameQ.length;

  if(gameMode==='duel'){
    const w=duel.p1.score>duel.p2.score?duel.p1:duel.p2.score>duel.p1.score?duel.p2:null;
    document.getElementById('result-hero').innerHTML=`
      <div style="font-size:36px;margin-bottom:0.5rem">⚔️</div>
      <div class="result-rank">Duelo finalizado</div>
      <div class="duel-winner">${w?'🏆 '+esc(w.name)+' gana':'¡Empate!'}</div>
      <div class="duel-scores">
        <div class="duel-score-card${duel.p1.score>=duel.p2.score?' winner':''}">
          <div class="dsc-crown">${duel.p1.score>duel.p2.score?'👑':''}</div>
          <div class="dsc-name">${esc(duel.p1.name)}</div><div class="dsc-pts">${duel.p1.score}</div>
        </div>
        <div class="duel-score-card${duel.p2.score>=duel.p1.score?' winner':''}">
          <div class="dsc-crown">${duel.p2.score>duel.p1.score?'👑':''}</div>
          <div class="dsc-name">${esc(duel.p2.name)}</div><div class="dsc-pts">${duel.p2.score}</div>
        </div>
      </div>
      <div class="result-actions">
        <button class="btn-whatsapp" onclick="compartirWhatsApp(textoDuelo())">💬 WhatsApp</button>
        <button class="btn-secondary" onclick="copyResult()">📋 Copiar</button>
        <button class="btn-primary" onclick="goMenu()">Jugar de nuevo</button>
      </div>`;
    showScreen('screen-result');return;
  }

  const pct=Math.round((correct/Math.max(correct+wrong,1))*100);
  let rank,msg;
  if(pct>=90){rank="Gran Estratega";msg="Dominas cinco milenios de conflictos. Sun Tzu te daría la razón.";}
  else if(pct>=75){rank="Analista Geopolítico";msg="Sólido conocimiento. Pocos te superan en la sala de situación.";}
  else if(pct>=55){rank="Oficial de Inteligencia";msg="Base firme, pero hay brechas en tu mapa. Repasa los flancos.";}
  else if(pct>=35){rank="Soldado Raso";msg="Conoces el terreno general, pero los detalles te traicionan.";}
  else{rank="Recluta sin instrucción";msg="El campo de batalla de la historia aún te resulta desconocido.";}

  // Ask name for ranking
  const playerName=prompt('¿Tu nombre para el ranking? (deja vacío para no guardar)','');
  if(playerName&&playerName.trim())saveRanking(playerName.trim(),score,pct);
  saveRecord({score,correct,total:correct+wrong,mode:modeLabel(partida.modo),diff:diffLabel(partida.dif),cats:partida.cats,date:new Date().toLocaleDateString('es-ES')});

  document.getElementById('result-hero').innerHTML=`
    <div><span class="result-score-num">${score.toLocaleString()}</span></div>
    <div style="font-size:13px;color:var(--muted);margin-top:4px">${correct} correctas · ${wrong} errores · ${pct}% aciertos</div>
    <div class="result-rank">${rank}</div>
    <div class="result-msg">${msg}</div>
    <div class="result-stats">
      <div class="rstat"><div class="rv green">${correct}</div><div class="rl">Correctas</div></div>
      <div class="rstat"><div class="rv red">${wrong}</div><div class="rl">Errores</div></div>
      <div class="rstat"><div class="rv gold">${score.toLocaleString()}</div><div class="rl">Puntos</div></div>
      <div class="rstat"><div class="rv" style="color:var(--text)">${maxStreak}</div><div class="rl">Racha máx.</div></div>
      ${gameMode==='survival'?`<div class="rstat"><div class="rv" style="color:var(--blue)">${correct+wrong}</div><div class="rl">Respondidas</div></div>`:''}
    </div>
    <div class="result-actions">
      <button class="btn-secondary" onclick="copyResult()">📋 Copiar</button>
      <button class="btn-whatsapp" onclick="retarPorWhatsApp()">💬 WhatsApp</button>
      <button class="btn-challenge" onclick="copyChallenge()">🎯 Copiar reto</button>
      <button class="btn-secondary" onclick="showTab('ranking')">🏆 Ranking</button>
      <button class="btn-primary" onclick="goMenu()">Jugar de nuevo</button>
    </div>`;
  showScreen('screen-result');
}

function goMenu(){
  showScreen('screen-menu');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('.nav-btn[onclick="showTab(\'menu\')"]').classList.add('active');
  setHeaderStyle('Antigüedad');
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>{
    s.classList.remove('active');
    s.style.display='none';
  });
  const el=document.getElementById(id);
  el.style.display='block';
  el.classList.add('active');
}

function copyResult(){
  const pct=Math.round((correct/Math.max(correct+wrong,1))*100);
  const dif=partida.modo==='crono'?'':`\nDificultad: ${diffLabel(partida.dif)}`;
  const cats=partida.cats;
  const eje=partida.eje==='t'?'Temáticas':'Categorías';
  const text=`🗺️ GeoQuiz — Guerras & Conflictos\nModo: ${modeLabel(partida.modo)}${dif}\n${eje}: ${cats}\n✅ ${correct} correctas (${pct}%)\n⭐ ${score.toLocaleString()} puntos · 🔥 Racha: ${maxStreak}\n\n¿Puedes superarme?`;
  navigator.clipboard.writeText(text).then(()=>toast('¡Resultado copiado!'));
}

// El texto del reto lo comparten dos botones: el de copiar y el de WhatsApp.
function textoReto(){
  const pct=Math.round((correct/Math.max(correct+wrong,1))*100);
  // El enlace del reto se construye desde la URL actual, así funciona en cualquier dominio
  const gameURL=generateChallengeURL();
  return `🗺️ ¡Te reto en GeoQuiz!\n\nHe conseguido:\n⭐ ${score.toLocaleString()} puntos\n✅ ${correct} correctas (${pct}%)${partida.modo==='crono'?'':`\n🎯 Dificultad: ${diffLabel(partida.dif)}`}\n🔥 Racha máxima: ${maxStreak}\n\n¿Puedes superarme? Juega aquí:\n${gameURL}`;
}

function copyChallenge(){
  navigator.clipboard.writeText(textoReto()).then(()=>toast('¡Reto copiado! Pégalo a tus amigos')).catch(()=>{
    // Fallback if clipboard fails
    toast('Copia manualmente el enlace del juego');
  });
}

function retarPorWhatsApp(){compartirWhatsApp(textoReto());}

// El duelo no tiene una puntuación propia que retar: se comparte el marcador.
function textoDuelo(){
  const url=window.location.href.split('?')[0];
  const gana=duel.p1.score>duel.p2.score?duel.p1:duel.p2.score>duel.p1.score?duel.p2:null;
  return `⚔️ GeoQuiz — Duelo\n\n${duel.p1.name}: ${duel.p1.score} puntos\n${duel.p2.name}: ${duel.p2.score} puntos\n${gana?'🏆 Gana '+gana.name:'🤝 ¡Empate!'}\n\n¿Os atrevéis? Juega aquí:\n${url}`;
}
