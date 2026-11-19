# Calendario de torneos

Un torneo por semana, con **15 preguntas** sobre un tema atado a un aniversario o a algo de
actualidad. **Cierra el domingo a las 22:00** (hora de Madrid) para que el podio se vea antes
de ir a la cama; la apertura es cuando se publique, que suele ser a mitad de semana. El ritmo
real nunca fue de lunes a domingo: lo que manda es la fecha de cierre.

## Qué tipo de tema

El juego va de guerras, conflictos y geopolítica, y eso no cambia. **Los torneos no.**

Mucha gente quiere jugar y no sabe de historia militar, y un torneo de tercios y batallas
los deja fuera antes de empezar. Los torneos son la puerta de entrada: historia en sentido
amplio, con ciencia, cultura, exploración, economía, videojuegos y lo que haga falta. Lo que
no cambia es el gancho: cada tema cuelga de un aniversario o de algo que pasa esa misma semana.

Las preguntas de los torneos viven en su propia tabla (`torneo_preguntas`), separadas de las
521 del juego, así que abrir el tema no ensucia el banco ni afecta al ranking global.

Las semanas con ⭐ caen en un aniversario redondo, que es cuando el tema se vende solo.

**El número del torneo lo calcula el servidor** (cuenta los publicados que empezaron antes) y
el aviso lo pinta solo: «🏆 Torneo semanal V🏆». La descripción empieza con «Bienvenidos al
torneo semanal» y no lleva el número escrito a mano. Hasta el IV se escribía a mano dentro del
texto, y ya no hace falta.

## Propuesta

| Semana | Cierra | Gancho | Tema |
|---|---|---|---|
| 14–18 oct | dom 18 | Actualidad: la entrada masiva de 2021 y el pulso con Marruecos | **Ceuta** · publicado · torneo II |
| 19–25 oct | dom 25 | **20 oct 2011**: ETA anuncia el cese definitivo ⭐ **15 años** | **E.T.A.** · publicado · torneo III (22–25 oct). El crac del 29 quedó sin hacer |
| 26 oct–1 nov | dom 1 | **31 oct**: Halloween | **Especial Halloween** · publicado · torneo IV (31 oct–1 nov). La Estatua de la Libertad quedó sin hacer |
| 2–8 nov | — | **4 nov 1922**: Howard Carter encuentra el primer escalón | ~~Tutankamón y los grandes hallazgos arqueológicos~~ · semana sin torneo (no se publicó) |
| 9–15 nov | — | **9 nov 1989**: cae el Muro | ~~La caída del Muro~~ · semana sin torneo (no se publicó) |
| 16–22 nov | dom 22 | **19 nov 2026**: sale GTA VI | **Especial GTA VI** · torneo V · listo, a falta del OK de Guillermo (abre mié 18, 22:00) |
| 23–29 nov | dom 29 | ⚠ **20 nov 1975**: muere Franco | 1975: la muerte de Franco y la Transición *(desplazado una semana por GTA VI)* |
| 30 nov–6 dic | dom 6 | ⚠ **24 nov 1859**: se publica *El origen de las especies* | Darwin y el viaje del Beagle |
| 7–13 dic | dom 13 | ⚠ **6 dic 1978**: referéndum de la Constitución | La Constitución del 78 |
| 14–20 dic | dom 20 | ⚠ **10 dic 1901**: se entregan los primeros Nobel ⭐ **125 años** | Los Nobel: 125 años premiando |
| 21–27 dic | dom 27 | ⚠ **14 dic 1911**: Amundsen llega al Polo Sur | La carrera al Polo Sur: Amundsen contra Scott |
| 28 dic–3 ene | dom 3 | ⚠ **25 dic 800**: coronan a Carlomagno · **25 dic 1991**: se disuelve la URSS | Navidades que hicieron historia |
| 4–10 ene | dom 10 | ⚠ **1 ene 1999**: nace el euro · **1 ene 1959**: triunfa la revolución cubana | Lo que empezó un 1 de enero |

**⚠ Aviso sobre el desplazamiento.** Desplazar Franco y todo lo que viene detrás una semana
deja cada gancho en la semana *anterior* a su tema: Franco (20 nov), Darwin (24 nov), la
Constitución (6 dic, que era el día del cierre), los Nobel (10 dic), el Polo Sur (14 dic),
las Navidades (25 dic) y el 1 de enero llegarían ya pasados. Lo que no depende de una fecha
sí puede moverse; los temas con aniversario pierden gracia. Salida sin romper ganchos:
solo Franco sale de su hueco (se lo quedó GTA VI) y el resto conserva su semana. Franco
puede fundirse con la Constitución del 78 («De Franco a la Constitución: la Transición»,
30 nov–6 dic) o ir a «De repuesto». **Pendiente de que Guillermo elija.**

## Semanas con dos ganchos

Si el tema principal no convence, el de repuesto ya está mirado:

- **23–29 nov**: Darwin o **Magallanes entrando en el Pacífico** (28 nov 1520).
- **7–13 dic**: los Nobel o **Pearl Harbor** (7 dic 1941, ⭐ 85 años), si alguna semana apetece
  volver al terreno del juego.

## De repuesto

Para la semana sin aniversario decente, o si la actualidad obliga a mover el calendario.
Forzar un tema por cumplir la fecha da preguntas flojas y se nota:

Grandes inventos · El cine que hizo época · Capitales y banderas · Exploradores · Los Juegos
Olímpicos · Catástrofes que cambiaron leyes · La carrera espacial · Reyes y reinas de España

Temas que tuvieron su semana prevista y no salieron: el crac del 29 y los felices años
veinte (24 oct 1929) · la Estatua de la Libertad (28 oct 1886) · Orson Welles invadiendo la
Tierra (30 oct 1938) · Tutankamón y Laika (4 y 3 nov) · la caída del Muro (9 nov 1989).

## Cómo se publica

Guillermo dice el tema, se escriben las 15, las revisa y se publica:

```bash
bash tools/publicar-torneo.sh torneos/2026-11-19-gta6.json
```

No hace falta desplegar el sitio. El nombre del archivo lleva la fecha del jueves o del
lunes (la del día de apertura o la de la semana) para que la carpeta se ordene sola. Un
torneo publicado con la apertura en el futuro no se ve hasta que llega su hora: las
preguntas se sirven de una en una desde el servidor, así que se puede subir con antelación.

## Historial

| Nº | Semana | Torneo | Jugaron | Ganó | Media |
|---|---|---|---|---|---|
| I | 12 oct (un día) | Torneo de la Hispanidad | 20 | Weedllermo, 8.635 | 8,3 de 15 |
| II | 14–18 oct | Ceuta | 13 | Jorge H, 5.635 | 9,5 de 15 |
| III | 22–25 oct | E.T.A. | 12 en liza (17 empezaron) | magui, 4.379 · 12/15 | 9,0 de 15 |
| IV | 31 oct–1 nov | Especial Halloween | 6 (las 6 que empezaron terminaron) | Gaso, 2.682 · 10/15 | 7,0 de 15 |
| V | 18–22 nov | Especial GTA VI | publicado el 16/11; abre mié 18, 22:00 | | |

Desde el II, Guillermo juega **fuera de concurso**: su marca sale en la tabla pero no
ocupa el podio ni cuenta en el recuento del mensaje. Por eso el ganador de Ceuta figura
aquí como Jorge H y no como Weedllermo.

En el III, 17 personas reservaron mote y solo 13 terminaron. Como el mote se reserva al
empezar, esas cuatro gastaron su intento sin salir en la tabla: conviene tenerlo en
cuenta antes de leer el recuento como "gente que ha jugado".

El IV, el de Halloween, tuvo la participación más baja hasta ahora: 6 personas frente a 12–20
de los tres anteriores (datos leídos del servidor el 16/11/2026).
