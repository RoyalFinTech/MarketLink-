/* MarketLink web-push service worker. FCM requires real Firebase config and registered device tokens. */
self.addEventListener('push',function(event){
 if(!event.data)return;let payload={};try{payload=event.data.json();}catch(e){payload={notification:{body:event.data.text()}};}
 const n=payload.notification||payload.data||{},title=n.title||'MarketLink update';
 const options={body:n.body||'You have a new account or order update.',tag:n.tag||(payload.data&&payload.data.notificationId)||'marketlink-notification',data:Object.assign({url:'/'},payload.data||{}),icon:'/assets/hero-marketlink-bag.webp',badge:'/assets/hero-marketlink-bag.webp'};
 event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',function(event){
 event.notification.close();const destination=new URL(event.notification&&event.notification.data&&event.notification.data.url||'/',self.location.origin).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){for(const client of list)if(client.url===destination&&'focus'in client)return client.focus();if(self.clients.openWindow)return self.clients.openWindow(destination);}));
});
