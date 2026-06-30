// --- Theme variant from route prefix ---
// The same files serve every variant. LITE is the only opt-in, meant for weak
// devices (RPi Zero-class): /lite/kiosk, /lite/display, /lite/public. EVERY other
// route - the regular ones (/kiosk, /display, /public) AND the explicit /rich/
// prefix - gets the RICH theme (full graphics + animations). This way the normal
// links keep working and render rich by default. A prefix segment is non-numeric
// so it never collides with the floor parser (getFloorFromUrl scans from the end)
// or PAGE_KEY (substring).
(function applyThemeFromPath() {
    const segs = (location.pathname || '').toLowerCase().split('/').filter(Boolean);
    if (segs[0] === 'lite') document.body.classList.add('theme-lite');
    else document.body.classList.add('theme-rich');
})();

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
let elevatorDisplayedETA = {}; // Smooth display layer: { id: { value: seconds, lastTick: ms } }
let floorAliases = {}; // Floor display name mapping (physical -> alias)
let isShabbatOrHoliday = false, isInitialized = false;

// --- Shabbat override helper ---
// Returns the effective Shabbat-mode state for a given elevator config,
// honoring SHABBAT_OVERRIDE (force_on / force_off / null=auto).
function effectiveShabbatActive(cfg) {
    if (!cfg) return false;
    const ov = cfg.SHABBAT_OVERRIDE;
    if (ov === 'force_on') return true;
    if (ov === 'force_off') return false;
    return cfg.SHABBAT_ACTIVE === true;
}

// --- Remote Deep Reload ---
async function performDeepReload(reason = 'remote') {
    console.log('[deep-reload] starting', reason);
    try {
        if (navigator.serviceWorker) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister().catch(() => {})));
        }
        if (window.caches) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
        }
        // Force-refresh CSS/JS in the browser HTTP cache before reloading.
        // Plain location.replace only refreshes the HTML; subresources may stay cached.
        // `cache: 'reload'` bypasses the cache for the request and updates the cache
        // with the fresh response, so the upcoming reload picks up new code.
        const sameOrigin = (u) => {
            try { return new URL(u, location.href).origin === location.origin; }
            catch { return false; }
        };
        const subresources = [
            ...document.querySelectorAll('link[rel="stylesheet"][href]'),
            ...document.querySelectorAll('script[src]'),
        ].map(el => el.href || el.src).filter(u => u && sameOrigin(u));
        await Promise.all(subresources.map(u =>
            fetch(u, { cache: 'reload' }).catch(() => {})
        ));
    } catch (e) { console.warn('[deep-reload] cleanup error', e); }
    const url = new URL(location.href);
    url.searchParams.set('cb', Date.now());
    location.replace(url.toString());
}

function initRemoteReloadListener(pageKey) {
    const scopes = ['all', pageKey];
    scopes.forEach(scope => {
        const ref = database.ref(`settings/commands/reload/${scope}`);
        const lsKey = `lastReloadSeen_${scope}`;
        ref.once('value').then(snap => {
            const initial = snap.val() || 0;
            const seen = parseInt(localStorage.getItem(lsKey) || '0', 10);
            if (initial > seen) localStorage.setItem(lsKey, String(initial));
            ref.on('value', s => {
                const ts = s.val() || 0;
                const lastSeen = parseInt(localStorage.getItem(lsKey) || '0', 10);
                if (ts > lastSeen) {
                    localStorage.setItem(lsKey, String(ts));
                    performDeepReload(`firebase-cmd:${scope}`);
                }
            });
        }).catch(e => console.warn('[deep-reload] seed error', scope, e));
    });
}

// --- System banners ---
const PAGE_KEY = (() => {
    const p = (location.pathname || '').toLowerCase();
    if (p.includes('public')) return 'public';
    if (p.includes('kiosk'))  return 'kiosk';
    if (p.includes('display')) return 'display';
    return 'index';
})();
function _bannerEscape(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// --- layout-v2 guard: when active, the CSS Grid shell handles measurement.
// All the offsetHeight-based observers become no-ops to avoid double work
// and the QR-overhang measurement bug they had in v1.
function _isLayoutV2() {
    return document.body && document.body.classList.contains('layout-v2');
}

let _bannerResizeObserver = null;
function _updateBannerHeightVar(host) {
    if (_isLayoutV2()) return;
    const h = (host && host.offsetHeight) || 0;
    document.documentElement.style.setProperty('--banner-h', `${h}px`);
}
function renderSystemBanners() {
    const host = document.getElementById('systemBanners');
    if (!host) return;
    const banners = (settings && settings.banners) || {};
    const visible = Object.values(banners).filter(b =>
        b && b.active !== false && b.text && b.pages && b.pages[PAGE_KEY]
    );
    host.innerHTML = visible.map(b => {
        const color = (b.color && /^#[0-9a-fA-F]{3,8}$/.test(b.color)) ? b.color : '#c5a47e';
        return `<div class="system-banner" style="background:${color}">${_bannerEscape(b.text)}</div>`;
    }).join('');
    // Expose banner height as CSS var so layout calcs (panel heights) can subtract it.
    // Use ResizeObserver (set up once) so the var stays in sync even when banner text
    // wraps differently or fonts load late — not just on the initial render.
    if (!_bannerResizeObserver && window.ResizeObserver) {
        _bannerResizeObserver = new ResizeObserver(() => _updateBannerHeightVar(host));
        _bannerResizeObserver.observe(host);
    }
    // Set immediately AND on next rAF (catches late layout settle).
    _updateBannerHeightVar(host);
    requestAnimationFrame(() => _updateBannerHeightVar(host));
}

// --- Bottom status bar height tracking (mirrors --banner-h pattern) ---
let _bottomBarResizeObserver = null;
function _updateBottomBarHeightVar(host) {
    if (_isLayoutV2()) return;
    if (!host) {
        document.documentElement.style.setProperty('--bottom-bar-h', '0px');
        return;
    }
    const isHidden = getComputedStyle(host).display === 'none';
    const h = isHidden ? 0 : (host.offsetHeight || 0);
    document.documentElement.style.setProperty('--bottom-bar-h', `${h}px`);
}
function initBottomBarObserver() {
    if (_isLayoutV2()) return;
    const host = document.querySelector('.bottom-status-bar');
    if (!host) {
        document.documentElement.style.setProperty('--bottom-bar-h', '0px');
        return;
    }
    if (!_bottomBarResizeObserver && window.ResizeObserver) {
        _bottomBarResizeObserver = new ResizeObserver(() => _updateBottomBarHeightVar(host));
        _bottomBarResizeObserver.observe(host);
    }
    // Set immediately (sync) AND schedule a rAF refresh (catches late layout).
    _updateBottomBarHeightVar(host);
    requestAnimationFrame(() => _updateBottomBarHeightVar(host));
}
function refreshBottomBarHeight() {
    if (_isLayoutV2()) return;
    const host = document.querySelector('.bottom-status-bar');
    _updateBottomBarHeightVar(host);
}

// --- Floor Alias Helper: Returns display name for a physical floor ---
function getFloorDisplayName(physicalFloor) {
    if (physicalFloor === null || physicalFloor === undefined) return '--';
    const key = String(physicalFloor);
    return floorAliases[key] || key;
}

// --- Font scale for floor-indicator: shrink when alias is long ---
// In layout-v2, clamp() handles base sizing; this scale tweaks for very long
// aliases like "Synagogue / בית כנסת". Use a smoother curve than v1.
function floorFontScale(text) {
    const len = (text || '').length;
    if (_isLayoutV2()) {
        // v2 curve — content-aware sizing. CSS clamp() targets MEDIUM-length
        // names (5-7 chars like "Lobby"). This scale BOOSTS short text
        // ("9", "L" → 2.2×) and SHRINKS long aliases ("Synagogue / בית כנסת"
        // → 0.6×). With -webkit-line-clamp:2, long mixed-language names break
        // cleanly across 2 lines. Every floor name fills its space comfortably.
        if (len <= 2)  return '2.2';   // single char "9", "L"
        if (len <= 4)  return '1.7';   // "2-", "10", "B1"
        if (len <= 7)  return '1.3';   // "Lobby", "Garden"
        if (len <= 12) return '1';     // "Conference"
        if (len <= 18) return '0.75';  // "Conference Hall"
        if (len <= 24) return '0.6';   // "Synagogue / בית כנסת"
        return '0.5';                  // anything longer
    }
    // v1 curve (steeper)
    if (len <= 3) return '1';
    if (len <= 6) return '0.65';
    if (len <= 10) return '0.4';
    if (len <= 16) return '0.28';
    if (len <= 24) return '0.22';
    return '0.18';
}

// --- Font scale for ETA destination floor name: shrink when name is long ---
function floorLabelScale(text) {
    const len = (text || '').length;
    if (_isLayoutV2()) {
        if (len <= 8)  return '1';
        if (len <= 14) return '0.85';
        if (len <= 22) return '0.7';
        return '0.55';
    }
    if (len <= 6) return '1';
    if (len <= 10) return '0.75';
    if (len <= 16) return '0.55';
    if (len <= 24) return '0.45';
    return '0.38';
}

// --- Font scale for ETA result line: shrink when state text is long ---
// Covers dynamic states like "מצב שבת בהפסקה" (15) and "לא עוצרת בקומה זו" (18).
// Returned via the --er-scale CSS var, used by all .eta-result font-size calcs.
function etaResultScale(text) {
    const len = (text || '').length;
    if (_isLayoutV2()) {
        if (len <= 14) return '1';
        if (len <= 20) return '0.85';
        if (len <= 28) return '0.7';
        return '0.6';
    }
    if (len <= 12) return '1';
    if (len <= 18) return '0.8';
    if (len <= 24) return '0.65';
    return '0.55';
}
function applyEtaResultScale(el) {
    if (el) el.style.setProperty('--er-scale', etaResultScale(el.textContent));
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

    // Synchronous theme default (anti-FOUC). RTDB settings/appearance overrides it
    // once Firebase loads (see initializeAppLogic).
    if (window.applyAppearance && cfg.theme) {
        window.applyAppearance({ theme: cfg.theme, logo: { themeColor: cfg.branding.themeColor } });
    }
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

// Persisted per-device so the kiosk touch toggle (digital <-> analog) survives reloads.
// Default true (digital). Only kiosk.html has the toggle + analog markup.
// Guarded: localStorage can throw (private mode / blocked storage) and this runs
// at module load - a throw here would kill the whole script.
let isDigitalClock = true;
try { isDigitalClock = (localStorage.getItem('kioskIsDigitalClock') ?? '1') !== '0'; } catch (e) {}

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
    // 0deg = 12 o'clock. Hands pivot at the dial center (CSS transform-origin
    // 50% 100%); keep translateX(-50%) so they stay centered after rotate().
    const minutesDegrees = ((minutes / 60) * 360) + ((seconds / 60) * 6);
    const hour12 = hours % 12;
    const hoursDegrees = ((hour12 / 12) * 360) + ((minutes / 60) * 30);

    if (ui.minuteHand) ui.minuteHand.style.transform = `translateX(-50%) rotate(${minutesDegrees}deg)`;
    if (ui.hourHand)   ui.hourHand.style.transform   = `translateX(-50%) rotate(${hoursDegrees}deg)`;
    // The second hand is driven smoothly by startAnalogSweep() (rAF) when the
    // analog face is actually visible - not here, to avoid a 1s "tick".
}

// Smooth analog second hand via requestAnimationFrame. Self-terminates whenever
// the analog face is not visible (digital mode selected, or Shabbat hides the
// whole clock) so it costs nothing on a 24/7 screen. Restarted from the toggle
// handler and from updateDisplayMode when returning to weekday.
let _analogSweepRAF = null;
function startAnalogSweep() {
    if (_analogSweepRAF !== null) return; // already running
    const step = () => {
        const hidden = isDigitalClock || isShabbatOrHoliday || !ui.secondHand
            || (ui.analogClockWrapper && ui.analogClockWrapper.style.display === 'none');
        if (hidden) { _analogSweepRAF = null; return; }
        const now = new Date(Date.now() + (serverTimeOffset || 0) + (SIMULATED_HOURS_OFFSET * 60 * 60 * 1000));
        const sec = now.getSeconds() + now.getMilliseconds() / 1000;
        ui.secondHand.style.transform = `translateX(-50%) rotate(${(sec / 60) * 360}deg)`;
        _analogSweepRAF = requestAnimationFrame(step);
    };
    _analogSweepRAF = requestAnimationFrame(step);
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
        try { localStorage.setItem('kioskIsDigitalClock', isDigitalClock ? '1' : '0'); } catch (e) {}
        if(ui.digitalClockPanel) ui.digitalClockPanel.style.display = isDigitalClock ? 'block' : 'none';
        if(ui.analogClockWrapper) ui.analogClockWrapper.style.display = isDigitalClock ? 'none' : 'flex';
        if(!isDigitalClock) startAnalogSweep();
    });
    // Apply the persisted choice on load (the handler above only runs on click).
    if(ui.digitalClockPanel) ui.digitalClockPanel.style.display = isDigitalClock ? 'block' : 'none';
    if(ui.analogClockWrapper) ui.analogClockWrapper.style.display = isDigitalClock ? 'none' : 'flex';
    if(!isDigitalClock) startAnalogSweep();
}

let qrCodeGenerated = false;
// Build a /go.html redirect URL so scans can be counted + the destination changed via setup.
// PAGE_KEY identifies the source page (kiosk/display) for the bySource breakdown.
function buildQrTarget(linkKey) {
    return `${location.origin}/go.html?to=${encodeURIComponent(linkKey)}&from=${encodeURIComponent(PAGE_KEY || 'unknown')}`;
}
if(ui.contactBtn) {
    ui.contactBtn.addEventListener('click', () => {
        if(ui.contactModal) ui.contactModal.classList.add('show');
        if (!qrCodeGenerated) {
            const qrCanvas = document.getElementById('whatsappQRContainer');
            if (qrCanvas) {
                const qrTarget = buildQrTarget('whatsapp');
                QRCode.toCanvas(qrCanvas, qrTarget, { errorCorrectionLevel: 'H', width: 200, margin: 1 }, function (error) { if (!error) qrCodeGenerated = true; });
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
    
    // Effective Shabbat=false: On public kiosk show anyway, on other screens hide
    if (effectiveShabbatActive(config) === false) {
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

// --- מאזין נפרד לכל מעלית (במקום on('value') על כל /elevators) ---
// המאזין הישן על כל הצומת היה מוריד מחדש את *כל* המעליות בכל שינוי קטן באחת מהן
// (הגברת רוחב פס). מאזין לכל ילד מעביר רק את המעלית שהשתנתה. מנוי לכל המעליות
// הקיימות — בטוח לתצוגה (כל הנתונים תמיד זמינים) וחוסך את עיקר העלות החוזרת.
const _elevatorChildRefs = {};
function subscribeElevatorChildren() {
    const ids = new Set([
        ...Object.keys(latestElevatorsData || {}),
        ...Object.keys(elevatorConfigs || {})
    ]);
    ids.forEach(id => {
        if (_elevatorChildRefs[id]) return; // כבר מנוי
        const ref = database.ref('elevators/' + id);
        ref.on('value', (snap) => {
            const val = snap.val();
            if (val === null) delete latestElevatorsData[id];
            else latestElevatorsData[id] = val;
            renderFullDisplay();
        });
        _elevatorChildRefs[id] = ref;
    });
}

async function initializeAppLogic() {
    if (isInitialized) { renderFullDisplay(); return; }
    isInitialized = true;
    initBottomBarObserver();
    await initializeClock();
    try {
        const [settingsSnapshot, configsSnapshot, elevatorsSnapshot] = await Promise.all([
            database.ref('settings').once('value'),
            database.ref('elevator_configs').once('value'),
            database.ref('elevators').once('value')
        ]);
        settings = settingsSnapshot.val() || {};
        floorAliases = settings.FLOOR_ALIASES || {};
        if (window.applyAppearance) window.applyAppearance(settings.appearance);
        elevatorConfigs = configsSnapshot.val() || {};
        latestElevatorsData = elevatorsSnapshot.val() || {};
        await checkShabbatStatus();

        renderSystemBanners();
        initRemoteReloadListener(PAGE_KEY);

        // Initial Render — renderFullDisplay handles all cases (Shabbat, weekday-mode, empty-state)
        renderFullDisplay();

        database.ref('settings').on('value', (snapshot) => {
            const prevYomTov = settings ? settings.YOM_TOV_SHENI : undefined;
            settings = snapshot.val() || {};
            floorAliases = settings.FLOOR_ALIASES || {};
            if (window.applyAppearance) window.applyAppearance(settings.appearance);
            renderSystemBanners();

            // אם YOM_TOV_SHENI השתנה — חשב מחדש את מצב שבת מיד (לא לחכות ל-interval)
            if (isInitialized && prevYomTov !== settings.YOM_TOV_SHENI) {
                checkShabbatStatus();
            } else {
                renderFullDisplay();
            }
        });

        // --- BUG FIX: Use snapshot.val() instead of stale configsSnapshot ---
        database.ref('elevator_configs').on('value', (snapshot) => {
            const prevConfigs = elevatorConfigs;
            elevatorConfigs = snapshot.val() || {};
            // קליטת מעליות חדשות שהוגדרו ב-config (מנוי idempotent)
            subscribeElevatorChildren();
            // Re-evaluate Shabbat mode if the detector flipped any SHABBAT_ACTIVE / OVERRIDE field
            const anyShabbatChanged = Object.keys(elevatorConfigs).some(id =>
                effectiveShabbatActive(elevatorConfigs[id]) !== effectiveShabbatActive(prevConfigs?.[id])
            );
            if (anyShabbatChanged) {
                checkShabbatStatus();
            } else {
                renderFullDisplay();
            }
        });

        // מאזין נפרד לכל מעלית (במקום on('value') על כל /elevators)
        subscribeElevatorChildren();

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

// --- Empty-state ("המתנה למעלית פעילה...") ---
// Injected into the dashboard-container whenever there are zero panels to show.
// Suppressed on PUBLIC pages (PAGE_KEY === 'public') — those always show panels.
function ensureEmptyState() {
    const container = document.querySelector('.dashboard-container');
    if (!container) return null;
    let el = container.querySelector('.empty-state');
    if (!el) {
        el = document.createElement('div');
        el.className = 'empty-state';
        el.textContent = 'המתנה למעלית פעילה...';
        container.appendChild(el);
    }
    return el;
}
function setEmptyStateVisible(show) {
    const el = ensureEmptyState();
    if (!el) return;
    el.style.display = show ? 'flex' : 'none';
    document.body.classList.toggle('empty-state-mode', !!show);
}

function renderFullDisplay() {
    if (!THIS_SCREEN_FLOOR || !settings || !elevatorConfigs) return;

    const isPublicKiosk = (PAGE_KEY === 'public');
    const shabbatOn = isShabbatOrHoliday;
    const weekdayMode = document.body.classList.contains('weekday-mode');

    // Weekday + non-public page = CLOCK mode (the clock is the content). Clear any
    // stale panels and do NOT show the "waiting for active elevator" empty-state -
    // that belongs to Shabbat/elevator mode only.
    if (!shabbatOn && !weekdayMode && !isPublicKiosk) {
        const container = document.querySelector('.dashboard-container');
        if (container) {
            Array.from(container.children).forEach(c => {
                if (!c.classList.contains('empty-state')) c.remove();
            });
        }
        setEmptyStateVisible(false);
        return;
    }
    // Public-kiosk weekday + Shabbat: original render path.
    if (!shabbatOn && !weekdayMode) return;

    const elevatorIds = latestElevatorsData ? Object.keys(latestElevatorsData) : [];
    const visibleElevators = elevatorIds.filter(id => shouldShowElevator(id));

    // No elevators visible AND we are NOT a public kiosk → empty-state.
    if (visibleElevators.length === 0 && !isPublicKiosk) {
        const container = document.querySelector('.dashboard-container');
        if (container) {
            Array.from(container.children).forEach(c => {
                if (!c.classList.contains('empty-state')) c.remove();
            });
        }
        setEmptyStateVisible(true);
        return;
    }

    setEmptyStateVisible(false);
    if (latestElevatorsData) {
        createElevatorPanels(visibleElevators);
        updateShabbatLabels(visibleElevators);
        renderStopsChips();
        visibleElevators.forEach(id => {
            if (latestElevatorsData[id]) processElevatorUpdate(id, latestElevatorsData[id]);
        });
    }
}

function updateShabbatLabels(ids) {
    if (!ids) return;
    ids.forEach(id => {
        const lbl = document.getElementById(`shabbatLabel-${id}`);
        if (!lbl) return;
        const isShab = effectiveShabbatActive(elevatorConfigs && elevatorConfigs[id]);
        lbl.style.display = isShab ? 'inline-block' : 'none';
    });
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

    // ── Detector-driven check (primary source) ──────────────────────────────
    // If the RPi detector has written recently, trust it over Hebcal.
    {
        const DETECTOR_STALE_MS = 30 * 60 * 1000;
        const nowTs = Date.now() + (serverTimeOffset || 0) + (timeOffsetHours * 60 * 60 * 1000);
        let detectorIsActive = false;
        let detectorSaysShabbat = false;

        for (const [, cfg] of Object.entries(elevatorConfigs || {})) {
            const lastTs = cfg?.SHABBAT_DETECTOR?.last_transition_ts; // milliseconds
            const eff = effectiveShabbatActive(cfg);
            if (lastTs && (nowTs - lastTs) < DETECTOR_STALE_MS) {
                detectorIsActive = true;
                if (eff) detectorSaysShabbat = true;
            } else if (eff) {
                // Detector wrote true (or override forced) but is now stale — keep it
                detectorSaysShabbat = true;
            }
            // Manual override alone is enough to keep us active even without a detector
            if (cfg.SHABBAT_OVERRIDE === 'force_on' || cfg.SHABBAT_OVERRIDE === 'force_off') {
                detectorIsActive = true;
            }
        }

        if (detectorIsActive) {
            isShabbatOrHoliday = detectorSaysShabbat;
            if (isShabbatOrHoliday !== wasShabbat || !isInitialized) updateDisplayMode();
            return;
        }

        // Hebcal gate disabled + no active detector → pure behavioral mode
        const hebcalGateEnabled = settings?.HEBCAL_GATE_ENABLED !== false;
        if (!hebcalGateEnabled) {
            isShabbatOrHoliday = detectorSaysShabbat;
            if (isShabbatOrHoliday !== wasShabbat || !isInitialized) updateDisplayMode();
            return;
        }
    }
    // ── Hebcal fallback (only when gate enabled and detector silent > 30 min) ─

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

            // 2. If Israel says NO, and YOM_TOV_SHENI is enabled — check Diaspora calendar
            if (!isCurrentlyShabbat && settings && settings.YOM_TOV_SHENI !== false) {
                isCurrentlyShabbat = checkWindows(dataDiaspora.items);
                if (isCurrentlyShabbat && SIMULATED_HOURS_OFFSET !== 0) {
                    console.log(`[TimeTravel] Diaspora Override: ACTIVATED (Yom Tov Sheni)`);
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
    // Restart the smooth analog sweep on return to weekday (no-op if digital or already running).
    if (!isShabbatOrHoliday) startAnalogSweep();
    
    // Bottom bar is always on for public, conditional for others
    if (ui.bottomStatusBar) {
        if (!document.querySelector('script[src*="kiosk_public"]')) { 
             ui.bottomStatusBar.style.display = isShabbatOrHoliday ? 'block' : 'none';
        }
    }
    
    const dash = document.querySelector('.dashboard-container');
    if (dash) dash.style.display = (isShabbatOrHoliday || document.body.classList.contains('weekday-mode')) ? 'flex' : 'none';

    // Always invoke renderFullDisplay — it now handles the no-elevators / weekday-on-non-public
    // path internally by toggling the empty-state placeholder.
    renderFullDisplay();
    // Status bar visibility flipped → refresh --bottom-bar-h for layout calc().
    // Multiple settle attempts because some engines don't fire ResizeObserver on
    // display:none → display:flex transitions, and rAF can race with style commit.
    refreshBottomBarHeight();
    requestAnimationFrame(() => refreshBottomBarHeight());
    setTimeout(refreshBottomBarHeight, 80);
    setTimeout(refreshBottomBarHeight, 300);
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

    const config = elevatorConfigs[id] || {};
    const elevFloorWaits = config.FLOOR_WAITS || {};
    const hasWaitAtCurrent = parseFloat(elevFloorWaits[String(currentFloorNum)] || 0) > 0
        || (currentFloorNum === 0 && config.ZERO_FLOOR_WAIT_ACTIVE);

    if (hasWaitAtCurrent) {
        if (lastFloorNum !== currentFloorNum || !elevatorArrivalTimes[id]) {
            const now = Date.now() + (serverTimeOffset || 0);
            elevatorArrivalTimes[id] = now;
        }
    } else {
        if (elevatorArrivalTimes[id]) {
            delete elevatorArrivalTimes[id];
        }
    }

    const topFloorNum = getNumericFloor(config.TOP_FLOOR ?? settings.TOP_FLOOR);
    const bottomFloorNum = getNumericFloor(config.BOTTOM_FLOOR ?? settings.BOTTOM_FLOOR);
    if (currentState.timeoutId) clearTimeout(currentState.timeoutId);

    let newDirection = currentState.direction || 'stopped';
    if (currentFloorNum === topFloorNum || currentFloorNum === bottomFloorNum) newDirection = 'stopped';
    else if (lastFloorNum !== null && currentFloorNum !== lastFloorNum) newDirection = (currentFloorNum > lastFloorNum) ? 'up' : 'down';

    const currentServerTime = Date.now() + (serverTimeOffset || 0);

    const newState = {
        floor: newData.floor,
        direction: newDirection,
        lastMovingDirection: (newDirection === 'up' || newDirection === 'down')
            ? newDirection
            : (currentState.lastMovingDirection || null),
        timestamp: currentServerTime,
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
    // Ignore the empty-state placeholder when diffing — it has no panel id.
    const currentPanels = new Set(
        Array.from(container.children)
            .filter(c => !c.classList.contains('empty-state'))
            .map(child => child.id)
    );
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

        const isShab = effectiveShabbatActive(elevatorConfigs && elevatorConfigs[id]);
        panel.innerHTML = `
            <div class="panel-side-floor">
                <div class="floor-indicator" id="floorNumber-${id}">--</div>
            </div>

            <div class="panel-side-info">
                <div class="floor-label elevator-id">${elevatorName}</div>
                <div class="shabbat-elev-label" id="shabbatLabel-${id}" style="display:${isShab ? 'inline-block' : 'none'};">מעלית שבת</div>

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
            </div>

            <!-- ETA is a DIRECT child of the panel (its own grid-area: eta) so
                 the WIDE layout can place it beside the identity instead of
                 stacked underneath (which got cut when stops shortened the row). -->
            <div class="eta-display">
                <div class="eta-prefix">המעלית מגיעה ל</div>
                <div class="eta-floor-name" id="etaLabel-${id}">${getFloorDisplayName(THIS_SCREEN_FLOOR)}</div>
                <div class="eta-result" id="etaResult-${id}">...</div>
            </div>
        `;
        container.appendChild(panel);

        // Apply adaptive scale to ETA destination floor name (long names get smaller font)
        const labelEl = document.getElementById(`etaLabel-${id}`);
        if (labelEl) labelEl.style.setProperty('--fl-scale', floorLabelScale(labelEl.textContent));
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

// --- Shabbat per-elevator stops chips (shared: display / kiosk / public) ---
// Ported from the inline public.html renderer so EVERY screen shows the
// STOPPING_FLOORS_UP/DOWN chips when an elevator is in Shabbat mode. Reuses the
// existing globals (elevatorConfigs, floorAliases via getFloorDisplayName,
// effectiveShabbatActive, THIS_SCREEN_FLOOR). Driven from renderFullDisplay
// after createElevatorPanels - no MutationObserver, since renderFullDisplay
// already re-runs on every config / settings / elevator / Shabbat change.
function stopFloorNum(s) {
    // Like getNumericFloor but returns 0 (not null) for unparseable values, so
    // sorting and range-clamping keep the inline renderer's original behavior.
    const n = getNumericFloor(s);
    return n === null ? 0 : n;
}
// Vertical strip: long names collapse to their first character; numeric floors
// and short aliases (<=2 chars) stay as-is.
function shortFloorLabel(text) {
    const s = String(text).trim();
    if (/^-?\d+$/.test(s)) return s;   // numeric floor (e.g. 12, -2)
    if (s.length <= 2) return s;       // short alias (e.g. L, B1)
    return s.charAt(0);                // long name -> first letter
}
function buildStopList(up, down) {
    const map = new Map();
    (up   || []).forEach(f => { const k = String(f); if (!map.has(k)) map.set(k, { up:false, down:false }); map.get(k).up = true; });
    (down || []).forEach(f => { const k = String(f); if (!map.has(k)) map.set(k, { up:false, down:false }); map.get(k).down = true; });
    // Sort descending by physical floor (high -> low) so the highest floor sits
    // at the TOP of the vertical strip, like a real elevator selector.
    return Array.from(map.entries()).sort((a, b) => stopFloorNum(b[0]) - stopFloorNum(a[0]));
}
function stopArrowHtml(dir) {
    if (dir.up && dir.down) return '<span class="arr both"><span>▲</span><span>▼</span></span>';
    if (dir.up)              return '<span class="arr">▲</span>';
    if (dir.down)            return '<span class="arr">▼</span>';
    return '';
}
function renderStopChipRow(panel, id) {
    const cfg = (elevatorConfigs && elevatorConfigs[id]) || {};
    const isShab = effectiveShabbatActive(cfg);
    const upRaw   = cfg.STOPPING_FLOORS_UP   || [];
    const downRaw = cfg.STOPPING_FLOORS_DOWN || [];
    // Clamp stops to the elevator's physical range. Firebase can hold stale
    // floors above TOP_FLOOR / below BOTTOM_FLOOR (CLAUDE.md contract item 6).
    const topNum    = stopFloorNum(cfg.TOP_FLOOR);
    const bottomNum = stopFloorNum(cfg.BOTTOM_FLOOR);
    const hasRange  = (cfg.TOP_FLOOR != null && cfg.BOTTOM_FLOOR != null);
    const inRange = (f) => { if (!hasRange) return true; const n = stopFloorNum(f); return n >= bottomNum && n <= topNum; };
    const up   = upRaw.filter(inRange);
    const down = downRaw.filter(inRange);

    let row = panel.querySelector(':scope > .elevator-stops');
    // Show only when THIS elevator is in Shabbat mode and has in-range stops.
    if (!isShab || (!up.length && !down.length)) { if (row) row.remove(); return; }
    // .elevator-stops is a direct child of the panel; the panel's CSS grid
    // (body.layout-v2, page-agnostic) places it via grid-area: stops.
    if (!row) { row = document.createElement('div'); row.className = 'elevator-stops'; panel.appendChild(row); }

    const here = (THIS_SCREEN_FLOOR != null) ? String(THIS_SCREEN_FLOOR) : null;
    const list = buildStopList(up, down); // already descending by floor
    let chipsHtml = '';
    list.forEach(entry => {
        const k = entry[0], dir = entry[1];
        const hereClass = (here !== null && k === here) ? ' is-here' : '';
        const name = getFloorDisplayName(k);
        // Escape via the existing helper - aliases are admin-set but may contain & < > " '.
        chipsHtml +=
            '<span class="chip' + hereClass + '" title="' + _bannerEscape(name) + '">' +
                _bannerEscape(shortFloorLabel(name)) +
                stopArrowHtml(dir) +
            '</span>';
    });
    row.innerHTML = '<div class="stops-row">' + chipsHtml + '</div>';
}
function renderStopsChips() {
    document.querySelectorAll('.elevator-panel').forEach(panel => {
        // public.html uses a custom ETA prefix wording; keep it ONLY on public
        // so the other pages retain their own prefix from createElevatorPanels.
        if (PAGE_KEY === 'public') {
            const prefix = panel.querySelector('.eta-prefix');
            if (prefix && prefix.textContent.trim() !== 'המעלית תגיע לקומה') {
                prefix.textContent = 'המעלית תגיע לקומה';
            }
        }
        const id = (panel.id || '').replace(/^panel-/, '');
        if (id) renderStopChipRow(panel, id);
    });
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
        applyEtaResultScale(etaResultElement);
        resetPanelStyle();
        return;
    }

    const elevatorConfig = elevatorConfigs[elevatorId];

    // --- Effective Shabbat=false: Hide ETA even during Shabbat (public kiosk shows panel but no ETA) ---
    if (elevatorConfig && effectiveShabbatActive(elevatorConfig) === false) {
        etaResultElement.textContent = "";
        applyEtaResultScale(etaResultElement);
        if(etaLabel) etaLabel.style.visibility = 'hidden';
        resetPanelStyle();
        return;
    }

    if (!elevatorState || !elevatorConfig || !settings) {
        etaResultElement.textContent = "...";
        applyEtaResultScale(etaResultElement);
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
            applyEtaResultScale(etaResultElement);
            if(etaLabel) etaLabel.style.visibility = 'hidden'; // Hide label
            resetPanelStyle();
            delete elevatorDisplayedETA[elevatorId];
            return;
        }
    }

    const userFloorNum = getNumericFloor(THIS_SCREEN_FLOOR);
    const topFloorNum = getNumericFloor(elevatorConfig.TOP_FLOOR ?? settings.TOP_FLOOR);
    const bottomFloorNum = getNumericFloor(elevatorConfig.BOTTOM_FLOOR ?? settings.BOTTOM_FLOOR);

    if (userFloorNum === null) { etaResultElement.textContent = "שגיאה"; applyEtaResultScale(etaResultElement); return; }
    
    let stopsUp = elevatorConfig.STOPPING_FLOORS_UP || [];
    let stopsDown = elevatorConfig.STOPPING_FLOORS_DOWN || [];
    
    const canStopUp = stopsUp.length === 0 || stopsUp.map(String).includes(String(THIS_SCREEN_FLOOR));
    const canStopDown = stopsDown.length === 0 || stopsDown.map(String).includes(String(THIS_SCREEN_FLOOR));
    
    if (!canStopUp && !canStopDown) {
        etaResultElement.textContent = "לא עוצרת בקומה זו";
        applyEtaResultScale(etaResultElement);
        if(etaLabel) etaLabel.style.visibility = 'hidden'; // Hide label
        delete elevatorDisplayedETA[elevatorId];
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
        applyEtaResultScale(etaResultElement);
        if(etaLabel) etaLabel.style.visibility = 'hidden'; // Hide label

        if (panel && !panel.classList.contains('approaching')) {
            panel.classList.add('approaching');
        }
        delete elevatorDisplayedETA[elevatorId];
        return;
    }
    
    let effectiveDirection = elevatorState.direction;
    if (effectiveDirection === 'stopped' || effectiveDirection === ' ') {
        if (elevatorFloorNum === bottomFloorNum) effectiveDirection = 'up';
        else if (elevatorFloorNum === topFloorNum) effectiveDirection = 'down';
        else if (elevatorState.lastMovingDirection) effectiveDirection = elevatorState.lastMovingDirection;
        else effectiveDirection = 'up';
    }
    
    const timePerFloor = parseFloat(elevatorConfig.TIME_PER_FLOOR ?? settings.TIME_PER_FLOOR ?? 0); 
    let timePassFloor = parseFloat(elevatorConfig.TIME_PASS_FLOOR || 0);
    if (timePassFloor === 0) {
            const expressTimeUp = parseFloat(elevatorConfig.EXPRESS_TIME_UP ?? settings.EXPRESS_TIME_UP ?? 0);
            const totalTravelDistance = Math.abs(topFloorNum - bottomFloorNum) || 1;
            if(expressTimeUp > 0) timePassFloor = expressTimeUp / totalTravelDistance;
    }
    
    // --- FLOOR_WAITS: per-floor dwell times (generalizes old ZERO_FLOOR_WAIT) ---
    const floorWaits = Object.assign({}, elevatorConfig.FLOOR_WAITS || {});
    // Backwards compatibility: old ZERO_FLOOR_WAIT_* fields (until admin saves via setup.html)
    if (elevatorConfig.ZERO_FLOOR_WAIT_ACTIVE && !('0' in floorWaits)) {
        const legacy = parseFloat(elevatorConfig.ZERO_FLOOR_WAIT_SECONDS || 0);
        if (legacy > 0) floorWaits['0'] = legacy;
    }
    const getFloorWait = (f) => parseFloat(floorWaits[String(f)] || 0);

    // Numeric Sets of stop lists for intermediate-wait checks
    const stopsUpNums = new Set(stopsUp.map(getNumericFloor).filter(v => v !== null));
    const stopsDownNums = new Set(stopsDown.map(getNumericFloor).filter(v => v !== null));

    // --- HELPER: Calc Segment ---
    const calcSegmentTime = (start, end, dir) => {
        const list = (dir === 'up') ? stopsUp : stopsDown;
        let stopsCount = countStopsInList(start, end, list);
        const steps = Math.abs(end - start);
        if (steps === 0) return 0;

        let time = 0;
        const passCount = steps - stopsCount;
        time += (stopsCount * timePerFloor) + (passCount * timePassFloor);

        // Add FLOOR_WAITS for intermediate floors the elevator ACTUALLY stops at in this direction.
        // FLOOR_WAITS replaces the brief-stop cost, so subtract the stop-vs-pass delta
        // (timePerFloor - timePassFloor) already counted above, to avoid double-counting.
        // Net cost for a FLOOR_WAITS floor becomes: timePassFloor (travel) + FLOOR_WAITS (dwell).
        const stopSet = (dir === 'up') ? stopsUpNums : stopsDownNums;
        const lo = Math.min(start, end), hi = Math.max(start, end);
        const stopVsPassDelta = timePerFloor - timePassFloor;
        for (const k of Object.keys(floorWaits)) {
            const f = parseInt(k, 10);
            if (f > lo && f < hi && stopSet.has(f) && getFloorWait(f) > 0) {
                time += getFloorWait(f) - stopVsPassDelta;
            }
        }
        return time;
    };

    // --- HELPER: Floor wait at a turnaround / current-floor point ---
    const addFloorWaitAt = (floor) => {
        const wait = getFloorWait(floor);
        if (wait > 0) return wait;
        // Terminal stops (BOTTOM/TOP) have STOP_TIME turnaround dwell even without FLOOR_WAITS.
        // Skip when the elevator is AT this terminal — the current-floor block handles that case.
        if ((floor === topFloorNum || floor === bottomFloorNum) && floor !== elevatorFloorNum) return timePerFloor;
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
                if (canStopUp) {
                    // Direct UP
                    totalSeconds = calcSegmentTime(elevatorFloorNum, userFloorNum, 'up');
                    isDirectPath = true;
                } else {
                    // UP to TOP -> turnaround -> DOWN to user
                    totalSeconds = calcSegmentTime(elevatorFloorNum, topFloorNum, 'up');
                    totalSeconds += addFloorWaitAt(topFloorNum);
                    totalSeconds += calcSegmentTime(topFloorNum, userFloorNum, 'down');
                }
            } else {
                if (canStopDown) {
                    // UP to TOP -> turnaround -> DOWN to user
                    totalSeconds = calcSegmentTime(elevatorFloorNum, topFloorNum, 'up');
                    totalSeconds += addFloorWaitAt(topFloorNum);
                    totalSeconds += calcSegmentTime(topFloorNum, userFloorNum, 'down');
                } else {
                    // UP to TOP -> DOWN to BOTTOM -> UP to user
                    totalSeconds = calcSegmentTime(elevatorFloorNum, topFloorNum, 'up');
                    totalSeconds += addFloorWaitAt(topFloorNum);
                    totalSeconds += calcSegmentTime(topFloorNum, bottomFloorNum, 'down');
                    totalSeconds += addFloorWaitAt(bottomFloorNum);
                    totalSeconds += calcSegmentTime(bottomFloorNum, userFloorNum, 'up');
                }
            }
        } else {
            // --- ELEVATOR IS MOVING DOWN ---
            if (userFloorNum < elevatorFloorNum) {
                if (canStopDown) {
                    // Direct DOWN
                    totalSeconds = calcSegmentTime(elevatorFloorNum, userFloorNum, 'down');
                    isDirectPath = true;
                } else {
                    // DOWN to BOTTOM -> UP to user
                    totalSeconds = calcSegmentTime(elevatorFloorNum, bottomFloorNum, 'down');
                    totalSeconds += addFloorWaitAt(bottomFloorNum);
                    totalSeconds += calcSegmentTime(bottomFloorNum, userFloorNum, 'up');
                }
            } else {
                if (canStopUp) {
                    // DOWN to BOTTOM -> UP to user
                    totalSeconds = calcSegmentTime(elevatorFloorNum, bottomFloorNum, 'down');
                    totalSeconds += addFloorWaitAt(bottomFloorNum);
                    totalSeconds += calcSegmentTime(bottomFloorNum, userFloorNum, 'up');
                } else {
                    // DOWN to BOTTOM -> UP to TOP -> DOWN to user
                    totalSeconds = calcSegmentTime(elevatorFloorNum, bottomFloorNum, 'down');
                    totalSeconds += addFloorWaitAt(bottomFloorNum);
                    totalSeconds += calcSegmentTime(bottomFloorNum, topFloorNum, 'up');
                    totalSeconds += addFloorWaitAt(topFloorNum);
                    totalSeconds += calcSegmentTime(topFloorNum, userFloorNum, 'down');
                }
            }
        }

        // At current floor: add FLOOR_WAITS dwell or brief-stop delay.
        // Dwell applies for ANY direction (stopped/up/down) once arrived at the wait-floor —
        // `elapsedSinceUpdate` subtraction below handles decay so the value smoothly drops.
        const elevWaitSeconds = getFloorWait(elevatorFloorNum);
        const currentFloorStopList = (effectiveDirection === 'up') ? stopsUp : stopsDown;
        const currentFloorIsStop = currentFloorStopList.map(getNumericFloor).includes(elevatorFloorNum)
            || elevatorFloorNum === bottomFloorNum
            || elevatorFloorNum === topFloorNum;

        if (currentFloorIsStop && elevatorFloorNum !== userFloorNum) {
            if (elevWaitSeconds > 0) {
                const now = Date.now() + (serverTimeOffset || 0);
                const snapshotTime = elevatorState.timestamp || now;
                const arrivalTime = elevatorArrivalTimes[elevatorId] || snapshotTime;
                const timeSpentHere = (snapshotTime - arrivalTime) / 1000;
                const remainingWait = Math.max(0, elevWaitSeconds - timeSpentHere);
                totalSeconds += remainingWait;
            } else {
                totalSeconds += timePerFloor;
            }
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
    let targetSeconds = totalSeconds - elapsedSinceUpdate;
    if (targetSeconds < 0) targetSeconds = 0;

    // Smooth display layer: tick down 1s/s on the local clock; ease toward target on big diffs.
    const prev = elevatorDisplayedETA[elevatorId];
    let displayValue;
    if (!prev) {
        displayValue = targetSeconds;
    } else {
        const tickElapsed = Math.max(0, (currentTime - prev.lastTick) / 1000);
        const decremented = Math.max(0, prev.value - tickElapsed);
        const diff = targetSeconds - decremented;
        const ABS_DIFF_TOLERANCE = 3;
        const SMOOTH_RATE = 0.20;
        if (Math.abs(diff) <= ABS_DIFF_TOLERANCE) {
            displayValue = decremented;
        } else {
            displayValue = decremented + (diff * SMOOTH_RATE);
        }
    }
    elevatorDisplayedETA[elevatorId] = { value: displayValue, lastTick: currentTime };

    if (displayValue <= 60 && isDirectPath) { // FIX: Only blink if direct path
        if (panel && !panel.classList.contains('approaching')) {
            panel.classList.add('approaching');
        }
    } else {
        if (panel && panel.classList.contains('approaching')) {
            panel.classList.remove('approaching');
        }
    }

    // Fix 60 seconds display issue: Round total first, then split
    const totalSecondsRounded = Math.round(displayValue);
    const minutes = Math.floor(totalSecondsRounded / 60);
    const seconds = totalSecondsRounded % 60;
    etaResultElement.textContent = `בעוד ${minutes}:${seconds.toString().padStart(2, '0')} דק'`;
    applyEtaResultScale(etaResultElement);
}

function updateElevatorDisplay(elevatorId, stateData) {
    const panel = document.getElementById(`panel-${elevatorId}`);
    if (!panel) return;
    const floorElement = document.getElementById(`floorNumber-${elevatorId}`);
    const arrowElement = document.getElementById(`arrowIcon-${elevatorId}`);
    const stopElement = document.getElementById(`stopIcon-${elevatorId}`);

    if (!stateData) {
        if(floorElement) { floorElement.textContent = '--'; floorElement.style.removeProperty('--fi-scale'); }
        if(arrowElement) arrowElement.style.display = 'none';
        if(stopElement) stopElement.style.display = 'none';
        return;
    }
    if (floorElement) {
        const displayText = getFloorDisplayName(stateData.floor) ?? '--';
        floorElement.textContent = displayText;
        floorElement.style.setProperty('--fi-scale', floorFontScale(displayText));
    }
    
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

// ====================================================================
// PANEL ORIENTATION OBSERVER — layout-v2 only
// Writes data-orientation="wide" | "tall" onto every .elevator-panel
// based on its live aspect ratio. The CSS picks the right grid layout
// from that attribute. We need JS because @container queries can only
// style DESCENDANTS of the container, not the container itself.
//
// Strategy: a single ResizeObserver on the dashboard-container fires
// whenever the dashboard changes size (viewport resize, layout shift).
// On each fire we re-measure all panels and set data-orientation.
// Plus an initial pass + a MutationObserver to catch dynamically-
// created panels (when Firebase delivers the elevator list).
// ====================================================================
(function() {
    if (!document.body || !document.body.classList.contains('layout-v2')) return;
    if (typeof ResizeObserver === 'undefined') return;

    var ASPECT_THRESHOLD = 1.4;  // width / height ≥ 1.4 → WIDE, else → TALL

    function updatePanelOrientation(p) {
        var r = p.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        var orient = (r.width / r.height >= ASPECT_THRESHOLD) ? 'wide' : 'tall';
        if (p.dataset.orientation !== orient) {
            p.dataset.orientation = orient;
        }
    }
    function updateAllPanels() {
        document.querySelectorAll('.elevator-panel').forEach(updatePanelOrientation);
    }

    // Run once now (in case panels already exist), then on every viewport
    // change, every layout shift (via #displayContainer's RO), and every
    // newly-added panel (via MutationObserver).
    updateAllPanels();
    window.addEventListener('resize', updateAllPanels);

    // ResizeObserver on the dashboard's parent (which doesn't have
    // container-type, so RO behaves predictably) — catches layout shifts
    // that don't trigger window resize (e.g. banner appearing).
    var rootObs = document.getElementById('displayContainer') || document.body;
    new ResizeObserver(updateAllPanels).observe(rootObs);

    // Catch dynamically-inserted panels and run an immediate sweep.
    new MutationObserver(function(muts) {
        var added = false;
        muts.forEach(function(m) {
            m.addedNodes.forEach(function(n) {
                if (n.nodeType !== 1) return;
                if (n.classList && n.classList.contains('elevator-panel')) added = true;
                else if (n.querySelector && n.querySelector('.elevator-panel')) added = true;
            });
        });
        if (added) {
            // RAF lets the browser do layout first so getBoundingClientRect is accurate.
            requestAnimationFrame(updateAllPanels);
        }
    }).observe(document.body, { childList: true, subtree: true });
})();