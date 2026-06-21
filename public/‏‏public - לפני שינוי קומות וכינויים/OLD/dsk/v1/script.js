// --- EXPLICIT GLOBALS (Critical Fix) ---
const auth = window.auth || firebase.auth();
const database = window.database || firebase.database();

console.log("Script loaded. Auth & DB references secured.");

// --- CONFIGURATION ---
let THIS_SCREEN_FLOOR = null;
let THIS_SCREEN_FLOOR_NUM = null;

// New state to track temporary selection in modals (before save)
let tempSelectedFloor = null;
// New state to track session conflict data
let pendingSessionConflict = null;
// Flag to track if logout was initiated by the user (to avoid "Kicked" alert)
let isManualLogout = false;
// Store the listener reference to detach it later if needed
let sessionListenerRef = null;

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
        welcomeText: "יש לחבר את המכשיר למטען וללחוץ על כפתור <b>'השאר מסך דולק'</b> בתחתית המסך, כדי להבטיח שהמסך יישאר פעיל לאורך השבת.",
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
        settingsTitle: "הגדרות ויציאה",
        selectFloor: "בחר קומת ברירת מחדל:",
        save: "שמור שינויים",
        logoutConfirm: "התנתקות מהמערכת",
        approve: "אישור",
        cancel: "ביטול",
        break: "הפסקה",
        notStopping: "לא עוצרת",
        error: "שגיאה",
        here: "המעלית כאן",
        // New Session Conflict Translations
        sessionConflictTitle: "ריבוי מכשירים",
        sessionConflictText: "חשבון זה הגיע למכסת המכשירים המקסימלית.<br>האם ברצונך לנתק את המכשיר הישן ביותר ולהתחבר כאן?",
        disconnectOldest: "התחבר כאן (נתק מכשיר ישן)",
        stayLoggedOut: "ביטול (התנתק)",
        // New Kicked Translation
        sessionKicked: "התחברת לחשבון זה ממכשיר אחר.\nהמערכת תנתק כעת מכשיר זה."
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
        sessionError: "Account already active on another device.",
        settingsTitle: "Settings & Logout",
        selectFloor: "Select Default Floor:",
        save: "Save Changes",
        logoutConfirm: "Log Out",
        approve: "Confirm",
        cancel: "Cancel",
        break: "On Break",
        notStopping: "Not Stopping",
        error: "Error",
        here: "Elevator Here",
        // New Session Conflict Translations
        sessionConflictTitle: "Device Limit Reached",
        sessionConflictText: "Maximum number of devices reached.<br>Do you want to disconnect the oldest device and connect here?",
        disconnectOldest: "Connect Here (Disconnect Oldest)",
        stayLoggedOut: "Cancel (Logout)",
        // New Kicked Translation
        sessionKicked: "You have logged in from another device.\nThis session will now be disconnected."
    }
};

let storedLang = localStorage.getItem('app_lang');
let currentLang = storedLang ? storedLang : 'he';

let isScreenLocked = false;
let wakeLockInstance = null;
let serverTimeOffset = 0;
let currentHebrewDateCache = "טוען...";

let elevatorStates = {}, latestElevatorsData = null, settings = null, elevatorConfigs = null;

// --- DOM ELEMENTS ---
const ui = {
    loadingOverlay: document.getElementById('loadingOverlay'),
    authContainer: document.getElementById('authContainer'),
    displayContainer: document.getElementById('displayContainer'),
    dashboard: document.querySelector('.dashboard-container'),
    notification: document.getElementById('notificationPopup'),
    initialPrompt: document.getElementById('initialPromptModal'),
    contactModal: document.getElementById('contactModal'),
    logoutModal: document.getElementById('logoutModal'),
    screenBtn: document.getElementById('screenLockButton'),
    keepScreenOnTxt: document.getElementById('keepScreenOnTxt'),
    googleBtn: document.getElementById('googleSignInBtn'),
    passToggle: document.getElementById('togglePasswordVisibility'),
    passInput: document.getElementById('passInput'),
    forgotBtn: document.getElementById('forgotPasswordBtn'),
    forgotModal: document.getElementById('forgotPasswordModal'),
    forgotEmail: document.getElementById('forgotEmailInput'),
    sendReset: document.getElementById('sendResetBtn'),
    cancelReset: document.getElementById('cancelResetBtn'),
    floorSelectorModal: document.getElementById('floorSelectorModal'),
    modalFloorGrid: document.getElementById('modalFloorGrid'),
    settingsFloorGrid: document.getElementById('settingsFloorGrid'),
    // New Session Conflict Modal Elements
    sessionConflictModal: document.getElementById('sessionConflictModal'),
    conflictTitle: document.getElementById('conflictTitle'),
    conflictText: document.getElementById('conflictText'),
    forceLoginBtn: document.getElementById('forceLoginBtn'),
    cancelForceLoginBtn: document.getElementById('cancelForceLoginBtn')
};

// --- HELPER FUNCTIONS (Elevator Logic Moved Up) ---
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

// --- DISPLAY UPDATING FUNCTIONS ---

function updateDashboard() {
    if (!latestElevatorsData) return;
    const sortedIds = Object.keys(latestElevatorsData).sort();
    const visibleIds = sortedIds.filter(id => shouldShowElevator(id));

    const container = ui.dashboard;
    Array.from(container.children).forEach(child => {
            const id = child.id.replace('panel-', '');
            if (!visibleIds.includes(id)) child.remove();
    });

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

    if (lastFloorNum !== null && Math.abs(currentFloorNum - lastFloorNum) > 1) {
        await interpolateAndDisplay(id, lastFloorNum, currentFloorNum, newState);
    } else {
        updateElevatorDisplay(id, newState);
    }
    
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

function updateElevatorDisplay(id, stateData) {
    const t = translations[currentLang];
    
    const labelEl = document.getElementById(`lbl-${id}`);
    if(labelEl) labelEl.textContent = t.dir === 'rtl' ? `מעלית ${id}` : `Elevator ${id}`;
    
    const etaLabel = document.getElementById(`etaLabel-${id}`);
    if(etaLabel) etaLabel.textContent = `${t.etaPrefix} ${THIS_SCREEN_FLOOR}`;
    
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

function calculateAndShowETAFor(id, state) {
    const el = document.getElementById(`eta-${id}`);
    const t = translations[currentLang];
    const config = elevatorConfigs[id];
    
    if (!config || !settings) { el.textContent = "..."; return; }

    const panel = document.getElementById(`panel-${id}`);
    const resetPanelStyle = () => {
        if (panel && panel.classList.contains('approaching')) {
            panel.classList.remove('approaching');
        }
    };
    
    const breakActive = config.SHABBAT_BREAK_ACTIVE || false;
    if (breakActive) {
        const now = new Date(Date.now() + (serverTimeOffset || 0));
        const [startH, startM] = (config.SHABBAT_BREAK_START || "00:00").split(':').map(Number);
        const [endH, endM] = (config.SHABBAT_BREAK_END || "00:00").split(':').map(Number);
        const startTime = new Date(now); startTime.setHours(startH, startM, 0);
        const endTime = new Date(now); endTime.setHours(endH, endM, 0);
        if (now >= startTime && now <= endTime) { 
            el.textContent = t.break; 
            resetPanelStyle();
            return; 
        }
    }

    const userFloorNum = getNumericFloor(THIS_SCREEN_FLOOR);
    const topFloorNum = getNumericFloor(config.TOP_FLOOR ?? settings.TOP_FLOOR);
    const bottomFloorNum = getNumericFloor(config.BOTTOM_FLOOR ?? settings.BOTTOM_FLOOR);

    if (userFloorNum === null) { el.textContent = t.error; return; }

    let stopsUp = config.STOPPING_FLOORS_UP || [];
    let stopsDown = config.STOPPING_FLOORS_DOWN || [];
    
    const canStopUp = stopsUp.length === 0 || stopsUp.map(String).includes(String(THIS_SCREEN_FLOOR));
    const canStopDown = stopsDown.length === 0 || stopsDown.map(String).includes(String(THIS_SCREEN_FLOOR));
    
    if (!canStopUp && !canStopDown) { el.textContent = t.notStopping; return; }

    const elevatorFloorNum = getNumericFloor(state.floor);
    
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
        el.textContent = t.here; 
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
    
    el.textContent = `${mins}:${secs.toString().padStart(2,'0')} ${t.mins}`;
}

// --- INITIALIZATION & AUTH ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded, applying language...");
    applyLanguage();
});

auth.onAuthStateChanged((user) => {
    console.log("Auth state changed:", user ? "Logged In" : "Logged Out");
    if (user) {
        ui.authContainer.style.display = 'none';
        ui.loadingOverlay.style.display = 'flex';
        initializeApp(user);
    } else {
        ui.loadingOverlay.style.display = 'none';
        ui.authContainer.style.display = 'flex';
        ui.displayContainer.style.display = 'none';
        // Cleanup listener if exists
        if (sessionListenerRef) {
            sessionListenerRef.off();
            sessionListenerRef = null;
        }
    }
});

document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passInput').value;
    auth.signInWithEmailAndPassword(email, pass).catch(err => {
        const errEl = document.getElementById('authError');
        errEl.textContent = translations[currentLang].authError;
        errEl.style.display = 'block';
    });
});

ui.googleBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => {
        const errEl = document.getElementById('authError');
        errEl.textContent = translations[currentLang].authError;
        errEl.style.display = 'block';
    });
});

ui.passToggle.addEventListener('click', () => {
    const type = ui.passInput.getAttribute('type') === 'password' ? 'text' : 'password';
    ui.passInput.setAttribute('type', type);
    ui.passToggle.classList.toggle('fa-eye');
    ui.passToggle.classList.toggle('fa-eye-slash');
});

ui.forgotBtn.addEventListener('click', () => { ui.forgotModal.style.display = 'flex'; });
ui.cancelReset.addEventListener('click', () => { ui.forgotModal.style.display = 'none'; });
ui.sendReset.addEventListener('click', () => {
    const email = ui.forgotEmail.value;
    if(!email) return alert('נא להזין אימייל');
    auth.sendPasswordResetEmail(email)
        .then(() => { 
            alert('מייל נשלח בהצלחה.'); 
            ui.forgotModal.style.display = 'none'; 
        })
        .catch(err => alert('שגיאה: ' + err.message));
});

// --- SETTINGS & LOGOUT LOGIC ---
function openLogoutModal() {
    ui.logoutModal.style.display = 'flex';
    populateFloorGrids(THIS_SCREEN_FLOOR);
    tempSelectedFloor = THIS_SCREEN_FLOOR;
}
window.openLogoutModal = openLogoutModal;

function closeLogoutModal() {
    ui.logoutModal.style.display = 'none';
}
window.closeLogoutModal = closeLogoutModal;

function saveSettingsAndClose() {
    const newFloor = tempSelectedFloor;
    const user = auth.currentUser;
    if (user && newFloor !== null) {
        localStorage.setItem('user_default_floor', newFloor);
        database.ref(`users/${user.uid}/settings/defaultFloor`).set(newFloor)
            .then(() => location.reload())
            .catch(err => location.reload());
    } else {
        alert("Please select a floor first.");
    }
}
window.saveSettingsAndClose = saveSettingsAndClose;

// Updated Logout: Remove session from DB
function performLogout() {
    const user = auth.currentUser;
    // Set manual logout flag to true to prevent "Kicked" alert from listener
    isManualLogout = true;
    
    if (user) {
        const userKey = user.email.replace(/\./g, '_');
        const deviceId = getDeviceId();
        // Remove this device from active sessions
        database.ref(`active_sessions/${userKey}/${deviceId}`).remove()
        .finally(() => {
            auth.signOut().then(() => location.reload());
        });
    } else {
        auth.signOut().then(() => location.reload());
    }
}
window.performLogout = performLogout;

// --- APP INITIALIZATION & SESSION CHECK ---
async function initializeApp(user) {
    console.log("Initializing app for user:", user.uid);
    initializeClock();
    applyLanguage();

    try {
        // 1. Session Enforcement
        // This will now throw specific conflict error or return true
        await checkAndEnforceSession(user);

        // 2. Load Configs
        const [sSnap, cSnap] = await Promise.all([
            database.ref('settings').once('value'),
            database.ref('elevator_configs').once('value')
        ]);
        settings = sSnap.val() || {};
        elevatorConfigs = cSnap.val() || {};

        // 3. Floor Logic (Firebase or Local)
        populateFloorGrids(null); // Init empty

        let savedFloor = null;
        try {
            const userSettingsSnap = await database.ref(`users/${user.uid}/settings/defaultFloor`).once('value');
            savedFloor = userSettingsSnap.val();
        } catch (err) {}

        if (!savedFloor) savedFloor = localStorage.getItem('user_default_floor');

        populateFloorGrids(savedFloor);

        if (savedFloor) {
            THIS_SCREEN_FLOOR = savedFloor;
            THIS_SCREEN_FLOOR_NUM = parseInt(THIS_SCREEN_FLOOR, 10);
            startDashboard();
        } else {
            ui.loadingOverlay.style.display = 'none';
            ui.floorSelectorModal.style.display = 'flex';
        }

    } catch (e) {
        console.error("Initialization/Session error:", e);
        
        // Handle Session Conflict (Custom UI)
        if (e.type === "SESSION_CONFLICT") {
            ui.loadingOverlay.style.display = 'none';
            pendingSessionConflict = e.data; // Store data for resolution
            ui.sessionConflictModal.style.display = 'flex';
            return;
        }

        // Handle other errors gracefully
        alert("Error loading data: " + (e.message || e));
        ui.loadingOverlay.style.display = 'none'; // Ensure loader is hidden
    }
}

// --- NEW: SESSION MANAGEMENT LOGIC ---
function getDeviceId() {
    let deviceId = localStorage.getItem('app_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('app_device_id', deviceId);
    }
    return deviceId;
}

// Replaces enforceSessionLimit with logic that throws manageable error object
async function checkAndEnforceSession(user) {
    const userKey = user.email.replace(/\./g, '_');
    const deviceId = getDeviceId();
    
    // Fetch allowed config and current sessions
    const [allowedSnap, sessionsSnap] = await Promise.all([
        database.ref(`allowed_users/${userKey}`).once('value'),
        database.ref(`active_sessions/${userKey}`).once('value')
    ]);

    let maxDevices = 1;
    const allowedData = allowedSnap.val();
    if (allowedData && typeof allowedData === 'object' && allowedData.maxDevices) {
        maxDevices = allowedData.maxDevices;
    }

    const currentSessions = sessionsSnap.val() || {};
    const activeDeviceIds = Object.keys(currentSessions);
    
    // 1. Existing Session
    if (activeDeviceIds.includes(deviceId)) {
        await database.ref(`active_sessions/${userKey}/${deviceId}`).set(firebase.database.ServerValue.TIMESTAMP);
        // Start monitoring this session to detect kicks
        monitorSession(userKey, deviceId);
        return true; 
    }

    // 2. Room Available
    if (activeDeviceIds.length < maxDevices) {
        await database.ref(`active_sessions/${userKey}/${deviceId}`).set(firebase.database.ServerValue.TIMESTAMP);
        // Start monitoring this session to detect kicks
        monitorSession(userKey, deviceId);
        return true;
    }

    // 3. Conflict - Return data needed to resolve it
    throw {
        type: "SESSION_CONFLICT",
        data: {
            userKey: userKey,
            currentDeviceId: deviceId,
            activeSessions: currentSessions // Object: { devId: timestamp, ... }
        }
    };
}

// NEW: Real-time listener for session removal (Kick)
function monitorSession(userKey, deviceId) {
    if (sessionListenerRef) sessionListenerRef.off();
    
    sessionListenerRef = database.ref(`active_sessions/${userKey}/${deviceId}`);
    sessionListenerRef.on('value', (snapshot) => {
        // If data doesn't exist anymore, AND user is logged in, AND it wasn't a manual logout
        if (!snapshot.exists() && auth.currentUser && !isManualLogout) {
            // User was kicked by another device
            alert(translations[currentLang].sessionKicked);
            auth.signOut().then(() => location.reload());
        }
    });
}

// Triggered by "Connect Here" button in modal
function resolveSessionConflict() {
    if (!pendingSessionConflict) return;
    
    const { userKey, currentDeviceId, activeSessions } = pendingSessionConflict;
    
    // Find oldest session
    let oldestDeviceId = null;
    let oldestTime = Infinity;
    
    for (const [devId, timestamp] of Object.entries(activeSessions)) {
        if (timestamp < oldestTime) {
            oldestTime = timestamp;
            oldestDeviceId = devId;
        }
    }

    if (!oldestDeviceId) {
        // Fallback: just force add (shouldn't happen if sessions exist)
        database.ref(`active_sessions/${userKey}/${currentDeviceId}`).set(firebase.database.ServerValue.TIMESTAMP)
            .then(() => location.reload());
        return;
    }

    ui.loadingOverlay.style.display = 'flex';
    ui.sessionConflictModal.style.display = 'none';

    // Remove old, Add new
    const updates = {};
    updates[`active_sessions/${userKey}/${oldestDeviceId}`] = null;
    updates[`active_sessions/${userKey}/${currentDeviceId}`] = firebase.database.ServerValue.TIMESTAMP;
    
    database.ref().update(updates)
        .then(() => {
            console.log("Session conflict resolved. Reloading.");
            location.reload();
        })
        .catch(err => {
            console.error("Failed to resolve session:", err);
            alert("Error updating session: " + err.message);
            location.reload();
        });
}
window.resolveSessionConflict = resolveSessionConflict;

// Triggered by "Cancel" button in modal
function cancelSessionConflict() {
    auth.signOut().then(() => location.reload());
}
window.cancelSessionConflict = cancelSessionConflict;


function startDashboard() {
    console.log("Starting dashboard...");
    database.ref('elevators').on('value', (snapshot) => {
        try {
            latestElevatorsData = snapshot.val() || {};
            updateDashboard(); 
            ui.loadingOverlay.style.display = 'none';
            ui.displayContainer.style.display = 'flex';
        } catch (e) {
            console.error("Error in dashboard update:", e);
            ui.loadingOverlay.style.display = 'none'; // Ensure loader hides even on error
            // Optional: Show error to user if strictly needed
        }
    });
    
    setTimeout(() => { ui.initialPrompt.style.display = 'flex'; }, 1000);
    
    setInterval(() => {
        if (latestElevatorsData) {
            const elevatorIds = Object.keys(latestElevatorsData);
            const visibleElevators = elevatorIds.filter(id => shouldShowElevator(id));
            visibleElevators.forEach(id => {
                if (elevatorStates[id]) calculateAndShowETAFor(id, elevatorStates[id]);
            });
        }
    }, 1000);
}

function saveInitialFloor() {
    const selectedFloor = tempSelectedFloor;
    const user = auth.currentUser;
    
    const proceed = () => {
        ui.floorSelectorModal.style.display = 'none';
        ui.loadingOverlay.style.display = 'flex';
        THIS_SCREEN_FLOOR = selectedFloor;
        THIS_SCREEN_FLOOR_NUM = parseInt(THIS_SCREEN_FLOOR, 10);
        localStorage.setItem('user_default_floor', selectedFloor);
        startDashboard();
    };

    if (user && selectedFloor !== null) {
        database.ref(`users/${user.uid}/settings/defaultFloor`).set(selectedFloor)
        .then(() => proceed())
        .catch(() => proceed());
    } else {
        alert("Please select a floor first.");
    }
}
window.saveInitialFloor = saveInitialFloor;

function populateFloorGrids(selectedFloorValue) {
    let minFloor = Infinity;
    let maxFloor = -Infinity;
    let hasConfigs = false;

    if (elevatorConfigs) {
        Object.values(elevatorConfigs).forEach(config => {
            hasConfigs = true;
            if (config.BOTTOM_FLOOR !== undefined) {
                const b = getNumericFloor(config.BOTTOM_FLOOR);
                if (b !== null && b < minFloor) minFloor = b;
            }
            if (config.TOP_FLOOR !== undefined) {
                const t = getNumericFloor(config.TOP_FLOOR);
                if (t !== null && t > maxFloor) maxFloor = t;
            }
        });
    }

    if (!hasConfigs || minFloor === Infinity || maxFloor === -Infinity) {
        minFloor = -5;
        maxFloor = 40;
    }

    [ui.modalFloorGrid, ui.settingsFloorGrid].forEach(gridContainer => {
        if (!gridContainer) return;
        gridContainer.innerHTML = '';
        
        for (let i = minFloor; i <= maxFloor; i++) {
            const btn = document.createElement('div');
            btn.className = 'floor-option-btn';
            btn.textContent = (i === -1) ? "L (-1)" : i;
            btn.dataset.value = i;
            
            if (selectedFloorValue !== null && String(i) === String(selectedFloorValue)) {
                btn.classList.add('selected');
                tempSelectedFloor = i; 
            }

            btn.onclick = () => {
                Array.from(gridContainer.children).forEach(c => c.classList.remove('selected'));
                btn.classList.add('selected');
                tempSelectedFloor = i;
            };

            gridContainer.appendChild(btn);
        }
    });
}

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
    const timeData = updateJerusalemTime();
    fetchHebrewDate(timeData.dateObj);

    setInterval(() => {
        const td = updateJerusalemTime();
        const timeStr = `${td.hour}:${td.minute}:${td.second}`;
        const dateStr = `${td.dayName}, ${td.day}/${td.month}/${td.year}`;
        
        document.getElementById('statusTime').textContent = timeStr;
        document.getElementById('statusDate').textContent = dateStr;
        document.getElementById('statusHebrewDate').textContent = currentHebrewDateCache;
        if (td.hour === '00' && td.minute === '00' && td.second === '01') {
                fetchHebrewDate(td.dateObj);
        }
    }, 1000);
}

function toggleLanguage() {
    currentLang = (currentLang === 'he') ? 'en' : 'he';
    localStorage.setItem('app_lang', currentLang);
    applyLanguage();
    if (auth.currentUser && ui.displayContainer.style.display !== 'none') {
        ui.initialPrompt.style.display = 'flex';
    }
}
window.toggleLanguage = toggleLanguage;

function applyLanguage() {
    const t = translations[currentLang];
    document.documentElement.lang = currentLang;
    document.documentElement.dir = t.dir;
    
    const controls = document.querySelector('.side-controls-container');
    if(t.dir === 'ltr') controls.style.flexDirection = 'row-reverse';
    else controls.style.flexDirection = 'row';

    document.getElementById('loadingText').textContent = t.loading;
    document.getElementById('loginTitle').textContent = t.loginTitle;
    document.getElementById('loginBtnTxt').textContent = t.loginBtn;
    document.getElementById('googleBtnTxt').textContent = t.googleBtn;
    document.getElementById('emailInput').placeholder = t.email;
    document.getElementById('passInput').placeholder = t.pass;
    document.getElementById('forgotPasswordBtn').textContent = t.forgotPass;

    document.getElementById('headerText').textContent = t.shabbatShalom;
    ui.keepScreenOnTxt.textContent = isScreenLocked ? t.screenActive : t.keepScreen;
    
    const msgEl = document.getElementById('persistentScreenMsg');
    if (isScreenLocked) msgEl.textContent = t.popupCharger;

    document.getElementById('welcomeTitle').textContent = t.welcomeTitle;
    document.getElementById('welcomeText').innerHTML = t.welcomeText;
    document.getElementById('understandBtn').textContent = t.understand;
    document.getElementById('contactTitle').textContent = t.contactTitle;
    document.getElementById('contactPhone').textContent = t.phone;
    document.getElementById('clickHereTxt').textContent = t.clickHere;
    document.getElementById('logoutTitleTxt').textContent = t.settingsTitle;
    document.getElementById('selectFloorLabel').textContent = t.selectFloor;
    document.getElementById('saveSettingsBtn').textContent = t.save;
    document.getElementById('logoutDescTxt').textContent = t.logoutConfirm;
    document.getElementById('confirmLogoutBtn').textContent = t.approve;
    document.getElementById('cancelLogoutBtn').textContent = t.cancel;
    document.getElementById('initialFloorTitle').textContent = t.settingsTitle;
    document.getElementById('initialSelectFloorLabel').textContent = t.selectFloor;
    document.getElementById('initialSaveFloorBtn').textContent = t.save;
    // Session Conflict Modal Texts
    document.getElementById('conflictTitle').textContent = t.sessionConflictTitle;
    document.getElementById('conflictText').innerHTML = t.sessionConflictText;
    document.getElementById('forceLoginBtn').textContent = t.disconnectOldest;
    document.getElementById('cancelForceLoginBtn').textContent = t.stayLoggedOut;

    if (latestElevatorsData) updateDashboard();
}

async function requestScreenLock() {
    const t = translations[currentLang];
    if (!('wakeLock' in navigator)) {
        showNotification(t.popupError);
        return;
    }
    try {
        wakeLockInstance = await navigator.wakeLock.request('screen');
        isScreenLocked = true;
        ui.screenBtn.classList.add('active');
        ui.keepScreenOnTxt.textContent = t.screenActive;
        ui.screenBtn.innerHTML = `<i class="fa-solid fa-check-circle"></i> <span id="keepScreenOnTxt">${t.screenActive}</span>`;
        
        const msgEl = document.getElementById('persistentScreenMsg');
        msgEl.textContent = t.popupCharger;
        msgEl.classList.add('show-persistent');
        
        wakeLockInstance.addEventListener('release', () => {
            isScreenLocked = false;
            wakeLockInstance = null;
            ui.screenBtn.classList.remove('active');
            ui.keepScreenOnTxt.textContent = t.keepScreen;
            ui.screenBtn.innerHTML = `<i class="fas fa-mobile-alt"></i> <span id="keepScreenOnTxt">${t.keepScreen}</span>`;
            msgEl.classList.remove('show-persistent');
        });
    } catch (err) {
        console.error(err);
        showNotification(t.popupError);
    }
}
window.requestScreenLock = requestScreenLock;

function showNotification(msg) {
    ui.notification.textContent = msg;
    ui.notification.classList.add('show');
    setTimeout(() => ui.notification.classList.remove('show'), 5000);
}

// --- MODAL CONTROLS ---
function closeInitialPrompt() { 
    if(ui.initialPrompt) ui.initialPrompt.style.display = 'none'; 
}
window.closeInitialPrompt = closeInitialPrompt;

function openContactModal() {
    if(ui.contactModal) ui.contactModal.style.display = 'flex';
    const canvas = document.getElementById('qrCanvas');
    if (canvas && window.QRCode) {
        const link = "https://wa.me/972525705289";
        QRCode.toCanvas(canvas, link, { width: 180 }, (err) => {});
    }
}
window.openContactModal = openContactModal;

function closeContactModal() { 
    if(ui.contactModal) ui.contactModal.style.display = 'none'; 
}
window.closeContactModal = closeContactModal;

window.onclick = (e) => {
    if (e.target == ui.contactModal) closeContactModal();
}