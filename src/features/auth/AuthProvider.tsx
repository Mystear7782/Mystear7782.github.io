// 認証状態の管理。Supabase Auth のセッションを購読し、ログイン/ログアウト/ユーザー切り替え時に
// キャッシュ(別ユーザーのデータが残らないように)を整理する。
import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearCache } from '@/app/queryClient'
import { supabase } from '@/lib/supabase'

type AuthState = {
  /** 起動直後、保存済みセッションを確認している間は true */
  loading: boolean
  session: Session | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const LAST_USER_KEY = 'wt-last-user-id'

function readLastUser(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY)
  } catch {
    return null
  }
}
function writeLastUser(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_USER_KEY, id)
    else localStorage.removeItem(LAST_USER_KEY)
  } catch {
    /* localStorageが使えない環境では何もしない */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; session: Session | null }>({
    loading: true,
    session: null,
  })

  useEffect(() => {
    let active = true

    const apply = (session: Session | null) => {
      const userId = session?.user.id ?? null
      const last = readLastUser()
      // 前回と別のユーザーでログインした場合は、前のユーザーのキャッシュを破棄する
      if (userId && last && last !== userId) void clearCache()
      if (userId) writeLastUser(userId)
      if (active) setState({ loading: false, session })
    }

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch((e) => {
        console.error('failed to read the stored session', e)
        if (active) setState({ loading: false, session: null })
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // 次にログインしたとき、前の画面ではなくダッシュボードから始まるようにする
        window.location.hash = '#/'
        writeLastUser(null)
        void clearCache()
        if (active) setState({ loading: false, session: null })
        return
      }
      apply(session)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      ...state,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
    }),
    [state],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth は AuthProvider の内側で使ってください')
  return ctx
}
