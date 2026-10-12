// Shared UI helpers for the kiosk and the companion app.
(function (global) {
    // Icons: Lucide outlines (ISC licence), drawn at 24px viewBox.
    const ICON_PATHS = {
        camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
        "video-off": '<path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.25-3.06a.5.5 0 0 1 .75.43v8.2"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m2 2 20 20"/>',
        barcode: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10"/><path d="M12 7v10"/><path d="M17 7v10"/>',
        qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
        "user-plus": '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
        plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
        minus: '<path d="M5 12h14"/>',
        trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
        "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
        "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
        mirror: '<path d="m3 7 5 5-5 5V7"/><path d="m21 7-5 5 5 5V7"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>',
        printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
        wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
        receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
        shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
        "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
        keyboard: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/><path d="M7 16h10"/>',
        alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
        package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.7 4.73a2 2 0 0 0 2 0L20.7 7"/>',
        loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
        pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
        moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
        nfc: '<path d="M6 8.32a7.43 7.43 0 0 1 0 7.36"/><path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58"/><path d="M12.91 4.1a15.91 15.91 0 0 1 .01 15.8"/><path d="M16.37 2a20.16 20.16 0 0 1 0 20"/>'
    };

    function icon(name, cls = "") {
        const body = ICON_PATHS[name] || "";
        return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    }

    function hydrateIcons(root = document) {
        root.querySelectorAll("[data-icon]").forEach(el => {
            el.outerHTML = icon(el.dataset.icon, el.className);
        });
    }

    function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    }

    const inrFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
    function inr(amount) {
        return "₹" + inrFormat.format(amount);
    }

    // Toast: one live region, last message wins.
    let toastTimer = null;
    function toast(message, tone = "ok") {
        const el = document.getElementById("toast");
        if (!el) return;
        const iconName = tone === "warn" ? "alert" : tone === "busy" ? "loader" : "check";
        el.dataset.tone = tone;
        el.innerHTML = icon(iconName, tone === "busy" ? "spin" : "") + `<span>${esc(message)}</span>`;
        el.classList.add("is-shown");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("is-shown"), tone === "warn" ? 3600 : 2400);
    }

    // Guilloche: the hypotrochoid rosettes and interlaced waves of banknote engraving.
    // Used only on verified objects (pass card, verification seal, paid stamp).
    function rosettePath(cx, cy, R, r, d, steps = 720) {
        const gcd = (a, b) => (b ? gcd(b, a % b) : a);
        const loops = r / gcd(R, r);
        const total = Math.PI * 2 * loops;
        let path = "";
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * total;
            const x = cx + (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
            const y = cy + (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
            path += (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
        }
        return path + "Z";
    }

    // Circular seal: two interleaved rosettes plus a hairline ring.
    function sealSVG(size = 96) {
        const c = 50;
        return `<svg class="seal" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
            <circle class="seal-ring" cx="50" cy="50" r="47" pathLength="1"/>
            <path class="seal-line" pathLength="1" d="${rosettePath(c, c, 40, 9, 12, 900)}"/>
            <path class="seal-line seal-line--b" pathLength="1" d="${rosettePath(c, c, 36, 5, 9, 900)}"/>
            <circle class="seal-core" cx="50" cy="50" r="17"/>
            <path class="seal-check" pathLength="1" d="M42 50.5l5.5 5.5L59 44.5"/>
        </svg>`;
    }

    // Horizontal guilloche band: phase-shifted sine strands woven together.
    function waveBandSVG(width = 400, height = 28, strands = 7) {
        let paths = "";
        for (let s = 0; s < strands; s++) {
            const phase = (s / strands) * Math.PI * 2;
            let d = "";
            for (let x = 0; x <= width; x += 2) {
                const y = height / 2 + Math.sin(x / 9 + phase) * (height * 0.36) * Math.cos(x / 61 + phase / 2);
                d += (x ? "L" : "M") + x + " " + y.toFixed(2);
            }
            paths += `<path d="${d}"/>`;
        }
        return `<svg class="guilloche-band" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>`;
    }

    // Replay the seal's draw-in animation.
    function stampSeal(el) {
        if (!el) return;
        el.classList.remove("is-drawn");
        void el.getBoundingClientRect();
        el.classList.add("is-drawn");
    }

    // GPIO buzzer on a Raspberry Pi kiosk (kiosk/buzzer-bridge.py). Switched on by opening the
    // kiosk once with ?buzzer=1 (setup-buzzer.sh adds it to the launcher); ?buzzer=0 turns it off.
    // Off by default, so ordinary browsers never try to reach the local service.
    const BUZZER_URL = "http://127.0.0.1:8799/beep";
    let buzzerOn = false;
    try {
        const flag = new URLSearchParams(global.location.search).get("buzzer");
        if (flag === "1") localStorage.setItem("raise_buzzer", "1");
        if (flag === "0") localStorage.removeItem("raise_buzzer");
        buzzerOn = localStorage.getItem("raise_buzzer") === "1";
    } catch (e) { /* storage blocked */ }

    // freq Hz, ms per beep, times = number of beeps (login uses a double beep).
    function beep(freq = 1046, ms = 90, times = 1) {
        if (buzzerOn) {
            fetch(`${BUZZER_URL}?f=${freq}&ms=${ms}&n=${times}`, { cache: "no-store" }).catch(() => {});
        }
        try {
            const ctx = beep.ctx || (beep.ctx = new (global.AudioContext || global.webkitAudioContext)());
            for (let i = 0; i < times; i++) {
                const t0 = ctx.currentTime + i * (ms + 70) / 1000;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.18, t0);
                gain.gain.exponentialRampToValueAtTime(0.001, t0 + ms / 1000);
                osc.connect(gain).connect(ctx.destination);
                osc.start(t0);
                osc.stop(t0 + ms / 1000);
            }
        } catch (e) { /* audio unavailable */ }
    }

    function store(key, value) {
        try {
            if (value === undefined) return JSON.parse(localStorage.getItem(key));
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            return null;
        }
    }

    // Theme: saved choice, else the OS setting. The page <head> applies it before first
    // paint; this wires the toggle button.
    function initThemeToggle(btn) {
        const root = document.documentElement;
        const paint = () => {
            const dark = root.dataset.theme === "dark";
            btn.innerHTML = icon(dark ? "sun" : "moon");
            btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
            btn.title = btn.getAttribute("aria-label");
        };
        btn.onclick = () => {
            root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
            store("raise_theme", root.dataset.theme);
            paint();
        };
        paint();
    }

    global.RAISEUI = { initThemeToggle, icon, hydrateIcons, esc, inr, toast, sealSVG, waveBandSVG, rosettePath, stampSeal, beep, store };
})(window);
