// GeoQuiz — pestaña PERFIL (antes «Récords»): tu historial en este dispositivo.
//
// Muestra quién eres (el mote), cuántas partidas, torneos y duelos llevas, tu mejor partida y si
// estás suscrito a los avisos por correo. Los récords de siempre siguen ahí, en una segunda
// pestaña dentro de Perfil.
//
// Autónomo a propósito, como avisos.js: no edita las pantallas ni los otros scripts. Se engancha
// envolviendo tres funciones que ya existen (saveRecord, mostrarResultadoDuelo, renderRecords) y
// lleva su propio estilo.
//
// OJO CON LO QUE ES: todo se guarda en el navegador de este dispositivo. Si cambias de móvil o
// borras los datos del navegador, empiezas de cero. Las partidas anteriores a la primera visita
// con esta versión no se pueden contar (el juego no las apuntaba). Una cuenta de verdad, con el
// historial en el servidor, sería otro paso.
(function () {
  const CLAVE = 'gq_stats';
  let subtab = 'perfil';

  const PERFIL_MODOS = ['solo', 'blitz', 'survival', 'crono', 'fechas'];

  function leer() {
    try {
      const s = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (s && typeof s === 'object') return s;
    } catch (e) { /* se parte de cero */ }
    return { desde: new Date().toISOString(), partidas: 0, modos: {}, hist: [], torneos: {}, duelos: { jugados: 0, ganados: 0, empatados: 0, perdidos: 0, contados: [], hist: [] } };
  }
  function guardar(s) { try { localStorage.setItem(CLAVE, JSON.stringify(s)); } catch (e) { /* sin almacenamiento */ } }

  // Torneos jugados: sale de las marcas que ya deja torneo.js (una por torneo y dispositivo), así
  // que cuenta también los de antes de este perfil.
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
        s.torneos = s.torneos || {};
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
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); instalar = ev; refrescarInstalar(); });
  window.addEventListener('appinstalled', () => { instalar = null; refrescarInstalar(); });
  const yaInstalada = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  function refrescarInstalar() {
    const r = document.getElementById('screen-records');
    if (r && r.classList.contains('active')) window.renderRecords();
  }
  window.gqInstalar = async function () {
    if (!instalar) return;
    instalar.prompt();
    try { await instalar.userChoice; } catch (e) { /* nada */ }
    instalar = null;
    refrescarInstalar();
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
      .pf-nom{display:flex;gap:8px;margin-top:8px}
      .pf-nom input{flex:1;min-width:0;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.25);color:inherit;font:inherit}
      .pf-nom button,.pf-link{padding:10px 14px;border-radius:10px;border:0;cursor:pointer;font:700 13px 'Inter',sans-serif;background:var(--oro,#c9a84c);color:#1b1405}
      .pf-link{background:transparent;color:var(--muted);border:1px solid rgba(255,255,255,.2);font-weight:600;padding:6px 10px;margin-left:6px}
      .pf-hist{font-size:13px}
      .pf-hist .pf-fila span:first-child{color:var(--muted)}
      .pf-vel{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;
        background:rgba(5,3,14,.78);backdrop-filter:blur(3px)}
      .pf-caja{box-sizing:border-box;width:100%;max-height:92vh;overflow:auto;padding:20px;border-radius:18px;background:#161226;
        border:1px solid rgba(201,168,76,.4);font-size:14px;line-height:1.5}
      .pf-txt{color:var(--muted);margin-bottom:14px}
      .pf-msg{color:#ffb4a8;font-size:13px;margin-top:6px}
      .pf-msg:empty{display:none}
      .pf-sec{display:block;width:100%;border-radius:12px;padding:12px 16px;cursor:pointer;background:transparent;color:var(--text,#fff);
        border:1px solid rgba(255,255,255,.28);font:600 14px 'Inter',sans-serif;margin-bottom:8px}
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
  function historial(s, torneos) {
    const out = [];
    if (torneos.length) {
      out.push('<div class="pf-bloque pf-hist"><h3>Historial de torneos</h3>' + torneos.slice().reverse().map(sl => {
        const t = (s.torneos || {})[sl];
        const dato = t ? `${esc(Number(t.puntos).toLocaleString())} pts` + (t.pos ? ` · ${esc(t.pos)}º` : '') : 'jugado';
        return `<div class="pf-fila"><span>${esc(etiquetaTorneo(sl))}</span><span>${dato}</span></div>`;
      }).join('') + '</div>');
    }
    const h = (s.hist || []).slice(-10).reverse();
    if (h.length) {
      out.push('<div class="pf-bloque pf-hist"><h3>Últimas partidas</h3>' + h.map(e => `<div class="pf-fila"><span>${esc(dia(e.f))} · ${esc(modeLabel(e.modo))}</span><span>${esc(Number(e.puntos).toLocaleString())} pts</span></div>`).join('') + '</div>');
    }
    const dh = ((s.duelos && s.duelos.hist) || []).slice(-10).reverse();
    if (dh.length) {
      out.push('<div class="pf-bloque pf-hist"><h3>Últimos duelos</h3>' + dh.map(e => `<div class="pf-fila"><span>${esc(dia(e.f))} · contra ${esc(e.rival)}</span><span>${e.res === 'gana' ? '🏆 ganado' : e.res === 'empate' ? '🤝 empate' : 'perdido'}</span></div>`).join('') + '</div>');
    }
    return out.join('');
  }

  // Guardar / cambiar / quitar el nombre desde el Perfil.
  window.gqPerfilNombre = function (guardar) {
    if (!guardar) {
      if (confirm('¿Quitar tu nombre de este dispositivo? Tu historial se conserva; la próxima vez te lo preguntarán de nuevo.')) { gqGuardarNombre(''); window.renderRecords(); }
      return;
    }
    const campo = document.getElementById('pf-nombre-in');
    let n = campo ? campo.value : prompt('Tu nombre de jugador:', gqNombreGuardado());
    n = gqGuardarNombre(n);
    if (!n) { if (campo) campo.focus(); return; }
    toast('Nombre guardado: ' + n);
    window.renderRecords();
  };

  function htmlPerfil() {
    const s = leer();
    const mote = gqNombreGuardado();
    const torneos = torneosJugados();
    const d = s.duelos;
    const recs = typeof getRecords === 'function' ? getRecords() : [];
    const mejor = recs[0];
    const filaModo = m => s.modos[m] ? `<div class="pf-fila"><span>${esc(modeLabel(m))}</span><span>${esc(s.modos[m])}</span></div>` : '';
    const modos = PERFIL_MODOS.map(filaModo).join('');
    return `
      <div class="pf-cab">
        <div class="pf-avatar">${esc((mote || '?').trim().charAt(0).toUpperCase() || '?')}</div>
        <div><div class="pf-nombre">${esc(mote || 'Jugador sin nombre')}</div>
        <div class="pf-desde">Contando desde el ${esc(fecha(s.desde))}${mote ? ' <button class="pf-link" type="button" onclick="gqPerfilNombre(true)">Cambiar</button><button class="pf-link" type="button" onclick="gqPerfilNombre(false)">Quitar</button>' : ''}</div></div>
      </div>
      ${mote ? '' : '<div class="pf-bloque"><h3>Elige tu nombre de jugador</h3><div class="pf-nota" style="margin:0">Se usará en el ranking, en los torneos y en los duelos, y quedará guardado en este dispositivo para no tener que escribirlo cada vez.</div><div class="pf-nom"><input id="pf-nombre-in" maxlength="24" placeholder="Tu nombre" autocomplete="nickname"><button type="button" onclick="gqPerfilNombre(true)">Guardar</button></div></div>'}
      <div class="pf-grid">
        <div class="pf-cifra"><b>${esc(s.partidas)}</b><span>partidas jugadas</span></div>
        <div class="pf-cifra"><b>${esc(torneos.length)}</b><span>torneos jugados</span></div>
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
      ${historial(s, torneos)}
      <div class="pf-nota">Estas cifras se guardan en este dispositivo: si cambias de móvil o borras los datos del navegador, empiezas de cero. Las partidas anteriores a la primera visita con esta versión no cuentan.</div>`;
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
  };

  // ── Pantalla de bienvenida: crear perfil o jugar sin registrarse ──
  // Sale UNA vez, a quien aún no tiene nombre guardado. «Jugar sin registrarme» también cuenta como
  // decisión y no se vuelve a preguntar (el Perfil sigue ofreciéndolo). No sale si la persona llega
  // desde un reto o una invitación a duelo: esa gente viene a algo concreto.
  function bienvenidaPerfil() {
    try { if (localStorage.getItem('gq_perfil_decidido')) return; } catch (e) { /* sin almacenamiento: se pregunta siempre */ }
    if (gqNombreGuardado()) return;
    const reto = document.getElementById('challenge-banner');
    if ((reto && reto.classList.contains('show')) || /[?&](challenge|duelo|codigo|d)=/.test(location.search)) return;
    estilo();
    const decidir = () => { try { localStorage.setItem('gq_perfil_decidido', '1'); } catch (e) { /* nada */ } };
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
          <div class="pf-nota" style="margin:0 0 4px">Elige un nombre y guardaremos tu historial de partidas, torneos y duelos. Jugarás siempre con él, como una sesión iniciada. Sin contraseña ni correo.</div>
          <div class="pf-nom"><input id="pf-bv-nombre" maxlength="24" placeholder="Tu nombre de jugador" autocomplete="nickname"><button type="button" id="pf-bv-crear">Crear</button></div>
          <div class="pf-msg" id="pf-bv-msg" role="status"></div>
        </div>
        <button class="pf-sec" type="button" id="pf-bv-sin">Jugar sin registrarme</button>
        <div class="pf-nota" style="text-align:center">Puedes crear tu perfil cuando quieras desde la pestaña Perfil.</div>
      </div>`;
    document.body.appendChild(v);
    const cerrar = () => { decidir(); v.remove(); };
    v.querySelector('#pf-bv-sin').onclick = cerrar;
    const crear = () => {
      const n = gqGuardarNombre(v.querySelector('#pf-bv-nombre').value);
      if (!n) { v.querySelector('#pf-bv-msg').textContent = 'Escribe un nombre para crear tu perfil.'; return; }
      cerrar();
      toast('Perfil creado: ' + n);
      const r = document.getElementById('screen-records');
      if (r && r.classList.contains('active')) window.renderRecords();
    };
    v.querySelector('#pf-bv-crear').onclick = crear;
    v.querySelector('#pf-bv-nombre').addEventListener('keydown', ev => { if (ev.key === 'Enter') crear(); });
  }
  // Un momento después de cargar, para que main.js haya mirado si viene de un reto.
  setTimeout(bienvenidaPerfil, 700);
  // La pestaña se llama Perfil: el botón de la barra decía «Récords».
  const etiqueta = document.querySelector('.nav-btn[onclick="showTab(\'records\')"] span');
  if (etiqueta) etiqueta.textContent = 'Perfil';
  // Cuando avisos.js cambia el estado de la suscripción, el perfil abierto se repinta.
  window.addEventListener('gq-avisos', () => {
    const r = document.getElementById('screen-records');
    if (r && r.classList.contains('active')) window.renderRecords();
  });
})();
