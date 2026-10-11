-- フェーズ3: save_menu_set RPC（メニューセットの作成・更新・並び順・失敗時の取り消し）のテスト。
-- 実行: npx supabase test db
begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

grant all on all tables in schema pg_temp to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

insert into public.exercises (id, name, category, type) values
  ('m1', 'ベンチプレス', '胸', 'フリーウェイト'),
  ('m2', 'スクワット', '足', 'フリーウェイト'),
  ('m3', 'デッドリフト', '背中', 'フリーウェイト');

-- 作成: 並び順がpositionになる
create temp table s1 as select public.save_menu_set(null, '  胸・足デー  ', array['m2','m1']) as id;
select is((select name from public.menu_sets where id = (select id from s1)), '胸・足デー', '作成: 名前の前後の空白は除去される');
select results_eq(
  $$select exercise_id, position from public.menu_set_items where menu_set_id = (select id from s1) order by position$$,
  $$values ('m2'::text, 0), ('m1'::text, 1)$$,
  '作成: 配列の順序がposition(0始まり)になる');

-- 更新: 所属を置き換え、重複idは最初の位置だけ採用、存在しないidは無視
select is(public.save_menu_set((select id from s1), '背中デー', array['m3','m1','m3','nothing']), (select id from s1), '更新: 同じidが返る');
select results_eq(
  $$select exercise_id, position from public.menu_set_items where menu_set_id = (select id from s1) order by position$$,
  $$values ('m3'::text, 0), ('m1'::text, 1)$$,
  '更新: 所属が置き換わり、重複・存在しないidは除かれ、positionに欠番がない');
select is((select name from public.menu_sets where id = (select id from s1)), '背中デー', '更新: 名前が変わる');

-- 失敗時は全体が取り消される（所属が失われない）
select throws_ok($$select public.save_menu_set((select id from s1), 'x', array['nothing'])$$, 'P0001', null, 'すべて存在しないidならエラー');
select is((select count(*)::int from public.menu_set_items where menu_set_id = (select id from s1)), 2, 'エラー時は更新前の所属が残る');
select throws_ok($$select public.save_menu_set(null, '   ', array['m1'])$$, 'P0001', null, '空のセット名はエラー');
select throws_ok($$select public.save_menu_set(null, 'x', array[]::text[])$$, 'P0001', null, 'メニューが0件ならエラー');
select throws_ok($$select public.save_menu_set(gen_random_uuid(), 'x', array['m1'])$$, 'P0001', null, '存在しないセットidの更新はエラー');

-- 他のユーザーのメニュー・セットは扱えない
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select throws_ok($$select public.save_menu_set(null, '他人のメニュー', array['m1'])$$, 'P0001', null, '他人のメニューだけを指定するとエラー');
select throws_ok($$select public.save_menu_set((select id from s1), '乗っ取り', array['m1'])$$, 'P0001', null, '他人のセットは更新できない');

-- 匿名は実行できない
set local role anon;
select throws_ok($$select public.save_menu_set(null, 'x', array['m1'])$$, '42501', null, 'anonはsave_menu_setを実行できない');

select * from finish();
rollback;
