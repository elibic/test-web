// firebase-config.js
// Firebase Configuration and Initialization

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
firebase.initializeApp(firebaseConfig);
console.log('Firebase initialized.');

// Export auth and database instances
const auth = firebase.auth();
const database = firebase.database();

// Set persistence to LOCAL for remembered sessions
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).then(() => {
    console.log('Auth persistence set to LOCAL.');
}).catch((error) => {
    console.error('Auth persistence error:', error);
});