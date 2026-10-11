// 画面で使うSVGアイコン（旧アプリのインラインSVGをそのまま部品化）。
import type { SVGProps } from 'react'

const base = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
} as const

export const BackIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M10 3L5 8l5 5" />
  </svg>
)
export const ChevronLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} strokeWidth={2} width={14} height={14} {...p}>
    <path d="M10 3L5 8l5 5" />
  </svg>
)
export const ChevronRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} strokeWidth={2} width={14} height={14} {...p}>
    <path d="M6 3l5 5-5 5" />
  </svg>
)
export const ArchiveIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M2 4h12v2H2zM3 6l1 8h8l1-8" />
    <path d="M6 9h4" />
  </svg>
)
export const UnarchiveIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M3 12h10M8 9V3M5 6l3-3 3 3" />
  </svg>
)
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M8 3v10M3 8h10" />
  </svg>
)
export const EditIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M11 2l3 3-8 8H3v-3l8-8z" />
  </svg>
)
export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9" />
  </svg>
)
export const DownloadIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={14} height={14} {...p}>
    <path d="M8 3v8M5 8l3 3 3-3" />
    <path d="M3 13h10" />
  </svg>
)
export const UploadIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M8 13V5M5 8l3-3 3 3" />
    <path d="M3 13h10" />
  </svg>
)
export const FileIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 4h5l3 3v6H4z" />
    <path d="M9 4v3h3" />
  </svg>
)
export const InfoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7v5M8 5v1" />
  </svg>
)
export const CalendarIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={14} height={14} {...p}>
    <rect x="2" y="3" width="12" height="11" rx="2" />
    <path d="M5 1v4M11 1v4M2 7h12" />
  </svg>
)

/** 行の左端にある「つまみ(ハンドル)」。6点ドット */
export const DragHandleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18">
    {[6, 12, 18].flatMap((y) => [
      <circle key={`l${y}`} cx="9" cy={y} r="1.6" fill="currentColor" />,
      <circle key={`r${y}`} cx="15" cy={y} r="1.6" fill="currentColor" />,
    ])}
  </svg>
)

const tab = {
  viewBox: '0 0 24 24',
  width: 22,
  height: 22,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export const HomeTabIcon = () => (
  <svg {...tab}>
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
  </svg>
)
export const RecordTabIcon = () => (
  <svg {...tab}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 9h6M9 13h6M9 17h3" />
  </svg>
)
export const SetTabIcon = () => (
  <svg {...tab}>
    <path d="M4 4h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
  </svg>
)
export const BodyTabIcon = () => (
  <svg {...tab}>
    <rect x="4" y="9" width="16" height="11" rx="2" />
    <circle cx="12" cy="14" r="2.3" />
    <path d="M9 9V7a3 3 0 0 1 6 0v2" />
  </svg>
)
export const MealIcon = () => (
  <svg {...tab} width={20} height={20}>
    <path d="M4 12h16a8 8 0 0 1-16 0Z" />
    <path d="M12 12V4" />
  </svg>
)
export const SettingsIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="3.2" />
    <path d="M20 12L22.3 12M17.66 17.66L19.28 19.28M12 20L12 22.3M6.34 17.66L4.72 19.28M4 12L1.7 12M6.34 6.34L4.72 4.72M12 4L12 1.7M17.66 6.34L19.28 4.72" />
  </svg>
)
