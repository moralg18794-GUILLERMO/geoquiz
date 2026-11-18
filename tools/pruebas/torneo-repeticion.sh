#!/bin/bash
# GeoQuiz — pruebas de api/torneo.php: repetir torneos (abiertos y cerrados) e invitar, en local.
#
# No hay MySQL en el portátil, así que se usa SQLite con un traductor de las pocas funciones de MySQL que
# usa el torneo (tools/pruebas/lib/sqlite-mysql.php), enganchado en una COPIA de api/db.php. Nada de esto
# toca el servidor de verdad ni el api/ del repositorio.
#
#   bash tools/pruebas/torneo-repeticion.sh
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
  echo "── Torneo (repeticiones): SE SALTA (este PHP no tiene pdo_sqlite)"
  exit 0
fi

PUERTO="${GQ_PUERTO_TORNEO:-8732}"
TMP=$(mktemp -d)
trap 'kill "${SRV:-}" 2>/dev/null; rm -rf "$TMP"' EXIT
mkdir -p "$TMP/api"
cp api/*.php "$TMP/api/"
cp tools/pruebas/lib/sqlite-mysql.php "$TMP/api/sqlite-mysql.php"
rm -f "$TMP/api/correo-config.php"
TMPW="$TMP"
command -v cygpath >/dev/null 2>&1 && TMPW="$(cygpath -m "$TMP")"

# En la copia, la conexión de pruebas usa el traductor.
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

cat > "$TMP/esquema.php" <<EOF2
<?php
\$p = new PDO('sqlite:$TMPW/prueba.sqlite');
\$p->exec("CREATE TABLE torneos (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, titulo TEXT NOT NULL, tema TEXT NOT NULL DEFAULT '', empieza_en TEXT NOT NULL, acaba_en TEXT NOT NULL, borrador INTEGER NOT NULL DEFAULT 0, creado_en TEXT)");
\$p->exec("CREATE TABLE torneo_preguntas (id INTEGER PRIMARY KEY AUTOINCREMENT, torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE, orden INTEGER NOT NULL, cat TEXT NOT NULL DEFAULT '', diff TEXT NOT NULL DEFAULT 'medio', pts INTEGER NOT NULL DEFAULT 200, q TEXT NOT NULL, opts TEXT NOT NULL, ans INTEGER NOT NULL, hint TEXT NOT NULL DEFAULT '', exp TEXT NOT NULL DEFAULT '', UNIQUE (torneo_id, orden))");
\$p->exec("CREATE TABLE torneo_partidas (id INTEGER PRIMARY KEY AUTOINCREMENT, torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE, nombre TEXT NOT NULL COLLATE NOCASE, puntos INTEGER NOT NULL, correctas INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, segundos INTEGER NOT NULL DEFAULT 0, empezado_en TEXT, terminado INTEGER NOT NULL DEFAULT 0, ip_hash TEXT NOT NULL, creado_en TEXT NOT NULL, UNIQUE (torneo_id, nombre))");
\$p->exec("CREATE TABLE torneo_respuestas (id INTEGER PRIMARY KEY AUTOINCREMENT, partida_id INTEGER NOT NULL REFERENCES torneo_partidas(id) ON DELETE CASCADE, orden INTEGER NOT NULL, opciones TEXT NOT NULL DEFAULT '', servida_en TEXT NOT NULL, elegida INTEGER NOT NULL DEFAULT -1, acertada INTEGER NOT NULL DEFAULT 0, puntos INTEGER NOT NULL DEFAULT 0, respondida_en TEXT, UNIQUE (partida_id, orden))");
\$p->exec("CREATE TABLE torneo_sesiones (partida_id INTEGER PRIMARY KEY REFERENCES torneo_partidas(id) ON DELETE CASCADE, token TEXT NOT NULL, creado_en TEXT NOT NULL)");
\$p->exec("CREATE TABLE envios (id INTEGER PRIMARY KEY AUTOINCREMENT, ip_hash TEXT NOT NULL, creado_en TEXT NOT NULL)");
EOF2
"$PHP" "${OPC[@]}" "$TMP/esquema.php"

"$PHP" "${OPC[@]}" -S "127.0.0.1:$PUERTO" -t "$TMP" >"$TMP/servidor.log" 2>&1 &
SRV=$!
curl -s -o /dev/null --retry 40 --retry-delay 0 --retry-connrefused --max-time 10 "http://127.0.0.1:$PUERTO/api/torneo.php" || true

echo ""
echo "── Torneo: repetir torneos abiertos y cerrados, invitar (SQLite, servidor embebido)"
GQ_URL="http://127.0.0.1:$PUERTO/api/torneo.php" GQ_DB="$TMPW/prueba.sqlite" \
  "$PHP" "${OPC[@]}" tools/pruebas/torneo-repeticion-casos.php
RES=$?
if [ "$RES" -ne 0 ]; then
  echo "── registro del servidor (últimas líneas):"; tail -n 15 "$TMP/servidor.log"
fi
exit "$RES"
