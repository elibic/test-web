// --- 1. Dynamic Floor Detection (URL Param: ?floor=5) ---
function getFloorFromUrl() {
    // Priority 1: Check Query Params (?floor=5)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('floor')) {
        return urlParams.get('floor');
    }

    // Priority 2: Check Path (/kiosk/5 or /kiosk5)
    const path = window.location.pathname;
    const segments = path.replace(/^\/|\/$/g, '').split('/');
    
    // Look for numeric segment or 'kiosk5'
    for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        // Exact number
        if (!isNaN(segment) && segment.trim() !== '') {
            return segment;
        }
        // 'kiosk5' pattern
        const match = segment.match(/kiosk(\d+)/i);
        if (match) return match[1];
    }
    
    return null;
}

const urlFloor = getFloorFromUrl();
if (urlFloor === null || urlFloor === "") {
    document.getElementById('displayContainer').style.display = 'none';
    const errorScreen = document.getElementById('errorScreen');
    if(errorScreen) errorScreen.style.display = 'flex';
    const bottomLogo = document.querySelector('.bottom-logo');
    if(bottomLogo) bottomLogo.style.display = 'none';
    throw new Error("No floor defined in URL");
}

let THIS_SCREEN_FLOOR = urlFloor;
// Update Page Title
document.title = `מעלית שבת - קומה ${THIS_SCREEN_FLOOR}`;

// --- TIME TRAVEL & DEBUG CONFIG ---
const urlParams = new URLSearchParams(window.location.search);
let SIMULATED_HOURS_OFFSET = 0;
if (urlParams.has('offsetHours')) {
    SIMULATED_HOURS_OFFSET = parseFloat(urlParams.get('offsetHours')) || 0;
    console.log(`Time Travel Active: Jumping ${SIMULATED_HOURS_OFFSET} hours into the future.`);
}

// --- Global Variables ---
const STALE_TIMEOUT = 40000;
const INTERPOLATION_DELAY = 500;

// --- BUG FIX: Detect Public Kiosk Mode on Load ---
// We check if the body has 'weekday-mode' initially (as defined in kiosk_public.html).
const IS_PUBLIC_KIOSK = document.body.classList.contains('weekday-mode');

let WHATSAPP_LINK = "https://wa.me/972525705289"; // Default fallback

let elevatorStates = {}, latestElevatorsData = null, settings = null, elevatorConfigs = null;
let elevatorArrivalTimes = {}; // NEW: Track when elevator arrived at floor 0
let floorAliases = {}; // Floor display name mapping (physical -> alias)
let isShabbatOrHoliday = false, isInitialized = false;

// --- Floor Alias Helper: Returns display name for a physical floor ---
function getFloorDisplayName(physicalFloor) {
    if (physicalFloor === null || physicalFloor === undefined) return '--';
    const key = String(physicalFloor);
    return floorAliases[key] || key;
}
let manualShabbatOverride = false;
let clockInitialized = false;
let serverTimeOffset = null;
let currentJerusalemTime = new Date();
let currentHebrewDateCache = "טוען...";

// --- 2. Initialize Firebase from Config (No Hardcoding) ---
if (typeof firebaseConfig === 'undefined') {
    alert("שגיאה: קובץ קונפיגורציה חסר (firebase-config.js).");
    throw new Error("Missing firebase-config.js");
}

// Use global auth/database if available (from firebase-config.js), else fallback
const auth = window.auth || firebase.auth();
const database = window.database || firebase.database();

// --- Apply Branding from Config ---
function applyBranding() {
    if (!window.appConfig) return;
    const cfg = window.appConfig;

    // Updated: Top Logo from Config
    const mainLogo = document.getElementById('mainLogo');
    if (mainLogo && cfg.branding.logoUrl) {
        mainLogo.src = cfg.branding.logoUrl;
    } else if (mainLogo) {
        mainLogo.style.display = 'none'; // Hide if no URL
    }

    // Bottom Logo
    const poweredBy = document.getElementById('poweredByLogo');
    if (poweredBy && cfg.branding.poweredByUrl) poweredBy.src = cfg.branding.poweredByUrl;

    // Texts in Modal
    const contactTitle = document.getElementById('contactTitle');
    if (contactTitle && cfg.texts.title) contactTitle.textContent = cfg.texts.title; 
    
    const contactPhone = document.getElementById('contactPhoneText');
    if (contactPhone && cfg.texts.contactDisplayPhone) contactPhone.textContent = cfg.texts.contactDisplayPhone;

    // WhatsApp Link
    if (cfg.texts.whatsappLink) WHATSAPP_LINK = cfg.texts.whatsappLink;
}

// Call Branding Init
applyBranding();

// Define UI safely (will populate on load or use getElementById dynamically for safety)
const ui = {
    displayContainer: document.getElementById('displayContainer'),
    notificationPopup: document.getElementById('notificationPopup'),
    clockContainer: document.getElementById('clockContainer'),
    digitalClockPanel: document.getElementById('digitalClockPanel'),
    analogClockWrapper: document.getElementById('analogClockWrapper'),
    analogClockPanel: document.getElementById('analogClockPanel'),
    clockTime: document.getElementById('clockTime'),
    clockDate: document.getElementById('clockDate'),
    clockHebrewDate: document.getElementById('clockHebrewDate'),
    analogClockDate: document.getElementById('analogClockDate'),
    analogClockHebrewDate: document.getElementById('analogClockHebrewDate'),
    hourHand: document.getElementById('hourHand'),
    minuteHand: document.getElementById('minuteHand'),
    secondHand: document.getElementById('secondHand'),
    toggleClockBtn: document.getElementById('toggleClockBtn'),
    contactBtn: document.getElementById('contactBtn'),
    contactModal: document.getElementById('contactModal'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    bottomStatusBar: document.getElementById('bottomStatusBar'), 
    manualShabbatBtn: document.getElementById('manualShabbatBtn'),
};

let isDigitalClock = true;

function showNotification(message, isError = false) {
    if (!ui.notificationPopup) return;
    ui.notificationPopup.textContent = message;
    ui.notificationPopup.style.backgroundColor = isError ? '#ef4444' : '#E6C25F';
    ui.notificationPopup.style.color = isError ? '#fff' : '#0f172a';
    ui.notificationPopup.classList.add('show');
    setTimeout(() => ui.notificationPopup.classList.remove('show'), 4000);
}

if(ui.displayContainer) ui.displayContainer.style.display = 'flex';

// --- Auth Logic ---
auth.onAuthStateChanged((user) => {
    if (user) {
        initializeAppLogic();
    } else {
        auth.signInAnonymously().catch((error) => {
            console.error("Anonymous auth failed:", error);
            showNotification("שגיאת התחברות לשרת", true);
        });
    }
});

function updateJerusalemTime() {
    if (serverTimeOffset === null) return null;
    
    // --- TIME TRAVEL APPLIED HERE ---
    // We add the offset hours to the visual clock
    const now = new Date(Date.now() + serverTimeOffset + (SIMULATED_HOURS_OFFSET * 60 * 60 * 1000));
    
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
    currentJerusalemTime = new Date(Date.UTC(year, month, day, hour, minute, second));
    const dayNameHe = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long' }).format(now);
    return {
        dateObj: currentJerusalemTime, dayName: dayNameHe,
        day: String(day).padStart(2, '0'), month: String(month + 1).padStart(2, '0'), year: String(year),
        hour: String(hour).padStart(2, '0'), minute: String(minute).padStart(2, '0'), second: String(second).padStart(2, '0'),
        rawHour: hour
    };
}

async function syncServerTime() {
    try {
        const offsetRef = database.ref('.info/serverTimeOffset');
        const snapshot = await offsetRef.once('value');
        serverTimeOffset = snapshot.val() || 0;
    } catch (error) { serverTimeOffset = 0; }
}

async function initializeClock() {
    if (clockInitialized) return;
    await syncServerTime();
    clockInitialized = true;
    const timeData = updateJerusalemTime();
    if (timeData) { await fetchHebrewDate(timeData.dateObj); updateClockDisplay(); }
    setInterval(updateClockDisplay, 1000);
    setInterval(syncServerTime, 3600000);
}

function updateClockDisplay() {
    const timeData = updateJerusalemTime();
    if (!timeData) return;
    
    // --- UPDATED: Show ONLY Hours and Minutes (Clean Look) ---
    // Was: ${timeData.hour}:${timeData.minute}:${timeData.second}
    const timeString = `${timeData.hour}:${timeData.minute}`; 
    const dateString = `${timeData.dayName}, ${timeData.day}/${timeData.month}/${timeData.year}`;
    
    // Safety checks for elements that might not exist in all Kiosk types
    if(ui.clockTime) ui.clockTime.textContent = timeString;
    if(ui.clockDate) ui.clockDate.textContent = dateString;
    if(ui.analogClockDate) ui.analogClockDate.textContent = dateString;
    
    updateAnalogClock(timeData.rawHour, parseInt(timeData.minute), parseInt(timeData.second));
    
    const statusTime = document.getElementById('statusTime');
    const statusDate = document.getElementById('statusDate');
    if (statusTime && statusDate) { statusTime.textContent = timeString; statusDate.textContent = dateString; }
    
    if (timeData.second === '00' || (ui.clockHebrewDate && ui.clockHebrewDate.textContent === "טוען תאריך עברי...")) {
        fetchHebrewDate(timeData.dateObj);
    } else {
        if(ui.clockHebrewDate) ui.clockHebrewDate.textContent = currentHebrewDateCache;
        if(ui.analogClockHebrewDate) ui.analogClockHebrewDate.textContent = currentHebrewDateCache;
        const statusHebrewDateEl = document.getElementById('statusHebrewDate');
        if (statusHebrewDateEl) statusHebrewDateEl.textContent = currentHebrewDateCache;
    }
}

function updateAnalogClock(hours, minutes, seconds) {
    // --- FIX: Removed +90 offset because CSS transform-origin is at bottom ---
    // 0 degrees = 12 o'clock
    const secondsDegrees = ((seconds / 60) * 360);
    const minutesDegrees = ((minutes / 60) * 360) + ((seconds/60)*6);
    const hour12 = hours % 12;
    const hoursDegrees = ((hour12 / 12) * 360) + ((minutes/60)*30);
    
    // --- PERFORMANCE OPTIMIZATION: Do not update second hand (Hidden by CSS) ---
    // if (ui.secondHand) ui.secondHand.style.transform = `rotate(${secondsDegrees}deg)`;
    
    if (ui.minuteHand) ui.minuteHand.style.transform = `rotate(${minutesDegrees}deg)`;
    if (ui.hourHand) ui.hourHand.style.transform = `rotate(${hoursDegrees}deg)`;
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
            if(ui.clockHebrewDate) ui.clockHebrewDate.textContent = currentHebrewDateCache;
            if(ui.analogClockHebrewDate) ui.analogClockHebrewDate.textContent = currentHebrewDateCache;
            const statusHebrewDateEl = document.getElementById('statusHebrewDate');
            if (statusHebrewDateEl) statusHebrewDateEl.textContent = currentHebrewDateCache;
        }
    } catch (error) {}
}

// Event Listeners (Check existence first)
if(ui.toggleClockBtn) {
    ui.toggleClockBtn.addEventListener('click', () => {
        isDigitalClock = !isDigitalClock;
        if(ui.digitalClockPanel) ui.digitalClockPanel.style.display = isDigitalClock ? 'block' : 'none';
        if(ui.analogClockWrapper) ui.analogClockWrapper.style.display = isDigitalClock ? 'none' : 'flex';
    });
}

let qrCodeGenerated = false;
if(ui.contactBtn) {
    ui.contactBtn.addEventListener('click', () => {
        if(ui.contactModal) ui.contactModal.classList.add('show');
        if (!qrCodeGenerated) {
            const qrCanvas = document.getElementById('whatsappQRContainer');
            if (qrCanvas) {
                QRCode.toCanvas(qrCanvas, WHATSAPP_LINK, { errorCorrectionLevel: 'H', width: 200, margin: 1 }, function (error) { if (!error) qrCodeGenerated = true; });
            }
        }
    });
}

if(ui.modalCloseBtn) {
    ui.modalCloseBtn.addEventListener('click', () => {
        if(ui.contactModal) ui.contactModal.classList.remove('show');
    });
}

window.addEventListener('click', (event) => { 
    if (ui.contactModal && event.target == ui.contactModal) {
        ui.contactModal.classList.remove('show'); 
    }
});

if(ui.manualShabbatBtn) {
    ui.manualShabbatBtn.addEventListener('click', () => {
        manualShabbatOverride = !manualShabbatOverride;
        ui.manualShabbatBtn.style.color = manualShabbatOverride ? '#FCD34D' : '#C2A153';
        ui.manualShabbatBtn.style.borderColor = manualShabbatOverride ? '#FCD34D' : 'rgba(255,255,255,0.3)';
        checkShabbatStatus(); 
    });
}

function shouldShowElevator(elevatorId) {
    const floorToCheck = THIS_SCREEN_FLOOR;
    if (!floorToCheck) return true;
    const config = elevatorConfigs[elevatorId];
    if (!config) return true;
    
    // SHABBAT_ACTIVE=false: On public kiosk show anyway, on other screens hide
    if (config.SHABBAT_ACTIVE === false) {
        if (!IS_PUBLIC_KIOSK) return false;
        // Public kiosk: continue to visibility check (will show without ETA)
    }
    
    if (config.VISIBLE_FLOORS && config.VISIBLE_FLOORS.length > 0) {
        if (config.VISIBLE_FLOORS.includes('*')) return true;
        return config.VISIBLE_FLOORS.map(String).includes(String(floorToCheck));
    }
    if (config.STOPPING_FLOORS) return config.STOPPING_FLOORS.map(String).includes(String(floorToCheck));
    return true;
}

async function initializeAppLogic() {
    if (isInitialized) { renderFullDisplay(); return; }
    isInitialized = true;
    await initializeClock();
    try {
        const [settingsSnapshot, configsSnapshot, elevatorsSnapshot] = await Promise.all([
            database.ref('settings').once('value'),
            database.ref('elevator_configs').once('value'),
            database.ref('elevators').once('value')
        ]);
        settings = settingsSnapshot.val() || {};
        floorAliases = settings.FLOOR_ALIASES || {};
        elevatorConfigs = configsSnapshot.val() || {};
        latestElevatorsData = elevatorsSnapshot.val() || {};
        await checkShabbatStatus();
        
        // Initial Render
        if (isShabbatOrHoliday) renderFullDisplay();
        // Force render if it's the public kiosk (which always shows)
        if (document.body.classList.contains('weekday-mode')) renderFullDisplay();

        database.ref('settings').on('value', (snapshot) => { 
            settings = snapshot.val() || {};
            floorAliases = settings.FLOOR_ALIASES || {};
            if(isShabbatOrHoliday || document.body.classList.contains('weekday-mode')) renderFullDisplay(); 
        });
        
        // --- BUG FIX: Use snapshot.val() instead of stale configsSnapshot ---
        database.ref('elevator_configs').on('value', (snapshot) => { 
            elevatorConfigs = snapshot.val() || {}; // FIXED HERE
            if(isShabbatOrHoliday || document.body.classList.contains('weekday-mode')) renderFullDisplay(); 
        });
        
        database.ref('elevators').on('value', (snapshot) => { 
            latestElevatorsData = snapshot.val() || {}; 
            if(isShabbatOrHoliday || document.body.classList.contains('weekday-mode')) renderFullDisplay(); 
        });

        setInterval(checkShabbatStatus, 300000); // Check every 5 minutes
        setInterval(() => {
            if ((isShabbatOrHoliday || document.body.classList.contains('weekday-mode')) && latestElevatorsData) {
                const elevatorIds = Object.keys(latestElevatorsData);
                const visibleElevators = elevatorIds.filter(id => shouldShowElevator(id));
                visibleElevators.forEach(id => {
                    if (elevatorStates[id]) calculateAndShowETAFor(id, elevatorStates[id]);
                });
            }
        }, 1000); 

    } catch (error) { console.error("Error init app", error); }
}

function renderFullDisplay() { 
    if (!THIS_SCREEN_FLOOR || !settings || !elevatorConfigs) return;
    
    // Check if we should render (Shabbat OR Public Kiosk mode)
    if (!isShabbatOrHoliday && !document.body.classList.contains('weekday-mode')) return;

    const elevatorIds = latestElevatorsData ? Object.keys(latestElevatorsData) : [];
    const visibleElevators = elevatorIds.filter(id => shouldShowElevator(id));
    if (visibleElevators.length === 0 && document.querySelector('.dashboard-container').innerHTML === '') return;
    if (latestElevatorsData) {
        createElevatorPanels(visibleElevators);
        visibleElevators.forEach(id => {
            if (latestElevatorsData[id]) processElevatorUpdate(id, latestElevatorsData[id]);
        });
    }
}

// --- 3. Robust Shabbat & Holiday Logic (Dual-Check: Israel + Diaspora) ---
async function checkShabbatStatus() {
    let wasShabbat = isShabbatOrHoliday;
    
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.has('test') || manualShabbatOverride) {
        isShabbatOrHoliday = true;
        if (isShabbatOrHoliday !== wasShabbat || !isInitialized) updateDisplayMode();
        return;
    }

    let timeOffsetHours = 0;
    if (urlParams.has('offsetHours')) {
        timeOffsetHours = parseFloat(urlParams.get('offsetHours')) || 0;
    }

    if (settings && settings.GEO_NAME_ID) {
        try {
            const now = new Date(Date.now() + (serverTimeOffset || 0) + (timeOffsetHours * 60 * 60 * 1000));
            
            // --- CONTEXT SETUP ---
            let queryDate = new Date(now);
            queryDate.setDate(queryDate.getDate() - 1); // Always look back to catch events starting yesterday
            
            const year = queryDate.getFullYear();
            const month = queryDate.getMonth() + 1;
            const day = queryDate.getDate();

            // --- FETCH 1: PRIMARY (Israel) - Accurate Times ---
            const urlIsrael = `https://www.hebcal.com/shabbat?cfg=json&geonameid=${settings.GEO_NAME_ID}&M=on&tzid=Asia/Jerusalem&b=1&gy=${year}&gm=${month}&gd=${day}`;
            
            // --- FETCH 2: SECONDARY (Diaspora) - For 2nd Day Yom Tov ---
            // No geonameid = Diaspora calendar. i=off is default but explicit here.
            const urlDiaspora = `https://www.hebcal.com/shabbat?cfg=json&i=off&tzid=Asia/Jerusalem&b=1&gy=${year}&gm=${month}&gd=${day}`;

            // Fetch both in parallel
            const [respIsrael, respDiaspora] = await Promise.all([fetch(urlIsrael), fetch(urlDiaspora)]);
            
            if (!respIsrael.ok) throw new Error('Israel Network response was not ok');
            const dataIsrael = await respIsrael.json();
            
            let dataDiaspora = { items: [] };
            if (respDiaspora.ok) dataDiaspora = await respDiaspora.json();

            if (SIMULATED_HOURS_OFFSET !== 0) {
                console.log(`[TimeTravel] Simulated: ${now.toLocaleString()}`);
            }

            let isCurrentlyShabbat = false;
            const nowMs = now.getTime();

            // --- HELPER: Check Inside Window ---
            const checkWindows = (items) => {
                if (!items || items.length === 0) return false;
                
                const startTimes = items
                    .filter(item => item.category === 'candles' || (item.category === 'holiday' && item.yomtov))
                    .map(item => new Date(item.date).getTime() - (100 * 60 * 1000)); // Start -60min

                const endTimes = items
                    .filter(item => item.category === 'havdalah')
                    .map(item => new Date(item.date).getTime() + (60 * 60 * 1000)); // End +60min

                const activeStart = startTimes.filter(t => t <= nowMs).sort((a,b) => b-a)[0];
                
                if (activeStart) {
                    const relevantEnd = endTimes.filter(t => t > activeStart).sort((a,b) => a-b)[0];
                    if (relevantEnd) {
                        return (nowMs <= relevantEnd);
                    } else {
                        // Safety: Started < 26h ago?
                        return (nowMs - activeStart < (26 * 60 * 60 * 1000));
                    }
                }
                return false;
            };

            // 1. Check Israel (Primary)
            isCurrentlyShabbat = checkWindows(dataIsrael.items);
            
            if (SIMULATED_HOURS_OFFSET !== 0) {
                console.log(`[TimeTravel] Israel Status: ${isCurrentlyShabbat}`);
            }

            // 2. If Israel says NO, Check Diaspora (Secondary)
            if (!isCurrentlyShabbat) {
                // Check if TODAY is a Holiday in Diaspora feed
                const todayStr = now.toISOString().split('T')[0];
                const isDiasporaHolidayToday = dataDiaspora.items.some(item => 
                    item.category === 'holiday' && 
                    item.yomtov && 
                    item.date.startsWith(todayStr)
                );

                if (isDiasporaHolidayToday) {
                    isCurrentlyShabbat = true;
                    if (SIMULATED_HOURS_OFFSET !== 0) console.log(`[TimeTravel] Diaspora Override: ACTIVATED (Yom Tov Sheni)`);
                }
            }
            
            isShabbatOrHoliday = isCurrentlyShabbat;

        } catch (error) { 
            console.error("Shabbat Check Error:", error);
            isShabbatOrHoliday = wasShabbat;
        }
    } else { 
        isShabbatOrHoliday = false; 
    }
    
    if (isShabbatOrHoliday !== wasShabbat || !isInitialized) updateDisplayMode();
}

function updateDisplayMode() {
    document.body.classList.toggle('shabbat-mode-active', isShabbatOrHoliday);
    
    // --- FIX: Only toggle weekday mode if this is explicitly a Public Kiosk ---
    if (IS_PUBLIC_KIOSK) {
        document.body.classList.toggle('weekday-mode', !isShabbatOrHoliday);
    } else {
        document.body.classList.remove('weekday-mode');
    }

    if (ui.clockContainer) ui.clockContainer.style.display = isShabbatOrHoliday ? 'none' : 'flex';
    if (ui.toggleClockBtn) ui.toggleClockBtn.style.display = isShabbatOrHoliday ? 'none' : 'block';
    
    // Bottom bar is always on for public, conditional for others
    if (ui.bottomStatusBar) {
        if (!document.querySelector('script[src*="kiosk_public"]')) { 
             ui.bottomStatusBar.style.display = isShabbatOrHoliday ? 'block' : 'none';
        }
    }
    
    const dash = document.querySelector('.dashboard-container');
    if (dash) dash.style.display = (isShabbatOrHoliday || document.body.classList.contains('weekday-mode')) ? 'flex' : 'none';
    
    if (isShabbatOrHoliday || document.body.classList.contains('weekday-mode')) renderFullDisplay();
}

async function processElevatorUpdate(id, newData) {
    const currentState = elevatorStates[id] || {};
    const lastFloorNum = getNumericFloor(currentState.floor);
    const currentFloorNum = getNumericFloor(newData.floor);
    if (currentFloorNum === null) return;
    
    // --- PHANTOM UPDATE GUARD (LOGICAL FIX) ---
    // If the floor hasn't changed, ignore this update to prevent timestamp reset.
    // This solves the bug where elevator B updates cause elevator A's timer to restart.
    if (currentState.floor === newData.floor) return;

    // --- SMART TIMER LOGIC START ---
    // If arriving at 0, or just loaded app at 0 -> Start Timer
    if (currentFloorNum === 0) {
        if (lastFloorNum !== 0 || !elevatorArrivalTimes[id]) {
            // Use server time for consistency
            const now = Date.now() + (serverTimeOffset || 0);
            // console.log(`Elevator ${id} arrived at 0. Starting timer.`); // Log removed for production
            elevatorArrivalTimes[id] = now;
        }
    } else {
        // Not at 0 -> Reset Timer
        if (elevatorArrivalTimes[id]) {
            delete elevatorArrivalTimes[id];
        }
    }
    // --- SMART TIMER LOGIC END ---

    const config = elevatorConfigs[id] || {};
    const topFloorNum = getNumericFloor(config.TOP_FLOOR ?? settings.TOP_FLOOR);
    const bottomFloorNum = getNumericFloor(config.BOTTOM_FLOOR ?? settings.BOTTOM_FLOOR);
    if (currentState.timeoutId) clearTimeout(currentState.timeoutId);
    
    let newDirection = currentState.direction || 'stopped';
    if (currentFloorNum === topFloorNum || currentFloorNum === bottomFloorNum) newDirection = 'stopped';
    else if (lastFloorNum !== null && currentFloorNum !== lastFloorNum) newDirection = (currentFloorNum > lastFloorNum) ? 'up' : 'down';

    // --- CRITICAL FIX: Timestamp Preservation ---
    // Use server time for consistency
    const currentServerTime = Date.now() + (serverTimeOffset || 0);

    const newState = {
        floor: newData.floor,
        direction: newDirection,
        timestamp: currentServerTime, // Always use new time because we guarded against same-floor updates
        timeoutId: setTimeout(() => {
            const timedOutState = elevatorStates[id];
            const now = Date.now() + (serverTimeOffset || 0);
            if (timedOutState && (now - timedOutState.timestamp >= STALE_TIMEOUT)) {
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
    if (typeof calculateAndShowETAFor === 'function') calculateAndShowETAFor(id, newState);
}

async function interpolateAndDisplay(elevatorId, startNum, endNum, finalState) {
    const step = (endNum > startNum) ? 1 : -1;
    const direction = (step > 0) ? 'up' : 'down';
    
    // --- ISOLATED FLOOR MAP (VISUAL FIX) ---
    // Instead of iterating ALL elevators (Object.values), we only use THIS elevator's config.
    // This prevents floor name collisions (e.g. A has 'L' for 0, B has 'P' for 0).
    const allFloorsMap = new Map();
    const config = elevatorConfigs ? elevatorConfigs[elevatorId] : null;

    if (config && config.STOPPING_FLOORS) {
        config.STOPPING_FLOORS.forEach(floor => {
            allFloorsMap.set(getNumericFloor(floor), floor);
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

function createElevatorPanels(elevatorIds) {
    const container = document.querySelector('.dashboard-container');
    const currentPanels = new Set(Array.from(container.children).map(child => child.id));
    const newPanelIds = new Set(elevatorIds.map(id => `panel-${id}`));
    if (new Set([...currentPanels, ...newPanelIds]).size === currentPanels.size && currentPanels.size === newPanelIds.size) return;
    
    container.innerHTML = '';
    elevatorIds.sort().forEach(id => {
        const panel = document.createElement('div');
        panel.className = 'elevator-panel';
        panel.id = `panel-${id}`;
        // Dynamic Elevator Name Logic
        let elevatorName = `מעלית ${id}`;
        if (window.appConfig && window.appConfig.elevatorNames && window.appConfig.elevatorNames[id]) {
            elevatorName = window.appConfig.elevatorNames[id].he || elevatorName;
        }

        panel.innerHTML = `
            <div class="panel-side-floor">
                <div class="floor-indicator" id="floorNumber-${id}">--</div>
            </div>
            
            <div class="panel-side-info">
                <div class="floor-label elevator-id">${elevatorName}</div>
                
                <div class="direction-status">
                    <svg id="arrowIcon-${id}" class="elevator-arrow-svg" viewBox="0 0 24 24" style="display:none;">
                        <path class="elevator-arrow-path" d="M12 4 L22 20 L2 20 Z" />
                    </svg>
                    <svg id="stopIcon-${id}" class="stop-status-svg" viewBox="0 0 100 100" style="display:none;">
                        <circle class="stop-ring" cx="50" cy="50" r="45" />
                        <g class="stop-bars"> 
                            <rect x="38" y="30" width="8" height="40" rx="2" />
                            <rect x="54" y="30" width="8" height="40" rx="2" />
                        </g>
                    </svg>
                </div>

                <div class="eta-display">
                    <div class="floor-label" id="etaLabel-${id}">המעלית תגיע לקומה ${getFloorDisplayName(THIS_SCREEN_FLOOR)} בעוד</div>
                    <div class="eta-result" id="etaResult-${id}">...</div>
                </div>
            </div>
        `;
        container.appendChild(panel);
    });
}

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
        if (endFloor > startFloor) { return sortedStops.filter(f => f > startFloor && f < endFloor).length; } // Fixed in previous versions
        else { return sortedStops.filter(f => f < startFloor && f > endFloor).length; } // Fixed in previous versions
}

function calculateAndShowETAFor(elevatorId, elevatorState) {
    // --- FIX: USE CORRECT VARIABLE 'etaResultElement' IN KIOSK-LOGIC ---
    const etaResultElement = document.getElementById(`etaResult-${elevatorId}`);
    if (!etaResultElement) return;
    
    // --- ADDED: Get the label element to control visibility ---
    const etaLabel = document.getElementById(`etaLabel-${elevatorId}`);

    const panel = document.getElementById(`panel-${elevatorId}`);
    const resetPanelStyle = () => {
        if (panel && panel.classList.contains('approaching')) {
            panel.classList.remove('approaching');
        }
    };
    
    // --- UPDATED LOGIC: Disable ETA & Flashing on Weekdays (Preserved from Kiosk) ---
    if (!isShabbatOrHoliday) { 
        etaResultElement.textContent = ""; 
        resetPanelStyle(); 
        return; 
    }
    
    const elevatorConfig = elevatorConfigs[elevatorId];
    
    // --- SHABBAT_ACTIVE=false: Hide ETA even during Shabbat (public kiosk shows panel but no ETA) ---
    if (elevatorConfig && elevatorConfig.SHABBAT_ACTIVE === false) {
        etaResultElement.textContent = "";
        if(etaLabel) etaLabel.style.visibility = 'hidden';
        resetPanelStyle();
        return;
    }
    
    if (!elevatorState || !elevatorConfig || !settings) { 
        etaResultElement.textContent = "..."; 
        resetPanelStyle();
        return; 
    }
    
    // Ensure label is visible by default for normal ETA
    if(etaLabel) etaLabel.style.visibility = 'visible';

    const breakActive = elevatorConfig.SHABBAT_BREAK_ACTIVE || false;
    // --- תמיכה בריבוי הפסקות + תמיכה לאחור ---
    if (breakActive) {
        const now = new Date(Date.now() + (serverTimeOffset || 0));
        let inBreak = false;

        // 1. בדיקת מערך ההפסקות החדש (SHABBAT_BREAKS)
        if (Array.isArray(elevatorConfig.SHABBAT_BREAKS) && elevatorConfig.SHABBAT_BREAKS.length > 0) {
            for (const brk of elevatorConfig.SHABBAT_BREAKS) {
                if (!brk.start || !brk.end) continue;
                const [startH, startM] = brk.start.split(':').map(Number);
                const [endH, endM] = brk.end.split(':').map(Number);
                const startTime = new Date(now); startTime.setHours(startH, startM, 0);
                const endTime = new Date(now); endTime.setHours(endH, endM, 0);
                if (now >= startTime && now <= endTime) {
                    inBreak = true;
                    break; 
                }
            }
        }
        // 2. בדיקת פורמט ישן (Fallback)
        else if (elevatorConfig.SHABBAT_BREAK_START && elevatorConfig.SHABBAT_BREAK_END) {
            const [startH, startM] = elevatorConfig.SHABBAT_BREAK_START.split(':').map(Number);
            const [endH, endM] = elevatorConfig.SHABBAT_BREAK_END.split(':').map(Number);
            const startTime = new Date(now); startTime.setHours(startH, startM, 0);
            const endTime = new Date(now); endTime.setHours(endH, endM, 0);
            if (now >= startTime && now <= endTime) {
                inBreak = true;
            }
        }

        if (inBreak) {
            etaResultElement.textContent = "מצב שבת בהפסקה";
            if(etaLabel) etaLabel.style.visibility = 'hidden'; // Hide label
            resetPanelStyle();
            return;
        }
    }

    const userFloorNum = getNumericFloor(THIS_SCREEN_FLOOR);
    const topFloorNum = getNumericFloor(elevatorConfig.TOP_FLOOR ?? settings.TOP_FLOOR);
    const bottomFloorNum = getNumericFloor(elevatorConfig.BOTTOM_FLOOR ?? settings.BOTTOM_FLOOR);

    if (userFloorNum === null) { etaResultElement.textContent = "שגיאה"; return; }
    
    let stopsUp = elevatorConfig.STOPPING_FLOORS_UP || [];
    let stopsDown = elevatorConfig.STOPPING_FLOORS_DOWN || [];
    
    const canStopUp = stopsUp.length === 0 || stopsUp.map(String).includes(String(THIS_SCREEN_FLOOR));
    const canStopDown = stopsDown.length === 0 || stopsDown.map(String).includes(String(THIS_SCREEN_FLOOR));
    
    if (!canStopUp && !canStopDown) { 
        etaResultElement.textContent = "לא עוצרת בקומה זו"; 
        if(etaLabel) etaLabel.style.visibility = 'hidden'; // Hide label
        return; 
    }

    const elevatorFloorNum = getNumericFloor(elevatorState.floor);
    
    let isHereAndStopping = false;
    if (userFloorNum === elevatorFloorNum) {
            if (elevatorState.direction === 'stopped' || elevatorState.direction === ' ') {
                isHereAndStopping = true;
            }
            else if (elevatorState.direction === 'up' && canStopUp) {
                isHereAndStopping = true;
            }
            else if (elevatorState.direction === 'down' && canStopDown) {
                isHereAndStopping = true;
            }
    }

    if (isHereAndStopping) { 
        etaResultElement.textContent = "המעלית כאן"; 
        if(etaLabel) etaLabel.style.visibility = 'hidden'; // Hide label

        if (panel && !panel.classList.contains('approaching')) {
            panel.classList.add('approaching');
        }
        return; 
    }
    
    let effectiveDirection = elevatorState.direction;
    if (effectiveDirection === 'stopped' || effectiveDirection === ' ') {
        if (elevatorFloorNum === bottomFloorNum) effectiveDirection = 'up';
        else if (elevatorFloorNum === topFloorNum) effectiveDirection = 'down';
        else effectiveDirection = 'up';
    }
    
    const timePerFloor = parseFloat(elevatorConfig.TIME_PER_FLOOR ?? settings.TIME_PER_FLOOR ?? 0); 
    let timePassFloor = parseFloat(elevatorConfig.TIME_PASS_FLOOR || 0);
    if (timePassFloor === 0) {
            const expressTimeUp = parseFloat(elevatorConfig.EXPRESS_TIME_UP ?? settings.EXPRESS_TIME_UP ?? 0);
            const totalTravelDistance = Math.abs(topFloorNum - bottomFloorNum) || 1;
            if(expressTimeUp > 0) timePassFloor = expressTimeUp / totalTravelDistance;
    }
    
    const zeroWaitActive = elevatorConfig.ZERO_FLOOR_WAIT_ACTIVE || false;
    const zeroWaitSeconds = parseFloat(elevatorConfig.ZERO_FLOOR_WAIT_SECONDS || 0);
    const zeroFloorWait = zeroWaitActive ? zeroWaitSeconds : 0;
    const zeroFloorNum = 0;

    // --- HELPER: Calc Segment ---
    const calcSegmentTime = (start, end, dir) => {
        const list = (dir === 'up') ? stopsUp : stopsDown;
        let stopsCount = countStopsInList(start, end, list);
        const steps = Math.abs(end - start);
        if (steps === 0) return 0;
        
        let time = 0;
        // const crossesZero = (start < zeroFloorNum && end > zeroFloorNum) || (start > zeroFloorNum && end < zeroFloorNum);
        
        // --- Note: Removed "crossesZero" check because addZeroWaitIfNeeded handles the turnaround explicitly.
        // Standard traversal through 0 is handled by steps/stopsCount.
        
        const passCount = steps - stopsCount; 
        time += (stopsCount * timePerFloor) + (passCount * timePassFloor);
        return time;
    };
    
    // --- HELPER: Add Zero Wait if path crosses 0 (Used for turnarounds) ---
    const addZeroWaitIfNeeded = (turnAroundFloor) => {
        if (turnAroundFloor === zeroFloorNum && zeroFloorWait > 0) {
            return zeroFloorWait;
        }
        return 0;
    };

    let totalSeconds = 0;
    let isDirectPath = false; // FIX: Track if path is direct

    try {
        // --- 3. REFACTORED PATH LOGIC (Smart Direction & Stop Checking) ---
        // Ported from script.js to fix directional stop bugs
        
        if (effectiveDirection === 'up') {
            // --- ELEVATOR IS MOVING UP ---
            if (userFloorNum > elevatorFloorNum) {
                // User is ABOVE elevator
                if (canStopUp) {
                    // Scenario: Moving UP towards user, can stop UP.
                    // Path: Direct UP.
                    totalSeconds = calcSegmentTime(elevatorFloorNum, userFloorNum, 'up');
                    isDirectPath = true; // Direct approach
                } else {
                    // Scenario: Moving UP towards user, CANNOT stop UP (e.g., skip floor).
                    // Path: Continue UP to TOP -> DOWN to user.
                    totalSeconds = calcSegmentTime(elevatorFloorNum, topFloorNum, 'up');
                    totalSeconds += calcSegmentTime(topFloorNum, userFloorNum, 'down');
                }
            } else {
                // User is BELOW elevator (Elevator moving away UP)
                if (canStopDown) {
                    // Scenario: Elevator goes UP to TOP, then DOWN to user.
                    totalSeconds = calcSegmentTime(elevatorFloorNum, topFloorNum, 'up');
                    totalSeconds += calcSegmentTime(topFloorNum, userFloorNum, 'down');
                } else {
                    // Scenario: Elevator goes UP to TOP, DOWN to BOTTOM (skipping user), then UP to user.
                    totalSeconds = calcSegmentTime(elevatorFloorNum, topFloorNum, 'up');
                    totalSeconds += calcSegmentTime(topFloorNum, bottomFloorNum, 'down');
                    totalSeconds += addZeroWaitIfNeeded(bottomFloorNum); // Wait at bottom
                    totalSeconds += calcSegmentTime(bottomFloorNum, userFloorNum, 'up');
                }
            }
        } else {
            // --- ELEVATOR IS MOVING DOWN ---
            if (userFloorNum < elevatorFloorNum) {
                // User is BELOW elevator
                if (canStopDown) {
                    // Scenario: Moving DOWN towards user, can stop DOWN.
                    // Path: Direct DOWN.
                    totalSeconds = calcSegmentTime(elevatorFloorNum, userFloorNum, 'down');
                    isDirectPath = true; // Direct approach
                } else {
                    // Scenario: Moving DOWN towards user, CANNOT stop DOWN.
                    // Path: Continue DOWN to BOTTOM -> UP to user.
                    totalSeconds = calcSegmentTime(elevatorFloorNum, bottomFloorNum, 'down');
                    totalSeconds += addZeroWaitIfNeeded(bottomFloorNum); // Wait at bottom
                    totalSeconds += calcSegmentTime(bottomFloorNum, userFloorNum, 'up');
                }
            } else {
                // User is ABOVE elevator (Elevator moving away DOWN)
                if (canStopUp) {
                    // Scenario: Elevator goes DOWN to BOTTOM, then UP to user.
                    totalSeconds = calcSegmentTime(elevatorFloorNum, bottomFloorNum, 'down');
                    totalSeconds += addZeroWaitIfNeeded(bottomFloorNum); // Wait at bottom
                    totalSeconds += calcSegmentTime(bottomFloorNum, userFloorNum, 'up');
                } else {
                    // Scenario: Elevator goes DOWN to BOTTOM, UP to TOP (skipping user), then DOWN to user.
                    totalSeconds = calcSegmentTime(elevatorFloorNum, bottomFloorNum, 'down');
                    totalSeconds += addZeroWaitIfNeeded(bottomFloorNum); // Wait at bottom
                    totalSeconds += calcSegmentTime(bottomFloorNum, topFloorNum, 'up');
                    totalSeconds += calcSegmentTime(topFloorNum, userFloorNum, 'down');
                }
            }
        }

        // --- SMART TIMER APPLICATION FOR FLOOR 0 (Fixed Double Counting) ---
        if (elevatorFloorNum === zeroFloorNum && zeroWaitActive) {
            if (elevatorState.direction !== 'stopped' && elevatorState.direction !== ' ') {
                 // Moving? No wait.
            } else {
                 const now = Date.now() + (serverTimeOffset || 0);
                 const arrivalTime = elevatorArrivalTimes[elevatorId] || now;
                 const snapshotTime = elevatorState.timestamp || now;
                 
                 const timeSpentInZero = (snapshotTime - arrivalTime) / 1000;
                 const remainingWait = Math.max(0, zeroWaitSeconds - timeSpentInZero);
                 
                 totalSeconds += remainingWait;
            }
        }
        
        // --- ADDED: Waiting Time at Current Floor (Starting Delay) ---
        const currentFloorStopList = (effectiveDirection === 'up') ? stopsUp : stopsDown;
        const currentFloorIsStop = currentFloorStopList.map(getNumericFloor).includes(elevatorFloorNum);
        if (currentFloorIsStop && elevatorFloorNum !== userFloorNum && elevatorFloorNum !== zeroFloorNum) {
            totalSeconds += timePerFloor;
        }

    } catch (e) {
        console.error("Error calculating ETA:", e);
        totalSeconds = 0;
    }

    // --- FIX 2: Correct Server Time Calculation ---
    // Instead of simple Date.now(), we use server time to match the timestamp
    const currentTime = Date.now() + (serverTimeOffset || 0);
    
    // Calculate elapsed time using synchronous server times
    const elapsedSinceUpdate = (currentTime - (elevatorState.timestamp || currentTime)) / 1000;
    let finalSeconds = totalSeconds - elapsedSinceUpdate;
    if (finalSeconds < 0) finalSeconds = 0;
    
    if (finalSeconds <= 60 && isDirectPath) { // FIX: Only blink if direct path
        if (panel && !panel.classList.contains('approaching')) {
            panel.classList.add('approaching');
        }
    } else {
        if (panel && panel.classList.contains('approaching')) {
            panel.classList.remove('approaching');
        }
    }

    // Fix 60 seconds display issue: Round total first, then split
    const totalSecondsRounded = Math.round(finalSeconds);
    const minutes = Math.floor(totalSecondsRounded / 60);
    const seconds = totalSecondsRounded % 60;
    etaResultElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')} דק'`;
}

function updateElevatorDisplay(elevatorId, stateData) {
    const panel = document.getElementById(`panel-${elevatorId}`);
    if (!panel) return;
    const floorElement = document.getElementById(`floorNumber-${elevatorId}`);
    const arrowElement = document.getElementById(`arrowIcon-${elevatorId}`);
    const stopElement = document.getElementById(`stopIcon-${elevatorId}`);

    if (!stateData) {
        if(floorElement) floorElement.textContent = '--';
        if(arrowElement) arrowElement.style.display = 'none';
        if(stopElement) stopElement.style.display = 'none';
        return;
    }
    if(floorElement) floorElement.textContent = getFloorDisplayName(stateData.floor) ?? '--';
    
    const dir = stateData.direction;
    
    if (dir === 'up' || dir === 'down') {
        if(stopElement) stopElement.style.display = 'none';
        if(arrowElement) {
            arrowElement.style.display = 'block';
            arrowElement.classList.remove('arrow-up', 'arrow-down');
            if (dir === 'up') arrowElement.classList.add('arrow-up');
            else arrowElement.classList.add('arrow-down');
        }
    } else {
        if(arrowElement) arrowElement.style.display = 'none';
        if(stopElement) stopElement.style.display = 'block';
    }
}