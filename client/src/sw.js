import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

cleanupOutdatedCaches()

// self.__WB_MANIFEST is injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST)

self.skipWaiting()
clientsClaim()

// --- SHARE TARGET HANDLER ---
async function handleShareTarget(event) {
    try {
        const formData = await event.request.formData();
        const mediaFiles = formData.getAll('media');
        const title = formData.get('title');
        const text = formData.get('text');
        const url = formData.get('url');

        console.log('[SW] Received Share:', { title, text, url, mediaCount: mediaFiles.length });

        // Armazenar no IndexedDB "share-target"
        await new Promise((resolve, reject) => {
            const request = indexedDB.open('share-target', 1);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('shares')) {
                    db.createObjectStore('shares', { keyPath: 'id' });
                }
            };

            request.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction('shares', 'readwrite');
                const store = tx.objectStore('shares');

                // Salvamos com ID 'failed' padrão ou 'latest'.
                // Armazenamos o arquivo (Blob) diretamente.
                const data = {
                    id: 'latest',
                    timestamp: Date.now(),
                    title: title || '',
                    text: text || '',
                    url: url || '',
                    // Se houver arquivo, pegamos o primeiro
                    file: mediaFiles.length > 0 ? mediaFiles[0] : null
                };

                const putReq = store.put(data);

                putReq.onsuccess = () => {
                    console.log('[SW] Share saved to IDB');
                    resolve();
                };
                putReq.onerror = () => {
                    console.error('[SW] Error saving to IDB:', putReq.error);
                    reject(putReq.error);
                }

                tx.oncomplete = () => db.close();
            };

            request.onerror = (e) => {
                console.error('[SW] IDB Open Error:', e);
                reject(e);
            }
        });

        // Redireciona para a página /repost com flag
        return Response.redirect('/repost?shared=true', 303);

    } catch (error) {
        console.error('[SW] Share Handler Error:', error);
        return Response.redirect('/repost?error=share_failed', 303);
    }
}

// Intercepta POST requests para /repost (definido no Manifest)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Verifica se é o alvo do Share Target
    if (event.request.method === 'POST' && url.pathname === '/repost') {
        event.respondWith(handleShareTarget(event));
    }
});
