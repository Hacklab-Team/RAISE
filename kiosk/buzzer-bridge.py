#!/usr/bin/env python3
"""RAISE buzzer bridge for Raspberry Pi.

The kiosk page can't reach GPIO pins, so this tiny local service does it. The page calls

    GET http://127.0.0.1:8799/beep?f=<Hz>&ms=<duration>&n=<repeats>

whenever it beeps (item scanned, customer logged in, error, payment). It only listens on
127.0.0.1, so nothing else on the network can trigger it.

Buzzer modules (3 pins: VCC, GND, signal):
    active   beeps by itself when switched on (one fixed pitch)     --type active  (default)
    passive  needs a tone; plays the page's pitches                  --type passive
Some modules sound when the signal is LOW instead of HIGH: add --active-low.
Quieter: --volume 0.1 … 1 (passive: narrower pulses; active: power is pulsed at 8 kHz, which
softens it but can sound a little rougher. A 100–330 Ω resistor on VCC is the hardware way).

    python3 buzzer-bridge.py --test             # play scan, login, error and paid, then exit
    python3 buzzer-bridge.py --dry-run          # no GPIO: print what would play
"""
import argparse
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

GAP_S = 0.07  # silence between repeats

# Same sounds as the kiosk page: (frequency Hz, duration ms, repeats)
PATTERNS = {"scan": (1046, 90, 1), "login": (1568, 70, 2), "error": (330, 160, 1), "paid": (1318, 140, 1)}


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


class Buzzer:
    def __init__(self, pin, kind, active_low, dry_run, volume=1.0):
        self.kind, self.dry_run = kind, dry_run
        self.volume = max(0.1, min(1.0, volume))
        self.jobs = queue.Queue(maxsize=4)   # beeps arriving faster than they play are dropped
        if dry_run:
            self.dev = None
        elif kind == "passive":
            from gpiozero import PWMOutputDevice
            self.dev = PWMOutputDevice(pin, active_high=not active_low, initial_value=0, frequency=1000)
        elif self.volume < 1.0:
            # Active buzzer, softened: pulse its power fast; the duty cycle sets the loudness.
            from gpiozero import PWMOutputDevice
            self.dev = PWMOutputDevice(pin, active_high=not active_low, initial_value=0, frequency=8000)
        else:
            from gpiozero import DigitalOutputDevice
            self.dev = DigitalOutputDevice(pin, active_high=not active_low, initial_value=False)
        threading.Thread(target=self._worker, daemon=True).start()
        log(f"{kind} buzzer on GPIO{pin}, volume {self.volume:g}{' (active low)' if active_low else ''}{' [dry run]' if dry_run else ''}")

    def beep(self, freq, ms, n):
        try:
            self.jobs.put_nowait((freq, ms, n))
        except queue.Full:
            pass

    def _worker(self):
        while True:
            freq, ms, n = self.jobs.get()
            for i in range(n):
                self._tone(freq, ms)
                if i < n - 1:
                    time.sleep(GAP_S)

    def _tone(self, freq, ms):
        if self.dry_run:
            log(f"beep {freq} Hz for {ms} ms at volume {self.volume:g}")
            time.sleep(ms / 1000)
            return
        if self.kind == "passive":
            self.dev.frequency = freq
            self.dev.value = 0.5 * self.volume   # 50% duty = loudest; narrower pulses are quieter
            time.sleep(ms / 1000)
            self.dev.value = 0
        elif self.volume < 1.0:
            self.dev.value = self.volume
            time.sleep(ms / 1000)
            self.dev.value = 0
        else:
            self.dev.on()
            time.sleep(ms / 1000)
            self.dev.off()


def clamp(value, lo, hi, default):
    try:
        return max(lo, min(hi, int(float(value))))
    except (TypeError, ValueError):
        return default


def make_handler(buzzer):
    class Handler(BaseHTTPRequestHandler):
        def _headers(self, code=204):
            self.send_response(code)
            # The kiosk is served from another origin (https://…); allow it, and answer Chrome's
            # Private/Local Network Access preflight for a public page calling 127.0.0.1.
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def do_OPTIONS(self):
            self._headers()

        def do_GET(self):
            url = urlparse(self.path)
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            if url.path == "/beep":
                buzzer.beep(clamp(q.get("f"), 100, 5000, 1046), clamp(q.get("ms"), 10, 1000, 90), clamp(q.get("n"), 1, 4, 1))
                self._headers()
            elif url.path == "/health":
                self._headers(200)
            else:
                self._headers(404)

        def log_message(self, *args):  # quiet: one line per request would flood the journal
            pass
    return Handler


def main():
    ap = argparse.ArgumentParser(description="Beep a GPIO buzzer for the RAISE kiosk.")
    ap.add_argument("--pin", type=int, default=18, help="BCM GPIO number of the signal pin (default 18 = physical pin 12)")
    ap.add_argument("--type", choices=["active", "passive"], default="active")
    ap.add_argument("--active-low", action="store_true", help="module sounds when the signal is LOW")
    ap.add_argument("--volume", type=float, default=1.0, help="0.1 (quiet) to 1 (full)")
    ap.add_argument("--port", type=int, default=8799)
    ap.add_argument("--test", action="store_true", help="play scan, login, error and paid, then exit")
    ap.add_argument("--dry-run", action="store_true", help="no GPIO; print the beeps")
    args = ap.parse_args()

    buzzer = Buzzer(args.pin, args.type, args.active_low, args.dry_run, args.volume)
    if args.test:
        for name, (f, ms, n) in PATTERNS.items():
            log(f"test: {name}")
            buzzer.beep(f, ms, n)
            time.sleep(1.0)
        return

    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(buzzer))
    log(f"listening on http://127.0.0.1:{args.port}/beep")
    server.serve_forever()


if __name__ == "__main__":
    main()
