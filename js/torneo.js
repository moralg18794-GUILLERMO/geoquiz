// GeoQuiz — torneo de la semana.
//
// Un torneo son 15 preguntas sobre un tema, de lunes a domingo, y SOLO SE JUEGA UNA VEZ.
// El trato lo impone el servidor con una clave única por (torneo, nick); aquí se hace lo
// que se puede para que nadie gaste su único intento sin querer: se pregunta el nick ANTES
// de empezar y se comprueba contra la API. Si se preguntara al final, como en el resto del
// juego, alguien podría responder las 15 y descubrir entonces que ya había jugado.
//
// Todos reciben las mismas 15 preguntas en el mismo orden, que es lo que hace comparables
// las puntuaciones. Lo único que se baraja son las opciones dentro de cada pregunta, para
// que no se pueda cantar «la tercera» por el grupo.

const GQ_TORNEO_API = GQ_API.replace('ranking.php', 'torneo.php');

let torneo = null;              // el torneo vigente, tal como lo devuelve la API
let torneoTabla = [];           // su clasificación
let torneoNombre = '';          // el nick con el que se está jugando ahora
let torneoTotal = 0;            // cuántas preguntas tiene, según el servidor
let torneoCierreDatos = null;   // lo que devolvió al contestar la última
let torneoCuentaInt = null;
let torneoToken = '';           // el testigo que demuestra que la partida es de este móvil
let torneoEnVuelo = false;      // hay una petición abierta: no mandar otra encima
let torneoModoPrevio = '';      // el modo que estaba elegido en el menú antes del torneo
let torneoEstado = '';          // qué dice el servidor del mote de este móvil: libre/enCurso/terminado

// Devuelve el menú como estaba antes de entrar al torneo.
function torneoSoltarModo() {
  if (!torneoModoPrevio) return;
  gameMode = torneoModoPrevio;
  torneoModoPrevio = '';
  if (typeof updateStartBtn === 'function') updateStartBtn();
}

// ── MEMORIA DE ESTE DISPOSITIVO ───────────────────────────────────────────
// No es una defensa: quien borre los datos del navegador vuelve a verlo todo. Sirve para
// no dar la lata con el aviso y para recordar con qué nick se jugó. La regla de verdad la
// impone MySQL.
function torneoKey(slug) { return 'gq_torneo_' + slug; }
function torneoJugadoAqui(slug) {
  try { return localStorage.getItem(torneoKey(slug)) || ''; } catch { return ''; }
}
function torneoApuntarJugado(slug, nombre) {
  try { localStorage.setItem(torneoKey(slug), nombre); } catch {}
}
function torneoAvisoVisto(slug) {
  try { return localStorage.getItem(torneoKey(slug) + '_visto') === '1'; } catch { return false; }
}
// El testigo de la partida. Este sí es una defensa: sin él, el servidor no sirve preguntas
// ni corrige, así que escribir el mote de otro ya no vale para jugar en su nombre. Se
// guarda aquí porque el servidor solo lo entrega una vez, al reservar.
function torneoTokenGuardado(slug) {
  try { return localStorage.getItem(torneoKey(slug) + '_token') || ''; } catch { return ''; }
}
function torneoGuardarToken(slug, token) {
  try { localStorage.setItem(torneoKey(slug) + '_token', token); } catch {}
}
// El mote va aparte del slug y sin él: hace falta ANTES de saber qué torneo hay, para
// poder preguntarle al servidor si esa persona tiene una partida a medias. Y, de paso, la
// gente usa el mismo mote todas las semanas, así que el prompt sale ya relleno.
function torneoMiMote() {
  try { return localStorage.getItem('gq_torneo_mote') || ''; } catch { return ''; }
}
function torneoGuardarMote(nombre) {
  try { localStorage.setItem('gq_torneo_mote', nombre); } catch {}
}
function torneoMarcarAvisoVisto(slug) {
  try { localStorage.setItem(torneoKey(slug) + '_visto', '1'); } catch {}
}

// ── CUENTA ATRÁS ──────────────────────────────────────────────────────────
// El plazo es el motor del torneo: sin fecha de cierre no hay prisa por jugar hoy.
function torneoRestante(hasta) {
  const ms = new Date(hasta).getTime() - Date.now();
  if (ms <= 0) return null;
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24);
  if (d >= 1) return `${d} ${d === 1 ? 'día' : 'días'} y ${h % 24} h`;
  if (h >= 1) return `${h} h y ${min % 60} min`;
  return `${min} min`;
}

function torneoPintarCuenta() {
  const el = document.getElementById('ta-cuenta');
  if (!el || !torneo) return;
  if (torneo.estado !== 'activo') { el.textContent = 'Terminado'; return; }
  const r = torneoRestante(torneo.acaba_en);
  // Si el plazo se agota con la pestaña abierta, se recarga el estado en vez de dejar un
  // botón que ya no lleva a ninguna parte.
  if (r === null) { clearInterval(torneoCuentaInt); cargarTorneo(); return; }
  el.textContent = `Quedan ${r}`;
}

// Segundos a "2:40". Se enseña en la clasificación a propósito: con un solo intento y las
// mismas preguntas para todos, el tiempo es lo que delata al que ya las había visto. Un
// 14 de 15 en cuarenta segundos canta al lado de un 14 de 15 en dos minutos y medio.
function tiempoCorto(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  if (!s) return '—';
  if (s >= 3600) return Math.floor(s / 3600) + ' h';
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Cuándo cierra, escrito como lo diría una persona: "domingo, 18 de octubre, 22:00".
// Lo formatea el navegador, así que sale en la hora local de quien lo lee.
function torneoCierre() {
  if (!torneo) return '';
  const d = new Date(torneo.acaba_en);
  // Por partes y no con un solo toLocaleString: así se puede quitar la coma que mete el
  // formato largo y queda "domingo 18 de octubre a las 22:00" en vez de una enumeración.
  const dia = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${dia} a las ${hora}`;
}

// El reto para mandar por WhatsApp. Lleva el plazo y la regla del intento único, que es
// lo que convierte el enlace en un reto y no en otro enlace más.
// La regla del intento único se cuenta una sola vez. Si la descripción del torneo ya la
// dice, no se repite: el mensaje la llevaba fija de antes y, en cuanto alguien la escribe
// también en la descripción, el reto salía diciendo lo mismo dos veces seguidas.
function torneoDiceLaRegla() {
  return !!(torneo && torneo.tema && /sola partida/i.test(torneo.tema));
}

function textoRetoTorneo() {
  if (!torneo) return '';
  const url = window.location.href.split('?')[0];
  const r = torneoRestante(torneo.acaba_en);
  const regla = torneoDiceLaRegla() ? '' : '\n\n15 preguntas, las mismas para todos. Una sola partida por cabeza: no hay segunda oportunidad.';
  return `🏆 ${torneo.titulo}\n${torneo.tema}${regla}\n\nCierra el ${torneoCierre()}${r ? ` · quedan ${r}` : ''}.\n\n${url}`;
}

function retarAlTorneo() {
  compartirWhatsApp(textoRetoTorneo());
}

// ── AVISO AL ENTRAR ───────────────────────────────────────────────────────
async function cargarTorneo() {
  // Se pregunta por el mote de este dispositivo: el servidor contesta si tiene una partida
  // libre, a medias o terminada. Antes no se preguntaba nunca, así que quedarse sin batería
  // en la novena dejaba el aviso invitando a jugar de cero y el prompt vacío; si se tecleaba
  // el mote con cualquier matiz distinto, se reservaba una segunda fila y la primera quedaba
  // huérfana para siempre, con el intento gastado.
  const mote = torneoMiMote();
  const url = GQ_TORNEO_API + (mote ? '?nombre=' + encodeURIComponent(mote) : '');
  const res = await gqFetch(url, { method: 'GET' });
  if (!res.ok || !res.cuerpo || !res.cuerpo.torneo) return;   // sin torneo, el juego sigue igual
  torneo = res.cuerpo.torneo;
  torneoEstado = res.cuerpo.estado_jugador || '';
  torneoTabla = res.cuerpo.clasificacion || [];
  pintarAvisoTorneo();
  document.getElementById('nav-torneo').style.display = '';
  clearInterval(torneoCuentaInt);
  torneoPintarCuenta();
  torneoCuentaInt = setInterval(torneoPintarCuenta, 30000);
}

function pintarAvisoTorneo() {
  const caja = document.getElementById('torneo-aviso');
  if (!caja || !torneo) return;
  document.getElementById('ta-titulo').textContent = torneo.titulo;
  document.getElementById('ta-tema').textContent = torneo.tema || '';

  const yaJugo = torneoJugadoAqui(torneo.slug);
  const cerrado = torneo.estado !== 'activo';
  const btn = document.getElementById('ta-jugar');

  // Retar a alguien a un torneo que ya ha cerrado no lleva a ninguna parte.
  document.getElementById('ta-retar').style.display = cerrado ? 'none' : '';
  // La coletilla de debajo del botón sobra si la descripción ya cuenta la regla.
  document.querySelector('.ta-nota').style.display = torneoDiceLaRegla() ? 'none' : '';

  if (cerrado) {
    document.getElementById('ta-eyebrow').textContent = '🏆 Torneo terminado';
    btn.textContent = 'Ver el podio';
    btn.onclick = () => showTab('torneo');
  } else if (torneoEstado === 'enCurso') {
    // Lo dice el servidor, no este navegador: la partida quedó reservada y a medias.
    document.getElementById('ta-eyebrow').textContent = `🏆 Tienes una partida a medias como «${torneoMiMote()}»`;
    btn.textContent = 'Continuar la partida';
    btn.onclick = jugarTorneo;
  } else if (yaJugo) {
    // Ya jugó desde aquí: en vez de invitarle otra vez, se le dice cómo va.
    const mio = torneoTabla.find(f => f.nombre.toLowerCase() === yaJugo.toLowerCase());
    document.getElementById('ta-eyebrow').textContent = (mio && mio.autor)
      ? `🏆 Jugaste fuera de concurso · ${Number(mio.puntos).toLocaleString()} puntos`
      : (mio
        ? `🏆 Ya jugaste · vas ${mio.pos}º con ${Number(mio.puntos).toLocaleString()} puntos`
        : '🏆 Ya jugaste este torneo');
    btn.textContent = 'Ver la clasificación';
    btn.onclick = () => showTab('torneo');
  } else {
    document.getElementById('ta-eyebrow').textContent = '🏆 Torneo de la semana';
    btn.textContent = 'Jugar el torneo';
    btn.onclick = jugarTorneo;
  }

  // El aviso se enseña una vez por torneo; después queda el botón del menú de navegación.
  if (!torneoAvisoVisto(torneo.slug) || yaJugo) caja.classList.add('show');
}

function cerrarAvisoTorneo() {
  const caja = document.getElementById('torneo-aviso');
  if (caja) caja.classList.remove('show');
  if (torneo) torneoMarcarAvisoVisto(torneo.slug);
}

// ── EMPEZAR ───────────────────────────────────────────────────────────────
async function jugarTorneo() {
  if (!torneo || torneo.estado !== 'activo') { showTab('torneo'); return; }
  // Las preguntas ya no vienen en este objeto: las sirve el servidor de una en una cuando
  // la partida ha empezado. Aquí solo se sabe cuántas son.
  if (!torneo.n_preguntas) { toast('El torneo no tiene preguntas'); return; }

  const previo = torneoJugadoAqui(torneo.slug) || torneoMiMote();
  const aviso = torneoEstado === 'enCurso'
    ? '¿Con qué nombre juegas el torneo?\nTienes una partida a medias: escribe el mismo mote para seguirla.'
    : '¿Con qué nombre juegas el torneo?\nSe reserva ahora y solo vale un intento.';
  const nombre = (prompt(aviso, previo || '') || '').trim();
  if (!nombre) return;

  // El mote se RESERVA antes de enseñar ninguna pregunta. Si se reservara al terminar, se
  // podría entrar, leerlas las quince, salir sin enviar y volver a jugarlas ya sabidas.
  const res = await gqFetch(GQ_TORNEO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // El testigo guardado solo sirve para reanudar la propia partida; si no hay, el
    // servidor entrega uno nuevo.
    body: JSON.stringify({ accion: 'empezar', slug: torneo.slug, nombre, token: torneoTokenGuardado(torneo.slug) }),
  });

  if (res.estado === 409 && res.cuerpo) {
    torneoApuntarJugado(torneo.slug, nombre);
    const yo = res.cuerpo.yo;
    toast(yo ? `«${nombre}» ya jugó: ${yo.pos}º con ${Number(yo.puntos).toLocaleString()}` : `«${nombre}» ya jugó este torneo`);
    torneoTabla = res.cuerpo.clasificacion || torneoTabla;
    showTab('torneo');
    return;
  }
  if (res.estado === 403) {
    // Ese mote está jugando en otro sitio y este navegador no tiene su testigo. Puede ser
    // alguien intentando colarse con un nombre ajeno, o uno mismo tras borrar los datos.
    toast(`«${nombre}» tiene una partida empezada en otro dispositivo.`);
    return;
  }
  if (!res.ok) {
    // Si no se ha podido reservar, no se empieza: jugar sin reserva acabaría en un envío
    // que el servidor podría rechazar, y la partida se habría jugado para nada.
    toast('No se pudo entrar en el torneo. Revisa la conexión.');
    return;
  }

  if (res.cuerpo.token) torneoGuardarToken(torneo.slug, res.cuerpo.token);
  torneoToken = res.cuerpo.token || '';

  if (res.cuerpo.reanudado) {
    // Partida a medias que se retoma: nadie pierde el torneo por quedarse sin batería,
    // pero el reloj no se ha parado y eso se verá en la clasificación.
    toast('Retomas tu partida: el cronómetro no se ha parado.');
  }

  // El nombre que manda es el que guardó el servidor, no el tecleado: su colación ignora
  // mayúsculas y acentos, así que «guille» y «Guille» son la misma fila y conviene
  // quedarse con la grafía buena para que luego cuadre al buscarse en la tabla.
  torneoNombre = res.cuerpo.nombre || nombre;
  // Se apunta ya, no al terminar: es lo que permite avisar de una partida a medias si se
  // cierra la pestaña a mitad.
  torneoGuardarMote(torneoNombre);
  arrancarTorneo();
}

async function arrancarTorneo() {
  playStart();
  pararCronometros();
  cerrarAvisoTorneo();

  // El motor del juego se comporta como en modo solo (temporizador por pregunta,
  // multiplicador), pero lo que se guarda es una partida de torneo.
  //
  // El modo elegido en el menú se guarda para devolverlo al salir. Antes se pisaba y no se
  // restauraba: quien tenía marcado Duelo, jugaba el torneo y volvía, veía Duelo resaltado
  // y los nombres puestos, pero al pulsar Empezar arrancaba una partida en solitario que
  // los ignoraba. Y si era de 13 épocas, se guardaba como oficial en el ranking global.
  torneoModoPrevio = gameMode;
  gameMode = 'solo';
  partida = { modo: 'torneo', dif: 'na', eje: 'n', nsel: 0, ntot: 0, cats: torneo.titulo, torneo: torneo.slug };

  // Restos de una partida de torneo anterior: sin esto, una segunda entrada que acabe en
  // una rama temprana pinta los puntos y el puesto de la primera como si fueran nuevos.
  torneoCierreDatos = null; torneoTotal = 0; torneoEnVuelo = false;

  // gameQ empieza vacío y crece conforme el servidor va sirviendo preguntas. El navegador
  // nunca llega a tener las quince: la última no existe para él hasta que contesta la 14ª.
  gameQ = []; current = 0; score = 0; correct = 0; wrong = 0; maxStreak = 0; streak = 0; skipped = 0;
  hint5050 = true; hintSkip = true; hintDato = true; answered = false; timeLeft = 20; lastCat = '';
  // Sin vidas: en el torneo todos responden las 15. Con tres fallos y un único intento,
  // alguien se quedaría fuera en la séptima pregunta y su marca no sería comparable.
  lives = 9999;

  showScreen('screen-game');
  setupHUD();
  await torneoSiguientePregunta();
}

// Pide al servidor la pregunta que toca. Él decide cuál es, en qué orden van sus opciones
// y cuánto tiempo queda: si se recarga a media pregunta, vuelve la misma con el reloj donde
// estaba, no reiniciado.
async function torneoSiguientePregunta() {
  // Un doble toque en "Siguiente" mandaba dos peticiones a la vez: las dos pedían la misma
  // pregunta, MySQL rechazaba la segunda y el navegador lo leía como caída de red y te
  // sacaba de la partida. El servidor ya aguanta la carrera; esto evita provocarla.
  if (torneoEnVuelo) return;
  torneoEnVuelo = true;
  document.getElementById('next-btn').style.display = 'none';
  // Entre pregunta y pregunta hay una ida y vuelta al servidor. Sin avisar, la pantalla se
  // quedaba con la pregunta anterior y sin botón, y con mala cobertura parecía colgada.
  const espera = document.getElementById('explanation');
  const previo = espera ? espera.innerHTML : '';
  if (espera) espera.innerHTML = '<div class="explanation">⏳ Buscando la siguiente pregunta…</div>';

  let res;
  try {
    res = await gqFetch(GQ_TORNEO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'pregunta', slug: partida.torneo, nombre: torneoNombre, token: torneoToken }),
    });
  } finally {
    torneoEnVuelo = false;
  }

  if (!res.ok || !res.cuerpo || !res.cuerpo.q) {
    const err = res.cuerpo && res.cuerpo.error;
    // 'terminada' y 'ya_jugado' significan lo mismo para quien está jugando: ya ha acabado.
    // Antes solo se contemplaba la primera, así que perder la respuesta de la pregunta 15
    // acababa en "se perdió la conexión" y de vuelta al menú, con la marca guardada pero
    // sin verla por ningún lado.
    if (res.estado === 409 && (err === 'terminada' || err === 'ya_jugado')) { await torneoCerrarConTabla(); return; }
    if (espera) espera.innerHTML = previo;
    toast('Se perdió la conexión con el torneo. Vuelve a entrar con tu mismo nombre.');
    torneoSoltarModo();
    goMenu();
    return;
  }

  const c = res.cuerpo;
  current = c.orden - 1;
  gameQ[current] = { cat: c.cat, diff: c.diff, pts: c.pts, q: c.q, opts: c.opts, exp: '' };
  score = c.puntos; streak = c.racha;
  timeLeft = Math.max(1, c.quedan);
  torneoTotal = c.total;
  renderQuestion();
}

// La partida ya está cerrada en el servidor: se pide la clasificación para enseñar la
// marca de verdad. Sin esto, una respuesta perdida en la última pregunta acababa en una
// pantalla de resultado con cero puntos y «Marca guardada» sin puesto, aunque la marca
// estuviera bien guardada y a la vista de los demás.
async function torneoCerrarConTabla() {
  try {
    const res = await gqFetch(GQ_TORNEO_API + '?nombre=' + encodeURIComponent(torneoNombre), { method: 'GET' });
    if (res.ok && res.cuerpo) {
      torneoTabla = res.cuerpo.clasificacion || torneoTabla;
      const yo = res.cuerpo.yo;
      if (yo) {
        torneoCierreDatos = {
          puntos: yo.puntos, aciertos: yo.correctas, total: yo.total,
          pos: yo.pos, clasificacion: torneoTabla,
        };
        if (!torneoTotal) torneoTotal = yo.total;
      }
    }
  } catch {}
  mostrarResultadoTorneo();
}

// Manda lo que se ha pulsado y pinta lo que conteste el servidor. -1 es tiempo agotado.
async function pickTorneo(i) {
  if (torneoEnVuelo) return;
  torneoEnVuelo = true;
  answered = true;
  clearInterval(timerInt);
  const btns = document.querySelectorAll('.opt-btn');
  btns.forEach(b => b.disabled = true);

  let res;
  try {
    res = await gqFetch(GQ_TORNEO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'responder', slug: partida.torneo, nombre: torneoNombre, token: torneoToken, elegida: i }),
    });
  } finally {
    torneoEnVuelo = false;
  }

  if (!res.ok || !res.cuerpo) {
    const err = res.cuerpo && res.cuerpo.error;
    if (res.estado === 409 && (err === 'ya_jugado' || err === 'terminada')) { await torneoCerrarConTabla(); return; }
    document.getElementById('explanation').innerHTML =
      '<div class="explanation fail">No se pudo enviar la respuesta. Vuelve a entrar con tu mismo nombre: la partida sigue donde estaba.</div>';
    document.getElementById('next-btn').style.display = 'block';
    return;
  }

  const c = res.cuerpo;
  score = c.puntos; correct = c.aciertos; streak = c.racha;
  if (streak > maxStreak) maxStreak = streak;
  wrong = (c.ultima ? torneoTotal : current + 1) - correct;

  if (i >= 0 && btns[i]) btns[i].classList.add(c.acerto ? 'correct' : 'wrong');
  if (!c.acerto && btns[c.correcta]) btns[c.correcta].classList.add('show-correct');

  const caja = document.getElementById('explanation');
  if (c.acerto) {
    playCorrect(); flashHeader('rgba(63,185,80,0.4)');
    caja.innerHTML = `<div class="explanation ok">✓ Correcto · +${c.ganados} pts${c.mult > 1 ? ' (x' + c.mult + ')' : ''}. ${esc(c.exp)}</div>`;
    if (streak === 3 || streak === 6 || streak === 9) showStreakBanner(streak);
  } else if (i < 0) {
    playTimeout();
    caja.innerHTML = `<div class="explanation timeout">⏱ Tiempo agotado. ${esc(c.exp)}</div>`;
  } else {
    playWrong(); flashHeader('rgba(248,81,73,0.4)');
    caja.innerHTML = `<div class="explanation fail">✗ Incorrecto. ${esc(c.exp)}</div>`;
  }
  document.getElementById('q-card').classList.add(c.acerto ? 'flash-correct' : 'flash-wrong');
  setTimeout(() => document.getElementById('q-card').classList.remove('flash-correct', 'flash-wrong'), 400);
  updateHUD();

  if (c.ultima) {
    torneoCierreDatos = c;
    setTimeout(mostrarResultadoTorneo, 500);
    return;
  }
  document.getElementById('next-btn').style.display = 'block';
}

// ── RESULTADO ─────────────────────────────────────────────────────────────
// Ya no envía nada: el servidor cerró la partida al corregir la última pregunta y devolvió
// la clasificación en esa misma respuesta. Aquí solo se pinta lo que él dijo.
function mostrarResultadoTorneo() {
  const c = torneoCierreDatos || {};
  const total = torneoTotal || c.total || 0;
  const aciertos = c.aciertos !== undefined ? c.aciertos : correct;
  const puntos = c.puntos !== undefined ? c.puntos : score;
  const pct = Math.round((aciertos / Math.max(total, 1)) * 100);

  torneoApuntarJugado(partida.torneo, torneoNombre);
  if (c.clasificacion) torneoTabla = c.clasificacion;
  torneoSoltarModo();

  // Los que juegan fuera de concurso (quien escribe las preguntas) no tienen puesto: su
  // marca cuenta y se ve, pero no ocupa el podio de los demás.
  const mio = torneoTabla.find(f => f.nombre === torneoNombre);
  const puesto = (mio && mio.autor)
    ? 'Fuera de concurso: tu marca se ve, pero no entra en el podio.'
    : (c.pos
      ? `Vas <strong>${c.pos}º</strong> de ${torneoTabla.filter(f => !f.autor).length} en el torneo.`
      : 'Marca guardada.');

  document.getElementById('result-hero').innerHTML = `
    <div style="font-size:40px;margin-bottom:0.5rem">🏆</div>
    <div><span class="result-score-num">${puntos.toLocaleString()}</span></div>
    <div style="font-size:13px;color:var(--muted);margin-top:4px">${aciertos} de ${total} correctas · ${pct}%</div>
    <div class="result-rank">${esc(torneo ? torneo.titulo : 'Torneo')}</div>
    <div class="result-msg">${puesto}</div>
    <div class="result-actions" style="margin-top:1.5rem">
      <button class="btn-whatsapp" onclick="compartirWhatsApp(textoTorneo())">💬 WhatsApp</button>
      <button class="btn-secondary" onclick="showTab('torneo')">🏆 Clasificación</button>
      <button class="btn-primary" onclick="goMenu()">Volver</button>
    </div>`;
  showScreen('screen-result');
  playFinish();
}

function textoTorneo() {
  const total = torneoTotal;
  const pct = Math.round((correct / Math.max(total, 1)) * 100);
  const url = window.location.href.split('?')[0];
  const t = torneo ? torneo.titulo : 'Torneo GeoQuiz';
  return `🏆 ${t}\n⭐ ${score.toLocaleString()} puntos · ${correct}/${total} (${pct}%)\n\nSolo se juega una vez, así que piénsatelo bien:\n${url}`;
}

// ── CLASIFICACIÓN ─────────────────────────────────────────────────────────
async function renderTorneo() {
  const div = document.getElementById('screen-torneo');
  div.innerHTML = '<div class="no-records">Cargando el torneo…</div>';
  const res = await gqFetch(GQ_TORNEO_API, { method: 'GET' });
  if (res.ok && res.cuerpo && res.cuerpo.torneo) {
    torneo = res.cuerpo.torneo;
    torneoTabla = res.cuerpo.clasificacion || [];
  } else if (!torneo) {
    div.innerHTML = '<div class="no-records">No hay ningún torneo ahora mismo.</div>';
    return;
  }

  const activo = torneo.estado === 'activo';
  const r = activo ? torneoRestante(torneo.acaba_en) : null;
  const cab = `<p class="section-label">🏆 ${esc(torneo.titulo)}${torneo.tema ? ' — ' + esc(torneo.tema) : ''}</p>
    <p class="section-label" style="margin-top:-0.3rem">${activo && r ? 'Quedan ' + esc(r) + ' · una sola partida por persona' : 'Torneo terminado'}</p>`;

  // Mientras está abierto, lo útil es traer gente; cuando cierra, enseñar el podio.
  const pie = activo
    ? '<button class="invitar-btn" onclick="retarAlTorneo()">💬 Retar a alguien por WhatsApp</button>'
    : '<button class="clear-btn" style="border-color:var(--accent);color:var(--accent)" onclick="compartirWhatsApp(textoPodio())">🏆 Compartir el podio</button>';

  if (!torneoTabla.length) {
    div.innerHTML = cab + '<div class="no-records">Todavía no ha jugado nadie.<br>¡Sé el primero!</div>' + pie;
    return;
  }

  // Quien escribe las preguntas va fuera de concurso: su fila baja al final, sin número y
  // atenuada. Se sigue viendo —es parte de la gracia saber cuánto hizo el que las puso—
  // pero no ocupa el podio de los demás.
  const fila = e => {
    const pos = e.autor ? '<span title="Fuera de concurso">✎</span>' : (MEDALLAS[e.pos - 1] || e.pos);
    const tenue = e.autor ? ' style="opacity:0.65"' : '';
    return `<tr${tenue}><td>${pos}</td><td style="font-weight:600">${esc(e.nombre)}${e.autor ? ' <span style="font-weight:400;font-size:11px;color:var(--muted)">fuera de concurso</span>' : ''}</td><td style="color:var(--accent);font-weight:600">${esc(Number(e.puntos).toLocaleString())}</td><td>${esc(e.correctas)}/${esc(e.total)}</td><td class="celda-dif">${esc(tiempoCorto(e.segundos))}</td><td class="celda-fecha" style="font-size:11px;color:var(--muted)">${esc(fechaCorta(e.fecha))}</td></tr>`;
  };
  div.innerHTML = cab + `<div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Aciertos</th><th>Tiempo</th><th class="celda-fecha">Fecha</th></tr></thead><tbody>${torneoTabla.map(fila).join('')}</tbody></table></div>` + pie;
}

// El final del torneo es lo que vende el siguiente, así que el podio sale listo para pegar.
function textoPodio() {
  const url = window.location.href.split('?')[0];
  // Sin los que van fuera de concurso: el podio que se manda al grupo es el de verdad.
  const enLiza = torneoTabla.filter(e => !e.autor);
  const podio = enLiza.slice(0, 3)
    .map((e, i) => `${['🥇', '🥈', '🥉'][i]} ${e.nombre} — ${Number(e.puntos).toLocaleString()}`)
    .join('\n');
  return `🏆 ${torneo ? torneo.titulo : 'Torneo GeoQuiz'}\n\n${podio}\n\nJugaron ${enLiza.length}. La semana que viene, otro:\n${url}`;
}
