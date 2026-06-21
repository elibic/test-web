// --- EXPLICIT GLOBALS (Critical Fix) ---
// Note: auth removed since login is bypassed completely
const database = window.database || firebase.database();

// --- APPLY APP CONFIGURATION (Dynamic Injection) ---
function applyAppConfig() {
    if (!window.appConfig) return;
    const cfg = window.appConfig;

    // 1. Branding Images
    const topLogo = document.querySelector('.top-logo');
    if (topLogo && cfg.branding.logoUrl) topLogo.src = cfg.branding.logoUrl;

    const poweredBy = document.querySelector('.bottom-left-logo');
    if (poweredBy && cfg.branding.poweredByUrl) poweredBy.src = cfg.branding.poweredByUrl;

    // 2. Favicons
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon && cfg.branding.faviconUrl) favicon.href = cfg.branding.faviconUrl;

    const appleIcon = document.querySelector("link[rel='apple-touch-icon']");
    if (appleIcon && cfg.branding.appleTouchIconUrl) appleIcon.href = cfg.branding.appleTouchIconUrl;

    // 3. Meta Theme Color
    const metaTheme = document.querySelector("meta[name='theme-color']");
    if (metaTheme && cfg.branding.themeColor) metaTheme.content = cfg.branding.themeColor;

    // 4. Texts
    if (cfg.texts.title) document.title = cfg.texts.title;
    
    const phoneEl = document.getElementById('contactPhone');
    if (phoneEl && cfg.texts.contactDisplayPhone) phoneEl.textContent = cfg.texts.contactDisplayPhone;

    const waLink = document.querySelector('.contact-link-action');
    if (waLink && cfg.texts.whatsappLink) waLink.href = cfg.texts.whatsappLink;
}

// Call immediately to update UI before full load
applyAppConfig();


// --- SERVICE WORKER REGISTRATION (New PWA Requirement) ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
    .then(reg => console.log('Service Worker registered', reg))
    .catch(err => console.log('Service Worker error', err));
}

console.log("Script loaded. DB reference secured.");

// --- CONFIGURATION ---
let THIS_SCREEN_FLOOR = null;
let THIS_SCREEN_FLOOR_NUM = null;

let tempSelectedFloor = null;

// Screen Lock State Variables
let isScreenLocked = false;     // Tracks actual API status
let shouldBeLocked = false;     // Tracks user intention (Persist across tab switches)
let wakeLockInstance = null;

// PWA Install Prompt Variable
let deferredPrompt = null;

const STALE_TIMEOUT = 30000;
const INTERPOLATION_DELAY = 500;

// --- LOCALIZATION DICTIONARY ---
const translations = {
    he: {
        dir: 'rtl',
        loading: "טוען מערכת...",
        shabbatShalom: "שבת שלום",
        keepScreen: "השאר מסך דולק",
        screenActive: "המסך דולק",
        contactTitle: "צור קשר",
        phone: "טלפון: 052-5705289",
        clickHere: "לחץ כאן לשליחת הודעה",
        welcomeTitle: "ברוכים הבאים!",
        welcomeText: "יש לחבר את המכשיר למטען וללחוץ על כפתור <b>'השאר מסך דולק'</b>, כדי להבטיח שהמסך יישאר פעיל לאורך השבת.",
        understand: "השאר מסך דולק", 
        floor: "קומה",
        up: "עלייה",
        down: "ירידה",
        stopped: "עצרה",
        etaPrefix: "המעלית תגיע לקומה", 
        etaSuffix: "בעוד",
        arrived: "המעלית כאן",
        mins: "דק'",
        popupCharger: "המסך יישאר דולק. מומלץ לחבר למטען.",
        popupError: "הפעולה נכשלה. ייתכן שהדפדפן לא תומך.",
        settingsTitle: "הגדרות",
        selectFloor: "בחר קומת ברירת מחדל:",
        save: "שמור שינויים",
        close: "סגור",
        break: "מצב שבת בהפסקה",
        notStopping: "לא עוצרת בקומה זו",
        error: "שגיאה",
        here: "המעלית כאן",
        installBtnText: "התקן אפליקציה",
        installTitle: "התקנת האפליקציה",
        androidInstallText: "מומלץ להתקין את האפליקציה לחוויית שימוש טובה יותר וגישה מהירה.",
        doInstallBtn: "התקן כעת",
        iosInstallText: "כדי להתקין באייפון:",
        iosStep1: "לחץ על כפתור השיתוף",
        iosStep2: "גלול למטה ובחר \"הוסף למסך הבית\"",
        iosCloseBtn: "הבנתי, תודה",
        manualInstallText: "התקנה ידנית:",
        manualStep1: "לחץ על תפריט הדפדפן (3 נקודות)",
        manualStep2: "בחר ב\"התקנת האפליקציה\" או \"הוסף למסך הבית\"",
        noShabbatElev: "המתנה למעלית פעילה..."
    },
    en: {
        dir: 'ltr',
        loading: "Loading System...",
        shabbatShalom: "Shabbat Shalom",
        keepScreen: "Keep Screen On",
        screenActive: "Screen Active",
        contactTitle: "Contact Us",
        phone: "Phone: 052-5705289",
        clickHere: "Click here to send message",
        welcomeTitle: "Welcome!",
        welcomeText: "Please connect device to charger and click the <b>'Keep Screen On'</b> button to ensure screen stays active.",
        understand: "Keep Screen On",
        floor: "Floor",
        up: "Going Up",
        down: "Going Down",
        stopped: "Stopped",
        etaPrefix: "Elevator arriving at floor",
        etaSuffix: "in",
        arrived: "Elevator Here",
        mins: "min",
        popupCharger: "Screen will stay on. Connect charger.",
        popupError: "Action failed. Browser might not support.",
        settingsTitle: "Settings",
        selectFloor: "Select Default Floor:",
        save: "Save Changes",
        close: "Close",
        break: "Shabbat Mode Break",
        notStopping: "Not stopping at this floor",
        error: "Error",
        here: "Elevator Here",
        installBtnText: "Install App",
        installTitle: "Install App",
        androidInstallText: "Install the app for better performance and quick access.",
        doInstallBtn: "Install Now",
        iosInstallText: "To install on iPhone:",
        iosStep1: "Tap the Share button",
        iosStep2: "Scroll down and select \"Add to Home Screen\"",
        iosCloseBtn: "Got it, Thanks",
        manualInstallText: "Manual Installation:",
        manualStep1: "Tap the browser menu (3 dots)",
        manualStep2: "Select \"Install App\" or \"Add to Home Screen\"",
        noShabbatElev: "Waiting for active elevator..."
    }
};

let storedLang = localStorage.getItem('app_lang');
let currentLang = storedLang ? storedLang : 'he';

let serverTimeOffset = 0;
let currentHebrewDateCache = "טוען...";

let elevatorStates = {}, latestElevatorsData = null, settings = null, elevatorConfigs = null;

// --- Shabbat override helper ---
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
const PAGE_KEY = 'index';
function _bannerEscape(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
let _bannerResizeObserver = null;
function _updateBannerHeightVar(host) {
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
    if (!host) {
        document.documentElement.style.setProperty('--bottom-bar-h', '0px');
        return;
    }
    const isHidden = getComputedStyle(host).display === 'none';
    const h = isHidden ? 0 : (host.offsetHeight || 0);
    document.documentElement.style.setProperty('--bottom-bar-h', `${h}px`);
}
function initBottomBarObserver() {
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
let elevatorArrivalTimes = {};
let elevatorDisplayedETA = {}; // Smooth display layer: { id: { value: seconds, lastTick: ms } }
let floorAliases = {}; // Floor display name mapping (physical -> alias)

// --- Floor Alias Helper: Returns display name for a physical floor ---
function getFloorDisplayName(physicalFloor) {
    if (physicalFloor === null || physicalFloor === undefined) return '--';
    const key = String(physicalFloor);
    return floorAliases[key] || key;
}

// --- Font scale for floor-indicator: shrink when alias is long ---
function floorFontScale(text) {
    const len = (text || '').length;
    if (len <= 3) return '1';
    if (len <= 6) return '0.65';
    return '0.45';
}

// --- Font scale for ETA destination floor name: shrink when name is long ---
function floorLabelScale(text) {
    const len = (text || '').length;
    if (len <= 8) return '1';
    if (len <= 15) return '0.75';
    return '0.55';
}

// --- Font scale for ETA result line: shrink when state text is long ---
function etaResultScale(text) {
    const len = (text || '').length;
    if (len <= 12) return '1';
    if (len <= 18) return '0.8';
    if (len <= 24) return '0.65';
    return '0.55';
}
function applyEtaResultScale(el) {
    if (el) el.style.setProperty('--er-scale', etaResultScale(el.textContent));
}

// --- DOM ELEMENTS ---
const ui = {
    loadingOverlay: document.getElementById('loadingOverlay'),
    displayContainer: document.getElementById('displayContainer'),
    dashboard: document.querySelector('.dashboard-container'),
    notification: document.getElementById('notificationPopup'),
    initialPrompt: document.getElementById('initialPromptModal'),
    contactModal: document.getElementById('contactModal'),
    settingsModal: document.getElementById('settingsModal'),
    screenBtn: document.getElementById('screenLockButton'),
    keepScreenOnTxt: document.getElementById('keepScreenOnTxt'),
    floorSelectorModal: document.getElementById('floorSelectorModal'),
    modalFloorGrid: document.getElementById('modalFloorGrid'),
    settingsFloorGrid: document.getElementById('settingsFloorGrid'),
    installAppBtn: document.getElementById('installAppBtn'),
    installModal: document.getElementById('installModal'),
    androidInstallContent: document.getElementById('androidInstallContent'),
    iosInstallContent: document.getElementById('iosInstallContent'),
    manualInstallContent: document.getElementById('manualInstallContent'),
    installTitle: document.getElementById('installTitle')
};

// --- IOS DETECTION ---
function isIOS() {
    return [
        'iPad Simulator',
        'iPhone Simulator',
        'iPod Simulator',
        'iPad',
        'iPhone',
        'iPod'
    ].includes(navigator.platform) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
}

function isInStandaloneMode() {
    return (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator.standalone) || document.referrer.includes('android-app://');
}

// --- PWA LOGIC ---
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log("Install prompt captured");
    showInstallPromotion(); 
});

// Force display check
function showInstallPromotion() {
    if (isInStandaloneMode()) return;
    const btn = document.getElementById('installAppBtn');
    if (btn) btn.style.display = 'inline-flex';

    const isAppInstalled = localStorage.getItem('app_installed_prompt_shown');
    if (!isAppInstalled) {
        setTimeout(() => {
            openInstallModal();
            localStorage.setItem('app_installed_prompt_shown', 'true');
        }, 2000); 
    }
}

function openInstallModal() {
    const modal = document.getElementById('installModal');
    if (modal) {
        modal.style.display = 'flex';
        const android = document.getElementById('androidInstallContent');
        const ios = document.getElementById('iosInstallContent');
        const manual = document.getElementById('manualInstallContent');
        
        if(android) android.style.display = 'none';
        if(ios) ios.style.display = 'none';
        if(manual) manual.style.display = 'none';

        if (isIOS()) {
           if(ios) ios.style.display = 'block';
        } 
        else if (deferredPrompt) {
           if(android) android.style.display = 'block';
        }
        else {
           if(manual) manual.style.display = 'block';
        }
    }
}
window.openInstallModal = openInstallModal;

function closeInstallModal() {
    const modal = document.getElementById('installModal');
    if(modal) modal.style.display = 'none';
}
window.closeInstallModal = closeInstallModal;

function triggerInstall() {
    if (deferredPrompt) {
        closeInstallModal();
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the A2HS prompt');
                const btn = document.getElementById('installAppBtn');
                if(btn) btn.style.display = 'none';
            }
            deferredPrompt = null;
        });
    } else {
        alert(translations[currentLang].manualInstallText);
    }
}
window.triggerInstall = triggerInstall;

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
        if (endFloor > startFloor) { return sortedStops.filter(f => f > startFloor && f < endFloor).length; } 
        else { return sortedStops.filter(f => f < startFloor && f > endFloor).length; }
}

function shouldShowElevator(elevatorId) {
    const floorToCheck = THIS_SCREEN_FLOOR;
    if (!floorToCheck) return true;
    
    const config = elevatorConfigs[elevatorId];
    if (!config) return true;

    // Effective Shabbat=false: Hide from mobile app completely
    if (effectiveShabbatActive(config) === false) return false;

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

// --- Empty-state ("המתנה למעלית פעילה...") ---
function ensureEmptyState() {
    const container = ui.dashboard;
    if (!container) return null;
    let el = container.querySelector('.empty-state');
    if (!el) {
        el = document.createElement('div');
        el.className = 'empty-state';
        el.textContent = (translations[currentLang] && translations[currentLang].noShabbatElev) || 'המתנה למעלית פעילה...';
        container.appendChild(el);
    } else {
        // Refresh text in case language was toggled
        el.textContent = (translations[currentLang] && translations[currentLang].noShabbatElev) || 'המתנה למעלית פעילה...';
    }
    return el;
}
function setEmptyStateVisible(show) {
    const el = ensureEmptyState();
    if (!el) return;
    el.style.display = show ? 'flex' : 'none';
    document.body.classList.toggle('empty-state-mode', !!show);
}

function updateDashboard() {
    const container = ui.dashboard;
    if (!latestElevatorsData) {
        if (container) {
            Array.from(container.children).forEach(child => {
                if (!child.classList.contains('empty-state')) child.remove();
            });
        }
        setEmptyStateVisible(true);
        return;
    }
    const sortedIds = Object.keys(latestElevatorsData).sort();
    const visibleIds = sortedIds.filter(id => shouldShowElevator(id));

    Array.from(container.children).forEach(child => {
        if (child.classList.contains('empty-state')) return;
        const id = child.id.replace('panel-', '');
        if (!visibleIds.includes(id)) child.remove();
    });

    if (visibleIds.length === 0) {
        setEmptyStateVisible(true);
        return;
    }
    setEmptyStateVisible(false);

    visibleIds.forEach(id => {
        let panel = document.getElementById(`panel-${id}`);
        if (!panel) {
            panel = createPanel(id);
            container.appendChild(panel);
        }
        updateShabbatLabel(id);
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
        <div class="shabbat-elev-label" id="shabbat-${id}" style="display:none;">מעלית שבת</div>
        <div class="floor-indicator" id="floor-${id}">--</div>
        <div class="direction-status" id="dir-${id}"></div>
        <div class="eta-display">
            <div class="floor-label" id="etaLabel-${id}"></div>
            <div class="eta-result" id="eta-${id}"></div>
        </div>
    `;
    return div;
}

function updateShabbatLabel(id) {
    const lbl = document.getElementById(`shabbat-${id}`);
    if (!lbl) return;
    const isShab = effectiveShabbatActive(elevatorConfigs && elevatorConfigs[id]);
    lbl.style.display = isShab ? 'inline-block' : 'none';
}

async function processElevatorUpdate(id, newData) {
    const currentState = elevatorStates[id] || {};
    const lastFloorNum = getNumericFloor(currentState.floor);
    const currentFloorNum = getNumericFloor(newData.floor);

    if (currentFloorNum === null) return;
    
    if (currentState.floor === newData.floor) return;

    const config = elevatorConfigs[id] || {};
    const elevFloorWaits = config.FLOOR_WAITS || {};
    const hasWaitAtCurrent = parseFloat(elevFloorWaits[String(currentFloorNum)] || 0) > 0
        || (currentFloorNum === 0 && config.ZERO_FLOOR_WAIT_ACTIVE);

    if (hasWaitAtCurrent) {
        if (lastFloorNum !== currentFloorNum || !elevatorArrivalTimes[id]) {
            elevatorArrivalTimes[id] = Date.now();
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

    const newState = {
        floor: newData.floor,
        direction: newDirection,
        lastMovingDirection: (newDirection === 'up' || newDirection === 'down')
            ? newDirection
            : (currentState.lastMovingDirection || null),
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
    
    const floorMap = new Map();
    const config = elevatorConfigs ? elevatorConfigs[elevatorId] : null;
    
    if (config && config.STOPPING_FLOORS) {
        config.STOPPING_FLOORS.forEach(floor => {
            floorMap.set(getNumericFloor(floor), floor);
        });
    }

    for (let floor = startNum + step; floor !== endNum; floor += step) {
        const displayFloor = floorMap.get(floor) || floor.toString();
        const intermediateState = { floor: displayFloor, direction: direction };
        updateElevatorDisplay(elevatorId, intermediateState);
        await new Promise(resolve => setTimeout(resolve, INTERPOLATION_DELAY));
    }
    updateElevatorDisplay(elevatorId, finalState);
}

function updateElevatorDisplay(id, stateData) {
    const t = translations[currentLang];
    
    const labelEl = document.getElementById(`lbl-${id}`);
    
    let elevatorName = "";
    if (window.appConfig && window.appConfig.elevatorNames && window.appConfig.elevatorNames[id]) {
        elevatorName = window.appConfig.elevatorNames[id][currentLang] || window.appConfig.elevatorNames[id]['he'] || `מעלית ${id}`;
    } else {
        elevatorName = t.dir === 'rtl' ? `מעלית ${id}` : `Elevator ${id}`;
    }
    
    if(labelEl) labelEl.textContent = elevatorName;
    
    const etaLabel = document.getElementById(`etaLabel-${id}`);
    if(etaLabel) {
        etaLabel.textContent = `${t.etaPrefix} ${getFloorDisplayName(THIS_SCREEN_FLOOR)} ${t.etaSuffix}`;
        etaLabel.style.setProperty('--fl-scale', floorLabelScale(etaLabel.textContent));
    }
    
    const floorEl = document.getElementById(`floor-${id}`);
    const dirContainer = document.getElementById(`dir-${id}`);

    if (!stateData) {
        if(floorEl) { floorEl.textContent = '--'; floorEl.style.removeProperty('--fi-scale'); }
        if(dirContainer) dirContainer.innerHTML = '';
        return;
    }

    if (floorEl) {
        const displayText = getFloorDisplayName(stateData.floor) || '--';
        floorEl.textContent = displayText;
        floorEl.style.setProperty('--fi-scale', floorFontScale(displayText));
    }
    
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
    const etaLabelEl = document.getElementById(`etaLabel-${id}`);
    
    const t = translations[currentLang];
    const config = elevatorConfigs[id];
    
    if (!config || !settings) { el.textContent = "..."; applyEtaResultScale(el); return; }

    const panel = document.getElementById(`panel-${id}`);
    const resetPanelStyle = () => {
        if (panel && panel.classList.contains('approaching')) {
            panel.classList.remove('approaching');
        }
    };
    
    if (etaLabelEl) etaLabelEl.style.visibility = 'visible';

    const breakActive = config.SHABBAT_BREAK_ACTIVE || false;
    if (breakActive) {
        const now = new Date(Date.now() + (serverTimeOffset || 0));
        let activeBreaks = config.SHABBAT_BREAKS || [];

        if ((!activeBreaks || activeBreaks.length === 0) && config.SHABBAT_BREAK_START && config.SHABBAT_BREAK_END) {
            activeBreaks = [{ start: config.SHABBAT_BREAK_START, end: config.SHABBAT_BREAK_END }];
        }

        let isCurrentlyOnBreak = false;

        if (Array.isArray(activeBreaks)) {
            for (let i = 0; i < activeBreaks.length; i++) {
                const brk = activeBreaks[i];
                if (!brk.start || !brk.end) continue;

                const [startH, startM] = brk.start.split(':').map(Number);
                const [endH, endM] = brk.end.split(':').map(Number);

                const startTime = new Date(now);
                startTime.setHours(startH, startM, 0, 0);

                const endTime = new Date(now);
                endTime.setHours(endH, endM, 0, 0);

                if (now >= startTime && now <= endTime) {
                    isCurrentlyOnBreak = true;
                    break;
                }
            }
        }

        if (isCurrentlyOnBreak) {
            el.textContent = t.break;
            applyEtaResultScale(el);
            if (etaLabelEl) etaLabelEl.style.visibility = 'hidden';
            resetPanelStyle();
            delete elevatorDisplayedETA[id];
            return;
        }
    }

    const userFloorNum = getNumericFloor(THIS_SCREEN_FLOOR);
    const topFloorNum = getNumericFloor(config.TOP_FLOOR ?? settings.TOP_FLOOR);
    const bottomFloorNum = getNumericFloor(config.BOTTOM_FLOOR ?? settings.BOTTOM_FLOOR);

    if (userFloorNum === null) { el.textContent = t.error; applyEtaResultScale(el); return; }

    let stopsUp = config.STOPPING_FLOORS_UP || [];
    let stopsDown = config.STOPPING_FLOORS_DOWN || [];
    
    const canStopUp = stopsUp.length === 0 || stopsUp.map(String).includes(String(THIS_SCREEN_FLOOR));
    const canStopDown = stopsDown.length === 0 || stopsDown.map(String).includes(String(THIS_SCREEN_FLOOR));
    
    if (!canStopUp && !canStopDown) {
        el.textContent = t.notStopping;
        applyEtaResultScale(el);
        if (etaLabelEl) etaLabelEl.style.visibility = 'hidden';
        delete elevatorDisplayedETA[id];
        return;
    }

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
        applyEtaResultScale(el);
        if (etaLabelEl) etaLabelEl.style.visibility = 'hidden';

        if (panel && !panel.classList.contains('approaching')) {
            panel.classList.add('approaching');
        }
        delete elevatorDisplayedETA[id];
        return;
    }
    
    let effectiveDirection = state.direction;
    if (effectiveDirection === 'stopped' || effectiveDirection === ' ') {
        if (elevatorFloorNum === bottomFloorNum) effectiveDirection = 'up';
        else if (elevatorFloorNum === topFloorNum) effectiveDirection = 'down';
        else if (state.lastMovingDirection) effectiveDirection = state.lastMovingDirection;
        else effectiveDirection = 'up';
    }
    
    const timePerFloor = parseFloat(config.TIME_PER_FLOOR ?? settings.TIME_PER_FLOOR ?? 0); 
    let timePassFloor = parseFloat(config.TIME_PASS_FLOOR || 0);
    if (timePassFloor === 0) {
            const expressTimeUp = parseFloat(config.EXPRESS_TIME_UP ?? settings.EXPRESS_TIME_UP ?? 0);
            const totalTravelDistance = Math.abs(topFloorNum - bottomFloorNum) || 1;
            if(expressTimeUp > 0) timePassFloor = expressTimeUp / totalTravelDistance;
    }
    
    // --- FLOOR_WAITS: per-floor dwell times ---
    const floorWaits = Object.assign({}, config.FLOOR_WAITS || {});
    if (config.ZERO_FLOOR_WAIT_ACTIVE && !('0' in floorWaits)) {
        const legacy = parseFloat(config.ZERO_FLOOR_WAIT_SECONDS || 0);
        if (legacy > 0) floorWaits['0'] = legacy;
    }
    const getFloorWait = (f) => parseFloat(floorWaits[String(f)] || 0);

    const stopsUpNums = new Set(stopsUp.map(getNumericFloor).filter(v => v !== null));
    const stopsDownNums = new Set(stopsDown.map(getNumericFloor).filter(v => v !== null));

    const calcSegmentTime = (start, end, dir) => {
        const list = (dir === 'up') ? stopsUp : stopsDown;
        let stopsCount = countStopsInList(start, end, list);
        const steps = Math.abs(end - start);
        if (steps === 0) return 0;

        let time = 0;
        const passCount = steps - stopsCount;
        time += (stopsCount * timePerFloor) + (passCount * timePassFloor);

        // Add FLOOR_WAITS for intermediate stops in this direction.
        // FLOOR_WAITS replaces the brief-stop cost, so subtract the stop-vs-pass
        // delta we already counted above (timePerFloor - timePassFloor) to avoid
        // double-counting. Net cost for a FLOOR_WAITS floor becomes:
        //   timePassFloor (travel) + FLOOR_WAITS (dwell)
        // instead of timePerFloor (brief stop) + FLOOR_WAITS (dwell).
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

    const addFloorWaitAt = (floor) => {
        const wait = getFloorWait(floor);
        if (wait > 0) return wait;
        // Terminal stops (BOTTOM/TOP) have STOP_TIME turnaround dwell even without FLOOR_WAITS.
        // Skip when the elevator is AT this terminal — the current-floor block handles that case.
        if ((floor === topFloorNum || floor === bottomFloorNum) && floor !== elevatorFloorNum) return timePerFloor;
        return 0;
    };

    let totalSeconds = 0;
    let isDirectPath = false; 

    if (effectiveDirection === 'up') {
        if (userFloorNum > elevatorFloorNum) {
            if (canStopUp) {
                totalSeconds = calcSegmentTime(elevatorFloorNum, userFloorNum, 'up');
                isDirectPath = true;
            } else {
                totalSeconds = calcSegmentTime(elevatorFloorNum, topFloorNum, 'up');
                totalSeconds += addFloorWaitAt(topFloorNum);
                totalSeconds += calcSegmentTime(topFloorNum, userFloorNum, 'down');
            }
        } else {
            if (canStopDown) {
                totalSeconds = calcSegmentTime(elevatorFloorNum, topFloorNum, 'up');
                totalSeconds += addFloorWaitAt(topFloorNum);
                totalSeconds += calcSegmentTime(topFloorNum, userFloorNum, 'down');
            } else {
                totalSeconds = calcSegmentTime(elevatorFloorNum, topFloorNum, 'up');
                totalSeconds += addFloorWaitAt(topFloorNum);
                totalSeconds += calcSegmentTime(topFloorNum, bottomFloorNum, 'down');
                totalSeconds += addFloorWaitAt(bottomFloorNum);
                totalSeconds += calcSegmentTime(bottomFloorNum, userFloorNum, 'up');
            }
        }
    } else {
        if (userFloorNum < elevatorFloorNum) {
            if (canStopDown) {
                totalSeconds = calcSegmentTime(elevatorFloorNum, userFloorNum, 'down');
                isDirectPath = true;
            } else {
                totalSeconds = calcSegmentTime(elevatorFloorNum, bottomFloorNum, 'down');
                totalSeconds += addFloorWaitAt(bottomFloorNum);
                totalSeconds += calcSegmentTime(bottomFloorNum, userFloorNum, 'up');
            }
        } else {
            if (canStopUp) {
                totalSeconds = calcSegmentTime(elevatorFloorNum, bottomFloorNum, 'down');
                totalSeconds += addFloorWaitAt(bottomFloorNum);
                totalSeconds += calcSegmentTime(bottomFloorNum, userFloorNum, 'up');
            } else {
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
    // `elapsedSinceUpdate` subtraction below handles the decay so the value smoothly drops.
    const elevWaitSeconds = getFloorWait(elevatorFloorNum);
    const currentFloorStopList = (effectiveDirection === 'up') ? stopsUp : stopsDown;
    const currentFloorIsStop = currentFloorStopList.map(getNumericFloor).includes(elevatorFloorNum)
        || elevatorFloorNum === bottomFloorNum
        || elevatorFloorNum === topFloorNum;

    if (currentFloorIsStop && elevatorFloorNum !== userFloorNum) {
        if (elevWaitSeconds > 0) {
            const snapshotTime = state.timestamp || Date.now();
            const arrivalTime = elevatorArrivalTimes[id] || snapshotTime;
            const timeSpentHere = (snapshotTime - arrivalTime) / 1000;
            const remainingWait = Math.max(0, elevWaitSeconds - timeSpentHere);
            totalSeconds += remainingWait;
        } else {
            totalSeconds += timePerFloor;
        }
    }
    
    const elapsedSinceUpdate = (Date.now() - (state.timestamp || Date.now())) / 1000;
    let targetSeconds = totalSeconds - elapsedSinceUpdate;
    if (targetSeconds < 0) targetSeconds = 0;

    // Smooth display layer: tick down 1s/s on the local clock; ease toward target on big diffs.
    const now = Date.now();
    const prev = elevatorDisplayedETA[id];
    let displayValue;
    if (!prev) {
        displayValue = targetSeconds;
    } else {
        const tickElapsed = Math.max(0, (now - prev.lastTick) / 1000);
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
    elevatorDisplayedETA[id] = { value: displayValue, lastTick: now };

    if (displayValue <= 60 && isDirectPath) {
        if (panel && !panel.classList.contains('approaching')) {
            panel.classList.add('approaching');
        }
    } else {
        if (panel && panel.classList.contains('approaching')) {
            panel.classList.remove('approaching');
        }
    }

    const totalSecondsRounded = Math.round(displayValue);
    const mins = Math.floor(totalSecondsRounded / 60);
    const secs = totalSecondsRounded % 60;

    el.textContent = `${mins}:${secs.toString().padStart(2,'0')} ${t.mins}`;
    applyEtaResultScale(el);
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded, initializing app...");
    showInstallPromotion();
    ui.loadingOverlay.style.display = 'flex';
    initBottomBarObserver();
    initializeApp();
});

// --- SETTINGS LOGIC ---
function openSettingsModal() {
    ui.settingsModal.style.display = 'flex';
    populateFloorGrids(THIS_SCREEN_FLOOR);
    tempSelectedFloor = THIS_SCREEN_FLOOR;
}
window.openSettingsModal = openSettingsModal;

function closeSettingsModal() {
    ui.settingsModal.style.display = 'none';
}
window.closeSettingsModal = closeSettingsModal;

function saveSettingsAndClose() {
    const newFloor = tempSelectedFloor;
    if (newFloor !== null) {
        localStorage.setItem('user_default_floor', newFloor);
        location.reload();
    } else {
        alert("Please select a floor first.");
    }
}
window.saveSettingsAndClose = saveSettingsAndClose;

// --- APP INITIALIZATION ---
async function initializeApp() {
    console.log("Initializing app configurations...");
    initializeClock();

    try {
        applyLanguage();

        // Load configs immediately
        const [sSnap, cSnap] = await Promise.all([
            database.ref('settings').once('value'), 
            database.ref('elevator_configs').once('value')
        ]);

        settings = sSnap.val() || {};
        floorAliases = settings.FLOOR_ALIASES || {};
        elevatorConfigs = cSnap.val() || {};

        renderSystemBanners();
        database.ref('settings').on('value', (snap) => {
            settings = snap.val() || {};
            floorAliases = settings.FLOOR_ALIASES || {};
            renderSystemBanners();
        });
        initRemoteReloadListener('index');

        populateFloorGrids(null);

        // ONLY use local storage for floor logic
        let savedFloor = localStorage.getItem('user_default_floor');
        populateFloorGrids(savedFloor);

        if (savedFloor !== null && savedFloor !== undefined) {
            THIS_SCREEN_FLOOR = savedFloor;
            THIS_SCREEN_FLOOR_NUM = parseInt(THIS_SCREEN_FLOOR, 10);
            startDashboard();
        } else {
            ui.loadingOverlay.style.display = 'none';
            ui.floorSelectorModal.style.display = 'flex';
        }

    } catch (e) {
        console.error("Initialization error:", e);
        alert("Error loading data: " + (e.message || e));
        ui.loadingOverlay.style.display = 'none'; 
    }
}

const _elevatorChildRefs = {};
function subscribeElevatorChildren(ids) {
    ids.forEach(id => {
        if (_elevatorChildRefs[id]) return; // כבר מנוי
        const ref = database.ref('elevators/' + id);
        ref.on('value', (snapshot) => {
            try {
                const val = snapshot.val();
                if (val === null) delete latestElevatorsData[id];
                else latestElevatorsData[id] = val;
                updateDashboard();
                ui.loadingOverlay.style.display = 'none';
                ui.displayContainer.style.display = 'flex';
            } catch (e) {
                console.error("Error in dashboard update:", e);
                ui.loadingOverlay.style.display = 'none';
            }
        });
        _elevatorChildRefs[id] = ref;
    });
}

function startDashboard() {
    console.log("Starting dashboard...");
    // מאזין נפרד לכל מעלית (במקום on('value') על כל /elevators) — חוסך רוחב פס
    database.ref('elevators').once('value').then((snapshot) => {
        latestElevatorsData = snapshot.val() || {};
        const ids = new Set([
            ...Object.keys(latestElevatorsData),
            ...Object.keys(elevatorConfigs || {})
        ]);
        subscribeElevatorChildren(Array.from(ids));
    });

    // Live listener so the detector's SHABBAT_ACTIVE writes update visibility in real time
    database.ref('elevator_configs').on('value', (snapshot) => {
        elevatorConfigs = snapshot.val() || {};
        subscribeElevatorChildren(Object.keys(elevatorConfigs || {}));
        updateDashboard();
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
    const proceed = () => {
        ui.floorSelectorModal.style.display = 'none';
        ui.loadingOverlay.style.display = 'flex';
        THIS_SCREEN_FLOOR = selectedFloor;
        THIS_SCREEN_FLOOR_NUM = parseInt(THIS_SCREEN_FLOOR, 10);
        localStorage.setItem('user_default_floor', selectedFloor);
        startDashboard();
    };

    if (selectedFloor !== null) {
        proceed();
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
            const alias = getFloorDisplayName(i);
            btn.textContent = alias;
            btn.title = (alias !== String(i)) ? `${alias} (קומה ${i})` : `קומה ${i}`;
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
    if (ui.displayContainer.style.display !== 'none') {
        ui.initialPrompt.style.display = 'flex';
    }
}
window.toggleLanguage = toggleLanguage;

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function applyLanguage() {
    const t = translations[currentLang];
    document.documentElement.lang = currentLang;
    document.documentElement.dir = t.dir;
    
    const controls = document.querySelector('.side-controls-container');
    if(controls) {
        if(t.dir === 'ltr') controls.style.flexDirection = 'row-reverse';
        else controls.style.flexDirection = 'row';
    }

    safeSetText('loadingText', t.loading);
    safeSetText('headerText', t.shabbatShalom);
    
    if (ui.keepScreenOnTxt) ui.keepScreenOnTxt.textContent = isScreenLocked ? t.screenActive : t.keepScreen;
    
    const msgEl = document.getElementById('persistentScreenMsg');
    if (isScreenLocked && msgEl) msgEl.textContent = t.popupCharger;

    safeSetText('welcomeTitle', t.welcomeTitle);
    const welText = document.getElementById('welcomeText');
    if(welText) welText.innerHTML = t.welcomeText;
    
    safeSetText('welcomeScreenBtn', t.understand); 
    safeSetText('contactTitle', t.contactTitle);
    safeSetText('contactPhone', t.phone);
    safeSetText('clickHereTxt', t.clickHere);
    safeSetText('settingsTitleTxt', t.settingsTitle);
    safeSetText('selectFloorLabel', t.selectFloor);
    safeSetText('saveSettingsBtn', t.save);
    safeSetText('closeSettingsBtn', t.close);

    safeSetText('initialFloorTitle', t.settingsTitle);
    safeSetText('initialSelectFloorLabel', t.selectFloor);
    safeSetText('initialSaveFloorBtn', t.save);
    
    safeSetText('installBtnText', t.installBtnText);
    safeSetText('installTitle', t.installTitle);
    safeSetText('androidInstallText', t.androidInstallText);
    safeSetText('doInstallBtn', t.doInstallBtn);
    safeSetText('iosInstallText', t.iosInstallText);
    safeSetText('iosStep1', t.iosStep1);
    safeSetText('iosStep2', t.iosStep2);
    safeSetText('iosCloseBtn', t.iosCloseBtn);
    safeSetText('manualInstallText', t.manualInstallText);
    safeSetText('manualStep1', t.manualStep1);
    safeSetText('manualStep2', t.manualStep2);

    if (latestElevatorsData) updateDashboard();
    
    if (shouldBeLocked) updateScreenLockUI(true);
}

function activateScreenAndCloseWelcome() {
    requestScreenLock();
    closeInitialPrompt();
}
window.activateScreenAndCloseWelcome = activateScreenAndCloseWelcome;

// --- SCREEN LOCK LOGIC (REFACTORED FOR PERSISTENCE) ---
async function requestScreenLock() {
    const t = translations[currentLang];
    
    if (shouldBeLocked) {
        shouldBeLocked = false; 
        if (wakeLockInstance) {
            await wakeLockInstance.release();
            wakeLockInstance = null;
        }
        updateScreenLockUI(false); 
        return;
    }

    if (!('wakeLock' in navigator)) {
        showNotification(t.popupError);
        return;
    }

    shouldBeLocked = true;
    await acquireWakeLock();
}
window.requestScreenLock = requestScreenLock;

async function acquireWakeLock() {
    const t = translations[currentLang];
    try {
        wakeLockInstance = await navigator.wakeLock.request('screen');
        isScreenLocked = true;
        
        updateScreenLockUI(true);

        wakeLockInstance.addEventListener('release', () => {
            isScreenLocked = false;
            wakeLockInstance = null;
            if (!shouldBeLocked) {
                updateScreenLockUI(false);
            }
        });
    } catch (err) {
        console.error("WakeLock error:", err);
        if(shouldBeLocked) {
            shouldBeLocked = false;
            updateScreenLockUI(false);
            showNotification(t.popupError);
        }
    }
}

function updateScreenLockUI(active) {
    const t = translations[currentLang];
    const msgEl = document.getElementById('persistentScreenMsg');
    
    if (active) {
        ui.screenBtn.classList.add('active');
        document.body.classList.add('screen-active-mode');
        ui.keepScreenOnTxt.textContent = t.screenActive;
        ui.screenBtn.innerHTML = `<i class="fa-solid fa-check-circle"></i> <span id="keepScreenOnTxt">${t.screenActive}</span>`;
        if(msgEl) {
            msgEl.textContent = t.popupCharger;
            msgEl.classList.add('show-persistent');
        }
    } else {
        ui.screenBtn.classList.remove('active');
        document.body.classList.remove('screen-active-mode');
        ui.keepScreenOnTxt.textContent = t.keepScreen;
        ui.screenBtn.innerHTML = `<i class="fas fa-mobile-alt"></i> <span id="keepScreenOnTxt">${t.keepScreen}</span>`;
        if(msgEl) msgEl.classList.remove('show-persistent');
    }
}

document.addEventListener('visibilitychange', async () => {
    if (shouldBeLocked && document.visibilityState === 'visible' && !wakeLockInstance) {
        await acquireWakeLock();
    }
});

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
        // Route via /go.html so scans are counted and the destination can be edited
        // from setup.html (settings.qrLinks.whatsapp). from=index identifies the source.
        const link = `${location.origin}/go.html?to=whatsapp&from=index`;
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