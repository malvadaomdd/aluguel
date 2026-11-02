// Atualiza somente recursos visuais; nunca coloca sessões ou dados financeiros no cache.
const CACHE = "aluguel-pages-v1";
// Usa caminhos relativos para funcionar em qualquer repositório GitHub Pages.
self.addEventListener("install", event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["./assets/style.css?v=pages-1", "./assets/icon-192.png"]))); });
// Remove apenas caches antigos desta versão do aplicativo.
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("aluguel-pages-") && k !== CACHE).map(k => caches.delete(k)))).then(() => clients.claim())));
// Consulta estilos e ícones pela rede antes do fallback visual.
self.addEventListener("fetch", event => { const url = new URL(event.request.url); if (url.origin === location.origin && url.pathname.includes("/assets/") && !url.pathname.endsWith(".js")) event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
// Mostra texto genérico sem revelar valor da dívida na tela bloqueada.
self.addEventListener("push", event => { let data = {}; try { data = event.data.json(); } catch {} event.waitUntil(self.registration.showNotification(data.title || "Aluguel", { body: data.body || "Há uma atualização na sua conta.", tag: data.tag || "aluguel", icon: "./assets/icon-192.png" })); });
// Abre o portal dentro do caminho correto do repositório.
self.addEventListener("notificationclick", event => { event.notification.close(); event.waitUntil(clients.openWindow(self.registration.scope)); });
