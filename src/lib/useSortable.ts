// ドラッグハンドル起点の並び替え（メニュー一覧・メニューセット内で共通）。
//
// 行全体を長押しでドラッグ可能にすると、iOSでは標準のテキスト選択/コピー用ポップアップと競合して
// ドラッグできなくなる。そのため、行本体ではなく専用の小さな「つまみ」(touch-action:none)からだけ
// ドラッグを開始する。
//
// 実装方式:
// - ドラッグ中の行は position:fixed にして指の位置に追従させ、元の位置には同じ高さの
//   プレースホルダーを置く。入れ替え先は「他の行の中心Yとの比較」だけで決める（隣と1件ずつ
//   入れ替える方式ではないので、素早く動かして複数件ジャンプしても1回の移動で正しい位置になる）。
// - 行のDOMの並びは一切変えず、見た目の並びはCSSの `order` で表現する。ReactがDOMノードを
//   移動させるとポインターキャプチャが外れてドラッグが途切れてしまうため。
// - 4px未満の動き(タップ相当)ではドラッグを開始せず、保存も呼ばない。
// - pointercancel（iOSの通知・画面端スワイプ等）では並びを確定せず元に戻す。
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'

/** これ未満の移動量(px)ではドラッグを開始しない */
export const DRAG_START_THRESHOLD = 4

type DragState = {
  id: string
  /** ドラッグ中の行の見た目の位置(fixed) */
  top: number
  left: number
  width: number
  height: number
  /** 他の行の並びの中で、プレースホルダーが入っている位置(0始まり) */
  slot: number
}

export type Sortable<T extends { id: string }> = {
  /** 並び替え確定〜サーバー反映までの間は、確定した並びを返す */
  orderedIds: string[]
  /** 行に付けるstyle（order、ドラッグ中の行はfixed位置） */
  rowStyle: (id: string) => CSSProperties | undefined
  isDragging: (id: string) => boolean
  /** プレースホルダー（ドラッグ中だけ非null）。リストの中に `<div className="drag-row-placeholder" style=...>` で描画する */
  placeholderStyle: CSSProperties | null
  /** 行のref。位置の計測に使う */
  rowRef: (id: string) => (el: HTMLElement | null) => void
  /** つまみ(ハンドル)に展開する props */
  handleProps: (id: string) => {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void
    onClick: (e: React.MouseEvent) => void
  }
  /** 型引数を使うためのダミー（items の型を呼び出し側で推論させる） */
  readonly _item?: T
}

export function useSortable<T extends { id: string }>(
  items: T[],
  onCommit: (orderedIds: string[]) => Promise<unknown>,
): Sortable<T> {
  const baseIds = items.map((i) => i.id)
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const rows = useRef(new Map<string, HTMLElement>())
  const cleanup = useRef<(() => void) | null>(null)

  // 並び替え中にアンマウント（画面遷移）されたら、window に付けたリスナーを外す
  useEffect(() => () => cleanup.current?.(), [])

  // 保存中でない間は、データ側(items)の並びを正とする
  const currentIds = localOrder ?? baseIds

  const rowRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el)
      else rows.current.delete(id)
    },
    [],
  )

  const startDrag = (e: PointerEvent<HTMLElement>, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const rowEl = rows.current.get(id)
    if (!rowEl) return
    e.preventDefault()
    e.stopPropagation()

    const handleEl = e.currentTarget
    const pointerId = e.pointerId
    try {
      handleEl.setPointerCapture(pointerId)
    } catch {
      /* ポインターキャプチャが使えない環境ではwindowのリスナーだけで動かす */
    }

    const startRect = rowEl.getBoundingClientRect()
    const grabOffsetY = e.clientY - startRect.top // 行内のどこをつまんだか
    const startClientY = e.clientY
    const originalIds = [...currentIds]
    const others = originalIds.filter((x) => x !== id)
    let dragging = false
    let slot = originalIds.indexOf(id)

    const begin = () => {
      dragging = true
      if (navigator.vibrate) navigator.vibrate(15)
    }

    const onMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      if (!dragging) {
        if (Math.abs(ev.clientY - startClientY) < DRAG_START_THRESHOLD) return
        begin()
      }
      const top = ev.clientY - grabOffsetY
      const centerY = top + startRect.height / 2
      // 他の行の中心Yと比較して、プレースホルダーを入れる位置を決める
      let nextSlot = others.length
      for (let i = 0; i < others.length; i++) {
        const r = rows.current.get(others[i])?.getBoundingClientRect()
        if (r && centerY < r.top + r.height / 2) {
          nextSlot = i
          break
        }
      }
      slot = nextSlot
      setDrag({
        id,
        top,
        left: startRect.left,
        width: startRect.width,
        height: startRect.height,
        slot,
      })
    }

    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      try {
        handleEl.releasePointerCapture(pointerId)
      } catch {
        /* 既に解放済み */
      }
      cleanup.current = null
    }

    const onUp = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      stop()
      setDrag(null)
      if (!dragging) return
      const finalIds = [...others.slice(0, slot), id, ...others.slice(slot)]
      const changed = finalIds.some((x, i) => x !== originalIds[i])
      // 並びが実際に変わっていない(つまみに触れただけ)場合は保存処理を呼ばない
      if (!changed) return
      setLocalOrder(finalIds)
      // 保存が終わる(成功/失敗)まで確定した並びを表示し、終わったらデータ側の並びに戻す。
      // 失敗時はキャッシュが更新されないので、元の並びに戻る。
      void onCommit(finalIds)
        .catch(() => undefined)
        .finally(() => setLocalOrder(null))
    }

    // 中断された場合（通知・画面端スワイプ等）は並びを確定しない
    const onCancel = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      stop()
      setDrag(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    cleanup.current = stop
  }

  const rowStyle = (id: string): CSSProperties | undefined => {
    if (drag && drag.id === id) {
      return {
        position: 'fixed',
        top: drag.top,
        left: drag.left,
        width: drag.width,
        zIndex: 30,
      }
    }
    // 見た目の並び = CSSのorder。ドラッグ中は、他の行の並びにプレースホルダーを割り込ませる
    if (drag) {
      const others = currentIds.filter((x) => x !== drag.id)
      const i = others.indexOf(id)
      if (i < 0) return undefined
      return { order: i < drag.slot ? i : i + 1 }
    }
    const i = currentIds.indexOf(id)
    return localOrder && i >= 0 ? { order: i } : undefined
  }

  return {
    orderedIds: currentIds,
    rowStyle,
    isDragging: (id) => drag?.id === id,
    placeholderStyle: drag ? { height: drag.height, order: drag.slot } : null,
    rowRef,
    handleProps: (id) => ({
      onPointerDown: (e) => startDrag(e, id),
      // つまみのクリックが行のクリック(詳細画面への遷移)に伝わらないようにする
      onClick: (e) => e.stopPropagation(),
    }),
  }
}
