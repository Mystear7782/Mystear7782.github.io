-- フェーズ2: sets に created_at を追加
-- MCPサーバーの二重登録防止（「直近2分以内に同じ内容のセットがあれば新規作成しない」）には、
-- セットがいつ作られたかが必要だが、setsにはタイムスタンプ列が無かった。
-- （同じ重量・回数のセットを連続で記録するのは通常の操作なので、時刻なしでは
--   正当な連続セットと再試行による重複を区別できない）
--
-- 既存行は、所属セッションの作成時刻で埋める（実際のセット作成時刻は不明なため、
-- 最も近い既知の値を使う）。新規行は now() が入る。PWA・record_set は変更不要。
ALTER TABLE public.sets
  ADD COLUMN created_at timestamp with time zone NOT NULL DEFAULT now();

UPDATE public.sets st
   SET created_at = s.created_at
  FROM public.workout_sessions s
 WHERE s.id = st.session_id;

-- 二重登録チェック(種目・日付・時刻範囲の絞り込み)用
CREATE INDEX sets_created_at_idx ON public.sets USING btree (created_at);
