import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, TOKEN_KEY } from './api'

export interface AuthUser {
  id: number
  name: string
  email: string
  phone?: string
  roles: string[]
  permissions: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  can: (permission: string) => boolean
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
