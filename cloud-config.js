// Supabase project the kiosk talks to. The anon key is public by design: what it can reach
// is limited by the database's row-level security and the kiosk device key.
// Leave both empty to run the kiosk fully offline (built-in catalog, local passes).
window.RAISE_CLOUD_CONFIG = {
    url: "",
    anonKey: ""
};
