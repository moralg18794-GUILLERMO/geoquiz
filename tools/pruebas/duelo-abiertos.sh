#!/bin/bash
# GeoQuiz — pruebas de api/duelo.php: retos abiertos (lista pública, presencia, caducidad, cancelar), en local.
#
# Igual que torneo-repeticion.sh: no hay MySQL en el portátil, así que se usa SQLite con el traductor de
# funciones de MySQL (tools/pruebas/lib/sqlite-mysql.php) y una COPIA de api/ en una carpeta temporal.
# Nada de esto toca el servidor de verdad ni el api/ del repositorio.
#
#   bash tools/pruebas/duelo-abiertos.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

PHP="${GQ_PHP:-php}"
if ! command -v "$PHP" >/dev/null 2>&1; then
  echo "No encuentro '$PHP'. Pásale la ruta con GQ_PHP=/ruta/a/php.exe" >&2; exit 1
fi
EXT_DIR="$(dirname "$(command -v "$PHP")")/ext"
OPC=()
if ! "$PHP" -m | grep -qi pdo_sqlite; then
  if [ -f "$EXT_DIR/php_pdo_sqlite.dll" ]; then
    OPC=(-d "extension_dir=$EXT_DIR" -d extension=pdo_sqlite -d extension=sqlite3)
  fi
fi
if ! "$PHP" "${OPC[@]}" -m | grep -qi pdo_sqlite; then
  echo ""
  echo "── Duelos (retos abiertos): SE SALTA (este PHP no tiene pdo_sqlite)"
  exit 0
fi

PUERTO="${GQ_PUERTO_DUELO:-8733}"
TMP=$(mktemp -d)
trap 'kill "${SRV:-}" 2>/dev/null; rm -rf "$TMP"' EXIT
mkdir -p "$TMP/api"
# El banco de preguntas no está en Git (lleva las respuestas); se regenera igual que en cada despliegue.
"$PHP" tools/exportar-preguntas.php >/dev/null
cp api/*.php api/preguntas.json "$TMP/api/"
rm -f "$TMP/api/correo-config.php"
TMPW="$TMP"
command -v cygpath >/dev/null 2>&1 && TMPW="$(cygpath -m "$TMP")"

# En la copia, la conexión de pruebas pasa por el traductor de MySQL a SQLite.
cp tools/pruebas/lib/sqlite-mysql.php "$TMP/api/sqlite-mysql.php"
sed -i "s|\$pdo = new PDO((string) \$cfg\['dsn'\]|require_once __DIR__ . '/sqlite-mysql.php'; \$pdo = new GQPdoSqliteMysql((string) \$cfg['dsn']|" "$TMP/api/db.php"
if ! grep -q GQPdoSqliteMysql "$TMP/api/db.php"; then
  echo "No he podido enganchar el traductor en api/db.php (¿ha cambiado la línea de la conexión de pruebas?)" >&2; exit 1
fi

cat > "$TMP/api/config.php" <<EOF2
<?php
return [
    'dsn' => 'sqlite:$TMPW/prueba.sqlite',
    'sal_ip' => 'sal-de-pruebas', 'token_admin' => 'token-de-pruebas-0123456789abcdef',
];
EOF2

"$PHP" "${OPC[@]}" tools/pruebas/lib/esquema-duelos.php "$TMPW/prueba.sqlite" >/dev/null

"$PHP" "${OPC[@]}" -S "127.0.0.1:$PUERTO" -t "$TMP" >"$TMP/servidor.log" 2>&1 &
SRV=$!
curl -s -o /dev/null --retry 40 --retry-delay 0 --retry-connrefused --max-time 10 "http://127.0.0.1:$PUERTO/api/duelo.php?ranking=1" || true

echo ""
echo "── Duelos: retos abiertos (SQLite, servidor embebido)"
GQ_URL="http://127.0.0.1:$PUERTO/api/duelo.php" GQ_DB="$TMPW/prueba.sqlite" GQ_BANCO="$TMPW/api/preguntas.json" \
  "$PHP" "${OPC[@]}" tools/pruebas/duelo-abiertos-casos.php
RES=$?
if [ "$RES" -ne 0 ]; then
  echo "── registro del servidor (errores y últimas líneas):"
  grep -v -e Accepted -e Closing "$TMP/servidor.log" | tail -n 25
fi
exit "$RES"
