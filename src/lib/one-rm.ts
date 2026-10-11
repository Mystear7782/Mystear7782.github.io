// 推定1RM・RM換算の計算。Epley/Brzycki系の近似式（ベンチプレスは w×r/40+w、スクワット/DLは w×r/33.3+w）。

/** セット単体の推定1RM。1回のときは重量そのもの（式を通すと1.025倍になってしまうため） */
export const orm = (w: number, r: number): number => (r === 1 ? w : +(w * (1 + r / 40)).toFixed(1))

/** 推定1RM（ベンチプレス） */
export const rmBP = (w: number, r: number): number => (w * r) / 40 + w

/** 推定1RM（スクワット・デッドリフト） */
export const rmSQ = (w: number, r: number): number => (w * r) / 33.3 + w

/** 逆算: r回で扱える重量 = 1RM ÷ (r ÷ divisor + 1) */
export const rmWeightFromMax = (max: number, r: number, divisor: number): number =>
  max / (r / divisor + 1)

/** 小数部 >= 0.5 → 切り上げ、< 0.5 → 切り捨て */
export function rmRound(n: number): number {
  const dec = n - Math.floor(n)
  return dec >= 0.5 ? Math.ceil(n) : Math.floor(n)
}

export type RmRow = { rep: number; bench: number; squat: number }

/** 1〜10rep の換算表。1repは最大RMそのもの */
export function rmTable(maxVal: number): RmRow[] {
  const rows: RmRow[] = []
  for (let rep = 1; rep <= 10; rep++) {
    rows.push({
      rep,
      bench: rep === 1 ? maxVal : rmRound(rmWeightFromMax(maxVal, rep, 40)),
      squat: rep === 1 ? maxVal : rmRound(rmWeightFromMax(maxVal, rep, 33.3)),
    })
  }
  return rows
}

/** カロリー(P×4 + F×9 + C×4)。DB側の生成列と同じ式で、入力時のプレビューに使う */
export const calcMealCalories = (p: number, f: number, c: number): number =>
  +(p * 4 + f * 9 + c * 4).toFixed(1)
