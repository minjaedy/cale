// Keep only the offline screen and icon. Account data and Firebase calls are never cached.
const CACHE='tempo-offline-v4-icons';
importScripts('./badge-worker.js?v=3');
// Build __TEMPO_BUILD__; changed builds prompt a service-worker update too.
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./offline.html','./tempo-icon-v3-192.png'])));
});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{}}catch{}
  const screen=data.screen==='routine'?'routine':'coaching';
  const notification=self.registration.showNotification(String(data.title||'TEMPO 새 소식').slice(0,80),{body:String(data.body||'새 알림을 확인해 주세요.').slice(0,200),icon:'./tempo-icon-v3-192.png',badge:'./tempo-icon-v3-192.png',tag:String(data.tag||'tempo-update').slice(0,180),data:{url:new URL('./#'+screen,self.registration.scope).href}});
  const badge=self.TempoBadge.push(data).then(async()=>{try{for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))if(client.url.startsWith(self.registration.scope))client.postMessage({type:'tempo-badge-changed'})}catch{}});
  event.waitUntil(Promise.all([notification,badge]));
});
self.addEventListener('notificationclose',event=>event.waitUntil(self.TempoBadge.read(event.notification.tag)));
self.addEventListener('notificationclick',event=>{
  const ack=self.TempoBadge.read(event.notification.tag);event.notification.close();const target=new URL(event.notification.data?.url||'./#coaching',self.registration.scope),scope=new URL(self.registration.scope);
  if(target.origin!==scope.origin||!target.pathname.startsWith(scope.pathname)){event.waitUntil(ack);return;}
  event.waitUntil(Promise.all([ack,self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{const app=windows.find(c=>c.url.startsWith(self.registration.scope)&&!new URL(c.url).pathname.endsWith('/demo.html'));if(app){app.postMessage({type:'tempo-notification',screen:target.hash.slice(1)});return app.focus()}return self.clients.openWindow(target.href)})]));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([self.clients.claim(),self.TempoBadge.restore(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tempo-offline-')&&key!==CACHE).map(key=>caches.delete(key))))]));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),scope=new URL(self.registration.scope);
  if(event.request.url===new URL('./tempo-icon-v3-192.png',self.registration.scope).href){
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));return;
  }
  if(event.request.mode==='navigate'&&url.origin===scope.origin&&url.pathname.startsWith(scope.pathname)){
    event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(new URL('./offline.html',self.registration.scope))));
  }
});
