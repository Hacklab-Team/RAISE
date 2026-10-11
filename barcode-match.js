// Catalog matcher for blurry EAN-13/EAN-8 barcodes.
//
// A normal decoder measures every bar width; webcam defocus blur merges the thin bars and
// it fails. The store catalog is small, so instead we find barcode-like regions, average
// each along its bars into a 1-D brightness profile, and correlate that profile with every
// catalog item's ideal bar pattern (blurred, across scales and offsets). Fitting the whole
// pattern survives far more blur: on a real webcam frame no decoder could read, the right
// product scored 0.91 against 0.63 for the next best.
//
// Safety: a match must score highly AND clearly beat the best different item; the scanner
// also requires the same match on two frames in a row before adding anything.
(function (root) {
    const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
    const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
    const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
    const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

    const MIN_SCORE = 0.85;   // normalised correlation needed to accept
    // Lead over the best *different* item. Real blurry barcodes led by 0.25-0.28; background
    // texture on a live webcam led by at most 0.06.
    const MIN_MARGIN = 0.18;
    const NORM_WIDTH = 160;   // detected barcode width is resampled to this many px
    const CANDIDATES = 3;     // barcode-like regions tested per view

    function modulesFor(raw) {
        const code = /^\d{12}$/.test(raw) ? "0" + raw : raw;
        const d = code.split("").map(Number);
        let bits;
        if (code.length === 13) {
            bits = "101";
            for (let i = 0; i < 6; i++) bits += (PARITY[d[0]][i] === "L" ? L : G)[d[i + 1]];
            bits += "01010";
            for (let i = 0; i < 6; i++) bits += R[d[i + 7]];
            bits += "101";
        } else if (code.length === 8) {
            bits = "101";
            for (let i = 0; i < 4; i++) bits += L[d[i]];
            bits += "01010";
            for (let i = 4; i < 8; i++) bits += R[d[i]];
            bits += "101";
        } else {
            return null;
        }
        return Uint8Array.from(bits, b => +b);
    }

    let catalog = []; // { code, dirs: [fwd, rev] }
    function setCatalog(codes) {
        catalog = [];
        for (const code of codes) {
            const m = modulesFor(code);
            if (m) catalog.push({ code, dirs: [m, m.slice().reverse()] });
        }
    }

    function toGray(image) {
        const { width: w, height: h, data: d } = image;
        const g = new Float32Array(w * h);
        for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) / 256;
        return g;
    }

    // Barcode-like regions. Each horizontal strip is first averaged vertically: bars line up
    // down the strip and keep their edges, while text and texture average away. Strips that
    // also differ a lot from the strip above are penalised (horizontal edges, not bars).
    function locate(g, w, h) {
        const cs = Math.max(4, Math.round(w / 100));
        const cw = Math.floor(w / cs), ch = Math.floor(h / cs);
        if (cw < 8 || ch < 3) return [];
        const band = new Float32Array(ch * w);
        for (let by = 0; by < ch; by++) {
            for (let y = by * cs; y < (by + 1) * cs; y++) for (let x = 0; x < w; x++) band[by * w + x] += g[y * w + x];
            for (let x = 0; x < w; x++) band[by * w + x] /= cs;
        }
        const cell = new Float32Array(cw * ch);
        for (let by = 0; by < ch; by++) {
            for (let x = 1; x < w - 1; x++) {
                const i = by * w + x;
                const gx = Math.abs(band[i + 1] - band[i - 1]);
                const gy = by > 0 ? Math.abs(band[i] - band[i - w]) : 0;
                cell[by * cw + Math.min(cw - 1, Math.floor(x / cs))] += gx - 0.5 * gy;
            }
        }
        const sm = new Float32Array(cw * ch);
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
            let s = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -3; dx <= 3; dx++) {
                const yy = y + dy, xx = x + dx;
                if (yy >= 0 && yy < ch && xx >= 0 && xx < cw) s += cell[yy * cw + xx];
            }
            sm[y * cw + x] = s;
        }
        const boxes = [];
        const used = new Uint8Array(cw * ch);
        for (let k = 0; k < CANDIDATES; k++) {
            let best = 0, bx = -1, by = -1;
            for (let i = 0; i < sm.length; i++) if (!used[i] && sm[i] > best) { best = sm[i]; bx = i % cw; by = Math.floor(i / cw); }
            if (bx < 0) break;
            const thr = best * 0.3;
            const ok = (x, y) => x >= 0 && y >= 0 && x < cw && y < ch && sm[y * cw + x] > thr;
            let x0 = bx, x1 = bx, y0 = by, y1 = by, gap;
            for (gap = 0; gap < 5 && x0 > 0; ) { x0--; gap = ok(x0, by) ? 0 : gap + 1; } x0 += gap;
            for (gap = 0; gap < 5 && x1 < cw - 1; ) { x1++; gap = ok(x1, by) ? 0 : gap + 1; } x1 -= gap;
            for (gap = 0; gap < 2 && y0 > 0; ) { y0--; gap = ok(bx, y0) ? 0 : gap + 1; } y0 += gap;
            for (gap = 0; gap < 2 && y1 < ch - 1; ) { y1++; gap = ok(bx, y1) ? 0 : gap + 1; } y1 -= gap;
            for (let y = Math.max(0, y0 - 1); y <= Math.min(ch - 1, y1 + 1); y++)
                for (let x = Math.max(0, x0 - 2); x <= Math.min(cw - 1, x1 + 2); x++) used[y * cw + x] = 1;
            if (x1 - x0 >= 3) boxes.push({ x0: x0 * cs, x1: (x1 + 1) * cs, y0: y0 * cs, y1: (y1 + 1) * cs });
        }
        return boxes;
    }

    // Average across the bars into a 1-D profile (dark = high), resampled so the detected
    // barcode is NORM_WIDTH px wide, with margin on both sides for the offset search.
    function profile(g, w, h, box) {
        const bw = box.x1 - box.x0;
        const margin = bw * 0.6;
        const xa = Math.max(0, box.x0 - margin), xb = Math.min(w, box.x1 + margin);
        const bh = box.y1 - box.y0;
        const ya = Math.max(0, Math.round(box.y0 + bh * 0.2)), yb = Math.min(h, Math.max(Math.round(box.y1 - bh * 0.2), Math.round(box.y0 + bh * 0.2) + 1));
        const k = NORM_WIDTH / bw;
        const n = Math.round((xb - xa) * k);
        if (n < 60) return null;
        const p = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const sx = xa + i / k, x = Math.min(w - 1, Math.floor(sx));
            let s = 0;
            for (let y = ya; y < yb; y++) s += g[y * w + x];
            p[i] = 255 - s / (yb - ya);
        }
        return { p, start: (box.x0 - xa) * k };
    }

    function render(mods, s, out, n) {
        for (let x = 0; x < n; x++) {
            const a = x / s, b = (x + 1) / s;
            let v = 0;
            for (let i = Math.floor(a); i <= Math.floor(b); i++) {
                if (i < 0 || i >= mods.length || !mods[i]) continue;
                v += Math.min(b, i + 1) - Math.max(a, i);
            }
            out[x] = v;
        }
    }

    function blur(src, sigma, n) {
        const out = new Float32Array(n);
        const r = Math.ceil(sigma * 2.5);
        const k = [];
        let ks = 0;
        for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); ks += v; }
        for (let x = 0; x < n; x++) {
            let s = 0;
            for (let i = -r; i <= r; i++) { const xx = x + i; s += (xx >= 0 && xx < n ? src[xx] : 0) * k[i + r]; }
            out[x] = s / ks;
        }
        return out;
    }

    // Best normalised correlation of template t (padded with quiet zone) sliding over p.
    function slide(p, t, oFrom, oTo, oStep) {
        const n = p.length, m = t.length;
        let tm = 0;
        for (let i = 0; i < m; i++) tm += t[i];
        tm /= m;
        let tv = 0;
        for (let i = 0; i < m; i++) tv += (t[i] - tm) ** 2;
        let best = -1, bestO = 0;
        for (let o = oFrom; o <= oTo; o += oStep) {
            const o0 = Math.round(o);
            if (o0 < 0 || o0 + m > n) continue;
            let pm = 0;
            for (let i = 0; i < m; i++) pm += p[o0 + i];
            pm /= m;
            let ab = 0, pv = 0;
            for (let i = 0; i < m; i++) { const dp = p[o0 + i] - pm; ab += dp * (t[i] - tm); pv += dp * dp; }
            const sc = pv && tv ? ab / Math.sqrt(pv * tv) : 0;
            if (sc > best) { best = sc; bestO = o0; }
        }
        return { score: best, o: bestO };
    }

    function template(mods, s, sigma) {
        const quiet = Math.ceil(6 * s);
        const body = Math.ceil(mods.length * s);
        const raw = new Float32Array(body);
        render(mods, s, raw, body);
        const padded = new Float32Array(body + quiet * 2);
        padded.set(raw, quiet);
        return { t: blur(padded, sigma, padded.length), quiet };
    }

    function fit(pr, mods, fine, around) {
        const s0 = NORM_WIDTH / mods.length;
        let best = { score: -1 };
        const scales = fine
            ? [-0.04, -0.02, 0, 0.02, 0.04].map(d => around.s * (1 + d))
            : Array.from({ length: 19 }, (_, i) => s0 * (0.7 + i * 0.05));
        const sigmas = fine ? [around.sig * 0.6, around.sig, around.sig * 1.5] : [1.7];
        for (const s of scales) for (const sig of sigmas) {
            const { t, quiet } = template(mods, s, sig);
            const center = pr.start - quiet;
            const span = fine ? 3 : NORM_WIDTH * 0.6;
            const r = slide(pr.p, t, Math.max(0, (fine ? around.o : center) - span), (fine ? around.o : center) + span, fine ? 1 : 3);
            if (r.score > best.score) best = { score: r.score, s, sig, o: r.o };
        }
        return best;
    }

    function matchView(g, w, h, scores) {
        for (const box of locate(g, w, h)) {
            const pr = profile(g, w, h, box);
            if (!pr) continue;
            // coarse pass on every item and direction
            const coarse = [];
            for (const item of catalog) for (const mods of item.dirs) coarse.push({ item, mods, ...fit(pr, mods, false) });
            coarse.sort((a, b) => b.score - a.score);
            // fine pass on the top candidates only
            const seen = new Set();
            for (const c of coarse) {
                if (seen.size >= 3 && seen.has(c.item.code) === false) break;
                seen.add(c.item.code);
                const f = fit(pr, c.mods, true, c);
                const sc = Math.max(c.score, f.score);
                if (sc > (scores.get(c.item.code) ?? -1)) scores.set(c.item.code, sc);
            }
            for (const c of coarse) if (!scores.has(c.item.code) || c.score > scores.get(c.item.code)) scores.set(c.item.code, Math.max(c.score, scores.get(c.item.code) ?? -1));
        }
    }

    // Try the frame as-is and rotated 90 degrees (product held sideways).
    function match(image) {
        if (!catalog.length) return null;
        const w = image.width, h = image.height;
        const gray = toGray(image);
        const scores = new Map();
        matchView(gray, w, h, scores);
        const top = Math.max(-1, ...scores.values());
        if (top < MIN_SCORE) {
            const rot = new Float32Array(w * h);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rot[x * h + (h - 1 - y)] = gray[y * w + x];
            matchView(rot, h, w, scores);
        }

        const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
        if (!ranked.length) return null;
        const [code, score] = ranked[0];
        const runnerUp = ranked[1] ? ranked[1][1] : 0;
        return { code, score, runnerUp, accepted: score >= MIN_SCORE && score - runnerUp >= MIN_MARGIN };
    }

    root.RAISEMatch = { setCatalog, match, modulesFor };
})(typeof self !== "undefined" ? self : window);
