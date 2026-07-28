// Service worker do Sistema TI
//
// Regra de ouro: o HTML nunca sai do cache primeiro. Se sair, o navegador fica
// preso numa versão antiga do sistema mesmo depois de publicarmos uma nova
// (foi exatamente o que segurou a tela de login antiga na frente do usuário).
//
//   - navegação (HTML)  -> rede primeiro, cache só quando estiver sem internet
//   - assets com hash   -> cache primeiro (o nome muda a cada build, é seguro)
// Sobe a versão a cada troca de arquivo estático sem hash no nome — os ícones
// são o caso típico: o nome não muda, e sem isso o favicon velho fica preso.
const CACHE = "sistema-ti-v4";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Arquivos com hash no nome (index-A1b2C3d4.js) podem ficar em cache para sempre */
const temHash = (url) => /\.[A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|svg|jpg|webp)$/.test(url);

const guardar = (req, res) => {
  if (res && res.status === 200) {
    const clone = res.clone();
    caches.open(CACHE).then((c) => c.put(req, clone));
  }
  return res;
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith("http")) return;
  // dados da nuvem e funções da API nunca são cacheados
  if (req.url.includes("supabase.co") || req.url.includes("/api/")) return;

  const navegacao = req.mode === "navigate" || req.destination === "document";

  if (navegacao || !temHash(req.url)) {
    // rede primeiro: sempre pega a versão publicada mais recente
    e.respondWith(
      fetch(req)
        .then((res) => guardar(req, res))
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // asset com hash no nome: cache primeiro
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => guardar(req, res)))
  );
});
