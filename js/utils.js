// GeoQuiz — utilidades compartidas.
// ── SHUFFLE ───────────────────────────────────────────────────────────────
function shuffle(a){const r=[...a];for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;}

// Mezcla las opciones de una pregunta para que la correcta no caiga siempre en la misma
// posición. Reordena opts y recoloca ans a la vez, de modo que el resto del código
// (pick, 50:50, tiempo agotado) sigue funcionando sin cambios.
function shuffleOptions(q){
  const correcta=q.opts[q.ans];
  q.opts=shuffle(q.opts);
  q.ans=q.opts.indexOf(correcta);
}

// Escapa texto para meterlo en innerHTML. Imprescindible desde que el ranking es
// global: los nombres los escribe cualquiera y se pintan en el navegador de todos.
function esc(v){
  return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Abre WhatsApp con el texto ya escrito: en el móvil lo recoge la aplicación y en
// el escritorio, WhatsApp Web. No hace falta número: wa.me sin destinatario deja
// elegir el chat.
function compartirWhatsApp(texto){
  window.open('https://wa.me/?text='+encodeURIComponent(texto),'_blank','noopener');
}

// Texto para invitar a jugar, sin puntuación: el que se manda desde el menú.
function textoInvitacion(){
  const url=window.location.href.split('?')[0];
  return `🗺️ Te reto en GeoQuiz: 521 preguntas de guerras, conflictos y geopolítica, de la Antigüedad a Ucrania.\n\nSeis modos y ranking compartido, a ver quién queda arriba:\n${url}`;
}

function toast(msg){
  const t=document.getElementById('share-toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2500);
}
