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

## Undo

```bash
rm ~/.local/bin/raise-kiosk
# local mode only:
sudo systemctl disable --now raise-kiosk-server
sudo rm /etc/systemd/system/raise-kiosk-server.service
```

Then remove the `raise-kiosk` line from whichever file the script reported: `~/.config/labwc/autostart`, `~/.config/wayfire.ini`, or `~/.config/lxsession/LXDE-pi/autostart`.
