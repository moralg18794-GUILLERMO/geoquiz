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
  "Geopolítica":         {bg:"linear-gradient(135deg,#0f0c29,#302b63 40%,#24243e 70%,#0f0c29)",label:"Geopolítica global"},
  "Asia y Pacífico":     {bg:"linear-gradient(135deg,#0a1a0a,#0d3b1a 40%,#1a5c2e 70%,#051005)",label:"Asia y Pacífico"},
  "África y Oriente Medio":{bg:"linear-gradient(135deg,#1a0a00,#3d1e00 40%,#7a3c00 70%,#2a1000)",label:"África y Oriente Medio"},
  "Américas":            {bg:"linear-gradient(135deg,#00001a,#001a3d 40%,#002b5c 70%,#00000f)",label:"Continente americano"},
};
const DEFAULT_STYLE={bg:"linear-gradient(135deg,#1a1209,#3d2b0a 40%,#7a5c1e 70%,#2a1f06)",label:""};
const CAT_ICONS={"Antigüedad":"⚱️","Edad Media":"🏰","S. XVI–XVIII":"⚓","Era Napoleónica":"🎖️","S. XIX":"🏭","I Guerra Mundial":"🪖","II Guerra Mundial":"✈️","Guerra Fría":"☢️","Conflictos Modernos":"🌍","Geopolítica":"🗺️","Asia y Pacífico":"🌏","África y Oriente Medio":"🏜️","Américas":"🌎"};

// ── HEADER ────────────────────────────────────────────────────────────────
function setHeaderStyle(cat){
  const s=CAT_STYLES[cat]||DEFAULT_STYLE;
  document.getElementById('site-header').style.background=s.bg;
  document.getElementById('era-label').textContent=s.label;
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
    overlay.style.background=s.bg;
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
