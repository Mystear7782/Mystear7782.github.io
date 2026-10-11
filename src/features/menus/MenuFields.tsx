import { CARDIO, NAME_MAX_LENGTH, SELECTABLE_TYPES, TYPE_ICONS } from '@/lib/constants'
import { clampLength } from '@/lib/format'

type Props = {
  /** 追加画面は '' 、編集モーダルは 'edit-'（旧アプリのIDを引き継ぐ） */
  idPrefix?: '' | 'edit-'
  category: string
  type: string | null
  name: string
  onCategoryChange: (category: string) => void
  onTypeChange: (type: string) => void
  onNameChange: (name: string) => void
  /** 部位セレクトの先頭に「-- 部位を選択 --」を出す（追加画面のみ） */
  withPlaceholder?: boolean
}

/** 部位・種別・メニュー名の入力欄（メニュー追加画面と、メニュー編集モーダルで共通） */
export function MenuFields({
  idPrefix = '',
  category,
  type,
  name,
  onCategoryChange,
  onTypeChange,
  onNameChange,
  withPlaceholder,
}: Props) {
  const isCardio = category === CARDIO
  return (
    <>
      <div className="card-label">部位</div>
      <div className="form-group">
        <div className="sel-wrap">
          <select
            className="form-select"
            id={`${idPrefix}sel-cat`}
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            {withPlaceholder && <option value="">-- 部位を選択 --</option>}
            <option value="胸">胸</option>
            <option value="背中">背中</option>
            <option value="肩">肩</option>
            <option value="足">足</option>
            <option value="腕">腕</option>
            <option value="有酸素運動">有酸素運動</option>
            <option value="その他">その他</option>
          </select>
        </div>
      </div>
      <div id={`${idPrefix}type-section`} style={{ display: isCardio ? 'none' : 'block' }}>
        <div className="card-label">種別</div>
        <div className="form-group">
          <div className="type-chips">
            {SELECTABLE_TYPES.map((t) => (
              <div
                key={t}
                className={`type-chip${type === t ? ' sel' : ''}`}
                data-type={t}
                onClick={() => onTypeChange(t)}
              >
                {TYPE_ICONS[t]} {t}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card-label">メニュー名</div>
      <div className="form-group">
        <input
          type="text"
          className="form-input"
          id={`${idPrefix}inp-name`}
          placeholder="例：ベンチプレス（全角30文字まで）"
          value={name}
          onChange={(e) => onNameChange(clampLength(e.target.value, NAME_MAX_LENGTH))}
        />
      </div>
    </>
  )
}
