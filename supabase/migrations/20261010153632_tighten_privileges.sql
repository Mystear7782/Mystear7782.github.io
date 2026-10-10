-- フェーズ1: 権限の最小化
-- 現状: 全テーブルに anon / authenticated へ TRUNCATE・TRIGGER・REFERENCES・MAINTAIN を含む
-- 全権限が付与され、RLSポリシーも TO PUBLIC、RPCもanonから実行できる状態だった
-- （Supabaseの既定値。auth.uid() が NULL の匿名アクセスはRLSで弾かれるため実害は無かった）。
-- 多層防御として、匿名ロールからは一切触れず、ログイン済みユーザーにも必要な操作だけを許可する。
--
-- 影響: PWA・MCPともにログイン後(authenticated)の通信のみなので影響なし。
-- ロールバックしたい場合は、このファイルの逆のGRANT/ALTER POLICYを実行すればよい。

-- ===== テーブル権限 =====
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'body_weight_logs', 'cardio_logs', 'exercises', 'meal_logs',
    'menu_set_items', 'menu_sets', 'sets', 'workout_sessions'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
  END LOOP;
END
$$;

-- ===== RLSポリシーの対象ロールを authenticated に限定 =====
ALTER POLICY "owner only" ON public.body_weight_logs TO authenticated;
ALTER POLICY "owner only via session" ON public.cardio_logs TO authenticated;
ALTER POLICY "owner only" ON public.exercises TO authenticated;
ALTER POLICY "owner only" ON public.meal_logs TO authenticated;
ALTER POLICY "owner only via menu_set" ON public.menu_set_items TO authenticated;
ALTER POLICY "owner only" ON public.menu_sets TO authenticated;
ALTER POLICY "owner only via session" ON public.sets TO authenticated;
ALTER POLICY "owner only via exercise" ON public.workout_sessions TO authenticated;

-- ===== 既存RPCの実行権限 =====
REVOKE ALL ON FUNCTION public.get_my_body_weight_logs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_exercises() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_meal_logs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_sessions_full() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_body_weight_logs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_exercises() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_meal_logs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_sessions_full() TO authenticated;

-- rls_auto_enable はDDLイベントトリガー(ensure_rls)専用のSECURITY DEFINER関数。
-- ユーザーが直接呼ぶ用途は無いので、実行権限を外す（トリガーの動作には影響しない）。
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
