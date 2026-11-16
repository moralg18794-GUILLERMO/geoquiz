#!/bin/bash
# GeoQuiz — genera img/og-torneo.jpg (la imagen que sale al compartir el enlace) a partir de
# tools/og/og-torneo.html. Usa el Edge que ya trae Windows (sin instalar nada) y .NET para
# comprimir a JPG. Hace falta conexión: las fuentes se piden a Google Fonts.
#
#   bash tools/og/hacer-og.sh
#
# WhatsApp pinta la tarjeta grande solo si la imagen pesa menos de unos 300 KB; el script
# avisa si se pasa.
set -euo pipefail
cd "$(dirname "$0")/../.."

EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
[ -x "$EDGE" ] || { echo "No encuentro Edge en $EDGE" >&2; exit 1; }

FUENTE="$(pwd -W)/tools/og/og-torneo.html"
PNG="$(pwd -W)/tools/og/og-torneo.png"
JPG="$(pwd -W)/img/og-torneo.jpg"

"$EDGE" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --virtual-time-budget=10000 \
  --screenshot="$PNG" "file:///${FUENTE}" >/dev/null 2>&1

powershell.exe -NoProfile -Command "
Add-Type -AssemblyName System.Drawing
\$img = [System.Drawing.Image]::FromFile('$PNG')
\$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { \$_.MimeType -eq 'image/jpeg' }
\$p = New-Object System.Drawing.Imaging.EncoderParameters(1)
\$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]84)
\$img.Save('$JPG', \$enc, \$p)
Write-Host ('{0}x{1}' -f \$img.Width, \$img.Height)
\$img.Dispose()
"
rm -f "$PNG"
TAM=$(wc -c < img/og-torneo.jpg)
echo "img/og-torneo.jpg: $TAM bytes"
[ "$TAM" -lt 300000 ] || echo "AVISO: pasa de 300 KB; WhatsApp puede pintar la tarjeta pequeña" >&2
