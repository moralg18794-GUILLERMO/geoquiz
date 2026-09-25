// GeoQuiz — efectos de sonido sintetizados (WebAudio, sin archivos de audio).
// ── AUDIO ──────────────────────────────────────────────────────────────────
let soundOn=true;
const AC=window.AudioContext||window.webkitAudioContext;
let actx=null;
function getCtx(){if(!actx&&AC)actx=new AC();return actx;}
function beep(f,d,t='sine',v=0.3){if(!soundOn)return;const c=getCtx();if(!c)return;const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=f;o.type=t;g.gain.setValueAtTime(v,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+d);o.start(c.currentTime);o.stop(c.currentTime+d);}
function playCorrect(){beep(523,0.08);setTimeout(()=>beep(659,0.12),70);setTimeout(()=>beep(784,0.18),150);}
function playWrong(){beep(220,0.12,'sawtooth',0.2);setTimeout(()=>beep(180,0.18,'sawtooth',0.15),100);}
function playTimeout(){beep(330,0.3,'triangle',0.2);}
function playStart(){beep(440,0.08);setTimeout(()=>beep(554,0.08),90);setTimeout(()=>beep(659,0.12),180);}
function playFinish(){[523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,0.18),i*90));}
function playTick(){beep(800,0.04,'square',0.08);}
function playStreak(){beep(880,0.08);setTimeout(()=>beep(1047,0.12),80);setTimeout(()=>beep(1319,0.2),180);}
document.getElementById('sound-toggle').addEventListener('click',function(){soundOn=!soundOn;this.textContent=soundOn?'🔊':'🔇';});
