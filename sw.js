const CACHE = 'gymlog-v6';
const ASSETS = [
  './', './index.html', './app.js', './supabase-client.js', './style.css', './manifest.json',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];
// SupabaseのAPIドメイン。ここへのリクエストは常にネットワークへ素通しし、一切キャッシュしない。
const SUPABASE_HOST = 'swncmbsamxoyjeojwbyc.supabase.co';

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

  // Supabaseへの通信（RPC/REST）はキャッシュ対象から完全に除外する。
  // 以前はここが「それ以外」のキャッシュ優先分岐に入ってしまっており、
  // GET通信（直接の.select()等）の最初のレスポンスがそのままキャッシュされ、
  // 以後は認証状態やRLSの結果に関わらずずっと同じ古い結果が返り続けていた
  // （supabase-client.js内の「RLSは正常なのになぜか0件」というコメントの原因である
  // 可能性が高い）。RPC(POST)はもともとキャッシュされないが、念のためドメイン単位で
  // 完全に素通しにしておく。
  if (url.hostname === SUPABASE_HOST) {
    e.respondWith(fetch(e.request));
    return;
  }

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
          // GET以外（POST等）はCache APIに保存できずエラーになるため、
          // GETかつ正常応答(res.ok)の場合のみキャッシュする
          if (e.request.method === 'GET' && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
      )
    );
  }
});
