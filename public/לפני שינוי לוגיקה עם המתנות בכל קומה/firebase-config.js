/**
 * Firebase Configuration and Initialization
 * Exports auth and database to the global window object for use in script.js
 */

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCySWsQFuu9K9kZ5tt-wJhxKyDpgzxrapM",
  authDomain: "ramada.econtrol.co.il",
  databaseURL: "https://ramada-elev-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ramada-elev",
  storageBucket: "ramada-elev.firebasestorage.app",
  messagingSenderId: "977442422042",
  appId: "1:977442422042:web:f8369e4072172a174440a3",
  measurementId: "G-CVDSD0WPN3"
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