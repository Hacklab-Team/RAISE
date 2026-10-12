#!/usr/bin/env bash
# RAISE GPIO buzzer setup for Raspberry Pi.
#
#     bash setup-buzzer.sh                    # active buzzer on GPIO18 (physical pin 12)
#     bash setup-buzzer.sh passive            # passive buzzer (plays the kiosk's pitches)
#     BUZZER_PIN=23 bash setup-buzzer.sh      # another GPIO (BCM number)
#     ACTIVE_LOW=1 bash setup-buzzer.sh       # module sounds when the signal is LOW
#
# Installs buzzer-bridge.py as a service (raise-buzzer) on http://127.0.0.1:8799, allows the
# kiosk site to call it, and switches the kiosk's beeps over to the buzzer.
set -euo pipefail

TYPE="${1:-active}"
PIN="${BUZZER_PIN:-18}"
KIOSK_ORIGIN="${KIOSK_ORIGIN:-https://raise.bindalvansh01.workers.dev}"
SITE="${RAISE_SITE:-https://raise.bindalvansh01.workers.dev}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST=/opt/raise-buzzer
LAUNCHER="$HOME/.local/bin/raise-kiosk"

case "$TYPE" in active|passive) ;; *) echo "Type must be active or passive" >&2; exit 1 ;; esac
if [ "$(id -u)" -eq 0 ]; then echo "Run as your normal user (not sudo); it asks for sudo when needed." >&2; exit 1; fi
EXTRA=""
[ "${ACTIVE_LOW:-0}" = "1" ] && EXTRA="--active-low"

echo "==> Packages"
sudo apt-get install -y python3-gpiozero python3-lgpio >/dev/null
id -nG "$USER" | grep -qw gpio || { sudo usermod -aG gpio "$USER"; echo "    added $USER to the gpio group"; }

echo "==> Bridge in $DEST"
sudo mkdir -p "$DEST"
if [ -f "$HERE/buzzer-bridge.py" ]; then
    sudo cp "$HERE/buzzer-bridge.py" "$DEST/buzzer-bridge.py"
else
    sudo curl -fsSL "$SITE/kiosk/buzzer-bridge.py" -o "$DEST/buzzer-bridge.py"
fi

echo "==> Service raise-buzzer ($TYPE buzzer on GPIO$PIN)"
sudo tee /etc/systemd/system/raise-buzzer.service >/dev/null <<EOF
[Unit]
Description=RAISE GPIO buzzer for the kiosk
After=multi-user.target

[Service]
User=$USER
SupplementaryGroups=gpio
ExecStart=/usr/bin/python3 $DEST/buzzer-bridge.py --type $TYPE --pin $PIN $EXTRA
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable raise-buzzer.service >/dev/null
sudo systemctl restart raise-buzzer.service

echo "==> Let the kiosk site reach the buzzer on this Pi (Chromium policy)"
for POLICY_DIR in /etc/chromium/policies/managed /etc/chromium-browser/policies/managed; do
    sudo mkdir -p "$POLICY_DIR"
    sudo tee "$POLICY_DIR/raise-buzzer.json" >/dev/null <<EOF
{
  "LocalNetworkAccessAllowedForUrls": ["$KIOSK_ORIGIN"],
  "InsecurePrivateNetworkRequestsAllowedForUrls": ["$KIOSK_ORIGIN"]
}
EOF
done

echo "==> Switch the kiosk's beeps to the buzzer"
if [ -f "$LAUNCHER" ]; then
    if grep -q 'buzzer=1' "$LAUNCHER"; then
        echo "    already on"
    else
        # Append ?buzzer=1 (or &buzzer=1) to the URL after --kiosk.
        sed -i -E 's#(--kiosk ")([^"?]*)(\?[^"]*)?"#\1\2\3\&buzzer=1"#; s#(--kiosk "[^"?]*)&buzzer=1"#\1?buzzer=1"#' "$LAUNCHER"
        grep -o -- '--kiosk "[^"]*"' "$LAUNCHER" | sed 's/^/    /'
    fi
else
    echo "    kiosk launcher not found; open the kiosk once with ?buzzer=1 added to its address"
fi

echo
echo "==> Test: you should hear scan, login (double), error (low) and paid"
sudo systemctl stop raise-buzzer.service
python3 "$DEST/buzzer-bridge.py" --type "$TYPE" --pin "$PIN" $EXTRA --test || true
sudo systemctl start raise-buzzer.service

cat <<EOF

Done. Restart the kiosk to use the buzzer:   pkill chromium; $LAUNCHER &

  Heard nothing, or only clicks?   bash setup-buzzer.sh passive
  Buzzing constantly?              ACTIVE_LOW=1 bash setup-buzzer.sh $TYPE
  Service log:                     journalctl -u raise-buzzer -f
EOF
