#!/bin/bash
# GeoQuiz — pasar los torneos de torneos/ por el validador ANTES de publicarlos.
#
# La idea: no reescribir aquí las reglas del servidor (slug, fechas, 4 opciones, ans, diff,
# preguntas repetidas...). Se levanta el servidor embebido con una copia de api/ y se le
# manda cada archivo de torneos/ igual que haría tools/publicar-torneo.sh. Si el validador
# dice 400, el torneo está mal, y lo dice con el mismo mensaje exacto que daría Hostinger.
#
# Así hay UNA sola definición de qué es un torneo válido. Una segunda lista de reglas en esta
# prueba sería peor que no tenerla: se desincronizaría y daría confianza falsa.
#
# Esto no publica nada: ni toca la base de datos ni habla con Hostinger. El config.php de
# pruebas lleva credenciales falsas, así que un torneo correcto se queda en el 500 de la
# conexión, que es justo lo que se quiere (validado, no guardado).
set -uo pipefail
cd "$(dirname "$0")/../.."

PHP="${GQ_PHP:-php}"
PUERTO="${GQ_PUERTO_TORNEOS:-8724}"
TOKEN='token-de-pruebas-que-no-es-el-de-verdad-0123456789'
TMP=$(mktemp -d)
trap 'kill "${SRV:-}" 2>/dev/null; rm -rf "$TMP"' EXIT

mkdir -p "$TMP/api"
cp api/*.php "$TMP/api/"
cat > "$TMP/api/config.php" <<EOF
<?php
return [
    'host' => '127.0.0.1', 'port' => 3306,
    'nombre' => 'no_existe', 'usuario' => 'no_existe', 'clave' => 'no_existe',
    'sal_ip' => 'sal-de-pruebas',
    'token_admin' => '$TOKEN',
];
EOF

"$PHP" -S "127.0.0.1:$PUERTO" -t "$TMP" >"$TMP/servidor.log" 2>&1 &
SRV=$!
URL="http://127.0.0.1:$PUERTO/api/torneo-admin.php"
curl -s -o /dev/null --retry 40 --retry-delay 0 --retry-connrefused --max-time 10 "$URL" || true

echo ""
echo "── Los torneos de torneos/, pasados por el validador de verdad"

BIEN=0; MAL=0
for j in torneos/*.json; do
  [ -e "$j" ] || continue
  nombre=$(basename "$j")

  # Primero el JSON a secas: una coma de más se ve mejor aquí que traducida a un 400.
  if ! "$PHP" -r '$d=json_decode(file_get_contents($argv[1]),true);
        if(!is_array($d)){fwrite(STDERR,json_last_error_msg());exit(1);}' "$j" 2>"$TMP/err"; then
    echo "  MAL $nombre: no es JSON válido ($(cat "$TMP/err"))"
    MAL=$((MAL+1)); continue
  fi

  codigo=$(curl -s -o "$TMP/resp.json" -w '%{http_code}' -X POST "$URL" \
    -H "X-GQ-Admin: $TOKEN" -H 'Content-Type: application/json' --data-binary "@$j")
  if [ "$codigo" = "400" ] || [ "$codigo" = "409" ]; then
    echo "  MAL $nombre: $(cat "$TMP/resp.json")"
    MAL=$((MAL+1))
  else
    # Cuántas preguntas y cuándo abre y cierra, en hora de Madrid y en UTC, para que al
    # leerlo se vea si la ventana es la que se quería.
    "$PHP" -r '$d=json_decode(file_get_contents($argv[1]),true);
      $z=new DateTimeZone("Europe/Madrid");
      $f=function($s)use($z){$t=DateTime::createFromFormat("Y-m-d H:i",$s,$z);
        return $t===false?"?":$t->setTimezone(new DateTimeZone("UTC"))->format("Y-m-d H:i")." UTC";};
      printf("  ok  %-30s %2d preguntas · %s a %s (Madrid) = %s a %s%s\n",
        basename($argv[1]), count($d["preguntas"]??[]), $d["empieza_en"], $d["acaba_en"],
        $f($d["empieza_en"]), $f($d["acaba_en"]), !empty($d["borrador"])?" · BORRADOR":"");' "$j"
    BIEN=$((BIEN+1))
  fi
done

echo ""
if [ "$MAL" -gt 0 ]; then
  echo "FALLO · $BIEN válidos, $MAL con errores"
  exit 1
fi
echo "BIEN · $BIEN torneos válidos"
