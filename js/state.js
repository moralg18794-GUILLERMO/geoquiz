// GeoQuiz — estado global de la partida.
// ── STATE ─────────────────────────────────────────────────────────────────
let selectedCats=new Set(),selectedDiff='all',gameMode='solo';
// Cómo se filtra el banco: por categoría cronológica ('epocas') o por temática ('tematicas').
let filterMode='epocas',selectedThemes=new Set();

// Ajustes CONGELADOS al pulsar Empezar. Lo que se guarda en el ranking tiene que ser
// la partida que se jugó, no lo que hubiera seleccionado en el menú al terminarla: la
// barra Jugar/Récords/Ranking sigue visible durante la partida y showTab() no detiene
// los cronómetros, así que se podía empezar en Fácil, volver al menú a mitad, marcar
// Difícil y las 13 épocas, y dejar que el tiempo se agotara para guardar una partida
// farmeada en Fácil con la etiqueta de Difícil.
//   modo/dif  códigos, nunca etiquetas: 'solo', 'dificil', 'na'
//   eje       'e' épocas, 't' temáticas, 'n' no aplica (cronológico y fechas)
//   nsel/ntot cuántas de cuántas, que es lo único de la selección que viaja al servidor
//   cats      el texto largo, solo para los récords de este dispositivo
let partida={modo:'solo',dif:'all',eje:'e',nsel:0,ntot:0,cats:''};
let gameQ=[],current=0,score=0,correct=0,wrong=0,lives=3,maxStreak=0,streak=0;
let hint5050=true,hintSkip=true,hintDato=true;
let timerInt=null,blitzInt=null,timeLeft=20,blitzLeft=60;
let answered=false,skipped=0;
let duel={p1:{name:'J1',score:0,lives:3},p2:{name:'J2',score:0,lives:3},turn:1};
let seenQ=new Set();
let lastCat='';

// ── MULTIPLIER ────────────────────────────────────────────────────────────
function getMultiplier(){if(streak>=6)return 3;if(streak>=3)return 2;return 1;}
