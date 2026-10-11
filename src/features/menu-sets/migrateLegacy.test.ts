import { migrateLegacyMenuSets, readLegacyMenuSets } from './migrateLegacy'

const saveMenuSet = vi.hoisted(() => vi.fn())
vi.mock('@/api/menuSets', () => ({ saveMenuSet }))

/** localStorage の代わりに使う最小のStorage */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

const legacyJson = (sets: unknown) => JSON.stringify(sets)

beforeEach(() => {
  vi.resetAllMocks()
  saveMenuSet.mockResolvedValue('new-id')
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('readLegacyMenuSets', () => {
  it('無い・壊れている・空・配列でないときは null', () => {
    expect(readLegacyMenuSets(memoryStorage())).toBeNull()
    expect(readLegacyMenuSets(memoryStorage({ gl_menusets: 'not json' }))).toBeNull()
    expect(readLegacyMenuSets(memoryStorage({ gl_menusets: '[]' }))).toBeNull()
    expect(readLegacyMenuSets(memoryStorage({ gl_menusets: '{"a":1}' }))).toBeNull()
  })
  it('形式の合わない要素は読み飛ばす', () => {
    const s = memoryStorage({
      gl_menusets: legacyJson([
        { name: 'ok', menuIds: ['a'] },
        { name: 1 },
        null,
        { name: 'x', menuIds: [1] },
      ]),
    })
    expect(readLegacyMenuSets(s)).toEqual([{ name: 'ok', menuIds: ['a'] }])
  })
})

describe('migrateLegacyMenuSets', () => {
  it('セットごとに順序を保ってDBへ保存し、旧キーを「移行済み」に名前変更する', async () => {
    const storage = memoryStorage({
      gl_menusets: legacyJson([{ id: 'mset_1', name: '旧セット', menuIds: ['b', 'a'] }]),
    })
    const r = await migrateLegacyMenuSets(new Set(['a', 'b']), storage)
    expect(r).toEqual({ migrated: 1, skippedItems: 0, skippedSets: 0, failedSets: 0 })
    expect(saveMenuSet).toHaveBeenCalledWith({ name: '旧セット', exerciseIds: ['b', 'a'] })
    expect(storage.getItem('gl_menusets')).toBeNull()
    expect(storage.getItem('gl_menusets_migrated')).toBe(
      legacyJson([{ id: 'mset_1', name: '旧セット', menuIds: ['b', 'a'] }]),
    )
  })

  it('存在しないメニューの項目は飛ばし、1つも残らないセットは移行しない', async () => {
    const storage = memoryStorage({
      gl_menusets: legacyJson([
        { name: 'A', menuIds: ['a', 'gone', 'a'] }, // 重複と存在しないidを除く
        { name: 'B', menuIds: ['gone'] },
      ]),
    })
    const r = await migrateLegacyMenuSets(new Set(['a']), storage)
    expect(r).toEqual({ migrated: 1, skippedItems: 3, skippedSets: 1, failedSets: 0 })
    expect(saveMenuSet).toHaveBeenCalledTimes(1)
    expect(saveMenuSet).toHaveBeenCalledWith({ name: 'A', exerciseIds: ['a'] })
  })

  it('保存に失敗したセットがあれば、旧キーは残す（移行済みの印を付けない）', async () => {
    saveMenuSet.mockRejectedValueOnce(new Error('boom'))
    const storage = memoryStorage({ gl_menusets: legacyJson([{ name: 'A', menuIds: ['a'] }]) })
    const r = await migrateLegacyMenuSets(new Set(['a']), storage)
    expect(r?.failedSets).toBe(1)
    expect(storage.getItem('gl_menusets')).not.toBeNull()
    expect(storage.getItem('gl_menusets_migrated')).toBeNull()
  })

  it('旧データが無ければ何もしない(null)', async () => {
    expect(await migrateLegacyMenuSets(new Set(['a']), memoryStorage())).toBeNull()
    expect(saveMenuSet).not.toHaveBeenCalled()
  })

  it('移行済み(gl_menusets_migratedのみ)なら再実行しても何もしない', async () => {
    const storage = memoryStorage({
      gl_menusets_migrated: legacyJson([{ name: 'A', menuIds: ['a'] }]),
    })
    expect(await migrateLegacyMenuSets(new Set(['a']), storage)).toBeNull()
  })
})
