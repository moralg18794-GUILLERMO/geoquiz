// GeoQuiz — suscripción OPCIONAL a avisos por correo (torneos, preguntas nuevas, modos de juego).
//
// Hay tres puertas, todas opcionales y con el mismo formulario y el mismo consentimiento:
//  · una tarjeta fija en el menú, justo debajo del aviso del torneo (siempre a mano);
//  · un enlace dentro de la bienvenida de la primera visita;
//  · un recuadro al terminar una partida, en la pantalla de resultado.
// El juego no pide nada para jugar. Todo esto solo aparece si la API dice que el envío de
// correo está configurado (GET avisos.php?estado) y si la persona no se ha apuntado ya.
// Es autónomo a propósito: no toca las pantallas ni styles.css, se engancha a showScreen() y
// lleva su propio estilo (inyectado una vez) para no pisar el del rediseño.
(function () {
  const BASE = GQ_API.replace(/ranking\.php$/, 'avisos.php');
  const CLAVE = 'gq_avisos';          // 'pedido' = ya se apuntó en este dispositivo
  const CLAVE_NO = 'gq_avisos_no';    // 'no' = rechazó el recuadro de resultado
  const PRIVACIDAD = 'privacidad.html';
  let activo = null; // null = sin comprobar todavía

  function leer(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento: se volverá a ofrecer */ } }
  const yaPedido = () => leer(CLAVE) === 'pedido';

  function estilo() {
    if (document.getElementById('av-estilo')) return;
    const s = document.createElement('style');
    s.id = 'av-estilo';
    s.textContent = `
      .av-caja{box-sizing:border-box;padding:16px;border-radius:16px;font-size:14px;line-height:1.5;text-align:left;
        background:linear-gradient(160deg,rgba(201,168,76,.14),rgba(255,255,255,.03));border:1px solid rgba(201,168,76,.35)}
      .av-titulo{font-weight:700;font-size:15px;margin-bottom:4px}
      .av-txt{color:var(--muted);margin-bottom:12px}
      .av-boton{display:block;width:100%;border:0;border-radius:12px;padding:13px 16px;font:700 15px 'Inter',sans-serif;
        cursor:pointer;background:var(--oro,#c9a84c);color:#1b1405;box-shadow:0 10px 22px -12px rgba(201,168,76,.8);
        transition:filter .15s,transform .1s}
      .av-boton:hover{filter:brightness(1.07)}
      .av-boton:active{transform:scale(.985)}
      .av-boton:disabled{opacity:.5;cursor:wait}
      .av-sec{display:block;width:100%;margin-top:8px;border-radius:12px;padding:11px 16px;font:600 14px 'Inter',sans-serif;
        cursor:pointer;background:transparent;color:var(--muted);border:1px solid rgba(255,255,255,.18)}
      .av-sec:hover{color:var(--text,#fff);border-color:rgba(255,255,255,.35)}
      .av-email{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.2);
        background:rgba(0,0,0,.25);color:inherit;font:inherit;margin-bottom:12px}
      .av-email:focus{outline:2px solid rgba(201,168,76,.7);outline-offset:1px;border-color:transparent}
      .av-check{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;font-size:13px;line-height:1.45;cursor:pointer}
      .av-check input{flex:none;width:18px;height:18px;margin:1px 0 0;accent-color:#c9a84c}
      .av-legal{margin:2px 0 12px;font-size:12px;color:var(--muted)}
      .av-legal summary{cursor:pointer;color:var(--muted);text-decoration:underline;text-underline-offset:3px;list-style:none}
      .av-legal summary::-webkit-details-marker{display:none}
      .av-legal p{margin:8px 0 0;line-height:1.5}
      .av-legal a{color:var(--accent,#c9a84c)}
      .av-msg{min-height:0;margin-bottom:10px;font-size:13px;color:#ffb4a8}
      .av-msg:empty{display:none}
      .av-enlace{display:block;width:100%;margin:12px 0 0;padding:11px 16px;border-radius:12px;cursor:pointer;
        background:rgba(255,255,255,.06);color:inherit;border:1px solid rgba(255,255,255,.28);font:600 14px 'Inter',sans-serif}
      .av-enlace:hover{background:rgba(255,255,255,.12)}
    `;
    document.head.appendChild(s);
  }

  async function estaActivo() {
    if (activo !== null) return activo;
    const r = await gqFetch(BASE + '?estado', { method: 'GET' });
    activo = !!(r.ok && r.cuerpo && r.cuerpo.activo);
    return activo;
  }

  // El formulario se pinta dentro de `c`; sus piezas se buscan DENTRO de `c` (no por id) porque
  // puede haber dos a la vez en el documento (menú y resultado).
  function formulario(c, alRechazar) {
    c.innerHTML = `
      <div class="av-titulo">📬 Entérate de todo lo que viene</div>
      <div class="av-txt">Torneos semanales, preguntas nuevas y modos de juego nuevos, directos a tu correo. Sin spam y te das de baja cuando quieras. Es opcional.</div>
      <input class="av-email" type="email" inputmode="email" autocomplete="email" placeholder="tu@correo.com" maxlength="190" aria-label="Tu correo electrónico">
      <input class="av-web" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0">
      <label class="av-check"><input class="av-ok" type="checkbox"><span>Acepto recibir por correo avisos de torneos, preguntas y modos de juego de GeoQuiz. Puedo darme de baja en cualquier momento.</span></label>
      <label class="av-check"><input class="av-mayor" type="checkbox"><span>Tengo 14 años o más.</span></label>
      <details class="av-legal">
        <summary>Información sobre protección de datos</summary>
        <p>Responsable: Guillermo Moral Lozano. Usaremos tu correo solo para esos avisos. Puedes acceder, rectificar o borrar tus datos escribiendo a comunicaciones@tunegocioconestrategia.com. Más información en la <a href="${PRIVACIDAD}" target="_blank" rel="noopener">política de privacidad</a>.</p>
      </details>
      <div class="av-msg" role="status"></div>
      <button class="av-boton av-enviar" type="button">Avisadme</button>
      ${alRechazar ? '<button class="av-sec av-no" type="button">No, gracias</button>' : ''}`;
    const q = s => c.querySelector(s);
    q('.av-enviar').onclick = () => enviar(c);
    if (alRechazar) q('.av-no').onclick = alRechazar;
  }

  async function enviar(c) {
    const q = s => c.querySelector(s);
    const msg = q('.av-msg');
    const email = q('.av-email').value.trim();
    if (!q('.av-ok').checked || !q('.av-mayor').checked) {
      msg.textContent = 'Marca las dos casillas para continuar.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.textContent = 'Ese correo no parece válido.';
      return;
    }
    const b = q('.av-enviar');
    b.disabled = true;
    msg.style.color = 'var(--muted)';
    msg.textContent = 'Enviando…';
    const r = await gqFetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, consentimiento: true, mayor: true, web: q('.av-web').value }),
    });
    if (r.ok) {
      guardar(CLAVE, 'pedido');
      document.querySelectorAll('.av-caja').forEach(o => { if (o !== c) o.remove(); });
      c.innerHTML = '<div class="av-titulo">✅ Casi listo</div><div class="av-txt" style="margin:0">Te hemos mandado un correo: pulsa el botón que trae para confirmar. Si no lo ves, mira en spam.</div>';
      return;
    }
    b.disabled = false;
    msg.style.color = '';
    msg.textContent = (r.cuerpo && r.cuerpo.mensaje) || 'No se ha podido enviar. Prueba más tarde.';
  }

  // ── Tarjeta fija del menú: cerrada enseña una frase y un botón; abierta, el formulario ──
  function tarjetaMenu() {
    const menu = document.getElementById('screen-menu');
    if (!menu || document.getElementById('aviso-menu')) return;
    estilo();
    const c = document.createElement('div');
    c.id = 'aviso-menu';
    c.className = 'av-caja';
    c.style.margin = '0 0 1.25rem';
    c.innerHTML = `
      <div class="av-titulo">📬 Estate al tanto</div>
      <div class="av-txt">Suscríbete y te avisamos de los torneos semanales, las preguntas nuevas y los nuevos modos de juego.</div>
      <button class="av-boton av-abrir" type="button">Quiero que me avisen</button>`;
    c.querySelector('.av-abrir').onclick = () => formulario(c, null);
    const ref = document.getElementById('torneo-aviso');
    if (ref && ref.parentNode === menu) ref.insertAdjacentElement('afterend', c);
    else menu.prepend(c);
  }

  // Abre el formulario del menú desde cualquier sitio (lo usa el enlace de la bienvenida).
  function abrirDesdeBienvenida() {
    if (typeof cerrarBienvenida === 'function') cerrarBienvenida();
    tarjetaMenu();
    const c = document.getElementById('aviso-menu');
    if (!c) return;
    if (!c.querySelector('.av-email')) formulario(c, null);
    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function enlaceBienvenida() {
    const bv = document.getElementById('bienvenida');
    if (!bv || bv.querySelector('.av-enlace')) return;
    estilo();
    const a = document.createElement('button');
    a.type = 'button';
    a.className = 'av-enlace';
    a.textContent = '📬 Avisadme de torneos y novedades';
    a.onclick = abrirDesdeBienvenida;
    bv.appendChild(a);
  }

  // ── Recuadro de la pantalla de resultado ──
  async function mostrarResultado() {
    const antiguo = document.getElementById('aviso-caja');
    if (antiguo) antiguo.remove();
    if (yaPedido() || leer(CLAVE_NO) === 'no' || !(await estaActivo())) return;
    const r = document.getElementById('screen-result');
    if (!r || !r.classList.contains('active')) return;
    estilo();
    const c = document.createElement('div');
    c.id = 'aviso-caja';
    c.className = 'av-caja';
    c.style.cssText = 'margin:1.25rem auto 0;max-width:460px';
    r.appendChild(c);
    formulario(c, () => { guardar(CLAVE_NO, 'no'); c.remove(); });
  }

  async function arrancar() {
    if (yaPedido() || !(await estaActivo())) return;
    tarjetaMenu();
    enlaceBienvenida();
  }

  const original = window.showScreen;
  window.showScreen = function (id) {
    const r = original.apply(this, arguments);
    if (id === 'screen-result') mostrarResultado();
    return r;
  };
  arrancar();
})();
