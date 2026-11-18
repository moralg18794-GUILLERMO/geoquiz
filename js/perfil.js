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
    return { desde: new Date().toISOString(), partidas: 0, modos: {}, duelos: { jugados: 0, ganados: 0, empatados: 0, perdidos: 0, contados: [] } };
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
        guardar(s);
      }
    } catch (e) { /* idem */ }
    return res;
  };

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

  function htmlPerfil() {
    const s = leer();
    const mote = (typeof torneoMiMote === 'function' && torneoMiMote()) || (typeof playerName !== 'undefined' && playerName) || '';
    const torneos = torneosJugados();
    const d = s.duelos;
    const recs = typeof getRecords === 'function' ? getRecords() : [];
    const mejor = recs[0];
    const filaModo = m => s.modos[m] ? `<div class="pf-fila"><span>${esc(modeLabel(m))}</span><span>${esc(s.modos[m])}</span></div>` : '';
    const modos = PERFIL_MODOS.map(filaModo).join('');
    return `
      <div class="pf-cab">
        <div class="pf-avatar">${esc((mote || '?').trim().charAt(0).toUpperCase() || '?')}</div>
        <div><div class="pf-nombre">${esc(mote || 'Jugador')}</div>
        <div class="pf-desde">Contando desde el ${esc(fecha(s.desde))}</div></div>
      </div>
      <div class="pf-grid">
        <div class="pf-cifra"><b>${esc(s.partidas)}</b><span>partidas jugadas</span></div>
        <div class="pf-cifra"><b>${esc(torneos.length)}</b><span>torneos jugados</span></div>
        <div class="pf-cifra"><b>${esc(d.jugados)}</b><span>duelos jugados</span></div>
        <div class="pf-cifra"><b>${esc(d.ganados)}</b><span>duelos ganados</span></div>
      </div>
      ${bloqueSuscripcion()}
      ${mejor ? `<div class="pf-bloque"><h3>Tu mejor partida</h3>
        <div class="pf-fila"><span>Puntos</span><span>${esc(Number(mejor.score).toLocaleString())}</span></div>
        <div class="pf-fila"><span>Modo</span><span>${esc(modeLabel(mejor.mode))}</span></div>
        <div class="pf-fila"><span>Fecha</span><span>${esc(mejor.date)}</span></div></div>` : ''}
      ${modos ? `<div class="pf-bloque"><h3>Partidas por modo</h3>${modos}</div>` : ''}
      ${d.jugados ? `<div class="pf-bloque"><h3>Duelos</h3>
        <div class="pf-fila"><span>Ganados</span><span>${esc(d.ganados)}</span></div>
        <div class="pf-fila"><span>Empatados</span><span>${esc(d.empatados)}</span></div>
        <div class="pf-fila"><span>Perdidos</span><span>${esc(d.perdidos)}</span></div></div>` : ''}
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

  // La pestaña se llama Perfil: el botón de la barra decía «Récords».
  const etiqueta = document.querySelector('.nav-btn[onclick="showTab(\'records\')"] span');
  if (etiqueta) etiqueta.textContent = 'Perfil';
  // Cuando avisos.js cambia el estado de la suscripción, el perfil abierto se repinta.
  window.addEventListener('gq-avisos', () => {
    const r = document.getElementById('screen-records');
    if (r && r.classList.contains('active')) window.renderRecords();
  });
})();
