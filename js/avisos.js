// GeoQuiz — recuadro OPCIONAL para pedir avisos por correo de torneos y eventos.
//
// Sale al terminar una partida (pantalla de resultado), nunca antes: el juego no pide
// nada para jugar. Solo aparece si la API dice que el envío de correo está configurado
// (GET avisos.php?estado) y si la persona no lo ha pedido ni lo ha rechazado ya.
// Es autónomo a propósito: no toca las pantallas, se engancha a showScreen().
(function () {
  const BASE = GQ_API.replace(/ranking\.php$/, 'avisos.php');
  const CLAVE = 'gq_avisos';
  const PRIVACIDAD = 'privacidad.html';
  let activo = null; // null = sin comprobar todavía

  function guardado() { try { return localStorage.getItem(CLAVE) || ''; } catch (e) { return ''; } }
  function guardar(v) { try { localStorage.setItem(CLAVE, v); } catch (e) { /* sin almacenamiento: se volverá a ofrecer */ } }

  async function estaActivo() {
    if (activo !== null) return activo;
    const r = await gqFetch(BASE + '?estado', { method: 'GET' });
    activo = !!(r.ok && r.cuerpo && r.cuerpo.activo);
    return activo;
  }

  function caja() {
    let c = document.getElementById('aviso-caja');
    if (!c) {
      c = document.createElement('div');
      c.id = 'aviso-caja';
      c.style.cssText = 'margin:1.25rem auto 0;max-width:460px;padding:1rem;border:1px solid var(--border2);border-radius:var(--radius);background:var(--accent-dim);font-size:13px;line-height:1.5;text-align:left';
      document.getElementById('screen-result').appendChild(c);
    }
    return c;
  }

  function dibujar() {
    const c = caja();
    c.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px">📬 ¿Te aviso del próximo torneo?</div>
      <div style="color:var(--muted);margin-bottom:8px">Un correo cuando abra un torneo nuevo o haya algún evento. Sin spam y te das de baja cuando quieras. Es opcional.</div>
      <input id="aviso-email" type="email" inputmode="email" autocomplete="email" placeholder="tu@correo.com" maxlength="190"
        style="width:100%;box-sizing:border-box;padding:.6rem;border-radius:8px;border:1px solid var(--border2);background:transparent;color:inherit;font:inherit;margin-bottom:8px">
      <input id="aviso-web" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0">
      <label style="display:block;margin-bottom:4px"><input id="aviso-ok" type="checkbox"> Acepto recibir avisos de GeoQuiz por correo. Puedo darme de baja en cualquier momento.</label>
      <label style="display:block;margin-bottom:8px"><input id="aviso-mayor" type="checkbox"> Tengo 14 años o más.</label>
      <div style="margin-bottom:8px;color:var(--muted);font-size:12px">Responsable: Guillermo Moral Lozano. Usaremos tu correo solo para avisarte de torneos y eventos de GeoQuiz. Puedes acceder, rectificar o borrar tus datos escribiendo a comunicaciones@tunegocioconestrategia.com. Más información en la <a href="${PRIVACIDAD}" target="_blank" rel="noopener" style="color:var(--accent)">política de privacidad</a>.</div>
      <div id="aviso-msg" role="status" style="margin-bottom:8px"></div>
      <button class="btn-primary" id="aviso-enviar" type="button">Avisadme</button>
      <button class="btn-secondary" id="aviso-no" type="button">No, gracias</button>`;
    document.getElementById('aviso-enviar').onclick = enviar;
    document.getElementById('aviso-no').onclick = () => { guardar('no'); c.remove(); };
  }

  async function enviar() {
    const msg = document.getElementById('aviso-msg');
    const email = document.getElementById('aviso-email').value.trim();
    if (!document.getElementById('aviso-ok').checked || !document.getElementById('aviso-mayor').checked) {
      msg.textContent = 'Marca las dos casillas para continuar.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.textContent = 'Ese correo no parece válido.';
      return;
    }
    const b = document.getElementById('aviso-enviar');
    b.disabled = true;
    msg.textContent = 'Enviando…';
    const r = await gqFetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, consentimiento: true, mayor: true,
        web: document.getElementById('aviso-web').value,
      }),
    });
    if (r.ok) {
      guardar('pedido');
      caja().innerHTML = '<div style="font-weight:600">✅ Casi listo</div><div style="color:var(--muted)">Te hemos mandado un correo: pulsa el botón que trae para confirmar. Si no lo ves, mira en spam.</div>';
      return;
    }
    b.disabled = false;
    msg.textContent = (r.cuerpo && r.cuerpo.mensaje) || 'No se ha podido enviar. Prueba más tarde.';
  }

  async function mostrar() {
    const antiguo = document.getElementById('aviso-caja');
    if (antiguo) antiguo.remove();
    if (guardado() || !(await estaActivo())) return;
    if (!document.getElementById('screen-result').classList.contains('active')) return;
    dibujar();
  }

  const original = window.showScreen;
  window.showScreen = function (id) {
    const r = original.apply(this, arguments);
    if (id === 'screen-result') mostrar();
    return r;
  };
})();
