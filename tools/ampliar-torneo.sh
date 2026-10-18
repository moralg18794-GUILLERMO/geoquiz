#!/bin/bash
# Cambia solo las fechas de un torneo ya publicado (p.ej. alargar el cierre), sin tocar sus
# preguntas ni las partidas ya jugadas. NO despliega el sitio.
#
#   bash tools/ampliar-torneo.sh 2026-10-14-ceuta --acaba "2026-10-18 23:00"
#   bash tools/ampliar-torneo.sh 2026-10-14-ceuta --empieza "2026-10-13 00:00" --acaba "2026-10-18 23:00"
#
# Las fechas van en hora de Madrid. Se puede mandar solo una de las dos: la que no se
# mande se deja como está. Para publicar un torneo nuevo o cambiar sus preguntas, usa
# tools/publicar-torneo.sh — este script es solo para el caso de "ábreme/ciérrame antes".
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

SLUG="${1:-}"
shift || true
EMPIEZA=""
ACABA=""
while [ $# -gt 0 ]; do
  case "$1" in
    --empieza) EMPIEZA="${2:-}"; shift 2 ;;
    --acaba)   ACABA="${2:-}"; shift 2 ;;
    *) echo "Argumento desconocido: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$SLUG" ] || { [ -z "$EMPIEZA" ] && [ -z "$ACABA" ]; }; then
  echo 'Uso: bash tools/ampliar-torneo.sh <slug> [--empieza "AAAA-MM-DD HH:MM"] [--acaba "AAAA-MM-DD HH:MM"]' >&2
  echo '     (al menos una de las dos fechas; hora de Madrid)' >&2
  exit 1
fi

# Construye el JSON a pelo para no depender de que el PHP local tenga json_encode
# disponible en todos los sitios donde se pueda lanzar este script.
BODY=$(php -r '
  $slug = $argv[1]; $empieza = $argv[2]; $acaba = $argv[3];
  $d = ["solo_fechas" => true, "slug" => $slug];
  if ($empieza !== "") { $d["empieza_en"] = $empieza; }
  if ($acaba   !== "") { $d["acaba_en"]   = $acaba; }
  echo json_encode($d, JSON_UNESCAPED_UNICODE);
' "$SLUG" "$EMPIEZA" "$ACABA")

echo "--- respuesta del servidor ---"
curl -s -w '\n(HTTP %{http_code})\n' -X POST "$API" \
  -H "X-GQ-Admin: $TOKEN" -H 'Content-Type: application/json' \
  --data-binary "$BODY"
