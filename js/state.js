// GeoQuiz — estado global de la partida.
// ── STATE ─────────────────────────────────────────────────────────────────
let selectedCats=new Set(),selectedDiff='all',gameMode='solo';
// Cómo se filtra el banco: por categoría cronológica ('epocas') o por temática ('tematicas').
let filterMode='epocas',selectedThemes=new Set();
let gameQ=[],current=0,score=0,correct=0,wrong=0,lives=3,maxStreak=0,streak=0;
let hint5050=true,hintSkip=true,hintDato=true;
let timerInt=null,blitzInt=null,timeLeft=20,blitzLeft=60;
let answered=false,skipped=0;
let duel={p1:{name:'J1',score:0,lives:3},p2:{name:'J2',score:0,lives:3},turn:1};
let seenQ=new Set();
let lastCat='';

// ── MULTIPLIER ────────────────────────────────────────────────────────────
function getMultiplier(){if(streak>=6)return 3;if(streak>=3)return 2;return 1;}
