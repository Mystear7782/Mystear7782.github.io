"""
OAuth 2.1 + MCP の一連の流れを、ローカルSupabaseに対して通しで確認するスクリプト。
本物のClaudeが行うのと同じ手順を再現する:
  DCR(動的クライアント登録) → 認可リクエスト(PKCE) → 同意画面(oauth-consent.html)で許可
  → 認可コードをトークンに交換 → そのトークンでMCPサーバーを呼ぶ

前提（すべてローカル。本番には接続しない）:
  - npx supabase start 済み（config.tomlのOAuth Server有効・DCR有効・ES256署名鍵）
  - npx supabase functions serve mcp を起動済み
  - リポジトリ直下を python -m http.server 8000 --bind 127.0.0.1 で配信済み（同意画面の配信用）
  - 環境変数 SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY（`npx supabase status -o env` の値。テストユーザー作成にのみ使用）
実行: python tests/mcp/oauth_flow_local.py [スクリーンショット出力先ディレクトリ]
"""
import base64, hashlib, json, os, re, secrets, sys, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

API = "http://127.0.0.1:54321"
CONSENT_ORIGIN = "http://127.0.0.1:8000"
REDIRECT_URI = "http://127.0.0.1:9999/callback"
PUB = os.environ["SUPABASE_PUBLISHABLE_KEY"]
SEC = os.environ["SUPABASE_SECRET_KEY"]
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None

def authorize_location(url):
    """認可エンドポイントのリダイレクト先(同意画面のURL)を、リダイレクトを辿らずに取得する。
    ブラウザのリダイレクト経由だとPlaywrightのroute(接続先のローカル向け書き換え)が効かないため、
    取得したURLへ直接ページ遷移する（これで同意画面本来のCSPのままテストできる）。"""
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        opener.open(url)
    except urllib.error.HTTPError as e:
        return e.headers["Location"]
    raise RuntimeError("リダイレクトされませんでした")

def http(url, method="GET", body=None, headers=None, form=False):
    h = dict(headers or {})
    data = None
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode(); h["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode(); return r.status, (json.loads(t) if t.strip().startswith(("{", "[")) else t)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t

# --- 1. テストユーザー
email = f"oauth-{secrets.token_hex(4)}@example.test"; password = secrets.token_urlsafe(12)
st, _ = http(f"{API}/auth/v1/admin/users", "POST", {"email": email, "password": password, "email_confirm": True},
             {"apikey": SEC, "Authorization": f"Bearer {SEC}"})
check("テストユーザーを作成", st == 200, st)

# --- 2. DCR（動的クライアント登録）
st, reg = http(f"{API}/auth/v1/oauth/clients/register", "POST", {
    "client_name": "E2E Test MCP Client", "redirect_uris": [REDIRECT_URI],
    "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
    "token_endpoint_auth_method": "none"})
check("DCRでクライアント登録できる", st in (200, 201) and "client_id" in reg, f"{st} {reg}")
client_id = reg["client_id"]

# --- 3. 認可リクエスト(PKCE)
verifier = secrets.token_urlsafe(48)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
state = secrets.token_hex(8)
authz = f"{API}/auth/v1/oauth/authorize?" + urllib.parse.urlencode({
    "client_id": client_id, "response_type": "code", "redirect_uri": REDIRECT_URI,
    "code_challenge": challenge, "code_challenge_method": "S256", "state": state,
    "scope": "openid email profile"})

def reroute(route):
    resp = route.fetch(); body = resp.text()
    url = route.request.url
    if url.endswith("oauth-consent.js"):
        body = re.sub(r"const SUPABASE_URL = '[^']*'", f"const SUPABASE_URL = '{API}'", body)
        body = re.sub(r"const SUPABASE_PUBLISHABLE_KEY = '[^']*'", f"const SUPABASE_PUBLISHABLE_KEY = '{PUB}'", body)
    elif "oauth-consent.html" in url:
        body = body.replace("https://swncmbsamxoyjeojwbyc.supabase.co", API)
    route.fulfill(response=resp, body=body)

code = None
with sync_playwright() as p:
    b = p.chromium.launch(args=["--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks,BlockInsecurePrivateNetworkRequests"])
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "net::ERR" not in m.text and "9999" not in m.text and "400" not in m.text else None)  # 400は意図した誤パスワードの応答
    page.route(re.compile(r"^http://127\.0\.0\.1:8000/oauth-consent\.(html|js)"), reroute)
    # 戻り先(9999番)は実在しないので、リクエストだけ捕まえて空応答を返す
    captured = {}
    def callback(route):
        captured["url"] = route.request.url
        route.fulfill(status=200, body="callback")
    page.route("http://127.0.0.1:9999/**", callback)

    loc = authorize_location(authz)
    check("認可リクエストが同意画面(oauth-consent.html)へリダイレクトされる", "/oauth-consent.html?authorization_id=" in loc, loc)
    page.goto(loc)
    page.wait_for_selector("#oc-login:not([hidden])")
    check("未ログインならログインフォームが出る", True)
    if SHOTS: page.screenshot(path=os.path.join(SHOTS, "consent-1-login.png"))

    page.fill("#oc-email", "wrong@example.test"); page.fill("#oc-password", "bad-password"); page.click("#oc-login-btn")
    page.wait_for_selector("#oc-login-error:not([hidden])")
    check("誤ったパスワードではエラー表示", "ログインに失敗" in page.inner_text("#oc-login-error"))

    page.fill("#oc-email", email); page.fill("#oc-password", password); page.click("#oc-login-btn")
    page.wait_for_selector("#oc-consent:not([hidden])")
    check("ログイン後に同意画面が出る", True)
    check("要求元アプリ名が表示される", "E2E Test MCP Client" in page.inner_text("#oc-client-name"))
    check("戻り先URLが表示される", REDIRECT_URI in page.inner_text("#oc-redirect"))
    check("ログイン中のアカウントが表示される", email in page.inner_text("#oc-user"))
    if SHOTS: page.screenshot(path=os.path.join(SHOTS, "consent-2-approve.png"), full_page=True)

    page.click("#oc-approve")
    page.wait_for_function("() => true")
    for _ in range(50):
        if "url" in captured: break
        page.wait_for_timeout(100)
    check("許可すると戻り先に遷移する", "url" in captured, captured)
    q = urllib.parse.parse_qs(urllib.parse.urlparse(captured.get("url", "")).query)
    code = (q.get("code") or [None])[0]
    check("戻り先に認可コードとstateが付く", bool(code) and q.get("state") == [state], captured)
    check("同意画面でJSエラーが出ていない", not errors, errors)
    b.close()

# --- 拒否の流れ（同じユーザーは同意済みになり同意画面を飛ばすため、別ユーザーで確認）
email2 = f"oauth-{secrets.token_hex(4)}@example.test"
http(f"{API}/auth/v1/admin/users", "POST", {"email": email2, "password": password, "email_confirm": True},
     {"apikey": SEC, "Authorization": f"Bearer {SEC}"})
with sync_playwright() as p:
    b = p.chromium.launch(args=["--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks,BlockInsecurePrivateNetworkRequests"])
    page = b.new_context().new_page()
    page.route(re.compile(r"^http://127\.0\.0\.1:8000/oauth-consent\.(html|js)"), reroute)
    cap2 = {}
    page.route("http://127.0.0.1:9999/**", lambda r: (cap2.update(url=r.request.url), r.fulfill(status=200, body="x")))
    v2 = secrets.token_urlsafe(48); c2 = base64.urlsafe_b64encode(hashlib.sha256(v2.encode()).digest()).rstrip(b"=").decode()
    page.goto(authorize_location(f"{API}/auth/v1/oauth/authorize?" + urllib.parse.urlencode({
        "client_id": client_id, "response_type": "code", "redirect_uri": REDIRECT_URI,
        "code_challenge": c2, "code_challenge_method": "S256", "state": "deny1"})))
    page.wait_for_selector("#oc-login:not([hidden])")
    page.fill("#oc-email", email2); page.fill("#oc-password", password); page.click("#oc-login-btn")
    page.wait_for_selector("#oc-consent:not([hidden])")
    page.click("#oc-deny")
    for _ in range(50):
        if "url" in cap2: break
        page.wait_for_timeout(100)
    check("拒否すると access_denied で戻り先に遷移する", "access_denied" in cap2.get("url", ""), cap2)
    b.close()

# --- 4. 認可コード → トークン
st, tok = http(f"{API}/auth/v1/oauth/token", "POST", {
    "grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT_URI,
    "client_id": client_id, "code_verifier": verifier}, form=True)
check("認可コードをアクセストークンに交換できる", st == 200 and "access_token" in tok, f"{st} {tok}")
access = tok["access_token"]
hdr = json.loads(base64.urlsafe_b64decode(access.split(".")[0] + "=="))
claims = json.loads(base64.urlsafe_b64decode(access.split(".")[1] + "=="))
check("アクセストークンは非対称鍵(ES256)で署名されている", hdr.get("alg") == "ES256", hdr)
check("トークンに client_id が入っている", claims.get("client_id") == client_id, claims)

# --- 5. そのトークンでMCPを呼ぶ
def mcp(token, method, params=None, i=1):
    body = {"jsonrpc": "2.0", "id": i, "method": method, **({"params": params} if params else {})}
    req = urllib.request.Request(f"{API}/functions/v1/mcp", data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as r: text = r.read().decode(); status = r.status
    except urllib.error.HTTPError as e: text = e.read().decode(); status = e.code
    line = next((l for l in text.split("\n") if l.startswith("data:")), None)
    try: return status, json.loads(line[5:].strip() if line else text)
    except Exception: return status, text

st, r = mcp(access, "tools/list")
names = sorted(t["name"] for t in r["result"]["tools"]) if st == 200 else []
check("OAuthで得たトークンでMCPのツール一覧を取得できる(12ツール)", st == 200 and len(names) == 12, f"{st} {names}")
st, r = mcp(access, "tools/call", {"name": "log_meal", "arguments": {"date": "2026-10-01", "meal_type": "朝", "protein_g": 52, "fat_g": 28, "carb_g": 14}})
row = json.loads(r["result"]["content"][0]["text"])["row"] if st == 200 else {}
check("OAuthで得たトークンでlog_mealが成功し、calories_kcalが自動計算される", row.get("calories_kcal") in (52*4+28*9+14*4, str(52*4+28*9+14*4)), r)
st, r = mcp(access, "tools/call", {"name": "list_records", "arguments": {"table": "meal_logs", "limit": 10}})
rows = json.loads(r["result"]["content"][0]["text"])["rows"] if st == 200 else []
check("そのユーザー自身のデータが読める", len(rows) == 1, rows)
st, _ = mcp("bad.token.value", "tools/list")
check("不正なトークンは401", st == 401, st)

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} PASS")
sys.exit(1 if failed else 0)
