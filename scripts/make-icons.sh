#!/usr/bin/env bash
# Иконка и сплэш TurnikMan. Рисуем мастер-файл в ImageMagick и раскладываем по плотностям.
# Требует: imagemagick (convert). Запуск: bash scripts/make-icons.sh
set -euo pipefail

cd "$(dirname "$0")/.."
RES=android/app/src/main/res
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

BG='#0d1117'      # фон приложения
LIME='#c6ff3d'    # акцент (как в интерфейсе)
INK='#f2f4f8'     # фигура
DARK='#1b2027'

# --- мастер-иконка 1024x1024, полнокадровая, без скруглений (скругляет система) ---
draw_master() {
  local out=$1
  convert -size 1024x1024 xc:"$BG" \
    -fill "$DARK" -draw "roundrectangle 0,0 1023,1023 0,0" \
    -fill "$BG" -draw "roundrectangle 0,0 1023,1023 0,0" \
    -fill "$LIME" -draw "rectangle 96,300 928,352" \
    -fill "$LIME" -draw "rectangle 96,300 148,470" \
    -fill "$LIME" -draw "rectangle 876,300 928,470" \
    -fill '#00000055' -draw "rectangle 96,352 928,368" \
    -fill "$INK" -draw "circle 512,520 512,438" \
    -fill "$INK" -draw "roundrectangle 466,556 558,760 34,34" \
    -fill "$INK" -draw "roundrectangle 452,700 572,744 22,22" \
    -fill "$INK" -draw "roundrectangle 470,730 514,860 22,22" \
    -fill "$INK" -draw "roundrectangle 510,730 554,860 22,22" \
    -fill "$INK" -draw "roundrectangle 546,714 606,748 22,22" \
    -fill none -stroke "$INK" -strokewidth 40 -draw "line 486,572 452,352" -draw "line 538,572 572,352" \
    -fill "$INK" -stroke none -draw "circle 452,352 452,330" -draw "circle 572,352 572,330" \
    "$out"
}

draw_master "$TMP/icon-source.png"

# --- обычные иконки (legacy) ---
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  dens=${d%%:*}; size=${d##*:}
  convert "$TMP/icon-source.png" -depth 8 -filter Lanczos -resize "${size}x${size}" "$RES/mipmap-$dens/ic_launcher.png"
  # круглая версия
  convert "$TMP/icon-source.png" -depth 8 -filter Lanczos -resize "${size}x${size}" \
    \( -size "${size}x${size}" xc:black -fill white -draw "circle $((size/2)),$((size/2)) $((size/2)),1" \) \
    -alpha off -compose CopyOpacity -composite "$RES/mipmap-$dens/ic_launcher_round.png"
done

# --- foreground для adaptive icon: 108dp, рисунок занимает ~62% с прозрачными полями ---
for d in mdpi:108 hdpi:162 xhdpi:216 xxhdpi:324 xxxhdpi:432; do
  dens=${d%%:*}; size=${d##*:}
  inner=$((size * 62 / 100))
  convert -size "${size}x${size}" xc:none \
    \( "$TMP/icon-source.png" -depth 8 -filter Lanczos -resize "${inner}x${inner}" \) \
    -gravity center -compose over -composite -depth 8 "$RES/mipmap-$dens/ic_launcher_foreground.png"
done

# --- цвет фона adaptive icon и сплэша ---
cat > "$RES/values/ic_launcher_background.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0d1117</color>
</resources>
XML
python3 - "$RES/values/colors.xml" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = re.sub(r'<color name="splashBackground">[^<]*</color>', '<color name="splashBackground">#0d1117</color>', s)
open(p, 'w', encoding='utf-8').write(s)
PY

# --- сплэш: тёмный фон с иконкой по центру ---
make_splash() {
  local w=$1 h=$2 out=$3 icon=$4
  convert -size "${w}x${h}" xc:"$BG" \
    \( "$TMP/icon-source.png" -depth 8 -filter Lanczos -resize "${icon}x${icon}" \) \
    -gravity center -compose over -composite -depth 8 "$out"
}
make_splash 2732 2732 "$RES/drawable/splash.png" 760
for d in mdpi:320:480 hdpi:480:800 xhdpi:720:1280 xxhdpi:960:1600 xxxhdpi:1280:1920; do
  dens=${d%%:*}; rest=${d#*:}; w=${rest%%:*}; h=${rest##*:}
  make_splash "$h" "$w" "$RES/drawable-land-$dens/splash.png" $((h / 3))
  make_splash "$w" "$h" "$RES/drawable-port-$dens/splash.png" $((w / 2))
done

echo "иконки и сплэш обновлены"
identify "$RES/mipmap-xxxhdpi/ic_launcher.png" "$RES/mipmap-xxxhdpi/ic_launcher_foreground.png" "$RES/drawable/splash.png"
