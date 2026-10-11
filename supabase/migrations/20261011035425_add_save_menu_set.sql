-- フェーズ3: メニューセットの保存RPC（save_menu_set）
-- メニューセット(menu_sets)と所属メニュー(menu_set_items)の作成・更新を、1トランザクションで行う。
-- PostgRESTでは複数テーブルの更新を1リクエストでまとめられないため、クライアントから
-- 「セットを更新 → 所属を全削除 → 所属を再作成」と順に呼ぶと、途中で失敗したときに所属が失われる。
--
--   p_id が NULL: 新しいセットを作成する。
--   p_id 指定   : そのセットの名前を更新し、所属メニューを p_exercise_ids の内容に置き換える。
--   p_exercise_ids の並び順がそのまま position（0始まり）になる。
--   重複したidは最初の位置だけ採用する。自分のメニューとして存在しないid(RLSで見えないものを含む)は無視する。
-- security invoker（RLSが効く）。戻り値はセットのid。
CREATE OR REPLACE FUNCTION public.save_menu_set(
  p_id           uuid,
  p_name         text,
  p_exercise_ids text[]
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = ''
AS $function$
DECLARE
  v_id   uuid;
  v_name text := btrim(COALESCE(p_name, ''));
  v_n    integer;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'セット名を入力してください';
  END IF;
  IF p_exercise_ids IS NULL OR cardinality(p_exercise_ids) = 0 THEN
    RAISE EXCEPTION 'メニューを1つ以上選択してください';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.menu_sets (name) VALUES (v_name) RETURNING id INTO v_id;
  ELSE
    UPDATE public.menu_sets SET name = v_name WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'メニューセットが見つかりません: %', p_id;
    END IF;
    DELETE FROM public.menu_set_items WHERE menu_set_id = v_id;
  END IF;

  INSERT INTO public.menu_set_items (menu_set_id, exercise_id, position)
  SELECT v_id, t.exercise_id, (row_number() OVER (ORDER BY t.ord) - 1)::integer
    FROM (
      SELECT u.exercise_id, MIN(u.ord) AS ord
        FROM unnest(p_exercise_ids) WITH ORDINALITY AS u(exercise_id, ord)
       GROUP BY u.exercise_id
    ) t
    JOIN public.exercises e ON e.id = t.exercise_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    -- 指定されたメニューがひとつも見つからない場合は、セットだけが空で残らないよう全体を取り消す
    RAISE EXCEPTION '指定されたメニューが見つかりません';
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_menu_set(uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_menu_set(uuid, text, text[]) TO authenticated;
