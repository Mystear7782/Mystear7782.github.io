// ファイルのダウンロード（CSVなど）。

/** CSVをダウンロードさせる。ExcelでUTF-8を正しく開けるよう、先頭にBOMを付ける */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** ファイル名に使えない文字を _ に置き換える */
export const safeFileName = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '_')
