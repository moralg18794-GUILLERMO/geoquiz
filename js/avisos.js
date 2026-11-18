// GeoQuiz — suscripción OPCIONAL a avisos por correo (torneos, preguntas nuevas, modos de juego).
//
// Hay tres puertas, todas opcionales y con el mismo formulario y el mismo consentimiento:
//  · una tarjeta fija en el menú, justo debajo del aviso del torneo (siempre a mano);
//  · un enlace dentro de la bienvenida de la primera visita;
//  · un recuadro al terminar una partida, en la pantalla de resultado.
// El juego no pide nada para jugar. Todo esto solo aparece si la API dice que el envío de
// correo está configurado (GET avisos.php?estado) y si la persona no se ha apuntado ya.
// Es autónomo a propósito: no toca las pantallas, se engancha a showScreen().
(function () {
  const BASE = GQ_API.replace(/ranking\.php$/, 'avisos.php');
  const CLAVE = 'gq_avisos';          // 'pedido' = ya se apuntó en este dispositivo
  const CLAVE_NO = 'gq_avisos_no';    // 'no' = rechazó el recuadro de resultado
  const PRIVACIDAD = 'privacidad.html';
  const ESTILO = 'padding:1rem;border:1px solid var(--border2);border-radius:var(--radius);background:var(--accent-dim);font-size:13px;line-height:1.5;text-align:left';
  let activo = null; // null = sin comprobar todavía

  function leer(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento: se volverá a ofrecer */ } }
  const yaPedido = () => leer(CLAVE) === 'pedido';

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
      <div style="font-weight:600;margin-bottom:4px">📬 Entérate de todo lo que viene</div>
      <div style="color:var(--muted);margin-bottom:8px">Torneos semanales, preguntas nuevas y modos de juego nuevos, directos a tu correo. Sin spam y te das de baja cuando quieras. Es opcional.</div>
      <input class="av-email" type="email" inputmode="email" autocomplete="email" placeholder="tu@correo.com" maxlength="190"
        style="width:100%;box-sizing:border-box;padding:.6rem;border-radius:8px;border:1px solid var(--border2);background:transparent;color:inherit;font:inherit;margin-bottom:8px">
      <input class="av-web" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0">
      <label style="display:block;margin-bottom:4px"><input class="av-ok" type="checkbox"> Acepto recibir por correo avisos de torneos, preguntas y modos de juego de GeoQuiz. Puedo darme de baja en cualquier momento.</label>
      <label style="display:block;margin-bottom:8px"><input class="av-mayor" type="checkbox"> Tengo 14 años o más.</label>
      <div style="margin-bottom:8px;color:var(--muted);font-size:12px">Responsable: Guillermo Moral Lozano. Usaremos tu correo solo para esos avisos. Puedes acceder, rectificar o borrar tus datos escribiendo a comunicaciones@tunegocioconestrategia.com. Más información en la <a href="${PRIVACIDAD}" target="_blank" rel="noopener" style="color:var(--accent)">política de privacidad</a>.</div>
      <div class="av-msg" role="status" style="margin-bottom:8px"></div>
      <button class="btn-primary av-enviar" type="button">Avisadme</button>
      ${alRechazar ? '<button class="btn-secondary av-no" type="button">No, gracias</button>' : ''}`;
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
    msg.textContent = 'Enviando…';
    const r = await gqFetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, consentimiento: true, mayor: true, web: q('.av-web').value }),
    });
    if (r.ok) {
      guardar(CLAVE, 'pedido');
      document.querySelectorAll('.av-caja').forEach(o => { if (o !== c) o.remove(); });
      c.innerHTML = '<div style="font-weight:600">✅ Casi listo</div><div style="color:var(--muted)">Te hemos mandado un correo: pulsa el botón que trae para confirmar. Si no lo ves, mira en spam.</div>';
      return;
    }
    b.disabled = false;
    msg.textContent = (r.cuerpo && r.cuerpo.mensaje) || 'No se ha podido enviar. Prueba más tarde.';
  }

  // ── Tarjeta fija del menú: cerrada enseña una frase y un botón; abierta, el formulario ──
  function tarjetaMenu() {
    const menu = document.getElementById('screen-menu');
    if (!menu || document.getElementById('aviso-menu')) return;
    const c = document.createElement('div');
    c.id = 'aviso-menu';
    c.className = 'av-caja';
    c.style.cssText = ESTILO + ';margin:0 0 1.25rem';
    c.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px">📬 Estate al tanto</div>
      <div style="color:var(--muted);margin-bottom:8px">Suscríbete y te avisamos de los torneos semanales, las preguntas nuevas y los nuevos modos de juego.</div>
      <button class="btn-primary av-abrir" type="button">Quiero que me avisen</button>`;
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
    const a = document.createElement('button');
    a.type = 'button';
    a.className = 'av-enlace';
    a.textContent = '📬 Avisadme de torneos y novedades';
    a.style.cssText = 'display:block;margin:.75rem auto 0;background:transparent;border:0;color:var(--accent);cursor:pointer;font:inherit;text-decoration:underline';
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
    const c = document.createElement('div');
    c.id = 'aviso-caja';
    c.className = 'av-caja';
    c.style.cssText = ESTILO + ';margin:1.25rem auto 0;max-width:460px';
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
