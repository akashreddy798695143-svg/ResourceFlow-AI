'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { apiGet, apiPost, ApiError } from '@/lib/api-client'
import type { User } from '@/lib/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<User>
  register: (name: string, email: string, password: string, role: string) => Promise<User>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>(null as any)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const u = await apiGet<User>('/api/auth/me')
      setUser(u)
    } catch (err) {
      // 401 means "not logged in" — this is normal, not an error
      if (err instanceof ApiError && err.status === 401) {
        setUser(null)
      } else {
        // Other errors (500, network, etc.) are real problems
        const message = err instanceof Error ? err.message : String(err)
        console.error('Auth error:', message)
        setError(message)
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const u = await apiPost<User>('/api/auth/login', { email, password })
    setUser(u)
    return u
  }, [])

  const register = useCallback(async (name: string, email: string, password: string, role: string) => {
    const u = await apiPost<User>('/api/auth/register', { name, email, password, role })
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await apiPost('/api/auth/logout')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
