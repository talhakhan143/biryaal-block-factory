import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, TOKEN_KEY } from './api'

export interface AuthUser {
  id: number
  name: string
  email: string
  phone?: string
  roles: string[]
  permissions: string[]
  /** Dashboard par jo raqam is bande ne chhupa rakhi hai. Settings se badalti hai. */
  dashboard_hidden?: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  can: (permission: string) => boolean
  /** Taza user wapas deta hai, taake call karne wala usi par faisla kar sake. */
  refreshUser: () => Promise<AuthUser | null>
}

const AuthContext = createContext<AuthContextValue>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get('/me')
      .then((res) => setUser(res.data.data))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const res = await api.post('/login', { email, password, device_name: 'web' })
    localStorage.setItem(TOKEN_KEY, res.data.token)
    setUser(res.data.user)
  }

  const logout = async () => {
    try {
      await api.post('/logout')
    } catch {
      /* ignore */
    }
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }

  const can = (permission: string) => user?.permissions.includes(permission) ?? false

  // Settings me parda badalne ke baad naya haal yahin se aata hai, poora page reload kiye bina.
  const refreshUser = async () => {
    const res = await api.get('/me')
    const fresh = res.data.data as AuthUser
    setUser(fresh)
    return fresh
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
