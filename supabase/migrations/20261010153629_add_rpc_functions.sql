-- フェーズ1: RPC関数の追加（record_set / 集計用3本）とデバッグ関数の削除
-- すべて security invoker（呼び出し元ユーザーの権限で実行され、RLSがそのまま効く）。
-- search_path を空にし、スキーマ名を明示することで、検索パス経由のすり替えを防ぐ。

-- デバッグ用に作成していた関数。本番には既に存在しないが、環境差異に備えて念のため。
DROP FUNCTION IF EXISTS public.debug_whoami();
DROP FUNCTION IF EXISTS public.debug_exercises_count();

-- ===== record_set =====
-- セットを1件追加する。set_noの採番（max+1）とinsertを1トランザクションで行う。
--
--   p_session_id が NULL の場合: p_exercise_id と p_date から記録先セッションを決める。
--     - 同じ種目・同じ日のセッションがあれば、最新(created_at降順)のものに追加する
--     - なければ新しく作成する（p_timeが未指定なら '00:00'）
--     - p_new_session = true のときは、既存セッションがあっても常に新規作成する
--   p_session_id が指定された場合: そのセッションに追加する。
--     （既存PWAのように「いま開いているセッション」へ確実に追加したい呼び出し元用。
--       p_exercise_id を併せて渡した場合は、セッションの種目と一致することを検証する）
--
-- 戻り値: 作成したsetの行 + 追加先のsession_id + セッションを新規作成したか。
CREATE OR REPLACE FUNCTION public.record_set(
  p_exercise_id text,
  p_date        date,
  p_time        text,
  p_weight_kg   numeric,
  p_reps        integer,
  p_new_session boolean DEFAULT false,
  p_session_id  uuid    DEFAULT NULL
)
  RETURNS TABLE (
    id              uuid,
    session_id      uuid,
    set_no          integer,
    weight_kg       numeric,
    reps            integer,
    session_created boolean
  )
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = ''
AS $function$
#variable_conflict use_column
DECLARE
  v_session_id uuid;
  v_created    boolean := false;
  v_set_no     integer;
  v_set_id     uuid;
BEGIN
  IF p_weight_kg IS NULL OR p_reps IS NULL THEN
    RAISE EXCEPTION 'p_weight_kg と p_reps は必須です';
  END IF;
  IF p_weight_kg < 0 OR p_reps <= 0 THEN
    RAISE EXCEPTION '重量は0以上、回数は1以上で指定してください (weight_kg=%, reps=%)', p_weight_kg, p_reps;
  END IF;

  IF p_session_id IS NOT NULL THEN
    -- 追加先が明示された場合。FOR UPDATEで同一セッションへの同時追加を直列化する。
    SELECT s.id INTO v_session_id
      FROM public.workout_sessions s
     WHERE s.id = p_session_id
       AND (p_exercise_id IS NULL OR s.exercise_id = p_exercise_id)
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'セッションが見つかりません: %', p_session_id;
    END IF;
  ELSE
    IF p_exercise_id IS NULL OR p_date IS NULL THEN
      RAISE EXCEPTION 'p_session_id を指定しない場合は p_exercise_id と p_date が必須です';
    END IF;
    IF p_time IS NOT NULL AND p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'p_time は HH:MM 形式で指定してください: %', p_time;
    END IF;

    -- RLSにより、自分の種目のみ参照できる
    PERFORM 1 FROM public.exercises e WHERE e.id = p_exercise_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '種目が見つかりません: %', p_exercise_id;
    END IF;

    -- 同じ種目・同じ日に対する同時実行（セッションの二重作成）を直列化する
    PERFORM pg_advisory_xact_lock(
      hashtextextended('record_set:' || auth.uid()::text || ':' || p_exercise_id || ':' || p_date::text, 0)
    );

    IF NOT COALESCE(p_new_session, false) THEN
      SELECT s.id INTO v_session_id
        FROM public.workout_sessions s
       WHERE s.exercise_id = p_exercise_id
         AND s.session_date = p_date
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT 1
         FOR UPDATE;
    END IF;

    IF v_session_id IS NULL THEN
      INSERT INTO public.workout_sessions (exercise_id, session_date, session_time)
      VALUES (p_exercise_id, p_date, COALESCE(p_time, '00:00'))
      RETURNING workout_sessions.id INTO v_session_id;
      v_created := true;
    END IF;
  END IF;

  SELECT COALESCE(MAX(st.set_no), 0) + 1 INTO v_set_no
    FROM public.sets st
   WHERE st.session_id = v_session_id;

  INSERT INTO public.sets (session_id, set_no, weight_kg, reps)
  VALUES (v_session_id, v_set_no, p_weight_kg, p_reps)
  RETURNING sets.id INTO v_set_id;

  RETURN QUERY SELECT v_set_id, v_session_id, v_set_no, p_weight_kg, p_reps, v_created;
END;
$function$;

-- ===== get_meal_daily_totals =====
-- 日付ごとのPFC・カロリー合計と記録件数。期間指定は必須。
-- 返す行数は日数以下。PostgRESTのMax rows(1000)で黙って切れないよう、期間は730日までに制限する。
CREATE OR REPLACE FUNCTION public.get_meal_daily_totals(p_from date, p_to date)
  RETURNS TABLE (
    log_date      date,
    protein_g     numeric,
    fat_g         numeric,
    carb_g        numeric,
    calories_kcal numeric,
    meal_count    integer
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
AS $function$
#variable_conflict use_column
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION '期間(p_from, p_to)は必須です';
  END IF;
  IF p_from > p_to THEN
    RAISE EXCEPTION 'p_from は p_to 以前の日付を指定してください';
  END IF;
  IF p_to - p_from > 730 THEN
    RAISE EXCEPTION '期間は730日以内で指定してください';
  END IF;

  RETURN QUERY
  SELECT m.log_date,
         SUM(m.protein_g),
         SUM(m.fat_g),
         SUM(m.carb_g),
         SUM(m.calories_kcal),
         COUNT(*)::integer
    FROM public.meal_logs m
   WHERE m.user_id = auth.uid()
     AND m.log_date BETWEEN p_from AND p_to
   GROUP BY m.log_date
   ORDER BY m.log_date;
END;
$function$;

-- ===== get_body_weight_range =====
-- 期間内の体重ログ（同日複数回の記録もそのまま返す）。期間指定は必須（730日まで）。
CREATE OR REPLACE FUNCTION public.get_body_weight_range(p_from date, p_to date)
  RETURNS TABLE (
    id         uuid,
    log_date   date,
    weight_kg  numeric,
    created_at timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
AS $function$
#variable_conflict use_column
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION '期間(p_from, p_to)は必須です';
  END IF;
  IF p_from > p_to THEN
    RAISE EXCEPTION 'p_from は p_to 以前の日付を指定してください';
  END IF;
  IF p_to - p_from > 730 THEN
    RAISE EXCEPTION '期間は730日以内で指定してください';
  END IF;

  RETURN QUERY
  SELECT b.id, b.log_date, b.weight_kg, b.created_at
    FROM public.body_weight_logs b
   WHERE b.user_id = auth.uid()
     AND b.log_date BETWEEN p_from AND p_to
   ORDER BY b.log_date, b.created_at;
END;
$function$;

-- ===== get_exercise_history =====
-- 種目ごとの履歴。新しいセッションから最大p_limit件（1〜100に丸める。既定20）を返す。
-- 筋トレはセットごとに1行（set_no, weight_kg, reps）、有酸素はセッションごとに1行
-- （cardioの各列。set_no等はNULL）。セット/有酸素の記録が無いセッションも1行返る。
CREATE OR REPLACE FUNCTION public.get_exercise_history(
  p_exercise_id text,
  p_from        date    DEFAULT NULL,
  p_limit       integer DEFAULT 20
)
  RETURNS TABLE (
    session_id   uuid,
    session_date date,
    session_time text,
    set_no       integer,
    weight_kg    numeric,
    reps         integer,
    time_min     numeric,
    dist_km      numeric,
    cal_kcal     numeric,
    hr_bpm       numeric,
    max_spd_kmh  numeric,
    avg_spd_kmh  numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
AS $function$
  WITH target AS (
    SELECT s.id, s.session_date, s.session_time, s.created_at
      FROM public.workout_sessions s
     WHERE s.exercise_id = p_exercise_id
       AND (p_from IS NULL OR s.session_date >= p_from)
     ORDER BY s.session_date DESC, s.session_time DESC, s.created_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100))
  )
  SELECT t.id, t.session_date, t.session_time,
         st.set_no, st.weight_kg, st.reps,
         c.time_min, c.dist_km, c.cal_kcal, c.hr_bpm, c.max_spd_kmh, c.avg_spd_kmh
    FROM target t
    LEFT JOIN public.sets st ON st.session_id = t.id
    LEFT JOIN public.cardio_logs c ON c.session_id = t.id
   ORDER BY t.session_date DESC, t.session_time DESC, t.created_at DESC, st.set_no
$function$;

-- 新規関数は、ログイン済みユーザー(authenticated)だけが実行できるようにする。
-- （Supabaseの既定ではanonにも実行権限が付くため、明示的に外す）
REVOKE ALL ON FUNCTION public.record_set(text, date, text, numeric, integer, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_meal_daily_totals(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_body_weight_range(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_exercise_history(text, date, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_set(text, date, text, numeric, integer, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meal_daily_totals(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_body_weight_range(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exercise_history(text, date, integer) TO authenticated;
