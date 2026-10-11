-- フェーズ3: RLSポリシーの auth.uid() を (select auth.uid()) の形に書き換える
-- ポリシー式の中で auth.uid() を直接呼ぶと、行ごとに関数が再評価される。(select auth.uid()) と書くと
-- 1つのクエリで1回だけ評価(InitPlan)されるので、行数が増えたときの速度が安定する（Supabase推奨の書き方）。
-- 意味（本人の行だけ読み書きできる）は変わらない。対象ロール(authenticated)も変えない。

ALTER POLICY "owner only" ON public.body_weight_logs
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "owner only" ON public.exercises
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "owner only" ON public.meal_logs
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "owner only" ON public.menu_sets
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "owner only via exercise" ON public.workout_sessions
  USING (EXISTS (
    SELECT 1 FROM public.exercises e
     WHERE e.id = workout_sessions.exercise_id AND e.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.exercises e
     WHERE e.id = workout_sessions.exercise_id AND e.user_id = (select auth.uid())
  ));

ALTER POLICY "owner only via session" ON public.sets
  USING (EXISTS (
    SELECT 1 FROM public.workout_sessions s
      JOIN public.exercises e ON e.id = s.exercise_id
     WHERE s.id = sets.session_id AND e.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workout_sessions s
      JOIN public.exercises e ON e.id = s.exercise_id
     WHERE s.id = sets.session_id AND e.user_id = (select auth.uid())
  ));

ALTER POLICY "owner only via session" ON public.cardio_logs
  USING (EXISTS (
    SELECT 1 FROM public.workout_sessions s
      JOIN public.exercises e ON e.id = s.exercise_id
     WHERE s.id = cardio_logs.session_id AND e.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workout_sessions s
      JOIN public.exercises e ON e.id = s.exercise_id
     WHERE s.id = cardio_logs.session_id AND e.user_id = (select auth.uid())
  ));

ALTER POLICY "owner only via menu_set" ON public.menu_set_items
  USING (EXISTS (
    SELECT 1 FROM public.menu_sets ms
     WHERE ms.id = menu_set_items.menu_set_id AND ms.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.menu_sets ms
     WHERE ms.id = menu_set_items.menu_set_id AND ms.user_id = (select auth.uid())
  ));
