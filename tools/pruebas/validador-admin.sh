#!/bin/bash
# GeoQuiz — el validador de api/torneo-admin.php, probado en local y sin MySQL.
#
# Por qué se puede: torneo-admin.php comprueba el token y valida el torneo ENTERO antes de
# llamar a gq_db() (esa es la razón del comentario de su línea 63). Así que con el servidor
# embebido de PHP y un config.php de pruebas se puede ejercitar todo el validador aunque no
# haya una base de datos a la que conectarse. Es la parte más barata de cubrir del proyecto:
# ~20 casos de rechazo sin instalar nada.
#
# Por qué importa: el validador es lo único que separa un torneo mal escrito de 20 amigos
# jugando un torneo roto, y el único aviso que da es un 400 en medio de la respuesta de curl.
# Descubrir el error aquí cuesta diez segundos; descubrirlo después de publicar cuesta
# borrar el torneo y volver a avisar por WhatsApp.
#
# IMPORTANTE: esto NUNCA toca el servidor de verdad. Trabaja sobre una copia de api/ en una
# carpeta temporal, con un token inventado y credenciales de base de datos falsas. El
# api/config.php real no se lee ni se modifica.
#
#   bash tools/pruebas/validador-admin.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

PHP="${GQ_PHP:-php}"
if ! command -v "$PHP" >/dev/null 2>&1; then
  echo "No encuentro '$PHP'. Pásale la ruta con GQ_PHP=/ruta/a/php.exe" >&2; exit 1
fi

PUERTO="${GQ_PUERTO:-8723}"
TOKEN='token-de-pruebas-que-no-es-el-de-verdad-0123456789'
TMP=$(mktemp -d)
trap 'kill "${SRV:-}" 2>/dev/null; rm -rf "$TMP"' EXIT

# Copia de api/ con un config.php de pruebas. Las credenciales son falsas a propósito: si
# alguna vez el validador dejara pasar algo que no debe, se estrellaría contra una base de
# datos inexistente en vez de escribir en la de verdad.
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

# Esperar a que levante preguntándole, en vez de dormir un número de segundos a ojo.
curl -s -o /dev/null --retry 40 --retry-delay 0 --retry-connrefused --max-time 10 "$URL" || true

BIEN=0; MAL=0

# caso "qué se está comprobando" <http esperado> <clave de error esperada> <<'JSON'
# La clave de error (el campo "error" de la respuesta) se comprueba además del código porque
# un 400 puede venir de cinco sitios distintos: sin la clave, la prueba pasaría aunque el
# validador rechazara por el motivo equivocado.
caso() {
  local que="$1" http="$2" clave="$3"
  # El cuerpo se escribe en un archivo y se manda con @, en vez de pasarlo como argumento
  # de curl. En Git Bash los argumentos se reconvierten al invocar curl.exe, que es nativo
  # de Windows, y los acentos se estropean por el camino: con "¿Capital?" el servidor recibe
  # bytes que no son UTF-8 y responde 'json' en vez de validar. En español eso afectaría a
  # casi cualquier pregunta. tools/publicar-torneo.sh ya manda el torneo con @ por lo mismo.
  cat > "$TMP/caso.json"
  local resp codigo err
  resp=$(curl -s -w '\n%{http_code}' -X POST "$URL" \
    -H "X-GQ-Admin: $TOKEN" -H 'Content-Type: application/json' --data-binary "@$TMP/caso.json")
  codigo=$(printf '%s' "$resp" | tail -1)
  err=$(printf '%s' "$resp" | sed '$d' | "$PHP" -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d["error"] ?? "?";')
  if [ "$codigo" = "$http" ] && [ "$err" = "$clave" ]; then
    BIEN=$((BIEN+1))
  else
    MAL=$((MAL+1))
    echo "  FALLA: $que"
    echo "     esperado: HTTP $http / error '$clave'"
    echo "     obtenido: HTTP $codigo / error '$err'"
  fi
}

# Igual que caso(), pero mandando una cabecera de token distinta.
caso_token() {
  local que="$1" http="$2" clave="$3" token="$4"
  local resp codigo err
  resp=$(curl -s -w '\n%{http_code}' -X POST "$URL" ${token:+-H "X-GQ-Admin: $token"} \
    -H 'Content-Type: application/json' --data-binary '{}')
  codigo=$(printf '%s' "$resp" | tail -1)
  err=$(printf '%s' "$resp" | sed '$d' | "$PHP" -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d["error"] ?? "?";')
  if [ "$codigo" = "$http" ] && [ "$err" = "$clave" ]; then BIEN=$((BIEN+1)); else
    MAL=$((MAL+1)); echo "  FALLA: $que"; echo "     esperado: HTTP $http / error '$clave'"; echo "     obtenido: HTTP $codigo / error '$err'"
  fi
}

echo ""
echo "── El validador de api/torneo-admin.php (sin MySQL, servidor embebido)"

# ── La puerta ─────────────────────────────────────────────────────────────
# Sin token y con token equivocado tienen que responder 404, no 401: desde fuera este
# archivo no existe. Un 401 confirmaría a quien lo busca que ha dado con el sitio.
caso_token "sin token el endpoint dice que no existe"          404 no ""
caso_token "con token equivocado dice lo mismo"                404 no "esto-no-es-el-token-pero-mide-mas-de-32-letras"

# ── El envoltorio ─────────────────────────────────────────────────────────
caso "un cuerpo que no es JSON se rechaza" 400 json <<'JSON'
esto no es json
JSON

# ── El slug ───────────────────────────────────────────────────────────────
# El slug va en la URL que se reparte por WhatsApp: si admitiera mayúsculas o espacios,
# la mitad de los enlaces llegarían roto.
caso "el slug con mayúsculas se rechaza" 400 slug <<'JSON'
{"slug":"Ceuta-2026","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00","preguntas":[]}
JSON
caso "el slug de dos letras se rechaza" 400 slug <<'JSON'
{"slug":"ab","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00","preguntas":[]}
JSON
caso "el slug con espacios se rechaza" 400 slug <<'JSON'
{"slug":"ceuta 2026","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00","preguntas":[]}
JSON
caso "el slug que empieza por guion se rechaza" 400 slug <<'JSON'
{"slug":"-ceuta","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00","preguntas":[]}
JSON

# ── El título ─────────────────────────────────────────────────────────────
caso "sin título se rechaza" 400 campo <<'JSON'
{"slug":"torneo-bueno","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00","preguntas":[]}
JSON
caso "el título vacío se rechaza" 400 campo <<'JSON'
{"slug":"torneo-bueno","titulo":"   ","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00","preguntas":[]}
JSON
caso "el título de más de 80 caracteres se rechaza" 400 largo <<'JSON'
{"slug":"torneo-bueno","titulo":"Ceuta, Melilla, Gibraltar, las Chafarinas, el Peñón de Vélez y todo lo demás que quepa aquí","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00","preguntas":[]}
JSON

# ── Las fechas ────────────────────────────────────────────────────────────
caso "una fecha en otro formato se rechaza" 400 fecha <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"01/11/2026 00:00","acaba_en":"2026-11-08 22:00","preguntas":[]}
JSON
# ↓↓↓ ESTAS DOS FALLAN HOY: es un fallo de verdad, no de la prueba ↓↓↓
# gq_ta_utc() usa DateTime::createFromFormat() y solo comprueba si devuelve false. Pero
# createFromFormat NO devuelve false con una fecha imposible: la desborda en silencio.
# "2026-11-31 22:00" (noviembre tiene 30 días) se convierte en el 1 de diciembre, y el
# torneo cierra un día más tarde de lo que pone en el JSON. Nadie lo ve: el número que se
# escribió y el número que se guardó son los dos plausibles. Se arregla mirando
# DateTime::getLastErrors() (tres líneas; está en el informe).
# Este torneo es correcto en todo menos en la fecha de cierre, para que el único motivo
# posible de rechazo sea ese. Hoy no se rechaza: se guarda cerrando el 1 de diciembre.
caso "un 31 de noviembre se rechaza en vez de volverse 1 de diciembre" 400 fecha <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-31 22:00",
 "preguntas":[{"q":"¿Capital de Marruecos?","opts":["Rabat","Casablanca","Fez","Tánger"],"ans":0,"diff":"facil"}]}
JSON
caso "un día y una hora imposibles se rechazan" 400 fecha <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-13-45 99:99","acaba_en":"2026-11-08 22:00","preguntas":[]}
JSON
# ↑↑↑ fin de las que fallan hoy ↑↑↑
# Con segundos la fecha pasa de 16 caracteres, así que salta el límite de largo antes que el
# de formato. Se comprueba el error que SALE, no el que uno esperaría: si mañana se amplía el
# campo, esta prueba avisa de que ahora contesta otra cosa.
caso "una fecha con segundos se rechaza por larga" 400 largo <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-01 00:00:00","acaba_en":"2026-11-08 22:00","preguntas":[]}
JSON
caso "un torneo que acaba antes de empezar se rechaza" 400 ventana <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-08 00:00","acaba_en":"2026-11-01 22:00","preguntas":[]}
JSON
caso "un torneo que acaba cuando empieza se rechaza" 400 ventana <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-01 00:00","preguntas":[]}
JSON

# ── Las preguntas ─────────────────────────────────────────────────────────
caso "un torneo sin preguntas se rechaza" 400 preguntas <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00","preguntas":[]}
JSON
caso "tres opciones en vez de cuatro se rechazan" 400 opts <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00",
 "preguntas":[{"q":"¿Capital de Marruecos?","opts":["Rabat","Casablanca","Fez"],"ans":0,"diff":"facil"}]}
JSON
caso "dos opciones iguales se rechazan" 400 opts <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00",
 "preguntas":[{"q":"¿Capital de Marruecos?","opts":["Rabat","Rabat","Fez","Tánger"],"ans":0,"diff":"facil"}]}
JSON
caso "dos opciones iguales salvo mayúsculas se rechazan" 400 opts <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00",
 "preguntas":[{"q":"¿Capital de Marruecos?","opts":["Rabat","RABAT","Fez","Tánger"],"ans":0,"diff":"facil"}]}
JSON
caso "un ans de 4 se rechaza" 400 ans <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00",
 "preguntas":[{"q":"¿Capital de Marruecos?","opts":["Rabat","Casablanca","Fez","Tánger"],"ans":4,"diff":"facil"}]}
JSON
caso "un ans negativo se rechaza" 400 ans <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00",
 "preguntas":[{"q":"¿Capital de Marruecos?","opts":["Rabat","Casablanca","Fez","Tánger"],"ans":-1,"diff":"facil"}]}
JSON
caso "un ans ausente se rechaza" 400 ans <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00",
 "preguntas":[{"q":"¿Capital de Marruecos?","opts":["Rabat","Casablanca","Fez","Tánger"],"diff":"facil"}]}
JSON
caso "una dificultad que no está en la lista se rechaza" 400 diff <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00",
 "preguntas":[{"q":"¿Capital de Marruecos?","opts":["Rabat","Casablanca","Fez","Tánger"],"ans":0,"diff":"imposible"}]}
JSON
caso "dos preguntas con el mismo enunciado se rechazan" 400 repetida <<'JSON'
{"slug":"torneo-bueno","titulo":"T","empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00",
 "preguntas":[{"q":"¿Capital de Marruecos?","opts":["Rabat","Casablanca","Fez","Tánger"],"ans":0,"diff":"facil"},
              {"q":"¿Capital   de Marruecos?","opts":["Argel","Túnez","Trípoli","El Cairo"],"ans":0,"diff":"medio"}]}
JSON

# Más de 50 preguntas. Se genera porque pegarlas a mano aquí no aportaría nada.
"$PHP" -r '$p=[]; for($i=0;$i<51;$i++){$p[]=["q"=>"Pregunta numero $i","opts"=>["a$i","b$i","c$i","d$i"],"ans"=>0,"diff"=>"facil"];}
  echo json_encode(["slug"=>"torneo-bueno","titulo"=>"T","empieza_en"=>"2026-11-01 00:00","acaba_en"=>"2026-11-08 22:00","preguntas"=>$p]);' \
  > "$TMP/51.json"
caso "más de 50 preguntas se rechazan" 400 preguntas < "$TMP/51.json"

# ── Control positivo ──────────────────────────────────────────────────────
# Las 25 comprobaciones de arriba verifican que el validador rechaza lo que debe. Esta
# verifica lo contrario, que es igual de importante y se olvida siempre: que NO rechaza un
# torneo bien escrito. Sin ella, un validador que dijera 400 a todo pasaría la prueba entera.
#
# Aquí no hay MySQL, así que un torneo correcto no se puede llegar a guardar: muere al
# conectarse. Eso basta, porque lo que se quiere saber es que la validación terminó sin
# quejarse. Se comprueba "cualquier cosa menos un 400" en vez de un error concreto, para que
# la prueba no dependa de por qué falla la conexión en este portátil.
cat > "$TMP/caso.json" <<'JSON'
{"slug":"torneo-bueno","titulo":"Un torneo bien escrito","tema":"Para la prueba.",
 "empieza_en":"2026-11-01 00:00","acaba_en":"2026-11-08 22:00","borrador":true,
 "preguntas":[{"cat":"África y Oriente Medio","diff":"facil","q":"¿Capital de Marruecos?",
               "opts":["Rabat","Casablanca","Fez","Tánger"],"ans":0,
               "hint":"No es la ciudad más grande.","exp":"Rabat es la capital; Casablanca es la mayor."},
              {"cat":"África y Oriente Medio","diff":"dificil","q":"¿En qué año se cerró la verja de Gibraltar?",
               "opts":["1969","1954","1982","1975"],"ans":0,"hint":"","exp":"Franco la cerró en 1969."}]}
JSON
CODIGO=$(curl -s -o "$TMP/salida.json" -w '%{http_code}' -X POST "$URL" \
  -H "X-GQ-Admin: $TOKEN" -H 'Content-Type: application/json' --data-binary "@$TMP/caso.json")
if [ "$CODIGO" != "400" ]; then
  BIEN=$((BIEN+1))
else
  MAL=$((MAL+1))
  echo "  FALLA: un torneo correcto atraviesa todo el validador sin que lo rechacen"
  echo "     el validador ha contestado 400 a un torneo bien escrito: $(cat "$TMP/salida.json")"
fi

# ── El método ─────────────────────────────────────────────────────────────
RESP=$(curl -s -w '\n%{http_code}' -X PUT "$URL" -H "X-GQ-Admin: $TOKEN" --data '{}')
if [ "$(printf '%s' "$RESP" | tail -1)" = "405" ]; then BIEN=$((BIEN+1)); else
  MAL=$((MAL+1)); echo "  FALLA: un PUT se rechaza con 405"; echo "     obtenido: $(printf '%s' "$RESP" | tail -1)"
fi

echo ""
if [ "$MAL" -gt 0 ]; then
  echo "FALLO · $BIEN bien, $MAL mal"
  echo "--- registro del servidor embebido ---"; tail -20 "$TMP/servidor.log"
  exit 1
fi
echo "BIEN · $BIEN comprobaciones"
