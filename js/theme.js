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

// Siluetas de región de la tarjeta de Continentes: país a país, dibujadas con tools/mapas/hacer-mapas.php
// a partir de Natural Earth (dominio público). `hi` es la región; `ctx`, los vecinos en gris.
const GEO_MAPAS={
  eu:{c:"#9cc4ff",vb:"0 0 84 71",hi:"M83 48l-3 3l2 5l0 1l-3 -2l-6 -2l-4 -3l2 -2l-1 -1l2 -1l-1 0l2 -1l0 -3l-5 -2l-2 -3l-2 0l-1 -2l2 0l-3 -3l1 -1l-3 -1l-1 -3l0 -2l2 -3l-2 -1l4 -4l-1 -1l0 -1l-1 -2l1 -1l-1 -3l1 -1l-2 -1l0 -1l4 -2l5 2l5 3l0 1l-3 1l-6 -1l2 1l0 3l3 1l-1 -1l1 -1l2 1l1 0l0 -2l2 -2l2 1l1 -1l-1 -4l3 1l0 1l-1 0l0 1l1 1l4 -3l0 -7l0 55l0 -24l0 9l0 -2l-2 3l-1 -1l-1 4l2 1l1 3zM54 33l-4 0l2 -2l2 1l0 1zM65 48l4 1l0 1l-3 1l0 -1l-2 0l1 -2zM63 5l-3 1l1 -2l-2 -1l-2 1l-1 2l-3 0l-1 -1l-2 1l0 1l-2 -1l0 1l-1 0l-4 6l0 2l-1 0l-1 2l1 3l-2 5l0 -2l-3 3l-1 0l-2 -1l0 -6l6 -5l5 -6l5 -4l4 -1l2 -1l4 0l3 1l-1 0l1 2zM35 42l2 1l-2 5l1 0l0 5l-1 1l-2 -1l-1 1l-1 1l-1 0l-4 -1l1 -6l-2 -2l-2 -1l0 -2l3 1l0 -3l1 1l3 -1l0 -2l1 0l2 2l2 1zM40 25l2 -5l-1 -3l1 -2l1 0l0 -2l4 -6l1 0l0 -1l2 1l1 -2l3 3l1 3l-2 1l-1 2l-4 3l-1 3l2 2l-1 2l-1 1l-1 5l-2 -1l0 2l-1 0l-3 -6zM60 30l3 1l-1 1l3 3l-2 0l1 2l-1 0l-1 2l-6 -2l-2 1l0 -4l3 -1l1 -2l2 -1zM64 37l2 0l2 3l5 2l0 2l-2 2l-4 2l0 1l-3 -1l0 -1l-2 0l-1 3l-1 0l0 -2l2 0l-1 -3l-2 -1l-3 1l-3 0l0 -1l0 -2l2 -2l-1 -2l2 -1l6 2l1 -2l1 0zM54 34l1 2l-1 0l1 4l-2 2l1 1l-2 -1l-3 0l-4 -3l-1 -4l1 -2l3 -1l1 1l5 0l0 1zM47 44l-1 3l-2 1l-2 -2l-2 1l-1 -1l0 -1l4 1l0 -3l4 0l0 1zM53 44l0 1l-1 3l-3 1l-3 -2l1 -3l1 1l3 -1l2 0zM58 44l2 0l2 3l-2 1l0 1l0 -2l-2 -3zM60 49l1 1l-1 0l0 3l-1 -1l-4 1l-1 -1l-1 -1l-1 0l-1 -3l3 -3l2 0l2 -1l2 3l0 2zM58 31l-1 2l-3 1l0 -2l-2 -1l0 -1l4 -1l2 2zM59 27l1 3l-2 1l-2 -2l-4 1l0 -2l1 -1l1 1l1 0l0 -2l1 0l3 1zM59 23l0 4l-4 -1l0 -1l-1 0l0 -1l2 -1l3 0zM44 34l1 5l-3 1l1 3l0 3l-7 -1l1 -2l-2 -1l0 -4l1 -1l0 -3l1 0l1 0l0 -2l1 0l1 2l2 -1l2 1zM53 52l1 0l3 1l2 -1l1 1l-1 2l0 1l-2 0l0 1l-3 0l-1 -5zM57 68l-1 1l-2 -1l1 0l2 0zM54 57l4 0l-1 1l-2 0l0 2l-2 -1l2 5l-1 -1l0 3l-1 0l-2 -6l1 -2l2 -1zM52 58l-1 2l-1 -1l0 -4l2 3zM47 47l2 2l1 1l-1 1l-3 -1l0 1l3 4l-3 -2l-1 -3l-1 0l0 1l-1 -1l0 -1l2 0l2 -2zM39 46l1 2l-4 1l-1 -1l1 -2l3 0zM35 39l-1 3l-3 -3l3 -1l1 1zM36 35l-1 4l-1 -1l-2 0l1 -3l3 0zM18 56l1 -1l0 1l2 0l0 1l-1 3l0 3l-1 2l-1 0l0 -2l-1 -1l1 -6zM20 65l0 -5l1 -3l0 -1l-2 0l0 -1l-1 1l0 -2l1 -1l7 0l2 2l3 0l-1 2l-1 1l-1 3l0 1l-2 4l-3 0l-1 1l-2 -2zM21 34l-1 3l-2 1l-1 0l1 -2l-1 -2l3 -3l0 2l1 1zM40 47l2 -1l2 1l0 2l-2 1l0 1l3 5l4 3l0 1l-2 -1l-1 1l1 2l-1 1l-1 -3l-4 -5l-2 -3l-1 -1l-2 2l0 -1l0 -4l2 0l2 -1zM45 63l0 3l-3 -2l0 -1l3 0zM38 58l0 -1l1 2l0 2l-1 1l-1 -4l1 0zM39 32l-1 0l-1 -3l3 -2l0 1l0 1l-1 2l0 1zM21 34l-1 -1l0 -2l2 2l-1 1zM25 35l-1 -3l-2 0l1 -1l-1 -1l0 1l-1 -3l1 -3l3 0l-2 2l3 0l-1 3l1 0l3 6l1 0l0 3l-1 1l-4 0l-3 1l2 -3l-2 0l0 -1l1 0l0 -3l2 1zM12 10l0 2l1 1l-6 3l-4 -1l1 -1l-3 -1l2 0l0 -1l-2 0l1 -1l1 -1l2 2l2 -1l1 0l4 -1zM44 47l2 0l1 0l-2 2l-2 0l1 -2zM60 6l0 1l2 1l-1 1l1 3l-1 1l1 2l0 1l1 1l-4 4l-5 2l-2 -2l0 -3l1 -3l3 -2l0 -1l-2 -2l0 -2l-3 -3l1 0l1 1l3 0l1 -2l2 -1l2 1l-1 2zM53 43l0 1l-2 0l-3 1l-1 -1l0 -1l2 -1l4 1zM45 39l4 3l-2 2l-2 -1l-1 1l-1 -1l-1 -3l3 -1zM49 55l-3 -3l0 -2l4 1l0 1l-1 3zM53 55l1 2l-2 1l-1 -2l2 -1zM49 49l2 -1l1 3l1 0l0 4l-1 0l0 -1l-1 0l-1 -1l0 -1l-1 -3zM51 55l-1 1l-1 -1l1 -2l1 2z",ctx:"M84 42l0 16l0 -12l0 1l-2 0l0 -2l-2 -1l1 -4l1 1l2 -3l0 2l0 -9l0 11zM0 0l14 0l-14 0l3 1l1 2l-2 0l-2 -2l0 2l3 1l-3 1l0 17l0 -22zM39 71l-3 0l1 -6l2 0l0 1l1 -1l-1 5l2 1l-2 0zM18 71l9 0l-1 -2l1 -1l3 -2l4 0l1 -1l2 0l0 6l4 0l-23 0zM72 71l2 -1l0 -4l2 -2l2 1l2 3l-1 3l3 0l-10 0zM82 71l-3 0l1 -2l-2 -6l-1 -2l1 -1l2 2l2 -2l0 2l2 2l0 2l0 -3l0 8l-2 0zM68 71l1 -1l-1 -2l1 -2l3 0l3 -1l-1 1l0 4l-6 1zM80 62l-3 -3l0 -1l1 -1l2 5zM78 65l-2 -1l-4 2l-3 0l0 1l0 -1l-2 0l-1 1l-2 0l-2 -1l-1 1l-2 -1l-2 -5l2 -2l1 0l1 -2l2 1l3 -2l1 0l4 2l5 -1l2 3l-1 1l1 4zM57 56l2 0l2 1l-3 2l-1 -3zM80 56l2 1l0 -1l2 3l-1 4l-1 -3l-2 2l-1 -2l-1 -3l2 1l0 -2zM73 53l6 2l1 3l-5 -1l-1 -2l-1 -2zM26 69l1 2l-18 0l11 0l1 -4l5 2z"},
  as:{c:"#8fe6b0",vb:"0 0 84 73",hi:"M19 5l-5 3l0 2l-4 -1l-4 2l-1 -1l-1 -1l-3 0l-1 -2l0 3l0 -7l0 1l1 -1l-1 0l1 -1l0 -1l5 -1l3 2l3 -1l2 3l2 0l3 1zM0 10l0 -3l1 2l3 0l1 1l1 1l2 -1l-1 0l2 1l-2 0l-2 1l1 1l-6 -3l0 -1l0 1zM57 41l4 3l0 1l3 2l-2 -1l-3 -1l-1 1l-1 0l0 -5zM57 41l0 5l-3 -1l1 -1l0 -1l-4 -1l-1 -1l2 0l-3 -1l3 0l1 2l1 -1l3 0zM41 36l-1 1l1 2l-1 0l-1 3l-4 -1l-1 -2l1 -1l0 1l3 -1l1 -2l2 0zM44 39l2 -1l-1 1l-3 0l0 1l1 0l1 0l-1 1l1 2l-1 0l0 -2l-1 2l-1 -2l1 -2l2 0zM34 44l5 1l-6 0l-1 -1l0 -1l2 1zM31 40l1 1l0 2l-1 0l-6 -7l1 0l5 4zM0 7l0 -7l84 0l-13 0l1 0l0 1l-4 3l-1 -4l6 0l-18 0l-2 1l4 1l-1 3l-4 4l-2 1l0 -2l1 0l2 -3l-3 1l-3 -2l-1 -2l-1 0l-3 0l1 1l-2 2l-3 -1l-4 1l-7 -2l-1 1l-3 0l-4 1l-3 -1l-2 0l-2 -3l-3 1l-3 -2l-5 2l-1 1l1 0l-1 1l0 -1l0 4zM58 2l1 3l-1 0l1 2l-1 0l-1 -4l1 -2l0 1zM30 31l0 -2l3 0l-1 3l-2 0l0 -1zM32 29l-2 0l0 2l-2 -1l-1 2l3 3l-1 0l-2 -1l1 -3l-2 -5l2 -1l1 1l0 1l2 0l1 2zM33 29l-1 0l-1 -2l-2 0l0 -1l-1 -1l1 -1l2 1l0 1l2 2l0 1zM28 25l-2 1l2 5l-1 1l-1 -5l-2 1l0 -1l-1 -3l2 -3l2 -2l0 2l-1 2l3 1l-1 1zM31 32l2 -1l0 -2l-2 -3l0 -1l-1 -1l2 -1l2 1l-2 2l3 4l-1 1l-2 2l-1 -1zM49 10l-2 1l1 1l-3 1l1 -2l3 -1zM46 13l2 -1l0 3l-1 0l-1 -2zM19 5l4 -1l3 0l1 -1l7 2l6 -1l-1 2l2 0l1 1l-6 1l-1 1l-3 1l-7 -1l0 -1l-3 0l0 -2l-3 -1zM26 20l-3 4l-1 -1l1 -1l-3 -1l0 3l-1 0l-5 4l0 4l-2 2l-2 -6l-1 -4l-2 1l-1 -2l2 -1l-1 -2l4 -3l-1 -2l3 -1l0 3l2 1l-1 1l2 1l4 1l0 -1l2 1l0 -1l3 -1l1 1zM23 24l0 1l-1 -2l-2 1l0 -3l3 1l-1 1l1 1zM20 20l-1 1l-5 -2l1 -1l5 2zM13 14l-3 1l1 2l-4 3l1 2l-2 1l-1 -1l-4 0l1 -2l-1 -2l3 0l1 -1l2 0l1 -3l3 -1l2 1zM5 13l1 0l2 -1l0 2l3 -1l-3 1l-1 3l-2 0l-1 1l-3 0l-1 -2l1 -2l1 1l3 -2zM6 13l-1 -1l3 -1l-1 1l3 0l1 1l-3 1l0 -2l-2 1zM8 10l2 -1l4 1l-6 2l-1 0l2 -1l-2 -1l1 0zM0 10l0 -1l0 1l5 3l-3 2l-1 -1l-1 -1l0 -3zM82 67l-2 1l1 0l-1 -1l0 -1l-1 -2l2 1l2 1l-1 1zM77 70l2 -2l1 0l-1 2l-1 0l-1 2l-2 0l2 -2zM61 68l1 2l-2 0l-1 -2l2 0zM46 62l-1 1l-4 1l-2 -1l0 -1l-2 -4l1 0l0 -3l5 -2l3 -4l3 1l2 -3l3 1l-1 2l3 2l2 -5l3 6l3 2l2 4l-3 7l-3 1l0 -1l-1 1l-3 -1l-1 -3l-1 1l1 -2l-2 2l-1 -2l-2 -1l-4 1zM14 10l0 -2l5 -3l3 1l0 2l3 0l0 1l7 1l3 0l1 -1l0 -1l6 -1l-3 -1l1 -2l2 0l1 -2l3 0l1 2l3 2l3 -1l-2 3l-1 0l-1 2l-6 2l0 -1l-3 1l2 1l2 0l-3 2l2 2l0 3l-2 2l-6 3l0 -1l-3 -1l-3 1l-1 0l-1 -2l-1 1l1 -3l-2 -1l-5 1l-7 -3l0 -2l-2 -1l-1 -2l4 -2zM47 33l-1 2l-1 -1l-2 0l3 -2l1 1zM44 27l-1 2l2 1l0 1l-3 -1l0 -1l1 -3l1 1zM28 35l2 0l1 3l-2 -1l-1 -2zM41 36l-2 0l-1 2l-3 0l3 -2l1 0l1 -2l1 2zM57 12l-1 3l-3 1l0 -1l-3 1l-1 1l0 -1l2 -2l2 0l1 -1l2 0l0 -3l1 0l0 2zM59 8l1 1l-4 1l1 -3l2 1z",ctx:"M0 18l0 -7l0 3l0 -1l1 1l-1 2l1 1l0 1l1 2l-1 2l-1 0l0 -4z"},
  af:{c:"#ffb877",vb:"0 0 83 84",hi:"M61 44l6 4l0 3l1 0l-1 2l2 2l-1 1l-6 0l-1 -2l-3 -1l-2 -2l0 -3l2 -1l-1 -3l4 0zM13 12l0 2l-4 0l0 3l-1 0l0 2l-5 0l3 0l1 -3l3 -3l3 -1zM56 48l2 5l-3 0l0 4l1 0l0 1l-2 -2l-6 0l-1 -5l-1 0l-2 1l-1 0l-2 -2l-4 0l1 -2l1 1l2 -2l0 -2l2 -1l1 -6l1 -1l3 2l2 -2l6 1l2 3l-1 1l-1 4l0 2zM70 45l-1 -1l0 -4l2 -2l3 0l4 -6l0 -2l3 0l-3 7l-8 8zM67 48l-6 -4l2 -3l-2 -3l2 -1l3 2l4 0l-1 1l0 4l1 1l-3 3zM51 34l-2 -1l0 -1l-1 -3l1 -4l1 0l0 -5l1 0l0 -2l14 0l0 4l1 1l-1 1l-1 4l-2 3l-1 2l-1 -4l-2 3l-1 0l-1 1l-3 -1l-1 -1l-2 2l1 1zM50 21l0 4l-1 0l-1 4l1 2l-6 3l-3 1l-1 -3l1 0l-1 -4l-1 -1l2 -3l1 -4l-1 -3l1 0l9 4zM41 76l1 -1l2 1l1 -1l0 -4l1 3l1 0l2 -2l3 0l4 -4l2 0l1 3l0 2l-1 -1l0 2l2 0l-1 2l-5 5l-9 2l-2 -1l0 -3l-2 -3zM58 68l-3 0l-4 -5l2 1l4 -3l3 1l0 4l-2 2zM56 68l-4 4l-3 0l-2 2l-1 0l-1 -3l0 -3l1 0l0 -4l5 -1l4 5l1 0zM45 71l0 4l-1 1l-2 -1l-1 1l-1 -2l-1 -6l-3 -5l15 0l-5 1l0 4l-1 0l0 3zM4 28l-1 -2l1 -1l2 -1l3 3l1 2l-6 0l0 -1l3 0l-3 0zM10 29l-1 -2l1 -1l6 0l-1 -11l2 0l8 5l1 2l2 -1l-1 5l-5 0l-4 2l-1 3l-3 1l-2 -3l-1 1l-1 -1zM3 19l5 0l0 -2l1 0l0 -3l4 0l0 -2l4 3l-2 0l1 11l-6 0l-1 1l-3 -3l-2 1l0 -5l-1 -1zM26 36l-1 0l0 -3l-1 -2l2 -2l1 2l-1 3l0 2zM40 17l1 3l-1 4l-2 3l1 1l0 1l-1 -1l-5 1l-4 -2l-2 1l0 2l-3 -1l-1 -3l4 0l1 -5l8 -4l3 1l1 -1zM26 36l2 -8l5 1l5 -1l1 1l-3 6l-2 0l-2 3l-3 0l-1 -2l-2 0zM39 29l1 3l-1 0l1 2l-1 4l2 2l0 1l-7 0l-2 -3l1 -1l1 -2l2 0l3 -5l0 -1zM24 31l1 5l-1 0l-1 -5l1 0zM23 31l1 5l-4 2l-1 -7l4 0zM14 32l6 0l0 6l-6 0l0 -1l-1 -1l1 -4zM7 29l6 0l1 3l-1 2l-1 1l0 -2l-1 1l-1 -2l-2 1l-2 -2l1 -1l0 -1zM4 29l3 0l0 1l-1 1l-2 -2zM13 34l1 4l-4 -3l2 -2l0 2l1 -1zM8 33l2 -1l1 2l-1 1l-2 -1l0 -1zM17 31l1 -3l4 -2l1 0l1 3l1 0l-1 2l-5 0l1 1l-3 -1zM54 37l-4 0l-2 2l-3 -2l-1 2l-2 0l-1 2l-2 -3l1 -3l3 -1l6 -3l0 2l5 4zM44 39l-1 5l-2 1l0 3l-2 1l-2 -1l-1 1l-1 -1l1 -1l0 -1l1 -1l2 1l0 -1l-1 -2l1 -1l-1 0l0 -1l3 0l1 -2l2 0zM36 41l1 0l1 1l1 0l-1 1l1 2l0 1l-2 -1l-1 1l0 1l-1 1l-2 -4l1 -2l2 0l0 -1zM58 53l2 1l0 5l-3 1l0 1l-4 3l-4 -1l-1 -2l0 -3l2 0l0 -2l4 0l2 2l0 -1l-1 0l0 -3l0 -1l3 0zM60 54l2 1l0 4l1 1l0 2l-1 0l0 -2l-2 -1l1 -4l-1 -1zM62 56l3 0l4 -1l0 5l-1 2l-6 4l1 4l-3 2l0 2l-1 0l-1 -6l2 -2l0 -4l-3 -1l0 -1l4 -1l2 3l0 -2l-1 -1l0 -3zM37 50l4 0l2 2l1 0l2 -1l1 0l1 5l2 0l0 2l-2 0l0 3l1 2l-13 0l1 -3l1 -4l-1 -6zM79 57l1 4l-1 0l-3 10l-2 1l-1 0l-1 -3l1 -4l0 -2l0 -1l2 -1l4 -4zM34 9l-3 -5l1 -3l2 0l1 0l-1 3l2 2l-2 3zM13 12l0 -2l8 -3l-1 -4l4 -1l8 -1l-1 3l2 3l1 3l-1 4l1 2l2 1l-7 4l-3 1l-1 -2l-12 -8zM64 27l1 -3l1 -1l1 2l5 4l-5 -3l-3 1zM20 3l1 4l-8 3l0 2l-3 1l-3 3l-1 3l-3 0l3 -6l6 -4l0 -3l3 -2l1 -1l4 0zM65 18l-14 0l0 -10l11 0l0 2l0 2l-3 -3l4 7l0 1l2 1zM51 18l0 2l-1 1l-9 -4l-2 1l-5 -2l-1 -2l1 -6l2 -2l4 1l1 1l3 1l2 -3l5 1l0 11zM77 34l-3 4l-4 1l-1 -1l-1 1l-4 -1l-2 -2l-2 -2l1 -1l1 -2l2 -4l1 0l1 -1l3 1l2 2l-1 2l1 0l1 2l5 1zM78 30l0 2l-1 2l-5 -1l-1 -2l1 -1l1 1l5 -1zM61 44l-5 1l2 -6l3 -1l1 1l1 2l-2 3zM58 39l-2 -1l-1 0l-5 -5l2 -2l1 1l3 1l1 -1l1 0l2 -1l-1 -1l1 -1l1 4l-1 1l3 3l-2 2l-3 0z",ctx:"M63 6l-1 4l0 -2l1 -2l0 -1l0 1zM63 6l2 1l2 -2l0 2l-2 0l1 2l-2 1l-2 0l1 -4zM81 16l2 0l0 -2l0 4l-2 -2zM67 7l0 -2l2 -1l1 -2l1 -1l3 0l1 2l-1 2l2 1l2 3l-5 1l-6 -3zM83 17l0 7l-1 -2l1 -2l0 -3zM78 9l-2 -3l-2 -1l1 -2l-2 -3l5 0l4 2l1 -1l0 -1l0 15l0 -3l0 1l-2 -1l-1 -3l-2 0zM63 6l1 -2l0 -1l0 -2l7 0l-1 1l-1 2l-4 3l-2 -1zM49 0l4 0l-5 0l2 0l-1 1l0 1l-3 -2l3 0zM74 1l-10 0l0 2l0 -1l-2 -1l-6 1l-4 -2l22 0l-1 0l1 1zM12 0l3 0l-1 0l0 1l-1 0l-1 -1zM14 1l0 -1l1 0l-3 0l14 0l-4 0l-2 2l-3 0l-3 -1zM82 22l1 2l-1 1l-10 4l-1 -3l1 -3l4 1l2 -2l4 0zM62 10l3 -1l1 0l-1 -2l2 0l6 3l5 1l4 6l1 0l0 3l-1 2l-5 1l-1 1l-4 -1l-1 2l-4 -6l-1 -3l-4 -5l0 -1z"},
  me:{c:"#f5d98a",vb:"0 0 84 74",hi:"M22 24l-1 0l-1 2l1 0l-1 1l1 0l-1 4l-1 -4l2 -4l1 -1l0 2zM22 22l-1 1l2 -4l1 0l0 1l-2 2zM22 24l2 1l4 -3l1 3l-4 1l2 3l-4 3l-3 -1l2 -7zM55 43l4 0l5 -4l0 1l0 2l-1 0l1 1l-1 1l-1 3l-7 -1l0 -3zM53 42l0 -2l1 -1l1 1l-1 2l-1 0zM47 30l1 3l-4 -1l2 -2l1 0zM29 25l-1 -3l5 -2l0 -5l3 -2l5 0l1 3l1 1l0 1l-1 3l1 2l3 1l1 2l0 2l1 2l-2 0l-2 2l-4 0l-5 -5l-6 -2zM62 47l1 -3l1 -1l-1 -1l1 0l2 2l3 1l2 3l-2 4l-2 0l0 3l-2 1l-1 2l-2 0l-1 2l-3 1l-3 -6l7 -2l1 -5l-1 -1zM48 30l-1 -2l0 -2l-1 -2l-3 -1l-1 -2l1 -3l0 -1l-1 -1l-3 -4l0 -4l2 0l1 2l1 0l4 -2l1 1l-1 1l2 1l1 2l6 2l3 -1l4 -2l3 -1l8 4l-1 6l1 1l-1 1l1 3l1 1l0 1l-1 2l1 3l2 1l0 2l2 1l-3 2l-1 2l-9 -1l0 -3l-1 0l-4 1l-3 -1l-4 -2l-2 -5l-3 -1l-1 1zM22 24l1 -3l1 -1l-1 -1l-1 -1l2 -4l6 0l6 -1l-3 2l0 5l-9 5l-2 -1zM41 13l-5 0l-6 1l-6 0l-1 3l-1 -1l1 -1l-3 -1l-1 2l-4 0l-1 -1l-2 0l-2 1l-2 -1l-3 0l-2 -4l1 -2l-2 -1l3 -2l3 0l1 -2l4 0l4 -2l4 0l6 3l5 0l4 -2l2 1l0 2l3 2l-2 0l0 4l2 1zM2 3l4 -1l2 2l-3 1l-2 2l-1 -1l1 -3l-1 0zM55 55l3 6l-2 0l0 2l-6 2l-1 2l-7 1l-1 2l-3 0l-2 -6l2 -5l7 0l0 1l4 -4l6 -1zM20 31l3 1l3 -2l1 -1l-2 -3l4 -1l6 2l5 5l6 0l1 1l1 0l1 2l3 3l0 2l1 2l1 0l1 4l7 1l1 1l-1 5l-7 2l-6 1l-4 4l0 -1l-7 0l-2 2l-3 -7l-4 -4l-1 -6l-2 -1l-5 -9l-1 0l0 -3zM16 18l2 0l-2 1l-1 -1l1 0z",ctx:"M84 0l0 5l0 -5l-21 0l0 4l-1 0l-2 -2l-4 1l0 -2l-4 -1l6 0l-14 0l40 0zM63 4l0 -4l21 0l0 14l0 -2l-7 -5l-1 -3l-4 0l0 -2l-3 -1l-4 2l1 1l-3 0zM34 74l15 0l0 -1l5 -2l-1 3l-19 0zM0 74l0 -26l24 0l2 8l2 2l-4 2l-1 8l-3 6l-3 0l0 -3l-1 0l-1 0l0 2l-15 1zM49 0l-5 0l2 0l2 3l-1 1l-5 -3l-6 -1l-31 0l79 0l0 2l0 -2l-35 0zM21 27l-1 0l1 -3l1 0l-1 3zM84 17l0 27l0 -4l-9 1l1 -2l3 -2l-2 -1l0 -2l-2 -1l-1 -3l3 2l5 -1l2 -1l0 -13zM84 13l0 17l-2 1l-5 1l-3 -2l1 -2l0 -1l-1 -1l-1 -3l1 -1l-1 -1l1 -4l4 1l0 -2l3 -1l0 -1l3 -2l0 1zM56 3l4 -1l2 2l4 0l-1 -1l4 -2l3 1l1 2l3 0l1 3l7 5l0 1l0 -1l-3 2l0 1l-5 3l-2 -1l0 -2l-8 -4l-3 1l-4 1l0 -4l-1 0l0 -2l-1 0l0 -2l2 0l2 0l-2 -3l-2 1l0 1l-1 -1zM44 10l-1 0l0 -2l-5 -2l0 -2l3 0l1 1l0 1l1 0l-1 1l2 1l0 2zM0 0l7 0l-1 1l0 1l-2 0l-2 1l0 1l-2 0l0 -4zM3 18l-1 0l-2 1l0 -2l0 1l3 0zM0 4l2 0l0 -1l1 0l-1 2l-2 0l0 10l0 -11zM44 3l3 1l1 -1l2 3l2 0l-2 1l-1 4l-2 -1l1 -1l-1 -1l-3 2l0 -2l-2 -1l1 -1l-2 -2l3 1l-1 -2l1 0zM31 0l11 1l2 2l-1 0l1 1l-3 0l-3 0l-2 -1l-2 0l0 -2l-3 -1zM23 66l1 -6l4 -2l1 4l8 8l-1 0l-3 -4l-2 0l-3 0l-2 -1l0 1l-3 0zM24 48l-24 0l0 -22l3 0l5 2l4 -2l2 1l0 1l1 -1l3 1l1 -1l1 4l-1 4l-1 0l-3 -5l7 14l0 2l2 2zM47 74l-31 0l4 0l2 -4l1 -4l3 0l0 -1l2 1l3 0l3 2l2 2l-2 2l0 2l13 0zM36 70l1 0l1 0l0 1l-2 1l1 1l-1 1l-2 0l0 -2l2 -2zM49 73l0 1l-13 0l1 -1l1 1l6 0l5 -1zM12 74l-12 0l15 -1l0 -2l1 0l1 0l0 3l1 0l-2 0l5 0l-9 0z"},
  am:{c:"#7fc0ff",vb:"0 0 84 80",hi:"M29 14l-3 -1l-2 -2l1 -1l-2 -2l-5 -1l0 -6l3 1l5 -1l12 2l1 -1l3 1l2 -1l1 1l2 -1l-2 -1l1 -1l3 2l1 0l1 1l1 -2l2 0l0 1l0 1l-2 0l-5 4l-1 1l2 1l6 1l1 3l1 -1l-1 -1l2 -1l-1 -2l1 0l-1 -2l3 0l3 1l0 1l1 1l2 -2l1 3l3 1l1 1l-3 2l-3 0l-3 2l2 -2l2 0l0 2l2 0l1 0l-4 2l0 -1l1 0l-2 0l-1 -2l-2 2l-2 0l-4 2l0 -2l-4 -2l-4 -1l-17 0zM70 13l-1 1l2 0l1 2l-1 -1l-3 0l2 -2zM53 4l2 1l-4 0l1 -1l1 0zM56 0l6 1l1 1l-1 0l4 1l-1 1l-2 0l2 1l-3 0l2 1l-6 -1l-1 0l0 -1l2 0l0 -2l-3 -1l-6 0l-1 -1l7 0zM30 0l3 0l-4 1l-2 -1l3 0zM39 0l3 1l-1 1l-6 0l-3 -1l3 0l-4 -1l8 0zM29 14l17 0l4 1l4 2l0 2l4 -2l2 0l2 -2l1 2l-2 1l0 1l-3 1l0 2l-1 -2l1 3l-4 2l1 4l-2 -3l-2 0l-2 0l0 1l-3 -1l-2 3l-2 -3l-1 1l-2 -2l-7 -1l-2 -1l-2 -3l0 -5l1 0l0 -1zM18 1l0 6l2 1l1 0l4 2l-1 1l-2 -2l-3 -1l-5 -1l-3 1l1 -1l-5 3l-4 1l4 -2l1 -1l-3 0l-2 -1l0 -1l3 -1l-5 -1l4 0l-3 -2l6 -2l10 1zM69 63l-1 3l1 1l-1 2l-2 0l0 1l-2 0l1 1l-2 2l1 1l-2 2l0 1l-2 0l-1 -2l2 -3l-1 -2l2 -10l2 -2l2 0l3 2l-1 1l1 1l1 0l1 -2l0 1l-2 2zM62 77l0 2l1 0l-1 0l-3 -2l2 1l1 -1zM62 55l1 4l-2 5l0 2l-1 5l1 1l-2 3l1 2l2 0l-2 1l-2 -1l0 -2l1 -1l-1 -1l2 -2l-1 0l0 -3l1 -3l2 -10zM76 0l8 0l0 3l-4 1l-2 3l-3 0l-2 -2l-2 -2l2 -2l-2 1l0 -1l2 0l-2 -1l-12 0l17 0zM32 24l7 1l2 1l1 0l2 2l1 1l-1 2l1 2l3 0l1 -1l2 -1l-1 2l-2 1l1 1l-1 1l-7 -3l-6 -8l-1 0l0 1l3 4l-3 -3l-2 -3zM69 63l2 1l0 2l-3 0l1 -3zM72 65l-1 -1l-2 -1l2 -2l-1 -3l-1 0l0 -3l-2 0l0 -2l-3 -1l0 -1l-3 0l0 -1l-2 0l0 -1l1 -1l1 -1l0 -3l3 0l1 -1l0 -1l2 -1l1 3l4 -1l1 -1l0 3l4 1l3 0l2 2l1 1l-2 4l-2 5l-4 2l-1 2l-2 3zM62 51l2 0l0 1l3 1l0 2l2 0l0 2l-3 0l0 1l-2 0l-1 1l-1 -8zM61 47l-1 1l-1 1l0 1l2 0l1 2l-1 4l-3 -2l-4 -6l1 -1l1 1l2 -3l1 1l2 0l0 1zM63 44l-2 0l0 3l0 -1l-2 0l-3 -2l1 -2l0 -3l4 -2l-2 2l1 1l3 1l0 3zM57 39l0 1l-1 -1l-1 1l-2 -1l4 0zM53 35l-2 2l-2 -1l3 -1l1 0zM67 41l-2 1l0 1l-1 1l-1 -1l0 -2l-3 -1l0 -2l1 -1l0 2l0 -2l1 1l4 0l2 1l-1 1l0 1zM70 43l-2 0l0 -2l-1 0l1 -2l1 2l0 1l1 1zM58 45l-2 3l-1 -1l0 -3l3 1zM54 30l5 2l-2 0l-3 -1l-2 0l2 -1zM69 57l0 1l2 1l-1 3l-2 -1l1 -1l-3 -2l0 -1l3 0z",ctx:""},
  gl:{c:"#c6b8ff",vb:"0 0 84 34",hi:"M49 20l1 1l1 1l-2 0l-1 -1l0 -1l1 0zM11 8l-3 -3l-1 0l0 -2l8 0l3 0l0 -1l2 1l1 0l-3 1l1 2l3 1l0 -3l1 0l2 1l2 2l-3 1l1 0l1 1l-1 0l-1 -1l-3 1l-1 -1l-9 0zM22 2l4 1l-2 1l1 0l-3 0l1 -1l-4 -1l3 0zM19 0l7 0l-4 1l-3 0l1 0l0 -1l1 0l-2 0zM11 8l9 0l1 1l3 -1l1 1l-3 1l1 1l-2 1l1 1l-2 -1l-3 1l-2 -1l-3 -1l-1 -1l0 -2zM7 3l0 2l3 1l-1 -1l-4 0l-4 1l2 -1l-2 0l1 -1l-1 0l1 -1l-1 0l6 0zM62 8l-2 1l-3 1l-2 -2l-1 2l-1 -1l1 -1l-2 0l5 -2l5 2zM54 10l1 -2l3 2l-1 1l-2 -2l-1 1zM27 27l0 2l-2 1l-1 2l1 -7l1 0l1 1l1 0l-1 1zM24 24l1 1l-2 7l1 0l0 1l-1 -1l0 -1l1 -7zM48 21l0 2l-2 -1l0 -1l-2 0l2 -3l2 1l0 2zM50 21l-1 -1l0 -2l2 1l-1 2zM47 18l-1 -2l1 -2l3 0l0 1l-1 2l-2 1zM47 15l-1 2l-1 1l-1 -4l3 1zM53 8l-1 2l-2 -1l0 -2l-3 -1l1 -2l0 -1l1 0l2 0l-2 0l1 1l1 -1l6 0l0 -1l1 0l0 1l1 -1l7 -1l2 0l-1 1l5 0l3 0l9 1l0 1l-4 1l-2 2l0 -2l2 -1l-5 1l-2 1l2 1l-2 2l-1 0l1 -1l-1 0l-1 -1l-2 1l-4 -1l-3 1l-5 -2l-2 0l0 1l-3 0l1 1zM54 2l3 -1l-2 0l-1 1l1 0l-2 0l1 0zM44 0l2 0l-1 1l-2 -1l1 0zM48 3l-3 0l-1 2l-2 0l3 -2l3 0zM30 0l8 0l-2 0l0 1l-1 1l1 0l-5 2l-1 1l-2 -1l0 -1l1 0l-1 -1l1 0l-2 -1l-4 0l7 -1zM45 27l3 -2l1 1l-1 2l-2 0l-1 -1zM13 12l4 0l1 3l2 0l-1 1l-2 -1l-4 -3zM28 28l-1 -1l1 -1l-1 -2l-2 -2l-1 0l-1 -1l1 0l0 -2l1 0l1 -1l1 1l2 0l0 1l4 1l-2 4l-1 0l-2 3zM24 22l1 0l2 2l-2 1l-1 -3zM24 21l-1 0l1 2l0 1l-3 -3l2 -1l1 1zM25 19l-1 0l0 2l-2 -1l0 -3l2 0l-1 0l2 1l0 1zM26 18l-1 1l-2 -2l3 0l0 1zM42 8l1 1l-1 0l-2 -1l2 0zM46 26l0 1l-1 -1l-1 -2l3 0l-1 0l0 2zM38 17l0 -1l2 0l-1 -2l3 1l0 1l-3 1l-1 0zM37 14l2 -1l1 1l0 2l-3 0l0 -2zM44 14l0 3l-3 -1l1 -1l2 -1zM41 18l1 -2l2 1l-1 2l-2 -1zM47 18l-2 1l-1 -1l2 -1l1 1zM48 22l1 1l-3 1l1 -2l1 1l0 -1zM49 22l2 0l0 1l-2 3l0 -2l-1 -1l1 1l0 -2zM44 21l2 0l0 3l-2 0l0 -3zM39 13l2 -1l0 -1l2 0l1 3l-2 1l-3 -2zM66 16l-1 0l0 2l-1 0l0 -3l2 1zM65 15l0 2l-2 -3l1 -1l1 2zM66 17l1 -1l-2 -2l1 0l1 3l-1 0zM62 8l3 -1l5 1l-4 1l-3 0l-1 -1zM64 13l-1 1l-1 -1l0 1l-2 2l-1 2l-1 -4l-1 0l2 -2l0 -1l1 0l1 2l3 0zM60 11l-1 0l-1 3l-2 -1l-1 -1l2 0l1 -1l2 0zM57 10l2 1l-2 1l-2 0l1 -1l1 -1zM53 9l2 0l2 1l-3 1l-1 -2zM53 12l-2 -2l3 0l2 1l0 2l-1 0l-2 -1zM43 5l2 -2l1 0l-1 3l-2 -1zM48 7l2 0l-1 1l-3 0l0 -1l2 0zM52 11l-4 0l-1 -1l4 -1l1 2zM39 11l0 -2l3 0l-2 2l-1 0zM71 27l-2 1l-1 -3l4 -3l2 1l-1 0l2 1l0 -2l3 4l-2 3l-2 -1l-3 -1zM60 9l2 -1l2 1l3 0l3 -1l-1 0l1 -1l3 1l-1 1l-3 1l1 0l-1 1l1 2l-3 2l-1 -1l-1 0l-1 -2l-2 1l-2 -1l-1 -2l1 -1zM49 12l1 0l2 0l2 3l-3 1l-2 -4zM40 11l1 1l-4 2l2 -3l1 0zM50 14l-3 0l0 -2l2 0l1 2zM47 14l0 1l-4 -1l0 -2l4 0l0 2zM52 18l-2 1l-1 -1l1 -2l2 2z",ctx:""},
};
function geoMapaSvg(code){
  const m=GEO_MAPAS[code];if(!m)return null;
  return '<svg class="geo-mapa" viewBox="'+m.vb+'" aria-hidden="true" focusable="false">'
    +(m.ctx?'<path class="gm-ctx" d="'+m.ctx+'"/>':'')
    +'<path class="gm-hi" style="fill:'+m.c+'" d="'+m.hi+'"/></svg>';
}

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
