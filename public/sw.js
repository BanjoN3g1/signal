const C='signal-v22';const SHELL=['./','index.html','styles.css','app.js','content.js','deals.js','elections.js','manifest.webmanifest','watchlist_default.json'];
// Install takes over at once (skipWaiting) and claims open pages; the page reloads itself once on controllerchange.
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).catch(()=>{}))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// Network-first for everything same-origin, bypassing the HTTP cache (GitHub Pages sends max-age=600); cache is only the offline fallback.
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith(fetch(u.href,{cache:'no-store',credentials:'same-origin'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request,{ignoreSearch:true})))});
