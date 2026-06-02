// BioSpecInfo Service Worker — cache file singolo HTML + risorse + API PubChem/RCSB
'use strict';

const CACHE_VERSION = 'biospecinfo-v33-2026-06';
const STATIC_CACHE = CACHE_VERSION + '-static';
const API_CACHE = CACHE_VERSION + '-api';

const STATIC_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './3Dmol-min.js',
  './three.min.js'
];

// Install: precarica i file statici
self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(STATIC_CACHE).then(function(c){
      return c.addAll(STATIC_FILES).catch(function(err){
        console.warn('[SW] Pre-cache fallita:', err);
      });
    })
  );
});

// Activate: rimuove cache vecchie
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if(k.indexOf('biospecinfo-') === 0 && k.indexOf(CACHE_VERSION) !== 0){
          return caches.delete(k);
        }
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Fetch: strategie diverse per tipo di risorsa
self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);

  // PubChem: stale-while-revalidate
  if(url.hostname.indexOf('pubchem.ncbi.nlm.nih.gov') !== -1){
    e.respondWith(staleWhileRevalidate(req, API_CACHE));
    return;
  }
  // RCSB PDB: cache-first
  if(url.hostname.indexOf('rcsb.org') !== -1 || url.hostname.indexOf('files.rcsb.org') !== -1){
    e.respondWith(cacheFirst(req, API_CACHE));
    return;
  }
  // Same-origin: cache-first con fallback network
  if(url.origin === self.location.origin){
    e.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }
  // Altre cross-origin: network-first
  e.respondWith(networkFirst(req, API_CACHE));
});

function cacheFirst(req, cacheName){
  return caches.match(req).then(function(cached){
    if(cached) return cached;
    return fetch(req).then(function(r){
      if(r && r.ok){
        var clone = r.clone();
        caches.open(cacheName).then(function(c){ c.put(req, clone); });
      }
      return r;
    }).catch(function(){
      return caches.match('./index.html');
    });
  });
}

function networkFirst(req, cacheName){
  return fetch(req).then(function(r){
    if(r && r.ok){
      var clone = r.clone();
      caches.open(cacheName).then(function(c){ c.put(req, clone); });
    }
    return r;
  }).catch(function(){
    return caches.match(req);
  });
}

function staleWhileRevalidate(req, cacheName){
  return caches.open(cacheName).then(function(c){
    return c.match(req).then(function(cached){
      var fetchPromise = fetch(req).then(function(r){
        if(r && r.ok){ c.put(req, r.clone()); }
        return r;
      }).catch(function(){ return cached; });
      return cached || fetchPromise;
    });
  });
}
