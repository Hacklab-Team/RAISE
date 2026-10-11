# Raspberry Pi kiosk

Boots the Pi straight into the RAISE self-checkout, full screen.

You need Raspberry Pi OS **with desktop** (Bookworm or newer), the USB webcam plugged in, and this repo cloned on the Pi.

```bash
git clone https://github.com/Hacklab-Team/RAISE.git
cd RAISE
bash kiosk/setup-kiosk.sh
sudo reboot
```

Run the script as your normal user, not with `sudo`; it asks for sudo when it needs it.

## What it sets up

- A local web server, `raise-kiosk-server` (systemd), serving the repo at `http://localhost:8080`. Using `localhost` lets the camera and the pass encryption work without https.
- A launcher, `~/.local/bin/raise-kiosk`, that opens Chromium in kiosk mode with camera permission granted automatically.
- Autostart for your desktop: labwc, Wayfire or X11. If it guesses wrong, force one with `DESKTOP=labwc bash kiosk/setup-kiosk.sh` (or `wayfire`, `x11`).
- Desktop auto-login, and no screen blanking.

## Day to day

| Task | How |
|---|---|
| Leave the kiosk | `Alt+F4` |
| Start it again | `~/.local/bin/raise-kiosk &` |
| Update the app | `git pull` in the repo, then `Ctrl+Shift+R` in the kiosk |
| Check the server | `systemctl status raise-kiosk-server` |
| Use another port | `PORT=9000 bash kiosk/setup-kiosk.sh` |

The Bluetooth or USB barcode scanner works as a keyboard, so you don't need to set anything up for it.

## Undo

```bash
sudo systemctl disable --now raise-kiosk-server
sudo rm /etc/systemd/system/raise-kiosk-server.service
rm ~/.local/bin/raise-kiosk
```

Then remove the `raise-kiosk` line from whichever file the script reported: `~/.config/labwc/autostart`, `~/.config/wayfire.ini`, or `~/.config/lxsession/LXDE-pi/autostart`.
