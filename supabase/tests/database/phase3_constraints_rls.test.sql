-- フェーズ3: 種目名の一意制約（アーカイブ済みを除く）と、RLSポリシーの (select auth.uid()) 化のテスト。
-- 実行: npx supabase test db
begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

-- ===== RLSポリシーの式が InitPlan 形式（(select auth.uid())）になっている =====
-- pg_policies の式は、(select auth.uid()) が (SELECT auth.uid() AS uid) と整形されて出力される
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.uid\(\)'
      and (coalesce(qual, '') || coalesce(with_check, '')) !~ 'SELECT auth\.uid\(\) AS uid'),
  0,
  'すべてのポリシーで auth.uid() が (select auth.uid()) の形になっている');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and roles::text <> '{authenticated}'),
  0,
  'ポリシーの対象ロールは authenticated のまま');
select is((select count(*)::int from pg_policies where schemaname = 'public'), 8, 'ポリシーは8本のまま');

grant all on all tables in schema pg_temp to anon, authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

-- ===== 一意制約: アーカイブされていない種目の (user, category, name) =====
insert into public.exercises (id, name, category, type) values ('m1', 'ベンチプレス', '胸', 'マシン');

select throws_ok(
  $$insert into public.exercises (id, name, category, type) values ('m2', 'ベンチプレス', '胸', 'フリーウェイト')$$,
  '23505', null, '同じ部位の同名の種目は作れない');
select lives_ok(
  $$insert into public.exercises (id, name, category, type) values ('m3', 'ベンチプレス', '背中', 'マシン')$$,
  '部位が違えば同名でも作れる');

-- アーカイブ済みは対象外: アーカイブして、同名を作り直せる
update public.exercises set archived = true where id = 'm1';
select lives_ok(
  $$insert into public.exercises (id, name, category, type) values ('m4', 'ベンチプレス', '胸', 'フリーウェイト')$$,
  'アーカイブ済みの種目と同名の種目を作れる');
-- アーカイブ済みが2件あってもよい
select lives_ok(
  $$insert into public.exercises (id, name, category, type, archived) values ('m5', 'ベンチプレス', '胸', 'マシン', true)$$,
  'アーカイブ済み同士は同名でもよい');
-- アーカイブを解除すると、同名の有効な種目(m4)と衝突する
select throws_ok(
  $$update public.exercises set archived = false where id = 'm1'$$,
  '23505', null, '同名の有効な種目があるとき、アーカイブ解除は衝突する');
select throws_ok(
  $$update public.exercises set name = 'ベンチプレス', category = '胸' where id = 'm3'$$,
  '23505', null, '名前・部位の変更で同名になる場合も衝突する');

-- ===== RLSの動作（書き換え後も本人のデータだけ見える・書ける） =====
insert into public.workout_sessions (id, exercise_id, session_date) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'm4', '2026-10-01');
insert into public.sets (session_id, set_no, weight_kg, reps) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 1, 60, 10);
select is((select count(*)::int from public.sets), 1, '本人は自分のセットを読める');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*)::int from public.exercises), 0, '他人の種目は見えない');
select is((select count(*)::int from public.sets), 0, '他人のセットは見えない');
select throws_ok(
  $$insert into public.sets (session_id, set_no, weight_kg, reps) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 2, 60, 10)$$,
  '42501', null, '他人のセッションにセットは追加できない');

-- 同名でも、別ユーザーなら作れる
select lives_ok(
  $$insert into public.exercises (id, name, category, type) values ('m6', 'ベンチプレス', '胸', 'マシン')$$,
  '別のユーザーは同じ部位・同名の種目を作れる');

select * from finish();
rollback;
