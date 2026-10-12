// Supabase project the kiosk talks to. The anon key is public by design: what it can reach
// is limited by the database's row-level security and the kiosk device key.
// Leave both empty to run the kiosk fully offline (built-in catalog, local passes).
window.RAISE_CLOUD_CONFIG = {
    url: "https://kbbhqpvivctnrfwgfuwb.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiYmhxcHZpdmN0bnJmd2dmdXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MjUxODYsImV4cCI6MjEwNzQwMTE4Nn0.9_KZfEP39vimb6zoXUkP2k-uFxFo5hOXbFcPSgvd84E"
};
