# Raspberry Pi kiosk

Boots the Pi straight into the RAISE self-checkout, full screen.

You need Raspberry Pi OS **with desktop** (Bookworm or newer) and the USB webcam plugged in.

## Hosted site (from a pendrive)

Copy `setup-kiosk.sh` to the pendrive. On the Pi, open a terminal and run:

```bash
bash /media/$USER/<PENDRIVE>/setup-kiosk.sh https://your-site.example/index.html
sudo reboot
```

Use the `https://` address; Chromium blocks the camera on plain `http` sites. Run the script with `bash` as your normal user, not with `sudo`; it asks for sudo when it needs it.

## Local copy (no internet needed)

From inside a cloned repo, with no URL argument, it serves the files on `http://localhost:8080` instead:

```bash
bash kiosk/setup-kiosk.sh
sudo reboot
```

## What it sets up

- Local mode only: a web server, `raise-kiosk-server` (systemd), serving the repo at `http://localhost:8080`.
- A launcher, `~/.local/bin/raise-kiosk`, that opens Chromium in kiosk mode with camera permission granted automatically.
- Autostart for your desktop: labwc, Wayfire or X11. If it guesses wrong, force one with `DESKTOP=labwc bash kiosk/setup-kiosk.sh` (or `wayfire`, `x11`).
- Desktop auto-login, and no screen blanking.

## Day to day

| Task | How |
|---|---|
| Leave the kiosk | `Alt+F4` |
| Start it again | `~/.local/bin/raise-kiosk &` |
| Reload the app after a deploy | `Ctrl+Shift+R` in the kiosk |
| Change the URL | Run the script again with the new URL |

The Bluetooth or USB barcode scanner works as a keyboard, so you don't need to set anything up for it.

## NFC card login (GPIO NFC module)

Customers can link an NFC card to their RAISE Pass and log in with a tap.

```bash
curl -fsSLo ~/setup-nfc.sh https://raise.bindalvansh01.workers.dev/kiosk/setup-nfc.sh
bash ~/setup-nfc.sh          # auto-detects; or: bash ~/setup-nfc.sh rc522 | pn532
sudo reboot
```

The installer runs `nfc-bridge.py` as a service (`raise-nfc`). It reads the card and types `nfc-<card id>` + Enter into the kiosk, the same way the barcode scanner does, so the page needs no extra permissions.

**Using it**
- **New customer:** Register, then **Link NFC card**, then tap the card.
- **Existing pass:** scan the pass QR, then **Link NFC card** (top right), then tap the card.
- **Log in:** tap the card on the Identify screen.

Card links are stored on this kiosk only, as a hash of the card ID. Card IDs can be copied, so a card login is convenience, not strong security.

**Wiring: RC522 (SPI).** Use 3.3 V, not 5 V.

| RC522 | Pi pin | GPIO |
|---|---|---|
| SDA / SS | 24 | GPIO8 (CE0) |
| SCK | 23 | GPIO11 |
| MOSI | 19 | GPIO10 |
| MISO | 21 | GPIO9 |
| RST | 22 | GPIO25 |
| GND | 6 | GND |
| 3.3V | 1 | 3V3 |
| IRQ | not connected | |

**Wiring: PN532 (I2C).** Set the board's switches to I2C mode.

| PN532 | Pi pin |
|---|---|
| SDA | 3 (GPIO2) |
| SCL | 5 (GPIO3) |
| VCC | 1 (3V3) |
| GND | 6 |

**Checking it**
- **Watch card taps:** `journalctl -u raise-nfc -f`
- **PN532 detected?** `sudo i2cdetect -y 1` should show `24`.
- **Test without the kiosk:** `sudo systemctl stop raise-nfc && sudo /opt/raise-nfc/venv/bin/python /opt/raise-nfc/nfc-bridge.py --reader rc522`

## Undo

```bash
rm ~/.local/bin/raise-kiosk
# local mode only:
sudo systemctl disable --now raise-kiosk-server
sudo rm /etc/systemd/system/raise-kiosk-server.service
```

Then remove the `raise-kiosk` line from whichever file the script reported: `~/.config/labwc/autostart`, `~/.config/wayfire.ini`, or `~/.config/lxsession/LXDE-pi/autostart`.
