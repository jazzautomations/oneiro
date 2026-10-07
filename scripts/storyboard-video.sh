#!/usr/bin/env bash
# Monta um vídeo-storyboard (fallback) a partir dos 6 frames do harness.
# uso: scripts/storyboard-video.sh [/tmp/oneiro-shots] [saida.mp4]
set -euo pipefail
IN="${1:-/tmp/oneiro-shots}"; OUT="${2:-/home/jazz/Projects/oneiro/submission/oneiro-storyboard.mp4}"
L=$(mktemp); trap 'rm -f "$L"' EXIT
add(){ [ -f "$IN/$1" ] && { echo "file '$IN/$1'"; echo "duration $2"; } >> "$L"; }
add 1-cartela.png 3.0; add 2-live-arrival.png 3.0; add 3-live.png 4.0; add 4-climax.png 4.0; add 5-cut.png 1.2; add 6-note.png 4.0
last=$(ls "$IN"/6-note.png 2>/dev/null || ls "$IN"/*.png | tail -1); echo "file '$last'" >> "$L"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$L" \
  -vf "scale=860:1720:flags=lanczos,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=18.7:d=0.5" \
  -r 30 -c:v libx264 -preset medium -crf 20 -movflags +faststart "$OUT"
echo "OK -> $OUT ($(stat -c %s "$OUT") bytes)"
