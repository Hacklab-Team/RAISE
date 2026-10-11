// Offline cache so the kiosk opens fast at boot, even before Wi-Fi has connected.
//
//   Page code (HTML/JS/CSS): network first with a short timeout, so a new deploy shows up on
//                            the next load; falls back to the cached copy when the network is
//                            slow or down.
//   Decoders, fonts, images: cache first. They rarely change and the WASM decoders are ~1.2 MB.
//   Product API calls:       never cached here (Open Food Facts lookups go straight to network).
//
// A hard reload (Ctrl+Shift+R) bypasses this worker entirely.
const CACHE = "raise-v1";
const NETWORK_TIMEOUT_MS = 1500;

const CORE = [
    "./",
    "index.html",
    "customer.html",
    "raise.css",
    "shared.js",
    "pass.js",
    "catalog.js",
    "scanner.js",
    "scan-worker.js",
    "barcode-match.js",
    "vendor/qrcode.min.js",
    "vendor/zxing-reader.js",
    "vendor/zxing_reader.wasm",
    "vendor/zbar.js",
    "vendor/zbar.wasm"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(CORE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

const isStatic = url =>
    url.origin === self.location.origin
        ? /\/(vendor|img)\//.test(url.pathname)
        : /^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
}

async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await Promise.race([
            fetch(request),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS))
        ]);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (err) {
        const cached = await cache.match(request, { ignoreSearch: true })
            || (request.mode === "navigate" ? await cache.match("index.html") : null);
        if (cached) return cached;
        throw err;
    }
}

self.addEventListener("fetch", event => {
    const { request } = event;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (isStatic(url)) {
        event.respondWith(cacheFirst(request));
    } else if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request));
    }
    // anything else (product lookups, product images from Open Food Facts) is left alone
});
