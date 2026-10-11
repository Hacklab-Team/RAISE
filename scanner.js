// Webcam barcode/QR scanner for the kiosk.
//
// Decoding runs in a Web Worker (scan-worker.js) with two WebAssembly decoders, ZXing and
// ZBar. Each live frame gets one strategy, rotating through a schedule, so within a few
// frames every barcode is tried by both decoders on both the plain and the
// contrast-enhanced image. Measured on simulated USB-webcam frames (blur, motion, glare,
// MJPEG artefacts), the rotation covers far more cases than any single decoder.
//
// One camera stream stays open for the whole session. The kiosk switches between
// "pass" mode (QR) and "product" mode (EAN/UPC/Code 128) without restarting the camera.
(function (global) {
    // Every frame is checked for both QR passes and product barcodes; the kiosk
    // routes by content. ZXing reads QR; ZBar adds linear-code coverage.
    const SCHEDULE = [
        { engine: "zxing", enhanced: false },
        { engine: "zbar", enhanced: false },
        { engine: "zxing", enhanced: true },
        { engine: "zbar", enhanced: true },
        // Catalog pattern match: reads defocused barcodes the decoders can't (see barcode-match.js).
        { engine: "match" }
    ];
    // Decode at the camera's full resolution (up to 1080p): every extra pixel per bar counts.
    const MAX_WIDTH = 1920;

    // A motion-smeared frame can decode to a wrong number that still passes the EAN
    // check digit (seen in testing). So one read is accepted only for a barcode the
    // store lists (isKnown); anything else needs two identical reads in a row.
    const CHECKSUMMED = new Set(["EAN13", "EAN8", "UPCA", "UPCE"]);

    const CONFIRM_WINDOW_MS = 4000;
    const REPEAT_COOLDOWN_MS = 2500;

    class Scanner {
        constructor(video, { onDetect, onStatus, onStats, isKnown, catalogCodes } = {}) {
            this.video = video;
            this.onDetect = onDetect || (() => {});
            this.onStatus = onStatus || (() => {});
            this.onStats = onStats || (() => {});
            this.isKnown = isKnown || (() => false);
            this.onMiss = null;
            this.mode = "pass";
            this.stream = null;
            this.track = null;
            this.deviceId = null;
            this.paused = false;
            this.running = false;
            this.step = 0;
            this.pending = null;      // { text, count, at }
            this.lastAccepted = null; // { text, at }
            this.decodes = 0;
            this.canvas = document.createElement("canvas");
            this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
            this.worker = this._makeWorker();
            if (this.worker && catalogCodes) this.worker.setCatalog(catalogCodes);
            setInterval(() => this._emitStats(), 1000);
        }

        _makeWorker() {
            try {
                const worker = new Worker("scan-worker.js");
                const waiters = new Map();
                let seq = 0;
                worker.onmessage = ({ data }) => {
                    const resolve = waiters.get(data.id);
                    waiters.delete(data.id);
                    if (resolve) resolve(data);
                };
                worker.onerror = (e) => {
                    console.error("Scan worker failed:", e.message);
                    this.onStatus("error", "Barcode decoder failed to load. Serve the app over http(s), not file://.");
                };
                return {
                    setCatalog: codes => worker.postMessage({ type: "catalog", codes }),
                    decode: (image, strategy) => new Promise(resolve => {
                        const id = ++seq;
                        waiters.set(id, resolve);
                        const buffer = image.data.buffer;
                        worker.postMessage({ id, buffer, width: image.width, height: image.height, strategy }, [buffer]);
                    })
                };
            } catch (e) {
                console.error("Web Worker unavailable:", e);
                return null;
            }
        }

        setMode(mode) {
            this.mode = mode;
            this.pending = null;
            this.step = 0;
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
            if (!this.worker) {
                this.onStatus("error", "This browser can't run the barcode decoder (no Web Worker support).");
                return false;
            }
            this.onStatus("starting");
            this._stopTracks();
            // More pixels per bar is the single biggest win for 1D barcodes on a webcam.
            const video = {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
            };
            // On a phone, prefer the rear camera (it has autofocus); a single USB webcam ignores this.
            if (deviceId) video.deviceId = { exact: deviceId };
            else video.facingMode = { ideal: "environment" };
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
            this.track = this.stream.getVideoTracks()[0];
            this.deviceId = this.track.getSettings().deviceId || deviceId || null;
            await this._tuneCamera(this.track);

            this.video.srcObject = this.stream;
            this.video.setAttribute("playsinline", "");
            this.video.muted = true;
            await this.video.play().catch(() => {});
            this.onStatus("live", this.track.label);

            if (!this.running) {
                this.running = true;
                this._loop();
            }
            return true;
        }

        // Ask the webcam (UVC controls, where Chrome exposes them) for autofocus,
        // auto exposure and a sharper image. Unsupported settings are skipped.
        async _tuneCamera(track) {
            let caps = {};
            try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (e) { /* none */ }
            const advanced = [];
            if (caps.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" });
            if (caps.exposureMode?.includes("continuous")) advanced.push({ exposureMode: "continuous" });
            if (caps.whiteBalanceMode?.includes("continuous")) advanced.push({ whiteBalanceMode: "continuous" });
            if (caps.sharpness && caps.sharpness.max > caps.sharpness.min) {
                const { min, max } = caps.sharpness;
                advanced.push({ sharpness: Math.round(min + (max - min) * 0.75) });
            }
            for (const c of advanced) {
                await track.applyConstraints({ advanced: [c] }).catch(() => {});
            }
            this.autofocus = !!caps.focusMode?.includes("continuous");
            // Manual focus range, if the webcam exposes one (many USB webcams do on Linux).
            this.focusRange = caps.focusDistance && caps.focusMode?.includes("manual") ? caps.focusDistance : null;
        }

        // Lock focus at a distance (manual), or return to autofocus with null.
        async setFocus(distance) {
            if (!this.track) return;
            const c = distance == null
                ? { focusMode: "continuous" }
                : { focusMode: "manual", focusDistance: distance };
            await this.track.applyConstraints({ advanced: [c] }).catch(e => console.warn("Focus:", e));
        }

        _stopTracks() {
            if (this.stream) this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
            this.track = null;
        }

        stop() {
            this.running = false;
            this._stopTracks();
            this.video.srcObject = null;
        }

        _emitStats() {
            const s = this.track ? this.track.getSettings() : {};
            this.onStats({
                width: s.width || this.video.videoWidth || 0,
                height: s.height || this.video.videoHeight || 0,
                scansPerSecond: this.decodes,
                autofocus: this.autofocus,
                live: !!this.track && !this.paused
            });
            this.decodes = 0;
        }

        async _loop() {
            while (this.running) {
                if (this.paused || this.video.readyState < 2 || !this.video.videoWidth) {
                    await new Promise(r => setTimeout(r, 100));
                    continue;
                }
                try {
                    await this._decodeFrame();
                } catch (e) {
                    console.warn("Decode error:", e);
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        }

        async _decodeFrame() {
            const mode = this.mode;
            const strategy = SCHEDULE[this.step++ % SCHEDULE.length];
            const vw = this.video.videoWidth, vh = this.video.videoHeight;
            const scale = Math.min(1, MAX_WIDTH / vw);
            const w = Math.round(vw * scale), h = Math.round(vh * scale);
            if (this.canvas.width !== w) this.canvas.width = w;
            if (this.canvas.height !== h) this.canvas.height = h;
            this.ctx.drawImage(this.video, 0, 0, w, h);
            const image = this.ctx.getImageData(0, 0, w, h);
            const result = await this.worker.decode(image, strategy);
            this.decodes++;
            if (result.error) console.warn("Decoder:", result.error);
            if (this.paused || mode !== this.mode) return;
            if (result.hit) this._consider(result.hit.text, result.hit.format);
            else if (this.onMiss) this.onMiss();
        }

        _consider(text, format) {
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
            const trusted = format === "QRCode" || (CHECKSUMMED.has(format) && this.isKnown(text));
            // Catalog pattern matches (blurry frames) need three agreeing frames.
            const needed = trusted ? 1 : format === "MATCH" ? 3 : 2;
            if (this.pending.count >= needed) {
                this.pending = null;
                this.lastAccepted = { text, at: now };
                this.onDetect(text, format);
            }
        }
    }

    global.RAISEScanner = Scanner;
})(window);
