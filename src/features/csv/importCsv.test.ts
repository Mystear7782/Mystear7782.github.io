import { importCsvText, summaryMessage, CsvFormatError } from './importCsv'
import type { Exercise, SessionData } from '@/types/domain'

// API層をモックして、取り込みの組み立て（グルーピング・重複判定・取り消し）だけを検証する
const insertExercise = vi.hoisted(() => vi.fn())
const insertSession = vi.hoisted(() => vi.fn())
const insertSets = vi.hoisted(() => vi.fn())
const upsertCardio = vi.hoisted(() => vi.fn())
const deleteSessionRow = vi.hoisted(() => vi.fn())
vi.mock('@/api/exercises', () => ({ insertExercise }))
vi.mock('@/api/sessions', () => ({ insertSession, insertSets, upsertCardio, deleteSessionRow }))

const HEADER =
  'menu_name,category,type,date,session_id,set_no,weight_kg,reps,estimated_1rm_kg,volume_kg\n'
const strength = (...rows: string[]) => HEADER + rows.join('\n') + '\n'

const bench: Exercise = {
  id: 'm_bench',
  name: 'ベンチプレス',
  category: '胸',
  type: 'フリーウェイト',
  archived: false,
  sort_order: 0,
}

beforeEach(() => {
  vi.resetAllMocks()
  let n = 0
  insertExercise.mockImplementation(
    async (input: { name: string; category: string; type: string }) => ({
      id: `new_${++n}`,
      archived: false,
      sort_order: 0,
      ...input,
    }),
  )
  insertSession.mockImplementation(async () => ({
    id: `sess_${++n}`,
    createdAt: '2026-10-01T00:00:00Z',
  }))
  insertSets.mockResolvedValue(undefined)
  upsertCardio.mockResolvedValue(undefined)
  deleteSessionRow.mockResolvedValue(undefined)
})

describe('importCsvText: 筋トレ', () => {
  it('同じsession_idの行は1セッションにまとめ、setsを1回のINSERTで登録する', async () => {
    const r = await importCsvText(
      strength(
        '"ベンチプレス",胸,フリーウェイト,2026-03-01,x1,1,100,10,125,1000',
        '"ベンチプレス",胸,フリーウェイト,2026-03-01,x1,2,105,8,126,840',
      ),
      [bench],
      [],
    )
    expect(r).toEqual({ imported: 2, skipped: 0, menuCreated: 0, errors: 0 })
    expect(insertSession).toHaveBeenCalledTimes(1)
    expect(insertSession).toHaveBeenCalledWith('m_bench', '2026-03-01', '00:00')
    expect(insertSets).toHaveBeenCalledTimes(1)
    expect(insertSets.mock.calls[0][1]).toEqual([
      { weight: 100, reps: 10 },
      { weight: 105, reps: 8 },
    ])
  })

  it('未登録のメニューは自動で新規登録する（種別はCSVのtype列）', async () => {
    const r = await importCsvText(strength('"懸垂",背中,自重運動,2026-03-01,,1,0,10,0,0'), [], [])
    expect(r.menuCreated).toBe(1)
    expect(insertExercise).toHaveBeenCalledWith(
      { name: '懸垂', category: '背中', type: '自重運動' },
      expect.anything(),
    )
  })

  it('session_idが空欄の行は、同日・同メニューで1セッションにまとめる（日付が違えば別）', async () => {
    await importCsvText(
      strength(
        '"ベンチプレス",胸,フリーウェイト,2026-03-20,,1,80,12,0,0',
        '"ベンチプレス",胸,フリーウェイト,2026-03-20,,2,85,10,0,0',
        '"ベンチプレス",胸,フリーウェイト,2026-03-21,,1,90,5,0,0',
      ),
      [bench],
      [],
    )
    expect(insertSession).toHaveBeenCalledTimes(2)
    expect(insertSets.mock.calls.map((c) => c[1].length)).toEqual([2, 1])
  })

  it('session_time列があればその時刻でセッションを作る', async () => {
    const csv =
      'menu_name,category,type,date,session_id,session_time,set_no,weight_kg,reps\n' +
      '"ベンチプレス",胸,フリーウェイト,2026-03-01,,07:45,1,80,10\n'
    await importCsvText(csv, [bench], [])
    expect(insertSession).toHaveBeenCalledWith('m_bench', '2026-03-01', '07:45')
  })

  it('CSVのsession_idが既存セッションのidと一致すれば、その行はすべてスキップ（再インポート）', async () => {
    const existing = {
      id: 'S-EXISTING',
      exerciseId: 'm_bench',
      date: '2026-03-01',
      time: '00:00',
      sets: [],
      cardio: null,
      createdAt: '',
    } as SessionData
    const r = await importCsvText(
      strength(
        '"ベンチプレス",胸,フリーウェイト,2026-03-01,S-EXISTING,1,100,10,0,0',
        '"ベンチプレス",胸,フリーウェイト,2026-03-01,S-EXISTING,2,105,8,0,0',
      ),
      [bench],
      [existing],
    )
    expect(r).toEqual({ imported: 0, skipped: 2, menuCreated: 0, errors: 0 })
    expect(insertSession).not.toHaveBeenCalled()
  })

  it('session_idが違っても、同じ日付・時刻・セット内容の既存セッションがあればスキップする', async () => {
    const existing: SessionData = {
      id: 'other-id',
      exerciseId: 'm_bench',
      date: '2026-03-01',
      time: '00:00',
      createdAt: '',
      sets: [
        { id: 'a', setNo: 1, weight: 100, reps: 10 },
        { id: 'b', setNo: 2, weight: 105, reps: 8 },
      ],
      cardio: null,
    }
    const csv = strength(
      '"ベンチプレス",胸,フリーウェイト,2026-03-01,new-id,1,100,10,0,0',
      '"ベンチプレス",胸,フリーウェイト,2026-03-01,new-id,2,105,8,0,0',
    )
    expect((await importCsvText(csv, [bench], [existing])).skipped).toBe(2)
    // 内容が違えば取り込む
    const other = strength('"ベンチプレス",胸,フリーウェイト,2026-03-01,new-id,1,100,12,0,0')
    expect((await importCsvText(other, [bench], [existing])).imported).toBe(1)
  })

  it('setsの登録に失敗したら、作ったセッションを取り消してエラーに数える', async () => {
    insertSets.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const r = await importCsvText(
      strength('"ベンチプレス",胸,フリーウェイト,2026-03-01,,1,80,10,0,0'),
      [bench],
      [],
    )
    expect(r).toEqual({ imported: 0, skipped: 0, menuCreated: 0, errors: 1 })
    expect(deleteSessionRow).toHaveBeenCalledTimes(1)
  })

  it('重量・回数が数値でない行は無視する', async () => {
    const r = await importCsvText(
      strength(
        '"ベンチプレス",胸,フリーウェイト,2026-03-01,,1,abc,10,0,0',
        '"ベンチプレス",胸,フリーウェイト,2026-03-01,,2,80,10,0,0',
      ),
      [bench],
      [],
    )
    expect(r.imported).toBe(1)
  })

  it('メニュー名のHTMLタグは文字列のまま登録される', async () => {
    await importCsvText(
      strength('"<img src=x onerror=alert(1)>",胸,フリーウェイト,2026-03-25,,1,60,10,0,0'),
      [],
      [],
    )
    expect(insertExercise.mock.calls[0][0].name).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('importCsvText: 有酸素', () => {
  const CARDIO_HEADER =
    'menu_name,category,date,session_id,time_min,dist_km,cal_kcal,hr_bpm,max_spd_kmh,avg_spd_kmh\n'

  it('1セッション=1行として登録し、空欄の速度はnull', async () => {
    const r = await importCsvText(
      CARDIO_HEADER + '"ランニング",有酸素運動,2026-03-15,c1,30,5.0,300,140,,\n',
      [],
      [],
    )
    expect(r).toEqual({ imported: 1, skipped: 0, menuCreated: 1, errors: 0 })
    expect(insertExercise).toHaveBeenCalledWith(
      { name: 'ランニング', category: '有酸素運動', type: '有酸素運動' },
      expect.anything(),
    )
    expect(upsertCardio.mock.calls[0][1]).toEqual({
      time: 30,
      dist: 5,
      cal: 300,
      hr: 140,
      maxSpd: null,
      avgSpd: null,
    })
  })

  it('同じ内容(日付・時刻・値)の有酸素セッションが既にあればスキップ', async () => {
    const run: Exercise = {
      ...bench,
      id: 'm_run',
      name: 'ランニング',
      category: '有酸素運動',
      type: '有酸素運動',
    }
    const existing: SessionData = {
      id: 'x',
      exerciseId: 'm_run',
      date: '2026-03-15',
      time: '00:00',
      createdAt: '',
      sets: [],
      cardio: { time: 30, dist: 5, cal: 300, hr: 140, maxSpd: null, avgSpd: null },
    }
    const r = await importCsvText(
      CARDIO_HEADER + '"ランニング",有酸素運動,2026-03-15,c1,30,5.0,300,140,,\n',
      [run],
      [existing],
    )
    expect(r.skipped).toBe(1)
    expect(insertSession).not.toHaveBeenCalled()
  })
})

describe('importCsvText: 形式エラー', () => {
  it('データ行が無ければ CsvFormatError', async () => {
    await expect(importCsvText('menu_name,category,date\n', [], [])).rejects.toBeInstanceOf(
      CsvFormatError,
    )
  })
})

describe('summaryMessage', () => {
  it('件数・新規メニュー・スキップ・エラーを改行区切りで返す', () => {
    expect(summaryMessage({ imported: 3, skipped: 2, menuCreated: 1, errors: 1 })).toBe(
      '3件をインポートしました\n未登録メニュー 1件を新規登録\n重複 2件をスキップ\n1件でエラーが発生しました（通信を確認してください）',
    )
    expect(summaryMessage({ imported: 0, skipped: 0, menuCreated: 0, errors: 0 })).toBe(
      '0件をインポートしました',
    )
  })
})
