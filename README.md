# GeoQuiz — Guerras & Conflictos

Juego de trivia sobre geopolítica, guerras y conflictos, en español.
Sitio estático puro: **sin dependencias, sin frameworks y sin proceso de build**.
Se abre haciendo doble clic en `index.html` y se publica subiendo la carpeta tal cual.

**Jugar online:**
- https://mediumturquoise-dugong-529601.hostingersite.com/ (Hostinger — es la URL que usan los botones de compartir)
- https://moralg18794-guillermo.github.io/geoquiz/ (GitHub Pages — espejo)

---

## Estado del proyecto

- **521 preguntas** tipo test repartidas en **13 categorías**: Antigüedad, Edad Media,
  S. XVI–XVIII, Era Napoleónica, S. XIX, I Guerra Mundial, II Guerra Mundial, Guerra Fría,
  Conflictos Modernos, Geopolítica, Asia y Pacífico, África y Oriente Medio, Américas.
  Todas con pista y explicación. El reparto está igualado: entre 38 y 42 por categoría.
- **Dos ejes de filtrado excluyentes**, elegibles con el selector del menú:
  - **Por épocas** — las 13 categorías cronológicas de siempre.
  - **Por temáticas** — 9 etiquetas transversales que cruzan todas las épocas:
    Batallas y asedios, Líderes y estrategas, Tratados y diplomacia, Imperios y
    colonización, Revoluciones y golpes, Tecnología y armamento, Espionaje e
    inteligencia, Economía y recursos, y Crímenes y atrocidades.
    Funcionan con Solo, Blitz, Supervivencia y Duelo, así que se puede jugar por
    ejemplo una partida Blitz solo de espionaje, saltando de la Antigüedad a la
    Guerra Fría.
- **Dificultad y puntos:** fácil = 100 pts, medio = 200 pts, difícil = 300 pts.
- **102 eventos históricos** para el modo Cronológico.
- **6 modos de juego:**
  | Modo | Descripción |
  |---|---|
  | Solo | 10 preguntas, 20 s por pregunta, 3 vidas |
  | Blitz | 60 s para todo |
  | Supervivencia | Preguntas infinitas hasta perder las 3 vidas |
  | Cronológico | 5 rondas ordenando 5 eventos por fecha (arrastrando), 45 s por ronda |
  | Fechas | 5 rondas emparejando 5 eventos con su año, 45 s por ronda |
  | Duelo | 2 jugadores en el mismo dispositivo, por turnos |
- **Comodines** (uno de cada por partida, desactivados en Duelo): 50:50, Dato (pista) y
  Saltar (añade una pregunta al final para mantener el total de 10).
- **Multiplicador por racha:** x2 a partir de 3 aciertos seguidos, x3 a partir de 6.
- **Récords**: tus diez mejores partidas, en `localStorage`, solo de ese dispositivo.
- **Ranking global**: compartido por todo el que juega, en una base de datos MySQL del
  hosting. Si la API no responde, el juego enseña el ranking local avisando de que lo es.
- Compartir resultado y "retar amigos" copiando texto al portapapeles.
- Tema visual por época: cada categoría cambia el degradado de la cabecera.
- Sonido sintetizado con WebAudio (sin archivos de audio), con interruptor en la cabecera.

## Estructura

```
GEOQUIZ/
├── index.html                  Marcado de las 6 pantallas
├── css/styles.css              Todo el CSS (variables en :root)
├── js/
│   ├── data/questions.js       Las 521 preguntas  ← aquí se añaden preguntas
│   ├── data/events.js          Los 102 eventos    ← aquí se añaden eventos
│   ├── state.js                Estado global de la partida
│   ├── audio.js                Efectos de sonido
│   ├── utils.js                shuffle() y toast()
│   ├── theme.js                Colores/iconos por categoría, cabecera, transiciones
│   ├── storage.js              Récords, ranking, pestañas y reto por URL
│   ├── nube.js                 Cliente del ranking global
│   ├── crono.js                Modo Cronológico
│   ├── fechas.js               Modo Fechas
│   ├── game.js                 Bucle de juego y pantalla de resultado
│   ├── menu.js                 Pantalla de menú
│   └── main.js                 Arranque (debe cargarse el último)
├── api/                        Ranking global en PHP (solo se despliega en Hostinger)
│   ├── ranking.php             Endpoint: GET clasificación, POST puntuación
│   ├── db.php                  Conexión PDO y esquema
│   ├── config.example.php      Plantilla; el config.php real solo vive en el servidor
│   └── .htaccess               Impide servir config.php y db.php
├── tools/version.sh            Sube la versión de caché de todas las rutas
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
{cat:"Guerra Fría",diff:"medio",pts:200,q:"¿Pregunta?",opts:["A","B","C","D"],ans:1,hint:"Pista.",exp:"Explicación.",t:["esp","dip"]},
```

- `cat` debe coincidir **exactamente** con una de las 13 categorías (las tarjetas del menú
  se generan a partir de los valores que aparezcan aquí: un `cat` mal escrito crea una
  categoría nueva sin color ni icono).
- `pts` debe ir en pareja con `diff`: facil→100, medio→200, dificil→300.
- `ans` es el índice (0-3) de la opción correcta dentro de `opts`. No importa en qué posición
  la pongas: las opciones se mezclan al renderizar cada pregunta (`shuffleOptions()` en `js/utils.js`).
- `t` son las temáticas transversales, de 0 a 3 códigos de tres letras definidos en
  `THEMES` (`js/theme.js`): `bat` batallas, `lid` líderes, `dip` tratados, `imp` imperios,
  `rev` revoluciones, `tec` tecnología, `esp` espionaje, `eco` economía, `atr` atrocidades.
  Etiqueta por lo que la pregunta **evalúa**, no por palabras sueltas del enunciado.
  `t:[]` es válido: esa pregunta simplemente no aparece jugando por temáticas.
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

Los botones de compartir construyen el enlace desde `window.location`, así que funcionan en
cualquiera de los dos dominios sin tocar nada.

## Ranking global

Vive en `api/`, sobre el MySQL del propio hosting, así que no hace falta ninguna cuenta ni
servicio extra. **Solo se despliega en Hostinger**: GitHub Pages no ejecuta PHP, y la copia
de Pages llama a la API de Hostinger por CORS.

| | |
|---|---|
| Base de datos | `u810534943_geoquiz` |
| `GET /api/ranking.php?limit=50` | Devuelve la clasificación |
| `POST /api/ranking.php` | Envía una puntuación (JSON) |

**Credenciales.** `api/config.php` **no está en el repositorio** y no debe estarlo: vive solo
en `public_html/api/` del servidor, `.gitignore` lo excluye y el `.htaccess` de la carpeta
impide servirlo. Para recrearlo, copia `config.example.php` y rellénalo desde hPanel.

**Una fila por partida** (tabla `partidas`). Antes había una fila por jugador con su mejor
marca global, y eso borraba la mejor partida de alguien en Difícil en cuanto hacía una mejor
en Supervivencia: el dato que hacía falta para comparar se destruía justo al guardarlo. Ahora
se guarda cada partida y se conservan las diez mejores de cada jugador en cada lista.

Es una tabla **nueva** y no un `ALTER` de la antigua a propósito: `gq_consulta()` solo sabe
reintentar cuando MySQL dice que la tabla no existe (42S02), no cuando falta una columna
(42S22), así que un `ALTER` fallido habría dejado todos los envíos en 500 hasta entrar a
phpMyAdmin a mano. La tabla vieja `ranking` se queda ahí, sin usarse.

**Partida oficial.** El ranking de portada lista solo las partidas de modo solo con las 13
épocas seleccionadas, que por construcción son la misma partida para todo el mundo, con la
dificultad a la vista. El resto —blitz, supervivencia, cronológico, fechas y las selecciones
parciales— va a una segunda lista, para que nadie desaparezca por jugar a otra cosa. En cada
lista se enseña una fila por jugador: su mejor partida de esa lista.

**Qué se guarda.** Nombre, puntos, porcentaje, modo, dificultad, eje de selección (épocas o
temáticas) y cuántas de cuántas. Nunca el nombre de las categorías: no cabe en la tabla y
sería texto libre escrito por cualquiera y pintado en el navegador de todos. De la IP solo un
hash con sal, que sirve para limitar envíos sin almacenar la IP en claro.

**Códigos, no etiquetas.** El modo y la dificultad viajan y se almacenan como `solo` y
`dificil`, y el texto se compone al pintar. Si se guardara `Difícil` con su acento, cambiar
ese rótulo dejaría huérfanas todas las filas anteriores y sin dar ningún error.

**Ajustes congelados.** El cliente fija modo, dificultad y selección al pulsar Empezar
(`partida` en `js/state.js`, `congelarPartida()` en `js/menu.js`). Leerlos al terminar
permitía empezar en Fácil, volver al menú a mitad de partida —la barra de navegación sigue
visible y `showTab()` no detiene los cronómetros— y guardar la partida como Difícil.

**Defensas.** Sentencias preparadas con PDO; validación de todo lo que entra, con lista
blanca para modo, dificultad y eje; rechazo de nombres formados solo por caracteres invisibles
o de control bidireccional; 20 envíos por hora y conexión; diez partidas por jugador y lista;
tope de 5.000 filas; y escape de HTML al pintar, porque los nombres los escribe cualquiera y
acaban en el navegador de todos. Lo que no se reconoce se degrada en vez de rechazarse: un 400
se le enseña al jugador como «sin conexión», así que perdería la partida culpando al wifi.
El endpoint responde JSON pase lo que pase: un fallo de base de datos se registra en el log
del servidor y devuelve un error limpio, sin filtrar la consulta ni la ruta.

**En local no funciona** y es lo esperado: `localhost` no está en la lista de orígenes
permitidos, así que el juego cae al ranking local avisando de ello. Para probar la API de
verdad hay que abrir el sitio desplegado.

## Problemas conocidos (pendientes de decidir)

1. **`prompt()` para pedir el nombre** bloquea la página al terminar la partida y está
   desactivado en algunos navegadores móviles y webviews.
2. **Las puntuaciones se pueden falsificar** desde la consola del navegador. En un sitio
   estático no hay forma de impedirlo sin cuentas ni sesiones. Lo que sí está acotado es el
   daño: topes de valores, lista blanca de modos y 20 envíos por hora y conexión.
3. En el modo Cronológico, dos eventos del mismo año se dan por correctos en cualquier
   orden. Puede ser intencionado.
4. Quedan **dos preguntas de Era Napoleónica que responden "2"** (veces que fue exiliado y
   veces que se casó). Son distintas, pero pueden salir juntas en la misma partida.

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

- **2026-09-28** — Nuevo eje de filtrado **por temáticas**: 9 etiquetas transversales
  asignadas a las 521 preguntas con un flujo de 57 agentes (24 lotes etiquetados, 24
  revisados por un segundo agente y 9 auditores de precisión, uno por temática, que
  retiraron 76 asignaciones forzadas). Añadidas además 20 preguntas de espionaje
  (501 → 521) porque esa temática se quedaba en 10, justo una partida.
  Reparto resultante: batallas 112, imperios 99, líderes 95, tratados 80, revoluciones 71,
  economía 53, tecnología 50, atrocidades 31, espionaje 30. 74 preguntas sin temática:
  esas solo salen jugando por épocas.

- **2026-09-28** — Nuevo modo **Fechas**: emparejar cada evento con su año, 5 rondas de 5
  parejas. Los cinco eventos de cada ronda se eligen de una ventana temporal estrecha y con
  años distintos, para que no valga con separar a ojo la Antigüedad del siglo XX. La
  interacción es por toques (tocar evento, tocar año) en vez de arrastre: el Cronológico
  necesitó manejadores táctiles aparte para funcionar en móvil y aquí no hacen falta.

- **2026-09-28** — **Ranking global** sobre el MySQL del propio hosting, sin servicios de
  terceros. La pestaña Ranking pasa a ser compartida por todo el que juega y Récords se
  queda como historial local. Se arregla de paso el XSS que llevaba avisado desde la
  migración: los nombres ahora se escapan al pintarlos, que es obligatorio en cuanto los
  escribe cualquiera y acaban en el navegador de los demás.

## Caché al actualizar

Hostinger sirve los `.js` y `.css` con `Cache-Control: max-age=604800` (7 días), así que
quien ya haya jugado seguiría viendo la versión antigua durante una semana. `index.html`
sí se revalida en cada visita, y por eso las rutas de los recursos llevan una versión:

```html
<script src="js/data/questions.js?v=20260928b"></script>
```

**Antes de cada despliegue hay que subir ese número.** No lo hagas a mano: hay un script
que lo cambia en todas las rutas a la vez y avisa si se deja alguna sin versionar.

```bash
bash tools/version.sh 20260928b
```

Olvidarlo no rompe el sitio de forma visible: sirve el `index.html` nuevo con el CSS y el
JS viejos, así que la función recién añadida aparece en el menú pero no funciona y sale sin
estilos. Pasó justo así al publicar el modo Fechas.
GitHub Pages no tiene este problema: cachea solo 10 minutos.
