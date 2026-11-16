# Rediseño visual — primera tanda (noviembre de 2026)

Se hizo para la semana del estreno de GTA VI (19/11/2026): la gente nueva llega por un enlace
de WhatsApp o de redes, desde el móvil, y lo primero que ve es la imagen del enlace, la
portada y el torneo. **Rama de trabajo: `claude/rediseno-gta6-87ad00`. Sin desplegar.**

## Qué hay de nuevo

| Dónde | Qué cambia |
|---|---|
| Imagen del enlace (`img/og-torneo.jpg`, 1200×630, 86 KB) | Atardecer de neón con palmeras, «Torneo semanal · Especial estreno GTA VI», «15 preguntas, una sola partida». Las etiquetas `og:` de `index.html` apuntan a ella (`?v=3`). Fuente editable: `tools/og/og-torneo.html`; se regenera con `bash tools/og/hacer-og.sh` (usa el Edge de Windows). |
| Ilustración (`img/atardecer.svg`, 4 KB) | Dibujada a mano para GeoQuiz. Es la cabecera del aviso, de la pantalla y del resultado del torneo, y el fondo de la imagen para compartir. |
| Cabecera | Compacta (80 px en vez de ~300): marca con globo, frase y meridianos tenues. En la portada es azul sobrio; jugando, sigue cambiando de degradado por época y el nombre de la época sustituye a la frase. |
| Barra de secciones | Iconos de trazo (SVG, `currentColor`). En el móvil queda **fija abajo**, al alcance del pulgar; en pantalla ancha, una fila bajo la cabecera. Los `onclick` no cambian. |
| Aviso del torneo | Tarjeta con la ilustración, título en Baskerville, descripción recortada a 3 líneas, reloj, «15 preguntas · 1 intento» y botón grande degradado. Línea «no oficial, sin relación con Rockstar Games» solo cuando el título o el tema nombran GTA/Rockstar (`torneoEsGTA()` en `js/torneo.js`). |
| Pantalla del torneo | Cabecera ilustrada, **podio** de tres y lista de puestos (el tuyo se marca «tú»; quien escribe las preguntas va al final, atenuado, como antes). Si aún no has jugado, trae el botón de entrar. |
| Resultado | Puntuación grande en degradado, estadísticas en cuatro casillas, botón principal «Retar a mis amigos por WhatsApp». El del torneo se viste con el atardecer. |
| **Compartir imagen** | Botón nuevo en los resultados de partida normal y de torneo: dibuja en el móvil una tarjeta de 1080×1080 con la nota y abre la hoja de compartir con la imagen adjunta (en el ordenador la descarga). No sube nada a ningún sitio (`js/utils.js`: `tarjetaResultado`, `compartirImagen`). |
| Menú | Modos con iconos de trazo; épocas y temáticas en fichas compactas de dos columnas, con el degradado de cada época tras su icono; botón de empezar en oro. |

El código de pintar el podio, la lista y el resultado vive en `js/torneo.js`; los estilos, en
`css/styles.css` (bloques «TORNEO» y «RESULT»). El flujo del torneo (reservar mote, reloj,
resultado, clasificación) no se ha tocado: solo se ha cambiado lo que se pinta.

## Después del torneo de GTA VI

La imagen del enlace y sus textos son de la semana del estreno. Para volver a lo de siempre,
`index.html` lleva un comentario con los valores anteriores (`og.jpg?v=2`, título y
descripción). Si se estrena una imagen nueva con el mismo nombre, subir el `?v=`: WhatsApp
guarda la miniatura varios días. La ilustración se versiona con `?v=1` en `css/styles.css` y en
`js/utils.js`: si se cambia el SVG, subir también ese número.

## Imágenes y propiedad intelectual

Todo es material propio: SVG dibujado para esto y texto compuesto con las fuentes de la
página. No hay arte, logotipo, captura ni fotograma de Rockstar Games ni de Take-Two, y no se
imita su logotipo (el título del torneo va en Libre Baskerville, no en su tipografía, y sin su
degradado). No se ha usado Canva, Gamma ni Wikimedia en esta tanda, así que no hay atribuciones
pendientes. Si la segunda tanda usa fotos de Wikimedia Commons, anotar aquí autor y licencia de
cada una.

## Probar en local

`php -S localhost:8010` desde la raíz. La API real no contesta desde `localhost` (CORS), así que
para ver el aviso y la clasificación hay una API simulada: en la consola del navegador,

```js
const s=document.createElement('script');s.src='tools/pruebas/mock-torneo.js';document.head.appendChild(s);
// luego: __mock('activo')   __mock('cerrado')   __mock('activo',{vacio:true})
```

## Segunda tanda (propuesta y estimación)

Estimaciones en horas de trabajo mío con Guillermo mirando; cada bloque sale por separado.

1. **Pedir el nombre sin `prompt()`** (~1 h). Hoy el torneo y el ranking piden el mote con
   `prompt()`, que algunos navegadores incrustados de redes sociales bloquean: si llega mucha
   gente desde Instagram o TikTok, es el sitio donde alguien se puede quedar sin poder jugar.
   Un cuadro propio dentro de la página devuelve el mismo texto y no toca el servidor. **Es lo
   que haría primero, antes del jueves si da tiempo.**
2. **Pregunta, contador y botones de respuesta** (2-3 h), la pantalla donde se pasa más
   tiempo: cabecera de partida, temporizador, botones, explicación, transición entre épocas.
   Afecta a Solo, Blitz, Supervivencia y Torneo a la vez.
3. **Cronológico, Fechas, Duelo, Récords, Ranking y clasificación de Duelos** (3-4 h): mismas
   fichas y listas que el torneo en lugar de tablas, y el resultado con la imagen de compartir.
4. **Fotos por época en la cabecera de las 13 categorías** (3-4 h, el grueso es buscar y
   preparar las imágenes): fotos de dominio público o Creative Commons de Wikimedia Commons,
   recortadas a 1200×300 y comprimidas a unos 30 KB cada una, que solo se descargan cuando se
   juega esa época. Los tres cuidados de siempre: texto legible encima (degradado oscuro),
   primera carga ligera (la portada no las pide), y fundido de 0,7 s entre épocas con dos capas
   para que no sea un corte. Anotar autor y licencia de cada foto.
5. **Detalles de acabado** (1-2 h): marcador que sube contando, confeti en el podio, esqueleto
   del aviso mientras llega la respuesta del servidor (hoy la tarjeta aparece de golpe y empuja
   el menú), pequeñas vibraciones al acertar.

Total aproximado: 10-14 h de trabajo, repartibles en 4-5 sesiones.

## Lo que se vio del servidor (sin tocar nada)

Mirado de pasada en `api/torneo.php` y `api/db.php`, sin pruebas de carga:

- Toda respuesta lleva `Cache-Control: no-store`, también la lectura pública del torneo y su
  clasificación, que dispara **cada visitante al abrir la página**. Con diez veces más gente es
  una consulta a MySQL por visita. Cachear esa lectura 30-60 segundos lo evitaría.
- El freno por conexión (`gq_t_frenar`) hace en cada petición un `DELETE`, un `SELECT COUNT(*)`
  y un `INSERT` sobre la tabla `envios`. Con picos, esa tabla se convierte en el cuello.
- El alojamiento compartido suele limitar las conexiones simultáneas a MySQL; si se pasa, el
  juego se queda sin torneo (la portada lo esconde, no se rompe), pero se perdería la ola.
- El tope de 500 peticiones por hora y conexión puede cortar a un grupo que juegue desde la
  misma wifi (un bar, una oficina).
