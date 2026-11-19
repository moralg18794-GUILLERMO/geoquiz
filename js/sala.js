// GeoQuiz — torneo de duelos (la parte que ve el jugador).
//
// Una sala junta a 2-8 jugadores y los sortea en una eliminatoria. Cada partido es un duelo normal
// (js/duelo.js): desde la sala se entra a él con un botón y, al terminar, se vuelve a la sala.
//
//  · Quien abre el torneo (🏆 Abrir torneo, bajo Crear duelo) es el organizador: cuando hay gente,
//    pulsa «Empezar». Hay 30 s para confirmar «Estoy aquí»; quien no confirma queda fuera del sorteo.
//  · El servidor lleva el cuadro: aquí solo se sondea su estado cada 3 s y se pinta. La llave secreta de
//    cada jugador (la da el servidor al apuntarse) se guarda en este dispositivo para poder volver a
//    entrar si se recarga la página o se bloquea el móvil.
//  · Mientras se juega un partido no se sondea la sala: el partido ya tiene su propio sondeo.

const GQ_SALA_API = GQ_API.replace('ranking.php', 'sala.php');
const SALA_CADA_MS = 3000;
const K_SALA = 'gq_sala';

let salaActiva = null;       // { codigo, nombre, token } de la sala en la que estoy
let salaEstado = null;       // lo último que dijo el servidor
let salaRecibidoEn = 0;
let salaInt = null;
let salaReloj = null;        // un tic por segundo mientras dura la llamada, para la cuenta atrás
let salaCargando = false;

// Los botones .btn-primary / .btn-secondary solo traen color y borde (el tamaño lo ponía el contenedor del resultado).
const BTN_ANCHO = 'width:100%;padding:0.8rem;border-radius:14px;font-size:14px;font-weight:600;font-family:Inter,sans-serif;cursor:pointer;';

// ── LA SALA GUARDADA EN ESTE DISPOSITIVO ──────────────────────────────────
// Se guarda para poder volver tras una recarga. Caduca a las 6 h: ningún torneo dura tanto.
function salaGuardada() {
  try {
    const v = JSON.parse(localStorage.getItem(K_SALA) || 'null');
    if (v && v.codigo && v.token && v.nombre && Date.now() - (v.t || 0) < 6 * 3600 * 1000) return v;
  } catch (e) {}
  return null;
}
function guardarSala() {
  try { localStorage.setItem(K_SALA, JSON.stringify({ codigo: salaActiva.codigo, nombre: salaActiva.nombre, token: salaActiva.token, t: Date.now() })); } catch (e) {}
}
function borrarSalaGuardada() {
  try { localStorage.removeItem(K_SALA); } catch (e) {}
}

function salaPost(accion, extra) {
  const a = salaActiva || {};
  return gqFetch(GQ_SALA_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion, codigo: a.codigo, nombre: a.nombre, token: a.token, ...(extra || {}) }),
  });
}

// ── ABRIR UN TORNEO / APUNTARSE ───────────────────────────────────────────
async function crearSala() {
  // Como el duelo: el servidor solo entiende épocas; los otros ejes de filtro no le sirven.
  if (filterMode !== 'epocas') {
    toast('El torneo se juega por épocas. Cambia el filtro de arriba a «Por épocas».');
    return;
  }
  const cats = [...selectedCats];
  if (!cats.length) { toast('Elige al menos una categoría.'); return; }
  const nombre = (gqNombre('¿Con qué nombre juegas el torneo?') || '').trim();
  if (!nombre) return;

  const res = await gqFetch(GQ_SALA_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'crear', nombre, cats, dif: selectedDiff }),
  });
  if (!res.ok || !res.cuerpo || !res.cuerpo.token) {
    toast((res.cuerpo && res.cuerpo.mensaje) || 'No se pudo abrir el torneo. Revisa la conexión.');
    return;
  }
  entrarEnSala({ codigo: res.cuerpo.codigo, nombre: (res.cuerpo.mi && res.cuerpo.mi.nombre) || nombre, token: res.cuerpo.token }, res.cuerpo);
}

async function unirseSala(codigo) {
  codigo = String(codigo || '').trim().toUpperCase();
  if (!codigo) return;
  // Si este dispositivo ya estaba dentro (recarga, vuelta desde WhatsApp), se entra con su llave.
  const g = salaGuardada();
  let nombre, token = '';
  if (g && g.codigo === codigo) { nombre = g.nombre; token = g.token; }
  else {
    nombre = (gqNombre('¿Con qué nombre juegas el torneo?') || '').trim();
    if (!nombre) return;
  }
  const res = await gqFetch(GQ_SALA_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'unirse', codigo, nombre, token }),
  });
  if (!res.ok || !res.cuerpo || !res.cuerpo.token) {
    toast((res.cuerpo && res.cuerpo.mensaje) || 'No se pudo entrar en ese torneo. Revisa la conexión.');
    return;
  }
  entrarEnSala({ codigo, nombre: (res.cuerpo.mi && res.cuerpo.mi.nombre) || nombre, token: res.cuerpo.token }, res.cuerpo);
}

function entrarEnSala(acceso, estado) {
  salaActiva = acceso;
  guardarSala();
  salaEstado = estado;
  salaRecibidoEn = Date.now();
  mostrarSala();
}

// Vuelve al torneo guardado en este dispositivo (botón «Tienes un torneo en marcha»).
async function reanudarSala() {
  const g = salaGuardada();
  if (!g) return;
  salaActiva = { codigo: g.codigo, nombre: g.nombre, token: g.token };
  salaEstado = null;
  mostrarSala();
  sondearSala();
}

function textoInvitacionSala() {
  const base = window.location.href.split('?')[0];
  return `¡Te invito a un torneo de duelos en GeoQuiz!\n\nEntra con este enlace y apúntate:\n${base}?sala=${salaActiva.codigo}\n\n(Código por si lo pide: ${salaActiva.codigo})`;
}

// ── SONDEO ────────────────────────────────────────────────────────────────
function mostrarSala() {
  showScreen('screen-duelo');
  renderSala();
  clearInterval(salaInt);
  salaInt = setInterval(tickSala, SALA_CADA_MS);
}

function pararSondeoSala() {
  clearInterval(salaInt); salaInt = null;
  clearInterval(salaReloj); salaReloj = null;
}

// Solo se sondea mientras la sala está a la vista: pestaña visible y su pantalla en primer plano.
function salaALaVista() {
  const pantalla = document.getElementById('screen-duelo');
  return !!(salaActiva && pantalla && pantalla.classList.contains('active') && document.getElementById('sala-vista') && !document.hidden);
}
function tickSala() {
  if (salaALaVista()) sondearSala();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickSala(); });

async function sondearSala() {
  if (!salaActiva || salaCargando) return;
  salaCargando = true;
  try {
    const res = await salaPost('estado');
    if (!salaActiva) return;
    if (!res.ok) {
      // 403/404: ya no estoy en esa sala (me sacaron, no confirmé, se cerró). Un fallo de red se reintenta solo.
      if (res.estado === 403 || res.estado === 404) salaPerdida(res.cuerpo && res.cuerpo.mensaje);
      return;
    }
    avisarCambios(salaEstado, res.cuerpo);
    salaEstado = res.cuerpo;
    salaRecibidoEn = Date.now();
    renderSala();
  } finally {
    salaCargando = false;
  }
}

function salaPerdida(mensaje) {
  pararSondeoSala();
  borrarSalaGuardada();
  salaActiva = null; salaEstado = null;
  toast(mensaje || 'Ya no estás en ese torneo.');
  goMenu();
}

// Un aviso y un sonido cuando pasa algo que el jugador tiene que ver aunque mire a otra cosa.
function avisarCambios(antes, ahora) {
  if (!ahora) return;
  const a = antes && antes.sala ? antes.sala.estado : '';
  const n = ahora.sala.estado;
  if (n === 'llamando' && a !== 'llamando') { playStart(); toast('¡Va a empezar! Pulsa «Estoy aquí».'); }
  if (a === 'llamando' && n === 'abierta') toast('No confirmaron jugadores suficientes: el torneo sigue abierto.');
  const mp = ahora.mi.partido, mpAntes = antes && antes.mi ? antes.mi.partido : null;
  if (mp && !(mpAntes && mpAntes.codigo === mp.codigo)) { playStart(); toast(`¡Te toca contra ${mp.rival}!`); }
  if (n === 'terminada' && a !== 'terminada') playFinish();
}

// ── PANTALLAS ─────────────────────────────────────────────────────────────
function listaJugadores(s, mostrarListo) {
  const yo = s.mi.nombre;
  return s.jugadores.map(j => {
    const punto = `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px;background:${j.presente ? '#3fb950' : 'var(--border2)'}"></span>`;
    const etiquetas = [
      j.organizador ? '👑 organiza' : '',
      j.nombre === yo ? 'tú' : '',
      mostrarListo ? (j.listo ? '✅' : '⏳') : '',
    ].filter(Boolean).join(' · ');
    const expulsar = s.sala.estado === 'abierta' && s.sala.soy_organizador && j.nombre !== yo
      ? `<button class="chip-btn" style="padding:2px 9px" onclick="expulsarDeSala('${esc(j.nombre).replace(/'/g, '&#39;')}')" aria-label="Echar a ${esc(j.nombre)}">✕</button>`
      : '';
    return `<div style="display:flex;align-items:center;gap:6px;padding:0.5rem 0.2rem;border-bottom:1px solid var(--border2)">
      <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${punto}<strong>${esc(j.nombre)}</strong>
        <span style="color:var(--muted);font-size:12px">${etiquetas ? ' · ' + esc(etiquetas) : ''}</span></div>${expulsar}</div>`;
  }).join('');
}

function nombreRonda(r, rondas) {
  if (r === rondas) return 'Final';
  if (r === rondas - 1) return 'Semifinales';
  return 'Cuartos de final';
}

function pintarPartido(p, yo) {
  const quien = x => x === null
    ? '<span style="color:var(--muted)">por decidir</span>'
    : `<span style="${x === yo ? 'color:var(--accent);' : ''}${p.ganador === x ? 'font-weight:700' : ''}">${esc(x)}</span>`;
  const corazones = (v) => (p.estado === 'jugando' && v !== null) ? ` <span style="font-size:11px;color:var(--muted)">❤${v}</span>` : '';
  let estado;
  if (p.motivo === 'pase') estado = '<span style="color:var(--muted)">pase directo</span>';
  else if (p.estado === 'terminado') estado = `<span style="color:var(--accent)">✓ pasa ${esc(p.ganador)}</span>${p.motivo === 'abandono' ? '<span style="color:var(--muted)"> (el rival no jugó)</span>' : ''}`;
  else if (p.estado === 'jugando') estado = '<span style="color:#3fb950">● en juego</span>';
  else estado = '<span style="color:var(--muted)">esperando rival</span>';
  const dos = p.motivo === 'pase' ? quien(p.ganador) : `${quien(p.j1)}${corazones(p.v1)} <span style="color:var(--muted)">vs</span> ${quien(p.j2)}${corazones(p.v2)}`;
  return `<div style="padding:0.55rem 0.8rem;margin-bottom:0.4rem;background:var(--surface);border:1px solid var(--border2);border-radius:var(--radius)">
    <div>${dos}</div><div style="font-size:12px;margin-top:2px">${estado}</div></div>`;
}

function pintarCuadro(s) {
  const rondas = Math.max(...s.cuadro.map(p => p.ronda));
  let html = '';
  for (let r = 1; r <= rondas; r++) {
    html += `<p class="section-label" style="margin:1rem 0 0.5rem">${nombreRonda(r, rondas)}</p>`;
    html += s.cuadro.filter(p => p.ronda === r).map(p => pintarPartido(p, s.mi.nombre)).join('');
  }
  return html;
}

function renderSala() {
  const el = document.getElementById('screen-duelo');
  if (!salaActiva) return;
  if (!salaEstado) { el.innerHTML = '<div id="sala-vista" class="no-records">Cargando…</div>'; return; }
  const s = salaEstado, sala = s.sala, mi = s.mi;
  const cab = `<p class="section-label">🏆 Torneo de duelos</p>`;
  const codigo = `<div style="text-align:center;font-size:26px;font-weight:700;letter-spacing:4px;margin:0.4rem 0 0.8rem;color:var(--accent)">${esc(sala.codigo)}</div>`;
  const whats = `<button class="invitar-btn" onclick="compartirWhatsApp(textoInvitacionSala())">💬 Avisar por WhatsApp</button>`;
  let cuerpo = '';

  if (sala.estado === 'abierta') {
    const n = s.jugadores.length;
    const empezar = sala.soy_organizador
      ? `<button class="start-btn" style="margin-top:1rem" ${n < 2 ? 'disabled' : ''} onclick="empezarSala()">▶ Empezar torneo${n >= 2 ? ` (${n} apuntados)` : ''}</button>
         ${n < 2 ? '<div style="color:var(--muted);font-size:12px;text-align:center;margin-top:0.4rem">Hacen falta al menos 2 jugadores.</div>' : ''}`
      : `<div style="color:var(--muted);font-size:13px;text-align:center;margin-top:1rem">Esperando a que ${esc(sala.organizador)} empiece el torneo…</div>`;
    cuerpo = `${codigo}
      <p style="color:var(--muted);font-size:13px;margin-bottom:0.8rem">Es una eliminatoria: pierdes un partido y quedas fuera. Cada partido es un duelo a ${esc(sala.vidas)} vidas. Mantén esta pantalla abierta mientras esperas.</p>
      <p class="section-label" style="margin:0.6rem 0 0">Apuntados · ${s.jugadores.length} de ${esc(sala.plazas)}</p>
      ${listaJugadores(s, false)}
      ${empezar}
      ${whats}
      <button class="btn-secondary" style="${BTN_ANCHO}margin-top:0.6rem" onclick="salirDeSala()">Salir del torneo</button>
      ${sala.soy_organizador ? `<button class="btn-secondary" style="${BTN_ANCHO}margin-top:0.6rem" onclick="cancelarSala()">Cancelar el torneo</button>` : ''}`;
  } else if (sala.estado === 'llamando') {
    const miFila = s.jugadores.find(j => j.nombre === mi.nombre);
    const restante = Math.max(0, (sala.llamada_restante || 0) - Math.floor((Date.now() - salaRecibidoEn) / 1000));
    cuerpo = `<div style="text-align:center;font-size:30px;margin:0.6rem 0">📣</div>
      <div style="text-align:center;font-weight:700;font-size:18px">¡Va a empezar!</div>
      <p style="color:var(--muted);font-size:13px;text-align:center;margin:0.4rem 0 0.8rem">Confirma que estás para entrar en el sorteo. Quien no confirme, se queda fuera. Quedan <strong style="color:var(--text)">${restante} s</strong>.</p>
      ${listaJugadores(s, true)}
      ${miFila && miFila.listo
        ? '<div style="text-align:center;color:#3fb950;margin-top:1rem;font-weight:600">✅ Confirmado. Esperando a los demás…</div>'
        : '<button class="start-btn" style="margin-top:1rem" onclick="confirmarEstoyAqui()">✅ Estoy aquí</button>'}`;
  } else if (sala.estado === 'cancelada') {
    cuerpo = `<div class="no-records">Este torneo se ha cancelado.</div>
      <button class="btn-primary" style="${BTN_ANCHO}" onclick="cerrarSala()">Volver</button>`;
  } else {
    // jugando o terminada
    let aviso = '';
    if (sala.estado === 'terminada') {
      aviso = mi.campeon
        ? `<div style="text-align:center;padding:1rem;margin-bottom:0.8rem;background:rgba(212,175,55,0.12);border:1px solid var(--accent);border-radius:var(--radius)"><div style="font-size:34px">🏆</div><div style="font-weight:700;font-size:18px">¡Eres el campeón!</div></div>`
        : `<div style="text-align:center;padding:1rem;margin-bottom:0.8rem;background:var(--surface);border:1px solid var(--border2);border-radius:var(--radius)"><div style="font-size:28px">🏆</div><div style="font-weight:700">Campeón: ${esc(sala.ganador || '—')}</div></div>`;
    } else if (mi.partido) {
      aviso = `<div style="text-align:center;padding:1rem;margin-bottom:0.8rem;background:rgba(212,175,55,0.12);border:1px solid var(--accent);border-radius:var(--radius)">
        <div style="font-weight:700;font-size:17px">⚔️ Te toca contra ${esc(mi.partido.rival)}</div>
        <div style="color:var(--muted);font-size:12px;margin:0.3rem 0 0.7rem">Tienes 2 minutos para empezar; si no, pierdes el partido por abandono.</div>
        <button class="start-btn" onclick="entrarAlPartido()">▶ Entrar al duelo</button></div>`;
    } else if (mi.eliminado) {
      aviso = '<div style="text-align:center;color:var(--muted);margin-bottom:0.8rem">Has quedado eliminado. Puedes seguir el torneo desde aquí.</div>';
    } else {
      aviso = '<div style="text-align:center;color:var(--muted);margin-bottom:0.8rem">⏳ Esperando a tu próximo rival…</div>';
    }
    cuerpo = `${aviso}${pintarCuadro(s)}
      <button class="btn-secondary" style="${BTN_ANCHO}margin-top:1rem" onclick="${sala.estado === 'terminada' ? 'cerrarSala()' : 'goMenu()'}">${sala.estado === 'terminada' ? 'Cerrar el torneo' : 'Volver al menú (el torneo sigue)'}</button>`;
  }

  el.innerHTML = `<div id="sala-vista">${cab}${cuerpo}</div>`;

  // La cuenta atrás de la llamada se refresca cada segundo; el resto del tiempo no hace falta.
  if (sala.estado === 'llamando' && !salaReloj) salaReloj = setInterval(() => { if (salaALaVista()) renderSala(); }, 1000);
  if (sala.estado !== 'llamando' && salaReloj) { clearInterval(salaReloj); salaReloj = null; }
}

// ── ACCIONES ──────────────────────────────────────────────────────────────
async function refrescarTras(res) {
  if (res.ok && res.cuerpo && res.cuerpo.sala) {
    avisarCambios(salaEstado, res.cuerpo);
    salaEstado = res.cuerpo; salaRecibidoEn = Date.now(); renderSala();
  } else if (!res.ok) {
    toast((res.cuerpo && res.cuerpo.mensaje) || 'No se pudo. Revisa la conexión.');
  }
}
async function empezarSala()      { await refrescarTras(await salaPost('empezar')); }
async function confirmarEstoyAqui() { await refrescarTras(await salaPost('listo')); }
async function expulsarDeSala(nombre) {
  if (!confirm(`¿Echar a ${nombre} del torneo?`)) return;
  await refrescarTras(await salaPost('expulsar', { objetivo: nombre }));
}
async function cancelarSala() {
  if (!confirm('¿Cancelar el torneo para todos?')) return;
  await salaPost('cancelar');
  cerrarSala();
}
async function salirDeSala() {
  await salaPost('salir');
  cerrarSala();
}
// Cierra la sala en este dispositivo (no en el servidor) y vuelve al menú.
function cerrarSala() {
  pararSondeoSala();
  borrarSalaGuardada();
  salaActiva = null; salaEstado = null;
  goMenu();
}

// Entra al duelo del partido que me toca: el servidor ya lo ha creado con mi nombre y el de mi rival.
async function entrarAlPartido() {
  const mp = salaEstado && salaEstado.mi && salaEstado.mi.partido;
  if (!mp) return;
  const res = await gqFetch(
    `${GQ_DUELO_API}?codigo=${encodeURIComponent(mp.codigo)}&nombre=${encodeURIComponent(salaActiva.nombre)}`,
    { method: 'GET' }
  );
  if (!res.ok || !res.cuerpo || !res.cuerpo.duelo) { toast('No se pudo entrar al duelo. Inténtalo otra vez.'); return; }
  pararSondeoSala();
  duelCodigo = mp.codigo;
  duelNombre = salaActiva.nombre;
  duelo = res.cuerpo.duelo;
  duelMiLado = duelo.mi_lado || 1;
  duelSala = salaActiva;
  arrancarDuelo();
}

// Desde la pantalla de resultado de un partido del torneo.
function volverASala() {
  duelSala = null;
  pararSondeoDuelo();
  salaEstado = salaEstado || null;
  mostrarSala();
  sondearSala();
}

// Enlace de invitación: ?sala=CODIGO
function checkSalaInvite() {
  try {
    const c = new URLSearchParams(window.location.search).get('sala');
    if (c) { showTab('menu'); unirseSala(c.toUpperCase()); }
  } catch (e) {}
}
setTimeout(checkSalaInvite, 0);
