// GeoQuiz — pestaña PERFIL (antes «Récords»): tu historial, en tu cuenta o en este dispositivo.
//
// Muestra quién eres, cuántas partidas, torneos y duelos llevas, tu mejor partida, si estás suscrito a
// los avisos por correo y cómo ponerlo en la pantalla de inicio. Los récords de siempre siguen ahí, en
// una segunda pestaña dentro de Perfil.
//
// CON CUENTA (js/cuenta.js: nombre + correo + código por correo) el historial se guarda en el
// servidor y se suma entre dispositivos. Para que dos móviles no se pisen, cada dispositivo guarda SU
// parte (una «entrada» con su id y la hora de su último cambio) y lo que se enseña es la suma de todas.
// Sin cuenta, solo cuenta la entrada de este dispositivo, como antes.
//
// Autónomo a propósito, como avisos.js: no edita las pantallas ni los otros scripts. Se engancha
// envolviendo cuatro funciones que ya existen (saveRecord, mostrarResultadoDuelo,
// mostrarResultadoTorneo, renderRecords) y lleva su propio estilo.
(function () {
  const CLAVE = 'gq_stats';
  let subtab = 'perfil';
  let remoto = { v: 2, dispositivos: {} }; // lo último que se sabe del servidor (solo con sesión)

  const PERFIL_MODOS = ['solo', 'blitz', 'survival', 'crono', 'fechas'];
  const aleatorio = () => Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');

  // ── La entrada de ESTE dispositivo ──
  function nueva() {
    return { dev: aleatorio(), desde: new Date().toISOString(), act: '', partidas: 0, modos: {}, hist: [], torneos: {}, duelos: { jugados: 0, ganados: 0, empatados: 0, perdidos: 0, contados: [], hist: [] } };
  }
  function leer() {
    try {
      const s = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (s && typeof s === 'object') {
        if (!s.dev) s.dev = aleatorio();
        if (!s.duelos) s.duelos = nueva().duelos;
        s.modos = s.modos || {}; s.hist = s.hist || []; s.torneos = s.torneos || {};
        return s;
      }
    } catch (e) { /* se parte de cero */ }
    return nueva();
  }
  function guardar(s) {
    s.act = new Date().toISOString();
    try { localStorage.setItem(CLAVE, JSON.stringify(s)); } catch (e) { /* sin almacenamiento */ }
    sincronizarPronto();
  }

  // Torneos jugados: salen de las marcas que ya deja torneo.js (una por torneo y dispositivo), así
  // que cuentan también los de antes de este perfil.
  function torneosJugados() {
    const slugs = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const m = /^gq_torneo_(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)$/.exec(localStorage.key(i) || '');
        if (m) slugs.push(m[1]);
      }
    } catch (e) { /* nada */ }
    return slugs.sort();
  }

  // La entrada tal como se sube al servidor: lo guardado más lo que se deduce del dispositivo.
  function entradaLocal() {
    const s = leer();
    if (!s.act) s.act = new Date().toISOString();
    return Object.assign({}, s, {
      torneosJugados: torneosJugados(),
      records: (typeof getRecords === 'function' ? getRecords() : []).slice(0, 10),
    });
  }

  // ── Suma de todos los dispositivos ──
  function vista() {
    const mine = entradaLocal();
    const disp = Object.assign({}, gqCuenta.iniciada() ? remoto.dispositivos : {}, { [mine.dev]: mine });
    const v = { desde: '', partidas: 0, modos: {}, duelos: { jugados: 0, ganados: 0, empatados: 0, perdidos: 0, hist: [] }, hist: [], torneos: {}, slugs: [], records: [], dispositivos: 0 };
    const slugs = new Set();
    for (const e of Object.values(disp)) {
      if (!e || typeof e !== 'object') continue;
      v.dispositivos++;
      if (e.desde && (!v.desde || e.desde < v.desde)) v.desde = e.desde;
      v.partidas += Number(e.partidas) || 0;
      for (const [m, n] of Object.entries(e.modos || {})) v.modos[m] = (v.modos[m] || 0) + (Number(n) || 0);
      const d = e.duelos || {};
      for (const k of ['jugados', 'ganados', 'empatados', 'perdidos']) v.duelos[k] += Number(d[k]) || 0;
      v.duelos.hist = v.duelos.hist.concat(d.hist || []);
      v.hist = v.hist.concat(e.hist || []);
      (e.torneosJugados || []).forEach(sl => slugs.add(sl));
      for (const [sl, t] of Object.entries(e.torneos || {})) {
        slugs.add(sl);
        if (!v.torneos[sl] || String(t.f) > String(v.torneos[sl].f)) v.torneos[sl] = t;
      }
      v.records = v.records.concat(e.records || []);
    }
    v.slugs = Array.from(slugs).sort();
    v.hist.sort((a, b) => String(a.f).localeCompare(String(b.f)));
    v.duelos.hist.sort((a, b) => String(a.f).localeCompare(String(b.f)));
    v.records.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    return v;
  }

  // ── Sincronización con la cuenta ──
  let temporizador = null;
  function sincronizarPronto() {
    if (!gqCuenta.iniciada()) return;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => sincronizar(), 2500);
  }
  async function sincronizar(statsConocidas) {
    const sesion = gqCuenta.sesion();
    if (!sesion) return;
    let base = statsConocidas;
    if (base === undefined) {
      const r = await gqCuenta.api('perfil', { sesion });
      if (r.estado === 401) { gqCuenta.sesionInvalida(); return; }
      if (!r.ok) return; // sin conexión: se intentará en la próxima
      base = r.cuerpo.stats;
    }
    const rem = base && base.dispositivos ? base : { v: 2, dispositivos: {} };
    const mine = entradaLocal();
    const previa = rem.dispositivos[mine.dev];
    if (!previa || String(previa.act || '') <= String(mine.act)) rem.dispositivos[mine.dev] = mine;
    remoto = rem;
    repintar();
    const g = await gqCuenta.api('guardar', { sesion, stats: rem });
    if (g.estado === 401) gqCuenta.sesionInvalida();
  }
  function repintar() {
    const r = document.getElementById('screen-records');
    if (r && r.classList.contains('active')) window.renderRecords();
  }
  gqCuenta.alEntrar = stats => { sincronizar(stats || null); };
  gqCuenta.alSalir = (limpiar) => {
    remoto = { v: 2, dispositivos: {} };
    if (limpiar) {
      // En un dispositivo compartido, al salir no debe quedar el perfil de la persona anterior.
      try { localStorage.removeItem(CLAVE); } catch (e) { /* nada */ }
      gqGuardarNombre('');
    }
    repintar();
  };

  // ── Contadores ──
  const saveRecordOriginal = window.saveRecord;
  window.saveRecord = function (r) {
    const res = saveRecordOriginal.apply(this, arguments);
    try {
      const s = leer();
      s.partidas = (s.partidas || 0) + 1;
      const m = r && r.mode;
      if (m) s.modos[m] = (s.modos[m] || 0) + 1;
      s.hist = (s.hist || []).concat({ f: new Date().toISOString(), modo: m, puntos: r.score, aciertos: r.correct, total: r.total, dif: r.diff }).slice(-30);
      guardar(s);
    } catch (e) { /* un fallo aquí no debe tumbar el final de partida */ }
    return res;
  };

  const duelOriginal = window.mostrarResultadoDuelo;
  window.mostrarResultadoDuelo = function () {
    const res = duelOriginal.apply(this, arguments);
    try {
      const s = leer();
      const id = (typeof duelCodigo !== 'undefined' && duelCodigo) ? String(duelCodigo) : '';
      if (!id || !s.duelos.contados.includes(id)) {
        s.duelos.jugados++;
        if (duelo.ganador === 0) s.duelos.empatados++;
        else if (duelo.ganador === duelMiLado) s.duelos.ganados++;
        else s.duelos.perdidos++;
        if (id) s.duelos.contados = s.duelos.contados.concat(id).slice(-200);
        const soyJ1 = duelMiLado === 1;
        s.duelos.hist = (s.duelos.hist || []).concat({ f: new Date().toISOString(), rival: (soyJ1 ? duelo.j2_nombre : duelo.j1_nombre) || 'Rival', res: duelo.ganador === 0 ? 'empate' : (duelo.ganador === duelMiLado ? 'gana' : 'pierde'), aciertos: soyJ1 ? duelo.j1_aciertos : duelo.j2_aciertos }).slice(-30);
        guardar(s);
      }
    } catch (e) { /* idem */ }
    return res;
  };

  const torneoOriginal = window.mostrarResultadoTorneo;
  window.mostrarResultadoTorneo = function () {
    const res = torneoOriginal.apply(this, arguments);
    try {
      const s = leer();
      const c = (typeof torneoCierreDatos !== 'undefined' && torneoCierreDatos) || {};
      const slug = partida && partida.torneo;
      if (slug) {
        s.torneos[slug] = { f: new Date().toISOString(), puntos: c.puntos !== undefined ? c.puntos : score, pos: c.pos || null, aciertos: c.aciertos !== undefined ? c.aciertos : correct, total: (typeof torneoTotal !== 'undefined' && torneoTotal) || c.total || 0 };
        guardar(s);
      }
    } catch (e) { /* idem */ }
    return res;
  };

  // ── Instalar en la pantalla de inicio ──
  // Chrome/Edge en Android y escritorio avisan con 'beforeinstallprompt' y dejan lanzar la instalación
  // desde un botón; Safari de iPhone no tiene botón posible, solo se le pueden dar los pasos.
  let instalar = null;
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); instalar = ev; repintar(); });
  window.addEventListener('appinstalled', () => { instalar = null; repintar(); });
  const yaInstalada = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  window.gqInstalar = async function () {
    if (!instalar) return;
    instalar.prompt();
    try { await instalar.userChoice; } catch (e) { /* nada */ }
    instalar = null;
    repintar();
  };
  function bloqueInstalar() {
    if (yaInstalada()) return '';
    const ua = navigator.userAgent || '';
    const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /android/i.test(ua);
    let pasos;
    if (instalar) pasos = 'Pulsa el botón y GeoQuiz se añadirá a tu pantalla de inicio, sin descargar nada de ninguna tienda.';
    else if (ios) pasos = 'En Safari, pulsa el botón <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba) y elige <strong>«Añadir a pantalla de inicio»</strong>.';
    else if (android) pasos = 'En Chrome, pulsa los tres puntos <strong>⋮</strong> y elige <strong>«Instalar aplicación»</strong> o <strong>«Añadir a pantalla de inicio»</strong>.';
    else pasos = 'En Chrome o Edge, busca el icono de instalar en la barra de direcciones, o abre el menú y elige <strong>«Instalar GeoQuiz»</strong>.';
    return `<div class="pf-bloque"><h3>📲 Ponlo en tu pantalla de inicio</h3>
      <div>Entra a GeoQuiz con un toque, como una app, a pantalla completa y sin buscar la dirección.</div>
      <div class="pf-nota">${pasos}</div>
      ${instalar ? '<button class="pf-btn" type="button" onclick="gqInstalar()">Instalar GeoQuiz</button>' : ''}</div>`;
  }

  // ── Pintado ──
  function estilo() {
    if (document.getElementById('pf-estilo')) return;
    const s = document.createElement('style');
    s.id = 'pf-estilo';
    s.textContent = `
      .pf-sub{display:flex;gap:8px;margin-bottom:14px}
      .pf-sub button{flex:1;padding:10px 12px;border-radius:12px;cursor:pointer;font:600 14px 'Inter',sans-serif;
        background:transparent;color:var(--muted);border:1px solid rgba(255,255,255,.16)}
      .pf-sub button.on{background:rgba(201,168,76,.16);color:var(--text,#fff);border-color:rgba(201,168,76,.55)}
      .pf-cab{display:flex;align-items:center;gap:14px;margin-bottom:16px}
      .pf-avatar{flex:none;width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        font:700 24px 'Inter',sans-serif;color:#1b1405;background:var(--oro,#c9a84c)}
      .pf-nombre{font-weight:700;font-size:18px}
      .pf-desde{color:var(--muted);font-size:12px}
      .pf-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
      .pf-cifra{padding:14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
      .pf-cifra b{display:block;font-size:26px;line-height:1.1;color:var(--accent,#c9a84c)}
      .pf-cifra span{font-size:12px;color:var(--muted)}
      .pf-bloque{padding:14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);margin-bottom:12px;font-size:14px}
      .pf-bloque h3{margin:0 0 8px;font-size:14px}
      .pf-fila{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06)}
      .pf-fila:last-child{border-bottom:0}
      .pf-fila span:last-child{font-weight:600}
      .pf-nota{color:var(--muted);font-size:12px;line-height:1.5;margin-top:6px}
      .pf-suscr{border-color:rgba(201,168,76,.4);background:rgba(201,168,76,.08)}
      .pf-suscr.ok{border-color:rgba(120,220,150,.5);background:rgba(120,220,150,.08)}
      .pf-link{padding:6px 10px;border-radius:10px;cursor:pointer;font:600 13px 'Inter',sans-serif;background:transparent;
        color:var(--muted);border:1px solid rgba(255,255,255,.2);margin:6px 6px 0 0}
      .pf-hist{font-size:13px}
      .pf-hist .pf-fila span:first-child{color:var(--muted)}
      .pf-vel{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;
        background:rgba(5,3,14,.78);backdrop-filter:blur(3px)}
      .pf-caja{box-sizing:border-box;width:100%;max-height:92vh;overflow:auto;padding:20px;border-radius:18px;background:#161226;
        border:1px solid rgba(201,168,76,.4);font-size:14px;line-height:1.5}
      .pf-txt{color:var(--muted);margin-bottom:14px}
      .pf-sec{display:block;width:100%;border-radius:12px;padding:12px 16px;cursor:pointer;background:transparent;color:var(--text,#fff);
        border:1px solid rgba(255,255,255,.28);font:600 14px 'Inter',sans-serif;margin-top:8px}
      .pf-sec:hover{background:rgba(255,255,255,.08)}
      .pf-bv{max-width:460px;text-align:center}
      .pf-bv .pf-bloque{text-align:left}
      .pf-bv-ico{font-size:40px;margin-bottom:4px}
      .pf-btn{display:block;width:100%;margin-top:10px;border:0;border-radius:12px;padding:12px 16px;cursor:pointer;
        font:700 14px 'Inter',sans-serif;background:var(--oro,#c9a84c);color:#1b1405}
    `;
    document.head.appendChild(s);
  }

  function fecha(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('es-ES');
  }

  function bloqueSuscripcion() {
    const a = window.gqAvisos;
    if (!a || !a.disponible()) return '';
    const e = a.estado();
    const ok = e === 'confirmado';
    const texto = ok ? '✅ Estás suscrito a los avisos por correo.'
      : e === 'pedido' ? '⏳ Te apuntaste en este dispositivo, falta confirmar el correo (mira en spam).'
      : '📬 No estás suscrito a los avisos por correo.';
    const detalle = ok ? 'Te avisaremos de los torneos semanales, las preguntas nuevas y los nuevos modos de juego.'
      : 'Suscríbete y te avisamos de los torneos semanales, las preguntas nuevas y los nuevos modos de juego.';
    return `<div class="pf-bloque pf-suscr${ok ? ' ok' : ''}"><h3>Avisos por correo</h3>
      <div>${texto}</div><div class="pf-nota">${detalle}</div>
      <button class="pf-btn" type="button" onclick="gqAvisos.panel()">${ok ? 'Ver mi suscripción' : e === 'pedido' ? 'Reenviar o comprobar' : 'Suscribirme'}</button></div>`;
  }

  function etiquetaTorneo(slug) {
    const m = /^(\d{4})-(\d{2})-(\d{2})-(.+)$/.exec(slug);
    return m ? `${m[3]}/${m[2]}/${m[1]} · ${m[4].replace(/-/g, ' ')}` : slug;
  }
  function dia(iso) { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }); }
  function historial(v) {
    const out = [];
    if (v.slugs.length) {
      out.push('<div class="pf-bloque pf-hist"><h3>Historial de torneos</h3>' + v.slugs.slice().reverse().map(sl => {
        const t = v.torneos[sl];
        const dato = t ? `${esc(Number(t.puntos).toLocaleString())} pts` + (t.pos ? ` · ${esc(t.pos)}º` : '') : 'jugado';
        return `<div class="pf-fila"><span>${esc(etiquetaTorneo(sl))}</span><span>${dato}</span></div>`;
      }).join('') + '</div>');
    }
    const h = v.hist.slice(-10).reverse();
    if (h.length) {
      out.push('<div class="pf-bloque pf-hist"><h3>Últimas partidas</h3>' + h.map(e => `<div class="pf-fila"><span>${esc(dia(e.f))} · ${esc(modeLabel(e.modo))}</span><span>${esc(Number(e.puntos).toLocaleString())} pts</span></div>`).join('') + '</div>');
    }
    const dh = v.duelos.hist.slice(-10).reverse();
    if (dh.length) {
      out.push('<div class="pf-bloque pf-hist"><h3>Últimos duelos</h3>' + dh.map(e => `<div class="pf-fila"><span>${esc(dia(e.f))} · contra ${esc(e.rival)}</span><span>${e.res === 'gana' ? '🏆 ganado' : e.res === 'empate' ? '🤝 empate' : 'perdido'}</span></div>`).join('') + '</div>');
    }
    return out.join('');
  }

  // ── Acciones de los botones del Perfil ──
  window.gqPerfilAcceso = function (modo) { gqCuenta.abrir(modo, gqNombreGuardado()); };

  window.gqPerfilNombre = async function () {
    const n = prompt('Tu nombre de jugador:', gqNombreGuardado());
    if (n === null) return;
    if (gqCuenta.iniciada()) {
      const r = await gqCuenta.cambiarNombre(n.trim());
      if (r.ok) toast('Nombre cambiado: ' + r.cuerpo.nombre);
      else toast((r.cuerpo && r.cuerpo.mensaje) || 'No se ha podido cambiar el nombre.');
    } else {
      const g = gqGuardarNombre(n);
      if (g) toast('Nombre guardado: ' + g);
    }
    repintar();
  };
  window.gqPerfilQuitarNombre = function () {
    if (confirm('¿Quitar tu nombre de este dispositivo? La próxima vez te lo preguntarán de nuevo.')) { gqGuardarNombre(''); repintar(); }
  };
  window.gqPerfilSalir = async function () {
    if (!confirm('¿Cerrar sesión en este dispositivo? Tu historial se queda guardado en tu cuenta y vuelve cuando entres.')) return;
    await gqCuenta.salir();
    toast('Sesión cerrada');
  };
  window.gqPerfilBorrar = async function () {
    if (!confirm('¿Borrar tu cuenta? Se eliminan tu correo, tu nombre y tu historial guardado. No se puede deshacer.')) return;
    const r = await gqCuenta.borrar();
    toast(r.ok ? 'Cuenta borrada' : 'No se ha podido borrar. Prueba más tarde.');
  };

  function bloqueCuenta() {
    if (gqCuenta.iniciada()) {
      return `<div class="pf-bloque"><h3>☁️ Tu cuenta</h3>
        <div>Sesión iniciada en este dispositivo. Tu historial se guarda en tu cuenta y se suma entre todos tus dispositivos.</div>
        <button class="pf-link" type="button" onclick="gqPerfilSalir()">Cerrar sesión</button><button class="pf-link" type="button" onclick="gqPerfilBorrar()">Borrar mi cuenta</button></div>`;
    }
    return `<div class="pf-bloque pf-suscr"><h3>☁️ Guarda tu perfil</h3>
      <div>Con tu nombre y tu correo guardamos tu historial y entras desde cualquier dispositivo. Sin contraseña: te mandamos un código.</div>
      <button class="pf-btn" type="button" onclick="gqPerfilAcceso('crear')">Crear mi perfil</button>
      <button class="pf-sec" type="button" onclick="gqPerfilAcceso('entrar')">Ya tengo perfil</button>
      ${gqNombreGuardado() ? '' : '<div class="pf-nota">Si prefieres, también puedes <a href="#" onclick="gqPerfilNombre();return false" style="color:var(--accent)">guardar solo un nombre en este dispositivo</a>.</div>'}</div>`;
  }

  function htmlPerfil() {
    const v = vista();
    const mote = gqNombreGuardado();
    const d = v.duelos;
    const mejor = v.records[0];
    const nube = gqCuenta.iniciada();
    const filaModo = m => v.modos[m] ? `<div class="pf-fila"><span>${esc(modeLabel(m))}</span><span>${esc(v.modos[m])}</span></div>` : '';
    const modos = PERFIL_MODOS.map(filaModo).join('');
    return `
      <div class="pf-cab">
        <div class="pf-avatar">${esc((mote || '?').trim().charAt(0).toUpperCase() || '?')}</div>
        <div><div class="pf-nombre">${esc(mote || 'Jugador sin nombre')}</div>
        <div class="pf-desde">${nube ? '☁️ Guardado en tu cuenta' : 'Solo en este dispositivo'}${v.desde ? ' · desde el ' + esc(fecha(v.desde)) : ''}</div>
        ${mote ? `<button class="pf-link" type="button" onclick="gqPerfilNombre()">Cambiar nombre</button>${nube ? '' : '<button class="pf-link" type="button" onclick="gqPerfilQuitarNombre()">Quitar</button>'}` : ''}</div>
      </div>
      ${bloqueCuenta()}
      <div class="pf-grid">
        <div class="pf-cifra"><b>${esc(v.partidas)}</b><span>partidas jugadas</span></div>
        <div class="pf-cifra"><b>${esc(v.slugs.length)}</b><span>torneos jugados</span></div>
        <div class="pf-cifra"><b>${esc(d.jugados)}</b><span>duelos jugados</span></div>
        <div class="pf-cifra"><b>${esc(d.ganados)}</b><span>duelos ganados</span></div>
      </div>
      ${bloqueSuscripcion()}
      ${bloqueInstalar()}
      ${mejor ? `<div class="pf-bloque"><h3>Tu mejor partida</h3>
        <div class="pf-fila"><span>Puntos</span><span>${esc(Number(mejor.score).toLocaleString())}</span></div>
        <div class="pf-fila"><span>Modo</span><span>${esc(modeLabel(mejor.mode))}</span></div>
        <div class="pf-fila"><span>Fecha</span><span>${esc(mejor.date)}</span></div></div>` : ''}
      ${modos ? `<div class="pf-bloque"><h3>Partidas por modo</h3>${modos}</div>` : ''}
      ${d.jugados ? `<div class="pf-bloque"><h3>Duelos</h3>
        <div class="pf-fila"><span>Ganados</span><span>${esc(d.ganados)}</span></div>
        <div class="pf-fila"><span>Empatados</span><span>${esc(d.empatados)}</span></div>
        <div class="pf-fila"><span>Perdidos</span><span>${esc(d.perdidos)}</span></div></div>` : ''}
      ${historial(v)}
      <div class="pf-nota">${nube
        ? 'Tu historial se guarda en tu cuenta y se suma entre tus dispositivos. Las partidas anteriores a la primera visita con esta versión no cuentan.'
        : 'Estas cifras se guardan solo en este dispositivo: si cambias de móvil o borras los datos del navegador, empiezas de cero. Crea tu perfil para no perderlas. Las partidas anteriores a la primera visita con esta versión no cuentan.'}</div>`;
  }

  const recordsOriginal = window.renderRecords;
  window.renderRecords = function () {
    estilo();
    recordsOriginal.apply(this, arguments);
    const div = document.getElementById('screen-records');
    const records = div.innerHTML;
    const tabs = `<div class="pf-sub"><button type="button" class="${subtab === 'perfil' ? 'on' : ''}" data-t="perfil">👤 Perfil</button>`
      + `<button type="button" class="${subtab === 'records' ? 'on' : ''}" data-t="records">🏅 Récords</button></div>`;
    div.innerHTML = tabs + (subtab === 'perfil' ? htmlPerfil() : records);
    div.querySelectorAll('.pf-sub button').forEach(b => {
      b.onclick = () => { subtab = b.dataset.t; window.renderRecords(); };
    });
    // Al abrir el Perfil con sesión se refresca desde el servidor (otro dispositivo puede haber jugado).
    if (subtab === 'perfil' && gqCuenta.iniciada() && !window.renderRecords.sincronizando) {
      window.renderRecords.sincronizando = true;
      sincronizar().finally(() => { window.renderRecords.sincronizando = false; });
    }
  };

  // ── Pantalla de bienvenida: crear perfil, entrar en el que ya tienes o jugar sin registrarse ──
  // Sale UNA vez, a quien no tiene sesión ni nombre guardado. «Jugar sin registrarme» también cuenta
  // como decisión y no se vuelve a preguntar (el Perfil sigue ofreciendo crear el perfil). No sale si
  // la persona llega desde un reto o una invitación a duelo: esa gente viene a algo concreto.
  function bienvenidaPerfil() {
    try { if (localStorage.getItem('gq_perfil_decidido')) return; } catch (e) { /* sin almacenamiento: se pregunta siempre */ }
    if (gqCuenta.iniciada() || gqNombreGuardado()) return;
    const reto = document.getElementById('challenge-banner');
    if ((reto && reto.classList.contains('show')) || /[?&](challenge|duelo|codigo|d)=/.test(location.search)) return;
    estilo();
    // La bienvenida pequeña de siempre queda sustituida por esta.
    if (typeof cerrarBienvenida === 'function') cerrarBienvenida();
    const v = document.createElement('div');
    v.className = 'pf-vel';
    v.id = 'pf-vel';
    v.innerHTML = `
      <div class="pf-caja pf-bv" role="dialog" aria-modal="true" aria-labelledby="pf-bv-t">
        <div class="pf-bv-ico">🗺️</div>
        <div class="pf-nombre" id="pf-bv-t" style="font-size:22px;margin-bottom:6px">Bienvenido a GeoQuiz</div>
        <div class="pf-txt">Preguntas de historia, guerras y política mundial para ponerte a prueba. Cada semana hay un <strong>torneo</strong>: las mismas preguntas para todos y una sola partida.</div>
        <div class="pf-bloque" style="margin-bottom:12px">
          <h3>Crea tu perfil</h3>
          <div class="pf-nota" style="margin:0">Con tu nombre y tu correo guardamos tu historial de partidas, torneos y duelos, y entras con tu nombre desde cualquier dispositivo. Sin contraseña: te mandamos un código al correo.</div>
          <button class="pf-btn" type="button" id="pf-bv-crear">Crear mi perfil</button>
          <button class="pf-sec" type="button" id="pf-bv-entrar">Ya tengo perfil</button>
        </div>
        <button class="pf-sec" type="button" id="pf-bv-sin">Jugar sin registrarme</button>
        <div class="pf-nota" style="text-align:center">Puedes crear tu perfil cuando quieras desde la pestaña Perfil.</div>
      </div>`;
    document.body.appendChild(v);
    v.querySelector('#pf-bv-sin').onclick = () => {
      try { localStorage.setItem('gq_perfil_decidido', '1'); } catch (e) { /* nada */ }
      v.remove();
    };
    v.querySelector('#pf-bv-crear').onclick = () => gqCuenta.abrir('crear');
    v.querySelector('#pf-bv-entrar').onclick = () => gqCuenta.abrir('entrar');
  }
  // Un momento después de cargar, para que main.js haya mirado si viene de un reto.
  setTimeout(bienvenidaPerfil, 700);
  // Si ya hay sesión, al abrir el juego se trae lo último de la cuenta.
  if (gqCuenta.iniciada()) setTimeout(() => sincronizar(), 1200);

  // La pestaña se llama Perfil: el botón de la barra decía «Récords».
  const etiqueta = document.querySelector('.nav-btn[onclick="showTab(\'records\')"] span');
  if (etiqueta) etiqueta.textContent = 'Perfil';
  // Cuando avisos.js cambia el estado de la suscripción, el perfil abierto se repinta.
  window.addEventListener('gq-avisos', repintar);
})();
