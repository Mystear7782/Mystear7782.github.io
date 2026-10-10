// 種目名（またはid）から種目を特定する。
// 名前は完全一致を優先し、なければ部分一致。0件または複数件のときはエラーにし、
// 候補の種目名をメッセージに含める（Claudeが言い直して再実行できるようにする）。
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../database.types.ts'
import { throwIfError, ToolError } from './result.ts'

export type Client = SupabaseClient<Database>
export type Exercise = Database['public']['Functions']['get_my_exercises']['Returns'][number]

const MAX_CANDIDATES = 40

/** 全角/半角・大小文字・前後の空白の違いを吸収する */
const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase()

const label = (e: Exercise) => `${e.name}（${e.category}${e.archived ? '・アーカイブ済み' : ''}）`

export async function listExercises(sb: Client): Promise<Exercise[]> {
  const { data, error } = await sb.rpc('get_my_exercises')
  throwIfError(error)
  return data ?? []
}

export async function resolveExercise(
  sb: Client,
  input: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Exercise> {
  const all = await listExercises(sb)
  // アーカイブ済みの種目は、書き込み系では対象外（読み取り系でのみ includeArchived を許可）
  const pool = opts.includeArchived ? all : all.filter((e) => !e.archived)

  const byId = pool.find((e) => e.id === input)
  if (byId) return byId

  const q = norm(input)
  if (!q) throw new ToolError('種目名が空です。種目名またはidを指定してください。')

  const exact = pool.filter((e) => norm(e.name) === q)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) throw ambiguous(input, exact)

  const partial = pool.filter((e) => norm(e.name).includes(q))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) throw ambiguous(input, partial)

  const shown = pool.slice(0, MAX_CANDIDATES).map(label).join('、')
  const more = pool.length > MAX_CANDIDATES ? `（ほか${pool.length - MAX_CANDIDATES}件）` : ''
  throw new ToolError(
    `種目「${input}」が見つかりません。候補の種目: ${shown || '（登録された種目がありません）'}${more}。` +
      'list_exercises で一覧を確認し、正確な名前かidを指定してください。',
  )
}

function ambiguous(input: string, hits: Exercise[]): ToolError {
  const list = hits.map((e) => `${label(e)} id=${e.id}`).join('、')
  return new ToolError(`種目「${input}」に該当する候補が複数あります: ${list}。名前をより具体的にするか、idを指定してください。`)
}
