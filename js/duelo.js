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
let duelAbierto = false;       // true si el duelo que espero rival está en la lista de retos abiertos
let duelSala = null;           // {codigo, nombre, token} si el duelo en juego es un partido de un torneo (js/sala.js)

function pararSondeoDuelo() {
  clearInterval(duelSondeoInt);
  duelSondeoInt = null;
}

// ── CREAR ─────────────────────────────────────────────────────────────────
// abierto=true: el reto sale en la lista de «Retos abiertos» para que cualquiera se una.
// Sin eso, es el duelo de siempre: solo entra quien tenga el enlace o el código.
async function crearDuelo(abierto) {
  abierto = abierto === true;   // desde un onclick="crearDuelo()" no llega nada; desde un evento, un objeto
  if (filterMode === 'tematicas') {
    toast('El duelo se juega por épocas, no por temáticas. Cambia el filtro arriba.');
    return;
  }
  const cats = [...selectedCats];
  if (!cats.length) { toast('Elige al menos una categoría.'); return; }

  const nombre = (gqNombre('¿Con qué nombre juegas el duelo?') || '').trim();
  if (!nombre) return;

  const res = await gqFetch(GQ_DUELO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'crear', nombre, cats, dif: selectedDiff, abierto }),
  });
  if (!res.ok || !res.cuerpo || !res.cuerpo.codigo) {
    toast((res.cuerpo && res.cuerpo.mensaje) || 'No se pudo crear el duelo. Revisa la conexión.');
    return;
  }

  duelCodigo = res.cuerpo.codigo;
  duelNombre = nombre;
  duelMiLado = 1;
  duelSala = null;
  duelAbierto = res.cuerpo.abierto === true;
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
  const titulo = duelAbierto ? '🌐 Reto abierto' : '⚔️ Duelo creado';
  const aviso = duelAbierto
    ? 'Ya sale en la lista de retos abiertos: cualquiera puede unirse. Mantén esta pantalla abierta (si la cierras, el reto desaparece de la lista) y, en cuanto entre alguien, empieza la partida sola. Si nadie entra en 15 minutos, se cierra.'
    : 'En cuanto se una tu rival, empieza la partida sola.';
  document.getElementById('screen-duelo').innerHTML = `
    <div class="no-records">
      <p class="section-label">${titulo}</p>
      <div style="font-size:30px;font-weight:700;letter-spacing:4px;margin:1rem 0;color:var(--accent)">${esc(duelCodigo)}</div>
      <p style="color:var(--muted);font-size:13px;margin-bottom:1rem">${aviso}</p>
      <button class="invitar-btn" onclick="compartirWhatsApp(textoInvitacionDuelo())">💬 ${duelAbierto ? 'Avisar por WhatsApp' : 'Invitar por WhatsApp'}</button>
      <button class="btn-secondary" style="margin-top:0.6rem" onclick="cancelarEsperaDuelo()">${duelAbierto ? 'Retirar reto' : 'Cancelar'}</button>
    </div>`;
  pararSondeoDuelo();
  duelSondeoInt = setInterval(sondearEsperaDuelo, 2500);
  sondearEsperaDuelo();
}

// Retira el reto en el servidor (así deja de salir en la lista y nadie entra en un duelo
// que ya no existe) y vuelve al menú. Si no hay red, se vuelve igual: el reto desaparece
// solo de la lista a los pocos segundos porque ya no hay nadie sondeando por él.
async function cancelarEsperaDuelo() {
  const codigo = duelCodigo, nombre = duelNombre;
  pararSondeoDuelo();
  goMenu();
  if (!codigo) return;
  await gqFetch(GQ_DUELO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'cancelar', codigo, nombre }),
  });
}

async function sondearEsperaDuelo() {
  const res = await gqFetch(
    `${GQ_DUELO_API}?codigo=${encodeURIComponent(duelCodigo)}&nombre=${encodeURIComponent(duelNombre)}`,
    { method: 'GET' }
  );
  if (!res.ok || !res.cuerpo || !res.cuerpo.duelo) return;   // fallo puntual; se reintenta
  duelo = res.cuerpo.duelo;
  if (duelo.estado === 'jugando') { arrancarDuelo(); }
  else if (duelo.estado === 'cancelado') {
    // Caducó a los 15 min sin rival (o se retiró desde otro sitio).
    pararSondeoDuelo();
    document.getElementById('screen-duelo').innerHTML = `
      <div class="no-records">
        <p class="section-label">⌛ Reto cerrado</p>
        <p style="color:var(--muted);font-size:13px;margin:1rem 0">Nadie ha entrado en 15 minutos, así que lo he cerrado. Puedes abrir otro cuando quieras.</p>
        <button class="btn-primary" onclick="crearDuelo(${duelAbierto})">Abrir otro reto</button>
        <button class="btn-secondary" style="margin-top:0.6rem" onclick="goMenu()">Volver</button>
      </div>`;
  }
}

// En cuanto la pestaña vuelve a verse (se volvió de WhatsApp, se desbloqueó el móvil), se
// sondea sin esperar al siguiente tic: así el reto reaparece enseguida en la lista.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && duelSondeoInt && duelo && duelo.estado === 'esperando') sondearEsperaDuelo();
});

// ── UNIRSE ────────────────────────────────────────────────────────────────
async function pedirCodigoUnirse(prefill) {
  const codigo = ((prefill || prompt('Código del duelo (6 caracteres):', '') || '').trim()).toUpperCase();
  if (!codigo) return;
  const nombre = (gqNombre('¿Con qué nombre juegas el duelo?') || '').trim();
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
  duelSala = null;
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
  document.getElementById('dp1-lives').innerHTML = rl(duelo.j1_vidas, duelo.vidas_max || 5);
  document.getElementById('dp2-lives').innerHTML = rl(duelo.j2_vidas, duelo.vidas_max || 5);
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
  // El botón vive en las opciones -no es #next-btn, que ya tiene su propio manejador
  // fijo para "siguiente pregunta" y dispararía los dos a la vez-, pero con su misma
  // clase para que se vea exactamente igual que el resto de botones del juego.
  document.getElementById('options').innerHTML =
    '<button class="next-btn" style="margin-top:0" onclick="pedirPreguntaDuelo()">▶ Empezar ronda</button>';
  document.getElementById('explanation').innerHTML =
    '<div class="explanation ok">Te toca responder. En cuanto pulses empieza el cronómetro de 20s.</div>';
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

  const enTorneo = typeof duelSala !== 'undefined' && duelSala;
  const titulo = empate ? '🤝 ¡Empate!' : (gano ? (enTorneo ? '🏆 ¡Pasas de ronda!' : '🏆 ¡Ganas tú!') : (enTorneo ? '😔 Gana ' + esc(rivalNombre) + ': quedas eliminado' : '😔 Gana ' + esc(rivalNombre)));
  const botones = enTorneo
    ? `<button class="btn-primary" onclick="volverASala()">🏆 Volver al torneo</button>`
    : `<button class="btn-whatsapp" onclick="compartirWhatsApp(textoResultadoDuelo())">💬 WhatsApp</button>
      <button class="btn-secondary" onclick="showTab('duelos')">⚔️ Clasificación</button>
      <button class="btn-primary" onclick="goMenu()">Volver</button>`;

  document.getElementById('result-hero').innerHTML = `
    <div style="font-size:36px;margin-bottom:0.5rem">⚔️</div>
    <div class="result-rank">${enTorneo ? 'Partido del torneo terminado' : 'Duelo terminado'}</div>
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
      ${botones}
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

// ── RETOS ABIERTOS ────────────────────────────────────────────────────────
// Bajo «Crear duelo / Tengo un código» (solo con el modo Duelo elegido) sale la lista de
// retos que alguien ha abierto y está esperando rival. El bloque lo construye este archivo
// y no index.html, para que no dependa de cómo esté montado el menú: si no encuentra
// #duelo-actions, simplemente no hay lista.
//
// Se pide al servidor cada 5 s, y solo mientras se está mirando: pestaña visible, modo Duelo
// elegido y menú en pantalla. Tras 2 minutos sin tocar nada se para y queda un botón de
// Actualizar: una pestaña olvidada abierta no debe seguir pidiendo datos eternamente.
const ABIERTOS_CADA_MS  = 5000;
const ABIERTOS_REPOSO_MS = 120000;
let abiertosUltimaAccion = Date.now();
let abiertosEnReposo = false;
let abiertosCargando = false;

function prepararAbiertos() {
  let caja = document.getElementById('duelo-abiertos');
  if (caja) return caja;
  const acciones = document.getElementById('duelo-actions');
  if (!acciones) return null;
  caja = document.createElement('div');
  caja.id = 'duelo-abiertos';
  caja.style.cssText = 'display:none;margin-top:1.3rem';
  caja.innerHTML = `
    <div class="label-row">
      <p class="section-label">🌐 Retos abiertos ahora</p>
      <span style="display:flex;gap:6px">
        <button class="chip-btn" onclick="crearDuelo(true)">➕ Abrir reto</button>
        <button class="chip-btn" onclick="crearSala()">🏆 Abrir torneo</button>
      </span>
    </div>
    <div id="duelo-abiertos-lista"></div>`;
  acciones.insertAdjacentElement('afterend', caja);
  return caja;
}

function haceCuantoAbierto(seg) {
  if (seg < 60) return 'ahora mismo';
  const m = Math.floor(seg / 60);
  return `hace ${m} min`;
}

function etiquetaCatsDuelo(cats) {
  const todas = typeof CAT_KEYS !== 'undefined' ? CAT_KEYS.length : 0;
  if (!cats || !cats.length) return '';
  if (todas && cats.length >= todas) return 'Todas las épocas';
  if (cats.length === 1) return cats[0];
  return `${cats.length} épocas`;
}

const ETIQ_DIF_DUELO = { all: 'Todas las dificultades', facil: 'Fácil', medio: 'Medio', dificil: 'Difícil' };

// Duelos abiertos y torneos que recogen jugadores, mezclados y los más nuevos primero. Si este
// dispositivo tiene un torneo en marcha (sala.js lo guarda), arriba sale el botón para volver a él.
function pintarAbiertos(duelos, salas) {
  const cont = document.getElementById('duelo-abiertos-lista');
  if (!cont) return;
  const filas = [
    ...duelos.map(r => ({ hace: r.hace, html: `
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.j1_nombre)}</div>
        <div style="color:var(--muted);font-size:12px">${esc(etiquetaCatsDuelo(r.cats))} · ${esc(ETIQ_DIF_DUELO[r.dif] || r.dif)} · ${esc(haceCuantoAbierto(r.hace))}</div>
      </div>
      <button class="chip-btn" style="color:var(--accent);border-color:var(--accent)" onclick="pedirCodigoUnirse('${esc(r.codigo)}')">⚔️ Unirme</button>` })),
    ...salas.map(r => ({ hace: r.hace, html: `
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🏆 Torneo de ${esc(r.organizador)}</div>
        <div style="color:var(--muted);font-size:12px">${esc(r.apuntados)} de ${esc(r.plazas)} apuntados · ${esc(etiquetaCatsDuelo(r.cats))} · ${esc(haceCuantoAbierto(r.hace))}</div>
      </div>
      <button class="chip-btn" style="color:var(--accent);border-color:var(--accent)" onclick="unirseSala('${esc(r.codigo)}')">🏆 Apuntarme</button>` })),
  ].sort((a, b) => a.hace - b.hace);

  const mia = typeof salaGuardada === 'function' ? salaGuardada() : null;
  const retomar = mia
    ? `<div style="display:flex;align-items:center;gap:10px;padding:0.65rem 0.8rem;margin-bottom:0.5rem;background:rgba(212,175,55,0.10);border:1px solid var(--accent);border-radius:var(--radius)">
        <div style="flex:1;font-weight:600">🏆 Tienes un torneo en marcha</div>
        <button class="chip-btn" style="color:var(--accent);border-color:var(--accent)" onclick="reanudarSala()">Volver</button>
      </div>`
    : '';
  if (!filas.length) {
    cont.innerHTML = retomar + '<div style="color:var(--muted);font-size:13px;padding:0.4rem 0 0.2rem">Nadie ha abierto reto ni torneo ahora mismo. Abre uno y avisa a tus amigos por WhatsApp.</div>';
    return;
  }
  cont.innerHTML = retomar + filas.map(f => `
    <div style="display:flex;align-items:center;gap:10px;padding:0.65rem 0.8rem;margin-bottom:0.5rem;background:var(--surface);border:1px solid var(--border2);border-radius:var(--radius)">${f.html}
    </div>`).join('');
}

async function cargarAbiertos() {
  if (abiertosCargando) return;
  abiertosCargando = true;
  try {
    const n = typeof gqNombreGuardado === 'function' ? gqNombreGuardado() : '';
    const res = await gqFetch(`${GQ_DUELO_API}?abiertos=1&nombre=${encodeURIComponent(n)}`, { method: 'GET' });
    if (res.ok && res.cuerpo && Array.isArray(res.cuerpo.abiertos)) {
      pintarAbiertos(res.cuerpo.abiertos, Array.isArray(res.cuerpo.salas) ? res.cuerpo.salas : []);
    }
  } finally {
    abiertosCargando = false;
  }
}

function tickAbiertos() {
  const caja = prepararAbiertos();
  if (!caja) return;
  const eligido = typeof gameMode !== 'undefined' && gameMode === 'duel';
  caja.style.display = eligido ? 'block' : 'none';
  const menu = document.getElementById('screen-menu');
  if (!eligido || document.hidden || !menu || !menu.classList.contains('active')) return;
  if (Date.now() - abiertosUltimaAccion > ABIERTOS_REPOSO_MS) {
    if (!abiertosEnReposo) {
      abiertosEnReposo = true;
      const cont = document.getElementById('duelo-abiertos-lista');
      if (cont) cont.innerHTML = '<button class="chip-btn" onclick="tickAbiertos()">🔄 Actualizar la lista</button>';
    }
    return;
  }
  cargarAbiertos();
}

// Cualquier toque o tecla cuenta como «sigo aquí»; si la lista estaba en reposo, despierta.
['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => {
  abiertosUltimaAccion = Date.now();
  if (abiertosEnReposo) { abiertosEnReposo = false; tickAbiertos(); }
}, { passive: true }));

const modoFila = document.getElementById('mode-row');
if (modoFila) modoFila.addEventListener('click', () => setTimeout(tickAbiertos, 0));
setInterval(tickAbiertos, ABIERTOS_CADA_MS);
setTimeout(tickAbiertos, 0);

// ── CLASIFICACIÓN DE DUELOS ───────────────────────────────────────────────
async function renderDuelos() {
  const div = document.getElementById('screen-duelos');
  div.innerHTML = '<div class="no-records">Cargando…</div>';
  const [res, resC] = await Promise.all([
    gqFetch(`${GQ_DUELO_API}?ranking=1`, { method: 'GET' }),
    gqFetch(`${GQ_SALA_API}?campeones=1`, { method: 'GET' }),
  ]);
  const tabla = (res.ok && res.cuerpo && res.cuerpo.clasificacion) || [];
  const campeones = (resC.ok && resC.cuerpo && resC.cuerpo.campeones) || [];
  const cab = '<p class="section-label">⚔️ Clasificación de duelos</p>';
  const parteDuelos = !tabla.length
    ? cab + '<div class="no-records">Todavía no ha terminado ningún duelo.<br>¡Sé el primero!</div>'
    : cab + `<div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Jugador</th><th>Ganados</th><th>Jugados</th><th>Aciertos</th></tr></thead><tbody>${tabla.map(e => `<tr><td>${MEDALLAS[e.pos - 1] || e.pos}</td><td style="font-weight:600">${esc(e.nombre)}</td><td style="color:var(--accent);font-weight:600">${esc(e.ganados)}</td><td>${esc(e.jugados)}</td><td>${esc(e.aciertos)}</td></tr>`).join('')}</tbody></table></div>`;
  // Los partidos de un torneo no cuentan en la tabla de arriba: los campeones tienen su propia lista.
  const cabC = '<p class="section-label" style="margin-top:1.6rem">🏆 Campeones de torneos de duelos</p>';
  const parteCampeones = !campeones.length
    ? cabC + '<div style="color:var(--muted);font-size:13px">Todavía no hay campeones. Abre un torneo desde Jugar → Duelo.</div>'
    : cabC + `<div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Jugador</th><th>Títulos</th><th>Torneos</th></tr></thead><tbody>${campeones.map(e => `<tr><td>${MEDALLAS[e.pos - 1] || e.pos}</td><td style="font-weight:600">${esc(e.nombre)}</td><td style="color:var(--accent);font-weight:600">${esc(e.ganados)}</td><td>${esc(e.jugados)}</td></tr>`).join('')}</tbody></table></div>`;
  div.innerHTML = parteDuelos + parteCampeones;
}
