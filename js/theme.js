// GeoQuiz — paleta e iconos por categoría, cabecera, transiciones y banner de racha.
const CAT_STYLES={
  "Antigüedad":          {bg:"linear-gradient(135deg,#2c1810,#5c3a1e 40%,#8b5e3c 70%,#1a0f08)",label:"Mundo antiguo"},
  "Edad Media":          {bg:"linear-gradient(135deg,#1a1a2e,#16213e 40%,#0f3460 70%,#1a1a2e)",label:"Europa medieval"},
  "S. XVI–XVIII":        {bg:"linear-gradient(135deg,#1b3a2d,#2d5a3d 40%,#8b7355 70%,#1a2a1a)",label:"Era de los descubrimientos"},
  "Era Napoleónica":     {bg:"linear-gradient(135deg,#1a1209,#3d2b0a 40%,#7a5c1e 70%,#2a1f06)",label:"Europa napoleónica"},
  "S. XIX":              {bg:"linear-gradient(135deg,#0d1b2a,#1b2a3b 40%,#2e4057 70%,#0a1520)",label:"Siglo XIX"},
  "I Guerra Mundial":    {bg:"linear-gradient(135deg,#1c1c0a,#3b3b10 40%,#5c5c1a 70%,#2a2a08)",label:"La Gran Guerra"},
  "II Guerra Mundial":   {bg:"linear-gradient(135deg,#0a0a0a,#1a1a1a 40%,#2a1010 70%,#0a0505)",label:"Segunda Guerra Mundial"},
  "Guerra Fría":         {bg:"linear-gradient(135deg,#0a0a1a,#0d1b3e 40%,#1a0a2e 70%,#050510)",label:"Guerra Fría"},
  "Conflictos Modernos": {bg:"linear-gradient(135deg,#0d1117,#1a2332 40%,#0f2027 70%,#0d1117)",label:"Conflictos modernos"},
};
// Cabecera de la portada: sobria y azulada, para que el naranja y el magenta del torneo
// destaquen debajo. Las épocas conservan sus degradados mientras se juega.
const MENU_STYLE={bg:"linear-gradient(135deg,#0d1b2a,#16263d 45%,#1d1a3a 100%)",label:""};
const DEFAULT_STYLE={bg:"linear-gradient(135deg,#1a1209,#3d2b0a 40%,#7a5c1e 70%,#2a1f06)",label:""};
const CAT_ICONS={"Antigüedad":"⚱️","Edad Media":"🏰","S. XVI–XVIII":"⚓","Era Napoleónica":"🎖️","S. XIX":"🏭","I Guerra Mundial":"🪖","II Guerra Mundial":"✈️","Guerra Fría":"☢️","Conflictos Modernos":"🌍"};

// ── TEMÁTICAS ─────────────────────────────────────────────────────────────
// Transversales a las categorías: una pregunta de Antigüedad y otra de Guerra Fría
// pueden compartir temática. El código de tres letras es el que se guarda en el
// campo `t` de cada pregunta, en js/data/questions.js.
const THEMES={
  bat:{name:"Batallas y asedios",icon:"⚔️"},
  lid:{name:"Líderes y estrategas",icon:"👤"},
  dip:{name:"Diplomacia y geopolítica",icon:"📜"},
  imp:{name:"Imperios y colonización",icon:"🏛️"},
  rev:{name:"Revoluciones y golpes",icon:"✊"},
  tec:{name:"Ciencia, tecnología y armas",icon:"⚙️"},
  esp:{name:"Espionaje e inteligencia",icon:"🕵️"},
  eco:{name:"Economía y recursos",icon:"💰"},
  atr:{name:"Crímenes y atrocidades",icon:"🕯️"},
};

// ── GEOGRAFÍA ─────────────────────────────────────────────────────────────
// El tercer eje. Las nueve categorías de arriba son épocas y las nueve temáticas de
// debajo son transversales a ellas; estas seis dicen DÓNDE pasó. El código de dos
// letras es el que se guarda en el campo `g` de cada pregunta, en js/data/questions.js.
// Una pregunta puede llevar dos cuando el hecho es de dos continentes a la vez (Aníbal
// cruzando los Alpes es África y Europa), y `gl` es para lo que no es de ningún sitio
// concreto: la ONU, el TNP, la gripe de 1918.
// Oceanía va dentro de Asia y Pacífico a propósito: suelta no reúne ni las diez
// preguntas que hacen falta para una partida, así que la tarjeta no se podría jugar.
const GEOS={
  eu:{name:"Europa",            icon:"⚜️",bg:"linear-gradient(135deg,#0b1a2b,#17304d 40%,#2a4a6b 70%,#081320)",label:"Europa"},
  as:{name:"Asia y Pacífico",   icon:"🌏",bg:"linear-gradient(135deg,#0a1a0a,#0d3b1a 40%,#1a5c2e 70%,#051005)",label:"Asia y Pacífico"},
  af:{name:"África",            icon:"🏜️",bg:"linear-gradient(135deg,#1a0a00,#3d1e00 40%,#7a3c00 70%,#2a1000)",label:"África"},
  me:{name:"Oriente Medio",     icon:"🕌",bg:"linear-gradient(135deg,#1f1403,#4a3108 40%,#8a6418 70%,#2a1c04)",label:"Oriente Medio"},
  am:{name:"América",           icon:"🌎",bg:"linear-gradient(135deg,#00001a,#001a3d 40%,#002b5c 70%,#00000f)",label:"América"},
  gl:{name:"Mundial",           icon:"🌐",bg:"linear-gradient(135deg,#0f0c29,#302b63 40%,#24243e 70%,#0f0c29)",label:"Alcance mundial"},
};

// ── HEADER ────────────────────────────────────────────────────────────────
// Foto de cada época en la cabecera (img/epocas/, 1200×300, todas de dominio público:
// autores y enlaces en docs/fotos-epocas.md). Se pide solo la de la época que toca, nunca
// en la portada, y se funde con la anterior. Si el navegador pide ahorrar datos, no se usa.
const CAT_FOTO={"Antigüedad":"antiguedad","Edad Media":"edad-media","S. XVI–XVIII":"s16-18","Era Napoleónica":"napoleonica","S. XIX":"s19","I Guerra Mundial":"i-guerra","II Guerra Mundial":"ii-guerra","Guerra Fría":"guerra-fria","Conflictos Modernos":"conflictos","Geopolítica":"geopolitica","Asia y Pacífico":"asia","África y Oriente Medio":"africa-oriente","Américas":"americas"};
const FOTO_V='3';   // subida el 20/11/2026: los navegadores que pidieron las fotos antes de que estuvieran subidas se quedaron con el hueco guardado un año
const FOTO_CARGADA={};   // época -> true cuando la foto ya está descargada
let fotoActiva=null,fotoCapa=0,fotoCapas=null;
function fotoUrl(cat){return 'img/epocas/'+CAT_FOTO[cat]+'.jpg?v='+FOTO_V;}
function fotosPermitidas(){
  try{const c=navigator.connection;if(c&&(c.saveData||/(^|-)2g$/.test(c.effectiveType||'')))return false;}catch(e){}
  return true;
}
function fotoCapasCrear(h){
  if(fotoCapas)return fotoCapas;
  fotoCapas=[0,1].map(()=>{const d=document.createElement('div');d.className='hd-foto';d.setAttribute('aria-hidden','true');h.insertBefore(d,h.firstChild);return d;});
  return fotoCapas;
}
// En el menú no hay ninguna época "en curso", así que se enseña la de la primera época
// elegida (con todas puestas, la primera de la lista) y, cuando no hay ninguna o se está
// filtrando por temática o por continente, la de portada. Decisión de Guillermo
// (20/11/2026): antes el menú salía liso a propósito, para no descargarle una foto a quien
// solo asoma la cabeza; prefiere que se vean.
const FOTO_PORTADA='Antigüedad';
function fotoDelMenu(){
  try{
    if(typeof filterMode!=='undefined'&&filterMode==='epocas'&&
       typeof selectedCats!=='undefined'&&selectedCats.size&&typeof CAT_KEYS!=='undefined'){
      const k=CAT_KEYS.find(c=>selectedCats.has(c));
      if(k&&CAT_FOTO[k])return k;
    }
  }catch(e){}
  return FOTO_PORTADA;
}
function setHeaderFoto(cat){
  const h=document.getElementById('site-header');
  if(!h)return;
  if(cat==='menu')cat=fotoDelMenu();
  const quiere=(CAT_FOTO[cat]&&fotosPermitidas())?cat:null;
  if(quiere===fotoActiva)return;
  fotoActiva=quiere;
  const capas=fotoCapasCrear(h);
  if(!quiere){capas.forEach(c=>c.classList.remove('on'));return;}
  const poner=()=>{
    if(fotoActiva!==quiere)return;   // mientras cargaba, ya cambió la época
    fotoCapa=1-fotoCapa;
    const nueva=capas[fotoCapa],vieja=capas[1-fotoCapa];
    nueva.style.backgroundImage='url("'+fotoUrl(quiere)+'")';
    nueva.classList.add('on');vieja.classList.remove('on');
  };
  if(FOTO_CARGADA[quiere]){poner();return;}
  const im=new Image();
  im.onload=()=>{FOTO_CARGADA[quiere]=true;poner();};
  im.onerror=()=>{};   // sin foto se queda el degradado de siempre
  im.src=fotoUrl(quiere);
}
function setHeaderStyle(cat){
  const s=cat==='menu'?MENU_STYLE:(CAT_STYLES[cat]||DEFAULT_STYLE);
  document.getElementById('site-header').style.background=s.bg;
  document.getElementById('era-label').textContent=s.label;
  try{setHeaderFoto(cat);}catch(e){}
}
function flashHeader(color){
  const f=document.getElementById('header-flash');
  f.style.background=color;f.style.opacity='0.25';
  setTimeout(()=>f.style.opacity='0',300);
}

// ── CAT TRANSITION ────────────────────────────────────────────────────────
function showCatTransition(cat,callback){
  try{
    const s=CAT_STYLES[cat]||DEFAULT_STYLE;
    const overlay=document.getElementById('cat-transition');
    document.getElementById('ct-icon').textContent=CAT_ICONS[cat]||'⚔️';
    document.getElementById('ct-name').textContent=cat;
    document.getElementById('ct-era').textContent=s.label;
    // Con foto solo si ya está descargada (la cabecera la pide antes); si no, el degradado.
    overlay.style.background=(FOTO_CARGADA[cat]&&CAT_FOTO[cat])
      ?'linear-gradient(rgba(8,6,20,0.62),rgba(8,6,20,0.78)),url("'+fotoUrl(cat)+'") center/cover no-repeat, '+s.bg
      :s.bg;
    overlay.classList.add('show');
    setTimeout(()=>{overlay.classList.remove('show');if(callback)callback();},900);
  }catch(e){if(callback)callback();}
}

// ── STREAK BANNER ─────────────────────────────────────────────────────────
function showStreakBanner(n){
  const b=document.getElementById('streak-banner');
  const msgs={3:'🔥 ¡Racha x3! +bonificación',6:'⚡ ¡Racha x6! Multiplicador x3',9:'🏆 ¡Imbatible! Racha x9'};
  if(!msgs[n])return;
  b.textContent=msgs[n];b.classList.add('show');
  playStreak();
  setTimeout(()=>b.classList.remove('show'),2500);
}
