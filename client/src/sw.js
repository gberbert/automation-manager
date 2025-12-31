
// --- KILLER SERVICE WORKER ---
// Este script serve para desregistrar qualquer SW antigo e recarregar a página.

self.addEventListener('install', () => {
    console.log('[Killer-SW] Installing and skipping waiting...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[Killer-SW] Activating and unregistering self...');
    event.waitUntil(
        self.registration.unregister().then(() => {
            console.log('[Killer-SW] Unregistered. Claiming clients...');
            return self.clients.claim();
        }).then(() => {
            return self.clients.matchAll();
        }).then(clients => {
            console.log('[Killer-SW] Reloading clients...');
            clients.forEach(client => client.navigate(client.url));
        })
    );
});
