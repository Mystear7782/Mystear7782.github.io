const CACHE = 'gymlog-v5';
const ASSETS = ['./', './index.html', './app.js', './style.css', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// HTML/JS/CSSは常にネットワーク優先、オフライン時のみキャッシュ
// （CSSも開発中に頻繁に更新されるため、cssをキャッシュ優先にすると
// 更新後もブラウザが古いスタイルを表示し続けるバグの原因になっていた）
// フォント等の外部リソースのみキャッシュ優先
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isLocal = url.origin === self.location.origin;
  const isPage = isLocal && (
    /\.(html|js|css)$/.test(url.pathname) ||
    url.pathname === '/' ||
    url.pathname.endsWith('/')
  );

  if (isPage) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
      )
    );
  }
});
