# Calendario de torneos

Un torneo por semana, de **lunes 00:00 a domingo 22:00** (hora de Madrid), **15 preguntas**
sobre un tema atado a un aniversario o a algo de actualidad. Cierra el domingo a las diez
para que el podio se vea antes de ir a la cama.

## Qué tipo de tema

El juego va de guerras, conflictos y geopolítica, y eso no cambia. **Los torneos no.**

Mucha gente quiere jugar y no sabe de historia militar, y un torneo de tercios y batallas
los deja fuera antes de empezar. Los torneos son la puerta de entrada: historia en sentido
amplio, con ciencia, cultura, exploración, economía y lo que haga falta. Lo que no cambia es
el gancho: cada tema cuelga de un aniversario que cae esa misma semana.

Las preguntas de los torneos viven en su propia tabla (`torneo_preguntas`), separadas de las
521 del juego, así que abrir el tema no ensucia el banco ni afecta al ranking global.

Las semanas con ⭐ caen en un aniversario redondo, que es cuando el tema se vende solo.

## Propuesta

| Semana | Cierra | Gancho | Tema |
|---|---|---|---|
| 14–18 oct | dom 18 | Actualidad: la entrada masiva de 2021 y el pulso con Marruecos | **Torneo de Ceuta** · publicado |
| 19–25 oct | dom 25 | **24 oct 1929**: jueves negro en Wall Street | El crac del 29 y los felices años veinte |
| 26 oct–1 nov | dom 1 | **28 oct 1886**: se inaugura la Estatua de la Libertad ⭐ **140 años** | La Estatua de la Libertad y la emigración a América |
| 2–8 nov | dom 8 | **4 nov 1922**: Howard Carter encuentra el primer escalón | Tutankamón y los grandes hallazgos arqueológicos |
| 9–15 nov | dom 15 | **9 nov 1989**: cae el Muro, y el torneo abre ese mismo día | La caída del Muro |
| 16–22 nov | dom 22 | **20 nov 1975**: muere Franco | 1975: la muerte de Franco y la Transición |
| 23–29 nov | dom 29 | **24 nov 1859**: se publica *El origen de las especies* | Darwin y el viaje del Beagle |
| 30 nov–6 dic | dom 6 | **6 dic 1978**: referéndum de la Constitución, el día del cierre | La Constitución del 78 |
| 7–13 dic | dom 13 | **10 dic 1901**: se entregan los primeros Nobel ⭐ **125 años** | Los Nobel: 125 años premiando |
| 14–20 dic | dom 20 | **14 dic 1911**: Amundsen llega al Polo Sur | La carrera al Polo Sur: Amundsen contra Scott |
| 21–27 dic | dom 27 | **25 dic 800**: coronan a Carlomagno · **25 dic 1991**: se disuelve la URSS | Navidades que hicieron historia |
| 28 dic–3 ene | dom 3 | **1 ene 1999**: nace el euro · **1 ene 1959**: triunfa la revolución cubana | Lo que empezó un 1 de enero |

## Semanas con dos ganchos

Si el tema principal no convence, el de repuesto ya está mirado:

- **26 oct–1 nov**: la Estatua de la Libertad o **Orson Welles invadiendo la Tierra** por la
  radio (30 oct 1938), que además pilla Halloween.
- **2–8 nov**: Tutankamón o **Laika** (3 nov 1957) y la carrera espacial.
- **23–29 nov**: Darwin o **Magallanes entrando en el Pacífico** (28 nov 1520).
- **7–13 dic**: los Nobel o **Pearl Harbor** (7 dic 1941, ⭐ 85 años), si alguna semana apetece
  volver al terreno del juego.

## De repuesto

Para la semana sin aniversario decente, o si la actualidad obliga a mover el calendario.
Forzar un tema por cumplir la fecha da preguntas flojas y se nota:

Grandes inventos · El cine que hizo época · Capitales y banderas · Exploradores · Los Juegos
Olímpicos · Catástrofes que cambiaron leyes · La carrera espacial · Reyes y reinas de España

## Cómo se publica

Guillermo dice el tema, se escriben las 15, las revisa y se publica:

```bash
bash tools/publicar-torneo.sh torneos/2026-10-19-crac29.json
```

No hace falta desplegar el sitio. El nombre del archivo lleva la fecha del lunes para que la
carpeta se ordene sola.

## Historial

| Semana | Torneo | Jugaron | Ganó | Media |
|---|---|---|---|---|
| 12 oct (un día) | Torneo de la Hispanidad | 20 | Weedllermo, 8.635 | 8,3 de 15 |
