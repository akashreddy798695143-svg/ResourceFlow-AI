'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/use-router'
import { useAuth } from '@/lib/use-auth'
import { apiPost } from '@/lib/api-client'
import { toast } from 'sonner'
import { ArrowLeft, KeyRound, Mail, RadioTower, Loader2 } from 'lucide-react'
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
  const [authStage, setAuthStage] = useState<'login' | 'forgot' | 'reset'>('login')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')

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

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await apiPost<{ message: string }>('/api/auth/forgot-password', { email })
      toast.success(res.message)
      setAuthStage('reset')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) return toast.error('Password must be at least 6 characters')
    setLoading(true)
    try {
      const res = await apiPost<{ message: string }>('/api/auth/reset-password', {
        email,
        code: resetCode,
        password: newPassword,
      })
      toast.success(res.message)
      setPassword('')
      setNewPassword('')
      setResetCode('')
      setAuthStage('login')
    } catch (e: any) {
      toast.error(e.message)
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
              <CardTitle className="flex items-center gap-2">
                {authStage === 'login' ? 'Sign in' : authStage === 'forgot' ? <><Mail className="h-5 w-5 text-primary" /> Forgot password</> : <><KeyRound className="h-5 w-5 text-primary" /> Reset password</>}
              </CardTitle>
              <CardDescription>
                {authStage === 'login' && 'Access your disaster-response workspace'}
                {authStage === 'forgot' && 'We will email a one-time reset code if the account exists.'}
                {authStage === 'reset' && <>Enter the 6-digit code sent to <span className="font-mono text-foreground">{email}</span>.</>}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {authStage === 'login' && <form onSubmit={submit} className="space-y-4">
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
                <button type="button" onClick={() => setAuthStage('forgot')} className="w-full text-center text-xs text-primary hover:underline">
                  Forgot password?
                </button>
              </form>}

              {authStage === 'forgot' && <form onSubmit={requestReset} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input id="reset-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {loading ? 'Sending code…' : 'Send reset code'}
                </Button>
                <button type="button" onClick={() => setAuthStage('login')} className="flex items-center justify-center gap-1 w-full text-xs text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-3 w-3" /> Back to sign in
                </button>
              </form>}

              {authStage === 'reset' && <form onSubmit={resetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-code">6-digit reset code</Label>
                  <Input id="reset-code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="text-center text-2xl tracking-[0.5em] font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input id="new-password" type="password" required minLength={6} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="min 6 characters" />
                </div>
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? 'Resetting password…' : 'Reset password'}
                </Button>
                <button type="button" onClick={() => setAuthStage('forgot')} className="flex items-center justify-center gap-1 w-full text-xs text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-3 w-3" /> Request a new code
                </button>
              </form>}

              {authStage === 'login' && <div className="mt-6 pt-4 border-t border-border">
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
              </div>}

              {authStage === 'login' && <p className="mt-6 text-center text-xs text-muted-foreground">
                No account?{' '}
                <button onClick={() => navigate('/register')} className="text-primary hover:underline">
                  Register
                </button>
              </p>}
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
