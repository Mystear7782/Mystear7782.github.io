// PostgRESTのMax rows(Supabaseの既定1000)を超えても結果が黙って切れないよう、ページ分割で全件を取得する。
const PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

export async function fetchAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) return all
  }
}
