#!/bin/bash
# Cambia la versión de caché de TODAS las rutas de css/js en index.html.
#
# Hostinger sirve los .js y .css con Cache-Control de 7 días, así que quien ya haya
# jugado se queda con los archivos viejos salvo que cambie la URL. index.html sí se
# revalida, de modo que basta con versionar lo que referencia. Si se despliega sin
# subir este número, el navegador mezcla el HTML nuevo con el CSS y el JS antiguos,
# que es justo lo que pasó el 28/09/2026 al publicar el modo Fechas.
#
#   bash tools/version.sh            -> pone la fecha de hoy (AAAAMMDD)
#   bash tools/version.sh 20260928b  -> pone la versión indicada
set -euo pipefail
cd "$(dirname "$0")/.."

NUEVA="${1:-$(date +%Y%m%d)}"
ACTUAL=$(grep -o 'styles\.css?v=[^"]*' index.html | head -1 | sed 's/.*v=//')

if [ "$NUEVA" = "$ACTUAL" ]; then
  echo "La versión ya es $ACTUAL. Pásale una distinta, por ejemplo ${ACTUAL}b." >&2
  exit 1
fi

sed -i "s/?v=${ACTUAL}\"/?v=${NUEVA}\"/g" index.html
N=$(grep -c "v=${NUEVA}" index.html)
TOTAL=$(grep -cE '(href|src)="(css|js)/' index.html)

echo "versión: ${ACTUAL} -> ${NUEVA}"
echo "rutas actualizadas: ${N} de ${TOTAL}"
if [ "$N" -ne "$TOTAL" ]; then
  echo "AVISO: quedan rutas sin versionar:" >&2
  grep -nE '(href|src)="(css|js)/' index.html | grep -v "v=${NUEVA}" >&2
  exit 1
fi
