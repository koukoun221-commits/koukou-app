/* KouKou Service Worker v5 PRO
   - FORCE CACHE CLEAR on every update
   - Auto-install PWA on phones
   - Network-first for app (always fresh)
   - Cache-first for assets
   - Robust offline support
   - Auto-sync triggers
*/

const CACHE_VERSION = 'koukou-v5-' + Date.now(); // FORCE NEW CACHE EVERY LOAD
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// INSTALL: Aggressive cache setup
self.addEventListener('install', e => {
  console.log('[SW] Installing with fresh cache:', CACHE_VERSION);
  e.waitUntil(
    // Clear ALL old caches first
    caches.keys().then(keys => {
      console.log('[SW] Deleting old caches:', keys);
      return Promise.all(keys.map(k => caches.delete(k)));
    })
    .then(() => {
      // Create brand new cache
      return caches.open(CACHE_VERSION);
    })
    .then(cache => {
      console.log('[SW] Adding files to new cache');
      return cache.addAll(FILES);
    })
    .then(() => {
      console.log('[SW] Install complete, skipping old workers');
      return self.skipWaiting();
    })
  );
});

// ACTIVATE: Claim all clients immediately
self.addEventListener('activate', e => {
  console.log('[SW] Activating, cleaning old caches');
  e.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(k => k !== CACHE_VERSION)
            .map(k => {
              console.log('[SW] Deleting old cache:', k);
              return caches.delete(k);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming all clients');
        return self.clients.claim();
      })
  );
});

// FETCH: Smart caching strategy
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  
  const url = new URL(req.url);
  
  // Don't touch other websites or external APIs
  if (url.origin !== self.location.origin) return;

  // STRATEGY 1: Main app page → Network first with cache fallback
  if (req.mode === 'navigate') {
    console.log('[SW] Fetch app page:', req.url);
    e.respondWith(
      fetch(req)
        .then(res => {
          // Update cache with fresh version
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => {
            console.log('[SW] Updating app cache');
            c.put('./index.html', copy);
          });
          return res;
        })
        .catch(err => {
          console.log('[SW] App offline, using cache:', err);
          return caches.match('./index.html')
            .then(r => r || caches.match('./'));
        })
    );
    return;
  }

  // STRATEGY 2: Icons & manifest → Cache first, network fallback
  console.log('[SW] Fetch asset:', req.url);
  e.respondWith(
    caches.match(req)
      .then(hit => {
        if (hit) {
          console.log('[SW] Cache hit:', req.url);
          return hit;
        }
        
        console.log('[SW] Fetching from network:', req.url);
        return fetch(req)
          .then(res => {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => {
              console.log('[SW] Caching asset:', req.url);
              c.put(req, copy);
            });
            return res;
          })
          .catch(err => {
            console.log('[SW] Asset offline:', err);
            return caches.match(req);
          });
      })
  );
});

// NOTIFICATION CLICK: Open app when user taps reminder
self.addEventListener('notificationclick', e => {
  console.log('[SW] Notification clicked');
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const c of list) {
          if ('focus' in c) {
            console.log('[SW] Focusing existing window');
            return c.focus();
          }
        }
        console.log('[SW] Opening new app window');
        return self.clients.openWindow('./');
      })
  );
});

// MESSAGE HANDLING: Allow app to request manual sync/cache clear
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CLEAR_CACHE') {
    console.log('[SW] App requested cache clear');
    e.waitUntil(
      caches.keys().then(keys => {
        return Promise.all(keys.map(k => caches.delete(k)));
      })
      .then(() => {
        console.log('[SW] Cache cleared');
        e.ports[0].postMessage({ success: true });
      })
    );
  }
  
  if (e.data && e.data.type === 'SYNC_DATA') {
    console.log('[SW] App requested sync trigger');
    // Background sync signal to app
    e.ports[0].postMessage({ syncing: true });
  }
});

// PERIODIC SYNC (if available) - doesn't hurt to add
self.addEventListener('sync', e => {
  if (e.tag === 'sync-data') {
    console.log('[SW] Background sync triggered');
    e.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_REMINDER' });
        });
      })
    );
  }
});

console.log('[SW] Service Worker loaded at', new Date().toISOString());
