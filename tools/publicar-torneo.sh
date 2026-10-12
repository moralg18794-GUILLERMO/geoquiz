#!/bin/bash
# Publica un torneo en la base de datos. NO despliega el sitio: esa es la gracia.
#
#   bash tools/publicar-torneo.sh torneos/2026-10-12-hispanidad.json
#   bash tools/publicar-torneo.sh --listar
#
# El token sale de api/config.php, que no está en el repositorio. Nunca se escribe en la
# línea de comandos ni en la URL: viaja en una cabecera, para que no acabe en los registros
# del servidor ni en el historial de la terminal.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${GQ_BASE:-https://mediumturquoise-dugong-529601.hostingersite.com}"
API="$BASE/api/torneo-admin.php"

if [ ! -f api/config.php ]; then
  echo "No encuentro api/config.php: sin él no hay token." >&2; exit 1
fi
TOKEN=$(sed -n "s/.*'token_admin'[[:space:]]*=>[[:space:]]*'\([^']*\)'.*/\1/p" api/config.php | head -1)
if [ -z "$TOKEN" ]; then
  echo "api/config.php no tiene token_admin. Añádelo (ver api/config.example.php)." >&2; exit 1
fi

if [ "${1:-}" = "--listar" ]; then
  curl -s -H "X-GQ-Admin: $TOKEN" "$API?listar=1"; echo; exit 0
fi

JSON="${1:-}"
if [ -z "$JSON" ] || [ ! -f "$JSON" ]; then
  echo "Uso: bash tools/publicar-torneo.sh torneos/XXXX.json   (o --listar)" >&2; exit 1
fi

# Comprobar el JSON aquí antes de mandarlo: un error de coma se ve mejor en local que
# traducido a un 400 del servidor.
if command -v php >/dev/null 2>&1; then
  php -r '$d=json_decode(file_get_contents($argv[1]),true);
    if(!is_array($d)){fwrite(STDERR,"JSON inválido: ".json_last_error_msg()."\n");exit(1);}
    $n=count($d["preguntas"]??[]);
    fwrite(STDERR,"→ {$d["slug"]}: {$d["titulo"]} · $n preguntas · {$d["empieza_en"]} a {$d["acaba_en"]} (hora de Madrid)\n");' "$JSON"
fi

echo "--- respuesta del servidor ---"
curl -s -w '\n(HTTP %{http_code})\n' -X POST "$API" \
  -H "X-GQ-Admin: $TOKEN" -H 'Content-Type: application/json' \
  --data-binary "@$JSON"
