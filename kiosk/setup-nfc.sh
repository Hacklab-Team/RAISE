#!/usr/bin/env bash
# RAISE NFC reader setup for Raspberry Pi (PN532 on I2C or RC522 on SPI).
#
#     bash setup-nfc.sh            # auto-detect the module
#     bash setup-nfc.sh rc522      # or force: pn532 | rc522
#
# Installs nfc-bridge.py as a service (raise-nfc) that types "nfc-<card uid>" + Enter into
# the kiosk whenever a card is tapped. Reboot once afterwards so I2C/SPI are active.
set -euo pipefail

READER="${1:-auto}"
SITE="${RAISE_SITE:-https://raise.bindalvansh01.workers.dev}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST=/opt/raise-nfc

case "$READER" in auto|pn532|rc522) ;; *) echo "Reader must be auto, pn532 or rc522" >&2; exit 1 ;; esac
if [ "$(id -u)" -eq 0 ]; then
    echo "Run as your normal user (not sudo); it asks for sudo when needed." >&2
    exit 1
fi

echo "==> Enabling I2C and SPI"
sudo raspi-config nonint do_i2c 0 || echo "    (enable I2C in raspi-config > Interface Options)"
sudo raspi-config nonint do_spi 0 || echo "    (enable SPI in raspi-config > Interface Options)"

echo "==> Virtual keyboard support (uinput)"
sudo modprobe uinput
echo uinput | sudo tee /etc/modules-load.d/raise-uinput.conf >/dev/null

echo "==> Packages"
sudo apt-get update -y
sudo apt-get install -y python3-venv python3-evdev python3-spidev python3-rpi-lgpio i2c-tools || \
    sudo apt-get install -y python3-venv python3-evdev python3-spidev i2c-tools

echo "==> Bridge in $DEST"
sudo mkdir -p "$DEST"
if [ -f "$HERE/nfc-bridge.py" ]; then
    sudo cp "$HERE/nfc-bridge.py" "$DEST/nfc-bridge.py"
else
    sudo curl -fsSL --retry 5 --retry-all-errors --retry-delay 2 "$SITE/kiosk/nfc-bridge.py" -o "$DEST/nfc-bridge.py"
fi
[ -d "$DEST/venv" ] || sudo python3 -m venv --system-site-packages "$DEST/venv"
# mfrc522 pulls in RPi.GPIO, which doesn't work on a Pi 5; rpi-lgpio (from apt) provides the
# same module on every Pi, so install mfrc522 without its dependencies.
sudo "$DEST/venv/bin/pip" install --quiet --no-deps mfrc522
sudo "$DEST/venv/bin/pip" install --quiet adafruit-circuitpython-pn532 adafruit-blinka

echo "==> Service raise-nfc (reader: $READER)"
sudo tee /etc/systemd/system/raise-nfc.service >/dev/null <<EOF
[Unit]
Description=RAISE NFC card reader -> kiosk keyboard
After=multi-user.target

[Service]
ExecStart=$DEST/venv/bin/python $DEST/nfc-bridge.py --reader $READER
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable raise-nfc.service
sudo systemctl restart raise-nfc.service || true

echo
echo "==> Detected I2C devices (a PN532 shows as 24):"
sudo i2cdetect -y 1 2>/dev/null | sed 's/^/    /' || echo "    (I2C not active until reboot)"

cat <<EOF

Done. Reboot once so I2C/SPI are active:   sudo reboot

  Watch card taps:   journalctl -u raise-nfc -f
  Restart reader:    sudo systemctl restart raise-nfc
EOF
