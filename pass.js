// RAISE Pass: signed + encrypted customer QR token.
//
// Format: "RAISE1." + base64url(iv[12] || AES-256-GCM ciphertext+tag)
// The plaintext is a small JSON payload: { v, id, n (name), m (last 4 of phone), t (issued, unix s) }.
// AES-GCM gives both secrecy (the QR is not readable plaintext) and integrity
// (any edited or forged token fails the auth tag and is rejected).
//
// Passes are static on purpose so they can be printed, so there is no expiry.
// Balances and points are NOT in the pass: a printed card would go stale.
//
// LIMITATION: this is a static demo with no server, so the key ships in page JS.
// Anyone who extracts it can mint passes. For production, issue and verify
// passes on a backend (or sign with a private key the client never sees).
(function (global) {
    const PREFIX = "RAISE1.";
    const KEY_B64URL = "tZN5NUccFHUSv9_fMHvgKe6Wxdb-nYAzhjxt5unrJ3s";
    const AAD = new TextEncoder().encode("raise-pass-v1");

    let keyPromise = null;

    function b64urlEncode(bytes) {
        let bin = "";
        bytes.forEach(b => { bin += String.fromCharCode(b); });
        return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    function b64urlDecode(str) {
        const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
        const bin = atob(b64);
        return Uint8Array.from(bin, c => c.charCodeAt(0));
    }

    function getKey() {
        if (!global.crypto || !crypto.subtle) {
            return Promise.reject(new PassError("insecure-context", "Open this page over https or localhost to use passes."));
        }
        if (!keyPromise) {
            keyPromise = crypto.subtle.importKey("raw", b64urlDecode(KEY_B64URL), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
        }
        return keyPromise;
    }

    class PassError extends Error {
        constructor(code, message) {
            super(message);
            this.code = code;
        }
    }

    function newPassId() {
        // 10 chars of Crockford base32, e.g. "7KQ2-M9XD-4T"
        const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
        const bytes = crypto.getRandomValues(new Uint8Array(10));
        return Array.from(bytes, b => alphabet[b & 31]).join("");
    }

    function formatPassId(id) {
        return id ? id.replace(/(.{4})(.{4})(.*)/, "$1-$2-$3") : "";
    }

    async function seal({ id, name, phone }) {
        const payload = {
            v: 1,
            id: id || newPassId(),
            n: String(name).slice(0, 40),
            m: String(phone || "").slice(-4),
            t: Math.floor(Date.now() / 1000)
        };
        const key = await getKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const plain = new TextEncoder().encode(JSON.stringify(payload));
        const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, plain));
        const out = new Uint8Array(iv.length + cipher.length);
        out.set(iv, 0);
        out.set(cipher, iv.length);
        return { token: PREFIX + b64urlEncode(out), payload };
    }

    async function open(text) {
        const raw = String(text || "").trim();
        if (!raw.startsWith(PREFIX)) {
            if (raw.startsWith("{")) {
                throw new PassError("legacy", "This is an old unprotected pass. Open the RAISE app to get a new one.");
            }
            throw new PassError("not-a-pass", "That code is not a RAISE Pass.");
        }
        let bytes;
        try {
            bytes = b64urlDecode(raw.slice(PREFIX.length));
        } catch (e) {
            throw new PassError("tampered", "Pass could not be verified.");
        }
        if (bytes.length < 12 + 16) throw new PassError("tampered", "Pass could not be verified.");

        const key = await getKey();
        let plain;
        try {
            plain = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: AAD },
                key,
                bytes.slice(12)
            );
        } catch (e) {
            throw new PassError("tampered", "Pass signature is invalid. It may be forged or damaged.");
        }
        const payload = JSON.parse(new TextDecoder().decode(plain));
        if (payload.v !== 1 || !payload.id || !payload.n) {
            throw new PassError("tampered", "Pass could not be verified.");
        }
        return payload;
    }

    global.RAISEPass = { seal, open, formatPassId, PassError };
})(window);
