// Service Worker - Required for PWA installation criteria
const CACHE_NAME = 'shabbat-elevator-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './firebase-config.js',
    './manifest.json'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch((err) => console.log('Cache error:', err))
    );
});

// Fetch Event (Offline capability)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .catch(() => {
                return caches.match(event.request);
            })
    );
});