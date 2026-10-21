#!/bin/bash
# GeoQuiz — todo lo que se comprueba antes de desplegar, en un solo comando.
#
#   bash tools/revisar.sh
#
# Sale con 0 si todo está bien y con 1 si algo falla, igual que tools/version.sh, para que
# se pueda encadenar. No instala nada: usa el php que ya hay en el portátil y curl.
#
# El orden va de lo más barato a lo más lento: primero los errores de sintaxis (medio
# segundo), al final el servidor embebido (unos segundos). Así, cuando hay una coma mal
# puesta, se sabe enseguida y no después de esperar a todo lo demás.
set -uo pipefail
cd "$(dirname "$0")/.."

# ── Encontrar php ─────────────────────────────────────────────────────────
# En este portátil php no está en el PATH, está en la carpeta de WinGet. Se busca ahí si no
# aparece suelto, para no tener que acordarse de la ruta.
if [ -n "${GQ_PHP:-}" ]; then
  PHP="$GQ_PHP"
elif command -v php >/dev/null 2>&1; then
  PHP=php
else
  PHP=$(ls -d "$HOME"/AppData/Local/Microsoft/WinGet/Packages/PHP.PHP.8.*/php.exe 2>/dev/null | head -1)
fi
if [ -z "${PHP:-}" ] || ! "$PHP" -v >/dev/null 2>&1; then
  echo "No encuentro php. Pásale la ruta: GQ_PHP=/c/ruta/php.exe bash tools/revisar.sh" >&2
  exit 1
fi
export GQ_PHP="$PHP"

FALLOS=0
paso() {
  local nombre="$1"; shift
  echo ""
  echo "═══ $nombre"
  if "$@"; then :; else FALLOS=$((FALLOS+1)); echo "   ↑ ha fallado: $nombre"; fi
}

# ── 1. Sintaxis de PHP ────────────────────────────────────────────────────
# Lo más barato y lo que más duele si se escapa: un error de sintaxis en un .php subido a
# Hostinger deja la API devolviendo una página de error en vez de JSON, y el juego entero
# se queda sin ranking ni torneo.
lint_php() {
  local mal=0
  for f in api/*.php; do
    "$PHP" -l "$f" >/dev/null 2>&1 || { echo "  error de sintaxis en $f"; "$PHP" -l "$f"; mal=1; }
  done
  [ "$mal" -eq 0 ] && echo "  $(ls api/*.php | wc -l) archivos PHP sin errores de sintaxis"
  return $mal
}
paso "Sintaxis de los .php" lint_php

# ── 2. Versiones de caché en index.html ───────────────────────────────────
# La misma comprobación que hace tools/version.sh, pero sin tocar nada: solo mira si queda
# alguna ruta sin ?v= y si todas llevan la MISMA versión. Mezclar versiones es peor que no
# versionar: el navegador se queda con media mitad nueva y media vieja.
version_estatica() {
  local total sin versiones cuantas
  total=$(grep -cE '(href|src)="(css|js|img)/' index.html)
  sin=$(grep -E '(href|src)="(css|js|img)/' index.html | grep -cv '?v=' || true)
  if [ "$sin" -gt 0 ]; then
    echo "  $sin de $total rutas sin ?v=:"
    grep -nE '(href|src)="(css|js|img)/' index.html | grep -v '?v=' >&2
    return 1
  fi
  # Solo las rutas de css/js/img. El ?v= de la imagen de OpenGraph (la miniatura que sale al
  # pegar el enlace en WhatsApp) va por su cuenta y no tiene por qué llevar este número:
  # si se contara, esta comprobación daría falsa alarma siempre.
  versiones=$(grep -E '(href|src)="(css|js|img)/' index.html | grep -oE '\?v=[^"]+' | sort -u | tr '\n' ' ')
  cuantas=$(grep -E '(href|src)="(css|js|img)/' index.html | grep -oE '\?v=[^"]+' | sort -u | wc -l)
  if [ "$cuantas" -ne 1 ]; then
    echo "  hay versiones mezcladas entre las rutas de css/js/img: $versiones"
    echo "  (el navegador se quedaría con una parte nueva y otra vieja)"
    return 1
  fi
  echo "  las $total rutas de css/js/img llevan la misma versión ($versiones)"
  return 0
}
paso "Versiones de caché en index.html" version_estatica

# ── 3. Pruebas sobre funciones puras y datos ──────────────────────────────
for p in tools/pruebas/*.php; do
  [ "$(basename "$p")" = "afirmar.php" ] && continue
  paso "$(basename "$p")" "$PHP" "$p"
done

# ── 4. Pruebas que levantan el servidor embebido ──────────────────────────
for p in tools/pruebas/*.sh; do
  paso "$(basename "$p")" bash "$p"
done

# ── Resumen ───────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════"
if [ "$FALLOS" -gt 0 ]; then
  echo "  $FALLOS paso(s) han fallado. NO desplegar."
  exit 1
fi
echo "  Todo en orden. Se puede desplegar."
