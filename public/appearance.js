/**
 * appearance.js - shared per-project "look" runtime + constants.
 *
 * Loaded by every page (kiosk/display/public/index) AND by setup.html, so the
 * presets/font list and the apply logic live in ONE place.
 *
 * Source of truth at runtime: RTDB `settings/appearance` (edited in setup.html ->
 * "מראה"). firebase-config.js `appConfig.theme` provides a synchronous default so a
 * cloned project shows its colors instantly (no flash) before Firebase loads.
 *
 * Shape:
 *   appearance = {
 *     theme: { bg, surface, text, accent, accentDark, fontFamily },
 *     logo:  { logoUrl, poweredByUrl, themeColor },
 *     qr:    { showOnPublic, title, sub, en },   // PUBLIC only
 *     access:{ indexMode, indexMinRole }          // consumed by script.js gate, not here
 *   }
 */
(function () {
    // Curated Hebrew-friendly Google Fonts offered in the setup UI.
    var FONTS = ['Assistant', 'Heebo', 'Rubik', 'Noto Sans Hebrew', 'Frank Ruhl Libre', 'Secular One'];

    // Ready-made themes. Each fills the manual fields; editing a field -> preset "custom".
    var PRESETS = {
        'ramada-gold':   { label: 'Ramada זהב',   bg: '#f5f0eb', surface: '#ede6dc', text: '#333333', accent: '#c5a47e', accentDark: '#8c7354', fontFamily: 'Assistant' },
        'ocean':         { label: 'כחול ים',       bg: '#eef3f8', surface: '#dde7f0', text: '#1a2740', accent: '#3b6ea5', accentDark: '#274c73', fontFamily: 'Heebo' },
        'olive':         { label: 'ירוק זית',      bg: '#f2f4ec', surface: '#e4e9d8', text: '#27301c', accent: '#7a8450', accentDark: '#55603a', fontFamily: 'Rubik' },
        'royal-purple':  { label: 'סגול מלכותי',   bg: '#f5f2f8', surface: '#e9e0f0', text: '#291f33', accent: '#7e5aa0', accentDark: '#573a73', fontFamily: 'Assistant' },
        'charcoal-dark': { label: 'פחם כהה',       bg: '#1a1a2e', surface: '#24243a', text: '#f0eee9', accent: '#c5a47e', accentDark: '#e6c25f', fontFamily: 'Heebo' }
    };

    window.APPEARANCE_FONTS = FONTS;
    window.APPEARANCE_PRESETS = PRESETS;

    // Inject a Google-Font <link> once per family ('Assistant' is already in the page heads).
    function loadAppFont(family, fontUrl) {
        if (!family) return;
        if (fontUrl) {
            // Custom font file (uploaded to Storage or linked by URL) -> @font-face.
            var fid = 'app-fontface-' + family.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
            if (document.getElementById(fid)) return;
            var st = document.createElement('style');
            st.id = fid;
            st.textContent = "@font-face{font-family:'" + family.replace(/'/g, '') +
                "';src:url('" + String(fontUrl).replace(/'/g, '') + "');font-display:swap;}";
            document.head.appendChild(st);
            return;
        }
        // Curated Google Font -> stylesheet <link>.
        var id = 'app-font-' + family.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        if (document.getElementById(id)) return;
        var link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=' + family.replace(/ /g, '+') + ':wght@300;400;500;700&display=swap';
        document.head.appendChild(link);
    }
    window.loadAppFont = loadAppFont;

    // PUBLIC-only: show/hide the QR side and set its texts. No-op on other pages.
    function applyPublicQr(qr) {
        if (!qr) return;
        var side = document.querySelector('.bar-qr-side');
        if (!side) return; // not the PUBLIC layout
        if (qr.showOnPublic === false) { side.style.display = 'none'; return; }
        side.style.display = '';
        var set = function (sel, val) {
            var el = side.querySelector(sel);
            if (el && val != null && val !== '') el.textContent = val;
        };
        set('.bar-qr-title', qr.title);
        set('.bar-qr-sub', qr.sub);
        set('.bar-qr-en', qr.en);
    }
    window.applyPublicQr = applyPublicQr;

    // Apply colors (CSS vars on :root), font, logos, theme-color, and QR.
    function applyAppearance(appearance) {
        if (!appearance) return;
        var root = document.documentElement;
        var t = appearance.theme || {};
        var setVar = function (k, v) { if (v) root.style.setProperty(k, v); };
        setVar('--cream', t.bg);             // page background
        setVar('--cream-dark', t.surface);   // secondary surface
        setVar('--glass-bg', t.surface);     // panels/cards (opaque, themeable)
        setVar('--text-main', t.text);       // body text
        setVar('--gold-primary', t.accent);  // accent
        setVar('--text-secondary', t.accent);
        setVar('--gold-dark', t.accentDark); // darker accent
        if (t.fontFamily) {
            loadAppFont(t.fontFamily, t.fontUrl);
            root.style.setProperty('--app-font', "'" + t.fontFamily + "', 'Assistant', 'Roboto Condensed', sans-serif");
        }
        var lg = appearance.logo || {};
        var mainLogo = document.getElementById('mainLogo');
        if (mainLogo && lg.logoUrl) { mainLogo.src = lg.logoUrl; mainLogo.style.display = ''; }
        var pb = document.getElementById('poweredByLogo');
        if (pb && lg.poweredByUrl) pb.src = lg.poweredByUrl;
        if (lg.themeColor) {
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', lg.themeColor);
        }
        if (appearance.qr) applyPublicQr(appearance.qr);
    }
    window.applyAppearance = applyAppearance;
})();
