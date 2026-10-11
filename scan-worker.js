// Barcode decoding worker: keeps the heavy WebAssembly decoders off the main thread,
// so the camera preview and UI stay smooth on a Raspberry Pi.
//
// Two decoders, because they fail on different frames (measured on simulated webcam frames):
//   ZXing (zxing-cpp)  - fast; best on blur, motion smear and low contrast. Also reads QR.
//   ZBar               - slower; best on small and tilted barcodes and heavy JPEG artefacts.
// The main thread rotates strategies frame by frame. Frames arrive as raw RGBA pixels, so
// this works on older Chromium builds without OffscreenCanvas or canvas filters.
importScripts("vendor/zxing-reader.js", "vendor/zbar.js", "barcode-match.js");

const ZXING_FORMATS = ["QRCode", "EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "ITF"];
const ZBAR_TYPES = {
    ZBAR_EAN13: "EAN13", ZBAR_EAN8: "EAN8", ZBAR_UPCA: "UPCA", ZBAR_UPCE: "UPCE",
    ZBAR_CODE128: "Code128", ZBAR_CODE39: "Code39", ZBAR_I25: "ITF"
};

let zbarScanner = null;

const ready = (async () => {
    await ZXingWASM.prepareZXingModule({ overrides: { locateFile: p => "vendor/" + p }, fireImmediately: true });
    zbarWasm.setModuleArgs({ locateFile: f => "vendor/" + f });
    const Z = zbarWasm, S = Z.ZBarSymbolType, C = Z.ZBarConfigType;
    zbarScanner = await Z.ZBarScanner.create();
    // Linear codes only; QR is ZXing's job.
    zbarScanner.setConfig(S.ZBAR_NONE, C.ZBAR_CFG_ENABLE, 0);
    for (const t of [S.ZBAR_EAN13, S.ZBAR_EAN8, S.ZBAR_UPCA, S.ZBAR_UPCE, S.ZBAR_CODE128, S.ZBAR_CODE39, S.ZBAR_I25]) {
        zbarScanner.setConfig(t, C.ZBAR_CFG_ENABLE, 1);
    }
    zbarScanner.setConfig(S.ZBAR_NONE, C.ZBAR_CFG_X_DENSITY, 2);
    zbarScanner.setConfig(S.ZBAR_NONE, C.ZBAR_CFG_Y_DENSITY, 2);
})();

// Grayscale + contrast stretch between the 2nd and 98th percentile, in place.
function enhance(image) {
    const d = image.data, n = d.length;
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i += 4) {
        const y = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
        d[i] = y;
        hist[y]++;
    }
    const total = n / 4;
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) < total * 0.02) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) < total * 0.02) hi--;
    const span = Math.max(1, hi - lo);
    const lut = new Uint8ClampedArray(256);
    // Stretch, then a further 2.2x contrast around mid-grey (matches the canvas filter that tested best).
    for (let v = 0; v < 256; v++) lut[v] = (((v - lo) * 255) / span - 128) * 2.2 + 128;
    for (let i = 0; i < n; i += 4) {
        const y = lut[d[i]];
        d[i] = d[i + 1] = d[i + 2] = y;
    }
    return image;
}

async function zxing(image, enhanced) {
    const results = await ZXingWASM.readBarcodes(image, {
        formats: ZXING_FORMATS,
        tryHarder: true,
        tryRotate: true,
        tryInvert: false,
        tryDownscale: !enhanced,
        minLineCount: enhanced ? 1 : 2,
        maxNumberOfSymbols: 1
    });
    const r = results.find(x => x.isValid && x.text);
    return r ? { text: r.text.trim(), format: r.format } : null;
}

async function zbar(image) {
    const symbols = await zbarWasm.scanImageData(image, zbarScanner);
    for (const s of symbols) {
        const format = ZBAR_TYPES[s.typeName];
        if (format) return { text: s.decode().trim(), format };
    }
    return null;
}

// strategy: { engine: "zxing" | "zbar", enhanced: bool }
self.onmessage = async ({ data }) => {
    if (data.type === "catalog") {
        RAISEMatch.setCatalog(data.codes);
        return;
    }
    const { id, buffer, width, height, strategy } = data;
    const t0 = performance.now();
    let hit = null, error = null;
    try {
        await ready;
        let image = new ImageData(new Uint8ClampedArray(buffer), width, height);
        if (strategy.enhanced) image = enhance(image);
        if (strategy.engine === "match") {
            // Blurry-frame fallback: whole-pattern match against the store catalog.
            const r = RAISEMatch.match(image);
            hit = r && r.accepted ? { text: r.code, format: "MATCH" } : null;
        } else {
            hit = strategy.engine === "zbar" ? await zbar(image) : await zxing(image, strategy.enhanced);
        }
    } catch (e) {
        error = String(e && e.message || e);
    }
    self.postMessage({ id, hit, error, ms: performance.now() - t0 });
};
