-- フェーズ1: menu_set_items に並び順の列を追加
-- 現PWAはメニューセット内のメニューの並び順を（localStorage上の）配列で持ち、
-- ドラッグで並び替えられる。DBへ移行（フェーズ3）する際に順序を失わないよう、
-- 0始まりの position 列を追加する。本番のmenu_set_itemsは0件なのでバックフィルは不要。
ALTER TABLE public.menu_set_items
  ADD COLUMN position integer NOT NULL DEFAULT 0;

ALTER TABLE public.menu_set_items
  ADD CONSTRAINT menu_set_items_position_check CHECK (position >= 0);
