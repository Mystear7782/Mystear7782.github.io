// OAuth同意画面のロジック（単独ページ。app.js / supabase-client.js には依存しない）。
//
// 流れ:
//   1. URLの authorization_id を受け取る（Supabase Authが同意画面へリダイレクトするときに付ける）
//   2. 未ログインならその場でログインフォームを出す（PWAのログイン状態は同じオリジンの
//      localStorageにあるので、PWAでログイン済みなら自動で次へ進む）
//   3. getAuthorizationDetails で、要求元アプリ名・戻り先・権限を表示する
//   4. 許可なら approveAuthorization、拒否なら denyAuthorization を呼び、返ってきた
//      redirect_url へ遷移する（トークンの発行はSupabase Auth側で行われる）

// publishable key はクライアント埋め込み前提の公開キー（アクセス制御はRLS）。supabase-client.js と同じ値。
const SUPABASE_URL = 'https://swncmbsamxoyjeojwbyc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fk-EnvdNJKPgqRmVl-bz1g_jdukPtn2';

const $ = (id) => document.getElementById(id);
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const authorizationId = new URLSearchParams(location.search).get('authorization_id');

const SECTIONS = ['oc-loading', 'oc-login', 'oc-consent', 'oc-error'];
function show(id) {
  for (const s of SECTIONS) $(s).hidden = s !== id;
}
function showError(msg) {
  $('oc-error-msg').textContent = msg;
  show('oc-error');
}
function setText(id, text) {
  $(id).textContent = text;
}
function setInlineError(id, msg) {
  const el = $(id);
  el.textContent = msg || '';
  el.hidden = !msg;
}
const errMsg = (e) => (e && e.message) ? e.message : String(e);

// Supabase Authが返す redirect_url へ遷移する。http(s)以外（javascript: 等）には遷移しない。
function goTo(redirectUrl) {
  let u;
  try {
    u = new URL(redirectUrl);
  } catch (e) {
    showError('戻り先のURLが不正です。');
    return;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    showError('戻り先のURLの形式が許可されていません。');
    return;
  }
  location.assign(u.href);
}

async function showConsent() {
  show('oc-loading');
  const { data, error } = await sb.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error) {
    showError('認可リクエストを取得できませんでした: ' + errMsg(error));
    return;
  }
  // すでに同意済みの場合は、同意画面を出さずにそのまま戻り先へ
  if (data && data.redirect_url && !data.authorization_id) {
    goTo(data.redirect_url);
    return;
  }
  const client = data.client || {};
  setText('oc-client-name', client.name || '（名前のないアプリ）');
  setText('oc-client-detail', client.uri || client.name || '（不明）');
  setText('oc-redirect', data.redirect_uri || '（不明）');
  setText('oc-user', (data.user && data.user.email) || '（不明）');
  setText('oc-scopes', (data.scope || '').trim().split(/\s+/).filter(Boolean).join('、') || '（指定なし）');
  setInlineError('oc-consent-error', '');
  show('oc-consent');
}

async function decide(approve) {
  $('oc-approve').disabled = true;
  $('oc-deny').disabled = true;
  setInlineError('oc-consent-error', '');
  try {
    const fn = approve ? sb.auth.oauth.approveAuthorization : sb.auth.oauth.denyAuthorization;
    const { data, error } = await fn.call(sb.auth.oauth, authorizationId, { skipBrowserRedirect: true });
    if (error) throw error;
    goTo(data.redirect_url);
  } catch (e) {
    setInlineError('oc-consent-error', '処理に失敗しました: ' + errMsg(e));
    $('oc-approve').disabled = false;
    $('oc-deny').disabled = false;
  }
}

async function start() {
  if (!authorizationId) {
    showError('認可リクエストのID(authorization_id)がありません。');
    return;
  }
  let session = null;
  try {
    const { data } = await sb.auth.getSession();
    session = data.session;
  } catch (e) { /* 取得できなければログイン画面へ */ }
  if (!session) {
    show('oc-login');
    $('oc-email').focus();
    return;
  }
  await showConsent();
}

$('oc-login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('oc-email').value.trim();
  const password = $('oc-password').value;
  if (!email || !password) {
    setInlineError('oc-login-error', 'メールアドレスとパスワードを入力してください');
    return;
  }
  $('oc-login-btn').disabled = true;
  setInlineError('oc-login-error', '');
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await showConsent();
  } catch (e) {
    setInlineError('oc-login-error', 'ログインに失敗しました: ' + errMsg(e));
  } finally {
    $('oc-login-btn').disabled = false;
  }
});
$('oc-approve').addEventListener('click', () => decide(true));
$('oc-deny').addEventListener('click', () => decide(false));
$('oc-signout').addEventListener('click', async () => {
  await sb.auth.signOut();
  show('oc-login');
});

start();
