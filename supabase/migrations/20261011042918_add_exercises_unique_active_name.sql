-- フェーズ3: アーカイブされていない種目の (user_id, category, name) を一意にする
-- これまで「同じ部位に同名のメニューがある」ことはアプリ側でしか防いでおらず、
-- MCP（Claude）やCSVインポート、通信が古いまま操作した場合に、同名の種目を作れてしまった。
-- DB側でも防ぐ。アーカイブ済みの種目は対象外（アーカイブして同名を作り直せる）。
--
-- 適用前に、既存データに重複が無いことを確認すること（重複があると、このマイグレーションは失敗する）:
--   select user_id, category, name, count(*)
--     from public.exercises where not archived
--    group by 1, 2, 3 having count(*) > 1;
CREATE UNIQUE INDEX exercises_user_category_name_active_key
  ON public.exercises (user_id, category, name)
  WHERE NOT archived;
