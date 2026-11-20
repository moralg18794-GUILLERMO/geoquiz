# Fotos de las cabeceras por época (`img/epocas/`)

Las 13 imágenes se muestran en la cabecera mientras se juega (`js/theme.js`, `CAT_FOTO`).
Todas son **de dominio público** según Wikimedia Commons (consultado el 19/11/2026); no exigen
atribución, pero se deja aquí quién es cada autor y de dónde sale. Recorte: 1200×300 px, JPEG.
No hay material de Rockstar ni de ninguna marca.

| Época | Archivo | Obra / autor | Origen en Commons |
|---|---|---|---|
| Antigüedad | antiguedad.jpg | «La consumación del imperio», Thomas Cole (1836) | File:Cole Thomas The Consummation The Course of the Empire 1836.jpg |
| Edad Media | edad-media.jpg | Tapiz de Bayeux, escena 51 (foto: Myrabella) | File:Bayeux Tapestry scene51 Battle of Hastings Norman knights and archers.jpg |
| S. XVI–XVIII | s16-18.jpg | Batalla de Lepanto, Andrea Vicentino | File:Battle of Lepanto 1595-1605 Andrea Vicentino.jpg |
| Era Napoleónica | napoleonica.jpg | «La batalla de Austerlitz», François Gérard | File:La bataille d'Austerlitz. 2 decembre 1805 (François Gérard).jpg |
| S. XIX | s19.jpg | «Lluvia, vapor y velocidad», J. M. W. Turner | File:Turner - Rain, Steam and Speed - National Gallery file.jpg |
| I Guerra Mundial | i-guerra.jpg | Trinchera en Beaumont Hamel, 1916, Ernest Brooks | File:Lancashire Fusiliers trench Beaumont Hamel 1916.jpg |
| II Guerra Mundial | ii-guerra.jpg | «Into the Jaws of Death», Guardia Costera de EE. UU. | File:Into the Jaws of Death (6414569).jpg |
| Guerra Fría | guerra-fria.jpg | Muro de Berlín, 20/11/1961, National Archives (EE. UU.) | File:Berlin Wall 1961-11-20.jpg |
| Conflictos Modernos | conflictos.jpg | F-117 en la guerra del Golfo, US Air Force | File:Gulf War 37 TFW F-117s.jpg |
| Geopolítica | geopolitica.jpg | «Blue Marble», NASA / tripulación del Apolo 17 | File:The Blue Marble (remastered).jpg |
| Asia y Pacífico | asia.jpg | «Nuevo mapa de Asia» (1806), John Cary | File:1806 Cary Map of Asia, Polynesia, and Australia - Geographicus - Asia-cary-1806.jpg |
| África y Oriente Medio | africa-oriente.jpg | Mapa de Arabia, Persia, Turquía y Afganistán (1866), Alvin Jewett Johnson | File:1866 Johnson Map of Arabia, Persia, Turkey and Afghanistan (Iraq) - Geographicus - Arabia-johnson-1866.jpg |
| Américas | americas.jpg | Mapa de América del Norte y del Sur (1747), Emanuel Bowen | File:1747 Bowen Map of North America and South America ( Western Hemisphere) - Geographicus - America-bowen-1747.jpg |

Cada enlace: `https://commons.wikimedia.org/wiki/` + el nombre de la última columna.

**Cómo funciona:** solo se descarga la foto de la época que toca (unos 12–73 KB), nunca en la
portada; se funde con la anterior en 0,7 s sobre un degradado oscuro que mantiene legible el
texto; no se usa con «ahorro de datos» o conexión 2G; si falla la descarga queda el degradado de
siempre. Asia, África-Oriente Medio y Américas son mapas antiguos (a petición de Guillermo, 19/11/2026). Si se cambia una foto, subir `FOTO_V` en `js/theme.js` (la caché es de un año).

## Siluetas de los continentes (tarjetas de «Por geografía»)

Dibujadas país a país con `tools/mapas/hacer-mapas.php` a partir de Natural Earth 1:110m
(dominio público, naturalearthdata.com). Los datos van dentro de `js/theme.js` (`GEO_MAPAS`).
Para regenerarlas: bajar `ne_110m_admin_0_countries.geojson` y pasárselo al script.
