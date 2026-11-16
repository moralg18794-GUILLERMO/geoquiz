// GeoQuiz — API de torneo simulada, SOLO para mirar las pantallas del torneo en local.
//
// En localhost la API real no contesta (CORS), así que sin esto el aviso y la clasificación
// no se pueden ver. Se carga a mano desde la consola del navegador, nunca desde index.html:
//
//   const s=document.createElement('script');s.src='tools/pruebas/mock-torneo.js';document.head.appendChild(s);
//   // luego: __mock('activo')  o  __mock('cerrado')  o  __mock('activo', {vacio:true})
//
// No se despliega: la carpeta tools/ no se sube al servidor.
window.__mock = function (estado, opc) {
  opc = opc || {};
  const acaba = new Date(Date.now() + (3 * 24 + 5) * 3600 * 1000).toISOString();
  const tabla = opc.vacio ? [] : [
    { pos: 1, nombre: 'magui', puntos: 4379, correctas: 12, total: 15, segundos: 412, fecha: '2026-11-20', autor: false },
    { pos: 2, nombre: 'Jorge H', puntos: 4120, correctas: 11, total: 15, segundos: 388, fecha: '2026-11-20', autor: false },
    { pos: 3, nombre: 'Nuria', puntos: 3890, correctas: 11, total: 15, segundos: 455, fecha: '2026-11-21', autor: false },
    { pos: 4, nombre: 'Carlos_M', puntos: 3340, correctas: 9, total: 15, segundos: 301, fecha: '2026-11-21', autor: false },
    { pos: 5, nombre: 'Lucía', puntos: 2960, correctas: 8, total: 15, segundos: 520, fecha: '2026-11-22', autor: false },
    { pos: 6, nombre: 'Guille', puntos: 4001, correctas: 11, total: 15, segundos: 344, fecha: '2026-11-19', autor: true },
  ];
  window.gqFetch = async function (url, op) {
    await new Promise(r => setTimeout(r, 60));
    if (String(url).includes('torneo.php')) {
      if (op && op.method === 'POST') {
        const b = JSON.parse(op.body);
        if (b.accion === 'empezar') return { ok: true, cuerpo: { ok: true, token: 't', nombre: b.nombre } };
        if (b.accion === 'pregunta') return { ok: true, cuerpo: { ok: true, q: '¿En qué ciudad se inspira la ambientación principal?', opts: ['Miami', 'Los Ángeles', 'Nueva Orleans', 'Las Vegas'], cat: 'Torneo', diff: 'medio', pts: 200, orden: 1, total: 15, puntos: 0, racha: 0, quedan: 20 } };
        if (b.accion === 'responder') return { ok: true, cuerpo: { ok: true, acerto: true, correcta: 0, ganados: 200, mult: 1, puntos: 3340, aciertos: 9, racha: 1, exp: 'Respuesta de prueba.', ultima: true, total: 15, pos: 4, clasificacion: tabla } };
      }
      return { ok: true, cuerpo: { ok: true, torneo: { slug: 'prueba', titulo: 'Torneo VI: especial estreno GTA VI', tema: 'Bienvenidos al torneo semanal VI. Esta semana se estrena GTA VI y lo celebramos con quince preguntas sobre el juego y su mundo. Una sola partida por persona.', estado: estado || 'activo', acaba_en: acaba, n_preguntas: 15, numero: 6 }, estado_jugador: '', clasificacion: tabla } };
    }
    return { ok: false, estado: 0 };
  };
  return cargarTorneo();
};
