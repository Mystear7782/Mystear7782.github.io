-- フェーズ1のDB改修（制約・record_set・集計RPC・権限）のテスト。
-- 実行: npx supabase test db   （ローカルSupabase。トランザクション内で実行され、最後にROLLBACKされる）
begin;
select plan(40);

-- テスト用ユーザー2名（A: 操作する本人 / B: 他人）
insert into auth.users (id, instance_id, aud, role, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

-- ===== 0. 構造 =====
select hasnt_function('public', 'debug_whoami', 'debug_whoami は存在しない');
select hasnt_function('public', 'debug_exercises_count', 'debug_exercises_count は存在しない');
select has_column('public', 'menu_set_items', 'position', 'menu_set_items.position がある');
select has_function('public', 'record_set', array['text','date','text','numeric','integer','boolean','uuid'], 'record_set が存在する');

-- pgTAPの一時テーブルを、ロール切替後(authenticated/anon)でも使えるようにする
grant all on all tables in schema pg_temp to anon, authenticated;

-- ===== ユーザーAとして操作 =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

insert into public.exercises (id, name, category, type) values
  ('menu_1', 'ベンチプレス', '胸', 'フリーウェイト'),
  ('menu_2', 'ランニング', '有酸素運動', '有酸素運動');

-- ===== 1. record_set =====
create temp table r1 as select * from public.record_set('menu_1', '2026-10-01', '10:30', 60, 10);
create temp table r2 as select * from public.record_set('menu_1', '2026-10-01', '23:00', 62.5, 8);

select is((select set_no from r1), 1, '初回: set_no=1');
select ok((select session_created from r1), '初回: セッションを新規作成した');
select is((select set_no from r2), 2, '2回目: set_no=2（連番）');
select is((select session_id from r2), (select session_id from r1), '2回目: 同じセッションに追加された');
select ok(not (select session_created from r2), '2回目: セッションは新規作成していない');
select is((select session_time from public.workout_sessions where id = (select session_id from r1)), '10:30',
  '既存セッションへの追加では session_time が変わらない');

create temp table r3 as select * from public.record_set('menu_1', '2026-10-01', '18:00', 70, 5, true);
select isnt((select session_id from r3), (select session_id from r1), 'p_new_session=true: 別セッションが作られた');
select is((select set_no from r3), 1, 'p_new_session=true: 新セッションのset_noは1');

-- 同一トランザクション内ではnow()が同じ値になるため、r3のセッションの方が新しいことを明示する
-- （本番では呼び出しごとに別トランザクションなのでcreated_atは自然に新しくなる）
update public.workout_sessions set created_at = created_at + interval '1 minute' where id = (select session_id from r3);
create temp table r4 as select * from public.record_set('menu_1', '2026-10-01', null, 65, 6);
select is((select session_id from r4), (select session_id from r3), '同日に複数セッションがあれば最新(created_at降順)に追加');

create temp table r5 as select * from public.record_set(null, null, null, 50, 12, false, (select session_id from r1));
select is((select set_no from r5), 3, 'p_session_id指定: 指定セッションの末尾(set_no=3)に追加');
select is((select session_id from r5), (select session_id from r1), 'p_session_id指定: 最新ではなく指定セッションに追加');

select is((select session_time from public.workout_sessions where id = (select session_id from r3)), '18:00', '新規作成時のsession_timeが保存される');
create temp table r6 as select * from public.record_set('menu_1', '2026-10-02', null, 40, 10);
select is((select session_time from public.workout_sessions where id = (select session_id from r6)), '00:00', 'p_time未指定の新規作成は 00:00');

select throws_ok($$select * from public.record_set('menu_nothing', '2026-10-01', null, 40, 10)$$, 'P0001', null, '存在しない種目はエラー');
select throws_ok($$select * from public.record_set('menu_1', '2026-10-01', '25:99', 40, 10)$$, 'P0001', null, '不正なp_timeはエラー');
select throws_ok($$select * from public.record_set('menu_1', '2026-10-01', null, -1, 10)$$, 'P0001', null, '負の重量はエラー');
select throws_ok($$select * from public.record_set('menu_1', '2026-10-01', null, 40, 0)$$, 'P0001', null, '回数0はエラー');
select throws_ok($$select * from public.record_set('menu_2', null, null, 40, 5, false, (select session_id from r1))$$, 'P0001', null, 'p_exercise_idがセッションの種目と違えばエラー');

-- ===== 2. 制約 =====
select throws_ok($$insert into public.sets (session_id, set_no, weight_kg, reps) values ((select session_id from r1), 1, 10, 10)$$,
  '23505', null, 'unique(session_id,set_no): 重複するset_noは入れられない');
select throws_ok($$insert into public.exercises (id, name, category, type) values ('bad id!', 'x', '胸', 'マシン')$$,
  '23514', null, 'exercises.idの形式チェック');
select throws_ok($$insert into public.sets (session_id, set_no, weight_kg, reps) values ((select session_id from r1), 99, 10, 0)$$,
  '23514', null, 'sets.reps > 0 のチェック');
select throws_ok($$insert into public.sets (session_id, set_no, weight_kg, reps) values ((select session_id from r1), 99, -5, 10)$$,
  '23514', null, 'sets.weight_kg >= 0 のチェック');

-- ===== 3. 集計RPC =====
insert into public.meal_logs (log_date, meal_type, protein_g, fat_g, carb_g) values
  ('2026-10-01', '朝', 30, 10, 50),
  ('2026-10-01', '昼', 40, 20, 80),
  ('2026-10-03', '夜', 25, 15, 60);

select is((select count(*)::int from public.get_meal_daily_totals('2026-10-01', '2026-10-31')), 2, 'get_meal_daily_totals: 記録のある日だけ返る');
select results_eq(
  $$select protein_g, fat_g, carb_g, calories_kcal, meal_count from public.get_meal_daily_totals('2026-10-01', '2026-10-01')$$,
  $$select 70::numeric, 30::numeric, 130::numeric, (70*4 + 30*9 + 130*4)::numeric, 2$$,
  'get_meal_daily_totals: 日別合計とカロリー(P×4+F×9+C×4)が正しい');
select throws_ok($$select * from public.get_meal_daily_totals(null, '2026-10-31')$$, 'P0001', null, 'get_meal_daily_totals: 期間未指定はエラー');
select throws_ok($$select * from public.get_meal_daily_totals('2024-01-01', '2026-10-31')$$, 'P0001', null, 'get_meal_daily_totals: 730日超はエラー');

insert into public.body_weight_logs (log_date, weight_kg) values ('2026-10-01', 70.2), ('2026-10-01', 70.0), ('2026-10-05', 69.8), ('2026-11-20', 68.0);
select is((select count(*)::int from public.get_body_weight_range('2026-10-01', '2026-10-31')), 3, 'get_body_weight_range: 期間内のみ・同日複数も返る');
select throws_ok($$select * from public.get_body_weight_range('2026-10-31', '2026-10-01')$$, 'P0001', null, 'get_body_weight_range: from>to はエラー');

insert into public.workout_sessions (id, exercise_id, session_date) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'menu_2', '2026-10-01');
insert into public.cardio_logs (session_id, time_min, dist_km, cal_kcal, hr_bpm) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 30, 5, 300, 140);
-- menu_1: 3セッション(10/01 x2, 10/02)、セット数は 3 + 2 + 1 = 6
select is((select count(*)::int from public.get_exercise_history('menu_1', null, 20)), 6, 'get_exercise_history: 筋トレはセットごとに1行(3セッション分=6セット)');
select is((select count(distinct session_id)::int from public.get_exercise_history('menu_1', null, 1)), 1, 'get_exercise_history: p_limitはセッション数に効く');
select is((select dist_km from public.get_exercise_history('menu_2')), 5::numeric, 'get_exercise_history: 有酸素はcardioの値を返す');

-- ===== 4. 他人(ユーザーB)からは見えない・書けない =====
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select throws_ok($$select * from public.record_set('menu_1', '2026-10-01', null, 40, 10)$$, 'P0001', null, '他人の種目にはセットを記録できない');
select is((select count(*)::int from public.get_meal_daily_totals('2026-10-01', '2026-10-31')), 0, '他人の食事は集計に出ない');

-- ===== 5. 匿名ロールは何もできない =====
set local role anon;
select throws_ok($$select * from public.exercises$$, '42501', null, 'anonはテーブルを読めない');
select throws_ok($$select * from public.get_my_exercises()$$, '42501', null, 'anonは既存RPCを実行できない');
select throws_ok($$select * from public.record_set('menu_1', '2026-10-01', null, 40, 10)$$, '42501', null, 'anonはrecord_setを実行できない');

select * from finish();
rollback;
