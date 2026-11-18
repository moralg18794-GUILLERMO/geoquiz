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
let torneoPractica = false;     // la partida en curso es una repetición de práctica: no puntúa
let torneoNombreReal = '';      // el nombre con el que se jugó de verdad (la práctica va con un alias interno)
let torneoRep = null;           // el torneo que se está repitiendo (puede no ser el vigente); null si se juega en serio
let torneoRepes = [];           // las mejores repeticiones del torneo cerrado que enseña la pestaña Torneo
let torneoTextoRepeticion = ''; // el mensaje de invitación que sale en el resultado de una repetición

// El torneo que se está jugando ahora mismo: el que se repite, o el vigente. Todo lo que pinta la
// partida y su resultado (título, GTA, texto para compartir) tiene que leerlo de aquí y no de `torneo`,
// que es el vigente y puede ser otro.
function torneoJugando() { return torneoRep || torneo; }

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
  // El reloj de delante solo va con la cuenta atrás: «⏱ Terminado» no tendría sentido.
  el.classList.toggle('ta-reloj', torneo.estado === 'activo');
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
  // Mientras GTA VI no ha salido, el reto lo recuerda: es lo que da prisa a quien lo recibe.
  const msE = torneoEsGTA() ? estrenoRestanteMs() : 0;
  const dias = Math.ceil(msE / 86400000);
  const falta = msE > 86400000 ? `${dias} ${dias === 1 ? 'día' : 'días'}` : `${Math.ceil(msE / 3600000)} h`;
  const estreno = msE > 0 ? `\n\n⏳ GTA VI sale en ${falta}.` : '';
  return `🏆 ${torneo.titulo}\n${torneo.tema}${regla}${estreno}\n\nCierra el ${torneoCierre()}${r ? ` · quedan ${r}` : ''}.\n\n${url}`;
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
  estrenoIniciar();
  clearInterval(torneoCuentaInt);
  torneoPintarCuenta();
  torneoCuentaInt = setInterval(torneoPintarCuenta, 30000);
}

// El número del torneo en romanos. Lo cuenta el servidor (campo `numero`), así que no hay
// que escribirlo a mano cada semana ni arriesgarse a repetir un III.
function romano(n) {
  n = parseInt(n, 10);
  if (!n || n < 1 || n > 3999) return '';
  const tabla = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
                 [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let s = '';
  for (const [v, r] of tabla) { while (n >= v) { s += r; n -= v; } }
  return s;
}

// El rótulo de arriba del aviso. Si por lo que sea no viene el número —una versión vieja
// del servidor, por ejemplo— se queda el de siempre en vez de enseñar un hueco.
function torneoRotulo() {
  const n = torneo ? romano(torneo.numero) : '';
  return n ? `🏆 Torneo semanal ${n}🏆` : '🏆 Torneo de la semana';
}

// La línea de «no oficial» solo tiene sentido cuando el torneo habla del juego de Rockstar:
// GeoQuiz no está afiliado a Rockstar Games ni a Take-Two. Cualquier otra semana no sale.
function torneoEsGTA(t = torneo) {
  return !!t && /gta|rockstar|grand theft|vice city|leonida/i.test(`${t.titulo} ${t.tema || ''}`);
}

function pintarAvisoTorneo() {
  const caja = document.getElementById('torneo-aviso');
  if (!caja || !torneo) return;
  const tt = document.getElementById('ta-titulo'); tt.textContent = torneo.titulo; tt.classList.toggle('ta-gta', torneoEsGTA());
  document.getElementById('ta-tema').textContent = torneo.tema || '';
  document.getElementById('ta-npreg').textContent = torneo.n_preguntas ? `${torneo.n_preguntas} preguntas · 1 intento que puntúa` : '';
  document.getElementById('ta-legal').style.display = torneoEsGTA() ? '' : 'none';

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
    document.getElementById('ta-eyebrow').textContent = torneoRotulo();
    btn.textContent = 'Jugar el torneo';
    btn.onclick = jugarTorneo;
  }

  // Quien ya jugó puede repetirlo de práctica: no puntúa ni cambia su marca.
  let rb = document.getElementById('ta-repetir');
  if (!rb) {
    rb = document.createElement('button');
    rb.id = 'ta-repetir';
    rb.className = 'invitar-btn';
    btn.insertAdjacentElement('afterend', rb);
  }
  const puedeRepetir = !cerrado && torneoEstado !== 'enCurso' && !!yaJugo;
  rb.style.display = puedeRepetir ? '' : 'none';
  rb.textContent = '🔁 Volver a jugar (sin puntuar)';
  rb.onclick = () => repetirTorneo(null, false, torneo);

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
  torneoPractica = false; torneoNombreReal = ''; torneoRep = null;

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
    // El intento que puntúa ya está gastado, pero se puede jugar otra vez de práctica.
    if (res.cuerpo.puede_repetir && confirm(`«${nombre}» ya jugó este torneo y solo puntúa la primera partida.\n\n¿Quieres volver a jugarlo como PRÁCTICA? No puntúa ni cambia tu marca.`)) {
      await repetirTorneo(nombre, true, torneo);
      return;
    }
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

  if (res.cuerpo.token && !torneoPractica) torneoGuardarToken(torneo.slug, res.cuerpo.token);
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

// Repetir un torneo SIN puntuar. El servidor monta una partida aparte (con un alias interno) que no sale
// en la clasificación, con las mismas preguntas y la misma corrección. `t` es el torneo a repetir:
//   · abierto: solo quien ya lo jugó; la práctica se borra al terminar.
//   · cerrado: cualquiera (también quien viene de una invitación); al terminar se queda anotada como
//     «repetición», aparte del podio, que ya no se mueve.
async function repetirTorneo(nombre, yaConfirmado, t) {
  t = t || torneo;
  if (!t) { toast('No hay ningún torneo que repetir.'); return; }
  const cerrado = t.estado !== 'activo';
  nombre = (nombre || (!cerrado && torneoJugadoAqui(t.slug)) || torneoMiMote() || '').trim();
  if (!nombre) nombre = (prompt(cerrado ? '¿Con qué nombre quieres jugarlo?' : '¿Con qué nombre jugaste el torneo?', '') || '').trim();
  if (!nombre) return;
  const aviso = cerrado
    ? `Vas a jugar «${t.titulo}» fuera de concurso.\n\nEl torneo ya cerró: no puntúa ni cambia la clasificación, pero tu resultado se queda anotado como repetición.\n\n¿Empezar?`
    : 'Vas a jugar el torneo otra vez como PRÁCTICA.\n\nNo puntúa, no cambia tu marca ni la clasificación: es solo para jugarlo de nuevo.\n\n¿Empezar?';
  if (!yaConfirmado && !confirm(aviso)) return;
  const res = await gqFetch(GQ_TORNEO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'empezar', slug: t.slug, nombre, repetir: true }),
  });
  if (!res.ok) {
    toast((res.cuerpo && res.cuerpo.mensaje) || 'No se pudo preparar la repetición. Revisa la conexión.');
    return;
  }
  // Nada de esto se guarda como si fuera la partida de verdad: ni su testigo ni su alias.
  torneoPractica = true;
  torneoRep = t;
  torneoNombreReal = nombre;
  torneoToken = res.cuerpo.token || '';
  torneoNombre = res.cuerpo.nombre;
  toast(cerrado ? 'Repetición: esta partida no puntúa.' : 'Modo práctica: esta partida no puntúa.');
  arrancarTorneo();
}

// Una franja fija arriba de la partida para que no haya duda de que esta no cuenta.
function torneoBannerPractica(on) {
  let b = document.getElementById('torneo-practica');
  if (!on) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('div');
    b.id = 'torneo-practica';
    b.style.cssText = 'margin:0 0 10px;padding:10px 14px;border-radius:12px;text-align:center;font:700 13px "Inter",sans-serif;'
      + 'background:rgba(255,200,60,.14);border:1px solid rgba(255,200,60,.55);color:#ffd36a';
    document.getElementById('screen-game').prepend(b);
  }
  b.textContent = torneoRep && torneoRep.estado !== 'activo'
    ? '🔁 REPETICIÓN · el torneo ya cerró: esta partida no puntúa'
    : '🧪 MODO PRÁCTICA · esta partida no puntúa ni cambia tu marca';
}

// ── REPETIR UN TORNEO CERRADO E INVITAR A OTROS ───────────────────────────
// Desde el Perfil se puede volver a jugar cualquier torneo del historial, y mandar un enlace
// (?torneo=<slug>) a quien no estuvo. Como el podio ya está cerrado, nada de esto lo mueve: la
// partida se queda aparte, como «repetición» del torneo.
async function torneoPorSlug(slug) {
  const res = await gqFetch(GQ_TORNEO_API + '?slug=' + encodeURIComponent(slug), { method: 'GET' });
  return res.ok && res.cuerpo && res.cuerpo.torneo ? res.cuerpo.torneo : null;
}

async function torneoRepetirSlug(slug) {
  const t = await torneoPorSlug(slug);
  if (!t) { toast('No se encuentra ese torneo.'); return; }
  await repetirTorneo(null, false, t);
}

// El mensaje de invitación a un torneo cerrado: dice que no puntúa y lleva el enlace directo.
function textoInvitacionTorneo(t) {
  const base = window.location.href.split(/[?#]/)[0];
  const url = `${base}?torneo=${encodeURIComponent(t.slug)}`;
  return `🏆 ${t.titulo}\n${t.tema ? t.tema + '\n' : ''}\nEste torneo ya cerró, pero puedes jugarlo igualmente: son las mismas ${t.n_preguntas || 15} preguntas que tuvieron los demás. `
    + `No puntúa en la clasificación; mira si habrías quedado en el podio.\n\n${url}`;
}

async function torneoInvitar(slug) {
  const t = await torneoPorSlug(slug);
  if (!t) { toast('No se encuentra ese torneo.'); return; }
  // Si sigue abierto, invitar es retar a jugarlo en serio, que es lo que ya hace el reto de siempre.
  if (t.estado === 'activo' && torneo && torneo.slug === t.slug) { retarAlTorneo(); return; }
  compartirWhatsApp(textoInvitacionTorneo(t));
}

// El enlace ?torneo=<slug>: si es uno cerrado, enseña de qué va y ofrece jugarlo. Se llama al
// arrancar, después de pedir el torneo vigente.
async function checkTorneoInvite() {
  let slug = '';
  try { slug = new URLSearchParams(window.location.search).get('torneo') || ''; } catch {}
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(slug)) return;
  const t = await torneoPorSlug(slug);
  // Se quita de la dirección DESPUÉS de resolverla (no antes): mientras está puesta, la bienvenida
  // sabe que esta persona viene a algo concreto y no se le pone delante; y al quitarla, recargar la
  // página no vuelve a lanzar la invitación.
  try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch {}
  if (!t) { toast('Ese torneo ya no está disponible.'); return; }
  if (t.estado === 'activo') return;   // el vigente ya se anuncia solo, con el aviso de siempre
  if (!confirm(`🏆 ${t.titulo}\n\n${t.tema || ''}\n\nEste torneo ya cerró: puedes jugarlo igualmente, pero no puntúa ni cambia la clasificación. Tu resultado se queda anotado como repetición.\n\n¿Jugarlo ahora?`)) return;
  await repetirTorneo(null, true, t);
}

// Las mejores repeticiones de un torneo cerrado, con las mismas filas que la clasificación.
function repeticionesHTML(lista, yo) {
  if (!lista || !lista.length) return '';
  const mio = (yo || '').toLowerCase();
  const fila = e => `<div class="tn-fila${mio && String(e.nombre).toLowerCase() === mio ? ' yo' : ''}">
    <div class="tn-pos">${esc(e.pos)}</div>
    <div class="tn-nom"><div class="tn-n">${esc(e.nombre)}</div><div class="tn-sub">${esc(e.correctas)}/${esc(e.total)} · ${esc(tiempoCorto(e.segundos))}</div></div>
    <div class="tn-pts">${esc(Number(e.puntos).toLocaleString())}</div>
  </div>`;
  return `<p class="section-label tn-titulo-sec" style="margin-top:22px">Repeticiones · fuera de concurso</p>
    <div class="tn-lista">${lista.map(fila).join('')}</div>
    <p style="text-align:center;color:var(--muted);font-size:12px;margin:8px 0 14px">Gente que ha jugado este torneo después de cerrar. No cuentan en el podio.</p>`;
}

async function arrancarTorneo() {
  torneoBannerPractica(torneoPractica);
  playStart();
  pararCronometros();
  if (torneoRep) {
    // Se repite otro torneo (o uno cerrado): el aviso se esconde, pero no se da por «visto» el del vigente.
    const caja = document.getElementById('torneo-aviso');
    if (caja) caja.classList.remove('show');
  } else {
    cerrarAvisoTorneo();
  }
  const tj = torneoJugando();

  // El motor del juego se comporta como en modo solo (temporizador por pregunta,
  // multiplicador), pero lo que se guarda es una partida de torneo.
  //
  // El modo elegido en el menú se guarda para devolverlo al salir. Antes se pisaba y no se
  // restauraba: quien tenía marcado Duelo, jugaba el torneo y volvía, veía Duelo resaltado
  // y los nombres puestos, pero al pulsar Empezar arrancaba una partida en solitario que
  // los ignoraba. Y si era de 13 épocas, se guardaba como oficial en el ranking global.
  torneoModoPrevio = gameMode;
  gameMode = 'solo';
  partida = { modo: 'torneo', dif: 'na', eje: 'n', nsel: 0, ntot: 0, cats: tj.titulo, torneo: tj.slug };

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

  if (torneoPractica && torneoRep && torneoRep.estado !== 'activo') {
    mostrarResultadoRepeticion(c, puntos, aciertos, total, pct);
    return;
  }
  if (torneoPractica) {
    // Una práctica no deja rastro: ni se apunta como jugada ni toca la marca del torneo.
    if (c.clasificacion) torneoTabla = c.clasificacion;
    torneoSoltarModo();
    torneoBannerPractica(false);
    document.getElementById('result-hero').classList.remove('evento');
    document.getElementById('result-hero').innerHTML = `
      <div style="font-size:40px;margin-bottom:0.5rem">🧪</div>
      <div class="result-rank">Práctica terminada</div>
      <div><span class="result-score-num">${puntos.toLocaleString()}</span></div>
      <div class="rh-pts">puntos · ${aciertos} de ${total} correctas · ${pct}%</div>
      <div class="result-msg"><strong>Esta partida no puntúa.</strong> Tu marca en el torneo no ha cambiado.</div>
      <div class="result-actions" style="margin-top:1.5rem">
        <button class="btn-secondary" onclick="repetirTorneo(torneoNombreReal, false, torneoJugando())">🔁 Otra vez</button>
        <button class="btn-secondary" onclick="showTab('torneo')">🏆 Clasificación</button>
        <button class="btn-primary ra-full" onclick="goMenu()">Volver al inicio</button>
      </div>`;
    showScreen('screen-result');
    playFinish();
    return;
  }
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

  // La tarjeta que se manda como imagen (js/utils.js). El texto del reto va aparte.
  ultimaTarjeta = {
    titulo: torneo ? torneo.titulo : 'Torneo GeoQuiz', puntos: puntos.toLocaleString('es-ES'),
    detalle: `${aciertos} de ${total} correctas · ${pct}%`, neon: true,
    legal: torneoEsGTA() ? 'Torneo no oficial · sin relación con Rockstar Games' : '',
    texto: textoTorneo(),
  };

  document.getElementById('result-hero').innerHTML = `
    <div class="rh-arte" aria-hidden="true"></div>
    <div class="rh-cuerpo">
      <div class="rh-trofeo"><svg class="ico"><use href="#i-trofeo"/></svg></div>
      <div class="rh-etiqueta">Torneo completado</div>
      <div class="result-rank">${esc(torneo ? torneo.titulo : 'Torneo')}</div>
      <div><span class="result-score-num">${puntos.toLocaleString()}</span></div>
      <div class="rh-pts">puntos · ${aciertos} de ${total} correctas · ${pct}%</div>
      <div class="rh-puesto">${puesto}</div>
      <div class="result-actions">
        <button class="btn-whatsapp ra-full" onclick="compartirWhatsApp(textoTorneo())">💬 Retar a mis amigos por WhatsApp</button>
        <button class="btn-secondary" onclick="compartirImagen()">📸 Compartir imagen</button>
        <button class="btn-secondary" onclick="showTab('torneo')">🏆 Clasificación</button>
        <button class="btn-primary ra-full" onclick="goMenu()">Volver al inicio</button>
      </div>
      ${torneoEsGTA() ? '<div class="ta-legal">Torneo no oficial, sin relación con Rockstar Games.</div>' : ''}
    </div>`;
  document.getElementById('result-hero').classList.add('evento');
  showScreen('screen-result');
  playFinish();
}

// Resultado de repetir un torneo CERRADO: la partida no puntúa, pero se queda como «repetición» y se
// dice dónde habría quedado en el podio de verdad. Desde aquí se invita a otros a jugarlo.
function mostrarResultadoRepeticion(c, puntos, aciertos, total, pct) {
  const t = torneoRep;
  const oficial = (c.clasificacion || torneoTabla || []).filter(f => !f.autor);
  const habria = oficial.length
    ? `Con esta marca habrías sido <strong>${oficial.filter(f => Number(f.puntos) > puntos).length + 1}º</strong> en el torneo (lo jugaron ${oficial.length} ${oficial.length === 1 ? 'persona' : 'personas'}).`
    : '';
  const mejor = c.mejor === undefined ? ''
    : c.primera ? '✅ Anotada como tu primera repetición de este torneo.'
    : c.record ? '🎉 <strong>Nuevo récord</strong> en tus repeticiones.'
    : `Tu mejor repetición sigue siendo de <strong>${Number(c.mejor).toLocaleString()}</strong> puntos.`;
  const hayPodioActual = torneo && torneo.slug === t.slug;
  const texto = `🏆 ${t.titulo}\n🔁 He hecho ${puntos.toLocaleString('es-ES')} puntos · ${aciertos} de ${total} (el torneo ya cerró, esto es una repetición).\n\n`
    + `¿Te atreves? Son las mismas preguntas y no puntúa en la clasificación.\n${window.location.href.split(/[?#]/)[0]}?torneo=${encodeURIComponent(t.slug)}`;
  torneoSoltarModo();
  torneoBannerPractica(false);
  if (c.clasificacion && hayPodioActual) torneoTabla = c.clasificacion;
  document.getElementById('result-hero').classList.remove('evento');
  document.getElementById('result-hero').innerHTML = `
    <div style="font-size:40px;margin-bottom:0.5rem">🔁</div>
    <div class="result-rank">Repetición terminada</div>
    <div class="rh-etiqueta">${esc(t.titulo)}</div>
    <div><span class="result-score-num">${puntos.toLocaleString()}</span></div>
    <div class="rh-pts">puntos · ${aciertos} de ${total} correctas · ${pct}%</div>
    <div class="result-msg">${habria ? habria + '<br>' : ''}${mejor ? mejor + '<br>' : ''}<strong>Esta partida no puntúa</strong> ni cambia el podio: se queda anotada como repetición.</div>
    <div class="result-actions" style="margin-top:1.5rem">
      <button class="btn-whatsapp ra-full" onclick="compartirWhatsApp(torneoTextoRepeticion)">💬 Invitar a un amigo a jugarlo</button>
      <button class="btn-secondary" onclick="repetirTorneo(torneoNombreReal, true, torneoJugando())">🔁 Otra vez</button>
      ${hayPodioActual ? '<button class="btn-secondary" onclick="showTab(\'torneo\')">🏆 Podio</button>' : ''}
      <button class="btn-primary ra-full" onclick="goMenu()">Volver al inicio</button>
    </div>
    ${repeticionesHTML((c.repeticiones || []).slice(0, 5), torneoNombreReal)}`;
  torneoTextoRepeticion = texto;
  showScreen('screen-result');
  playFinish();
}

// El mensaje que manda el jugador al terminar. Va en primera persona y RETA a quien lo
// recibe: es el que de verdad trae gente al torneo, porque pica más la nota de un amigo
// que una invitación. Por eso dice la marca y luego desafía, en vez de solo informar.
function textoTorneo() {
  const total = torneoTotal;
  const url = window.location.href.split('?')[0];
  const t = torneo ? torneo.titulo : 'Torneo GeoQuiz';
  return `🏆 ${t}\n⭐ He hecho ${score.toLocaleString("es-ES")} puntos · ${correct} de ${total}\n\n`
    + `Te reto a superarme. Aviso: solo se juega una vez, no hay segunda oportunidad.\n${url}`;
}

// ── CLASIFICACIÓN ─────────────────────────────────────────────────────────
async function renderTorneo() {
  const div = document.getElementById('screen-torneo');
  div.innerHTML = '<div class="no-records">Cargando el torneo…</div>';
  const res = await gqFetch(GQ_TORNEO_API, { method: 'GET' });
  if (res.ok && res.cuerpo && res.cuerpo.torneo) {
    torneo = res.cuerpo.torneo;
    torneoTabla = res.cuerpo.clasificacion || [];
    torneoRepes = res.cuerpo.repeticiones || [];
  } else if (!torneo) {
    div.innerHTML = '<div class="no-records">No hay ningún torneo ahora mismo.</div>';
    return;
  }

  const activo = torneo.estado === 'activo';
  const r = activo ? torneoRestante(torneo.acaba_en) : null;
  const yoMote = (torneoJugadoAqui(torneo.slug) || torneoMiMote()).toLowerCase();

  // Cabecera con la ilustración del torneo: título, de qué va, cuánto queda y, si aún no se
  // ha jugado desde este móvil, el botón de entrar (la portada lo tiene, pero aquí también
  // se llega: desde la barra de abajo o desde un enlace).
  const yaJugo = !!torneoJugadoAqui(torneo.slug);
  const botonJugar = activo && !yaJugo
    ? `<button class="ta-jugar" onclick="jugarTorneo()">${torneoEstado === 'enCurso' ? 'Continuar la partida' : 'Jugar el torneo'}</button>`
    : '';
  const cab = `<div class="tn-hero">
    <div class="ta-arte" aria-hidden="true"></div>
    <div class="ta-cuerpo">
      <div class="ta-eyebrow">${esc(torneoRotulo())}</div>
      <h2 class="ta-titulo${torneoEsGTA() ? ' ta-gta' : ''}">${esc(torneo.titulo)}</h2>
      ${torneo.tema ? `<p class="ta-tema">${esc(torneo.tema)}</p>` : ''}
      <div class="ta-datos">
        <span class="ta-chip${activo && r ? ' ta-reloj' : ''}">${activo && r ? 'Quedan ' + esc(r) : 'Terminado'}</span>
        <span class="ta-chip">${esc(torneo.n_preguntas || 15)} preguntas · 1 intento</span>
      </div>
      ${botonJugar}
      ${torneoEsGTA() ? '<div class="ta-legal">Torneo no oficial, sin relación con Rockstar Games.</div>' : ''}
    </div>
  </div>`;

  // Mientras está abierto, lo útil es traer gente; cuando cierra, enseñar el podio. Un torneo cerrado
  // también se puede volver a jugar (sin puntuar) y se puede invitar a quien no estuvo.
  const pie = activo
    ? '<button class="invitar-btn" onclick="retarAlTorneo()">💬 Retar a alguien por WhatsApp</button>'
    : '<button class="clear-btn clear-oro" onclick="compartirWhatsApp(textoPodio())">🏆 Compartir el podio</button>'
      + `<button class="invitar-btn" onclick="repetirTorneo(null, false, torneo)">🔁 Jugarlo otra vez (sin puntuar)</button>`
      + `<button class="invitar-btn" onclick="torneoInvitar('${esc(torneo.slug)}')">📨 Invitar a alguien a jugarlo</button>`
      + repeticionesHTML(torneoRepes, torneoMiMote());

  if (!torneoTabla.length) {
    div.innerHTML = cab + '<div class="no-records">Todavía no ha jugado nadie.<br>¡Sé el primero!</div>' + pie;
    return;
  }

  // Quien escribe las preguntas va fuera de concurso: su fila baja al final, sin número y
  // atenuada. Se sigue viendo —es parte de la gracia saber cuánto hizo el que las puso—
  // pero no ocupa el podio de los demás.
  const enLiza = torneoTabla.filter(e => !e.autor);
  const autores = torneoTabla.filter(e => e.autor);
  const esMio = e => !!yoMote && String(e.nombre).toLowerCase() === yoMote;
  const inicial = n => (Array.from(String(n).trim())[0] || '?').toUpperCase();
  const detalle = e => `${esc(e.correctas)}/${esc(e.total)} · ${esc(tiempoCorto(e.segundos))}`;

  // Podio: primero en el centro y más alto, segundo a su izquierda y tercero a su derecha.
  const top = enLiza.slice(0, 3);
  const orden = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
  const columna = i => {
    const e = top[i];
    return `<div class="pd pd${i + 1}${esMio(e) ? ' yo' : ''}">
      <div class="pd-medalla">${MEDALLAS[i]}</div>
      <div class="pd-avatar">${esc(inicial(e.nombre))}</div>
      <div class="pd-nombre">${esc(e.nombre)}</div>
      <div class="pd-puntos">${esc(Number(e.puntos).toLocaleString())}</div>
      <div class="pd-det">${detalle(e)}</div>
      <div class="pd-base"></div>
    </div>`;
  };
  const podio = `<div class="podio">${orden.map(columna).join('')}</div>`;

  const fila = e => `<div class="tn-fila${e.autor ? ' autor' : ''}${esMio(e) ? ' yo' : ''}">
    <div class="tn-pos">${e.autor ? '<span title="Fuera de concurso">✎</span>' : esc(e.pos)}</div>
    <div class="tn-nom"><div class="tn-n">${esc(e.nombre)}${esMio(e) ? ' <span class="tn-tu">tú</span>' : ''}</div><div class="tn-sub">${e.autor ? 'fuera de concurso · ' : ''}${detalle(e)}</div></div>
    <div class="tn-pts">${esc(Number(e.puntos).toLocaleString())}</div>
  </div>`;
  const resto = enLiza.slice(3).concat(autores);
  div.innerHTML = cab
    + (top.length ? `<p class="section-label tn-titulo-sec">Clasificación</p>${podio}` : '')
    + (resto.length ? `<div class="tn-lista">${resto.map(fila).join('')}</div>` : '')
    + pie;
}

// El final del torneo es lo que vende el siguiente, así que el podio sale listo para pegar.
function textoPodio() {
  const url = window.location.href.split('?')[0];
  // Sin los que van fuera de concurso: el podio que se manda al grupo es el de verdad.
  const enLiza = torneoTabla.filter(e => !e.autor);
  const t = torneo ? torneo.titulo : 'Torneo GeoQuiz';
  if (!enLiza.length) return `🏆 ${t}\n\nEsta semana no jugó nadie. La próxima, otro:\n${url}`;

  const podio = enLiza.slice(0, 3)
    .map((e, i) => `${['🥇', '🥈', '🥉'][i]} ${e.nombre} — ${Number(e.puntos).toLocaleString("es-ES")}`)
    .join('\n');
  // Felicitar al ganador por su nombre es lo que convierte la tabla en un titular. El
  // recuento se mantiene porque es lo que empuja a jugar la semana siguiente: ver que
  // fueron catorce y tú no estabas.
  const cuantos = enLiza.length === 1 ? 'Jugó una sola persona.' : `Jugaron ${enLiza.length}.`;
  return `🏆 ${t}\n\n${podio}\n\n¡Enhorabuena, ${enLiza[0].nombre}! ${cuantos}\nLa semana que viene, otro:\n${url}`;
}

// ── CUENTA ATRÁS DEL ESTRENO DE GTA VI ───────────────────────────────────
// 00:00 del jueves 19/11/2026 en Madrid (CET, UTC+1) = 23:00 UTC del miércoles.
// Solo sale en el aviso, cuando el torneo es de GTA y sigue abierto. No toca la API.
const ESTRENO_GTA6 = Date.UTC(2026, 10, 18, 23, 0, 0);
let estrenoInt = null;

function estrenoRestanteMs() { return ESTRENO_GTA6 - Date.now(); }

function estrenoPintar() {
  const caja = document.getElementById('ta-estreno');
  if (!caja) return;
  if (!torneo || torneo.estado !== 'activo' || !torneoEsGTA()) { caja.classList.remove('show'); clearInterval(estrenoInt); return; }
  const ms = estrenoRestanteMs();
  const cif = document.getElementById('te-cifras'), rot = document.getElementById('te-rotulo');
  caja.classList.add('show');
  if (ms <= 0) {
    rot.textContent = 'GTA VI';
    cif.innerHTML = '<div class="te-ya">¡Ya está aquí!</div>';
    clearInterval(estrenoInt);
    return;
  }
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600),
        m = Math.floor(s % 3600 / 60), seg = s % 60;
  const celda = (n, t) => `<div class="te-celda"><span class="te-num">${String(n).padStart(2, '0')}</span><span class="te-eti">${t}</span></div>`;
  rot.textContent = 'Faltan para el estreno de GTA VI';
  cif.innerHTML = celda(d, 'DÍAS') + celda(h, 'HORAS') + celda(m, 'MIN') + celda(seg, 'SEG');
}

function estrenoIniciar() {
  clearInterval(estrenoInt);
  estrenoPintar();
  if (estrenoRestanteMs() > 0) estrenoInt = setInterval(estrenoPintar, 1000);
}
