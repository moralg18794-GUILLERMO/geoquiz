#!/bin/bash
# GeoQuiz — pruebas del ranking por temática de api/ranking.php, en local.
#
# No hay MySQL en el portátil, así que se usa SQLite: db.php acepta un 'dsn' de pruebas en
# config.php (el del servidor nunca lo lleva). Nada de esto toca el servidor de verdad.
#
# Por qué existe esta prueba: el ranking por temática decide a QUÉ lista va cada partida y
# cuáles se borran al recortar la tabla. Las dos cosas se ven mal y tarde —una partida que
# no sale donde debería, o la mejor marca de alguien que desaparece sola semanas después— y
# ninguna da ningún error. Aquí se comprueban contra el endpoint de verdad.
#
#   bash tools/pruebas/ranking-tema.sh
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
  echo "── Ranking por temática: SE SALTA (este PHP no tiene pdo_sqlite)"
  exit 0
fi

PUERTO="${GQ_PUERTO_RANKING:-8734}"
TMP=$(mktemp -d)
trap 'kill "${SRV:-}" 2>/dev/null; rm -rf "$TMP"' EXIT
mkdir -p "$TMP/api"
cp api/*.php "$TMP/api/"
rm -f "$TMP/api/correo-config.php"
TMPW="$TMP"
command -v cygpath >/dev/null 2>&1 && TMPW="$(cygpath -m "$TMP")"

cat > "$TMP/api/config.php" <<EOF
<?php
return [
    'dsn' => 'sqlite:$TMPW/prueba.sqlite',
    'sal_ip' => 'sal-de-pruebas', 'token_admin' => 'token-de-pruebas-0123456789abcdef',
];
EOF

# Esquema de pruebas (SQLite): las mismas tablas y columnas que en MySQL. El COLLATE NOCASE
# del nombre imita la colación de MySQL, que agrupa 'Magui' y 'magui' como el mismo jugador:
# sin eso, la prueba no vería el caso que hay resuelto en el endpoint.
cat > "$TMP/esquema.php" <<EOF
<?php
\$p = new PDO('sqlite:$TMPW/prueba.sqlite');
\$p->exec('CREATE TABLE partidas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL COLLATE NOCASE,
    puntos INTEGER NOT NULL, pct INTEGER NOT NULL, modo TEXT NOT NULL, dif TEXT DEFAULT "",
    eje TEXT DEFAULT "", nsel INTEGER DEFAULT 0, ntot INTEGER DEFAULT 0, oficial INTEGER DEFAULT 0,
    ip_hash TEXT NOT NULL, creado_en TEXT NOT NULL)');
\$p->exec('CREATE TABLE partidas_tema (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL COLLATE NOCASE,
    tema TEXT NOT NULL, puntos INTEGER NOT NULL, pct INTEGER NOT NULL, dif TEXT DEFAULT "",
    ip_hash TEXT NOT NULL, creado_en TEXT NOT NULL)');
\$p->exec('CREATE TABLE envios (id INTEGER PRIMARY KEY AUTOINCREMENT, ip_hash TEXT NOT NULL, creado_en TEXT NOT NULL)');
EOF
"$PHP" "${OPC[@]}" "$TMP/esquema.php"

"$PHP" "${OPC[@]}" -S "127.0.0.1:$PUERTO" -t "$TMP" >"$TMP/servidor.log" 2>&1 &
SRV=$!
curl -s -o /dev/null --retry 40 --retry-delay 0 --retry-connrefused --max-time 10 "http://127.0.0.1:$PUERTO/api/ranking.php" || true

echo ""
echo "── Ranking por temática (SQLite, servidor embebido)"
GQ_URL="http://127.0.0.1:$PUERTO/api/ranking.php" GQ_DB="$TMPW/prueba.sqlite" \
  "$PHP" "${OPC[@]}" tools/pruebas/ranking-tema-casos.php
