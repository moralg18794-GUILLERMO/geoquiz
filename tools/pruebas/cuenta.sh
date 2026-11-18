#!/bin/bash
# GeoQuiz — pruebas de api/cuenta.php (cuentas sin contraseña, con código por correo), en local.
#
# No hay MySQL en el portátil, así que se usa SQLite: db.php acepta un 'dsn' de pruebas en config.php
# (el del servidor nunca lo lleva) y el correo no se envía, se deja en un archivo que la prueba lee
# para sacar el código. Nada de esto toca el servidor de verdad.
#
#   bash tools/pruebas/cuenta.sh
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
  echo "── Cuentas: SE SALTA (este PHP no tiene pdo_sqlite)"
  exit 0
fi

PUERTO="${GQ_PUERTO_CUENTA:-8731}"
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
    'correo' => ['smtp_usuario' => 'a@b.c', 'smtp_clave' => 'x', 'contacto' => 'contacto@prueba.es',
                 'archivo_pruebas' => '$TMPW/correos.jsonl', 'autor_emails' => ['autor@prueba.es']],
];
EOF

# Esquema de pruebas (SQLite): las mismas tablas, columnas y únicos que en MySQL.
cat > "$TMP/esquema.php" <<EOF
<?php
\$p = new PDO('sqlite:$TMPW/prueba.sqlite');
\$p->exec('CREATE TABLE cuentas (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL COLLATE NOCASE UNIQUE, creada_en TEXT, ultimo_acceso TEXT, stats TEXT, stats_en TEXT)');
\$p->exec('CREATE TABLE cuenta_codigos (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, codigo_hash TEXT, nombre TEXT, intentos INTEGER DEFAULT 0, creado_en TEXT, expira_en TEXT, ip_hash TEXT)');
\$p->exec('CREATE TABLE avisos (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, estado TEXT, token TEXT, texto_version TEXT, ip_hash TEXT, pedido_en TEXT, confirmado_en TEXT)');
\$p->exec('CREATE TABLE cuenta_sesiones (id INTEGER PRIMARY KEY AUTOINCREMENT, cuenta_id INTEGER, token_hash TEXT UNIQUE, creada_en TEXT, ultimo_uso TEXT)');
EOF
"$PHP" "${OPC[@]}" "$TMP/esquema.php"

"$PHP" "${OPC[@]}" -S "127.0.0.1:$PUERTO" -t "$TMP" >"$TMP/servidor.log" 2>&1 &
SRV=$!
curl -s -o /dev/null --retry 40 --retry-delay 0 --retry-connrefused --max-time 10 "http://127.0.0.1:$PUERTO/api/cuenta.php" || true

echo ""
echo "── Cuentas con código por correo (SQLite, servidor embebido)"
GQ_URL="http://127.0.0.1:$PUERTO/api/cuenta.php" GQ_CORREOS="$TMPW/correos.jsonl" GQ_DB="$TMPW/prueba.sqlite" \
  "$PHP" "${OPC[@]}" tools/pruebas/cuenta-casos.php
