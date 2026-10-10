-- フェーズ1: DB制約の追加
-- 適用前に本番の既存データが制約を満たすことを確認済み
-- （重複(session_id,set_no)=0件 / 不正なexercises.id=0件 / weight_kg<0=0件 / reps<=0=0件）。

-- 同一セッション内でset_noが重複しないようにする。
-- 以前は「最大値を読んで+1してinsert」を2回の通信で行っていたため、
-- 同時書き込みで重複しうる状態だった（record_set RPCで採番を1トランザクションに集約する）。
ALTER TABLE public.sets
  ADD CONSTRAINT sets_session_id_set_no_key UNIQUE (session_id, set_no);

-- exercises.idはクライアント/サーバーが採番するtext。URLや検索条件に埋め込まれても
-- 安全な文字（英数・アンダースコア・ハイフン）に限定する。
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_id_format_check CHECK (id ~ '^[A-Za-z0-9_-]+$');

-- 重量は0以上（自重運動は0kgで記録する）、回数は1以上。
ALTER TABLE public.sets
  ADD CONSTRAINT sets_weight_kg_check CHECK (weight_kg >= 0);

ALTER TABLE public.sets
  ADD CONSTRAINT sets_reps_check CHECK (reps > 0);
