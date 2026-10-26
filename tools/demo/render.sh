#!/bin/bash
# render.sh <profile> <out.png> <query>
P=$1; OUT=$2; Q=$3
mkdir -p "$P"; [ -f "$P/user.js" ] || echo 'user_pref("ui.systemUsesDarkTheme", 0);' > "$P/user.js"
timeout 60 firefox --headless --no-remote --profile "$P" --window-size=1440,900 --screenshot "$OUT" "http://127.0.0.1:8765/harness.html?mock=demo&$Q" >/dev/null 2>&1
