#!/usr/bin/env bash
# Collects RAISE kiosk diagnostics into raise-diag.txt next to this script (e.g. on a pendrive).
#     bash raise-diag.sh
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/raise-diag.txt"
{
    echo "== date"; date
    echo "== system"; head -3 /etc/os-release; uname -a
    echo "== session"; echo "type=${XDG_SESSION_TYPE:-} wayland=${WAYLAND_DISPLAY:-} x=${DISPLAY:-} desktop=${XDG_CURRENT_DESKTOP:-}"
    echo "== desktop processes"; pgrep -a 'labwc|wayfire|lxsession|Xorg|lxpanel|wf-panel|pcmanfm'
    echo "== chromium"; command -v chromium chromium-browser; chromium --version 2>/dev/null || chromium-browser --version 2>/dev/null
    echo "== launcher"; cat ~/.local/bin/raise-kiosk
    echo "== kiosk boot log"; tail -n 60 ~/.cache/raise-kiosk.log
    echo "== labwc autostart"; cat ~/.config/labwc/autostart
    echo "== wayfire autostart"; grep -A3 '\[autostart\]' ~/.config/wayfire.ini
    echo "== lxde autostart"; cat ~/.config/lxsession/LXDE-pi/autostart
    echo "== xdg autostart"; ls -la ~/.config/autostart; cat ~/.config/autostart/raise-kiosk.desktop
    echo "== boot behaviour (B4 = desktop autologin)"; sudo -n raspi-config nonint get_boot_behaviour 2>/dev/null || echo "(needs sudo)"
    echo "== chromium running?"; pgrep -af chromium | cut -c1-200
} > "$OUT" 2>&1
sync
echo "Saved: $OUT"
