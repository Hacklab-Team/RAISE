# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Shopper at the kiosk:** a supermarket customer standing at a self-checkout kiosk (a Raspberry Pi with a USB webcam). They identify themselves by holding their RAISE Pass QR up to the camera (on their phone or a printed card), or they register on the spot. Then they hold each product's barcode up to the webcam, review the cart and pay by UPI.
- **Shopper on their phone:** the same customer uses the companion app (`customer.html`) to create an account, show or print their pass QR, and look at their wallet and past receipts.

## Product Purpose
RAISE is a smart-trolley / self-checkout system: customers scan their own products and pay without a cashier queue. Success means a customer gets from pass to paid quickly, without staff help, and with a webcam that's mediocre.

## Positioning
The checkout runs on cheap commodity hardware (a Pi plus a USB webcam), and the customer pass works the same on a phone screen or on paper.

## Operating Context
- The kiosk runs in Chromium on a Raspberry Pi, has a USB webcam facing the customer, and sits under store lighting. The CPU is limited.
- Pass QRs are static and may be printed, so they cannot rotate or expire.
- It's a hackathon demo, hosted as static files with no backend.

## Capabilities and Constraints
- Static HTML/CSS/JS only, with no server. The two pages share no runtime state.
- The pass QR is signed and encrypted (AES-GCM) with a shared key that ships in client JS. That's tamper-evident and unreadable at a glance, but not secure against someone who extracts the key. Real security needs a backend.
- Product data uses a local store catalog (real Indian EAN codes, store-set prices) first, then Open Food Facts to enrich the name and image of unknown barcodes. Open Food Facts has no prices, so unknown items use a default price and are flagged as not in the catalog.
- Payment is a generated UPI intent QR plus a simulated success button. There's no real payment confirmation.
- The wallet, loyalty points and receipts in the companion app are local demo state in localStorage.

## Evidence on Hand
- Catalog barcodes and product images come from Open Food Facts (images.openfoodfacts.org). The catalog prices are demo values set by the store, not real MRP data.
- There are no real customers, transactions or metrics. Don't fabricate any.

## Product Principles
1. A scan must always end in a clear outcome: added, not found, or retry. Never a silent hang.
2. Never show a number we can't back up. Estimated prices are labelled as estimates.
3. The kiosk is used standing, at arm's length, by first-timers, so targets are large and every state is legible from about a metre away.
4. Phone or paper: the pass works the same either way.

## Accessibility & Inclusion
- Kiosk text and targets must be readable at roughly a metre's distance.
- Keep Hindi/English bilingual touches where they already exist (for example, the grand total label).
