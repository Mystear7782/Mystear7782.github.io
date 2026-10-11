// アプリ全体で使う定数と、部位・種別に紐づく表示用のヘルパー。

export const CARDIO = '有酸素運動' as const

/** メニュー一覧の部位の並び順（有酸素運動は最後） */
export const CATEGORIES = ['胸', '背中', '肩', '足', '腕', 'その他', CARDIO] as const
export type Category = (typeof CATEGORIES)[number]

/** メニュー分析の対象部位（有酸素運動は対象外） */
export const ANALYSIS_CATEGORIES = ['胸', '背中', '肩', '足', '腕', 'その他'] as const

/** 追加・編集画面で選べる種別（有酸素運動の部位では種別を選ばず「有酸素運動」固定） */
export const SELECTABLE_TYPES = ['マシン', 'フリーウェイト', '自重運動'] as const
export type SelectableType = (typeof SELECTABLE_TYPES)[number]
export const BODYWEIGHT = '自重運動' as const

export const TYPE_ICONS: Record<SelectableType, string> = {
  マシン: '🔧',
  フリーウェイト: '🏋️',
  自重運動: '💪',
}

export const MEAL_TYPES = ['朝', '昼', '夜', '間食'] as const
export type MealType = (typeof MEAL_TYPES)[number]

/** メニュー名・セット名の最大文字数（[...value].length で数える） */
export const NAME_MAX_LENGTH = 30

const DOT_COLORS: Record<string, string> = {
  胸: '#f87171',
  背中: '#fb923c',
  肩: '#facc15',
  足: '#4ade80',
  腕: '#60a5fa',
  [CARDIO]: '#c084fc',
  その他: '#9ca3af',
}
export const dotColor = (category: string): string => DOT_COLORS[category] ?? '#9ca3af'

const TAG_CLASSES: Record<string, string> = {
  マシン: 'tag-machine',
  フリーウェイト: 'tag-free',
  自重運動: 'tag-body',
  [CARDIO]: 'tag-cardio',
}
export const tagClass = (type: string): string => TAG_CLASSES[type] ?? ''
