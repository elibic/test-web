/**
 * Firebase Configuration and Initialization
 * Exports auth and database to the global window object for use in script.js
 */

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA5ZzCrONVD0jMq3h_ISD-wVqyuphQ3Qck",
  authDomain: "test-94822.firebaseapp.com",
  databaseURL: "https://test-94822-default-rtdb.firebaseio.com",
  projectId: "test-94822",
  storageBucket: "test-94822.firebasestorage.app",
  messagingSenderId: "909846357157",
  appId: "1:909846357157:web:731bef70c1aad16133594c",
  measurementId: "G-41RX929LQX"
};
// --- APP CONFIGURATION & BRANDING (Project Specifics) ---
// This object centralizes all project-specific assets, texts, and settings.
// Edit this section when duplicating the project for a new client.
const appConfig = {
    branding: {
        // Main Logo (Top of screen)
        logoUrl: "https://firebasestorage.googleapis.com/v0/b/ramada-elev.firebasestorage.app/o/ramada_logo.png?alt=media&token=b5f74f15-0d5b-477c-9059-b96a85db507b",
        // Browser Favicon
        faviconUrl: "https://firebasestorage.googleapis.com/v0/b/nitzaelev.firebasestorage.app/o/icon.png?alt=media&token=fc912283-66ed-430e-82f9-e6ab265e5e98",
        // Apple Touch Icon
        appleTouchIconUrl: "https://firebasestorage.googleapis.com/v0/b/nitzaelev.firebasestorage.app/o/icon.png?alt=media&token=fc912283-66ed-430e-82f9-e6ab265e5e98",
        // "Powered By" Logo (Bottom Left)
        poweredByUrl: "https://firebasestorage.googleapis.com/v0/b/wolfsonelev.firebasestorage.app/o/Powered%20by_LOGO.png?alt=media&token=0e6c3ae5-24d7-49a1-bcc4-ab4c244adae3",
        // Theme Color (Browser Address Bar & PWA)
        themeColor: "#E6C25F"
    },
    // Theme defaults (synchronous, anti-FOUC). The LIVE per-project values come from
    // RTDB settings/appearance (edited in setup.html -> "מראה"); these are just the
    // instant default shown before Firebase loads. On clone, set to the chosen preset.
    theme: {
        preset: "ramada-gold",
        bg: "#f5f0eb",
        surface: "#ede6dc",
        text: "#333333",
        accent: "#c5a47e",
        accentDark: "#8c7354",
        fontFamily: "Assistant"
    },
    texts: {
        title: "מעלית שבת אצלך בסלון", // Browser Tab Title
        contactPhone: "052-5705289",
        contactDisplayPhone: "טלפון: 052-5705289", // Text shown in modal
        whatsappLink: "https://wa.me/972525705289"
    },
    // Custom Elevator Names Mapping
    // Format: "ELEVATOR_ID": { he: "Hebrew Name", en: "English Name" }
    // If an ID is missing here, it will default to "Elevator ID" / "מעלית ID"
    elevatorNames: {
        "A": { he: "מעלית A", en: "Elevator A" },
        "B": { he: "מעלית B", en: "Elevator B" },
        // Add more mapping here as needed
        "C": { he: "מעלית C", en: "Elevator C" }
    }
};

// Expose Config Globally
window.appConfig = appConfig;

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Export services to global scope for script.js
window.auth = firebase.auth();
window.database = firebase.database();

// Set persistence
window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

console.log("Firebase initialized.");