#!/bin/bash
# Captura las páginas que hacen de "pestañas" en la demo: capture-sites.sh <carpeta de trabajo>
W=$1; mkdir -p "$W/sites"
urls=(
  "https://es.wikipedia.org/wiki/Safari_(navegador)"
  "https://developer.mozilla.org/es/docs/Mozilla/Add-ons/WebExtensions"
  "https://news.ycombinator.com/"
  "https://www.wikipedia.org/"
  "https://www.mozilla.org/es-ES/firefox/"
  "https://www.openstreetmap.org/#map=13/39.4699/-0.3763"
  "https://developer.mozilla.org/es/"
  "https://es.wikipedia.org/wiki/Firefox"
)
i=0
for u in "${urls[@]}"; do
  i=$((i + 1)); P="$W/profile-site$i"; mkdir -p "$P"
  echo 'user_pref("ui.systemUsesDarkTheme", 0);' > "$P/user.js"
  timeout 60 firefox --headless --no-remote --profile "$P" --window-size=1440,900 --screenshot "$W/sites/$i.png" "$u" >/dev/null 2>&1 &
done
wait
