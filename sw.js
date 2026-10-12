// Keep only the offline screen and icon. Account data and Firebase calls are never cached.
const CACHE='tempo-offline-v2';
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./offline.html','./icon-192.png?v=2'])));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tempo-offline-')&&key!==CACHE).map(key=>caches.delete(key))))]));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),scope=new URL(self.registration.scope);
  if(event.request.url===new URL('./icon-192.png?v=2',self.registration.scope).href){
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));return;
  }
  if(event.request.mode==='navigate'&&url.origin===scope.origin&&url.pathname.startsWith(scope.pathname)){
    event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('./offline.html',self.registration.scope))));
  }
});
