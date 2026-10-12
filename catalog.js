// Product lookup: the store catalog is the source of truth for price.
// Open Food Facts (free, no key, CORS-enabled) only fills in name + image for
// barcodes the store hasn't listed. It has no prices, so those items get
// DEFAULT_PRICE and are flagged `estimated` for the UI to label.
(function (global) {
    const DEFAULT_PRICE = 40;
    const OFF_TIMEOUT_MS = 4000;
    const OFF_IMG = "https://images.openfoodfacts.org/images/products/";

    // Barcodes and images are real (verified on Open Food Facts).
    // Prices are this demo store's own price list, not official MRP.
    const CATALOG = [
        { barcode: "8901058023800", title: "Maggi 2-Minute Masala Noodles (8 × 70 g)", brand: "Maggi", price: 112, image: OFF_IMG + "890/105/802/3800/front_en.3.200.jpg" },
        { barcode: "8901491503020", title: "Lay's India's Magic Masala (26.5 g)", brand: "Lay's", price: 10, image: OFF_IMG + "890/149/150/3020/front_en.35.200.jpg" },
        { barcode: "8901719123870", title: "Parle-G Original Glucose Biscuits (250 g)", brand: "Parle", price: 25, image: OFF_IMG + "890/171/912/3870/front_en.27.200.jpg" },
        { barcode: "8901262010016", title: "Amul Pasteurised Butter (100 g)", brand: "Amul", price: 58, image: OFF_IMG + "890/126/201/0016/front_en.53.200.jpg" },
        { barcode: "8901764042911", title: "Thums Up Soft Drink (250 ml)", brand: "Thums Up", price: 20, image: OFF_IMG + "890/176/404/2911/front_en.41.200.jpg" },
        { barcode: "8901030877124", title: "Brooke Bond Red Label Tea", brand: "Brooke Bond", price: 145, image: OFF_IMG + "890/103/087/7124/front_en.3.200.jpg" },
        { barcode: "89009949", title: "Nescafé Classic Instant Coffee (45 g)", brand: "Nescafé", price: 175, image: OFF_IMG + "000/008/900/9949/front_en.4.200.jpg" },
        { barcode: "8901030865169", title: "Surf Excel Detergent Bar (250 g)", brand: "Surf Excel", price: 38, image: OFF_IMG + "890/103/086/5169/front_en.9.200.jpg" },
        { barcode: "7622202271861", title: "Cadbury Dairy Milk Silk Bubbly (46 g)", brand: "Cadbury", price: 95, image: OFF_IMG + "762/220/227/1861/front_en.9.200.jpg" },
        { barcode: "8901063371255", title: "Britannia Marie Gold (68.9 g)", brand: "Britannia", price: 10, image: "img/8901063371255.jpg" },
        { barcode: "8904063258366", title: "Lay's American Style Cream & Onion (52.9 g)", brand: "Lay's", price: 20, image: "img/8901491100250.jpg" },
        { barcode: "8902080104581", title: "Pepsi (400 ml)", brand: "Pepsi", price: 20, image: "img/8902080104581.jpg" },
        { barcode: "8902080364589", title: "Mountain Dew (400 ml)", brand: "Mountain Dew", price: 20, image: "img/8902080364589.jpg" },
        // Image: "Golden Oreo cookie, Winschoten (2021)" by Donald Trung, Wikimedia Commons, CC BY-SA 4.0 (cropped).
        { barcode: "7622202836596", title: "Cadbury Oreo Golden Vanilla Creme Biscuits", brand: "Oreo", price: 10, image: "img/oreo-golden.jpg" },
        { barcode: "8901030804939", title: "Dove Hair Care (650 ml)", brand: "Dove", price: 499, image: OFF_IMG + "890/103/080/4939/front_en.4.200.jpg" }
    ];

    const byCode = new Map(CATALOG.map(p => [p.barcode, p]));
    const offCache = new Map();

    // UPC-A (12 digits) is EAN-13 with a leading 0; normalise so either scan matches.
    function normalise(code) {
        const c = String(code).trim();
        return /^\d{12}$/.test(c) ? "0" + c : c;
    }

    function findInCatalog(code) {
        const c = normalise(code);
        return byCode.get(c) || byCode.get(c.replace(/^0/, "")) || null;
    }

    async function fetchOpenFoodFacts(code) {
        if (offCache.has(code)) return offCache.get(code);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), OFF_TIMEOUT_MS);
        try {
            const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,brands,quantity,image_front_small_url,image_front_url`;
            const res = await fetch(url, { signal: ctrl.signal });
            if (!res.ok) return null;
            const data = await res.json();
            if (data.status !== 1 || !data.product) {
                offCache.set(code, null);
                return null;
            }
            const p = data.product;
            const name = (p.product_name || p.product_name_en || "").trim();
            if (!name) {
                offCache.set(code, null);
                return null;
            }
            const result = {
                title: p.quantity && !name.includes(p.quantity) ? `${name} (${p.quantity})` : name,
                brand: (p.brands || "").split(",")[0].trim(),
                image: p.image_front_small_url || p.image_front_url || ""
            };
            offCache.set(code, result);
            return result;
        } catch (e) {
            // Network failure or timeout: don't cache, a retry may succeed.
            console.warn("Open Food Facts lookup failed:", e);
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    // Resolves to { barcode, title, brand, price, image, source, estimated }.
    // source: "catalog" | "openfoodfacts" | "unknown"
    async function lookupProduct(rawCode) {
        const barcode = normalise(rawCode);
        const listed = findInCatalog(barcode);
        if (listed) return { ...listed, source: "catalog", estimated: false };

        const off = await fetchOpenFoodFacts(barcode);
        if (off) {
            return { barcode, ...off, price: DEFAULT_PRICE, source: "openfoodfacts", estimated: true };
        }
        return { barcode, title: "Unlisted item", brand: "", image: "", price: DEFAULT_PRICE, source: "unknown", estimated: true };
    }

    const isListed = code => !!findInCatalog(code);

    // The cloud catalog (cloud.js) replaces the built-in list in place, so every reference to
    // CATALOG stays valid. The built-in list above is the offline fallback.
    function replaceCatalog(products) {
        if (!Array.isArray(products) || !products.length) return false;
        CATALOG.length = 0;
        products.forEach(p => CATALOG.push(p));
        byCode.clear();
        CATALOG.forEach(p => byCode.set(p.barcode, p));
        return true;
    }

    global.RAISECatalog = { CATALOG, DEFAULT_PRICE, lookupProduct, isListed, replaceCatalog };
})(window);
