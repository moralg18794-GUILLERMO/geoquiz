# GeoQuiz — Guerras & Conflictos

Juego de trivia sobre geopolítica, guerras y conflictos, en español.
Sitio estático puro: **sin dependencias, sin frameworks y sin proceso de build**.
Se abre haciendo doble clic en `index.html` y se publica subiendo la carpeta tal cual.

**Jugar online:** https://moralg18794-guillermo.github.io/geoquiz/

---

## Estado del proyecto

- **411 preguntas** tipo test repartidas en **13 categorías**: Antigüedad, Edad Media,
  S. XVI–XVIII, Era Napoleónica, S. XIX, I Guerra Mundial, II Guerra Mundial, Guerra Fría,
  Conflictos Modernos, Geopolítica, Asia y Pacífico, África y Oriente Medio, Américas.
  Todas con pista y explicación.
- **Dificultad y puntos:** fácil = 100 pts, medio = 200 pts, difícil = 300 pts.
- **72 eventos históricos** para el modo Cronológico.
- **5 modos de juego:**
  | Modo | Descripción |
  |---|---|
  | Solo | 10 preguntas, 20 s por pregunta, 3 vidas |
  | Blitz | 60 s para todo |
  | Supervivencia | Preguntas infinitas hasta perder las 3 vidas |
  | Cronológico | 5 rondas ordenando 5 eventos por fecha (arrastrando), 45 s por ronda |
  | Duelo | 2 jugadores en el mismo dispositivo, por turnos |
- **Comodines** (uno de cada por partida, desactivados en Duelo): 50:50, Dato (pista) y
  Saltar (añade una pregunta al final para mantener el total de 10).
- **Multiplicador por racha:** x2 a partir de 3 aciertos seguidos, x3 a partir de 6.
- **Récords** (top 10) y **Ranking** con nombre (top 20), guardados en `localStorage`
  del navegador: son **por dispositivo**, no se comparten entre usuarios.
- Compartir resultado y "retar amigos" copiando texto al portapapeles.
- Tema visual por época: cada categoría cambia el degradado de la cabecera.
- Sonido sintetizado con WebAudio (sin archivos de audio), con interruptor en la cabecera.

## Estructura

```
GEOQUIZ/
├── index.html                  Marcado de las 6 pantallas
├── css/styles.css              Todo el CSS (variables en :root)
├── js/
│   ├── data/questions.js       Las 411 preguntas  ← aquí se añaden preguntas
│   ├── data/events.js          Los 72 eventos     ← aquí se añaden eventos
│   ├── state.js                Estado global de la partida
│   ├── audio.js                Efectos de sonido
│   ├── utils.js                shuffle() y toast()
│   ├── theme.js                Colores/iconos por categoría, cabecera, transiciones
│   ├── storage.js              Récords, ranking, pestañas y reto por URL
│   ├── crono.js                Modo Cronológico
│   ├── game.js                 Bucle de juego y pantalla de resultado
│   ├── menu.js                 Pantalla de menú
│   └── main.js                 Arranque (debe cargarse el último)
├── docs/                       Notas de mantenimiento
└── geopolitica-quiz.html       Original de un solo archivo, congelado como referencia
```

**Importante:** son scripts clásicos, no módulos ES. Todo vive en el ámbito global y
**el orden de los `<script>` en `index.html` importa** (datos → estado → utilidades →
pantallas → arranque). No añadas `type="module"`: los manejadores `onclick` del HTML
dejarían de funcionar.

## Desarrollo

Abre `index.html` con doble clic. No hace falta servidor ni instalar nada.
Tras editar un archivo, recarga con `Ctrl+F5` (recarga forzada, para saltarse la caché).

### Añadir preguntas

Una pregunta = una línea al final del array de `js/data/questions.js`:

```js
{cat:"Guerra Fría",diff:"medio",pts:200,q:"¿Pregunta?",opts:["A","B","C","D"],ans:1,hint:"Pista.",exp:"Explicación."},
```

- `cat` debe coincidir **exactamente** con una de las 13 categorías (las tarjetas del menú
  se generan a partir de los valores que aparezcan aquí: un `cat` mal escrito crea una
  categoría nueva).
- `pts` debe ir en pareja con `diff`: facil→100, medio→200, dificil→300.
- `ans` es el índice (0-3) de la opción correcta dentro de `opts`.

### Añadir eventos al modo Cronológico

En `js/data/events.js`. `year` negativo significa a.C.:

```js
{name:"Batalla de Zama",year:-202,cat:"Antigüedad",desc:"Roma derrota a Cartago"},
```

## Problemas conocidos (pendientes de decidir)

1. **La respuesta correcta casi siempre es la B o la C.** Reparto de `ans`: 69 veces la A,
   246 la B, 186 la C y 8 la D. Las opciones se pintan en orden fijo, así que pulsar
   siempre B acierta ~48 % de las veces. Solución: mezclar `opts` al renderizar.
2. **Bonus de tiempo incorrecto en Blitz.** `pick()` calcula el bonus con `timeLeft/20`,
   pero en Blitz no se usa ese temporizador y `timeLeft` no se reinicia en `startGame()`:
   arrastra el valor de la partida anterior.
3. **`generateChallengeURL()` no se usa.** `copyChallenge()` comparte una URL fija de
   CodePen en su lugar, así que el banner "alguien te ha retado" (que sí está implementado
   y funciona con `?challenge=1&s=…`) no llega a verse nunca.
4. **Las URLs de compartir apuntan a CodePen** (`js/game.js` y `js/crono.js`): hay que
   cambiarlas por la URL pública definitiva.
5. **CSS muerto:** `.cat-count` existe pero las tarjetas de categoría no muestran el número
   de preguntas.
6. **`prompt()` para pedir el nombre** bloquea la página y está desactivado en algunos
   navegadores móviles y webviews.
7. **El nombre del ranking se pinta con `innerHTML`.** Hoy es inofensivo (solo afecta a tu
   propio navegador), pero **hay que escaparlo antes de pasar el ranking a la nube**.
8. En el modo Cronológico, dos eventos del mismo año se dan por correctos en cualquier
   orden (hay 8 años repetidos). Puede ser intencionado.

## Historial

- **2026-09-25** — Migrado desde CodePen. Se separó el archivo único de 1.797 líneas en
  HTML + CSS + 11 archivos JS, con los datos aislados. Verificado que el CSS y el `<body>`
  quedan byte a byte idénticos al original.
- **2026-09-25** — Eliminadas 98 preguntas duplicadas (de 509 entradas a 411 únicas).
  Detalle en [`docs/duplicados-eliminados.md`](docs/duplicados-eliminados.md).

## Despliegue

Publicado con **GitHub Pages** desde la rama `main`, carpeta raíz.
Cada `git push` a `main` republica el sitio en un minuto aproximadamente:

```bash
git add -A && git commit -m "descripción del cambio" && git push
```

Estado del último despliegue: pestaña **Actions** del repositorio, o
`gh api repos/moralg18794-GUILLERMO/geoquiz/pages/builds/latest -q .status`.
