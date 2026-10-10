// Global State
let activeUser = {
    name: "Guest",
    phone: "",
    loyaltyPoints: 0
};

let authQrCodeScanner = null;

// Page Load Event
window.onload = function () {
    // Demo products aur UI summary render karo
    if (typeof renderDemoShortcuts === "function") renderDemoShortcuts();
    if (typeof updateCartSummaryUI === "function") updateCartSummaryUI();

    // Login Camera Scanner Initialize
    initAuthCustomerScanner();
};

// 1. Auth Tab Switcher
function switchAuthTab(tab) {
    const scanBtn = document.getElementById('auth-tab-scan');
    const regBtn = document.getElementById('auth-tab-reg');
    const scanBox = document.getElementById('auth-box-scan');
    const regBox = document.getElementById('auth-box-reg');

    if (!scanBtn || !regBtn) return;

    if (tab === 'scan') {
        scanBtn.className = "flex-1 py-2.5 rounded-xl text-xs font-extrabold text-blue-600 bg-white shadow-sm transition";
        regBtn.className = "flex-1 py-2.5 rounded-xl text-xs font-extrabold text-slate-500 transition";
        scanBox.classList.remove('hidden');
        regBox.classList.add('hidden');
        initAuthCustomerScanner();
    } else {
        regBtn.className = "flex-1 py-2.5 rounded-xl text-xs font-extrabold text-blue-600 bg-white shadow-sm transition";
        scanBtn.className = "flex-1 py-2.5 rounded-xl text-xs font-extrabold text-slate-500 transition";
        regBox.classList.remove('hidden');
        scanBox.classList.add('hidden');
        stopAuthCustomerScanner();
    }
}

// 2. Camera Scanner Initialize (Customer QR)
function initAuthCustomerScanner() {
    stopAuthCustomerScanner(); // Safety reset pehle

    setTimeout(() => {
        const qrContainer = document.getElementById("auth-qr-reader");
        if (!qrContainer) return;

        authQrCodeScanner = new Html5QrcodeScanner("auth-qr-reader", { 
            fps: 10, 
            qrbox: { width: 180, height: 180 } 
        });

        authQrCodeScanner.render((qrData) => {
            try {
                const userData = JSON.parse(qrData);
                activeUser = userData;
                stopAuthCustomerScanner();
                if (typeof showToast === "function") showToast(`Welcome back, ${userData.name}!`, "success");
                completeAuthAndStart();
            } catch (e) {
                if (typeof showToast === "function") showToast("Invalid Customer QR!", "warning");
            }
        });
    }, 200);
}

// 3. Stop Auth Scanner safely
function stopAuthCustomerScanner() {
    if (authQrCodeScanner) {
        try {
            authQrCodeScanner.clear();
        } catch (e) {
            console.warn("Scanner clear error:", e);
        }
        authQrCodeScanner = null;
    }
}

// 4. Handle Registration Form
function handleCustomerRegistration(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const phone = document.getElementById('reg-phone').value;

    activeUser = {
        name: name,
        phone: phone,
        loyaltyPoints: 50 // Welcome bonus
    };

    const userQrJson = JSON.stringify(activeUser);

    const qrContainer = document.getElementById('user-qrcode-canvas');
    if (qrContainer) {
        qrContainer.innerHTML = "";
        new QRCode(qrContainer, {
            text: userQrJson,
            width: 140,
            height: 140
        });
    }

    document.getElementById('reg-form').classList.add('hidden');
    document.getElementById('reg-qr-output').classList.remove('hidden');
}

// 5. Skip Auth / Guest Mode
function skipAuthAndContinue() {
    stopAuthCustomerScanner();
    completeAuthAndStart();
}

// 6. Auth Complete & Launch Main Scanner
function completeAuthAndStart() {
    const authModal = document.getElementById('auth-modal');
    if (authModal) authModal.classList.add('hidden');

    const nameEl = document.getElementById('user-name-display');
    const pointsEl = document.getElementById('user-points-badge');

    if (nameEl) nameEl.textContent = activeUser.name;
    if (pointsEl) pointsEl.textContent = `${activeUser.loyaltyPoints} Pts`;

    // Main barcode camera screen start karo
    if (typeof startCameraScanner === "function") {
        startCameraScanner();
    }
}