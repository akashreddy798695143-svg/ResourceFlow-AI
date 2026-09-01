'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/use-router'
import { useAuth } from '@/lib/use-auth'
import { apiPost } from '@/lib/api-client'
import { toast } from 'sonner'
import { RadioTower, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ApiError } from '@/lib/api-client'

export function LoginView() {
  const { login } = useAuth()
  const { navigate } = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const fillDemo = (role: string) => {
    setEmail(`${role}@resourceflow.ai`)
    setPassword('demo1234')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const user = await login(email, password)
      toast.success(`Welcome, ${user.name}`)
      // Route by role
      if (user.role === 'CITIZEN') navigate('/citizen-dashboard')
      else if (user.role === 'RESPONDER') navigate('/incidents')
      else navigate('/command-center')
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 401) toast.error('Invalid credentials')
      else toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 mb-6 mx-auto"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <RadioTower className="h-4 w-4" />
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="text-sm font-bold tracking-wide">RESOURCEFLOW AI</span>
              <span className="text-[10px] text-muted-foreground font-mono">Disaster Coordination</span>
            </div>
          </button>

          <Card>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Access your disaster-response workspace</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email" type="email" required autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password" type="password" required autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>

              <div className="mt-6 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2 text-center">Quick demo login</p>
                <div className="grid grid-cols-2 gap-2">
                  {['admin', 'officer', 'responder', 'citizen'].map((r) => (
                    <Button
                      key={r}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fillDemo(r)}
                      className="text-xs font-mono capitalize"
                    >
                      {r}
                    </Button>
                  ))}
                </div>
              </div>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                No account?{' '}
                <button onClick={() => navigate('/register')} className="text-primary hover:underline">
                  Register
                </button>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      <footer className="border-t border-border bg-card/50 px-4 py-3 text-[11px] text-muted-foreground text-center">
        RESOURCEFLOW AI · Prototype decision-support score
      </footer>
    </div>
  )
}
