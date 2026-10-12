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
let torneoInicio = 0;           // marca de tiempo para calcular cuánto se ha tardado
let torneoCuentaInt = null;

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

// ── AVISO AL ENTRAR ───────────────────────────────────────────────────────
async function cargarTorneo() {
  const res = await gqFetch(GQ_TORNEO_API, { method: 'GET' });
  if (!res.ok || !res.cuerpo || !res.cuerpo.torneo) return;   // sin torneo, el juego sigue igual
  torneo = res.cuerpo.torneo;
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

  if (cerrado) {
    document.getElementById('ta-eyebrow').textContent = '🏆 Torneo terminado';
    btn.textContent = 'Ver el podio';
    btn.onclick = () => showTab('torneo');
  } else if (yaJugo) {
    // Ya jugó desde aquí: en vez de invitarle otra vez, se le dice cómo va.
    const mio = torneoTabla.find(f => f.nombre.toLowerCase() === yaJugo.toLowerCase());
    document.getElementById('ta-eyebrow').textContent = mio
      ? `🏆 Ya jugaste · vas ${mio.pos}º con ${Number(mio.puntos).toLocaleString()} puntos`
      : '🏆 Ya jugaste este torneo';
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
  if (!torneo.preguntas || !torneo.preguntas.length) { toast('El torneo no tiene preguntas'); return; }

  const previo = torneoJugadoAqui(torneo.slug);
  const nombre = (prompt('¿Con qué nombre juegas el torneo?\nSolo se puede jugar UNA vez.', previo || '') || '').trim();
  if (!nombre) return;

  // Se comprueba contra el servidor ANTES de jugar: si ese nick ya gastó su intento, más
  // vale saberlo ahora que después de responder las 15.
  const comp = await gqFetch(`${GQ_TORNEO_API}?nombre=${encodeURIComponent(nombre)}`, { method: 'GET' });
  if (comp.ok && comp.cuerpo && comp.cuerpo.jugado) {
    torneoApuntarJugado(torneo.slug, nombre);
    const yo = comp.cuerpo.yo;
    toast(yo ? `«${nombre}» ya jugó: ${yo.pos}º con ${Number(yo.puntos).toLocaleString()}` : `«${nombre}» ya jugó este torneo`);
    torneoTabla = comp.cuerpo.clasificacion || torneoTabla;
    showTab('torneo');
    return;
  }

  torneoNombre = nombre;
  arrancarTorneo();
}

function arrancarTorneo() {
  playStart();
  pararCronometros();
  cerrarAvisoTorneo();

  // Copia propia de las preguntas: renderQuestion() baraja las opciones in situ y no debe
  // tocar lo que devolvió la API por si se vuelve a entrar.
  gameQ = torneo.preguntas.map(q => ({ ...q, opts: [...q.opts] }));

  // El motor del juego se comporta como en modo solo (temporizador por pregunta,
  // multiplicador, comodines), pero lo que se guarda es una partida de torneo.
  gameMode = 'solo';
  partida = { modo: 'torneo', dif: 'na', eje: 'n', nsel: 0, ntot: 0, cats: torneo.titulo, torneo: torneo.slug };

  current = 0; score = 0; correct = 0; wrong = 0; maxStreak = 0; streak = 0; skipped = 0;
  hint5050 = true; hintSkip = true; hintDato = true; answered = false; timeLeft = 20; lastCat = '';
  // Sin vidas: en el torneo todos responden las 15. Con tres fallos y un único intento,
  // alguien se quedaría fuera en la séptima pregunta y su marca no sería comparable con
  // la de los demás, que es justo lo que el torneo viene a arreglar.
  lives = 9999;
  torneoInicio = Date.now();

  showScreen('screen-game');
  setupHUD();
  setHeaderStyle(gameQ[0].cat || 'Antigüedad');
  renderQuestion();
}

// ── RESULTADO ─────────────────────────────────────────────────────────────
async function mostrarResultadoTorneo() {
  const total = gameQ.length;
  const pct = Math.round((correct / Math.max(total, 1)) * 100);
  const segundos = Math.max(0, Math.round((Date.now() - torneoInicio) / 1000));
  const slug = partida.torneo;

  document.getElementById('result-hero').innerHTML = `
    <div style="font-size:40px;margin-bottom:0.5rem">🏆</div>
    <div><span class="result-score-num">${score.toLocaleString()}</span></div>
    <div style="font-size:13px;color:var(--muted);margin-top:4px">${correct} de ${total} correctas · ${pct}%</div>
    <div class="result-rank">${esc(torneo ? torneo.titulo : 'Torneo')}</div>
    <div class="result-msg" id="torneo-envio">Enviando tu marca…</div>`;
  showScreen('screen-result');

  const res = await gqFetch(GQ_TORNEO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, nombre: torneoNombre, puntos: score, correctas: correct, segundos }),
  });

  torneoApuntarJugado(slug, torneoNombre);
  const msg = document.getElementById('torneo-envio');

  if (res.ok && res.cuerpo) {
    torneoTabla = res.cuerpo.clasificacion || [];
    const pos = res.cuerpo.pos;
    msg.innerHTML = pos
      ? `Vas <strong>${pos}º</strong> de ${torneoTabla.length} en el torneo.`
      : 'Marca guardada.';
  } else if (res.estado === 409 && res.cuerpo) {
    // Alguien ya había jugado con ese nick. No se guarda nada: es la regla, no un fallo.
    torneoTabla = res.cuerpo.clasificacion || torneoTabla;
    const yo = res.cuerpo.yo;
    msg.innerHTML = yo
      ? `Ese nombre ya había jugado este torneo, así que esta partida <strong>no cuenta</strong>. Su marca sigue siendo ${Number(yo.puntos).toLocaleString()} puntos (${yo.pos}º).`
      : 'Ese nombre ya había jugado este torneo, así que esta partida <strong>no cuenta</strong>.';
  } else {
    msg.innerHTML = 'No se pudo enviar la marca al torneo. Revisa la conexión; esta partida <strong>no se ha guardado</strong>.';
  }

  document.getElementById('result-hero').innerHTML += `
    <div class="result-actions" style="margin-top:1.5rem">
      <button class="btn-whatsapp" onclick="compartirWhatsApp(textoTorneo())">💬 WhatsApp</button>
      <button class="btn-secondary" onclick="showTab('torneo')">🏆 Clasificación</button>
      <button class="btn-primary" onclick="goMenu()">Volver</button>
    </div>`;
}

function textoTorneo() {
  const total = gameQ.length;
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

  if (!torneoTabla.length) {
    div.innerHTML = cab + '<div class="no-records">Todavía no ha jugado nadie.<br>¡Sé el primero!</div>';
    return;
  }

  div.innerHTML = cab + `<div style="overflow-x:auto"><table class="records-table"><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Aciertos</th><th class="celda-fecha">Fecha</th></tr></thead><tbody>${torneoTabla.map(e => `<tr><td>${MEDALLAS[e.pos - 1] || e.pos}</td><td style="font-weight:600">${esc(e.nombre)}</td><td style="color:var(--accent);font-weight:600">${esc(Number(e.puntos).toLocaleString())}</td><td>${esc(e.correctas)}/${esc(e.total)}</td><td class="celda-fecha" style="font-size:11px;color:var(--muted)">${esc(fechaCorta(e.fecha))}</td></tr>`).join('')}</tbody></table></div>`
    + (activo ? '' : `<button class="clear-btn" style="border-color:var(--accent);color:var(--accent)" onclick="compartirWhatsApp(textoPodio())">🏆 Compartir el podio</button>`);
}

// El final del torneo es lo que vende el siguiente, así que el podio sale listo para pegar.
function textoPodio() {
  const url = window.location.href.split('?')[0];
  const podio = torneoTabla.slice(0, 3)
    .map((e, i) => `${['🥇', '🥈', '🥉'][i]} ${e.nombre} — ${Number(e.puntos).toLocaleString()}`)
    .join('\n');
  return `🏆 ${torneo ? torneo.titulo : 'Torneo GeoQuiz'}\n\n${podio}\n\nJugaron ${torneoTabla.length}. La semana que viene, otro:\n${url}`;
}
