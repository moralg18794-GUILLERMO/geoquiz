// GeoQuiz — utilidades compartidas.
// ── SHUFFLE ───────────────────────────────────────────────────────────────
function shuffle(a){const r=[...a];for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;}

function toast(msg){
  const t=document.getElementById('share-toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2500);
}
