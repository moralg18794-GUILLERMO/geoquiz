// GeoQuiz — cuenta de jugador SIN contraseña: nombre + correo y un código de seis cifras por correo.
//
// Este archivo solo sabe de la cuenta: pedir el código, abrir y cerrar sesión, y la ventana donde se
// hace. El historial y su sincronización viven en perfil.js, que se engancha a `gqCuenta.alEntrar` y
// `gqCuenta.alSalir`. Crear una cuenta NO apunta a los avisos por correo: eso es otro permiso (js/avisos.js).
(function () {
  const BASE = GQ_API.replace(/ranking\.php$/, 'cuenta.php');
  const K_SESION = 'gq_sesion';
  const K_NOMBRE = 'gq_torneo_mote'; // el mismo nombre que ya usan ranking, duelos y torneo

  function leer(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function guardar(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } }

  async function api(accion, datos) {
    return gqFetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ accion }, datos || {})),
    });
  }
  const mensaje = (r, defecto) => (r && r.cuerpo && r.cuerpo.mensaje) || defecto || 'No se ha podido completar. Prueba más tarde.';

  const gqCuenta = {
    sesion: () => leer(K_SESION),
    iniciada: () => !!leer(K_SESION),
    api,
    alEntrar: null,   // perfil.js: (stats remotas) => sincroniza
    alSalir: null,    // perfil.js: () => limpia lo local
    // Una sesión rechazada por el servidor (caducó o se borró) se olvida sin ruido.
    sesionInvalida() { guardar(K_SESION, ''); if (this.alSalir) this.alSalir(false); },
    async salir() {
      const s = leer(K_SESION);
      if (s) await api('salir', { sesion: s });
      guardar(K_SESION, '');
      if (this.alSalir) this.alSalir(true);
    },
    async borrar() {
      const s = leer(K_SESION);
      const r = await api('borrar', { sesion: s });
      if (!r.ok && r.estado !== 401) return r;
      guardar(K_SESION, '');
      if (this.alSalir) this.alSalir(true);
      return { ok: true };
    },
    async cambiarNombre(nombre) {
      const r = await api('nombre', { sesion: leer(K_SESION), nombre });
      if (r.ok && r.cuerpo && r.cuerpo.nombre) guardar(K_NOMBRE, r.cuerpo.nombre);
      else if (r.estado === 401) this.sesionInvalida();
      return r;
    },
    abrir,
  };
  window.gqCuenta = gqCuenta;

  // ── Estilo propio de la ventana ──
  function estilo() {
    if (document.getElementById('cu-estilo')) return;
    const s = document.createElement('style');
    s.id = 'cu-estilo';
    s.textContent = `
      .cu-vel{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;
        background:rgba(5,3,14,.82);backdrop-filter:blur(3px)}
      .cu-caja{box-sizing:border-box;width:100%;max-width:440px;max-height:92vh;overflow:auto;padding:20px;border-radius:18px;
        background:#161226;border:1px solid rgba(201,168,76,.4);font-size:14px;line-height:1.5;position:relative}
      .cu-tit{font:700 20px 'Inter',sans-serif;margin:0 0 6px}
      .cu-txt{color:var(--muted);margin-bottom:12px}
      .cu-in{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.22);
        background:rgba(0,0,0,.28);color:inherit;font:inherit;margin-bottom:10px}
      .cu-in:focus{outline:2px solid rgba(201,168,76,.7);outline-offset:1px;border-color:transparent}
      .cu-cod{font-size:26px;letter-spacing:8px;text-align:center}
      .cu-chk{display:flex;gap:10px;align-items:flex-start;margin:2px 0 10px;font-size:13px;line-height:1.45;cursor:pointer}
      .cu-chk input{flex:none;width:18px;height:18px;margin:1px 0 0;accent-color:#c9a84c}
      .cu-btn{display:block;width:100%;border:0;border-radius:12px;padding:13px 16px;cursor:pointer;font:700 15px 'Inter',sans-serif;
        background:var(--oro,#c9a84c);color:#1b1405;box-shadow:0 10px 22px -12px rgba(201,168,76,.8)}
      .cu-btn:disabled{opacity:.5;cursor:wait}
      .cu-sec{display:block;width:100%;margin-top:8px;border-radius:12px;padding:11px 16px;cursor:pointer;background:transparent;
        color:var(--muted);border:1px solid rgba(255,255,255,.2);font:600 14px 'Inter',sans-serif}
      .cu-lnk{background:none;border:0;color:var(--accent,#c9a84c);text-decoration:underline;cursor:pointer;font:inherit;padding:0}
      .cu-msg{min-height:0;margin:0 0 10px;font-size:13px;color:#ffb4a8}
      .cu-msg:empty{display:none}
      .cu-pie{margin-top:12px;font-size:12px;color:var(--muted);text-align:center}
      .cu-x{position:absolute;top:8px;right:12px;background:transparent;border:0;color:var(--muted);font-size:22px;cursor:pointer;line-height:1}
    `;
    document.head.appendChild(s);
  }

  const PRIVACIDAD = 'privacidad.html';

  // modo: 'crear' | 'entrar'. `nombre`: nombre con el que rellenar el formulario de crear.
  function abrir(modo, nombre) {
    estilo();
    if (document.getElementById('cu-vel')) document.getElementById('cu-vel').remove();
    const v = document.createElement('div');
    v.id = 'cu-vel';
    v.className = 'cu-vel';
    const c = document.createElement('div');
    c.className = 'cu-caja';
    c.setAttribute('role', 'dialog');
    c.setAttribute('aria-modal', 'true');
    v.appendChild(c);
    document.body.appendChild(v);
    const cerrar = () => v.remove();
    let email = '';
    let nombreElegido = nombre || '';
    let quiereAvisos = false;

    const q = s => c.querySelector(s);
    const equis = '<button class="cu-x" type="button" aria-label="Cerrar">✕</button>';
    const ponX = () => { q('.cu-x').onclick = cerrar; };

    function pantallaDatos(m) {
      const crear = m === 'crear';
      c.innerHTML = equis + `
        <h2 class="cu-tit">${crear ? 'Crea tu perfil' : 'Entra en tu perfil'}</h2>
        <div class="cu-txt">${crear
          ? 'Guarda tu historial de partidas, torneos y duelos y entra desde cualquier dispositivo. Sin contraseña: te mandamos un código al correo.'
          : 'Escribe tu correo y te mandamos un código para entrar. Sin contraseña.'}</div>
        ${crear ? `<input class="cu-in cu-nombre" maxlength="24" placeholder="Tu nombre de jugador" autocomplete="nickname" aria-label="Tu nombre de jugador" value="${esc(nombreElegido)}">` : ''}
        <input class="cu-in cu-email" type="email" inputmode="email" autocomplete="email" placeholder="tu@correo.com" maxlength="190" aria-label="Tu correo electrónico" value="${esc(email)}">
        <input class="cu-web" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0">
        ${crear ? `<label class="cu-chk"><input class="cu-mayor" type="checkbox"><span>Tengo 14 años o más.</span></label>
        <label class="cu-chk"><input class="cu-avisos" type="checkbox"${quiereAvisos ? ' checked' : ''}><span>Quiero recibir por correo avisos de torneos, preguntas y modos de juego nuevos. <em style="color:var(--muted)">(Opcional. Puedo darme de baja cuando quiera.)</em></span></label>
        <div class="cu-txt" style="font-size:12px;margin-bottom:12px">Usaremos tu correo para identificarte y guardar tu historial y, solo si marcas la casilla de arriba, para esos avisos. Responsable: Guillermo Moral Lozano. Más información en la <a href="${PRIVACIDAD}" target="_blank" rel="noopener" style="color:var(--accent)">política de privacidad</a>.</div>` : ''}
        <div class="cu-msg" role="status"></div>
        <button class="cu-btn cu-enviar" type="button">Enviar código</button>
        <div class="cu-pie">${crear
          ? '¿Ya tienes perfil? <button class="cu-lnk cu-cambia" type="button">Entra</button>'
          : '¿Aún no tienes perfil? <button class="cu-lnk cu-cambia" type="button">Créalo</button>'}</div>`;
      ponX();
      q('.cu-cambia').onclick = () => pantallaDatos(crear ? 'entrar' : 'crear');
      const enviar = async () => {
        const msg = q('.cu-msg');
        email = q('.cu-email').value.trim();
        if (crear) {
          nombreElegido = q('.cu-nombre').value.trim();
          if (!nombreElegido) { msg.textContent = 'Escribe un nombre de jugador.'; return; }
          if (!q('.cu-mayor').checked) { msg.textContent = 'Confirma que tienes 14 años o más.'; return; }
          quiereAvisos = q('.cu-avisos').checked;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Ese correo no parece válido.'; return; }
        const b = q('.cu-enviar');
        b.disabled = true;
        msg.style.color = 'var(--muted)';
        msg.textContent = 'Enviando…';
        const r = crear
          ? await api('alta', { nombre: nombreElegido, email, mayor: true, web: q('.cu-web').value })
          : await api('entrar', { email, web: q('.cu-web').value });
        if (r.ok) { pantallaCodigo(m); return; }
        b.disabled = false;
        msg.style.color = '';
        msg.textContent = mensaje(r);
      };
      q('.cu-enviar').onclick = enviar;
      c.querySelectorAll('.cu-in').forEach(i => i.addEventListener('keydown', ev => { if (ev.key === 'Enter') enviar(); }));
      const primero = q(crear ? '.cu-nombre' : '.cu-email');
      if (primero && !primero.value) primero.focus();
    }

    function pantallaCodigo(m) {
      c.innerHTML = equis + `
        <h2 class="cu-tit">Escribe tu código</h2>
        <div class="cu-txt">Si ${m === 'crear' ? 'el correo es correcto' : 'existe un perfil con ese correo'}, te hemos mandado un código de seis cifras a <strong>${esc(email)}</strong>. Mira también en spam. Caduca en 15 minutos.</div>
        <input class="cu-in cu-cod" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="······" aria-label="Código de seis cifras">
        <div class="cu-msg" role="status"></div>
        <button class="cu-btn cu-ok" type="button">Entrar</button>
        <div class="cu-pie"><button class="cu-lnk cu-otro" type="button">Cambiar el correo</button> · <button class="cu-lnk cu-reenviar" type="button">Reenviar el código</button></div>
        ${m === 'entrar' ? '<div class="cu-pie">¿No te llega nada? Puede que aún no tengas perfil: <button class="cu-lnk cu-crear" type="button">créalo ahora</button></div>' : ''}`;
      if (m === 'entrar') q('.cu-crear').onclick = () => pantallaDatos('crear');
      ponX();
      q('.cu-otro').onclick = () => pantallaDatos(m);
      q('.cu-reenviar').onclick = async () => {
        const msg = q('.cu-msg');
        msg.style.color = 'var(--muted)';
        msg.textContent = 'Enviando otro código…';
        const r = m === 'crear'
          ? await api('alta', { nombre: nombreElegido, email, mayor: true })
          : await api('entrar', { email });
        msg.style.color = r.ok ? 'var(--muted)' : '';
        msg.textContent = r.ok ? 'Hecho. Si no llega en un minuto, mira en spam.' : mensaje(r);
      };
      const entrar = async () => {
        const msg = q('.cu-msg');
        const codigo = q('.cu-cod').value.replace(/\D/g, '');
        if (codigo.length !== 6) { msg.textContent = 'El código tiene seis cifras.'; return; }
        const b = q('.cu-ok');
        b.disabled = true;
        msg.style.color = 'var(--muted)';
        msg.textContent = 'Comprobando…';
        const r = await api('verificar', m === 'crear' && quiereAvisos ? { email, codigo, avisos: true } : { email, codigo });
        if (r.ok && r.cuerpo && r.cuerpo.sesion) {
          guardar(K_SESION, r.cuerpo.sesion);
          guardar(K_NOMBRE, r.cuerpo.nombre);
          try { localStorage.setItem('gq_perfil_decidido', '1'); } catch (e) { /* nada */ }
          cerrar();
          const w = document.getElementById('pf-vel');
          if (w) w.remove();
          if (r.cuerpo.avisos) { guardar('gq_avisos', 'confirmado'); guardar('gq_avisos_feliz', '1'); try { window.dispatchEvent(new Event('gq-avisos')); } catch (e) { /* nada */ } }
          toast(r.cuerpo.avisos ? 'Sesión iniciada y suscrito a los avisos: ' + r.cuerpo.nombre : 'Sesión iniciada: ' + r.cuerpo.nombre);
          if (gqCuenta.alEntrar) gqCuenta.alEntrar(r.cuerpo.stats);
          return;
        }
        b.disabled = false;
        msg.style.color = '';
        msg.textContent = mensaje(r, 'Código incorrecto.');
        if (r.estado === 409) pantallaDatos('crear');
      };
      q('.cu-ok').onclick = entrar;
      q('.cu-cod').addEventListener('keydown', ev => { if (ev.key === 'Enter') entrar(); });
      q('.cu-cod').focus();
    }

    pantallaDatos(modo === 'entrar' ? 'entrar' : 'crear');
  }
})();
