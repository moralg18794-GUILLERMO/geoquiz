#!/bin/bash
# Cambia la versión de caché de TODAS las rutas de css/js/img en index.html.
#
# El .htaccess de la raíz sirve los .js, .css e imágenes con un año de caché e immutable,
# así que quien ya haya jugado se queda con los archivos viejos salvo que cambie la URL.
# Ese mismo .htaccess obliga a revalidar index.html, de modo que basta con versionar lo
# que referencia. Si se despliega sin subir este número, el navegador mezcla el HTML nuevo
# con el CSS y el JS antiguos, que es justo lo que pasó el 28/09/2026 al publicar Fechas.
#
# img/ entra en la cuenta desde el 21/10/2026: antes el patrón solo miraba css/ y js/, así
# que el icono podía quedarse sin ?v= y el script no se quejaba.
#
#   bash tools/version.sh            -> pone la fecha de hoy (AAAAMMDD)
#   bash tools/version.sh 20260928b  -> pone la versión indicada
set -euo pipefail
cd "$(dirname "$0")/.."

# api/preguntas.json es la copia del banco que usa el duelo online para elegir preguntas
# y corregir en el servidor. Se regenera aquí, en cada despliegue, para que nunca quede
# desincronizada de js/data/questions.js sin que nadie lo note.
php tools/exportar-preguntas.php

NUEVA="${1:-$(date +%Y%m%d)}"
ACTUAL=$(grep -o 'styles\.css?v=[^"]*' index.html | head -1 | sed 's/.*v=//')

if [ "$NUEVA" = "$ACTUAL" ]; then
  echo "La versión ya es $ACTUAL. Pásale una distinta, por ejemplo ${ACTUAL}b." >&2
  exit 1
fi

sed -i "s/?v=${ACTUAL}\"/?v=${NUEVA}\"/g" index.html
N=$(grep -c "v=${NUEVA}" index.html)
TOTAL=$(grep -cE '(href|src)="(css|js|img)/' index.html)

echo "versión: ${ACTUAL} -> ${NUEVA}"
echo "rutas actualizadas: ${N} de ${TOTAL}"
if [ "$N" -ne "$TOTAL" ]; then
  echo "AVISO: quedan rutas sin versionar:" >&2
  grep -nE '(href|src)="(css|js|img)/' index.html | grep -v "v=${NUEVA}" >&2
  exit 1
fi
