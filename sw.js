// Keep only the offline screen and icon. Account data and Firebase calls are never cached.
const CACHE='tempo-offline-v3';
// Build __TEMPO_BUILD__; changed builds prompt a service-worker update too.
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./offline.html','./icon-192.png?v=2'])));
});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{}}catch{}
  const screen=data.screen==='routine'?'routine':'coaching';
  event.waitUntil(self.registration.showNotification(String(data.title||'TEMPO 새 소식').slice(0,80),{body:String(data.body||'새 알림을 확인해 주세요.').slice(0,200),icon:'./icon-192.png?v=2',badge:'./icon-192.png?v=2',tag:String(data.tag||'tempo-update').slice(0,150),data:{url:new URL('./#'+screen,self.registration.scope).href}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const target=new URL(event.notification.data?.url||'./#coaching',self.registration.scope),scope=new URL(self.registration.scope);
  if(target.origin!==scope.origin||!target.pathname.startsWith(scope.pathname))return;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{const app=windows.find(c=>c.url.startsWith(self.registration.scope));if(app){app.postMessage({type:'tempo-notification',screen:target.hash.slice(1)});return app.focus()}return self.clients.openWindow(target.href)}));
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
