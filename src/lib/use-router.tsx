'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

// Tiny hash-based view router so we stay on the single `/` route.
// Format: #/command-center or #/incidents/{id}

interface RouterValue {
  path: string
  navigate: (path: string) => void
  params: Record<string, string>
}

const RouterContext = createContext<RouterValue>(null as any)

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>('')

  useEffect(() => {
    const update = () => setPath(window.location.hash.slice(1) || '/')
    update()
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  const navigate = useCallback((p: string) => {
    if (!p.startsWith('/')) p = '/' + p
    window.location.hash = p
    setPath(p)
  }, [])

  const params = parseParams(path)
  return (
    <RouterContext.Provider value={{ path, navigate, params }}>
      {children}
    </RouterContext.Provider>
  )
}

function parseParams(path: string): Record<string, string> {
  const parts = path.split('/').filter(Boolean)
  const out: Record<string, string> = {}
  if (parts[0] === 'incidents' && parts[1]) out.id = parts[1]
  if (parts[0] === 'resources' && parts[1]) out.id = parts[1]
  if (parts[0] === 'approvals' && parts[1]) out.id = parts[1]
  if (parts[0] === 'simulation' && parts[1] === 'runs' && parts[2]) out.runId = parts[2]
  if (parts[0] === 'reports' && parts[1]) out.id = parts[1]
  if (parts[0] === 'chat' && parts[1]) out.id = parts[1]
  return out
}

export function useRouter() {
  return useContext(RouterContext)
}
