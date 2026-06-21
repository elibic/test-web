// script.js
// Main Application Logic for Shabbat Elevator Monitoring System

// --- CONFIGURATION ---
// REMOVED: const HARDCODED_FLOOR = "8"; 
// NOW DYNAMIC: THIS_SCREEN_FLOOR is set after authentication based on user's DB preference
let THIS_SCREEN_FLOOR = null;
let THIS_SCREEN_FLOOR_NUM = null;

const STALE_TIMEOUT = 30000;
const INTERPOLATION_DELAY = 500;

// --- LOCALIZATION DICTIONARY ---
const translations = {
    he: {
        dir: 'rtl',
        loading: "טוען מערכת...",
        loginTitle: "כניסה למערכת",
        loginBtn: "התחבר",
        googleBtn: "התחבר עם Google",
        email: "אימייל",
        pass: "סיסמה",
        forgotPass: "שכחתי סיסמה",
        shabbatShalom: "שבת שלום",
        keepScreen: "השאר מסך דולק",
        screenActive: "המסך דולק",
        contactTitle: "צור קשר",
        phone: "טלפון: 052-5705289",
        clickHere: "לחץ כאן לשליחת הודעה",
        welcomeTitle: "ברוכים הבאים!",
        welcomeText: "יש לחבר את המכשיר למטען וללחוץ על כפתור 'השאר מסך דולק' בתחתית המסך, כדי להבטיח שהמסך יישאר פעיל לאורך השבת.",
        understand: "הבנתי",
        floor: "קומה",
        up: "עלייה",
        down: "ירידה",
        stopped: "עצרה",
        etaPrefix: "המעלית תגיע לקומה",
        arrived: "המעלית כאן",
        mins: "דק'",
        popupCharger: "המסך יישאר דולק. מומלץ לחבר למטען.",
        popupError: "הפעולה נכשלה. ייתכן שהדפדפן לא תומך.",
        authError: "שגיאת התחברות",
        // Keys for Settings/Logout
        logoutTitle: "התנתקות",
        logoutConfirm: "האם אתה בטוח שברצונך להתנתק?",
        approve: "אישור",
        cancel: "ביטול",
        // Keys for Logic
        break: "הפסקה",
        notStopping: "לא עוצרת",
        error: "שגיאה",
        here: "המעלית כאן",
        // NEW: Floor Selection
        selectFloorTitle: "בחירת קומה",
        selectFloorDesc: "בחר את הקומה שלך כדי לראות את זמני ההגעה המשוערים",
        selectFloorPlaceholder: "בחר קומה...",
        confirmFloor: "אישור",
        settingsTitle: "הגדרות",
        currentFloor: "קומה נוכחית",
        changeFloor: "שנה קומה",
        logout: "התנתק",
        floorSaved: "הקומה נשמרה בהצלחה",
        loadingFloors: "טוען קומות..."
    },
    en: {
        dir: 'ltr',
        loading: "Loading System...",
        loginTitle: "System Login",
        loginBtn: "Login",
        googleBtn: "Login with Google",
        email: "Email",
        pass: "Password",
        forgotPass: "Forgot Password",
        shabbatShalom: "Shabbat Shalom",
        keepScreen: "Keep Screen On",
        screenActive: "Screen Active",
        contactTitle: "Contact Us",
        phone: "Phone: 052-5705289",
        clickHere: "Click here to send message",
        welcomeTitle: "Welcome!",
        welcomeText: "Please connect device to charger and click the 'Keep Screen On' button at the bottom to ensure screen stays active.",
        understand: "I Understand",
        floor: "Floor",
        up: "Going Up",
        down: "Going Down",
        stopped: "Stopped",
        etaPrefix: "Elevator arriving at floor",
        arrived: "Elevator Here",
        mins: "min",
        popupCharger: "Screen will stay on. Connect charger.",
        popupError: "Action failed. Browser might not support.",
        authError: "Login Error",
        // Keys for Settings/Logout
        logoutTitle: "Logout",
        logoutConfirm: "Are you sure you want to log out?",
        approve: "Confirm",
        cancel: "Cancel",
        // Keys for Logic
        break: "On Break",
        notStopping: "Not Stopping",
        error: "Error",
        here: "Elevator Here",
        // NEW: Floor Selection
        selectFloorTitle: "Select Floor",
        selectFloorDesc: "Choose your floor to see estimated arrival times",
        selectFloorPlaceholder: "Select floor...",
        confirmFloor: "Confirm",
        settingsTitle: "Settings",
        currentFloor: "Current Floor",
        changeFloor: "Change Floor",
        logout: "Logout",
        floorSaved: "Floor saved successfully",
        loadingFloors: "Loading floors..."
    }
};

// --- LOAD LANG FROM STORAGE ---
let storedLang = localStorage.getItem('app_lang');
let currentLang = storedLang ? storedLang : 'he';

let isScreenLocked = false;
let wakeLockInstance = null;
let serverTimeOffset = 0;
let currentHebrewDateCache = "טוען...";

// --- STATE VARIABLES ---
let elevatorStates = {}, latestElevatorsData = null, settings = null, elevatorConfigs = null;
let availableFloors = []; // Will be populated from elevator_configs

// --- DOM ELEMENTS ---
let ui = {};

// Initialize UI references after DOM loads
function initializeUIReferences() {
    ui = {
        loadingOverlay: document.getElementById('loadingOverlay'),
        authContainer: document.getElementById('authContainer'),
        displayContainer: document.getElementById('displayContainer'),
        dashboard: document.querySelector('.dashboard-container'),
        notification: document.getElementById('notificationPopup'),
        initialPrompt: document.getElementById('initialPromptModal'),
        contactModal: document.getElementById('contactModal'),
        settingsModal: document.getElementById('settingsModal'),
        floorSelectionModal: document.getElementById('floorSelectionModal'),
        screenBtn: document.getElementById('screenLockButton'),
        keepScreenOnTxt: document.getElementById('keepScreenOnTxt'),
        
        // Auth elements
        googleBtn: document.getElementById('googleSignInBtn'),
        passToggle: document.getElementById('togglePasswordVisibility'),
        passInput: document.getElementById('passInput'),
        forgotBtn: document.getElementById('forgotPasswordBtn'),
        forgotModal: document.getElementById('forgotPasswordModal'),
        forgotEmail: document.getElementById('forgotEmailInput'),
        sendReset: document.getElementById('sendResetBtn'),
        cancelReset: document.getElementById('cancelResetBtn'),
        
        // Floor Selection elements
        floorSelectInitial: document.getElementById('floorSelectInitial'),
        confirmFloorBtn: document.getElementById('confirmFloorBtn'),
        
        // Settings elements
        currentFloorDisplay: document.getElementById('currentFloorNumber'),
        settingsFloorSelect: document.getElementById('settingsFloorSelect'),
        closeSettingsBtn: document.getElementById('closeSettingsBtn'),
        logoutBtn: document.getElementById('logoutBtn')
    };
}

// --- INITIAL APPLY LANG ---
document.addEventListener('DOMContentLoaded', () => {
    initializeUIReferences();
    applyLanguage();
    setupEventListeners();
});

// --- SETUP EVENT LISTENERS ---
function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if(loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('emailInput').value;
            const pass = document.getElementById('passInput').value;
            auth.signInWithEmailAndPassword(email, pass).catch(err => {
                const errEl = document.getElementById('authError');
                if(errEl) {
                    errEl.textContent = translations[currentLang].authError;
                    errEl.style.display = 'block';
                }
            });
        });
    }

    // Google Sign In
    const googleBtn = document.getElementById('googleSignInBtn');
    if(googleBtn) {
        googleBtn.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch(err => {
                const errEl = document.getElementById('authError');
                if(errEl) {
                    errEl.textContent = translations[currentLang].authError;
                    errEl.style.display = 'block';
                }
            });
        });
    }

    // Password Toggle
    const passToggle = document.getElementById('togglePasswordVisibility');
    const passInput = document.getElementById('passInput');
    if(passToggle && passInput) {
        passToggle.addEventListener('click', () => {
            const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passInput.setAttribute('type', type);
            passToggle.classList.toggle('fa-eye');
            passToggle.classList.toggle('fa-eye-slash');
        });
    }

    // Forgot Password
    const forgotBtn = document.getElementById('forgotPasswordBtn');
    const forgotModal = document.getElementById('forgotPasswordModal');
    const cancelReset = document.getElementById('cancelResetBtn');
    const sendReset = document.getElementById('sendResetBtn');
    const forgotEmail = document.getElementById('forgotEmailInput');
    
    if(forgotBtn && forgotModal) {
        forgotBtn.addEventListener('click', () => { forgotModal.style.display = 'flex'; });
    }
    if(cancelReset && forgotModal) {
        cancelReset.addEventListener('click', () => { forgotModal.style.display = 'none'; });
    }
    if(sendReset && forgotEmail && forgotModal) {
        sendReset.addEventListener('click', () => {
            const email = forgotEmail.value;
            if(!email) return alert('נא להזין אימייל');
            auth.sendPasswordResetEmail(email)
                .then(() => { 
                    alert('מייל לאיפוס הסיסמה נשלח בהצלחה. אם אינך מוצא אותו בתיבת הדואר הנכנס, ייתכן שהוא נמצא בתיקיית הספאם.'); 
                    forgotModal.style.display = 'none'; 
                })
                .catch(err => alert('שגיאה בשליחה: ' + err.message));
        });
    }

    // Floor Selection Modal - Confirm Button
    const confirmFloorBtn = document.getElementById('confirmFloorBtn');
    const floorSelectInitial = document.getElementById('floorSelectInitial');
    const floorSelectionModal = document.getElementById('floorSelectionModal');
    
    if(confirmFloorBtn && floorSelectInitial && floorSelectionModal) {
        confirmFloorBtn.addEventListener('click', async () => {
            const selectedFloor = floorSelectInitial.value;
            if (!selectedFloor) {
                showNotification(translations[currentLang].selectFloorPlaceholder);
                return;
            }
            await saveUserFloor(selectedFloor);
            floorSelectionModal.style.display = 'none';
            THIS_SCREEN_FLOOR = selectedFloor;
            THIS_SCREEN_FLOOR_NUM = parseInt(THIS_SCREEN_FLOOR, 10);
            initializeApp();
        });
    }

    // Settings Modal - Floor Change
    const settingsFloorSelect = document.getElementById('settingsFloorSelect');
    if(settingsFloorSelect) {
        settingsFloorSelect.addEventListener('change', async (e) => {
            const newFloor = e.target.value;
            if (newFloor && newFloor !== THIS_SCREEN_FLOOR) {
                settingsFloorSelect.classList.add('floor-changing');
                await saveUserFloor(newFloor);
                settingsFloorSelect.classList.remove('floor-changing');
                
                // Update the current floor and reload dashboard
                THIS_SCREEN_FLOOR = newFloor;
                THIS_SCREEN_FLOOR_NUM = parseInt(THIS_SCREEN_FLOOR, 10);
                updateCurrentFloorDisplay();
                
                // Refresh dashboard with new floor context
                if (latestElevatorsData) {
                    updateDashboard();
                }
                
                showNotification(translations[currentLang].floorSaved);
            }
        });
    }

    // Settings Modal - Close Button
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    if(closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', closeSettingsModal);
    }

    // Settings Modal - Logout Button
    const logoutBtn = document.getElementById('logoutBtn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', performLogout);
    }

    // Close modals on outside click
    const contactModal = document.getElementById('contactModal');
    const settingsModal = document.getElementById('settingsModal');
    
    window.onclick = (e) => {
        if (contactModal && e.target == contactModal) closeContactModal();
        if (settingsModal && e.target == settingsModal) closeSettingsModal();
    };
}

// --- AUTH LOGIC ---
auth.onAuthStateChanged(async (user) => {
    const authContainer = document.getElementById('authContainer');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const displayContainer = document.getElementById('displayContainer');
    
    if (user) {
        if(authContainer) authContainer.style.display = 'none';
        if(loadingOverlay) loadingOverlay.style.display = 'flex';
        
        // Check for user's default floor
        const userFloor = await getUserFloor(user.uid);
        
        if (userFloor === null) {
            // First time user - show floor selection modal
            if(loadingOverlay) loadingOverlay.style.display = 'none';
            await loadAvailableFloors();
            populateFloorSelects();
            showFloorSelectionModal();
        } else {
            // Returning user - load dashboard with saved floor
            THIS_SCREEN_FLOOR = userFloor;
            THIS_SCREEN_FLOOR_NUM = parseInt(THIS_SCREEN_FLOOR, 10);
            initializeApp();
        }
    } else {
        if(loadingOverlay) loadingOverlay.style.display = 'none';
        if(authContainer) authContainer.style.display = 'flex';
        if(displayContainer) displayContainer.style.display = 'none';
    }
});

// --- USER FLOOR DATABASE OPERATIONS ---
async function getUserFloor(uid) {
    try {
        const snapshot = await database.ref(`users/${uid}/settings/defaultFloor`).once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Error fetching user floor:', error);
        return null;
    }
}

async function saveUserFloor(floor) {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        await database.ref(`users/${user.uid}/settings/defaultFloor`).set(floor);
    } catch (error) {
        console.error('Error saving user floor:', error);
        throw error;
    }
}

// --- FLOOR MANAGEMENT ---
async function loadAvailableFloors() {
    try {
        // Load settings and elevator configs first
        const [sSnap, cSnap] = await Promise.all([
            database.ref('settings').once('value'),
            database.ref('elevator_configs').once('value')
        ]);
        settings = sSnap.val() || {};
        elevatorConfigs = cSnap.val() || {};
        
        // Extract all unique floors from elevator configs
        const floorsSet = new Set();
        
        Object.values(elevatorConfigs).forEach(config => {
            if (config.STOPPING_FLOORS) {
                config.STOPPING_FLOORS.forEach(floor => floorsSet.add(String(floor)));
            }
            if (config.STOPPING_FLOORS_UP) {
                config.STOPPING_FLOORS_UP.forEach(floor => floorsSet.add(String(floor)));
            }
            if (config.STOPPING_FLOORS_DOWN) {
                config.STOPPING_FLOORS_DOWN.forEach(floor => floorsSet.add(String(floor)));
            }
            if (config.VISIBLE_FLOORS) {
                config.VISIBLE_FLOORS.filter(f => f !== '*').forEach(floor => floorsSet.add(String(floor)));
            }
        });
        
        // If no floors found from configs, use range from settings
        if (floorsSet.size === 0) {
            const bottom = parseInt(settings.BOTTOM_FLOOR || -1);
            const top = parseInt(settings.TOP_FLOOR || 10);
            for (let i = bottom; i <= top; i++) {
                floorsSet.add(String(i));
            }
        }
        
        // Convert to sorted array
        availableFloors = Array.from(floorsSet).sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            return numA - numB;
        });
        
    } catch (error) {
        console.error('Error loading floors:', error);
        // Fallback to default range
        availableFloors = [];
        for (let i = -1; i <= 15; i++) {
            availableFloors.push(String(i));
        }
    }
}

function populateFloorSelects() {
    const t = translations[currentLang];
    
    // Populate initial floor selection dropdown - with null check
    const floorSelectInitial = document.getElementById('floorSelectInitial');
    if(floorSelectInitial) {
        floorSelectInitial.innerHTML = `<option value="">${t.selectFloorPlaceholder}</option>`;
        availableFloors.forEach(floor => {
            const option = document.createElement('option');
            option.value = floor;
            option.textContent = `${t.floor} ${floor}`;
            floorSelectInitial.appendChild(option);
        });
    }
    
    // Populate settings floor selection dropdown - with null check
    const settingsFloorSelect = document.getElementById('settingsFloorSelect');
    if(settingsFloorSelect) {
        settingsFloorSelect.innerHTML = '';
        availableFloors.forEach(floor => {
            const option = document.createElement('option');
            option.value = floor;
            option.textContent = `${t.floor} ${floor}`;
            if (floor === THIS_SCREEN_FLOOR) {
                option.selected = true;
            }
            settingsFloorSelect.appendChild(option);
        });
    }
}

function updateCurrentFloorDisplay() {
    const currentFloorNumber = document.getElementById('currentFloorNumber');
    if (currentFloorNumber) {
        currentFloorNumber.textContent = THIS_SCREEN_FLOOR || '--';
    }
    const settingsFloorSelect = document.getElementById('settingsFloorSelect');
    if (settingsFloorSelect) {
        settingsFloorSelect.value = THIS_SCREEN_FLOOR;
    }
}

// --- MODAL CONTROLS ---
function showFloorSelectionModal() {
    const t = translations[currentLang];
    const titleEl = document.getElementById('floorSelectionTitle');
    const descEl = document.getElementById('floorSelectionDesc');
    const confirmBtn = document.getElementById('confirmFloorBtn');
    const modal = document.getElementById('floorSelectionModal');
    
    if(titleEl) titleEl.textContent = t.selectFloorTitle;
    if(descEl) descEl.textContent = t.selectFloorDesc;
    if(confirmBtn) confirmBtn.textContent = t.confirmFloor;
    if(modal) modal.style.display = 'flex';
}

function openSettingsModal() {
    const t = translations[currentLang];
    
    // Update labels
    const settingsTitle = document.getElementById('settingsTitle');
    const currentFloorLabel = document.getElementById('currentFloorLabel');
    const changeFloorLabel = document.getElementById('changeFloorLabel');
    const logoutBtn = document.getElementById('logoutBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    
    if(settingsTitle) settingsTitle.innerHTML = `<i class="fas fa-cog"></i> ${t.settingsTitle}`;
    if(currentFloorLabel) currentFloorLabel.textContent = t.currentFloor;
    if(changeFloorLabel) changeFloorLabel.textContent = t.changeFloor;
    if(logoutBtn) logoutBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i> ${t.logout}`;
    if(closeSettingsBtn) closeSettingsBtn.textContent = t.cancel;
    
    // Update current floor display
    updateCurrentFloorDisplay();
    
    // Populate floor select with current selection
    populateFloorSelects();
    
    if(settingsModal) settingsModal.style.display = 'flex';
}

function closeSettingsModal() {
    const settingsModal = document.getElementById('settingsModal');
    if(settingsModal) settingsModal.style.display = 'none';
}

function closeInitialPrompt() { 
    const initialPrompt = document.getElementById('initialPromptModal');
    if(initialPrompt) initialPrompt.style.display = 'none'; 
}

function openContactModal() {
    const contactModal = document.getElementById('contactModal');
    if(contactModal) contactModal.style.display = 'flex';
    const canvas = document.getElementById('qrCanvas');
    const link = "https://wa.me/972525705289";
    if(canvas) QRCode.toCanvas(canvas, link, { width: 180 }, (err) => {});
}

function closeContactModal() { 
    const contactModal = document.getElementById('contactModal');
    if(contactModal) contactModal.style.display = 'none'; 
}

function performLogout() {
    auth.signOut();
    location.reload();
}

// --- APP INITIALIZATION ---
async function initializeApp() {
    initializeClock();
    applyLanguage();
    
    const loadingOverlay = document.getElementById('loadingOverlay');
    const displayContainer = document.getElementById('displayContainer');
    const initialPrompt = document.getElementById('initialPromptModal');
    const dashboard = document.querySelector('.dashboard-container');
    
    try {
        // Load settings and configs if not already loaded
        if (!settings || !elevatorConfigs) {
            const [sSnap, cSnap] = await Promise.all([
                database.ref('settings').once('value'),
                database.ref('elevator_configs').once('value')
            ]);
            settings = sSnap.val() || {};
            elevatorConfigs = cSnap.val() || {};
        }
        
        // Populate available floors for settings modal
        await loadAvailableFloors();

        database.ref('elevators').on('value', (snapshot) => {
            latestElevatorsData = snapshot.val() || {};
            updateDashboard(); 
            if(loadingOverlay) loadingOverlay.style.display = 'none';
            if(displayContainer) displayContainer.style.display = 'flex';
        });
        
        setTimeout(() => { 
            if(initialPrompt) initialPrompt.style.display = 'flex'; 
        }, 1000);
        
        // Live Countdown Interval
        setInterval(() => {
            if (latestElevatorsData) {
                const elevatorIds = Object.keys(latestElevatorsData);
                const visibleElevators = elevatorIds.filter(id => shouldShowElevator(id));
                visibleElevators.forEach(id => {
                    if (elevatorStates[id]) calculateAndShowETAFor(id, elevatorStates[id]);
                });
            }
        }, 1000);

    } catch (e) {
        console.error(e);
        alert("Error loading data");
    }
}

// --- FILTERING LOGIC ---
function shouldShowElevator(elevatorId) {
    const floorToCheck = THIS_SCREEN_FLOOR;
    if (!floorToCheck) return true;
    
    const config = elevatorConfigs[elevatorId];
    if (!config) return true;

    if (config.VISIBLE_FLOORS && config.VISIBLE_FLOORS.length > 0) {
        if (config.VISIBLE_FLOORS.includes('*')) return true;
        return config.VISIBLE_FLOORS.map(String).includes(String(floorToCheck));
    }
    
    if (config.STOPPING_FLOORS) {
        return config.STOPPING_FLOORS.map(String).includes(String(floorToCheck));
    }
    
    return true;
}

// --- HELPER FUNCTIONS ---
function getNumericFloor(floorText) {
    if (floorText === null || floorText === undefined) return null;
    const text = String(floorText).toUpperCase();
    if (text === 'L') return -1;
    const num = parseInt(text, 10);
    return isNaN(num) ? null : num;
}

function countStopsInList(startFloor, endFloor, list) {
     if (!list || list.length === 0) return 0;
     const sortedStops = list.map(getNumericFloor).sort((a, b) => a - b);
     if (endFloor > startFloor) { return sortedStops.filter(f => f > startFloor && f <= endFloor).length; } 
     else { return sortedStops.filter(f => f < startFloor && f >= endFloor).length; }
}

// --- DATE & TIME LOGIC ---
async function syncServerTime() {
    try {
        const offsetRef = database.ref('.info/serverTimeOffset');
        const snapshot = await offsetRef.once('value');
        serverTimeOffset = snapshot.val() || 0;
    } catch (error) { serverTimeOffset = 0; }
}

function updateJerusalemTime() {
    const now = new Date(Date.now() + serverTimeOffset);
    const options = { timeZone: 'Asia/Jerusalem', hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'long' };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    const findPart = (type) => parts.find(p => p.type === type)?.value || '00';
    const year = parseInt(findPart('year'));
    const month = parseInt(findPart('month')) - 1; 
    const day = parseInt(findPart('day'));
    const hour = parseInt(findPart('hour')) % 24;
    const minute = parseInt(findPart('minute'));
    const second = parseInt(findPart('second'));
    const currentJerusalemTime = new Date(Date.UTC(year, month, day, hour, minute, second));
    const dayNameHe = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long' }).format(now);
    return {
        dateObj: currentJerusalemTime, dayName: dayNameHe,
        day: String(day).padStart(2, '0'), month: String(month + 1).padStart(2, '0'), year: String(year),
        hour: String(hour).padStart(2, '0'), minute: String(minute).padStart(2, '0'), second: String(second).padStart(2, '0')
    };
}

async function fetchHebrewDate(date) {
    try {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const url = `https://www.hebcal.com/converter?cfg=json&gy=${year}&gm=${month}&gd=${day}&g2h=1`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.hebrew) {
            currentHebrewDateCache = data.hebrew.replace(/[\u0591-\u05C7]/g, '');
        }
    } catch (error) {}
}

function initializeClock() {
    syncServerTime();
    setInterval(syncServerTime, 3600000);
    
    // Initial call
    const timeData = updateJerusalemTime();
    fetchHebrewDate(timeData.dateObj);

    setInterval(() => {
        const td = updateJerusalemTime();
        const timeStr = `${td.hour}:${td.minute}:${td.second}`;
        const dateStr = `${td.dayName}, ${td.day}/${td.month}/${td.year}`;
        
        document.getElementById('statusTime').textContent = timeStr;
        document.getElementById('statusDate').textContent = dateStr;
        document.getElementById('statusHebrewDate').textContent = currentHebrewDateCache;
        
        // Fetch Hebrew date at midnight
        if (td.hour === '00' && td.minute === '00' && td.second === '01') {
             fetchHebrewDate(td.dateObj);
        }
    }, 1000);
}

// --- UI & TRANSLATION ---
function toggleLanguage() {
    currentLang = (currentLang === 'he') ? 'en' : 'he';
    
    // Save to LocalStorage
    localStorage.setItem('app_lang', currentLang);
    
    applyLanguage();

    // Show initial prompt again if user is logged in (inside app)
    const displayContainer = document.getElementById('displayContainer');
    const initialPrompt = document.getElementById('initialPromptModal');
    if (auth.currentUser && displayContainer && displayContainer.style.display !== 'none') {
        if(initialPrompt) initialPrompt.style.display = 'flex';
    }
}

function applyLanguage() {
    const t = translations[currentLang];
    document.documentElement.lang = currentLang;
    document.documentElement.dir = t.dir;
    
    // Mirror controls for LTR
    const controls = document.querySelector('.side-controls-container');
    if(controls) {
        if(t.dir === 'ltr') controls.style.flexDirection = 'row-reverse';
        else controls.style.flexDirection = 'row';
    }

    // Auth
    const loadingText = document.getElementById('loadingText');
    if(loadingText) loadingText.textContent = t.loading;
    
    const loginTitle = document.getElementById('loginTitle');
    if(loginTitle) loginTitle.textContent = t.loginTitle;
    
    const loginBtnTxt = document.getElementById('loginBtnTxt');
    if(loginBtnTxt) loginBtnTxt.textContent = t.loginBtn;
    
    const googleBtnTxt = document.getElementById('googleBtnTxt');
    if(googleBtnTxt) googleBtnTxt.textContent = t.googleBtn;
    
    const emailInput = document.getElementById('emailInput');
    if(emailInput) emailInput.placeholder = t.email;
    
    const passInput = document.getElementById('passInput');
    if(passInput) passInput.placeholder = t.pass;
    
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    if(forgotPasswordBtn) forgotPasswordBtn.textContent = t.forgotPass;

    // Main
    const headerText = document.getElementById('headerText');
    if(headerText) headerText.textContent = t.shabbatShalom;
    
    // Safe access to ui elements
    const keepScreenOnTxt = document.getElementById('keepScreenOnTxt');
    if(keepScreenOnTxt) keepScreenOnTxt.textContent = isScreenLocked ? t.screenActive : t.keepScreen;
    
    // Update persistent msg if showing
    const msgEl = document.getElementById('persistentScreenMsg');
    if (msgEl && isScreenLocked) msgEl.textContent = t.popupCharger;

    // Modals
    const welcomeTitle = document.getElementById('welcomeTitle');
    if(welcomeTitle) welcomeTitle.textContent = t.welcomeTitle;
    
    const welcomeText = document.getElementById('welcomeText');
    if(welcomeText) welcomeText.innerHTML = t.welcomeText;
    
    const understandBtn = document.getElementById('understandBtn');
    if(understandBtn) understandBtn.textContent = t.understand;
    
    const contactTitle = document.getElementById('contactTitle');
    if(contactTitle) contactTitle.textContent = t.contactTitle;
    
    const contactPhone = document.getElementById('contactPhone');
    if(contactPhone) contactPhone.textContent = t.phone;
    
    const clickHereTxt = document.getElementById('clickHereTxt');
    if(clickHereTxt) clickHereTxt.textContent = t.clickHere;
    
    // Floor Selection Modal - with safe null checks
    const floorSelectionTitle = document.getElementById('floorSelectionTitle');
    if(floorSelectionTitle) floorSelectionTitle.textContent = t.selectFloorTitle;
    
    const floorSelectionDesc = document.getElementById('floorSelectionDesc');
    if(floorSelectionDesc) floorSelectionDesc.textContent = t.selectFloorDesc;
    
    const confirmFloorBtn = document.getElementById('confirmFloorBtn');
    if(confirmFloorBtn) confirmFloorBtn.textContent = t.confirmFloor;
    
    // Settings Modal - with safe null checks
    const settingsTitleEl = document.getElementById('settingsTitle');
    if(settingsTitleEl) {
        // Preserve the icon, just update text
        settingsTitleEl.innerHTML = `<i class="fas fa-cog"></i> ${t.settingsTitle}`;
    }
    
    const currentFloorLabel = document.getElementById('currentFloorLabel');
    if(currentFloorLabel) currentFloorLabel.textContent = t.currentFloor;
    
    const changeFloorLabel = document.getElementById('changeFloorLabel');
    if(changeFloorLabel) changeFloorLabel.textContent = t.changeFloor;
    
    const logoutBtnEl = document.getElementById('logoutBtn');
    if(logoutBtnEl) logoutBtnEl.innerHTML = `<i class="fas fa-sign-out-alt"></i> ${t.logout}`;
    
    const closeSettingsBtnEl = document.getElementById('closeSettingsBtn');
    if(closeSettingsBtnEl) closeSettingsBtnEl.textContent = t.cancel;

    // Repopulate floor selects with correct language - only if elements exist
    const floorSelectCheck = document.getElementById('floorSelectInitial');
    const settingsFloorSelectCheck = document.getElementById('settingsFloorSelect');
    if (availableFloors.length > 0 && floorSelectCheck && settingsFloorSelectCheck) {
        populateFloorSelects();
    }

    if (latestElevatorsData) updateDashboard();
}

// --- WAKE LOCK LOGIC ---
async function requestScreenLock() {
    const t = translations[currentLang];
    const screenBtn = document.getElementById('screenLockButton');
    
    if (!('wakeLock' in navigator)) {
        showNotification(t.popupError);
        return;
    }
    try {
        wakeLockInstance = await navigator.wakeLock.request('screen');
        isScreenLocked = true;
        if(screenBtn) {
            screenBtn.classList.add('active');
            screenBtn.innerHTML = `<i class="fa-solid fa-check-circle"></i> <span id="keepScreenOnTxt">${t.screenActive}</span>`;
        }
        
        // Show persistent message
        const msgEl = document.getElementById('persistentScreenMsg');
        if(msgEl) {
            msgEl.textContent = t.popupCharger;
            msgEl.classList.add('show-persistent');
        }
        
        wakeLockInstance.addEventListener('release', () => {
            isScreenLocked = false;
            wakeLockInstance = null;
            if(screenBtn) {
                screenBtn.classList.remove('active');
                screenBtn.innerHTML = `<i class="fas fa-mobile-alt"></i> <span id="keepScreenOnTxt">${t.keepScreen}</span>`;
            }
            
            // Hide persistent message
            if(msgEl) msgEl.classList.remove('show-persistent');
        });
    } catch (err) {
        console.error(err);
        showNotification(t.popupError);
    }
}

function showNotification(msg) {
    const notification = document.getElementById('notificationPopup');
    if(notification) {
        notification.textContent = msg;
        notification.classList.add('show');
        setTimeout(() => notification.classList.remove('show'), 5000);
    }
}

// --- ELEVATOR CORE LOGIC ---
function updateDashboard() {
    if (!latestElevatorsData) return;
    const sortedIds = Object.keys(latestElevatorsData).sort();
    const visibleIds = sortedIds.filter(id => shouldShowElevator(id));

    // Clear panels that shouldn't be there
    const container = document.querySelector('.dashboard-container');
    if (!container) return;
    
    Array.from(container.children).forEach(child => {
         const id = child.id.replace('panel-', '');
         if (!visibleIds.includes(id)) child.remove();
    });

    // Create or Update panels via Process
    visibleIds.forEach(id => {
        let panel = document.getElementById(`panel-${id}`);
        if (!panel) {
            panel = createPanel(id);
            container.appendChild(panel);
        }
        processElevatorUpdate(id, latestElevatorsData[id]);
    });
}

function createPanel(id) {
    const t = translations[currentLang];
    const div = document.createElement('div');
    div.className = 'elevator-panel';
    div.id = `panel-${id}`;
    div.innerHTML = `
        <div class="elevator-id" id="lbl-${id}"></div>
        <div class="floor-indicator" id="floor-${id}">--</div>
        <div class="direction-status" id="dir-${id}"></div>
        <div class="eta-display">
            <div class="floor-label" id="etaLabel-${id}"></div>
            <div class="eta-result" id="eta-${id}"></div>
        </div>
    `;
    return div;
}

// --- ADVANCED STATE MANAGEMENT ---
async function processElevatorUpdate(id, newData) {
    const currentState = elevatorStates[id] || {};
    const lastFloorNum = getNumericFloor(currentState.floor);
    const currentFloorNum = getNumericFloor(newData.floor);

    if (currentFloorNum === null) return;
    
    const config = elevatorConfigs[id] || {};
    const topFloorNum = getNumericFloor(config.TOP_FLOOR ?? settings.TOP_FLOOR);
    const bottomFloorNum = getNumericFloor(config.BOTTOM_FLOOR ?? settings.BOTTOM_FLOOR);
    
    if (currentState.timeoutId) clearTimeout(currentState.timeoutId);
    
    let newDirection = currentState.direction || 'stopped';
    if (currentFloorNum === topFloorNum || currentFloorNum === bottomFloorNum) newDirection = 'stopped';
    else if (lastFloorNum !== null && currentFloorNum !== lastFloorNum) newDirection = (currentFloorNum > lastFloorNum) ? 'up' : 'down';

    const newState = {
        floor: newData.floor,
        direction: newDirection,
        timestamp: Date.now(),
        timeoutId: setTimeout(() => {
            const timedOutState = elevatorStates[id];
            if (timedOutState && (Date.now() - timedOutState.timestamp >= STALE_TIMEOUT)) {
               timedOutState.direction = 'stopped';
               updateElevatorDisplay(id, timedOutState);
            }
        }, STALE_TIMEOUT)
    };
    
    elevatorStates[id] = newState;

    // Interpolation Logic
    if (lastFloorNum !== null && Math.abs(currentFloorNum - lastFloorNum) > 1) {
        await interpolateAndDisplay(id, lastFloorNum, currentFloorNum, newState);
    } else {
        updateElevatorDisplay(id, newState);
    }
    
    // Calc ETA once on update (Interval handles the rest)
    calculateAndShowETAFor(id, newState);
}

async function interpolateAndDisplay(elevatorId, startNum, endNum, finalState) {
    const step = (endNum > startNum) ? 1 : -1;
    const direction = (step > 0) ? 'up' : 'down';
    
    const allFloorsMap = new Map();
    if (elevatorConfigs) {
        Object.values(elevatorConfigs).forEach(config => {
            if(config && config.STOPPING_FLOORS) config.STOPPING_FLOORS.forEach(floor => allFloorsMap.set(getNumericFloor(floor), floor));
        });
    }

    for (let floor = startNum + step; floor !== endNum; floor += step) {
        const displayFloor = allFloorsMap.get(floor) || floor.toString();
        const intermediateState = { floor: displayFloor, direction: direction };
        updateElevatorDisplay(elevatorId, intermediateState);
        await new Promise(resolve => setTimeout(resolve, INTERPOLATION_DELAY));
    }
    updateElevatorDisplay(elevatorId, finalState);
}

// --- DOM UPDATER ---
function updateElevatorDisplay(id, stateData) {
    const t = translations[currentLang];
    
    // Update Labels
    const labelEl = document.getElementById(`lbl-${id}`);
    if(labelEl) labelEl.textContent = t.dir === 'rtl' ? `מעלית ${id}` : `Elevator ${id}`;
    
    const etaLabel = document.getElementById(`etaLabel-${id}`);
    if(etaLabel) etaLabel.textContent = `${t.etaPrefix} ${THIS_SCREEN_FLOOR}`;
    
    // Elements
    const floorEl = document.getElementById(`floor-${id}`);
    const dirContainer = document.getElementById(`dir-${id}`);

    if (!stateData) {
        if(floorEl) floorEl.textContent = '--';
        if(dirContainer) dirContainer.innerHTML = '';
        return;
    }

    if(floorEl) floorEl.textContent = stateData.floor || '--';
    
    if(dirContainer) {
        let dir = stateData.direction;
        if (dir === 'up') {
            dirContainer.innerHTML = `<svg class="elevator-arrow-svg arrow-up" viewBox="0 0 24 24"><path class="elevator-arrow-path" d="M12 4 L22 20 L2 20 Z" /></svg>`;
        } else if (dir === 'down') {
            dirContainer.innerHTML = `<svg class="elevator-arrow-svg arrow-down" viewBox="0 0 24 24"><path class="elevator-arrow-path" d="M12 4 L22 20 L2 20 Z" /></svg>`;
        } else {
             dirContainer.innerHTML = `
                <svg class="stop-status-svg" viewBox="0 0 100 100">
                    <circle class="stop-ring" cx="50" cy="50" r="45" />
                    <g class="stop-bars"> 
                        <rect x="38" y="30" width="8" height="40" rx="2" />
                        <rect x="54" y="30" width="8" height="40" rx="2" />
                    </g>
                </svg>
            `;
        }
    }
}

// --- ETA CALCULATION ---
function calculateAndShowETAFor(id, state) {
    const el = document.getElementById(`eta-${id}`);
    const t = translations[currentLang];
    const config = elevatorConfigs[id];
    
    if (!config || !settings) { if(el) el.textContent = "..."; return; }

    const panel = document.getElementById(`panel-${id}`);
    const resetPanelStyle = () => {
        if (panel && panel.classList.contains('approaching')) {
            panel.classList.remove('approaching');
        }
    };
    
    // 1. Check for Break
    const breakActive = config.SHABBAT_BREAK_ACTIVE || false;
    if (breakActive) {
        const now = new Date(Date.now() + (serverTimeOffset || 0));
        const [startH, startM] = (config.SHABBAT_BREAK_START || "00:00").split(':').map(Number);
        const [endH, endM] = (config.SHABBAT_BREAK_END || "00:00").split(':').map(Number);
        const startTime = new Date(now); startTime.setHours(startH, startM, 0);
        const endTime = new Date(now); endTime.setHours(endH, endM, 0);
        if (now >= startTime && now <= endTime) { 
            if(el) el.textContent = t.break; 
            resetPanelStyle();
            return; 
        }
    }

    const userFloorNum = getNumericFloor(THIS_SCREEN_FLOOR);
    const topFloorNum = getNumericFloor(config.TOP_FLOOR ?? settings.TOP_FLOOR);
    const bottomFloorNum = getNumericFloor(config.BOTTOM_FLOOR ?? settings.BOTTOM_FLOOR);

    if (userFloorNum === null) { if(el) el.textContent = t.error; return; }

    let stopsUp = config.STOPPING_FLOORS_UP || [];
    let stopsDown = config.STOPPING_FLOORS_DOWN || [];
    
    const canStopUp = stopsUp.length === 0 || stopsUp.map(String).includes(String(THIS_SCREEN_FLOOR));
    const canStopDown = stopsDown.length === 0 || stopsDown.map(String).includes(String(THIS_SCREEN_FLOOR));
    
    if (!canStopUp && !canStopDown) { if(el) el.textContent = t.notStopping; return; }

    const elevatorFloorNum = getNumericFloor(state.floor);
    
    // Check stopping
    let isHereAndStopping = false;
    if (userFloorNum === elevatorFloorNum) {
         if (state.direction === 'stopped' || state.direction === ' ') {
             isHereAndStopping = true;
         }
         else if (state.direction === 'up' && canStopUp) {
             isHereAndStopping = true;
         }
         else if (state.direction === 'down' && canStopDown) {
             isHereAndStopping = true;
         }
    }

    if (isHereAndStopping) { 
        if(el) el.textContent = t.here; 
        if (panel && !panel.classList.contains('approaching')) {
            panel.classList.add('approaching');
        }
        return; 
    }
    
    let effectiveDirection = state.direction;
    if (effectiveDirection === 'stopped' || effectiveDirection === ' ') {
        if (elevatorFloorNum === bottomFloorNum) effectiveDirection = 'up';
        else if (elevatorFloorNum === topFloorNum) effectiveDirection = 'down';
        else effectiveDirection = 'up';
    }
    
    const timePerFloor = parseFloat(config.TIME_PER_FLOOR ?? settings.TIME_PER_FLOOR ?? 0); 
    let timePassFloor = parseFloat(config.TIME_PASS_FLOOR || 0);
    if (timePassFloor === 0) {
         const expressTimeUp = parseFloat(config.EXPRESS_TIME_UP ?? settings.EXPRESS_TIME_UP ?? 0);
         const totalTravelDistance = Math.abs(topFloorNum - bottomFloorNum) || 1;
         if(expressTimeUp > 0) timePassFloor = expressTimeUp / totalTravelDistance;
    }
    
    const zeroWaitActive = config.ZERO_FLOOR_WAIT_ACTIVE || false;
    const zeroWaitSeconds = parseFloat(config.ZERO_FLOOR_WAIT_SECONDS || 0);
    const zeroFloorWait = zeroWaitActive ? zeroWaitSeconds : 0;
    const zeroFloorNum = 0;

    const calcSegmentTime = (start, end, dir) => {
        const list = (dir === 'up') ? stopsUp : stopsDown;
        const stopsCount = countStopsInList(start, end, list);
        const steps = Math.abs(end - start);
        if (steps === 0) return 0;
        const passCount = steps - stopsCount; 
        let time = (stopsCount * timePerFloor) + (passCount * timePassFloor);
        if (zeroFloorWait > 0 && start !== zeroFloorNum) {
             if ((start < zeroFloorNum && end >= zeroFloorNum) || (start > zeroFloorNum && end <= zeroFloorNum)) {
                 time += zeroFloorWait;
             }
        }
        return time;
    };

    let totalSeconds = 0;
    if (effectiveDirection === 'up' || effectiveDirection === ' ') {
        if (userFloorNum > elevatorFloorNum) {
            if (canStopUp) { totalSeconds = calcSegmentTime(elevatorFloorNum, userFloorNum, 'up'); }
            else {
                totalSeconds = calcSegmentTime(elevatorFloorNum, topFloorNum, 'up');
                totalSeconds += calcSegmentTime(topFloorNum, userFloorNum, 'down');
            }
        } else {
            totalSeconds = calcSegmentTime(elevatorFloorNum, topFloorNum, 'up');
            totalSeconds += calcSegmentTime(topFloorNum, userFloorNum, 'down');
        }
    } else { 
        if (userFloorNum < elevatorFloorNum) {
            if (canStopDown) { totalSeconds = calcSegmentTime(elevatorFloorNum, userFloorNum, 'down'); }
            else {
                totalSeconds = calcSegmentTime(elevatorFloorNum, bottomFloorNum, 'down');
                totalSeconds += calcSegmentTime(bottomFloorNum, userFloorNum, 'up');
            }
        } else {
            totalSeconds = calcSegmentTime(elevatorFloorNum, bottomFloorNum, 'down');
            totalSeconds += calcSegmentTime(bottomFloorNum, userFloorNum, 'up');
        }
    }

    if (elevatorFloorNum === zeroFloorNum && zeroFloorWait > 0) totalSeconds += zeroFloorWait;
    
    const elapsedSinceUpdate = (Date.now() - (state.timestamp || Date.now())) / 1000;
    let finalSeconds = totalSeconds - elapsedSinceUpdate;
    if (finalSeconds < 0) finalSeconds = 0;
    
    if (finalSeconds <= 60) {
        if (panel && !panel.classList.contains('approaching')) {
            panel.classList.add('approaching');
        }
    } else {
        if (panel && panel.classList.contains('approaching')) {
            panel.classList.remove('approaching');
        }
    }

    const mins = Math.floor(finalSeconds / 60);
    const secs = Math.round(finalSeconds % 60);
    
    if(el) el.textContent = `${mins}:${secs.toString().padStart(2,'0')} ${t.mins}`;
}

// Make functions globally accessible for onclick handlers
window.toggleLanguage = toggleLanguage;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.closeInitialPrompt = closeInitialPrompt;
window.openContactModal = openContactModal;
window.closeContactModal = closeContactModal;
window.requestScreenLock = requestScreenLock;
window.performLogout = performLogout;