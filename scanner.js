// Webcam barcode/QR scanner built on zxing-wasm (zxing-cpp compiled to WebAssembly).
// It's much faster and more tolerant of blurry, fixed-focus USB webcams than
// the pure-JS ZXing port used by html5-qrcode, which matters on a Raspberry Pi.
//
// One camera stream stays open for the whole session. The kiosk switches
// between "pass" mode (QR) and "product" mode (EAN/UPC/Code 128) instead of
// tearing the camera down and re-requesting it.
(function (global) {
    // The on-screen guide is only a hint: decoding always reads the whole frame, because
    // cropping to the guide made small or off-centre barcodes fail in testing.
    const MODES = {
        pass: { formats: ["QRCode"] },
        product: { formats: ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "ITF"] }
    };
    // EAN/UPC carry a check digit, so one valid read is trustworthy. Code 128/39/ITF
    // can misread, so those need two identical reads in a row.
    const CHECKSUMMED = new Set(["EAN13", "EAN8", "UPCA", "UPCE"]);

    const MAX_DECODE_WIDTH = 1920;
    const IDLE_DELAY_MS = 30;
    const CONFIRM_WINDOW_MS = 1200;
    const REPEAT_COOLDOWN_MS = 2500;

    class Scanner {
        constructor(video, { onDetect, onStatus } = {}) {
            this.video = video;
            this.onDetect = onDetect || (() => {});
            this.onStatus = onStatus || (() => {});
            this.onMiss = null;
            this.mode = "pass";
            this.stream = null;
            this.deviceId = null;
            this.paused = false;
            this.running = false;
            this.canvas = document.createElement("canvas");
            this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
            this.pending = null;      // { text, count, at }
            this.lastAccepted = null; // { text, at }
            this.decoderReady = this._loadDecoder();
        }

        async _loadDecoder() {
            if (!global.ZXingWASM) throw new Error("Barcode decoder failed to load. Check the network connection.");
            await global.ZXingWASM.prepareZXingModule({
                overrides: { locateFile: (path) => "vendor/" + path },
                fireImmediately: true
            });
        }

        setMode(mode) {
            this.mode = mode;
            this.pending = null;
        }

        pause() { this.paused = true; this.pending = null; }
        resume() { this.paused = false; this.pending = null; }

        // Forget the last accepted code so the same item can be scanned again straight away.
        resetCooldown() { this.lastAccepted = null; }

        async listCameras() {
            if (!navigator.mediaDevices?.enumerateDevices) return [];
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(d => d.kind === "videoinput");
        }

        async start(deviceId) {
            if (!navigator.mediaDevices?.getUserMedia) {
                this.onStatus("error", "Camera needs https or localhost.");
                return false;
            }
            this.onStatus("starting");
            this._stopTracks();
            try {
                await this.decoderReady;
            } catch (e) {
                this.onStatus("error", e.message);
                return false;
            }
            const video = {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
            };
            if (deviceId) video.deviceId = { exact: deviceId };
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
            } catch (err) {
                const messages = {
                    NotAllowedError: "Camera permission was blocked. Allow it in the browser's site settings.",
                    NotFoundError: "No camera found. Plug in the USB webcam and retry.",
                    NotReadableError: "Camera is in use by another app.",
                    OverconstrainedError: "Selected camera is unavailable."
                };
                this.onStatus("error", messages[err.name] || "Camera could not start.");
                return false;
            }
            const track = this.stream.getVideoTracks()[0];
            this.deviceId = track.getSettings().deviceId || deviceId || null;
            this._tryContinuousFocus(track);

            this.video.srcObject = this.stream;
            this.video.setAttribute("playsinline", "");
            this.video.muted = true;
            await this.video.play().catch(() => {});
            this.onStatus("live", track.label);

            if (!this.running) {
                this.running = true;
                this._loop();
            }
            return true;
        }

        _tryContinuousFocus(track) {
            try {
                const caps = track.getCapabilities ? track.getCapabilities() : {};
                if (caps.focusMode && caps.focusMode.includes("continuous")) {
                    track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
                }
            } catch (e) { /* not supported */ }
        }

        _stopTracks() {
            if (this.stream) this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }

        stop() {
            this.running = false;
            this._stopTracks();
            this.video.srcObject = null;
        }

        async _loop() {
            while (this.running) {
                if (!this.paused && this.video.readyState >= 2 && this.video.videoWidth) {
                    try {
                        await this._decodeFrame();
                    } catch (e) {
                        console.warn("Decode error:", e);
                    }
                }
                await new Promise(r => setTimeout(r, IDLE_DELAY_MS));
            }
        }

        async _decodeFrame() {
            const mode = MODES[this.mode];
            const vw = this.video.videoWidth, vh = this.video.videoHeight;
            const scale = Math.min(1, MAX_DECODE_WIDTH / vw);
            const cw = Math.round(vw * scale), ch = Math.round(vh * scale);
            if (this.canvas.width !== cw) this.canvas.width = cw;
            if (this.canvas.height !== ch) this.canvas.height = ch;

            // Pass 1: plain frame (cheap, handles sharp codes).
            this.ctx.filter = "none";
            this.ctx.drawImage(this.video, 0, 0, cw, ch);
            let hit = await this._read(this.ctx.getImageData(0, 0, cw, ch), mode, false);

            // Pass 2: contrast-stretched grayscale, no downscale, single-line accept.
            // Rescues soft, low-contrast webcam frames (tested: 0/6 -> 4/6 on blurred codes).
            if (!hit && this.mode === "product" && !this.paused) {
                this.ctx.filter = "grayscale(1) contrast(2.2) brightness(1.05)";
                this.ctx.drawImage(this.video, 0, 0, cw, ch);
                this.ctx.filter = "none";
                hit = await this._read(this.ctx.getImageData(0, 0, cw, ch), mode, true);
            }
            if (this.paused) return;
            if (hit) this._consider(hit.text.trim(), hit.format, mode);
            else this.onMiss && this.onMiss();
        }

        async _read(image, mode, enhanced) {
            const results = await global.ZXingWASM.readBarcodes(image, {
                formats: mode.formats,
                tryHarder: true,
                tryRotate: true,
                tryInvert: false,
                tryDownscale: !enhanced,
                minLineCount: enhanced ? 1 : 2,
                maxNumberOfSymbols: 1
            });
            return results.find(r => r.isValid && r.text) || null;
        }

        _consider(text, format, mode) {
            const now = performance.now();
            if (this.lastAccepted && this.lastAccepted.text === text && now - this.lastAccepted.at < REPEAT_COOLDOWN_MS) {
                this.lastAccepted.at = now; // still in view: extend the cooldown
                return;
            }
            if (this.pending && this.pending.text === text && now - this.pending.at < CONFIRM_WINDOW_MS) {
                this.pending.count++;
                this.pending.at = now;
            } else {
                this.pending = { text, count: 1, at: now };
            }
            const needed = this.mode === "product" && !CHECKSUMMED.has(format) ? 2 : 1;
            if (this.pending.count >= needed) {
                this.pending = null;
                this.lastAccepted = { text, at: now };
                this.onDetect(text, format);
            }
        }
    }

    global.RAISEScanner = Scanner;
})(window);
