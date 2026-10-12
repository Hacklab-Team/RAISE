// RAISE cloud connection (Supabase). The kiosk keeps working offline without it: the built-in
// catalog, local passes (RAISE1) and kiosk-local card links remain the fallback.
//
// Setup: in the admin panel, Kiosks → Add kiosk, then open the setup link on the kiosk once
// (…/?kiosk=<device key>). The key is saved here and removed from the address bar.
(function (global) {
    const cfg = global.RAISE_CLOUD_CONFIG || {};
    const KEY_STORE = "raise_kiosk_key";
    const CATALOG_STORE = "raise_cloud_catalog";
    const TIMEOUT_MS = 6000;
    const VERSION = "kiosk-2026.10";

    // Take the device key from the setup link, then hide it from the address bar.
    try {
        const params = new URLSearchParams(location.search);
        const fromUrl = params.get("kiosk");
        if (fromUrl && fromUrl.length >= 20) {
            localStorage.setItem(KEY_STORE, fromUrl);
            params.delete("kiosk");
            const rest = params.toString();
            history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
        }
    } catch (e) { /* storage blocked: cloud stays off */ }

    const key = (() => { try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; } })();
    const configured = !!(cfg.url && cfg.anonKey);
    const enabled = configured && !!key;

    class CloudError extends Error {
        constructor(message, status) { super(message); this.status = status; }
    }

    async function request(path, init) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(cfg.url + path, {
                ...init,
                signal: ctrl.signal,
                headers: { apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey, "Content-Type": "application/json", ...(init && init.headers) }
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new CloudError(body.error || body.message || `Server error (${res.status})`, res.status);
            return body;
        } catch (e) {
            if (e instanceof CloudError) throw e;
            throw new CloudError(e.name === "AbortError" ? "The store server didn't answer in time." : "Can't reach the store server.", 0);
        } finally {
            clearTimeout(timer);
        }
    }

    /** Kiosk API (Edge Function). Throws CloudError with a message fit to show customers. */
    function call(action, body) {
        if (!enabled) return Promise.reject(new CloudError("Cloud not set up on this kiosk", 0));
        return request("/functions/v1/kiosk", { method: "POST", headers: { "x-kiosk-key": key }, body: JSON.stringify({ action, ...body }) });
    }

    /** Live catalog from the database (cached for offline starts). Returns true if applied. */
    async function loadCatalog() {
        if (!configured) return false;
        const apply = rows => global.RAISECatalog.replaceCatalog(rows.map(p => ({
            barcode: p.barcode, title: p.title, brand: p.brand || "", price: Number(p.price), image: p.image_url || ""
        })));
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(CATALOG_STORE) || "null"); } catch (e) { /* ignore */ }
        if (cached && cached.length) apply(cached);
        try {
            const rows = await request("/rest/v1/products?select=barcode,title,brand,price,image_url&active=eq.true&order=title", { method: "GET" });
            if (Array.isArray(rows) && rows.length) {
                apply(rows);
                try { localStorage.setItem(CATALOG_STORE, JSON.stringify(rows)); } catch (e) { /* ignore */ }
                return true;
            }
        } catch (e) {
            console.warn("Catalog: using cached/built-in list.", e.message);
        }
        return !!(cached && cached.length);
    }

    /** Status for the admin panel's Kiosks page, every 30 s. */
    function startHeartbeat(getInfo) {
        if (!enabled) return;
        const beat = () => call("heartbeat", { info: { version: VERSION, ...getInfo() } }).catch(e => console.warn("Heartbeat:", e.message));
        beat();
        setInterval(beat, 30000);
    }

    global.RAISECloud = { enabled, configured, call, loadCatalog, startHeartbeat, CloudError };
})(window);
