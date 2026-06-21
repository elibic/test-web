/**
 * Firebase Configuration and Initialization
 * Exports auth and database to the global window object for use in script.js
 */

const firebaseConfig = {
    apiKey: "AIzaSyABExU11JS2KsumwG5z6-X_Tnn_OJZkusg",
    authDomain: "nitzaelev.firebaseapp.com",
    databaseURL: "https://nitzaelev-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "nitzaelev",
    storageBucket: "nitzaelev.firebasestorage.app",
    messagingSenderId: "922911314024",
    appId: "1:922911314024:web:560493db03aa477cd7ebdd"
};

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