// ===== Supabase クライアント（薄いラッパー） =====
// 方針: カスタムAPIサーバーは置かず、Supabaseの自動生成REST(PostgREST)をフロントから直接呼ぶ。
// このファイルはSupabase JS SDK呼び出しを1箇所に集約するためのラッパーであり、
// 自前のバックエンドAPIではない（詳細は「実装準備」ドキュメント参照）。
//
// 段階移行フェーズ1: 現時点では exercises（メニュー管理）のみ対応。
// sessions / menuSets 等は今後のフェーズで追加する。

// TODO: Supabaseプロジェクト作成後、以下2つを実際の値に置き換えてください。
// ダッシュボードの Settings → API Keys から取得できます。
// "Publishable key"（sb_publishable_... 形式。旧anon keyの後継、同じ役割）を使うこと。
// "Secret key"（sb_secret_... 形式。旧service_role keyの後継）は絶対に使わない。
//
// この2つはgitにpush・公開リポジトリに含めても問題ない値です。publishable keyは
// クライアント埋め込みを前提に設計された公開キーで、実際のアクセス制御は
// DB側のRow Level Security（本DDLで全テーブルに設定済み）が担う。
// 絶対に埋め込んではいけないのはsecret key（RLSを迂回する管理者キー）のみ。
const SUPABASE_URL = 'https://swncmbsamxoyjeojwbyc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fk-EnvdNJKPgqRmVl-bz1g_jdukPtn2';

let _client = null;
function getClient() {
  if (!_client) {
    if (typeof supabase === 'undefined') {
      throw new Error('supabase-js が読み込まれていません。index.htmlのscriptタグ読み込み順を確認してください。');
    }
    _client = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return _client;
}

// ===== 認証 =====
const SupaAuth = {
  async getSession() {
    const { data, error } = await getClient().auth.getSession();
    if (error) throw error;
    return data.session;
  },
  async signInWithPassword(email, password) {
    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },
  async signOut() {
    const { error } = await getClient().auth.signOut();
    if (error) throw error;
  },
};

// ===== exercises（メニュー） =====
const SupaExercises = {
  // カテゴリ→sort_orderの順で取得（アプリ側のグループ表示順と一致させる）
  // NOTE: 直接の .from('exercises').select() がRLS/認証は正常なのになぜか0件を返す
  // 現象が確認されたため、暫定的にRPC関数(get_my_exercises)経由に変更している。
  // RPC経由では同じ条件で正しく取得できることを確認済み。
  async list() {
    const { data, error } = await getClient().rpc('get_my_exercises');
    if (error) throw error;
    return data;
  },
  async insert(menu) {
    const { data, error } = await getClient()
      .from('exercises')
      .insert({
        id: menu.id,
        name: menu.name,
        category: menu.category,
        type: menu.type,
        archived: !!menu.archived,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async update(id, patch) {
    const { error } = await getClient().from('exercises').update(patch).eq('id', id);
    if (error) throw error;
  },
  async setArchived(id, archived) {
    return SupaExercises.update(id, { archived });
  },
  async remove(id) {
    const { error } = await getClient().from('exercises').delete().eq('id', id);
    if (error) throw error;
  },
  // 並び替え: 同一カテゴリ内の新しい順序(idの配列)をsort_orderとして一括反映
  async reorderCategory(category, orderedIds) {
    const updates = orderedIds.map((id, idx) =>
      getClient().from('exercises').update({ sort_order: idx }).eq('id', id)
    );
    const results = await Promise.all(updates);
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
  },
};

// ===== body_weight_logs（体重ログ） =====
const SupaBodyWeight = {
  // exercisesと同じ理由(直接の.from().select()がRLS正常時でも0件を返す事象)により、
  // 読み取りは最初からRPC関数(get_my_body_weight_logs)経由にしている。
  async list() {
    const { data, error } = await getClient().rpc('get_my_body_weight_logs');
    if (error) throw error;
    return data;
  },
  async insert(entry) {
    const { data, error } = await getClient()
      .from('body_weight_logs')
      .insert({ log_date: entry.date, weight_kg: entry.weight })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async update(id, patch) {
    const { error } = await getClient().from('body_weight_logs').update(patch).eq('id', id);
    if (error) throw error;
  },
  async remove(id) {
    const { error } = await getClient().from('body_weight_logs').delete().eq('id', id);
    if (error) throw error;
  },
};

// ===== meal_logs（食事記録） =====
const SupaMeals = {
  // 同上の理由によりRPC関数(get_my_meal_logs)経由で読み取る。
  async list() {
    const { data, error } = await getClient().rpc('get_my_meal_logs');
    if (error) throw error;
    return data;
  },
  async insert(entry) {
    const { data, error } = await getClient()
      .from('meal_logs')
      .insert({
        log_date: entry.date,
        meal_type: entry.mealType,
        protein_g: entry.protein,
        fat_g: entry.fat,
        carb_g: entry.carb,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async update(id, patch) {
    const { error } = await getClient().from('meal_logs').update(patch).eq('id', id);
    if (error) throw error;
  },
  async remove(id) {
    const { error } = await getClient().from('meal_logs').delete().eq('id', id);
    if (error) throw error;
  },
};

// ===== workout_sessions / sets / cardio_logs（セッション・セット記録） =====
const SupaSessions = {
  // 同上の理由によりRPC関数(get_my_sessions_full)経由で読み取る。
  // exercise_idごとのセッション一覧を、セット配列/有酸素データを含めた形でまとめて返す。
  async listFull() {
    const { data, error } = await getClient().rpc('get_my_sessions_full');
    if (error) throw error;
    return data;
  },
  async createSession(exerciseId, date, time) {
    const { data, error } = await getClient()
      .from('workout_sessions')
      .insert({ exercise_id: exerciseId, session_date: date, session_time: time })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateSessionDateTime(sessionId, date, time) {
    const { error } = await getClient()
      .from('workout_sessions')
      .update({ session_date: date, session_time: time })
      .eq('id', sessionId);
    if (error) throw error;
  },
  async deleteSession(sessionId) {
    // workout_sessions削除時、外部キーのON DELETE CASCADEによりsets/cardio_logsの
    // 関連行も自動削除される（個別のdelete呼び出しは不要）。
    const { error } = await getClient().from('workout_sessions').delete().eq('id', sessionId);
    if (error) throw error;
  },
  // fallbackSetNo: 呼び出し元(app.js)が計算したローカルのセット件数ベースの値
  // （途中のセット削除・再追加でapp.js側のローカル件数とDB側のset_noがずれている場合に
  // 重複しうるため、できる限りDB側の実際の最大set_noを問い合わせて上書きする。
  // 問い合わせに失敗した場合はfallbackSetNoをそのまま使う＝従来と同じ挙動に留まる）
  async addSet(sessionId, fallbackSetNo, w, r) {
    let setNo = fallbackSetNo;
    try {
      const { data: existing, error: qErr } = await getClient()
        .from('sets')
        .select('set_no')
        .eq('session_id', sessionId)
        .order('set_no', { ascending: false })
        .limit(1);
      if (!qErr && existing && existing.length) {
        setNo = Math.max(fallbackSetNo, existing[0].set_no + 1);
      }
    } catch (e) { /* 取得できない場合はfallbackSetNoを使う */ }
    const { data, error } = await getClient()
      .from('sets')
      .insert({ session_id: sessionId, set_no: setNo, weight_kg: w, reps: r })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateSet(setId, w, r) {
    const { error } = await getClient().from('sets').update({ weight_kg: w, reps: r }).eq('id', setId);
    if (error) throw error;
  },
  async deleteSet(setId) {
    const { error } = await getClient().from('sets').delete().eq('id', setId);
    if (error) throw error;
  },
  // cardio_logsはsession_idを主キーとして1行のみ持つため、既存行があれば更新・
  // なければ新規作成するupsertを使う（初回保存時点では行が存在しないため）。
  async saveCardio(sessionId, c) {
    const { error } = await getClient().from('cardio_logs').upsert({
      session_id: sessionId,
      time_min: c.time,
      dist_km: c.dist,
      cal_kcal: c.cal,
      hr_bpm: c.hr,
      max_spd_kmh: c.maxSpd,
      avg_spd_kmh: c.avgSpd,
    }, { onConflict: 'session_id' });
    if (error) throw error;
  },
};

// ===== 通信中インジケーター（ロード/書き込み共通） =====
// 個々の呼び出し箇所に手を入れずに済むよう、SupaClientの全メソッドをここで一括ラップし、
// 同時に実行中の呼び出し数(_inFlight)を数える。UI側(app.js)はSupaLoading.subscribe()で
// 増減を購読し、ヘッダー下の細い進捗バー等の表示/非表示に使う（詳細はapp.js側を参照）。
let _inFlight = 0;
const _loadingListeners = new Set();
function _notifyLoading() {
  for (const fn of _loadingListeners) {
    try { fn(_inFlight); } catch (e) { /* リスナー側のエラーで通信自体を止めない */ }
  }
}
function _withLoading(fn) {
  return async function (...args) {
    _inFlight++;
    _notifyLoading();
    try {
      return await fn(...args);
    } finally {
      _inFlight--;
      _notifyLoading();
    }
  };
}
function _wrapAllWithLoading(obj) {
  const wrapped = {};
  for (const key of Object.keys(obj)) {
    wrapped[key] = typeof obj[key] === 'function' ? _withLoading(obj[key]) : obj[key];
  }
  return wrapped;
}

window.SupaClient = {
  auth: _wrapAllWithLoading(SupaAuth),
  exercises: _wrapAllWithLoading(SupaExercises),
  bodyWeight: _wrapAllWithLoading(SupaBodyWeight),
  meals: _wrapAllWithLoading(SupaMeals),
  sessions: _wrapAllWithLoading(SupaSessions),
};
window.SupaLoading = {
  isLoading: () => _inFlight > 0,
  // fn(count)を呼び出し数が変わるたびに呼ぶ。戻り値は購読解除用の関数。
  subscribe: (fn) => { _loadingListeners.add(fn); return () => _loadingListeners.delete(fn); },
};
