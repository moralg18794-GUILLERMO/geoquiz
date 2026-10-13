# Calendario de torneos

Un torneo por semana, de **lunes 00:00 a domingo 22:00** (hora de Madrid), **15 preguntas**
sobre un tema atado a un aniversario o a algo de actualidad. Cierra el domingo a las diez
para que el podio se vea antes de ir a la cama.

El tema lo decide Guillermo. Esto es una propuesta de fechas y ganchos, no una lista
cerrada: cualquier semana se puede cambiar por algo de actualidad que surja, que para eso
son torneos de actualidad.

Las semanas marcadas con ⭐ caen en un aniversario redondo, que es cuando el tema se vende
solo en el grupo.

## Propuesta

| Semana | Cierra | Gancho | Tema propuesto |
|---|---|---|---|
| 13–18 oct | dom 18 | **16 oct 1962**: Kennedy ve las fotos de los misiles. La crisis duró del 16 al 28. | Los trece días de la crisis de los misiles |
| 19–25 oct | dom 25 | **23 oct 1956**: estalla la revolución húngara ⭐ **70 años** | Budapest 1956: la revolución aplastada |
| 26 oct–1 nov | dom 1 | **29 oct 1956**: Israel entra en el Sinaí y empieza Suez ⭐ **70 años** | Suez: el día que Europa dejó de mandar |
| 2–8 nov | dom 8 | **7 nov 1917**: los bolcheviques toman el Palacio de Invierno | La Revolución Rusa |
| 9–15 nov | dom 15 | **9 nov 1989**: cae el Muro, y abre el torneo ese mismo día | La caída del Muro y el final de la Guerra Fría |
| 16–22 nov | dom 22 | **20 nov 1975**: muere Franco · **22 nov 1963**: matan a Kennedy | 1975: la muerte de Franco y la Transición |
| 23–29 nov | dom 29 | **28 nov 1943**: empieza la Conferencia de Teherán | Las conferencias que se repartieron el mundo |
| 30 nov–6 dic | dom 6 | **6 dic 1978**: referéndum de la Constitución, justo el día del cierre | La Constitución del 78 |
| 7–13 dic | dom 13 | **7 dic 1941**: Pearl Harbor, y abre el torneo ese día ⭐ **85 años** | Pearl Harbor y la guerra del Pacífico |
| 14–20 dic | dom 20 | **16 dic 1944**: arranca la ofensiva de las Ardenas | Las Ardenas: la última apuesta de Hitler |
| 21–27 dic | dom 27 | **24 dic 1914**: la tregua de Navidad en las trincheras | La tregua de Navidad de 1914 |
| 28 dic–3 ene | dom 3 | Semana muerta de fiestas, sin aniversario que merezca la pena | Especial: el año en 15 preguntas |

## Semanas con dos ganchos

Tres semanas traen dos aniversarios buenos y hay que elegir. Si el tema principal no
convence, el de repuesto ya está ahí:

- **9–15 nov**: el Muro (9 nov 1989) o el **armisticio de 1918** (11 nov, 108 años). Los dos
  caen dentro. El Muro abre el lunes, que luce más.
- **16–22 nov**: Franco (20 nov) o **el magnicidio de Kennedy** (22 nov, y cae en el día del
  cierre). Un tema de magnicidios daría para 15 preguntas de sobra.
- **21–27 dic**: la tregua de Navidad (24 dic) o **la disolución de la URSS** (26 dic 1991,
  ⭐ 35 años). La tregua pega más con la semana; la URSS es el aniversario más redondo.

## De repuesto

Para la semana que no tenga ningún aniversario decente, o si algo de actualidad obliga a
mover el calendario. Forzar un tema por cumplir la fecha da preguntas flojas:

Napoleón · La Roma de las legiones · Los tercios españoles · Espionaje y servicios secretos ·
Oriente Medio desde 1948 · El petróleo como arma · Las guerras de independencia americanas ·
Batallas navales

## Cómo se publica

Guillermo dice el tema, se escriben las 15, las revisa y se publica:

```bash
bash tools/publicar-torneo.sh torneos/2026-10-19-budapest.json
```

No hace falta desplegar el sitio. El nombre del archivo lleva la fecha del lunes para que
la carpeta se ordene sola.

## Historial

| Semana | Torneo | Jugaron | Ganó | Media |
|---|---|---|---|---|
| 12 oct (un día) | Torneo de la Hispanidad | 20 | Weedllermo, 8.635 | 8,3 de 15 |
