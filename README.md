# GeoQuiz — Guerras & Conflictos

Juego de trivia sobre geopolítica, guerras y conflictos, en español.
Sitio estático puro: **sin dependencias, sin frameworks y sin proceso de build**.
Se abre haciendo doble clic en `index.html` y se publica subiendo la carpeta tal cual.

**Jugar online:**
- https://mediumturquoise-dugong-529601.hostingersite.com/ (Hostinger — es la URL que usan los botones de compartir)
- https://moralg18794-guillermo.github.io/geoquiz/ (GitHub Pages — espejo)

---

## Estado del proyecto

- **501 preguntas** tipo test repartidas en **13 categorías**: Antigüedad, Edad Media,
  S. XVI–XVIII, Era Napoleónica, S. XIX, I Guerra Mundial, II Guerra Mundial, Guerra Fría,
  Conflictos Modernos, Geopolítica, Asia y Pacífico, África y Oriente Medio, Américas.
  Todas con pista y explicación. El reparto está igualado: entre 38 y 42 por categoría.
- **Dificultad y puntos:** fácil = 100 pts, medio = 200 pts, difícil = 300 pts.
- **102 eventos históricos** para el modo Cronológico.
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
│   ├── data/questions.js       Las 501 preguntas  ← aquí se añaden preguntas
│   ├── data/events.js          Los 102 eventos    ← aquí se añaden eventos
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

Una pregunta = **una línea** al final del array de `js/data/questions.js`:

```js
{cat:"Guerra Fría",diff:"medio",pts:200,q:"¿Pregunta?",opts:["A","B","C","D"],ans:1,hint:"Pista.",exp:"Explicación."},
```

- `cat` debe coincidir **exactamente** con una de las 13 categorías (las tarjetas del menú
  se generan a partir de los valores que aparezcan aquí: un `cat` mal escrito crea una
  categoría nueva sin color ni icono).
- `pts` debe ir en pareja con `diff`: facil→100, medio→200, dificil→300.
- `ans` es el índice (0-3) de la opción correcta dentro de `opts`. No importa en qué posición
  la pongas: las opciones se mezclan al renderizar cada pregunta (`shuffleOptions()` en `js/utils.js`).
- **La línea debe terminar en `},`**, incluida la última del array. Si falta la coma, el
  archivo entero deja de cargar y el juego se queda en blanco.
- No uses comillas dobles dentro de los textos: el archivo no las escapa.

### Añadir eventos al modo Cronológico

En `js/data/events.js`. `year` negativo significa a.C.:

```js
{name:"Batalla de Zama",year:-202,cat:"Antigüedad",desc:"Roma derrota a Cartago"},
```

## Despliegue

El juego está publicado en dos sitios a la vez. Los dos sirven la misma carpeta.

**Hostinger** (subdominio gratuito, es la URL que se comparte desde el juego):
se sube un zip con `index.html`, `css/` y `js/` al `public_html` del sitio
`mediumturquoise-dugong-529601.hostingersite.com` y se despliega como sitio estático.

**GitHub Pages** (rama `main`, carpeta raíz): cada `git push` republica en un minuto.

```bash
git add -A && git commit -m "descripción del cambio" && git push
```

Estado del último despliegue de Pages:
`gh api repos/moralg18794-GUILLERMO/geoquiz/pages/builds/latest -q .status`

Si cambias de dominio, acuérdate de actualizar la URL en `js/game.js` y `js/crono.js`
(constante `gameURL`, usada por los botones de compartir).

## Problemas conocidos (pendientes de decidir)

1. **CSS muerto:** `.cat-count` existe pero las tarjetas de categoría no muestran el número
   de preguntas.
2. **`prompt()` para pedir el nombre** bloquea la página al terminar la partida y está
   desactivado en algunos navegadores móviles y webviews.
3. **El nombre del ranking se pinta con `innerHTML`.** Hoy es inofensivo (solo afecta a tu
   propio navegador), pero **hay que escaparlo antes de pasar el ranking a la nube**.
4. En el modo Cronológico, dos eventos del mismo año se dan por correctos en cualquier
   orden. Puede ser intencionado.
5. Quedan **dos preguntas de Era Napoleónica que responden "2"** (veces que fue exiliado y
   veces que se casó). Son distintas, pero pueden salir juntas en la misma partida.

## Ideas pendientes

- Modo de juego por **temáticas transversales** (espionaje, economía de guerra, tecnología
  militar, tratados…), separado de las categorías actuales, que son cronológicas.
- Récords y ranking **en la nube** en lugar de solo en el navegador.

## Historial

- **2026-09-25** — Migrado desde CodePen. Se separó el archivo único de 1.797 líneas en
  HTML + CSS + 11 archivos JS, con los datos aislados. Verificado que el CSS y el `<body>`
  quedan byte a byte idénticos al original.
- **2026-09-25** — Eliminadas 98 preguntas duplicadas literales (509 → 411).
- **2026-09-25** — Publicado en GitHub Pages.
- **2026-09-26** — Publicado también en Hostinger y actualizadas las URLs de compartir,
  que hasta entonces apuntaban al CodePen original.
- **2026-09-26** — Añadidas 90 preguntas (411 → 501) y 30 eventos cronológicos (72 → 102).
- **2026-09-26** — Segunda limpieza: 97 duplicados reformulados (501 → 404) y reposición
  con 97 preguntas nuevas (404 → 501), dejando todas las categorías en 38-39.
  Detalle de ambas limpiezas en [`docs/duplicados-eliminados.md`](docs/duplicados-eliminados.md).
- **2026-09-26** — Arreglados cuatro defectos: las opciones ahora se mezclan al renderizar
  (antes la correcta era la B casi la mitad de las veces), el bonus de tiempo de Blitz ya no
  arrastra el contador de la partida anterior, el botón de retar genera un enlace con la
  puntuación (el banner "alguien te ha retado" nunca se había llegado a ver) y se corrigieron
  tres preguntas defectuosas: una que contenía su respuesta, una a medio traducir y otra
  cuyo enunciado no casaba con sus opciones.

## Caché al actualizar

Hostinger sirve los `.js` y `.css` con `Cache-Control: max-age=604800` (7 días), así que
quien ya haya jugado seguiría viendo la versión antigua durante una semana. `index.html`
sí se revalida en cada visita, y por eso las rutas de los recursos llevan una versión:

```html
<script src="js/data/questions.js?v=20260926-2"></script>
```

**Cada vez que despliegues un cambio hay que subir ese número** en las 12 rutas de
`index.html` (un buscar y reemplazar). Si no, quien repita no verá el contenido nuevo.
GitHub Pages no tiene este problema: cachea solo 10 minutos.
