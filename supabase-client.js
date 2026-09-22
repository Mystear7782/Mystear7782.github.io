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
  async list() {
    const { data, error } = await getClient()
      .from('exercises')
      .select('id, name, category, type, archived, sort_order')
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true });
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

window.SupaClient = { auth: SupaAuth, exercises: SupaExercises };
