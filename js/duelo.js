// GeoQuiz — duelo online: 2 jugadores, cada uno en su dispositivo, por rondas.
//
// Quien crea el duelo elige categorías y dificultad para los dos; el otro se une con
// un código de 6 caracteres (o el enlace que lo lleva dentro). Se juega por RONDAS:
// en cada ronda responde primero J1 y después J2. No sale la pregunta sola en cuanto
// te toca -eso ambusca-: aparece un botón para empezar tú cuando estés listo.
//
// Si alguien se queda a 0 vidas a mitad de ronda, el otro contesta igual la suya:
// no se corta la ronda a quien le tocaba después. Eso puede dejar a los dos a 0 en
// la misma ronda, así que desempata quien tenga más aciertos (y si también empatan,
// es un empate de verdad). 5 vidas por persona, sin puntuación: solo cuentan los
// aciertos.
//
// El servidor corrige cada respuesta, igual que el torneo: aquí nunca se sabe cuál es
// la opción correcta hasta que él lo dice. Mientras no te toca, se sondea el estado
// cada 2 segundos para saber en cuanto el rival conteste o te toque jugar.

const GQ_DUELO_API = GQ_API.replace('ranking.php', 'duelo.php');

let duelo = null;              // la última fila pública del duelo, tal como la da el servidor
let duelCodigo = '';
let duelNombre = '';
let duelMiLado = null;         // 1 o 2
let duelSondeoInt = null;
let duelPreguntaActual = null; // true mientras hay una pregunta nuestra en pantalla sin contestar
let duelEsperandoClic = false; // true mientras se enseña el botón "Empezar ronda" sin pulsar

function pararSondeoDuelo() {
  clearInterval(duelSondeoInt);
  duelSondeoInt = null;
}

// ── CREAR ─────────────────────────────────────────────────────────────────
async function crearDuelo() {
  if (filterMode === 'tematicas') {
    toast('El duelo se juega por épocas, no por temáticas. Cambia el filtro arriba.');
    return;
  }
  const cats = [...selectedCats];
  if (!cats.length) { toast('Elige al menos una categoría.'); return; }

  const nombre = (prompt('¿Con qué nombre juegas el duelo?', '') || '').trim();
  if (!nombre) return;

  const res = await gqFetch(GQ_DUELO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'crear', nombre, cats, dif: selectedDiff }),
  });
  if (!res.ok || !res.cuerpo || !res.cuerpo.codigo) {
    toast((res.cuerpo && res.cuerpo.mensaje) || 'No se pudo crear el duelo. Revisa la conexión.');
    return;
  }

  duelCodigo = res.cuerpo.codigo;
  duelNombre = nombre;
  duelMiLado = 1;
  mostrarEsperaDuelo();
}

function duelEnlace() {
  const base = window.location.href.split('?')[0];
  return `${base}?duelo=${duelCodigo}`;
}

function textoInvitacionDuelo() {
  return `¡Te reto a un duelo en GeoQuiz!\n\nEntra con este enlace y empezamos en cuanto aceptes:\n${duelEnlace()}\n\n(Código por si lo pide: ${duelCodigo})`;
}

function mostrarEsperaDuelo() {
  showScreen('screen-duelo');
  document.getElementById('screen-duelo').innerHTML = `
    <div class="no-records">
      <p class="section-label">⚔️ Duelo creado</p>
      <div style="font-size:30px;font-weight:700;letter-spacing:4px;margin:1rem 0;color:var(--accent)">${esc(duelCodigo)}</div>
      <p style="color:var(--muted);font-size:13px;margin-bottom:1rem">En cuanto se una tu rival, empieza la partida sola.</p>
      <button class="invitar-btn" onclick="compartirWhatsApp(textoInvitacionDuelo())">💬 Invitar por WhatsApp</button>
      <button class="btn-secondary" style="margin-top:0.6rem" onclick="pararSondeoDuelo();goMenu()">Cancelar</button>
    </div>`;
  pararSondeoDuelo();
  duelSondeoInt = setInterval(sondearEsperaDuelo, 2500);
  sondearEsperaDuelo();
}

async function sondearEsperaDuelo() {
  const res = await gqFetch(
    `${GQ_DUELO_API}?codigo=${encodeURIComponent(duelCodigo)}&nombre=${encodeURIComponent(duelNombre)}`,
    { method: 'GET' }
  );
  if (!res.ok || !res.cuerpo || !res.cuerpo.duelo) return;   // fallo puntual; se reintenta
  duelo = res.cuerpo.duelo;
  if (duelo.estado === 'jugando') { arrancarDuelo(); }
}

// ── UNIRSE ────────────────────────────────────────────────────────────────
async function pedirCodigoUnirse(prefill) {
  const codigo = ((prefill || prompt('Código del duelo (6 caracteres):', '') || '').trim()).toUpperCase();
  if (!codigo) return;
  const nombre = (prompt('¿Con qué nombre juegas el duelo?', '') || '').trim();
  if (!nombre) return;

  const res = await gqFetch(GQ_DUELO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'unirse', codigo, nombre }),
  });
  if (!res.ok || !res.cuerpo || !res.cuerpo.duelo) {
    toast((res.cuerpo && res.cuerpo.mensaje) || 'No se pudo entrar en ese duelo.');
    return;
  }

  duelCodigo = codigo;
  duelNombre = nombre;
  duelo = res.cuerpo.duelo;
  duelMiLado = duelo.mi_lado || 2;
  arrancarDuelo();
}

function checkDuelInvite() {
  try {
    const p = new URLSearchParams(window.location.search);
    const codigo = p.get('duelo');
    if (codigo) {
      showTab('menu');
      pedirCodigoUnirse(codigo.toUpperCase());
    }
  } catch (e) {}
}

// ── JUGAR ─────────────────────────────────────────────────────────────────
function arrancarDuelo() {
  pararSondeoDuelo();
  playStart();
  pararCronometros();
  gameMode = 'duel';
  partida = { modo: 'duel', dif: duelo.dif, eje: 'n', nsel: 0, ntot: 0, cats: (duelo.cats || []).join(', '), torneo: '' };
  gameQ = []; current = 0; score = 0; correct = 0; wrong = 0; maxStreak = 0; streak = 0; skipped = 0;
  hint5050 = false; hintSkip = false; hintDato = false; answered = false; timeLeft = 20; lastCat = '';
  lives = 9999;   // las vidas de verdad viven en duelo.j1_vidas/j2_vidas, no aquí

  showScreen('screen-game');
  setupHUD();
  pintarDuelHUD();
  duelPreguntaActual = null;
  duelEsperandoClic = false;
  duelSondeoInt = setInterval(sondearDueloJuego, 2000);
  sondearDueloJuego();
}

function pintarDuelHUD() {
  if (!duelo) return;
  document.getElementById('dp1-name').textContent = duelo.j1_nombre;
  document.getElementById('dp2-name').textContent = duelo.j2_nombre || 'J2';
  document.getElementById('dp1-score').textContent = duelo.j1_aciertos + ' aciertos';
  document.getElementById('dp2-score').textContent = duelo.j2_aciertos + ' aciertos';
  document.getElementById('dp1-lives').innerHTML = rl(duelo.j1_vidas, 5);
  document.getElementById('dp2-lives').innerHTML = rl(duelo.j2_vidas, 5);
  document.getElementById('dp1').classList.toggle('active', duelo.turno === 1);
  document.getElementById('dp2').classList.toggle('active', duelo.turno === 2);
  document.getElementById('duel-turn').textContent = `Turno de ${duelo.turno === 1 ? duelo.j1_nombre : (duelo.j2_nombre || 'J2')}`;
}

// Sondea el estado mientras el duelo está en juego: decide si toca ofrecer el botón
// de empezar ronda, esperar al rival, o si ya ha terminado (incluido por abandono,
// que lo marca el propio servidor cuando alguien lleva 5 minutos sin mover).
async function sondearDueloJuego() {
  const res = await gqFetch(
    `${GQ_DUELO_API}?codigo=${encodeURIComponent(duelCodigo)}&nombre=${encodeURIComponent(duelNombre)}`,
    { method: 'GET' }
  );
  if (!res.ok || !res.cuerpo || !res.cuerpo.duelo) return;   // fallo puntual; se reintenta en el siguiente sondeo
  duelo = res.cuerpo.duelo;
  duelMiLado = duelo.mi_lado || duelMiLado;
  pintarDuelHUD();

  if (duelo.estado === 'terminado') { pararSondeoDuelo(); mostrarResultadoDuelo(); return; }

  const miTurno = duelo.turno === duelMiLado;
  if (miTurno && !duelPreguntaActual && !duelEsperandoClic) { renderEmpezarRonda(); }
  else if (!miTurno) { duelEsperandoClic = false; renderEsperaTurno(); }
}

// En vez de servir la pregunta en cuanto te toca -que ambusca-, se enseña un botón y
// se espera a que el jugador pulse cuando esté listo.
function renderEmpezarRonda() {
  duelEsperandoClic = true;
  document.getElementById('next-btn').style.display = 'none';
  document.getElementById('timer-wrap').style.display = 'none';
  document.getElementById('hint-btns').style.display = 'none';
  document.getElementById('q-cat').textContent = '⚔️ Tu turno';
  document.getElementById('q-diff').style.display = 'none';
  document.getElementById('q-pts').style.display = 'none';
  document.getElementById('q-text').textContent = '';
  document.getElementById('options').innerHTML = '';
  document.getElementById('explanation').innerHTML = `
    <div class="explanation ok" style="text-align:center">
      <p style="margin-bottom:0.8rem">Te toca responder. En cuanto pulses empieza el cronómetro de 20s.</p>
      <button class="btn-primary" onclick="pedirPreguntaDuelo()">▶ Empezar ronda</button>
    </div>`;
}

async function pedirPreguntaDuelo() {
  const res = await gqFetch(GQ_DUELO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'pregunta', codigo: duelCodigo, nombre: duelNombre }),
  });
  if (!res.ok || !res.cuerpo || !res.cuerpo.q) {
    // 409 no_es_tu_turno: el turno cambió entre el sondeo y esta petición; el próximo
    // sondeo ya lo verá. Cualquier otro fallo es puntual y se reintenta solo.
    duelEsperandoClic = false;
    return;
  }
  const c = res.cuerpo;
  duelPreguntaActual = true;
  duelEsperandoClic = false;
  current = c.orden - 1;
  gameQ[current] = { cat: c.cat, diff: c.diff, pts: c.pts, q: c.q, opts: c.opts, exp: '' };
  timeLeft = Math.max(1, c.quedan);
  document.getElementById('timer-wrap').style.display = 'flex';
  renderQuestion();
}

function renderEsperaTurno() {
  document.getElementById('next-btn').style.display = 'none';
  document.getElementById('timer-wrap').style.display = 'none';
  document.getElementById('hint-btns').style.display = 'none';
  document.getElementById('q-cat').textContent = '⏳ Esperando';
  document.getElementById('q-diff').style.display = 'none';
  document.getElementById('q-pts').style.display = 'none';
  document.getElementById('q-text').textContent = '';
  document.getElementById('options').innerHTML = '';
  const rival = duelMiLado === 1 ? (duelo.j2_nombre || 'tu rival') : duelo.j1_nombre;
  document.getElementById('explanation').innerHTML =
    `<div class="explanation timeout">⏳ Turno de ${esc(rival)}. Esperando su respuesta…</div>`;
}

// Manda lo que se ha pulsado y pinta lo que conteste el servidor. -1 es tiempo agotado.
async function pickDuelo(i) {
  answered = true;
  clearInterval(timerInt);
  const btns = document.querySelectorAll('.opt-btn');
  btns.forEach(b => b.disabled = true);

  const res = await gqFetch(GQ_DUELO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'responder', codigo: duelCodigo, nombre: duelNombre, elegida: i }),
  });
  if (!res.ok || !res.cuerpo) {
    document.getElementById('explanation').innerHTML =
      '<div class="explanation fail">No se pudo enviar la respuesta. Se reintentará sola con el siguiente sondeo.</div>';
    document.getElementById('next-btn').style.display = 'block';
    return;
  }

  const c = res.cuerpo;
  duelo = c.duelo;
  duelPreguntaActual = false;
  pintarDuelHUD();

  if (i >= 0 && btns[i]) btns[i].classList.add(c.acerto ? 'correct' : 'wrong');
  if (!c.acerto && btns[c.correcta]) btns[c.correcta].classList.add('show-correct');

  const caja = document.getElementById('explanation');
  if (c.acerto) {
    playCorrect(); flashHeader('rgba(63,185,80,0.4)');
    caja.innerHTML = `<div class="explanation ok">✓ Correcto. ${esc(c.exp)}</div>`;
  } else if (i < 0) {
    playTimeout();
    caja.innerHTML = `<div class="explanation timeout">⏱ Tiempo agotado. ${esc(c.exp)}</div>`;
  } else {
    playWrong(); flashHeader('rgba(248,81,73,0.4)');
    caja.innerHTML = `<div class="explanation fail">✗ Incorrecto. ${esc(c.exp)}</div>`;
  }
  document.getElementById('q-card').classList.add(c.acerto ? 'flash-correct' : 'flash-wrong');
  setTimeout(() => document.getElementById('q-card').classList.remove('flash-correct', 'flash-wrong'), 400);

  if (c.terminado) { setTimeout(mostrarResultadoDuelo, 500); return; }
  document.getElementById('next-btn').style.display = 'block';
}

// ── RESULTADO ─────────────────────────────────────────────────────────────
function mostrarResultadoDuelo() {
  clearInterval(timerInt);
  playFinish();
  const soyJ1 = duelMiLado === 1;
  const misAciertos = soyJ1 ? duelo.j1_aciertos : duelo.j2_aciertos;
  const rivalAciertos = soyJ1 ? duelo.j2_aciertos : duelo.j1_aciertos;
  const miNombre = soyJ1 ? duelo.j1_nombre : (duelo.j2_nombre || 'Tú');
  const rivalNombre = soyJ1 ? (duelo.j2_nombre || 'Rival') : duelo.j1_nombre;
  const empate = duelo.ganador === 0;
  const gano = !empate && duelo.ganador === duelMiLado;

  const titulo = empate ? '🤝 ¡Empate!' : (gano ? '🏆 ¡Ganas tú!' : '😔 Gana ' + esc(rivalNombre));

  document.getElementById('result-hero').innerHTML = `
    <div style="font-size:36px;margin-bottom:0.5rem">⚔️</div>
    <div class="result-rank">Duelo terminado</div>
    <div class="duel-winner">${titulo}</div>
    <div class="duel-scores">
      <div class="duel-score-card${!empate && misAciertos>=rivalAciertos ? ' winner' : ''}">
        <div class="dsc-crown">${gano ? '👑' : ''}</div>
        <div class="dsc-name">${esc(miNombre)}</div><div class="dsc-pts">${misAciertos} aciertos</div>
      </div>
      <div class="duel-score-card${!empate && rivalAciertos>=misAciertos ? ' winner' : ''}">
        <div class="dsc-crown">${!empate && !gano ? '👑' : ''}</div>
        <div class="dsc-name">${esc(rivalNombre)}</div><div class="dsc-pts">${rivalAciertos} aciertos</div>
      </div>
    </div>
    <div class="result-actions">
      <button class="btn-whatsapp" onclick="compartirWhatsApp(textoResultadoDuelo())">💬 WhatsApp</button>
      <button class="btn-secondary" onclick="showTab('duelos')">⚔️ Clasificación</button>
      <button class="btn-primary" onclick="goMenu()">Volver</button>
    </div>`;
  showScreen('screen-result');
}

function textoResultadoDuelo() {
  const url = window.location.href.split('?')[0];
  const soyJ1 = duelMiLado === 1;
  const misAciertos = soyJ1 ? duelo.j1_aciertos : duelo.j2_aciertos;
  const rivalAciertos = soyJ1 ? duelo.j2_aciertos : duelo.j1_aciertos;
  const miNombre = soyJ1 ? duelo.j1_nombre : (duelo.j2_nombre || 'Tú');
  const rivalNombre = soyJ1 ? (duelo.j2_nombre || 'Rival') : duelo.j1_nombre;
  const empate = duelo.ganador === 0;
  const gano = !empate && duelo.ganador === duelMiLado;
  const resultado = empate ? 'Empate' : (gano ? '🏆 ¡He ganado!' : 'Ha ganado ' + rivalNombre);
  return `GeoQuiz — Duelo\n\n${miNombre}: ${misAciertos} aciertos\n${rivalNombre}: ${rivalAciertos} aciertos\n${resultado}\n\n¿Te atreves con el siguiente?\n${url}`;
}

// ── CLASIFICACIÓN DE DUELOS ───────────────────────────────────────────────
async function renderDuelos() {
  const div = document.getElementById('screen-duelos');
  div.innerHTML = '<div class="no-records">Cargando…</div>';
  const res = await gqFetch(`${GQ_DUELO_API}?ranking=1`, { method: 'GET' });
  const tabla = (res.ok && res.cuerpo && res.cuerpo.clasificacion) || [];
  const cab = '<p class="section-label">⚔️ Clasificación de duelos</p>';
  if (!tabla.length) {
    div.innerHTML = cab + '<div class="no-records">Todavía no ha terminado ningún duelo.<br>¡Sé el primero!</div>';
    return;
  }
  div.innerHTML = cab + `<div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Jugador</th><th>Ganados</th><th>Jugados</th><th>Aciertos</th></tr></thead><tbody>${tabla.map(e => `<tr><td>${MEDALLAS[e.pos - 1] || e.pos}</td><td style="font-weight:600">${esc(e.nombre)}</td><td style="color:var(--accent);font-weight:600">${esc(e.ganados)}</td><td>${esc(e.jugados)}</td><td>${esc(e.aciertos)}</td></tr>`).join('')}</tbody></table></div>`;
}
