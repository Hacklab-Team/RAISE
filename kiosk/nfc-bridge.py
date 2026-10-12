#!/usr/bin/env python3
"""RAISE NFC bridge for Raspberry Pi.

Reads card UIDs from a GPIO NFC module and types them into the kiosk like a keyboard:

    nfc-<uid in lowercase hex><Enter>        e.g.  nfc-04a3b2c1d0e580

The kiosk page treats that like any scanned code, so no browser permissions or network
setup are needed (same idea as a USB/Bluetooth barcode scanner).

Supported modules:
    pn532   PN532 on I2C (address 0x24)          pip: adafruit-circuitpython-pn532
    rc522   MFRC522 / RC522 on SPI0 (CE0)        pip: mfrc522 (+ rpi-lgpio on Pi 5)
    auto    try pn532, then rc522 (default)

Run as root (it creates a virtual keyboard through /dev/uinput):
    sudo python3 nfc-bridge.py [--reader auto|pn532|rc522]
Test without hardware or root (UIDs from stdin, prints instead of typing):
    python3 nfc-bridge.py --dry-run
"""
import argparse
import sys
import time

PREFIX = "nfc-"
SAME_CARD_COOLDOWN_S = 2.0   # a card resting on the reader is reported once, not continuously


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


# ---------------------------------------------------------------- readers

def open_pn532():
    import board
    import busio
    from adafruit_pn532.i2c import PN532_I2C
    pn = PN532_I2C(busio.I2C(board.SCL, board.SDA), debug=False)
    ic, ver, rev, support = pn.firmware_version
    log(f"PN532 found (firmware {ver}.{rev})")
    pn.SAM_configuration()

    def read():
        uid = pn.read_passive_target(timeout=0.3)
        return bytes(uid).hex() if uid else None
    return read


def open_rc522():
    from mfrc522 import MFRC522
    r = MFRC522()
    log("RC522 opened on SPI0")

    def read():
        status, _ = r.MFRC522_Request(r.PICC_REQIDL)
        if status != r.MI_OK:
            return None
        status, uid = r.MFRC522_Anticoll()
        if status != r.MI_OK or not uid:
            return None
        return bytes(uid[:4]).hex()   # anticollision returns 4 UID bytes + a check byte
    return read


def open_reader(kind):
    order = {"pn532": [open_pn532], "rc522": [open_rc522], "auto": [open_pn532, open_rc522]}[kind]
    errors = []
    for opener in order:
        try:
            return opener()
        except Exception as exc:  # missing library, wrong bus, module not wired
            errors.append(f"{opener.__name__[5:]}: {exc}")
    raise SystemExit("No NFC reader found.\n  " + "\n  ".join(errors) +
                     "\nCheck the wiring, and that I2C/SPI are enabled (sudo raspi-config).")


def stdin_reader():
    log("dry run: type a UID (hex) and press Enter")

    def read():
        line = sys.stdin.readline()
        if not line:
            raise SystemExit(0)
        return line.strip().lower() or None
    return read


# ---------------------------------------------------------------- keyboard

def open_keyboard():
    from evdev import UInput, ecodes as e
    keymap = {c: getattr(e, "KEY_" + c.upper()) for c in "abcdef0123456789nfc"}
    keymap["-"] = e.KEY_MINUS
    ui = UInput({e.EV_KEY: list(set(keymap.values())) + [e.KEY_ENTER]}, name="RAISE NFC reader")
    time.sleep(0.5)  # give the desktop a moment to register the new keyboard

    def type_line(text):
        for ch in text:
            code = keymap[ch]
            ui.write(e.EV_KEY, code, 1)
            ui.write(e.EV_KEY, code, 0)
            ui.syn()
        ui.write(e.EV_KEY, e.KEY_ENTER, 1)
        ui.write(e.EV_KEY, e.KEY_ENTER, 0)
        ui.syn()
    return type_line


def main():
    ap = argparse.ArgumentParser(description="Type NFC card UIDs into the RAISE kiosk.")
    ap.add_argument("--reader", choices=["auto", "pn532", "rc522"], default="auto")
    ap.add_argument("--dry-run", action="store_true", help="read UIDs from stdin and print instead of typing")
    args = ap.parse_args()

    if args.dry_run:
        read, emit = stdin_reader(), lambda text: print("WOULD TYPE:", text + "⏎", flush=True)
    else:
        read, emit = open_reader(args.reader), open_keyboard()

    last_uid, last_seen = None, 0.0
    log("ready, waiting for cards")
    while True:
        try:
            uid = read()
        except SystemExit:
            raise
        except Exception as exc:  # transient bus errors: keep going
            log(f"read error: {exc}")
            time.sleep(0.5)
            continue
        now = time.monotonic()
        if not uid:
            if now - last_seen > SAME_CARD_COOLDOWN_S:
                last_uid = None
            time.sleep(0.05)
            continue
        if uid == last_uid and now - last_seen < SAME_CARD_COOLDOWN_S:
            last_seen = now
            continue
        last_uid, last_seen = uid, now
        log(f"card {uid}")
        emit(PREFIX + uid)


if __name__ == "__main__":
    main()
